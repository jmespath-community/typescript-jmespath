import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const DIST_DIR = join(process.cwd(), 'dist');
const TYPES_DIR = join(DIST_DIR, 'types');
const LIB_DIR = join(DIST_DIR, 'lib');

describe('Build Artifacts', () => {
  describe('TypeScript Declarations', () => {
    it('should generate main index.d.ts file', () => {
      const indexDtsPath = join(TYPES_DIR, 'index.d.ts');
      expect(existsSync(indexDtsPath), `Expected ${indexDtsPath} to exist`).toBe(true);

      const content = readFileSync(indexDtsPath, 'utf-8');
      expect(content).toContain('export declare function search');
      expect(content).toContain('export declare function compile');
      expect(content).toContain('export declare const registerFunction');
    });

    it('should generate all required type declaration files', () => {
      const requiredFiles = [
        'AST.type.d.ts',
        'JSON.type.d.ts',
        'Lexer.d.ts',
        'Lexer.type.d.ts',
        'Parser.d.ts',
        'Parser.type.d.ts',
        'Runtime.d.ts',
        'Scope.d.ts',
        'TreeInterpreter.d.ts',
        'utils/index.d.ts',
        'utils/strings.d.ts',
        'utils/text.d.ts',
      ];

      for (const file of requiredFiles) {
        const filePath = join(TYPES_DIR, file);
        expect(existsSync(filePath), `Expected ${filePath} to exist`).toBe(true);
      }
    });

    it('should export all main types and functions', () => {
      const indexDtsPath = join(TYPES_DIR, 'index.d.ts');
      const content = readFileSync(indexDtsPath, 'utf-8');

      // Check for main function exports
      expect(content).toContain('export declare function search');
      expect(content).toContain('export declare function compile');
      expect(content).toContain('export declare function tokenize');

      // Check for type exports
      expect(content).toContain('export type { JSONArray, JSONObject, JSONPrimitive, JSONValue }');
      expect(content).toContain('export type { Options }');
      expect(content).toContain('export type { BuiltInFunctionNames');

      // Check for constant exports
      expect(content).toContain('export declare const TYPE_ANY');
      expect(content).toContain('export declare const TYPE_STRING');
      expect(content).toContain('export declare const TYPE_NUMBER');
    });
  });

  describe('UMD and ESM Bundles', () => {
    it('should generate UMD bundle', () => {
      const umdPath = join(DIST_DIR, 'jmespath.umd.js');
      expect(existsSync(umdPath), `Expected ${umdPath} to exist`).toBe(true);

      const content = readFileSync(umdPath, 'utf-8');
      expect(content).toContain('(function (global, factory)');
    });

    it('should generate minified UMD bundle', () => {
      const umdMinPath = join(DIST_DIR, 'jmespath.umd.min.js');
      expect(existsSync(umdMinPath), `Expected ${umdMinPath} to exist`).toBe(true);

      const stat = statSync(umdMinPath);
      expect(stat.size).toBeGreaterThan(0);
    });

    it('should generate ESM bundle', () => {
      const esmPath = join(DIST_DIR, 'jmespath.esm.js');
      expect(existsSync(esmPath), `Expected ${esmPath} to exist`).toBe(true);

      const content = readFileSync(esmPath, 'utf-8');
      expect(content).toContain('export {');
    });

    it('should generate minified ESM bundle', () => {
      const esmMinPath = join(DIST_DIR, 'jmespath.esm.min.js');
      expect(existsSync(esmMinPath), `Expected ${esmMinPath} to exist`).toBe(true);

      const stat = statSync(esmMinPath);
      expect(stat.size).toBeGreaterThan(0);
    });
  });

  describe('CLI Binary', () => {
    it('should generate CLI binary', () => {
      const binPath = join(LIB_DIR, 'bin', 'jp.js');
      expect(existsSync(binPath), `Expected ${binPath} to exist`).toBe(true);

      const content = readFileSync(binPath, 'utf-8');
      expect(content).toContain('#! /usr/bin/env node');
    });

    it('should generate source maps for CLI binary', () => {
      const mapPath = join(LIB_DIR, 'bin', 'jp.js.map');
      expect(existsSync(mapPath), `Expected ${mapPath} to exist`).toBe(true);
    });
  });

  describe('Package.json Configuration', () => {
    it('should have correct main entry points', () => {
      const pkgPath = join(process.cwd(), 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.main).toBe('dist/jmespath.umd.js');
      expect(pkg.module).toBe('dist/jmespath.esm.js');
      expect(pkg.types).toBe('dist/types/index.d.ts');
      expect(pkg.typings).toBe('dist/types/index.d.ts');
    });

    it('should have correct bin configuration', () => {
      const pkgPath = join(process.cwd(), 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.bin).toEqual({ jp: 'dist/lib/bin/jp.js' });
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
      expect(pkg.exports['.'].types).toBe('./dist/types/index.d.ts');
      expect(pkg.exports['.'].import).toBe('./dist/jmespath.esm.js');
      expect(pkg.exports['.'].require).toBe('./dist/jmespath.umd.js');
    });
  });
});
