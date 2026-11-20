import { describe, expect, it } from 'vitest';
import jmespath, { compileQuery, type JSONValue, search, searchStream } from '../src';

async function collectStream<T = JSONValue>(gen: AsyncGenerator<T, void, unknown>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of gen) {
    items.push(item);
  }
  return items;
}

describe('Cross-cutting regression invariants', () => {
  describe('Projection algebra and null-filtering (JEP-10)', () => {
    const arrayDatasets: JSONValue[] = [
      [],
      [null],
      [null, 1, null, 2, null],
      [0, false, '', [], {}, null],
      [{ a: 1 }, null, { a: null }, { a: 0 }, { a: false }, { a: '' }, {}],
    ];

    const projectionExpressions = ['[*]', '[]', '[?`true`]', '[?@ == @]', '[0:10]', '[:]', '[::1]', '[::-1]', '[::2]'];

    it.each(projectionExpressions)('projection %s never collects null elements and preserves falsy values', expr => {
      for (const dataset of arrayDatasets) {
        const result = search(dataset, expr) as JSONValue[];
        expect(Array.isArray(result)).toBe(true);
        expect(result).not.toContain(null);

        // Identity composition invariants: P == P | [*] == P.not_null(@)
        expect(result).toEqual(search(dataset, `${expr} | [*]`));
        expect(result).toEqual(search(dataset, `${expr}.not_null(@)`));
        expect(search(dataset, `length(${expr})`)).toBe(result.length);
      }
    });

    it('value projection * drops null values and agrees with @.*, * | [*], and *.not_null(@)', () => {
      const objects: JSONValue[] = [
        {},
        { a: null, b: 1, c: null, d: 0, e: false, f: '' },
        { x: { k: 1 }, y: null, z: { k: null } },
      ];
      for (const obj of objects) {
        const direct = search(obj, '*') as JSONValue[];
        expect(direct).not.toContain(null);
        expect(direct).toEqual(search(obj, '@.*'));
        expect(direct).toEqual(search(obj, '* | [*]'));
        expect(direct).toEqual(search(obj, '*.not_null(@)'));
        expect(search(obj, 'length(*)')).toBe(direct.length);
      }
    });
  });

  describe('Fast-path vs general-path projection equivalence', () => {
    const records: JSONValue = [
      null,
      { a: 1, b: 'x', active: true },
      { a: null, b: 'y', active: true },
      { a: 0, b: '', active: false },
      { b: 'missing-a', active: true },
      null,
    ];

    // Compares specialized fast-path RHS nodes (Identity, Field)
    // against semantically identical general-path Function RHS expressions.
    const equivalencePairs: [string, string][] = [
      ['[*]', '[*].not_null(@)'],
      ['[*].a', '[*].not_null(a)'],
      ['[:4]', '[:4].not_null(@)'],
      ['[:4].a', '[:4].not_null(a)'],
      ['[::-1]', '[::-1].not_null(@)'],
      ['[::-1].a', '[::-1].not_null(a)'],
      ['[?`true`]', '[?`true`].not_null(@)'],
      ['[?`true`].a', '[?`true`].not_null(a)'],
      ['[?active]', '[?active].not_null(@)'],
      ['[?active].a', '[?active].not_null(a)'],
    ];

    it.each(equivalencePairs)('fast path %s matches general path %s in search and searchStream', async (fast, slow) => {
      const fastResult = search(records, fast);
      const slowResult = search(records, slow);
      expect(fastResult).toEqual(slowResult);

      const fastStream = await collectStream(searchStream(records as JSONValue[], fast, { parseJson: false }));
      const slowStream = await collectStream(searchStream(records as JSONValue[], slow, { parseJson: false }));
      expect(fastStream).toEqual(fastResult);
      expect(slowStream).toEqual(slowResult);
    });
  });

  describe('Differential equivalence between search() and searchStream()', () => {
    const datasets: JSONValue[][] = [
      [null, 1, null, 2, 0, false, ''],
      [
        { name: 'Alice', score: 95, active: true, tags: ['a', 'b'] },
        null,
        { name: 'Bob', score: 70, active: false, tags: [] },
        { name: null, score: 0, active: true, tags: null },
        { name: 'Dana', score: 88, active: true, tags: ['c'] },
      ],
    ];

    const arrayExpressions = [
      '[*]',
      '[:3]',
      '[1:4]',
      '[::2]',
      '[-3:]',
      '[::-1]',
      '[1:3:-1]',
      '[]',
      '[?`true`]',
      '[?@ != `null`]',
      '[?active]',
      '[*].name',
      '[:3].name',
      '[-2:].name',
      '[::-1].name',
      '[?active].name',
      '[?active].to_string(score)',
      '[*].tags[]',
      '[-2:].tags[]',
      '[:4] | [?active] | [*].name',
    ];

    it.each(arrayExpressions)('searchStream matches search for %s across array datasets', async expression => {
      for (const data of datasets) {
        const expected = search(data, expression) as JSONValue[];
        const streamed = await collectStream(searchStream(data, expression, { parseJson: false }));
        const compiledStreamed = await collectStream(compileQuery(expression).searchStream(data, { parseJson: false }));
        expect(streamed).toEqual(expected);
        expect(compiledStreamed).toEqual(expected);
      }
    });
  });

  describe('Object.prototype isolation and own-property safety', () => {
    const protoKeys = ['toString', 'valueOf', 'constructor', 'hasOwnProperty', '__proto__'];

    it.each(protoKeys)('ignores inherited Object.prototype.%s on empty objects', key => {
      expect(search({}, key)).toBeNull();
      expect(search([{}], `[*].${key}`)).toEqual([]);
      expect(search([{}], `[?\`true\`].${key}`)).toEqual([]);
      expect(search({ a: {} }, `*.${key}`)).toEqual([]);
    });

    it('preserves own __proto__ keys without mutating object prototypes', () => {
      const hash = search<Record<string, unknown>>({}, '{ "__proto__": { a: `1` }, normal: `2` }');
      expect(Object.getPrototypeOf(hash)).toBe(Object.prototype);
      expect(Object.prototype.hasOwnProperty.call(hash, '__proto__')).toBe(true);
      expect(hash['__proto__']).toEqual({ a: 1 });
      expect(hash.normal).toBe(2);

      const bound = search({}, 'let $__proto__ = `42` in $__proto__');
      expect(bound).toBe(42);

      const fromItems = search<Record<string, unknown>>([['__proto__', 'safe']], 'from_items(@)');
      expect(Object.getPrototypeOf(fromItems)).toBe(Object.prototype);
      expect(Object.prototype.hasOwnProperty.call(fromItems, '__proto__')).toBe(true);
      expect(fromItems['__proto__']).toBe('safe');

      const grouped = search<Record<string, unknown>>([{ k: '__proto__' }], 'group_by(@, &k)');
      expect(Object.getPrototypeOf(grouped)).toBe(Object.prototype);
      expect(Object.prototype.hasOwnProperty.call(grouped, '__proto__')).toBe(true);
    });
  });

  describe('Unicode code-point consistency across string operations', () => {
    it('indexes, slices, measures, pads, trims, and searches by code point rather than UTF-16 code unit', () => {
      const emojiStr = '😀a😁b😂';
      expect(search(emojiStr, 'length(@)')).toBe(5);
      expect(search(emojiStr, '[0:3]')).toBe('😀a😁');
      expect(search(emojiStr, '[::-1]')).toBe('😂b😁a😀');
      expect(search(emojiStr, 'reverse(@)')).toBe('😂b😁a😀');
      expect(search(emojiStr, "find_first(@, '😁')")).toBe(2);
      expect(search(emojiStr, "find_last(@, '😂')")).toBe(4);
      expect(search(emojiStr, "trim(@, '😀😂')")).toBe('a😁b');
      expect(search('😀', "pad_left(@, `3`, '😁')")).toBe('😁😁😀');
      expect(search('😀', "pad_right(@, `3`, '😁')")).toBe('😀😁😁');
      expect(search('😀a😁', "split(@, '')")).toEqual(['😀', 'a', '😁']);
    });
  });
});
