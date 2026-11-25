import type { ExpressionNode } from './AST.type';
import type { JSONValue } from './JSON.type';
import Parser, { DEFAULT_MAX_DEPTH } from './Parser';
import type { Options } from './Parser.type';
import { TreeInterpreter, TreeInterpreterInstance } from './TreeInterpreter';
import { findDisallowedFunction, isExpressionNode, isFalse } from './utils';
import { countNodes } from './utils/ast';

export type StreamSource<T = unknown> = AsyncIterable<T> | Iterable<T> | ReadableStream<T>;

export interface StreamOptions extends Options {
  /**
   * If true, splits string chunks by newline and parses each line as JSON.
   * If 'auto', detects string lines that look like JSON objects/arrays.
   * If false, does not parse string chunks.
   * Defaults to 'auto'.
   */
  parseJson?: boolean | 'auto';

  /**
   * If true, array chunks emitted by the stream are flattened so their elements
   * are yielded individually.
   * Defaults to true.
   */
  flattenChunks?: boolean;

  /**
   * Maximum number of results to yield before ending stream evaluation early.
   */
  limit?: number;
}

/**
 * Converts any StreamSource (AsyncIterable, Iterable, or ReadableStream) into a standard AsyncGenerator.
 */
export async function* toAsyncIterable<T>(source: StreamSource<T>): AsyncGenerator<T, void, unknown> {
  if (source == null) {
    return;
  }
  if (typeof source !== 'object' && typeof source !== 'function') {
    throw new TypeError('Invalid stream source: expected AsyncIterable, Iterable, or ReadableStream');
  }
  // Check for Symbol.asyncIterator (AsyncIterable, Node Readable, modern ReadableStream)
  if (Symbol.asyncIterator in (source as AsyncIterable<T>)) {
    for await (const chunk of source as AsyncIterable<T>) {
      yield chunk;
    }
    return;
  }
  // Check for WHATWG ReadableStream via getReader()
  if (typeof (source as ReadableStream<T>).getReader === 'function') {
    const reader = (source as ReadableStream<T>).getReader();
    let readerDone = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          readerDone = true;
          break;
        }
        yield value;
      }
    } finally {
      if (!readerDone) {
        await reader.cancel?.().catch(() => {});
      }
      reader.releaseLock();
    }
    return;
  }
  // Check for Symbol.iterator (arrays, Sets, sync generators)
  if (Symbol.iterator in (source as Iterable<T>)) {
    for (const chunk of source as Iterable<T>) {
      yield chunk;
    }
    return;
  }
  throw new TypeError('Invalid stream source: expected AsyncIterable, Iterable, or ReadableStream');
}

function parseItem(str: string, parseJson: boolean | 'auto'): unknown {
  if (parseJson === true) {
    return JSON.parse(str);
  }
  if (parseJson === 'auto') {
    try {
      return JSON.parse(str);
    } catch {
      return str;
    }
  }
  return str;
}

/**
 * Normalizes input chunks into discrete JSON items, handling NDJSON splitting and array flattening.
 */
