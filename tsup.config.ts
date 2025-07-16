import { defineConfig } from 'tsup';

export default defineConfig([
  // Library build - Node.js
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    outDir: 'dist',
    outExtension({ format }) {
      return {
        js: format === 'cjs' ? '.cjs' : '.mjs',
      };
    },
    target: 'es2022',
    platform: 'node',
    splitting: false,
    treeshake: true,
  },
  // Library build - Browser UMD
  {
    entry: ['src/index.ts'],
    format: ['iife'],
    dts: false, // Types already generated above
    sourcemap: true,
    outDir: 'dist',
    outExtension() {
      return {
        js: '.umd.js',
      };
    },
    target: 'es2020', // Broader browser compatibility
    platform: 'browser',
    globalName: 'jmespath',
    splitting: false,
    treeshake: true,
    minify: false,
  },
  // Library build - Browser UMD Minified
  {
    entry: ['src/index.ts'],
    format: ['iife'],
    dts: false,
    sourcemap: true,
    outDir: 'dist',
    outExtension() {
      return {
        js: '.umd.min.js',
      };
    },
    target: 'es2020',
    platform: 'browser',
    globalName: 'jmespath',
    splitting: false,
    treeshake: true,
    minify: true,
  },
  // Library build - Browser ESM
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: false,
    sourcemap: true,
    outDir: 'dist',
    outExtension() {
      return {
        js: '.esm.js',
      };
    },
    target: 'es2020',
    platform: 'browser',
    splitting: false,
    treeshake: true,
    minify: false,
  },
  // Library build - Browser ESM Minified
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: false,
    sourcemap: true,
    outDir: 'dist',
    outExtension() {
      return {
        js: '.esm.min.js',
      };
    },
    target: 'es2020',
    platform: 'browser',
    splitting: false,
    treeshake: true,
    minify: true,
  },
  // CLI build - ESM only (since package.json points to .mjs)
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    outDir: 'dist',
    outExtension() {
      return {
        js: '.mjs',
      };
    },
    target: 'es2022',
    platform: 'node',
    splitting: false,
    treeshake: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
