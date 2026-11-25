import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runCli } from '../src/cli';

const CLI_PATH = join(process.cwd(), 'src/cli.ts');
const TSX_BIN = join(process.cwd(), 'node_modules/.bin/tsx');

function runCliSubprocess(args: string[], input?: string) {
  return spawnSync(TSX_BIN, [CLI_PATH, ...args], {
    input,
    encoding: 'utf8',
    env: { ...process.env, VITEST: '' },
  });
}

async function runCliInProcess(args: string[], input?: string) {
  const out: string[] = [];
  const err: string[] = [];
  let exitCode: number | undefined;

  const stdin = new Readable({
    read() {
      if (input !== undefined && input.length > 0) {
        this.push(input);
      }
      this.push(null);
    },
  });

  runCli({
    args,
    stdin,
    stdout: text => out.push(text),
    stderr: text => err.push(text),
    exit: code => {
      exitCode = code;
    },
  });

  // Allow stdin 'end' event to flush when not using -f or --help
  await new Promise(resolve => setTimeout(resolve, 10));

  return {
    stdout: out.join('\n'),
    stderr: err.join('\n'),
    exitCode,
  };
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

  it('evaluates an expression against stdin', async () => {
    const res = await runCliInProcess(['foo.bar'], '{"foo":{"bar":42}}');
    expect(res.exitCode).toBeUndefined();
    expect(res.stdout).toBe('42');
    expect(res.stderr).toBe('');
  });

  it('evaluates -f and -e with -c compact output', async () => {
    const res = await runCliInProcess(['-c', '-f', dataFile, '-e', exprFile]);
    expect(res.exitCode).toBeUndefined();
    expect(res.stdout).toBe('42');
    expect(res.stderr).toBe('');
  });

  it('prints help and exits 0', async () => {
    const res = await runCliInProcess(['--help']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('USAGE:');
    expect(res.stderr).toBe('');
  });

  it('writes missing expression error to stderr and exits 1', async () => {
    const res = await runCliInProcess([]);
    expect(res.exitCode).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('Must provide a jmespath expression.');
  });

  it('rejects extra positional arguments', async () => {
    const res = await runCliInProcess(['foo', 'bar'], '{"foo":1}');
    expect(res.exitCode).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('Unexpected extra positional arguments.');
  });

  it('rejects positional argument when -e is provided', async () => {
    const res = await runCliInProcess(['-e', exprFile, 'extra'], '{"foo":{"bar":42}}');
    expect(res.exitCode).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('Unexpected extra positional arguments.');
  });

  it('handles unknown flags cleanly without stack trace', () => {
    const res = runCliSubprocess(['--bogus', 'foo'], '{}');
    expect(res.status).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('--bogus');
    expect(res.stderr).not.toContain('at parseArgs');
  });

  it('handles missing -f file cleanly without stack trace', async () => {
    const res = await runCliInProcess(['-f', join(tempDir, 'missing.json'), 'foo']);
    expect(res.exitCode).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('ENOENT');
  });

  it('handles empty stdin cleanly without stack trace', async () => {
    const res = await runCliInProcess(['foo'], '');
    expect(res.exitCode).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('Empty JSON input.');
  });

  it('handles invalid JSON cleanly without stack trace', async () => {
    const res = await runCliInProcess(['foo'], '{bad');
    expect(res.exitCode).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr.trim().length).toBeGreaterThan(0);
  });

  it('handles JMESPath parser errors cleanly without stack trace', () => {
    const res = runCliSubprocess(['foo.'], '{}');
    expect(res.status).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('Syntax error');
    expect(res.stderr).not.toContain('at TokenParser');
  });
});