export async function* normalizeSource<T>(
  source: StreamSource<T>,
  options?: StreamOptions,
  deadline?: number,
): AsyncGenerator<unknown, void, unknown> {
  const parseJson = options?.parseJson ?? 'auto';
  const flatten = options?.flattenChunks ?? true;

  let buffer = '';
  const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

  const asyncSource: AsyncIterable<T> =
    source !== null &&
    source !== undefined &&
    (typeof source === 'object' || typeof source === 'function') &&
    Symbol.asyncIterator in (source as AsyncIterable<T>)
      ? (source as AsyncIterable<T>)
      : toAsyncIterable(source);

  const iterableSource =
    deadline !== undefined && Number.isFinite(deadline)
      ? iterateWithDeadline(asyncSource, deadline, options?.timeoutMs)
      : asyncSource;

  for await (const chunk of iterableSource) {
    const str =
      chunk instanceof Uint8Array && textDecoder
        ? textDecoder.decode(chunk, { stream: true })
        : typeof chunk === 'string'
          ? chunk
          : null;

    if (str === null) {
      if (buffer.trim()) {
        yield parseItem(buffer.trim(), parseJson);
        buffer = '';
      }
      if (flatten && Array.isArray(chunk)) {
        yield* chunk;
      } else {
        yield chunk;
      }
      continue;
    }

    if (parseJson === false) {
      if (typeof chunk === 'string' || str) {
        yield str;
      }
      continue;
    }

    buffer += str;
    if (!buffer.includes('\n')) {
      continue;
    }
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        yield parseItem(trimmed, parseJson);
      }
    }
  }

  if (textDecoder) {
    const remaining = textDecoder.decode();
    if (remaining) {
      if (parseJson === false) {
        yield remaining;
      } else {
        buffer += remaining;
      }
    }
  }
  if (parseJson !== false && buffer.trim()) {
    yield parseItem(buffer.trim(), parseJson);
  }
}

function isListStreamableNode(node: ExpressionNode): boolean {
  switch (node.type) {
    case 'Projection':
      if (node.left.type === 'Identity' || node.left.type === 'Current') {
        return true;
      }
      if (
        node.left.type === 'IndexExpression' &&
        (node.left.left.type === 'Identity' || node.left.left.type === 'Current') &&
        node.left.right.type === 'Slice'
      ) {
        const slice = node.left.right;
        return (
          (slice.start === null || slice.start >= 0) &&
          (slice.stop === null || slice.stop >= 0) &&
          (slice.step === null || slice.step > 0)
        );
      }
      return false;
    case 'FilterProjection':
      return node.left.type === 'Identity' || node.left.type === 'Current';
    case 'IndexExpression':
      if (node.left.type === 'Identity' || node.left.type === 'Current') {
        if (node.right.type === 'Slice') {
          const slice = node.right;
          return (
            (slice.start === null || slice.start >= 0) &&
            (slice.stop === null || slice.stop >= 0) &&
            (slice.step === null || slice.step > 0)
          );
        }
        return false;
      }
      return false;
    case 'Pipe':
      return isStreamableNode(node.left) && isListStreamableNode(node.right);
    default:
      return false;
  }
}

function isItemStreamableNode(node: ExpressionNode): boolean {
  switch (node.type) {
    case 'Field':
    case 'Identity':
    case 'Current':
    case 'Literal':
      return true;
    case 'Subexpression':
      return isItemStreamableNode(node.left) && isItemStreamableNode(node.right);
    case 'IndexExpression':
      return node.left.type !== 'Identity' && node.left.type !== 'Current' && isItemStreamableNode(node.left);
    case 'MultiSelectHash':
      return node.children.every(child => isItemStreamableNode(child.value));
    case 'MultiSelectList':
      return node.children.every(child => isItemStreamableNode(child));
    case 'Ternary':
      return (
        isItemStreamableNode(node.condition) &&
        isItemStreamableNode(node.trueExpr) &&
        isItemStreamableNode(node.falseExpr)
      );
    case 'Comparator':
    case 'Arithmetic':
    case 'AndExpression':
    case 'OrExpression':
      return isItemStreamableNode(node.left) && isItemStreamableNode(node.right);
    case 'NotExpression':
      return isItemStreamableNode(node.child);
    case 'Unary':
      return isItemStreamableNode(node.operand);
    default:
      return false;
  }
}

/**
 * Checks whether an AST node can be evaluated incrementally item-by-item on a stream.
 */
export function isStreamableNode(node: ExpressionNode): boolean {
  return isListStreamableNode(node) || isItemStreamableNode(node);
}

/**
 * Returns the own, non-null value of `key` on a plain object item, otherwise undefined.
 */
function ownField(item: unknown, key: string): JSONValue | undefined {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return undefined;
  }
  if (!Object.prototype.hasOwnProperty.call(item, key)) {
    return undefined;
  }
  const val = (item as Record<string, unknown>)[key];
  return val === null ? undefined : (val as JSONValue | undefined);
}

