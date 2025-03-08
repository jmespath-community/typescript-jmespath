import { describe, expect, it } from 'vitest';
import { Scope } from '../src';

describe('scopes', () => {
  it('should return null on missing identifier', () => {
    const scope = Scope();
    expect(scope.getValue('foo')).toEqual(null);
  });
  it('should return item from scope', () => {
    const scope = Scope();
    {
      const outer = scope.withScope({ foo: 'bar' });
      expect(outer.getValue('foo')).toEqual('bar');
    }
  });
  it('should return item from nested scope', () => {
    const scope = Scope();
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
    const scope = Scope();
    {
      const scoped = scope.withScope({ foo: 'bar' });
      expect(scoped.getValue('baz')).toEqual(null);
      expect(scoped.getValue('foo')).toEqual('bar');
    }
  });
  it('should return null for identifiers even in nested scopes if absent', () => {
    const scope = Scope();
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
    const scope = Scope();
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
    const scope = Scope();
    {
      const outer = scope.withScope({ foo: 'bar' });
      {
        const inner = outer.withScope({ foo: null });
        expect(inner.getValue('foo')).toEqual(null);
      }
    }
  });
  it('should properly differentiate between keys absent entirely and those in outer scopes', () => {
    const scope = Scope();
    {
      const outer = scope.withScope({ foo: 'bar' });
      {
        const inner = outer.withScope({});
        expect(inner.getValue('foo')).toEqual('bar');
        expect(inner.getValue('baz')).toEqual(null);
      }
    }
  });
});
