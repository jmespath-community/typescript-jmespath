import { describe, expect, it } from 'vitest';
import jmespath, { compile, compileQuery, search } from '../src';
import { compileFastEvaluator } from '../src/FastEvaluator';
import TreeInterpreterInst from '../src/TreeInterpreter';

describe('FastEvaluator (Non-Eval Closure Combinators)', () => {
  describe('Direct compilation and evaluation', () => {
    it('should compile simple and flattened field paths', () => {
      const ast = compile('foo.bar.baz.qux');
      const fastFn = compileFastEvaluator(ast, undefined, TreeInterpreterInst.runtime);
      expect(fastFn).not.toBeNull();
      const data = { foo: { bar: { baz: { qux: 42 } } } };
      expect(fastFn?.(data)).toBe(42);
      expect(fastFn?.({ foo: null })).toBeNull();
      expect(fastFn?.({ foo: { bar: null } })).toBeNull();
      expect(fastFn?.('not-an-object')).toBeNull();
    });

    it('should compile depth 2 and depth 3 chains with unrolled paths', () => {
      const ast2 = compile('a.b');
      const fn2 = compileFastEvaluator(ast2, undefined, TreeInterpreterInst.runtime);
      expect(fn2).not.toBeNull();
      expect(fn2?.({ a: { b: 'hello' } })).toBe('hello');
      expect(fn2?.({ a: null })).toBeNull();

      const ast3 = compile('a.b.c');
      const fn3 = compileFastEvaluator(ast3, undefined, TreeInterpreterInst.runtime);
      expect(fn3).not.toBeNull();
      expect(fn3?.({ a: { b: { c: true } } })).toBe(true);
      expect(fn3?.({ a: { b: 123 } })).toBeNull();
    });

    it('should compile array projections with field specialization', () => {
      const ast = compile('items[*].name');
      const fastFn = compileFastEvaluator(ast, undefined, TreeInterpreterInst.runtime);
      expect(fastFn).not.toBeNull();
      const data = {
        items: [{ name: 'first' }, { other: 2 }, { name: 'second' }, null, 'scalar'],
      };
      expect(fastFn?.(data)).toEqual(['first', 'second']);
      expect(fastFn?.({ items: 'not-an-array' })).toBeNull();
    });

    it('should compile filter projections with conditions', () => {
      const ast = compile('items[?price > `50`].name');
      const fastFn = compileFastEvaluator(ast, undefined, TreeInterpreterInst.runtime);
      expect(fastFn).not.toBeNull();
      const data = {
        items: [
          { name: 'cheap', price: 10 },
          { name: 'expensive', price: 100 },
          { name: 'exact', price: 50 },
        ],
      };
      expect(fastFn?.(data)).toEqual(['expensive']);
    });

    it('should compile index expressions and negative indices', () => {
      const astFirst = compile('items[0]');
      const fnFirst = compileFastEvaluator(astFirst, undefined, TreeInterpreterInst.runtime);
      expect(fnFirst?.({ items: ['a', 'b', 'c'] })).toBe('a');

      const astLast = compile('items[-1]');
      const fnLast = compileFastEvaluator(astLast, undefined, TreeInterpreterInst.runtime);
      expect(fnLast?.({ items: ['a', 'b', 'c'] })).toBe('c');

      const astOOB = compile('items[10]');
      const fnOOB = compileFastEvaluator(astOOB, undefined, TreeInterpreterInst.runtime);
      expect(fnOOB?.({ items: ['a'] })).toBeNull();
      expect(fnOOB?.({ items: 'not-an-array' })).toBeNull();
    });

    it('should compile pipes, or-expressions, and and-expressions', () => {
      const pipeAst = compile('foo | bar');
      const pipeFn = compileFastEvaluator(pipeAst, undefined, TreeInterpreterInst.runtime);
      expect(pipeFn?.({ foo: { bar: 99 } })).toBe(99);

      const orAst = compile('missing || fallback');
      const orFn = compileFastEvaluator(orAst, undefined, TreeInterpreterInst.runtime);
      expect(orFn?.({ missing: null, fallback: 'found' })).toBe('found');
      expect(orFn?.({ missing: 'exists', fallback: 'found' })).toBe('exists');

      const andAst = compile('a && b');
      const andFn = compileFastEvaluator(andAst, undefined, TreeInterpreterInst.runtime);
      expect(andFn?.({ a: true, b: 'yes' })).toBe('yes');
      expect(andFn?.({ a: false, b: 'yes' })).toBe(false);
    });

    it('should compile value projections, flatten, and multi-selects', () => {
      const valProjAst = compile('foo.*.bar');
      const valProjFn = compileFastEvaluator(valProjAst, undefined, TreeInterpreterInst.runtime);
      expect(
        valProjFn?.({
          foo: {
            x: { bar: 1 },
            y: { bar: 2 },
            z: { other: 3 },
          },
        }),
      ).toEqual([1, 2]);

      const flattenAst = compile('items[].name');
      const flattenFn = compileFastEvaluator(flattenAst, undefined, TreeInterpreterInst.runtime);
      expect(
        flattenFn?.({
          items: [[{ name: 'a' }, { name: 'b' }], [{ name: 'c' }]],
        }),
      ).toEqual(['a', 'b', 'c']);

      const multiHashAst = compile('{id: id, label: name}');
      const multiHashFn = compileFastEvaluator(multiHashAst, undefined, TreeInterpreterInst.runtime);
      expect(multiHashFn?.({ id: 10, name: 'widget' })).toEqual({ id: 10, label: 'widget' });

      const multiListAst = compile('[id, name]');
      const multiListFn = compileFastEvaluator(multiListAst, undefined, TreeInterpreterInst.runtime);
      expect(multiListFn?.({ id: 10, name: 'widget' })).toEqual([10, 'widget']);
    });

    it('should compile built-in functions without expression references', () => {
      const lenAst = compile('length(items)');
      const lenFn = compileFastEvaluator(lenAst, undefined, TreeInterpreterInst.runtime);
      expect(lenFn?.({ items: [1, 2, 3] })).toBe(3);

      const containsAst = compile("contains(name, 'sub')");
      const containsFn = compileFastEvaluator(containsAst, undefined, TreeInterpreterInst.runtime);
      expect(containsFn?.({ name: 'substring' })).toBe(true);
      expect(containsFn?.({ name: 'other' })).toBe(false);
    });

    it('should compile root, current (@), and ternary operators', () => {
      const ternaryAst = compile("foo ? 'yes' : 'no'");
      const ternaryFn = compileFastEvaluator(ternaryAst, undefined, TreeInterpreterInst.runtime);
      expect(ternaryFn?.({ foo: true })).toBe('yes');
      expect(ternaryFn?.({ foo: false })).toBe('no');

      const rootAst = compile('items[*].[$.name, @.val]');
      const rootFn = compileFastEvaluator(rootAst, undefined, TreeInterpreterInst.runtime);
      expect(
        rootFn?.({
          name: 'parent',
          items: [{ val: 1 }, { val: 2 }],
        }),
      ).toEqual([
        ['parent', 1],
        ['parent', 2],
      ]);
    });
  });

  describe('Fallback behavior for complex expressions & safety options', () => {
    it('should return null when maxDepth option is specified', () => {
      const ast = compile('foo.bar');
      const fastFn = compileFastEvaluator(ast, { maxDepth: 10 }, TreeInterpreterInst.runtime);
      expect(fastFn).toBeNull();
    });

    it('should return null when timeoutMs option is specified', () => {
      const ast = compile('foo.bar');
      const fastFn = compileFastEvaluator(ast, { timeoutMs: 100 }, TreeInterpreterInst.runtime);
      expect(fastFn).toBeNull();
    });

    it('should return null when maxNodes option is specified', () => {
      const ast = compile('foo.bar');
      const fastFn = compileFastEvaluator(ast, { maxNodes: 10 }, TreeInterpreterInst.runtime);
      expect(fastFn).toBeNull();
    });

    it('should return null when maxOutputSize option is specified', () => {
      const ast = compile('foo.bar');
      const fastFn = compileFastEvaluator(ast, { maxOutputSize: 100 }, TreeInterpreterInst.runtime);
      expect(fastFn).toBeNull();
    });

    it('should return null for functions with expression references (&expref)', () => {
      const ast = compile('sort_by(items, &price)');
      const fastFn = compileFastEvaluator(ast, undefined, TreeInterpreterInst.runtime);
      expect(fastFn).toBeNull();
    });

    it('should return null for let expressions', () => {
      const ast = compile('let $a = foo in $a');
      const fastFn = compileFastEvaluator(ast, undefined, TreeInterpreterInst.runtime);
      expect(fastFn).toBeNull();
    });
  });

  describe('Integration with compileQuery and search', () => {
    it('compileQuery uses fast evaluator transparently and matches search', () => {
      const query = compileQuery<{ name: string }[], { items: { name: string; price: number }[] }>(
        'items[?price > `50`].name',
      );
      const data = {
        items: [
          { name: 'alpha', price: 100 },
          { name: 'beta', price: 20 },
        ],
      };
      expect(query(data)).toEqual(['alpha']);
      expect(query.search(data)).toEqual(['alpha']);
      expect(search(data, 'items[?price > `50`].name')).toEqual(['alpha']);
    });

    it('falls back seamlessly to TreeInterpreter when options are passed', () => {
      const data = { foo: { bar: 'baz' } };
      expect(search(data, 'foo.bar', { timeoutMs: 5000 })).toBe('baz');
    });
  });
});
