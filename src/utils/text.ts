import { countCodePoints } from './strings';

export const compareStrings = (a: string, b: string): number => {
  if (a === b) {
    return 0;
  }
  // Compare code points in place; iterator-based comparison allocates per code point.
  let ia = 0;
  let ib = 0;
  while (ia < a.length && ib < b.length) {
    const cpA = a.codePointAt(ia) as number;
    const cpB = b.codePointAt(ib) as number;
    if (cpA !== cpB) {
      return cpA > cpB ? 1 : -1;
    }
    const width = cpA > 0xffff ? 2 : 1;
    ia += width;
    ib += width;
  }
  // A consumed cursor means that side ran out of code points first: the shorter
  // string is the smaller one, and only equal lengths tie.
  const aDone = ia >= a.length;
  const bDone = ib >= b.length;
  if (aDone && bDone) {
    return 0;
  }
  return aDone ? -1 : 1;
};

export class Text {
  constructor(public string: string) {}
  get length(): number {
    return countCodePoints(this.string);
  }
  compareTo(other: string): number {
    return compareStrings(this.string, other);
  }
  static comparer = compareStrings;
}
