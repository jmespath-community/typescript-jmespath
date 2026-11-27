import { describe, expect, it } from 'vitest';
import jmespath from '../src';
import { expectError } from './error.utils';

/**
 * Three behaviors stay self-contradictory upstream, and the compliance submodule
 * (`jmespath.test` at `507e011`) has no row for any of them — measured over every
 * case in `test/compliance/tests`: no multi-select against a literal `null` document,
 * no `max_by` row with a string-valued sort key, no heterogeneous `sort` row. This
 * implementation resolves each contradiction one way; these pins name that reading so
 * a later change cannot quietly reach for the stale row.
 *
 * Line references below are relative to the pinned spec commit:
 * https://github.com/jmespath-community/jmespath.spec/blob/bb4a12c5cad990cae3a83491834c447aadc3ceba
 */
describe('Pins readings where the upstream spec contradicts itself', () => {
  it('sort() follows its signature rather than its own heterogeneous rows', () => {
    // signature: `type: ['array[number]', 'array[string]']` (functions/sort.yml#L6)
    // same file, contradictory rows:
    //   test2 (L27-L30):  context: [false, [], !!null '']  returns: [[], !!null '', false]
    //   test11 (L75-L78): args: [array]                    error: invalid-type
    expectError(() => jmespath.search([false, [], null], 'sort(@)'), 'invalid-type');
    expectError(() => jmespath.search({ a: 1 }, 'sort(@)'), 'invalid-type');
    // Signature-conformant input still sorts, so the guard is about the element type only.
    expect(jmespath.search([3, 1, 2], 'sort(@)')).toEqual([1, 2, 3]);
    expect(jmespath.search(['c', 'a'], 'sort(@)')).toEqual(['a', 'c']);
  });

  it('max_by() accepts a string sort key, as its test6 row does', () => {
    // signature: `type: [expression->number, expression->string]` (functions/max_by.yml#L9)
    // one expression, two outcomes in the same file:
    //   test6 (L31-L34): args: [people, '&age_str']  returns: {age: 50, age_str: '50', ...}
    //   test3 (L47-L50): args: [people, '&age_str']  error: invalid-type
    const people = {
      people: [
        { age: 20, age_str: '20' },
        { age: 50, age_str: '50' },
      ],
    };
    expect(jmespath.search(people, 'max_by(people, &age_str)')).toEqual({ age: 50, age_str: '50' });
    // A boolean key still raises, so this is the string arm of the signature, not a lax check.
    expectError(
      () =>
        jmespath.search(
          {
            people: [
              { age: 20, flag: false },
              { age: 50, flag: true },
            ],
          },
          'max_by(people, &flag)',
        ),
      'invalid-type',
    );
  });

  it('multi-select evaluates its children on a null document, unlike a sub-expression', () => {
    // GRAMMAR.ABNF#L81 states the short-circuit for a sub-expression:
    //   "if left-evaluation is `null` then result = `null`"
    // the multi-select-list rule (GRAMMAR.ABNF#L385-L386) states no such thing:
    //   "the evaluated expression will return `[evaluate(expr-1), evaluate(expr-2), ...,
    //    evaluate(expr-n)]`"
    expect(jmespath.search(null, '[a, b]')).toEqual([null, null]);
    expect(jmespath.search(null, '{x: a, y: b}')).toEqual({ x: null, y: null });
    // Children are really evaluated: a failing child raises instead of yielding a null slot.
    expectError(() => jmespath.search(null, '{x: length(@)}'), 'invalid-type');
    // Contrast: the documented short-circuit does apply one rule earlier.
    expect(jmespath.search(null, 'a.b')).toBeNull();
  });
});