async function drainStream(
  source: AsyncIterable<unknown>,
  checkDeadline: () => void,
  maxOutputSize?: number,
): Promise<JSONValue[]> {
  const collected: JSONValue[] = [];
  for await (const item of source) {
    checkDeadline();
    collected.push(item as JSONValue);
    if (maxOutputSize !== undefined && collected.length > maxOutputSize) {
      throw new Error(`Output size exceeds maximum allowed size of ${maxOutputSize}`);
    }
  }
  return collected;
}

async function* drainAndEvaluate(
  source: AsyncIterable<unknown>,
  node: ExpressionNode,
  interpreter: TreeInterpreter,
  checkDeadline: () => void,
  options?: StreamOptions,
): AsyncGenerator<JSONValue, void, unknown> {
  const collected = await drainStream(source, checkDeadline, options?.maxOutputSize);
  const result = interpreter.search(node, collected, options);
  if (Array.isArray(result)) {
    for (const item of result) {
      yield item;
    }
  } else if (result !== null && result !== undefined) {
    yield result;
  }
}

async function* iterateWithDeadline<T>(
  source: AsyncIterable<T>,
  deadline: number,
  timeoutMs?: number,
): AsyncGenerator<T, void, unknown> {
  const iterator = source[Symbol.asyncIterator]();
  let finished = false;
  let timedOut = false;
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        timedOut = true;
        Promise.resolve(iterator.return?.()).catch(() => {});
        throw new Error(`Query execution timed out after ${timeoutMs}ms`);
      }
      let timerId: ReturnType<typeof setTimeout> | undefined;
      const nextPromise = iterator.next();
      const timeoutPromise = new Promise<never>((_, reject) => {
        timerId = setTimeout(() => {
          timedOut = true;
          Promise.resolve(iterator.return?.()).catch(() => {});
          reject(new Error(`Query execution timed out after ${timeoutMs}ms`));
        }, remaining);
      });
      let step: IteratorResult<T>;
      try {
        step = await Promise.race([nextPromise, timeoutPromise]);
      } catch (err) {
        nextPromise.catch(() => {});
        if (!timedOut) {
          finished = true;
        }
        throw err;
      } finally {
        if (timerId !== undefined) {
          clearTimeout(timerId);
        }
      }
      if (step.done) {
        finished = true;
        return;
      }
      yield step.value;
    }
  } finally {
    if (!finished && !timedOut) {
      await iterator.return?.();
    }
  }
}

/**
 * Evaluates an AST node over an AsyncIterable stream of items.
 */
