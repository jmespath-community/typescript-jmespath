export class Text {
  constructor(private _text: string) {}

  public get string(): string {
    return this._text;
  }

  public get length(): number {
    return [...this._text].length;
  }

  public compareTo(other: string): number {
    return Text.compare(this, new Text(other));
  }

  public static comparer = (lhs: string, rhs: string): number => {
    return Text.compareStrings(lhs, rhs);
  };

  public static compare(left: Text, right: Text): number {
    return Text.compareStrings(left._text, right._text);
  }

  public static compareStrings(a: string, b: string): number {
    if (a === b) {
      return 0;
    }
    const aChars = [...a];
    const bChars = [...b];
    const len = Math.min(aChars.length, bChars.length);
    for (let index = 0; index < len; index++) {
      if (aChars[index] !== bChars[index]) {
        // biome-ignore lint/style/noNonNullAssertion: Character from non-empty string always has code point
        return aChars[index].codePointAt(0)! > bChars[index].codePointAt(0)! ? 1 : -1;
      }
    }
    return aChars.length > bChars.length ? 1 : -1;
  }

  public reverse(): string {
    return [...this._text].reverse().join('');
  }
}
