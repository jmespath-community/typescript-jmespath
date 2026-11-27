import type { Options } from './Parser.type';

/**
 * `maxDepth`, `maxNodes` and `maxOutputSize` are counters compared against the parser
 * depth, AST node count and collected output. An unusable value (`NaN`, `Infinity`,
 * `'20'`, `{}`, `null`) makes those comparisons silently false — switching the guard
 * off — or silently true — rejecting every query — instead of failing. Every public
 * entry point validates them once here, so the guards keep their meaning, rejecting
 * the same way `limit` and `timeoutMs` already do in `searchStream()`. A missing
 * options object (`null` from untyped callers included) still means unset.
 */
export function validateGuardrailOptions(options?: Options): void {
  if (!options) {
    return;
  }
  checkGuardrail('maxDepth', options.maxDepth);
  checkGuardrail('maxNodes', options.maxNodes);
  checkGuardrail('maxOutputSize', options.maxOutputSize);
}

function checkGuardrail(name: 'maxDepth' | 'maxNodes' | 'maxOutputSize', value: unknown): void {
  if (value !== undefined && (typeof value !== 'number' || value < 0 || !Number.isSafeInteger(value))) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
}
