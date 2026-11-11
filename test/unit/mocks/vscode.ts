import { mock } from 'node:test';
import * as path from 'node:path';

export class Disposable {
  constructor(private readonly callback: () => void) {}
  dispose() { this.callback(); }
}

export class Uri {
  constructor(public scheme: string, public authority: string, public path: string) {}
  static file(value: string) { return new Uri('file', '', path.resolve(value)); }
  get fsPath() { return this.path; }
}

const handlers = new Map<string, (...args: unknown[]) => unknown>();
export const settings = new Map<string, unknown>();

export const commands = {
  registerCommand: (id: string, callback: (...args: unknown[]) => unknown) => {
    handlers.set(id, callback);
    return new Disposable(() => handlers.delete(id));
  },
  executeCommand: mock.fn(async (id: string, ...args: unknown[]) => {
    const callback = handlers.get(id);
    if (!callback) { throw new Error(`Unknown command: ${id}`); }
    return callback(...args);
  }),
};

export const env: { remoteName?: string } = {};

export const workspace = {
  isTrusted: true,
  workspaceFolders: [] as { uri: Uri }[],
  workspaceFile: undefined as Uri | undefined,
  getConfiguration: (section: string) => ({
    inspect: (key: string) => ({ globalValue: settings.get(`${section}.${key}`) }),
  }),
};

export const TerminalLocation = { Panel: 1 };
export const window = {
  createTerminal: mock.fn((_options: unknown) => ({ show: mock.fn(), dispose: mock.fn() })),
  showInformationMessage: mock.fn(async (_message: string) => undefined),
  showErrorMessage: mock.fn(async (_message: string) => undefined),
};

export function reset() {
  handlers.clear();
  settings.clear();
  env.remoteName = undefined;
  workspace.workspaceFolders = [];
  workspace.workspaceFile = undefined;
  workspace.isTrusted = true;
  commands.executeCommand.mock.resetCalls();
  Object.values(window).forEach(fn => fn.mock.resetCalls());
}
