import { runTests } from '@vscode/test-electron';
import * as path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as meta from '../../package.json';

export async function run(): Promise<void> {
  const { runTest } = await import('./extension.test');
  await runTest();
  // The embedded node:test runner reports failure via exitCode at beforeExit.
  process.emit('beforeExit', 0);
  await new Promise(resolve => setImmediate(resolve));
  if (process.exitCode) {
    throw new Error('VS Code integration tests failed');
  }
}

async function main() {
  const project = path.resolve(__dirname, '../../..');
  const userData = await mkdtemp(path.join(tmpdir(), 'host-terminal-vscode-'));
  try {
    await runTests({
      extensionDevelopmentPath: project,
      extensionTestsPath: __filename,
      version: process.env.VSCODE_VERSION || meta.engines.vscode.slice(1),
      extensionTestsEnv: { HOST_TERMINAL_TEST_NODE: process.execPath },
      launchArgs: [
        path.join(project, 'test/workspace'),
        '--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
        '--user-data-dir', userData,
      ],
    });
  } finally {
    await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