export async function* evaluateStreamNode(
  source: AsyncIterable<unknown>,
  node: ExpressionNode,
  interpreter: TreeInterpreter,
  options?: StreamOptions,
  deadline?: number,
  depth = 0,
): AsyncGenerator<JSONValue, void, unknown> {
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  if (depth >= maxDepth) {
    throw new Error(`Evaluation exceeds maximum allowed depth of ${maxDepth}`);
  }
  if (options?.timeoutMs !== undefined && (typeof options.timeoutMs !== 'number' || Number.isNaN(options.timeoutMs))) {
    throw new RangeError('timeoutMs must be a valid number');
  }
  const effectiveDeadline =
    deadline !== undefined ? deadline : options?.timeoutMs !== undefined ? Date.now() + options.timeoutMs : undefined;

  function checkDeadline() {
    if (effectiveDeadline !== undefined && Date.now() >= effectiveDeadline) {
      throw new Error(`Query execution timed out after ${options?.timeoutMs}ms`);
    }
  }

  const timedSource =
    effectiveDeadline !== undefined && Number.isFinite(effectiveDeadline)
      ? iterateWithDeadline(source, effectiveDeadline, options?.timeoutMs)
      : source;

  switch (node.type) {
    case 'Projection': {
      if (!isStreamableNode(node)) {
        yield* drainAndEvaluate(timedSource, node, interpreter, checkDeadline, options);
        return;
      }
      const { left, right } = node;
      let streamSource = timedSource;
      if (left.type === 'IndexExpression' && left.right.type === 'Slice') {
        streamSource = evaluateStreamNode(timedSource, left, interpreter, options, effectiveDeadline, depth + 1);
      }
      if (right.type === 'Identity' || right.type === 'Current') {
        for await (const item of streamSource) {
          checkDeadline();
          if (item !== null && item !== undefined) {
            yield item as JSONValue;
          }
        }
        return;
      }
      if (right.type === 'Field') {
        const key = right.name;
        for await (const item of streamSource) {
          checkDeadline();
          const val = ownField(item, key);
          if (val !== undefined) {
            yield val;
          }
        }
        return;
      }
      for await (const item of streamSource) {
        checkDeadline();
        const res = interpreter.visit(right, item as JSONValue) as JSONValue;
        if (res !== null && res !== undefined) {
          yield res;
        }
      }
      return;
    }

    case 'IndexExpression': {
      if (node.left.type !== 'Identity' && node.left.type !== 'Current') {
        if (isListStreamableNode(node.left)) {
          yield* drainAndEvaluate(timedSource, node, interpreter, checkDeadline, options);
          return;
        }
        for await (const item of timedSource) {
          checkDeadline();
          const res = interpreter.visit(node, item as JSONValue) as JSONValue;
          if (res !== null && res !== undefined) {
            yield res;
          }
        }
        return;
      }

      const slice = node.right.type === 'Slice' ? node.right : null;
      const start = slice?.start ?? 0;
      const stop = slice?.stop ?? Infinity;
      const step = slice?.step ?? 1;
      if (!slice || start < 0 || stop < 0 || step <= 0) {
        // Slices with negative indices or scalar indices require accumulating the stream
        yield* drainAndEvaluate(timedSource, node, interpreter, checkDeadline, options);
        return;
      }

      if (stop <= 0) {
        return;
      }
      let index = 0;
      for await (const item of timedSource) {
        checkDeadline();
        if (index >= start && (index - start) % step === 0) {
          yield item as JSONValue;
        }
        index++;
        if (index >= stop) {
          break;
        }
      }
      return;
    }

    case 'FilterProjection': {
      if (!isStreamableNode(node)) {
        yield* drainAndEvaluate(timedSource, node, interpreter, checkDeadline, options);
        return;
      }
      const { condition, right } = node;
      if (right.type === 'Identity' || right.type === 'Current') {
        for await (const item of timedSource) {
          checkDeadline();
          if (!isFalse(interpreter.visit(condition, item as JSONValue))) {
            if (item !== null && item !== undefined) {
              yield item as JSONValue;
            }
          }
        }
        return;
      }
      if (right.type === 'Field') {
        const key = right.name;
        for await (const item of timedSource) {
          checkDeadline();
          if (!isFalse(interpreter.visit(condition, item as JSONValue))) {
            const val = ownField(item, key);
            if (val !== undefined) {
              yield val;
            }
          }
        }
        return;
      }
      for await (const item of timedSource) {
        checkDeadline();
        if (!isFalse(interpreter.visit(condition, item as JSONValue))) {
          const res = interpreter.visit(right, item as JSONValue) as JSONValue;
          if (res !== null && res !== undefined) {
            yield res;
          }
        }
      }
      return;
    }

    case 'Pipe': {
      if (!isStreamableNode(node.left)) {
        yield* drainAndEvaluate(timedSource, node, interpreter, checkDeadline, options);
        return;
      }
      const leftStream = evaluateStreamNode(timedSource, node.left, interpreter, options, effectiveDeadline, depth + 1);
      if (isListStreamableNode(node.right)) {
        for await (const res of evaluateStreamNode(
          leftStream,
          node.right,
          interpreter,
          options,
          effectiveDeadline,
          depth + 1,
        )) {
          yield res;
        }
      } else {
        // Collect left results and evaluate terminal non-streamable stage
        const collected = await drainStream(leftStream, checkDeadline, options?.maxOutputSize);
        const result = interpreter.search(node.right, collected, options);
        if (result !== null && result !== undefined) {
          yield result;
        }
      }
      return;
    }

    case 'Identity':
    case 'Current': {
      for await (const item of timedSource) {
        checkDeadline();
        yield item as JSONValue;
      }
      return;
    }

    case 'Field': {
      const key = node.name;
      for await (const item of timedSource) {
        checkDeadline();
        const val = ownField(item, key);
        if (val !== undefined) {
          yield val;
        }
      }
      return;
    }

    default: {
      // General expression on each item
      if (isStreamableNode(node)) {
        for await (const item of timedSource) {
          checkDeadline();
          const res = interpreter.visit(node, item as JSONValue) as JSONValue;
          if (res !== null && res !== undefined) {
            yield res;
          }
        }
        return;
      }

      // Non-streamable root: accumulate items and evaluate
      yield* drainAndEvaluate(timedSource, node, interpreter, checkDeadline, options);
      return;
    }
  }
}

