import * as vscode from 'vscode';
import { resolveAuthority, SshConnection } from './connection';
import { inspectDockerContext } from './docker';
import { expandHome, openHostTerminal } from './terminal';

export const commandId = 'devcontainer-ssh-terminal.openHostTerminal';

function localSetting<T>(section: string, key: string): T | undefined {
  // Local user settings only: remote/workspace settings describe another machine.
  return vscode.workspace.getConfiguration(section).inspect<T>(key)?.globalValue;
}

async function detectConnection(): Promise<SshConnection | undefined> {
  if (!vscode.workspace.isTrusted) {
    return undefined;
  }
  const uris = [
    ...(vscode.workspace.workspaceFolders?.map(folder => folder.uri) || []),
    vscode.workspace.workspaceFile,
  ].filter((uri): uri is vscode.Uri => uri?.scheme === 'vscode-remote');
  const authorities = [...new Set(uris.map(uri => uri.authority))];
  // A window should have one remote authority; an ambiguous one must not select a host.
  if (authorities.length !== 1) {
    return undefined;
  }
  const executable = localSetting<string>('dev.containers', 'dockerPath') ||
    localSetting<string>('remote.containers', 'dockerPath') || 'docker';
  const args = localSetting<string[]>('dev.containers', 'dockerArgs') || [];
  return resolveAuthority(authorities[0], name => inspectDockerContext(name, expandHome(executable), args));
}

export function activate(context: vscode.ExtensionContext): void {
  if (!['dev-container', 'attached-container'].includes(vscode.env.remoteName || '')) {
    return;
  }
  let disposed = false;
  context.subscriptions.push(
    new vscode.Disposable(() => {
      disposed = true;
    }),
    vscode.commands.registerCommand(commandId, async () => {
      try {
        const target = await detectConnection();
        if (disposed) {
          return;
        }
        if (!target) {
          void vscode.window.showInformationMessage('Open a folder in an SSH-backed devcontainer to use this command.');
          return;
        }
        openHostTerminal(target, {
          executable: localSetting<string>('remote.SSH', 'path'),
          configFile: localSetting<string>('remote.SSH', 'configFile'),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Could not open SSH host terminal: ${message}`);
      }
    }),
  );
}
