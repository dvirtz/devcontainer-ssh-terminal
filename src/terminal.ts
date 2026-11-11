import * as vscode from 'vscode';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { SshConnection } from './connection';

export interface SshSettings {
  executable?: string;
  configFile?: string;
}

export function expandHome(value: string): string {
  return value === '~' ? homedir() : /^~[/\\]/.test(value) ? path.join(homedir(), value.slice(2)) : value;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function terminalOptions(target: SshConnection, settings: SshSettings = {}): vscode.TerminalOptions {
  const args = ['-t'];
  if (settings.configFile) {
    args.push('-F', expandHome(settings.configFile));
  }
  if (target.user) {
    args.push('-l', target.user);
  }
  if (target.port) {
    args.push('-p', String(target.port));
  }
  args.push('--', target.host);
  if (target.hostPath) {
    // A single remote command, quoted for the POSIX login shell invoked by sshd.
    args.push(`cd ${shellQuote(target.hostPath)} 2>/dev/null || cd; exec "\${SHELL:-/bin/sh}" -l`);
  }
  return {
    name: `SSH Host: ${target.host}`,
    shellPath: expandHome(settings.executable || 'ssh'),
    shellArgs: args,
    // A file URI selects the local terminal backend even in a remote window.
    cwd: vscode.Uri.file(homedir()),
    location: vscode.TerminalLocation.Panel,
    isTransient: true,
  };
}

export function openHostTerminal(target: SshConnection, settings?: SshSettings): vscode.Terminal {
  const terminal = vscode.window.createTerminal(terminalOptions(target, settings));
  terminal.show();
  return terminal;
}
