import { strict as assert } from 'node:assert';
import { beforeEach, test } from 'node:test';
import type * as vscode from 'vscode';
import { activate, commandId } from '../../src/extension';
import { commands, env, reset, settings, Uri, window, workspace } from './mocks/vscode';

beforeEach(reset);

function setWorkspace(payload: unknown = { hostPath: '/srv/project' }, parent = 'ssh-remote+host') {
  env.remoteName = 'dev-container';
  const authority = `dev-container+${Buffer.from(JSON.stringify(payload)).toString('hex')}${parent ? `@${parent}` : ''}`;
  workspace.workspaceFolders = [{ uri: new Uri('vscode-remote', authority, '/workspaces/project') }];
}

function start() {
  const subscriptions: vscode.Disposable[] = [];
  activate({ subscriptions } as vscode.ExtensionContext);
  return () => subscriptions.forEach(subscription => subscription.dispose());
}

void test('supported workspace exposes the command and uses current connection and SSH settings', async () => {
  setWorkspace();
  const dispose = start();
  try {
    assert.equal(window.createTerminal.mock.callCount(), 0);
    settings.set('remote.SSH.path', '/custom/ssh');
    settings.set('remote.SSH.configFile', '/custom/config');
    setWorkspace({ hostPath: '/another/project' }, 'ssh-remote+new-host');
    await commands.executeCommand(commandId);
    const options = window.createTerminal.mock.calls[0].arguments[0] as vscode.TerminalOptions;
    assert.equal(options.shellPath, '/custom/ssh');
    assert.match((options.shellArgs as string[]).join(' '), /new-host/);
    assert.match((options.shellArgs as string[]).join(' '), /another\/project/);
    assert.equal(window.showErrorMessage.mock.callCount(), 0);
  } finally { dispose(); }
});

void test('command is not registered in local or other non-container workspaces', async () => {
  for (const name of [undefined, 'ssh-remote', 'codespaces', 'wsl']) {
    env.remoteName = name;
    const dispose = start();
    await assert.rejects(commands.executeCommand(commandId), /Unknown command/);
    dispose();
  }
  assert.equal(window.createTerminal.mock.callCount(), 0);
});

void test('untrusted and ambiguous container workspaces open no terminal', async () => {
  setWorkspace();
  workspace.isTrusted = false;
  let dispose = start();
  await commands.executeCommand(commandId);
  dispose();
  workspace.isTrusted = true;
  workspace.workspaceFolders.push({ uri: new Uri('vscode-remote', 'dev-container+1234', '/other') });
  dispose = start();
  await commands.executeCommand(commandId);
  dispose();
  assert.equal(window.createTerminal.mock.callCount(), 0);
});

void test('multi-root folders on one host and a remote workspace file are supported', async () => {
  setWorkspace();
  workspace.workspaceFolders.push({ uri: new Uri('vscode-remote', workspace.workspaceFolders[0].uri.authority, '/other') });
  let dispose = start();
  await commands.executeCommand(commandId);
  assert.equal(window.createTerminal.mock.callCount(), 1);
  dispose();
  workspace.workspaceFile = workspace.workspaceFolders[0].uri;
  workspace.workspaceFolders = [];
  dispose = start();
  await commands.executeCommand(commandId);
  assert.equal(window.createTerminal.mock.callCount(), 2);
  dispose();
});

void test('Docker lookup happens only on invocation and reports failures', async () => {
  setWorkspace({ settings: { context: 'remote' } }, '');
  settings.set('dev.containers.dockerPath', '/missing-docker-for-extension-test');
  const dispose = start();
  try {
    assert.equal(window.showErrorMessage.mock.callCount(), 0);
    await commands.executeCommand(commandId);
    assert.match(window.showErrorMessage.mock.calls[0].arguments[0], /Docker executable not found/);
    assert.equal(window.createTerminal.mock.callCount(), 0);
  } finally { dispose(); }
});

void test('command reads workspace changes on demand and is removed on disposal', async () => {
  setWorkspace();
  const dispose = start();
  workspace.workspaceFolders = [];
  await commands.executeCommand(commandId);
  assert.equal(window.createTerminal.mock.callCount(), 0);
  setWorkspace();
  await commands.executeCommand(commandId);
  assert.equal(window.createTerminal.mock.callCount(), 1);
  dispose();
  await assert.rejects(commands.executeCommand(commandId), /Unknown command/);
});
