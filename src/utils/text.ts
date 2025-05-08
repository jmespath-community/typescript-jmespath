export class Text {
  private _text: string;
  constructor(text: string) {
    this._text = text;
  }

  public get string(): string {
    return this._text;
  }

  public get length(): number {
    return this.codePoints.length;
  }

  public compareTo(other: string): number {
    return Text.compare(this, new Text(other));
  }

  public static get comparer(): (lhs: string, rhs: string) => number {
    const stringComparer = (left: string, right: string): number => {
      return new Text(left).compareTo(right);
    };
    return stringComparer;
  }

  public static compare(left: Text, right: Text): number {
    const leftCp = left.codePoints;
    const rightCp = right.codePoints;
    for (let index = 0; index < Math.min(leftCp.length, rightCp.length); index++) {
      if (leftCp[index] === rightCp[index]) {
        continue;
      }
      return leftCp[index] - rightCp[index] > 0 ? 1 : -1;
    }
    return leftCp.length - rightCp.length > 0 ? 1 : -1;
  }

  public reverse(): string {
    return String.fromCodePoint(...this.codePoints.reverse());
  }

  private get codePoints(): number[] {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    // biome-ignore lint: lint/style/noNonNullAssertion
    const array = [...this._text].map(s => s.codePointAt(0)!);
    return array;
  }
}
