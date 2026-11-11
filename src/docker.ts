import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
export const contextTimeout = 5000;

export async function inspectDockerContext(name: string, executable = 'docker', args: string[] = []): Promise<string> {
  let stdout: string;
  try {
    ({ stdout } = await execute(executable, [...args, 'context', 'inspect', name], {
      timeout: contextTimeout,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8',
      windowsHide: true,
    }));
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { killed?: boolean };
    const reason = failure.code === 'ENOENT' ? 'Docker executable not found' :
      failure.killed ? 'Docker context inspection timed out' : 'Docker context inspection failed';
    throw new Error(`${reason}. Check your local Dev Containers Docker settings.`, { cause: error });
  }
  try {
    const contexts: unknown = JSON.parse(stdout);
    if (Array.isArray(contexts) && contexts.length === 1) {
      const host: unknown = contexts[0]?.Endpoints?.docker?.Host;
      if (typeof host === 'string' && host.length > 0) {
        return host;
      }
    }
  } catch {
    // Give the same actionable error for malformed JSON and missing endpoint data.
  }
  throw new Error('Docker returned an invalid context. Check the recorded Docker context on your local computer.');
}
