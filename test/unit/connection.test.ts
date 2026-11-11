import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { parseSshEndpoint, resolveAuthority, SshConnection } from '../../src/connection';
// cspell:ignore équipe anext

export function authority(payload: unknown, parent?: string, kind = 'dev-container'): string {
  const encoded = Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)).toString('hex');
  return `${kind}+${encoded}${parent ? `@${parent}` : ''}`;
}

const noContext = async () => { throw new Error('Docker should not run'); };
const fixtures: { name: string; kind: string; payload: unknown; parent?: string; expected: SshConnection; contextEndpoint?: string }[] =
  JSON.parse(readFileSync(path.join(__dirname, '../fixtures/authorities.json'), 'utf8'));

for (const fixture of fixtures) {
  void test(fixture.name, async () => {
    const inspect = fixture.contextEndpoint ? async (name: string) => {
      assert.equal(name, 'remote-build');
      return fixture.contextEndpoint!;
    } : noContext;
    assert.deepEqual(await resolveAuthority(authority(fixture.payload, fixture.parent, fixture.kind), inspect), fixture.expected);
  });
}

void test('encoded SSH parent preserves alias case, user, port and Unicode paths', async () => {
  const parent = `ssh-remote+${Buffer.from(JSON.stringify({ hostName: 'Build+Server', user: 'dev', port: 2200 })).toString('hex')}`;
  assert.deepEqual(await resolveAuthority(authority({ hostPath: "/srv/équipe's project" }, parent), noContext), {
    host: 'Build+Server', user: 'dev', port: 2200, hostPath: "/srv/équipe's project",
  });
});

void test('hex-looking SSH aliases remain aliases when they are not encoded objects', async () => {
  assert.deepEqual(await resolveAuthority(authority({}, 'ssh-remote+deadbeef'), noContext), { host: 'deadbeef' });
});

void test('SSH URLs support IPv6, zone IDs, usernames and socket paths', () => {
  assert.deepEqual(parseSshEndpoint('ssh://dev@[2001:db8::1]:2222/var/run/docker.sock'), { host: '2001:db8::1', user: 'dev', port: 2222 });
  assert.deepEqual(parseSshEndpoint('ssh://[fe80::1%25eth0]'), { host: 'fe80::1%eth0' });
  assert.deepEqual(parseSshEndpoint('ssh://d%C3%A9v@BuildServer'), { host: 'BuildServer', user: 'dév' });
});

void test('invalid or option-like connection inputs are rejected', () => {
  for (const endpoint of [
    'tcp://host:2375', 'unix:///var/run/docker.sock', 'ssh://-oProxyCommand=bad',
    'ssh://-user@host', 'ssh://host:0', 'ssh://host:65536', 'ssh://host:abc',
    'ssh://user:password@host', 'ssh://host?query', 'ssh://host#fragment',
    'ssh://host%0anext', 'ssh://user%00@host', 'ssh://host;command', 'ssh://$(command)', 'ssh://%xx',
  ]) {
    assert.equal(parseSshEndpoint(endpoint), undefined, endpoint);
  }
});

void test('unsupported and malformed authorities fail closed without invoking Docker', async () => {
  const values = [
    'ssh-remote+host', 'wsl+Ubuntu', 'dev-container+not-hex', 'dev-container+abc', 'dev-container+ff',
    authority('{invalid'), authority({}), authority('/local/project'),
    authority({}, 'wsl+Ubuntu'), authority({}, 'tunnel+host'), authority({}, 'dev-container+abc'),
    authority({ settings: 'invalid' }), authority({ settings: { host: 'tcp://host:2375' } }),
    authority({ settings: { context: '-bad' } }), authority({ settings: { context: 'bad\nname' } }),
    authority({ settings: { host: 'ssh://host', context: 'ambiguous' } }),
    authority({ localDocker: true }, 'ssh-remote+host'),
    authority({ settings: { context: 'nested' } }, 'ssh-remote+host'),
    authority({ settings: { host: 'ssh://another-host' } }, 'ssh-remote+host'),
  ];
  for (const value of values) {
    assert.equal(await resolveAuthority(value, noContext), undefined, value);
  }
});

void test('non-SSH Docker contexts and invalid encoded parent fields are rejected', async () => {
  assert.equal(await resolveAuthority(authority({ settings: { context: 'local' } }), async () => 'unix:///var/run/docker.sock'), undefined);
  for (const target of [{ hostName: '-bad' }, { hostName: 'host', port: '22' }, { hostName: 'host', user: 'bad user' }]) {
    const parent = `ssh-remote+${Buffer.from(JSON.stringify(target)).toString('hex')}`;
    assert.equal(await resolveAuthority(authority({}, parent), noContext), undefined);
  }
});

void test('relative and control-containing paths never become host working directories', async () => {
  for (const hostPath of ['relative/path', '/bad\npath', 'C:\\project']) {
    assert.deepEqual(await resolveAuthority(authority({ hostPath }, 'ssh-remote+host'), noContext), { host: 'host' });
  }
});

void test('Docker lookup failures are propagated for explicit command error reporting', async () => {
  await assert.rejects(resolveAuthority(authority({ settings: { context: 'missing' } }), async () => {
    throw new Error('context missing');
  }), /context missing/);
});
