export const compareStrings = (a: string, b: string): number => {
  if (a === b) {
    return 0;
  }
  const itA = a[Symbol.iterator]();
  const itB = b[Symbol.iterator]();
  while (true) {
    const nextA = itA.next();
    const nextB = itB.next();
    if (nextA.done || nextB.done) {
      return nextA.done && nextB.done ? 0 : nextA.done ? -1 : 1;
    }
    if (nextA.value !== nextB.value) {
      // biome-ignore lint/style/noNonNullAssertion: Non-done string iterator yields single-character string
      return nextA.value.codePointAt(0)! > nextB.value.codePointAt(0)! ? 1 : -1;
    }
  }
};

export class Text {
  constructor(public string: string) {}
  get length(): number {
    return [...this.string].length;
  }
  compareTo(other: string): number {
    return compareStrings(this.string, other);
  }
  static comparer = compareStrings;
  static compareStrings = compareStrings;
}
