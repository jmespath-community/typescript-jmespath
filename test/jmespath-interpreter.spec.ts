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

  it('enforces maxNodes option', () => {
    expect(() => jmespath.search({ a: { b: 1 } }, 'a.b', { maxNodes: 1 })).toThrow(/node count/i);
    expect(jmespath.search({ a: { b: 1 } }, 'a.b', { maxNodes: 10 })).toEqual(1);
    expect(() => jmespath.compile('a.b.c', { maxNodes: 2 })).toThrow(/node count/i);
  });

  it('enforces maxOutputSize option', () => {
    const list = [{ a: 1 }, { a: 2 }, { a: 3 }];
    expect(() => jmespath.search(list, '[*].a', { maxOutputSize: 2 })).toThrow(/output size/i);
    expect(jmespath.search(list, '[*].a', { maxOutputSize: 5 })).toEqual([1, 2, 3]);

    expect(() => jmespath.search(list, '[?a > `1`].a', { maxOutputSize: 1 })).toThrow(/output size/i);
    expect(() => jmespath.search({ x: 1, y: 2, z: 3 }, '*', { maxOutputSize: 2 })).toThrow(/output size/i);
    expect(() => jmespath.search([1, 2, 3, 4], '[0:4]', { maxOutputSize: 3 })).toThrow(/output size/i);
    expect(() => jmespath.search('abcdef', '[0:5]', { maxOutputSize: 3 })).toThrow(/output size/i);
  });

  it('validates expressions without throwing', () => {
    expect(jmespath.validate('foo.bar').valid).toBe(true);
    expect(jmespath.validate('foo.bar').ast?.type).toBe('Subexpression');
    expect(jmespath.validate('foo.').valid).toBe(false);
    expect(jmespath.validate('foo.').error).toBeDefined();
    expect(jmespath.validate(123 as unknown as string).valid).toBe(false);
  });

  it('validates expressions against security options', () => {
    expect(jmespath.validate('a.b.c', { maxDepth: 1 }).valid).toBe(false);
    expect(jmespath.validate('a.b.c', { maxDepth: 5 }).valid).toBe(true);
    expect(jmespath.validate('a.b.c', { maxNodes: 2 }).valid).toBe(false);
    expect(jmespath.validate('a.b.c', { maxNodes: 10 }).valid).toBe(true);
    expect(jmespath.validate('{a: b}', { maxNodes: 2 }).valid).toBe(false);
    expect(jmespath.validate('[a, b]', { maxNodes: 2 }).valid).toBe(false);
    expect(jmespath.validate('length(a)', { maxNodes: 1 }).valid).toBe(false);
    expect(jmespath.validate('to_string(@)', { disallowedFunctions: ['to_string'] }).valid).toBe(false);
    expect(jmespath.validate('to_string(@)', { allowedFunctions: ['length'] }).valid).toBe(false);
    expect(jmespath.validate('length(@)', { allowedFunctions: ['length'] }).valid).toBe(true);
    expect(jmespath.validate('[?to_string(a) == `""`]', { disallowedFunctions: ['to_string'] }).valid).toBe(false);
    expect(jmespath.validate('{k: to_string(a)}', { disallowedFunctions: ['to_string'] }).valid).toBe(false);
    expect(jmespath.validate('[to_string(a)]', { disallowedFunctions: ['to_string'] }).valid).toBe(false);
    expect(jmespath.validate('let $a = to_string(x) in $a', { disallowedFunctions: ['to_string'] }).valid).toBe(false);
    expect(jmespath.validate('a ? to_string(b) : c', { disallowedFunctions: ['to_string'] }).valid).toBe(false);
    expect(jmespath.validate('a ? b : to_string(c)', { disallowedFunctions: ['to_string'] }).valid).toBe(false);
    expect(jmespath.validate('let $a = b in $a', { maxNodes: 3 }).valid).toBe(false);
  });
});
