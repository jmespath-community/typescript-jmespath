# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.4.0]: https://github.com/jmespath-community/typescript-jmespath/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/jmespath-community/typescript-jmespath/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/jmespath-community/typescript-jmespath/compare/v1.1.5...v1.2.0
