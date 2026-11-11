import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { inspectDockerContext } from '../../src/docker';

void test('Docker inspection passes a context as a single argument and reads its endpoint', async () => {
  const name = "context with spaces ' and $()";
  const script = `if (process.argv.slice(1).join('|') !== ${JSON.stringify(`context|inspect|${name}`)}) process.exit(2); process.stdout.write(JSON.stringify([{Endpoints:{docker:{Host:'ssh://dev@host:2222'}}}]));`;
  assert.equal(await inspectDockerContext(name, process.execPath, ['-e', script, '--']), 'ssh://dev@host:2222');
});

void test('Docker errors distinguish missing executable, invalid responses and failed commands', async () => {
  await assert.rejects(inspectDockerContext('test', '/nonexistent-devcontainer-ssh-terminal/docker'), /executable not found/);
  await assert.rejects(inspectDockerContext('test', process.execPath, ['-e', 'process.exit(2)', '--']), /inspection failed/);
  for (const output of ['not json', '[]', '[{}]', '[{"Endpoints":{"docker":{"Host":42}}}]']) {
    await assert.rejects(inspectDockerContext('test', process.execPath, ['-e', `process.stdout.write(${JSON.stringify(output)})`, '--']), /invalid context/);
  }
});

void test('a stalled Docker inspection is terminated with an actionable error', { timeout: 10000 }, async () => {
  await assert.rejects(inspectDockerContext('test', process.execPath, ['-e', 'setInterval(() => {}, 1000)', '--']), /timed out/);
});
