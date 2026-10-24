import { JSONValue } from './JSON.type';

type NormalizePath<S extends string> = S extends `${infer Pre}[${infer Idx}]${infer Post}`
  ? NormalizePath<Pre extends '' ? `${Idx}${Post}` : `${Pre}.${Idx}${Post}`>
  : S;

type Split<S extends string> = S extends `${infer Head}.${infer Tail}` ? [Unquote<Head>, ...Split<Tail>] : [Unquote<S>];

type Unquote<S extends string> = S extends `"${infer Inner}"` ? Inner : S;

type IsSpecialExpression<P extends string> =
  P extends `${string}${'|' | '?' | '{' | '(' | '@' | '&' | '+' | '-' | '/' | '%' | '!'}${string}` ? true : false;

type ResolvePath<T, Segments extends string[]> = Segments extends [
  infer Head extends string,
  ...infer Tail extends string[],
]
  ? Head extends '*'
    ? T extends (infer E)[]
      ? ResolvePath<E, Tail>[]
      : JSONValue
    : T extends (infer E)[]
      ? Head extends `${number}`
        ? ResolvePath<E, Tail>
        : JSONValue
      : T extends object
        ? Head extends keyof T
          ? undefined extends T[Head]
            ? ResolvePath<NonNullable<T[Head]>, Tail> | null
            : ResolvePath<NonNullable<T[Head]>, Tail>
          : JSONValue
        : JSONValue
  : T;

export type PathValue<T, P extends string> = string extends P
  ? JSONValue
  : IsSpecialExpression<P> extends true
    ? JSONValue
    : ResolvePath<T, Split<NormalizePath<P>>>;
