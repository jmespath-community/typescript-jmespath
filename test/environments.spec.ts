import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { Script } from 'vm';
import jmespathEsm from '../dist/index.mjs';

const require = createRequire(import.meta.url);
const { search: searchCjs } = require('../dist/index.cjs');

const data = { foo: { bar: { baz: [0, 1, 2, 3, 4] } } };
const expression = 'foo.bar.baz[2]';
const expected = 2;

describe('Environment Bundles', () => {
  it('should work in an ESM environment', () => {
    const result = jmespathEsm.search(data, expression);
    expect(result).toBe(expected);
  });

  it('should work in a CJS environment', () => {
    const result = searchCjs(data, expression);
    expect(result).toBe(expected);
  });

  it('should work in a UMD (browser) environment', () => {
    const umdPath = join(process.cwd(), 'dist', 'index.umd.js');
    const umdContent = readFileSync(umdPath, 'utf-8');

    const context = {
      window: {},
      self: {},
    };
    context.self = context;
    context.window = context;

    const script = new Script(umdContent);
    script.runInNewContext(context);

    // @ts-ignore
    const jmespath = context.jmespath;

    expect(jmespath).toBeDefined();
    expect(typeof jmespath.search).toBe('function');

    const result = jmespath.search(data, expression);
    expect(result).toBe(expected);
  });
});
