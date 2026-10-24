import { describe, expect, it } from 'vitest';
import jmespath from '../src';

describe('Searches compiled ast', () => {
  it('search a compiled expression', () => {
    expect(jmespath.search({ foo: { bar: 'BAZ' } }, 'foo.bar')).toEqual('BAZ');
  });

  it('preserves null elements in standalone slice expression', () => {
    expect(jmespath.search([1, null, 2], '[0:3]')).toEqual([1, null, 2]);
  });

  it('evaluates repeated queries correctly with expression cache', () => {
    expect(jmespath.search({ a: 1 }, 'a')).toEqual(1);
    expect(jmespath.search({ a: 2 }, 'a')).toEqual(2);
  });

  it('supports callable compiled queries', () => {
    interface User {
      name: string;
      age: number;
    }
    const user: User = { name: 'Alice', age: 30 };
    const query = jmespath.compileQuery<string, User>('name');
    expect(query(user)).toEqual('Alice');
    expect(query.search(user)).toEqual('Alice');
    expect(query.ast.type).toEqual('Field');
  });

  it('supports typed search with custom interfaces', () => {
    interface Item {
      id: string;
    }
    const item: Item = { id: 'x1' };
    const id = jmespath.search<string>(item, 'id');
    expect(id).toEqual('x1');
  });

  it('enforces maxDepth option', () => {
    expect(() => jmespath.search({ a: { b: 1 } }, 'a.b', { maxDepth: 1 })).toThrow(/depth/i);
    expect(jmespath.search({ a: { b: 1 } }, 'a.b', { maxDepth: 5 })).toEqual(1);
  });

  it('enforces function allow and deny lists', () => {
    expect(jmespath.search([1, 2], 'length(@)', { allowedFunctions: ['length'] })).toEqual(2);
    expect(() => jmespath.search([1, 2], 'length(@)', { allowedFunctions: ['keys'] })).toThrow(/not allowed/i);
    expect(() => jmespath.search([1, 2], 'length(@)', { disallowedFunctions: ['length'] })).toThrow(/disallowed/i);
  });

  it('enforces execution timeout', () => {
    expect(() =>
      jmespath.search(
        Array.from({ length: 10000 }, (_, i) => ({ a: i })),
        '[*].a',
        { timeoutMs: 0 },
      ),
    ).toThrow(/timed out/i);
  });
});
