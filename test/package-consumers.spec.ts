import { execFileSync, execSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const packageName = '@jmespath-community/jmespath';
const expectedResult = { searchType: 'function', defaultSearchType: 'function', result: 42, defaultResult: 42 };
const consumerSources = {
  import: `import jmespath, { search } from '${packageName}';`,
  require: `const { default: jmespath, search } = require('${packageName}');`,
};
const query = `globalThis.result = {
  searchType: typeof search,
  defaultSearchType: typeof jmespath?.search,
  result: search?.({ foo: { bar: 42 } }, 'foo.bar'),
  defaultResult: jmespath?.search({ foo: { bar: 42 } }, 'foo.bar'),
};`;

// Install the tarball outside the checkout so every import uses the published
// package's export map and files.
describe('Packed package consumers', () => {
  let tempDir: string;
  let consumerDir: string;
  let legacyDir: string;
  let fallbackDir: string;
  let packageDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'jmespath package consumers-'));
    const packed = JSON.parse(
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
      JSON.stringify({
        private: true,
        dependencies: { [packageName]: `file:../${packed[0].filename}` },
      }),
    );
    // Local tarball only: no runtime dependencies, lifecycle scripts, or network.
    execSync('npm install --offline --ignore-scripts --no-audit --no-fund --package-lock=false', {
      cwd: consumerDir,
      stdio: 'pipe',
    });
    packageDir = join(consumerDir, 'node_modules', packageName);

    legacyDir = join(tempDir, 'legacy');
    const legacyPackageDir = join(legacyDir, 'node_modules', packageName);
    cpSync(packageDir, legacyPackageDir, { recursive: true });
    const legacyManifest = JSON.parse(readFileSync(join(legacyPackageDir, 'package.json'), 'utf8'));
    // Simulate older bundlers that do not implement package exports.
    delete legacyManifest.exports;
    writeFileSync(join(legacyPackageDir, 'package.json'), JSON.stringify(legacyManifest));

    fallbackDir = join(tempDir, 'fallback');
    const fallbackPackageDir = join(fallbackDir, 'node_modules', packageName);
    cpSync(packageDir, fallbackPackageDir, { recursive: true });
    const fallbackManifest = JSON.parse(readFileSync(join(fallbackPackageDir, 'package.json'), 'utf8'));
    // esbuild always selects import or require. Remove those branches in this
    // copy so the browser.default target is tested too.
    delete fallbackManifest.exports['.'].browser.import;
    delete fallbackManifest.exports['.'].browser.require;
    writeFileSync(join(fallbackPackageDir, 'package.json'), JSON.stringify(fallbackManifest));
  }, 30_000);

  afterAll(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function bundleConsumer(cwd: string, syntax: keyof typeof consumerSources, expectedEntry: string) {
    const bundle = buildSync({
      absWorkingDir: cwd,
      stdin: { contents: `${consumerSources[syntax]}\n${query}`, resolveDir: cwd },
      bundle: true,
      platform: 'browser',
      target: 'es2020',
      format: 'iife',
      write: false,
      metafile: true,
    });
    // Check the file selected by esbuild as well as the exported API.
    expect(Object.keys(bundle.metafile.inputs)).toContain(`node_modules/${packageName}/dist/${expectedEntry}`);
    const context: { result?: unknown } = {};
    runInNewContext(bundle.outputFiles[0].text, context);
    expect(context.result).toEqual(expectedResult);
  }

  it('supports browser-targeted CommonJS consumers', () => {
    bundleConsumer(consumerDir, 'require', 'index.cjs');
  });

  it('supports browser-targeted ESM consumers', () => {
    bundleConsumer(consumerDir, 'import', 'index.esm.js');
  });

  it.each(['import', 'require'] as const)('supports legacy browser-field %s consumers', syntax => {
    bundleConsumer(legacyDir, syntax, 'index.esm.js');
  });

  it.each(['import', 'require'] as const)('provides a working browser.default module for %s', syntax => {
    bundleConsumer(fallbackDir, syntax, 'index.esm.js');
  });

  it.each(['import', 'require'] as const)('preserves Node.js %s consumers', syntax => {
    const source = `${consumerSources[syntax]}\n${query}\nconsole.log(JSON.stringify(globalThis.result));`;
    const output = execFileSync(
      process.execPath,
      ['--input-type', syntax === 'import' ? 'module' : 'commonjs', '--eval', source],
      { cwd: consumerDir, encoding: 'utf8' },
    );
    expect(JSON.parse(output)).toEqual(expectedResult);
  });

  it.each(['mts', 'cts'])('resolves browser declarations for .%s consumers', extension => {
    const filename = `typed-consumer.${extension}`;
    writeFileSync(
      join(consumerDir, filename),
      `${consumerSources.import}
const result: number = search<number>({ foo: { bar: 42 } }, 'foo.bar');
const defaultResult: number = jmespath.search<number>({ foo: { bar: 42 } }, 'foo.bar');
// @ts-expect-error The expression must be a string or AST, not a number.
search({ foo: 42 }, 42);
`,
    );
    const configPath = join(consumerDir, `tsconfig.${extension}.json`);
    writeFileSync(
      configPath,
      JSON.stringify({
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          customConditions: ['browser'],
          target: 'ES2022',
          strict: true,
          noEmit: true,
          types: ['node'],
          typeRoots: [join(process.cwd(), 'node_modules', '@types')],
        },
        files: [filename],
      }),
    );
    execFileSync(
      process.execPath,
      [join(process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc'), '-p', configPath],
      {
        cwd: consumerDir,
        stdio: 'pipe',
      },
    );
  });

  it.each(['index.umd.js', 'index.umd.min.js'])('preserves the %s script-tag global', filename => {
    const context: { jmespath?: { search: (data: unknown, expression: string) => unknown } } = {};
    runInNewContext(readFileSync(join(packageDir, 'dist', filename), 'utf8'), context);
    expect(typeof context.jmespath?.search).toBe('function');
    expect(context.jmespath?.search({ foo: { bar: 42 } }, 'foo.bar')).toBe(42);
  });
});
