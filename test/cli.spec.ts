import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const CLI_PATH = join(process.cwd(), 'src/cli.ts');
const TSX_BIN = join(process.cwd(), 'node_modules/.bin/tsx');

function runCli(args: string[], input?: string) {
  return spawnSync(TSX_BIN, [CLI_PATH, ...args], {
    input,
    encoding: 'utf8',
  });
}

describe('CLI', () => {
  let tempDir: string;
  let dataFile: string;
  let exprFile: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'jmespath-cli-'));
    dataFile = join(tempDir, 'data.json');
    exprFile = join(tempDir, 'query.jp');
    writeFileSync(dataFile, JSON.stringify({ foo: { bar: 42 } }));
    writeFileSync(exprFile, 'foo.bar');
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('evaluates an expression against stdin', () => {
    const res = runCli(['foo.bar'], '{"foo":{"bar":42}}');
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe('42');
    expect(res.stderr).toBe('');
  });

  it('evaluates -f and -e with -c compact output', () => {
    const res = runCli(['-c', '-f', dataFile, '-e', exprFile]);
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe('42');
    expect(res.stderr).toBe('');
  });

  it('prints help and exits 0', () => {
    const res = runCli(['--help']);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('USAGE:');
    expect(res.stderr).toBe('');
  });

  it('writes missing expression error to stderr and exits 1', () => {
    const res = runCli([]);
    expect(res.status).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('Must provide a jmespath expression.');
  });

  it('rejects extra positional arguments', () => {
    const res = runCli(['foo', 'bar'], '{"foo":1}');
    expect(res.status).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('Unexpected extra positional arguments.');
  });

  it('rejects positional argument when -e is provided', () => {
    const res = runCli(['-e', exprFile, 'extra'], '{"foo":{"bar":42}}');
    expect(res.status).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('Unexpected extra positional arguments.');
  });

  it('handles unknown flags cleanly without stack trace', () => {
    const res = runCli(['--bogus', 'foo'], '{}');
    expect(res.status).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('--bogus');
    expect(res.stderr).not.toContain('at parseArgs');
  });

  it('handles missing -f file cleanly without stack trace', () => {
    const res = runCli(['-f', join(tempDir, 'missing.json'), 'foo']);
    expect(res.status).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('ENOENT');
    expect(res.stderr).not.toContain('at Module.readFileSync');
  });

  it('handles empty stdin cleanly without stack trace', () => {
    const res = runCli(['foo'], '');
    expect(res.status).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('Empty JSON input.');
    expect(res.stderr).not.toContain('at JSON.parse');
  });

  it('handles invalid JSON cleanly without stack trace', () => {
    const res = runCli(['foo'], '{bad');
    expect(res.status).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr.trim().length).toBeGreaterThan(0);
    expect(res.stderr).not.toContain('at JSON.parse');
  });

  it('handles JMESPath parser errors cleanly without stack trace', () => {
    const res = runCli(['foo.'], '{}');
    expect(res.status).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('Syntax error');
    expect(res.stderr).not.toContain('at TokenParser');
  });
});
