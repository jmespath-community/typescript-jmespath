import { describe, expect, it } from 'vitest';
import jmespath from '../src';

describe('scopes', () => {
  it('should return null on missing identifier', () => {
    const scope = jmespath.Scope();
    expect(scope.getValue('foo')).toEqual(null);
  });
  it('should return item from scope', () => {
    const scope = jmespath.Scope();
    {
      const outer = scope.withScope({ foo: 'bar' });
      expect(outer.getValue('foo')).toEqual('bar');
    }
  });
  it('should return item from nested scope', () => {
    const scope = jmespath.Scope();
    {
      const outer = scope.withScope({ foo: 'bar', qux: 'quux' });
      {
        const inner = outer.withScope({ foo: 'baz' });
        expect(inner.getValue('foo')).toEqual('baz');
        expect(inner.getValue('qux')).toEqual('quux');
      }
      expect(outer.getValue('foo')).toEqual('bar');
    }
  });
  it('should not return value for non-existent identifiers', () => {
    const scope = jmespath.Scope();
    {
      const scoped = scope.withScope({ foo: 'bar' });
      expect(scoped.getValue('baz')).toEqual(null);
      expect(scoped.getValue('foo')).toEqual('bar');
    }
  });
  it('should return null for identifiers even in nested scopes if absent', () => {
    const scope = jmespath.Scope();
    {
      const outer = scope.withScope({ foo: 'bar' });
      {
        const inner = outer.withScope({ bar: 'baz' });
        expect(inner.getValue('qux')).toEqual(null);
      }
      expect(outer.getValue('qux')).toEqual(null);
    }
  });
  it('should handle values in nested scopes differently from outer scopes', () => {
    const scope = jmespath.Scope();
    {
      const outer = scope.withScope({ foo: 'bar' });
      {
        const inner = outer.withScope({ bar: 'baz' });
        expect(inner.getValue('foo')).toEqual('bar');
        expect(inner.getValue('bar')).toEqual('baz');
      }
    }
  });
  it('should not fall through to outer scope when key is in current scope with null/undefined', () => {
    const scope = jmespath.Scope();
    {
      const outer = scope.withScope({ foo: 'bar' });
      {
        const inner = outer.withScope({ foo: null });
        expect(inner.getValue('foo')).toEqual(null);
      }
    }
  });
  it('should properly differentiate between keys absent entirely and those in outer scopes', () => {
    const scope = jmespath.Scope();
    {
      const outer = scope.withScope({ foo: 'bar' });
      {
        const inner = outer.withScope({});
        expect(inner.getValue('foo')).toEqual('bar');
        expect(inner.getValue('baz')).toEqual(null);
      }
    }
  });

  it('hasValue correctly detects presence for falsy values across scope chains', () => {
    const scope = jmespath.Scope();
    const outer = scope.withScope({ zero: 0, empty: '', no: false, nil: null });
    const inner = outer.withScope({ local: 1 });

    expect(outer.hasValue('zero')).toBe(true);
    expect(outer.hasValue('empty')).toBe(true);
    expect(outer.hasValue('no')).toBe(true);
    expect(outer.hasValue('nil')).toBe(true);
    expect(outer.hasValue('missing')).toBe(false);

    expect(inner.hasValue('zero')).toBe(true);
    expect(inner.hasValue('empty')).toBe(true);
    expect(inner.hasValue('no')).toBe(true);
    expect(inner.hasValue('nil')).toBe(true);
    expect(inner.hasValue('local')).toBe(true);
    expect(inner.hasValue('missing')).toBe(false);
  });

  it('evaluates nested let expressions when outer scope variables are falsy', () => {
    expect(jmespath.search({}, 'let $x = `0` in let $y = `1` in $x')).toBe(0);
    expect(jmespath.search({}, 'let $x = `null` in let $y = `1` in $x')).toBeNull();
    expect(jmespath.search({}, 'let $x = `false` in let $y = `1` in $x')).toBe(false);
    expect(jmespath.search({}, 'let $x = `""` in let $y = `1` in $x')).toBe('');
    expect(() => jmespath.search({}, 'let $x = `0` in let $y = `1` in $z')).toThrow(/undefined variable z/i);
  });

  it('preserves lexical let scope inside higher-order functions', () => {
    expect(jmespath.search({}, 'let $offset = `10` in `[1, 2, 3]` | map(&(@ + $offset), @)')).toEqual([11, 12, 13]);
    expect(jmespath.search({}, 'let $mult = `-1` in `[1, 2, 3]` | sort_by(@, &(@ * $mult))')).toEqual([3, 2, 1]);
    expect(jmespath.search({}, 'let $mult = `-1` in `[1, 2, 3]` | max_by(@, &(@ * $mult))')).toBe(1);
    expect(jmespath.search({}, 'let $mult = `-1` in `[1, 2, 3]` | min_by(@, &(@ * $mult))')).toBe(3);
    expect(
      jmespath.search(
        {},
        'let $tag = `"x"` in `[{"cat": "a", "v": 1}, {"cat": "b", "v": 2}]` | group_by(@, &join(`"-"`, [cat, $tag]))',
      ),
    ).toEqual({
      'a-x': [{ cat: 'a', v: 1 }],
      'b-x': [{ cat: 'b', v: 2 }],
    });
    expect(jmespath.search({}, 'let $factor = `2` in `[[1, 2], [3, 4]]` | map(&map(&(@ * $factor), @), @)')).toEqual([
      [2, 4],
      [6, 8],
    ]);
  });
});
