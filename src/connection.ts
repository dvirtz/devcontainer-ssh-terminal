export interface SshConnection {
  host: string;
  user?: string;
  port?: number;
  hostPath?: string;
}

export type InspectContext = (name: string) => Promise<string>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validName(value: unknown): value is string {
  return typeof value === 'string' && /^[\p{L}\p{N}_.:+%-]+$/u.test(value) && !value.startsWith('-');
}

function connection(host: unknown, user?: unknown, port?: unknown): SshConnection | undefined {
  if (!validName(host) || (user !== undefined && (!validName(user) || user.includes(':')))) {
    return undefined;
  }
  if (port !== undefined && (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535)) {
    return undefined;
  }
  return { host, ...(user === undefined ? {} : { user }), ...(port === undefined ? {} : { port }) };
}

function decodeHex(value: string): string | undefined {
  if (!/^(?:[a-f\d]{2})+$/i.test(value)) {
    return undefined;
  }
  const bytes = Buffer.from(value, 'hex');
  const decoded = bytes.toString('utf8');
  return Buffer.from(decoded, 'utf8').equals(bytes) ? decoded : undefined;
}

export function parseSshEndpoint(value: string): SshConnection | undefined {
  // Parse explicitly: WHATWG URL handling can normalize aliases or reject IPv6 zone IDs.
  const match = /^ssh:\/\/(?:(?<user>[^@/?#]+)@)?(?<host>\[[^\]]+\]|[^:/?#]+)(?::(?<port>\d+))?(?:\/[^?#]*)?$/.exec(value);
  if (!match?.groups) {
    return undefined;
  }
  try {
    const { host, user, port } = match.groups;
    return connection(
      decodeURIComponent(host.replace(/^\[|\]$/g, '')),
      user === undefined ? undefined : decodeURIComponent(user),
      port === undefined ? undefined : Number(port),
    );
  } catch {
    return undefined;
  }
}

function parseSshAuthority(value: string): SshConnection | undefined {
  if (!value.startsWith('ssh-remote+')) {
    return undefined;
  }
  const target = value.slice('ssh-remote+'.length);
  const decoded = decodeHex(target);
  if (decoded?.startsWith('{')) {
    try {
      const data: unknown = JSON.parse(decoded);
      return record(data) ? connection(data.hostName, data.user, data.port) : undefined;
    } catch {
      return undefined;
    }
  }
  return parseSshEndpoint(`ssh://${target}`);
}

/** Decode the authority format used by Dev Containers (fixtures cover version 0.472.0). */
export async function resolveAuthority(authority: string, inspectContext: InspectContext): Promise<SshConnection | undefined> {
  const match = /^(dev-container|attached-container)\+([^@]+)(?:@(.+))?$/.exec(authority);
  if (!match) {
    return undefined;
  }
  const [, kind, encoded, parent] = match;
  const decoded = decodeHex(encoded);
  if (decoded === undefined) {
    return undefined;
  }
  if (!decoded.startsWith('{') && !(kind === 'dev-container' ? decoded.startsWith('/') : /^[a-f\d]{12,64}$/i.test(decoded))) {
    return undefined;
  }
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = decoded.startsWith('{') ? JSON.parse(decoded) : undefined;
    if (decoded.startsWith('{') && !record(parsed)) {
      return undefined;
    }
    data = record(parsed) ? parsed : kind === 'dev-container' ? { hostPath: decoded } : {};
  } catch {
    return undefined;
  }
  if (data.settings !== undefined && !record(data.settings)) {
    return undefined;
  }
  const settings = data.settings as Record<string, unknown> | undefined;
  if (parent) {
    // Contexts on the parent and localDocker introduce another host hop; do not guess.
    if (data.localDocker || settings?.context !== undefined ||
        (settings?.host !== undefined && (typeof settings.host !== 'string' || !settings.host.startsWith('unix://')))) {
      return undefined;
    }
    const target = parseSshAuthority(parent);
    if (!target) {
      return undefined;
    }
    if (kind === 'dev-container' && typeof data.hostPath === 'string' &&
        data.hostPath.startsWith('/') && !/[\x00-\x1f\x7f]/.test(data.hostPath)) {
      target.hostPath = data.hostPath;
    }
    return target;
  }
  if (!settings || (settings.host !== undefined && settings.context !== undefined)) {
    return undefined;
  }
  if (typeof settings.host === 'string') {
    return parseSshEndpoint(settings.host);
  }
  if (typeof settings.context === 'string' && settings.context.length > 0 &&
      !settings.context.startsWith('-') && !/[\x00-\x1f\x7f]/.test(settings.context)) {
    return parseSshEndpoint(await inspectContext(settings.context));
  }
  return undefined;
}
