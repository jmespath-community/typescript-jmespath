import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const DIST_DIR = join(process.cwd(), 'dist');

describe('Build Artifacts', () => {
  describe('TypeScript Declarations', () => {
    it('should generate main index.d.ts file', () => {
      const indexDtsPath = join(DIST_DIR, 'index.d.ts');
      expect(existsSync(indexDtsPath), `Expected ${indexDtsPath} to exist`).toBe(true);

      const content = readFileSync(indexDtsPath, 'utf-8');
      expect(content).toContain('declare function search');
      expect(content).toContain('declare function compile');
      expect(content).toContain('declare const registerFunction');
    });

    it('should generate CLI type declarations', () => {
      const cliDtsPath = join(DIST_DIR, 'cli.d.ts');
      expect(existsSync(cliDtsPath), `Expected ${cliDtsPath} to exist`).toBe(true);
    });

    it('should export all main types and functions', () => {
      const indexDtsPath = join(DIST_DIR, 'index.d.ts');
      const content = readFileSync(indexDtsPath, 'utf-8');

      // Check for main function exports
      expect(content).toContain('declare function search');
      expect(content).toContain('declare function compile');
      expect(content).toContain('declare function tokenize');

      // Check for type exports
      expect(content).toContain('type JSONArray');
      expect(content).toContain('type JSONObject');
      expect(content).toContain('type JSONPrimitive');
      expect(content).toContain('type JSONValue');

      // Check for constant exports
      expect(content).toContain('declare const TYPE_ANY');
      expect(content).toContain('declare const TYPE_STRING');
      expect(content).toContain('declare const TYPE_NUMBER');
    });
  });

  describe('Node.js Bundles', () => {
    it('should generate CommonJS bundle', () => {
      const cjsPath = join(DIST_DIR, 'index.cjs');
      expect(existsSync(cjsPath), `Expected ${cjsPath} to exist`).toBe(true);

      const content = readFileSync(cjsPath, 'utf-8');
      expect(content).toContain('exports');
    });

    it('should generate ESM bundle', () => {
      const esmPath = join(DIST_DIR, 'index.mjs');
      expect(existsSync(esmPath), `Expected ${esmPath} to exist`).toBe(true);

      const content = readFileSync(esmPath, 'utf-8');
      expect(content).toContain('export');
    });

    it('should generate source maps', () => {
      const cjsMapPath = join(DIST_DIR, 'index.cjs.map');
      const esmMapPath = join(DIST_DIR, 'index.mjs.map');

      expect(existsSync(cjsMapPath), `Expected ${cjsMapPath} to exist`).toBe(true);
      expect(existsSync(esmMapPath), `Expected ${esmMapPath} to exist`).toBe(true);
    });
  });

  describe('Browser Bundles', () => {
    it('should generate UMD bundle', () => {
      const umdPath = join(DIST_DIR, 'index.umd.js');
      expect(existsSync(umdPath), `Expected ${umdPath} to exist`).toBe(true);

      const content = readFileSync(umdPath, 'utf-8');
      // tsup generates IIFE format with global variable
      expect(content).toContain('var jmespath = (function (exports)');
    });

    it('should generate minified UMD bundle', () => {
      const umdMinPath = join(DIST_DIR, 'index.umd.min.js');
      expect(existsSync(umdMinPath), `Expected ${umdMinPath} to exist`).toBe(true);
    });

    it('should generate browser ESM bundle', () => {
      const esmPath = join(DIST_DIR, 'index.esm.js');
      expect(existsSync(esmPath), `Expected ${esmPath} to exist`).toBe(true);

      const content = readFileSync(esmPath, 'utf-8');
      expect(content).toContain('export');
    });

    it('should generate minified browser ESM bundle', () => {
      const esmMinPath = join(DIST_DIR, 'index.esm.min.js');
      expect(existsSync(esmMinPath), `Expected ${esmMinPath} to exist`).toBe(true);
    });

    it('should generate source maps for all browser bundles', () => {
      const requiredMaps = ['index.umd.js.map', 'index.umd.min.js.map', 'index.esm.js.map', 'index.esm.min.js.map'];

      for (const mapFile of requiredMaps) {
        const mapPath = join(DIST_DIR, mapFile);
        expect(existsSync(mapPath), `Expected ${mapPath} to exist`).toBe(true);
      }
    });
  });

  describe('CLI Binary', () => {
    it('should generate CLI binary (ESM only)', () => {
      const binPath = join(DIST_DIR, 'cli.mjs');
      expect(existsSync(binPath), `Expected ${binPath} to exist`).toBe(true);

      const content = readFileSync(binPath, 'utf-8');
      expect(content).toContain('#!/usr/bin/env node');
    });

    it('should generate source maps for CLI binary', () => {
      const mjsMapPath = join(DIST_DIR, 'cli.mjs.map');
      expect(existsSync(mjsMapPath), `Expected ${mjsMapPath} to exist`).toBe(true);
    });

    it('should have functional CLI that can execute JMESPath queries', () => {
      const binPath = join(DIST_DIR, 'cli.mjs');
      const testData = '{"foo": {"bar": "baz"}}';
      const query = 'foo.bar';

      // Test basic functionality
      const result = execSync(`echo '${testData}' | node ${binPath} '${query}'`, {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });

      expect(result.trim()).toBe('"baz"');
    });

    it('should show help when --help flag is used', () => {
      const binPath = join(DIST_DIR, 'cli.mjs');

      const result = execSync(`node ${binPath} --help`, {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });

      expect(result).toContain('NAME:');
      expect(result).toContain('jp - jp [<options>] <expression>');
      expect(result).toContain('OPTIONS:');
    });
  });

  describe('Package.json Configuration', () => {
    it('should have correct main entry points', () => {
      const pkgPath = join(process.cwd(), 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.main).toBe('./dist/index.cjs');
      expect(pkg.module).toBe('./dist/index.mjs');
      expect(pkg.browser).toBe('./dist/index.umd.js');
      expect(pkg.types).toBe('./dist/index.d.ts');
      expect(pkg.type).toBe('module');
    });

    it('should have correct bin configuration', () => {
      const pkgPath = join(process.cwd(), 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.bin).toEqual({ jp: './dist/cli.mjs' });
    });

    it('should include dist directory in files', () => {
      const pkgPath = join(process.cwd(), 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.files).toContain('dist/');
    });

    it('should have modern exports field', () => {
      const pkgPath = join(process.cwd(), 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.exports).toBeDefined();
      expect(pkg.exports['.']).toBeDefined();
      expect(pkg.exports['.'].types).toBe('./dist/index.d.ts');
      expect(pkg.exports['.'].import).toBe('./dist/index.mjs');
      expect(pkg.exports['.'].require).toBe('./dist/index.cjs');

      // Check browser exports
      expect(pkg.exports['.'].browser).toBeDefined();
      expect(pkg.exports['.'].browser.import).toBe('./dist/index.esm.js');
      expect(pkg.exports['.'].browser.require).toBe('./dist/index.umd.js');
      expect(pkg.exports['.'].browser.default).toBe('./dist/index.umd.js');

      // Check Node.js specific exports
      expect(pkg.exports['.'].node).toBeDefined();
      expect(pkg.exports['.'].node.import).toBe('./dist/index.mjs');
      expect(pkg.exports['.'].node.require).toBe('./dist/index.cjs');

      // Check CLI export
      expect(pkg.exports['./cli']).toBeDefined();
      expect(pkg.exports['./cli'].types).toBe('./dist/cli.d.ts');
      expect(pkg.exports['./cli'].import).toBe('./dist/cli.mjs');
      expect(pkg.exports['./cli'].require).toBe('./dist/cli.cjs');
    });
  });
});
