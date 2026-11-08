import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const packageName = '@jmespath-community/jmespath';
const requireSource = `const { search } = require('${packageName}');`;

describe('Packed browser consumers', () => {
  let tempDir: string;
  let consumerDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'jmespath package consumers-'));
    const [packed] = JSON.parse(
      execSync('npm pack --json --ignore-scripts', {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env, npm_config_pack_destination: tempDir },
      }),
    );
    consumerDir = join(tempDir, 'consumer');
    mkdirSync(consumerDir);
    writeFileSync(
      join(consumerDir, 'package.json'),
      JSON.stringify({ private: true, dependencies: { [packageName]: `file:../${packed.filename}` } }),
    );
    // Install the tarball outside the checkout, without scripts or network access.
    execSync('npm install --offline --ignore-scripts --no-audit --no-fund --package-lock=false', {
      cwd: consumerDir,
      stdio: 'pipe',
    });
  }, 30_000);

  afterAll(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function expectSearch(cwd: string, source: string) {
    const bundle = buildSync({
      stdin: {
        contents: `${source}\nglobalThis.result = search({ foo: { bar: 42 } }, 'foo.bar');`,
        resolveDir: cwd,
      },
      bundle: true,
      platform: 'browser',
      format: 'iife',
      write: false,
    });
    const context: { result?: unknown } = {};
    runInNewContext(bundle.outputFiles[0].text, context);
    expect(context.result).toBe(42);
  }

  it.each([
    ['CommonJS', requireSource],
    ['ESM', `import { search } from '${packageName}';`],
  ])('supports browser-targeted %s', (_name, source) => {
    expectSearch(consumerDir, source);
  });

  it('supports the legacy browser field', () => {
    const legacyDir = join(tempDir, 'legacy');
    cpSync(consumerDir, legacyDir, { recursive: true });
    const manifestPath = join(legacyDir, 'node_modules', packageName, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    // Simulate a bundler without package exports support.
    delete manifest.exports;
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expectSearch(legacyDir, requireSource);
  });
});
