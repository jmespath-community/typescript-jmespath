import { defineConfig, Options } from 'tsup';

const baseConfig: Options = {
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
};

const nodeConfig: Options = {
  ...baseConfig,
  platform: 'node',
  target: 'es2022',
  format: ['cjs', 'esm'],
  outDir: 'dist',
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.mjs',
    };
  },
};

const browserConfig: Options = {
  ...baseConfig,
  platform: 'browser',
  target: 'es2020',
  globalName: 'jmespath',
};

export default defineConfig([
  // Library builds
  {
    ...nodeConfig,
    entry: ['src/index.ts'],
  },
  {
    ...browserConfig,
    entry: ['src/index.ts'],
    format: ['esm'],
    outExtension() {
      return {
        js: '.esm.js',
      };
    },
  },
  {
    ...browserConfig,
    entry: ['src/index.ts'],
    format: ['esm'],
    minify: true,
    outExtension() {
      return {
        js: '.esm.min.js',
      };
    },
  },
  {
    ...browserConfig,
    entry: ['src/index.ts'],
    format: ['iife'],
    outExtension() {
      return {
        js: '.umd.js',
      };
    },
  },
  {
    ...browserConfig,
    entry: ['src/index.ts'],
    format: ['iife'],
    minify: true,
    outExtension() {
      return {
        js: '.umd.min.js',
      };
    },
  },
  // CLI build
  {
    ...nodeConfig,
    entry: ['src/cli.ts'],
    dts: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
