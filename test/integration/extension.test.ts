import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as vscode from 'vscode';
import { homedir, tmpdir } from 'node:os';
import * as path from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { commandId } from '../../src/extension';
import { terminalOptions } from '../../src/terminal';

export async function runTest() {
  const failures: unknown[] = [];
  let completed = 0;
  const check = async (name: string, callback: () => Promise<void>) => {
    await test(name, { timeout: 20000 }, async () => {
      try {
        await callback();
        completed++;
      } catch (error) {
        failures.push(error);
        throw error;
      }
    });
  };
  await check('extension is installed and declares a command limited to container workspaces', async () => {
    const extension = vscode.extensions.getExtension('dvirtz.devcontainer-ssh-terminal');
    assert.ok(extension);
    await extension.activate();
    assert.ok(extension.isActive);
    assert.deepEqual(extension.packageJSON.extensionKind, ['ui']);
    const containerCondition = 'remoteName =~ /^(dev-container|attached-container)$/';
    assert.equal(extension.packageJSON.contributes.commands[0].enablement, containerCondition);
    assert.equal(extension.packageJSON.contributes.menus.commandPalette[0].when, containerCondition);
  });

  await check('command handler is not registered in a local workspace', async () => {
    const before = vscode.window.terminals.length;
    await assert.rejects(async () => vscode.commands.executeCommand(commandId), /not found/i);
    assert.equal(vscode.window.terminals.length, before);
  });

  await check('a terminal runs a local executable, focuses and closes without modifying another terminal', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'host-terminal-integration-'));
    const resultPath = path.join(root, 'result.json');
    const scriptPath = path.join(root, 'ssh-client.cjs');
    // Use an executable shim to exercise real terminal creation without network credentials.
    await writeFile(scriptPath, `require('fs').writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)})); setInterval(() => {}, 1000);`);
    const other = vscode.window.createTerminal({ name: 'Unrelated terminal', cwd: vscode.Uri.file(homedir()) });
    const nodePath = process.env.HOST_TERMINAL_TEST_NODE || process.execPath;
    const closed = new Promise<vscode.Terminal>(resolve => {
      const listener = vscode.window.onDidCloseTerminal(terminal => {
        if (terminal.name === 'SSH Host: test-host') {
          listener.dispose();
          resolve(terminal);
        }
      });
    });
    const options = terminalOptions({ host: 'test-host', user: 'dev', port: 2222 });
    const terminal = vscode.window.createTerminal({
      ...options,
      shellPath: nodePath,
      shellArgs: [scriptPath, ...options.shellArgs as string[]],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    });
    terminal.show();
    try {
      const deadline = Date.now() + 15000;
      let output: string | undefined;
      while (Date.now() < deadline) {
        try { output = await readFile(resultPath, 'utf8'); break; } catch {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      assert.ok(output, 'Local SSH executable shim did not run');
      const result = JSON.parse(output);
      assert.equal(result.cwd, homedir());
      assert.deepEqual(result.args, ['-t', '-l', 'dev', '-p', '2222', '--', 'test-host']);
      assert.equal(vscode.window.activeTerminal, terminal);
      assert.ok(vscode.window.terminals.includes(other));
      terminal.dispose();
      await Promise.race([closed, new Promise((_, reject) => {
        const timeout = setTimeout(() => reject(new Error('Terminal did not close')), 10000);
        timeout.unref();
      })]);
      assert.ok(vscode.window.terminals.includes(other));
    } finally {
      terminal.dispose();
      other.dispose();
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });
  // A failed node:test callback does not reject its Promise. Report failures explicitly
  // to VS Code's runner, including timeouts and cancellation on older embedded Node versions.
  if (failures.length) { throw new AggregateError(failures, 'Integration checks failed'); }
  assert.equal(completed, 3, 'Every integration check must complete');
  console.log(`Completed ${completed} integration checks successfully.`);
}
