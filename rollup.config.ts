import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from 'rollup-plugin-typescript2';

const pkg = require('./package.json');

const libraryName = 'jmespath';

export default {
  input: `src/index.ts`,
  output: [
    { file: pkg.main, name: libraryName, format: 'umd', exports: 'named', sourcemap: false },
    {
      file: pkg.main.replace('umd.js', 'umd.min.js'),
      name: libraryName,
      format: 'umd',
      exports: 'named',
      sourcemap: true,
      plugins: [terser()],
    },
    { file: pkg.module, format: 'esm', exports: 'named', sourcemap: false },
    {
      file: pkg.module.replace('esm.js', 'esm.min.js'),
      format: 'esm',
      exports: 'named',
      sourcemap: true,
      plugins: [terser()],
    },
  ],
  // Indicate here external modules you don't wanna include in your bundle (i.e.: 'lodash')
  external: [],
  watch: {
    include: ['src/**'],
  },
  plugins: [
    // Allow json resolution
    json(),
    // Compile TypeScript files
    typescript({
      tsconfig: './tsconfig.json',
      useTsconfigDeclarationDir: true,
    }),
    // Allow node_modules resolution, so you can use 'external' to control
    // which external modules to include in the bundle
    // https://github.com/rollup/rollup-plugin-node-resolve#usage
    resolve(),
  ],
};
