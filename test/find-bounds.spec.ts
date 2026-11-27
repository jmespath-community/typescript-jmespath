import { describe, expect, it } from 'vitest';
import { ensureInteger } from '../src/utils';
import { findFirst, findLast } from '../src/utils/strings';

/**
 * `find_first`/`find_last` resolve their bounds in code-point units. The engine-backed
 * search (`indexOf`/`lastIndexOf` plus a deferred code-point conversion) must agree with
 * a plain scan over `[...subject]` for every subject, needle and bound pair — including
 * subjects and needles holding unpaired surrogates, where no unit-level match is legal.
 */
const reference = (fromEnd: boolean, subject: string, sub: string, start?: number, end?: number): number | null => {
  if (!subject || !sub) {
    return null;
  }
  const points = [...subject];
  const needle = [...sub];
  let s = ensureInteger(start ?? 0);
  if (s < 0) {
    s = Math.max(0, points.length + s);
  }
  let e = ensureInteger(end ?? points.length);
  if (e < 0) {
    e = Math.max(0, points.length + e);
  }
  e = Math.min(points.length, e);
  let found: number | null = null;
  for (let i = s; i + needle.length <= e; i++) {
    let hit = true;
    for (let j = 0; j < needle.length; j++) {
      if (points[i + j] !== needle[j]) {
        hit = false;
        break;
      }
    }
    if (hit) {
      if (!fromEnd) {
        return i;
      }
      found = i;
    }
  }
  return found;
};

// Errors are part of the contract ("expected to be integers"), so both sides are
// compared as a settled outcome rather than as a return value.
const settle = (run: () => number | null): string => {
  try {
    return JSON.stringify({ ok: run() });
  } catch (error) {
    return JSON.stringify({ err: (error as Error).message });
  }
};

// Surrogates are printed as escapes so a failing case stays copy-pasteable.
const caseLabel = (name: string, subject: string, sub: string, start?: number, end?: number): string =>
  `${name}(${JSON.stringify(subject)}, ${JSON.stringify(sub)}, ${start}, ${end})`;

const compare = (subject: string, sub: string, start?: number, end?: number): void => {
  expect(
    settle(() => findFirst(subject, sub, start, end)),
    caseLabel('find_first', subject, sub, start, end),
  ).toBe(settle(() => reference(false, subject, sub, start, end)));
  expect(
    settle(() => findLast(subject, sub, start, end)),
    caseLabel('find_last', subject, sub, start, end),
  ).toBe(settle(() => reference(true, subject, sub, start, end)));
};

/** Deterministic generator; a fixed seed keeps a failure reproducible. */
const randomInt = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return (max: number) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) % max;
  };
};

describe('find_first()/find_last() bounded search', () => {
  // Tokens mix BMP, astral, and lone (unpaired) surrogates, so the corpus contains
  // well-formed and malformed subjects and needles alike.
  const tokens = ['a', 'b', 'ab', 'ba', '\u{10000}', '\u{10000}a', '\uD800', '\uDC00', '\uD800\uDC00'];
  // Out-of-range, negative, empty, inverted, and invalid bounds, plus the code-point
  // indices of every token boundary so hits land exactly on the edges.
  const bounds = (length: number, pick: (max: number) => number): number | undefined => {
    const choices: (number | undefined)[] = [
      undefined,
      0,
      1,
      length - 1,
      length,
      length + 1,
      -1,
      -length,
      -(length + 1),
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ];
    for (let i = 0; i < 3; i++) {
      choices.push(pick(length + 2) - 1);
    }
    return choices[pick(choices.length)];
  };

  it('matches a code-point scan over randomised subjects, needles and bounds', () => {
    const pick = randomInt(0x5eed);
    let comparisons = 0;
    for (let iteration = 0; iteration < 500; iteration++) {
      let subject = '';
      for (let i = pick(6); i >= 0; i--) {
        subject += tokens[pick(tokens.length)];
      }
      const sub = tokens[pick(tokens.length)];
      const points = [...subject].length;
      compare(subject, sub, bounds(points, pick), bounds(points, pick));
      compare(subject, sub.repeat(2), bounds(points, pick), bounds(points, pick));
      comparisons += 4;
    }
    expect(comparisons).toBe(2000);
  });

  it('keeps every documented edge case in step with the scan', () => {
    // Loose hint: the code-point start sits past the UTF-16 offset the hint implies.
    const astral = '\u{10000}a'.repeat(2_000);
    expect(findFirst(astral, 'a', 3_000)).toBe(reference(false, astral, 'a', 3_000));
    expect(findLast(astral, 'a', 0, 3_000)).toBe(reference(true, astral, 'a', 0, 3_000));
    // Window narrower than the needle, in both directions and with a clamped end.
    expect(findFirst('\u{10000}ab', '\u{10000}a', 1, 2)).toBeNull();
    expect(findLast('\u{10000}ab', '\u{10000}a', 1, 2)).toBeNull();
    expect(findFirst('abc', 'bc', 0, 99)).toBe(1);
    expect(findLast('abc', 'bc', 0, 99)).toBe(1);
    // Bounds are validated before the window is used, whatever the needle holds.
    for (const bad of [1.5, Number.NaN, Number.POSITIVE_INFINITY, -1.5]) {
      compare('abc', 'b', bad, undefined);
      compare('abc', '𐀀', undefined, bad);
      compare('a𐀀', '\uD800', bad, bad);
    }
  });
});
