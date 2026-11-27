# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Streaming**:
  - Honored `parseJson: false` for `Uint8Array` chunks so binary and string chunks with the same payload yield the same raw item ([`#183`](https://github.com/jmespath-community/typescript-jmespath/pull/183)).
  - Shared the `timeoutMs` deadline across nested `evaluateStreamNode` stages and enforced it on stalled `iterator.next()` calls ([`#202`](https://github.com/jmespath-community/typescript-jmespath/pull/202)).
  - Fell back to whole-input evaluation for root-referencing expressions and non-streamable pipe left-hand sides ([`#203`](https://github.com/jmespath-community/typescript-jmespath/pull/203)).
  - Cancelled `getReader()` fallback streams on early exit, flushed trailing incomplete UTF-8 bytes at EOF, validated `limit` as an integer, and preserved `compileQuery.searchStream` options when `undefined` overrides are passed ([`#204`](https://github.com/jmespath-community/typescript-jmespath/pull/204)).
  - Preserved `let` scopes in stream built-in functions and enforced `maxNodes` / `maxDepth` on pre-parsed ASTs and nested stream stages ([`#206`](https://github.com/jmespath-community/typescript-jmespath/pull/206)).
- **Lexer, Parser & Interpreter**:
  - Rejected `=` outside `let` bindings ([`#194`](https://github.com/jmespath-community/typescript-jmespath/pull/194)) and trailing commas in function argument lists ([`#200`](https://github.com/jmespath-community/typescript-jmespath/pull/200)) with `ParserError`.
  - Stopped `consumeNumber` from consuming `-` as part of number digits ([`#197`](https://github.com/jmespath-community/typescript-jmespath/pull/197)).
  - Gave unary `+` / `-` higher precedence than multiplicative operators ([`#207`](https://github.com/jmespath-community/typescript-jmespath/pull/207)).
  - Accepted compiled `ExpressionNode` ASTs in `search()` ([`#201`](https://github.com/jmespath-community/typescript-jmespath/pull/201)), isolated re-entrant `search()` state, and enforced `allowedFunctions` / `disallowedFunctions` in `compileQuery()` and string `search()` ([`#208`](https://github.com/jmespath-community/typescript-jmespath/pull/208)).
  - Aligned `%` with `//` on floor semantics so `a === (a // b) * b + (a % b)` holds when the operands differ in sign, and documented `//` rounding its IEEE-754 quotient beyond `2**53` as the contract ([`#225`](https://github.com/jmespath-community/typescript-jmespath/pull/225), [`#215`](https://github.com/jmespath-community/typescript-jmespath/issues/215)).
- **Runtime & Built-in Functions**:
  - Prevented input `{expref: ...}` objects from being treated as expression references and guarded built-in function lookups against `Object.prototype` keys ([`#193`](https://github.com/jmespath-community/typescript-jmespath/pull/193)).
  - Used deep equality in `contains()` for array elements and replaced spread arguments in `max()` / `min()` with a loop to avoid stack overflows ([`#196`](https://github.com/jmespath-community/typescript-jmespath/pull/196)).
  - Rejected non-finite integers in `ensureInteger()` / `ensurePositiveInteger()` and bounded `pad_left()` / `pad_right()` width before allocation ([`#199`](https://github.com/jmespath-community/typescript-jmespath/pull/199)).
  - Captured `let` lexical scopes in `ExpressionReference` values and returned `null` for overflowing `to_number()` inputs ([`#210`](https://github.com/jmespath-community/typescript-jmespath/pull/210)).
  - Returned code point offsets from `find_first()` / `find_last()` when `sub` is half of a surrogate pair ([`#184`](https://github.com/jmespath-community/typescript-jmespath/pull/184)).
  - Padded empty subjects in `pad_left()` / `pad_right()` to the requested width per JEP-14 ([`#185`](https://github.com/jmespath-community/typescript-jmespath/pull/185)).
  - Excluded U+FEFF from default `trim()` / `trim_left()` / `trim_right()` whitespace ([`#185`](https://github.com/jmespath-community/typescript-jmespath/pull/185)) and replaced regex-based trimming with a linear code-point scan ([`#191`](https://github.com/jmespath-community/typescript-jmespath/pull/191)).
- **Packaging, Types & CLI**:
  - Removed `NodeJS.ReadableStream` from public `StreamSource` types so consumers without `@types/node` compile with `skipLibCheck: false` ([`#192`](https://github.com/jmespath-community/typescript-jmespath/pull/192)).
  - Handled CLI errors cleanly on `stderr`, rejected extra positional arguments, and removed the side-effecting `./cli` package export ([`#195`](https://github.com/jmespath-community/typescript-jmespath/pull/195)).

### Performance
- Reused `Runtime` across `TreeInterpreter.withScope()` calls and skipped redundant per-call signature validation ([`#205`](https://github.com/jmespath-community/typescript-jmespath/pull/205)).
- Fast-pathed primitive `contains()` lookups and avoided `exprefScopes` writes outside `let` scopes ([`#212`](https://github.com/jmespath-community/typescript-jmespath/pull/212)).

### Documentation
- Clarified that `searchStream` `limit` only terminates streamable expressions early ([`#186`](https://github.com/jmespath-community/typescript-jmespath/pull/186)).
- Corrected the 1.5.0 entry for zero-argument `merge()`, which returns `{}` ([`#186`](https://github.com/jmespath-community/typescript-jmespath/pull/186)).
- Fixed the README ternary truthiness example (`0` is truthy) and added `{ override: true }` to the second `divide` registration sample ([`#198`](https://github.com/jmespath-community/typescript-jmespath/pull/198)).

## [1.5.1] - 2026-11-20

### Fixed
- **Parser, Interpreter & Streaming**:
  - Restored `Projection` wrapping for standalone slice expressions so `null` elements are dropped per JEP-10 (`[0:3]`, `[::-1]`), and dropped `null` elements in `Stream.ts` `FilterProjection` `Identity`/`Current` fast paths ([#175](https://github.com/jmespath-community/typescript-jmespath/pull/175), [#174](https://github.com/jmespath-community/typescript-jmespath/issues/174); reported by [@bardrop](https://github.com/bardrop)).
  - Restricted `isStreamableNode` for slice-based projections to `Identity` and `Current` left targets so non-root slice projections such as `items[0:2].name` fall back to `drainAndEvaluate` ([#175](https://github.com/jmespath-community/typescript-jmespath/pull/175)).
  - Guarded `Stream.ts` `Field` fast paths with `Object.prototype.hasOwnProperty.call` to prevent `Object.prototype` property leakage ([#179](https://github.com/jmespath-community/typescript-jmespath/pull/179)).
- **Lexer & Built-in Functions**:
  - Rejected unclosed backtick JSON literals with `LexerError` and unescaped all escaped backticks within literals ([#178](https://github.com/jmespath-community/typescript-jmespath/pull/178)).
  - Preserved trailing delimiter matches with finite `count` and split empty search strings by Unicode code points in `replace()` ([#176](https://github.com/jmespath-community/typescript-jmespath/pull/176)).
  - Avoided appending a spurious trailing empty string in `split()` when `count` exceeds the number of delimiter matches ([#177](https://github.com/jmespath-community/typescript-jmespath/pull/177)).
  - Preserved `"__proto__"` as an own data property when merging objects in `merge()` ([#179](https://github.com/jmespath-community/typescript-jmespath/pull/179)).
- **Packaging**:
  - Fixed browser-targeted CommonJS imports resolving to the IIFE bundle instead of `index.cjs`; the legacy `browser` field and `browser.default` now resolve to `index.esm.js`, while `unpkg` and `jsdelivr` still serve the script-tag bundle ([#172](https://github.com/jmespath-community/typescript-jmespath/pull/172), [#167](https://github.com/jmespath-community/typescript-jmespath/issues/167)).
  - Resolved conditional TypeScript declarations for CJS (`import` vs `require` `.d.cts`) and removed install-time scripts ([#166](https://github.com/jmespath-community/typescript-jmespath/pull/166)).

## [1.5.0] - 2026-10-30

### Added
- Exported `ExpressionNode` and `ExpressionReference` types from root index module ([#144](https://github.com/jmespath-community/typescript-jmespath/pull/144)).
- Added dedicated `"./stream"` subpath export in `package.json` for isolated stream runtime consumption ([#114](https://github.com/jmespath-community/typescript-jmespath/pull/114)).

### Performance
- Enabled `"sideEffects": false` in `package.json` for enhanced bundler tree-shaking ([#114](https://github.com/jmespath-community/typescript-jmespath/pull/114)).
- Reduced core bundle size and streamlined string utilities, extreme selectors, and AST node dispatch ([#114](https://github.com/jmespath-community/typescript-jmespath/pull/114), [#119](https://github.com/jmespath-community/typescript-jmespath/pull/119), [#120](https://github.com/jmespath-community/typescript-jmespath/pull/120), [#129](https://github.com/jmespath-community/typescript-jmespath/pull/129), [#130](https://github.com/jmespath-community/typescript-jmespath/pull/130)).

### Fixed
- **Lexer & Parser**:
  - Rejected unclosed raw string literals (e.g. `'unterminated`) with a syntax error instead of silently accepting ([#143](https://github.com/jmespath-community/typescript-jmespath/pull/143), [#140](https://github.com/jmespath-community/typescript-jmespath/issues/140)).
  - Required commas between expressions in multi-select lists per JEP-12 ([#117](https://github.com/jmespath-community/typescript-jmespath/pull/117), [#108](https://github.com/jmespath-community/typescript-jmespath/issues/108)).
  - Enforced `DEFAULT_MAX_DEPTH` limit during parsing and AST evaluation ([#117](https://github.com/jmespath-community/typescript-jmespath/pull/117), [#128](https://github.com/jmespath-community/typescript-jmespath/pull/128), [#124](https://github.com/jmespath-community/typescript-jmespath/issues/124)).
- **Runtime Built-ins**:
  - Enforced divide-by-zero error (`not-a-number: divide by zero`) on modulo by zero (`10 % 0`) ([#143](https://github.com/jmespath-community/typescript-jmespath/pull/143), [#141](https://github.com/jmespath-community/typescript-jmespath/issues/141)).
  - Fixed Unicode surrogate pair handling in `trim()`, `trim_left()`, and `trim_right()` for astral code points ([#138](https://github.com/jmespath-community/typescript-jmespath/pull/138), [#135](https://github.com/jmespath-community/typescript-jmespath/issues/135)).
  - Enforced key type validation in `sort_by()` for 1-element arrays ([#138](https://github.com/jmespath-community/typescript-jmespath/pull/138), [#136](https://github.com/jmespath-community/typescript-jmespath/issues/136)).
  - Supported zero-argument `merge()`, which returns `{}` ([#134](https://github.com/jmespath-community/typescript-jmespath/pull/134), [#132](https://github.com/jmespath-community/typescript-jmespath/issues/132)).
  - Enforced strict variadic argument type checking in function signatures ([#134](https://github.com/jmespath-community/typescript-jmespath/pull/134), [#133](https://github.com/jmespath-community/typescript-jmespath/issues/133)).
  - Fixed repeated pattern replacement in `replace()` and slice bounds in `find_first()` / `find_last()` ([#127](https://github.com/jmespath-community/typescript-jmespath/pull/127), [#123](https://github.com/jmespath-community/typescript-jmespath/issues/123)).
  - Corrected spec compliance for `group_by`, `max_by`, `min_by`, `contains`, `min`, `max`, and validated `to_number` JSON number syntax ([#111](https://github.com/jmespath-community/typescript-jmespath/pull/111), [#116](https://github.com/jmespath-community/typescript-jmespath/pull/116), [#105](https://github.com/jmespath-community/typescript-jmespath/issues/105), [#107](https://github.com/jmespath-community/typescript-jmespath/issues/107)).
- **TreeInterpreter & Scoping**:
  - Prevented prototype mutation and preserved `__proto__` property keys in `MultiSelectHash` and `let` bindings ([#143](https://github.com/jmespath-community/typescript-jmespath/pull/143), [#142](https://github.com/jmespath-community/typescript-jmespath/issues/142)).
  - Prevented `Object.prototype` method leakage on field lookups ([#125](https://github.com/jmespath-community/typescript-jmespath/pull/125), [#121](https://github.com/jmespath-community/typescript-jmespath/issues/121)).
  - Fixed falsy value lookups in nested `let` expressions and resolved higher-order lexical scope propagation ([#126](https://github.com/jmespath-community/typescript-jmespath/pull/126), [#122](https://github.com/jmespath-community/typescript-jmespath/issues/122), [#131](https://github.com/jmespath-community/typescript-jmespath/issues/131)).
- **Streaming**:
  - Prevented raw input leakage on non-streamable projections and filters in `searchStream()` ([#138](https://github.com/jmespath-community/typescript-jmespath/pull/138), [#137](https://github.com/jmespath-community/typescript-jmespath/issues/137), [#139](https://github.com/jmespath-community/typescript-jmespath/pull/139)).
  - Enforced `maxOutputSize` checks prior to yielding elements in streams ([#128](https://github.com/jmespath-community/typescript-jmespath/pull/128)).
  - Supported scalar index expressions and zero-limit boundaries in stream evaluation ([#115](https://github.com/jmespath-community/typescript-jmespath/pull/115), [#106](https://github.com/jmespath-community/typescript-jmespath/issues/106)).

## [1.4.1] - 2026-10-26

### Fixed
- Restored named ESM exports (`import { search } from "@jmespath-community/jmespath"`) and TypeScript named declarations ([#112](https://github.com/jmespath-community/typescript-jmespath/pull/112)).
- Enforced rejection of repeated numbers in slice components ([#104](https://github.com/jmespath-community/typescript-jmespath/pull/104)).
- Preserved empty slices when striding over empty arrays ([#110](https://github.com/jmespath-community/typescript-jmespath/pull/110)).
- Hardened CI/CD release and test workflows with least-privilege OIDC tokens, pinned GitHub Action commit SHAs, reproducible `npm ci`, and enforced `--provenance` ([#112](https://github.com/jmespath-community/typescript-jmespath/pull/112)).

## [1.4.0] - 2026-10-24

### Added
- `searchStream`: Incremental evaluation over `AsyncIterable`, WHATWG `ReadableStream`, and Node.js streams ([#101](https://github.com/jmespath-community/typescript-jmespath/pull/101), [#69](https://github.com/jmespath-community/typescript-jmespath/issues/69)).
- `compileQuery`: Added `searchStream()` method to compiled queries ([#101](https://github.com/jmespath-community/typescript-jmespath/pull/101)).
- `search`: Compile-time return type inference for literal path queries via `PathValue` ([#98](https://github.com/jmespath-community/typescript-jmespath/pull/98)).
- `search`: Added `options` for execution limits (`maxDepth`, `maxNodes`, `maxOutputSize`, `timeoutMs`, `allowedFunctions`, `disallowedFunctions`) ([#96](https://github.com/jmespath-community/typescript-jmespath/pull/96)).
- `validate`: Added non-throwing expression validation returning `{ valid, ast?, error? }` ([#97](https://github.com/jmespath-community/typescript-jmespath/pull/97)).
- `search`, `compileQuery`: Added generic type parameters `search<T, D>()` and `compileQuery<T, D>()` ([#96](https://github.com/jmespath-community/typescript-jmespath/pull/96)).

### Performance
- Optimized interpreter projections and filters with direct property extraction ([#95](https://github.com/jmespath-community/typescript-jmespath/pull/95)).
- Native `Array.prototype.slice` on slice nodes and pruned redundant projection wrappers ([#95](https://github.com/jmespath-community/typescript-jmespath/pull/95)).
- Bounded LRU cache for parsed ASTs in `search()` ([#95](https://github.com/jmespath-community/typescript-jmespath/pull/95)).
- Deduplicated lexer token dispatch and expression parsing loops ([#99](https://github.com/jmespath-community/typescript-jmespath/pull/99)).

### Fixed
- Replaced shell piping in CLI build artifact tests with `execFileSync` to fix Windows quoting and space issues ([#100](https://github.com/jmespath-community/typescript-jmespath/pull/100)).

## [1.3.0] - 2025-07-16

### Changed
- Upgraded to TypeScript 5.8 and Biome 2.x ([#58](https://github.com/jmespath-community/typescript-jmespath/pull/58), [#59](https://github.com/jmespath-community/typescript-jmespath/pull/59)).
- Lexer performance improvements and custom function registry enhancements ([#60](https://github.com/jmespath-community/typescript-jmespath/pull/60), [#61](https://github.com/jmespath-community/typescript-jmespath/pull/61)).

## [1.2.0] - 2025-07-13

### Added
- Added support for the ternary operator `? :` ([#50](https://github.com/jmespath-community/typescript-jmespath/pull/50)).
- Added CLI executable `jp` script ([#52](https://github.com/jmespath-community/typescript-jmespath/pull/52)).

### Changed
- Migrated linter and formatter to Biome ([#49](https://github.com/jmespath-community/typescript-jmespath/pull/49)).

[1.5.1]: https://github.com/jmespath-community/typescript-jmespath/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/jmespath-community/typescript-jmespath/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/jmespath-community/typescript-jmespath/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/jmespath-community/typescript-jmespath/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/jmespath-community/typescript-jmespath/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/jmespath-community/typescript-jmespath/compare/v1.1.5...v1.2.0