/**
 * Incremental Result Streaming evaluation.
 * Evaluates a JMESPath expression incrementally over an AsyncIterable or ReadableStream source.
 */
export async function* searchStream<T = JSONValue, D = unknown>(
  sourceOrExpression: StreamSource<D> | string | ExpressionNode,
  expressionOrSource: string | ExpressionNode | StreamSource<D>,
  options?: StreamOptions,
): AsyncGenerator<T, void, unknown> {
  let expression: string | ExpressionNode;
  let source: StreamSource<D>;

  if (typeof sourceOrExpression === 'string' || isExpressionNode(sourceOrExpression)) {
    expression = sourceOrExpression;
    source = expressionOrSource as StreamSource<D>;
  } else {
    source = sourceOrExpression as StreamSource<D>;
    expression = expressionOrSource as string | ExpressionNode;
  }

  if (typeof expression !== 'string' && !isExpressionNode(expression)) {
    throw new TypeError('Expression must be a string or AST ExpressionNode');
  }

  const ast: ExpressionNode = typeof expression === 'string' ? Parser.parse(expression, options) : expression;

  if (typeof expression !== 'string' && options?.maxNodes !== undefined && countNodes(ast) > options.maxNodes) {
    throw new Error(`Expression exceeds maximum allowed node count of ${options.maxNodes}`);
  }

  if (options) {
    const fnError = findDisallowedFunction(ast, options);
    if (fnError) {
      throw new Error(fnError);
    }
  }

  const interpreter = new TreeInterpreter(options);
  for (const [name, entry] of Object.entries(TreeInterpreterInstance.runtime._functionTable)) {
    if (
      Object.hasOwn(TreeInterpreterInstance.runtime._functionTable, name) &&
      !Object.hasOwn(interpreter.runtime._functionTable, name)
    ) {
      interpreter.runtime._functionTable[name] = entry;
    }
  }

  if (options?.timeoutMs !== undefined && (typeof options.timeoutMs !== 'number' || Number.isNaN(options.timeoutMs))) {
    throw new RangeError('timeoutMs must be a valid number');
  }
  const deadline = options?.timeoutMs !== undefined ? Date.now() + options.timeoutMs : undefined;

  const items = normalizeSource(source, options, deadline);
  const results = evaluateStreamNode(items, ast, interpreter, options, deadline);

  const limit = options?.limit;
  if (limit !== undefined && !Number.isInteger(limit)) {
    throw new RangeError('limit must be an integer');
  }
  const maxOutputSize = options?.maxOutputSize;
  let count = 0;

  if (limit !== undefined && limit <= 0) {
    return;
  }

  for await (const result of results) {
    if (maxOutputSize !== undefined && count >= maxOutputSize) {
      throw new Error(`Output size exceeds maximum allowed size of ${maxOutputSize}`);
    }
    yield result as T;
    count++;
    if (limit !== undefined && count >= limit) {
      break;
    }
  }
}
