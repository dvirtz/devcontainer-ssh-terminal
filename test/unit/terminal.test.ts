import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { homedir, tmpdir } from 'node:os';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { expandHome, openHostTerminal, terminalOptions } from '../../src/terminal';
import { window } from './mocks/vscode';
// cspell:ignore équipe

void test('terminal launches SSH locally with arguments, including paths containing spaces', () => {
  const options = terminalOptions({ host: 'BuildHost', user: 'dev', port: 2222 }, {
    executable: '/tools with spaces/ssh', configFile: '~/config with spaces',
  });
  assert.equal(options.name, 'SSH Host: BuildHost');
  assert.equal(options.shellPath, '/tools with spaces/ssh');
  assert.deepEqual(options.shellArgs, ['-t', '-F', path.join(homedir(), 'config with spaces'), '-l', 'dev', '-p', '2222', '--', 'BuildHost']);
  assert.equal(typeof options.cwd, 'object');
  if (typeof options.cwd === 'object') {
    assert.equal(options.cwd.scheme, 'file');
    assert.equal(options.cwd.fsPath, homedir());
  }
  assert.equal(options.location, 1);
  assert.equal(options.isTransient, true);
  assert.equal(expandHome('~'), homedir());
});

void test('each invocation creates and focuses its own terminal', () => {
  window.createTerminal.mock.resetCalls();
  const first = openHostTerminal({ host: 'host' });
  const second = openHostTerminal({ host: 'host' });
  assert.notEqual(first, second);
  assert.equal(window.createTerminal.mock.callCount(), 2);
  for (const call of window.createTerminal.mock.calls) {
    assert.equal(call.result!.show.mock.callCount(), 1);
  }
  assert.deepEqual(terminalOptions({ host: 'host' }).shellArgs, ['-t', '--', 'host']);
});

void test('remote directory command handles quotes and shell syntax, and falls back to home', {
  skip: process.platform === 'win32',
}, () => {
  const root = mkdtempSync(path.join(tmpdir(), 'host-terminal-'));
  try {
    const project = path.join(root, "équipe's $(false) project");
    mkdirSync(project);
    const shell = path.join(root, 'login-shell');
    writeFileSync(shell, '#!/bin/sh\npwd\n', { mode: 0o755 });
    for (const [hostPath, expected] of [[project, project], [path.join(root, 'missing'), root]]) {
      const args = terminalOptions({ host: 'host', hostPath }).shellArgs as string[];
      const result = spawnSync('/bin/sh', ['-c', args[args.length - 1]], {
        env: { ...process.env, HOME: root, SHELL: shell }, encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), expected);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
