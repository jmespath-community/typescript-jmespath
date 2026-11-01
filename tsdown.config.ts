import { defineConfig, type UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  dts: { sourcemap: false },
  sourcemap: true,
  clean: false,
  treeshake: true,
};

const nodeConfig: UserConfig = {
  ...baseConfig,
  platform: 'node',
  target: 'es2022',
  format: ['cjs', 'esm'],
  outDir: 'dist',
  outExtensions: ({ format }) => ({
    js: format === 'cjs' ? '.cjs' : '.mjs',
    dts: format === 'cjs' ? '.d.cts' : '.d.ts',
  }),
};

const browserConfig: UserConfig = {
  ...baseConfig,
  platform: 'browser',
  target: 'es2020',
  dts: false,
  outDir: 'dist',
};

export default defineConfig([
  // Library builds
  {
    ...nodeConfig,
    entry: ['src/index.ts'],
  },
  {
    ...nodeConfig,
    entry: {
      stream: 'src/Stream.ts',
    },
  },
  {
    ...browserConfig,
    entry: ['src/index.ts'],
    format: ['esm'],
    outputOptions: { entryFileNames: 'index.esm.js' },
  },
  {
    ...browserConfig,
    entry: ['src/index.ts'],
    format: ['esm'],
    minify: true,
    outputOptions: { entryFileNames: 'index.esm.min.js' },
  },
  {
    ...browserConfig,
    entry: ['src/index.ts'],
    format: ['iife'],
    globalName: 'jmespath',
    outputOptions: { entryFileNames: 'index.umd.js' },
  },
  {
    ...browserConfig,
    entry: ['src/index.ts'],
    format: ['iife'],
    globalName: 'jmespath',
    minify: true,
    outputOptions: { entryFileNames: 'index.umd.min.js' },
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
