import type { ExpressionNode } from './AST.type';
import type { JSONValue } from './JSON.type';
import Parser from './Parser';
import type { Options } from './Parser.type';
import { TreeInterpreter, TreeInterpreterInstance } from './TreeInterpreter';
import { findDisallowedFunction, isFalse } from './utils';

export type StreamSource<T = unknown> = AsyncIterable<T> | Iterable<T> | ReadableStream<T> | NodeJS.ReadableStream;

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
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        yield value;
      }
    } finally {
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
): AsyncGenerator<unknown, void, unknown> {
  const parseJson = options?.parseJson ?? 'auto';
  const flatten = options?.flattenChunks ?? true;

  let buffer = '';
  const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

  for await (const chunk of toAsyncIterable(source)) {
    const str =
      chunk instanceof Uint8Array && textDecoder
        ? textDecoder.decode(chunk, { stream: true })
        : typeof chunk === 'string'
          ? chunk
          : null;

    if (str !== null) {
      if (parseJson === false && typeof chunk === 'string') {
        yield chunk;
      } else {
        buffer += str;
        if (buffer.includes('\n')) {
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              yield parseItem(trimmed, parseJson);
            }
          }
        }
      }
    } else {
      if (buffer.trim()) {
        yield parseItem(buffer.trim(), parseJson);
        buffer = '';
      }
      if (flatten && Array.isArray(chunk)) {
        for (const item of chunk) {
          yield item;
        }
      } else {
        yield chunk;
      }
    }
  }

  if (textDecoder && buffer) {
    buffer += textDecoder.decode();
  }
  if (buffer.trim()) {
    yield parseItem(buffer.trim(), parseJson);
  }
}

/**
 * Checks whether an AST node can be evaluated incrementally item-by-item on a stream.
 */
export function isStreamableNode(node: ExpressionNode): boolean {
  switch (node.type) {
    case 'Projection':
      if (node.left.type === 'Identity' || node.left.type === 'Current') {
        return true;
      }
      if (node.left.type === 'IndexExpression' && node.left.right.type === 'Slice') {
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
      return isStreamableNode(node.left);
    case 'Field':
    case 'Identity':
    case 'Current':
      return true;
    case 'Subexpression':
      return isStreamableNode(node.left) && isStreamableNode(node.right);
    case 'MultiSelectHash':
    case 'MultiSelectList':
    case 'Ternary':
    case 'Comparator':
    case 'Arithmetic':
    case 'NotExpression':
      return true;
    case 'Pipe':
      return isStreamableNode(node.left) && isStreamableNode(node.right);
    default:
      return false;
  }
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

/**
 * Evaluates an AST node over an AsyncIterable stream of items.
 */
export async function* evaluateStreamNode(
  source: AsyncIterable<unknown>,
  node: ExpressionNode,
  interpreter: TreeInterpreter,
  options?: StreamOptions,
): AsyncGenerator<JSONValue, void, unknown> {
  const deadline = options?.timeoutMs !== undefined ? Date.now() + options.timeoutMs : 0;

  function checkDeadline() {
    if (deadline > 0 && Date.now() >= deadline) {
      throw new Error(`Query execution timed out after ${options?.timeoutMs}ms`);
    }
  }

  switch (node.type) {
    case 'Projection': {
      if (!isStreamableNode(node)) {
        yield* drainAndEvaluate(source, node, interpreter, checkDeadline, options);
        return;
      }
      const { left, right } = node;
      let streamSource = source;
      if (left.type === 'IndexExpression' && left.right.type === 'Slice') {
        streamSource = evaluateStreamNode(source, left, interpreter, options);
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
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            const val = (item as Record<string, unknown>)[key];
            if (val !== undefined && val !== null) {
              yield val as JSONValue;
            }
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
      if (node.left.type === 'Identity' || node.left.type === 'Current') {
        if (node.right.type === 'Slice') {
          const slice = node.right;
          const start = slice.start ?? 0;
          const stop = slice.stop ?? Infinity;
          const step = slice.step ?? 1;

          if (start >= 0 && stop >= 0 && step > 0) {
            let index = 0;
            for await (const item of source) {
              checkDeadline();
              if (index >= stop) {
                break;
              }
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
        }

        // Slices with negative indices or scalar indices require accumulating the stream
        yield* drainAndEvaluate(source, node, interpreter, checkDeadline, options);
        return;
      }
      for await (const item of source) {
        checkDeadline();
        const res = interpreter.visit(node, item as JSONValue) as JSONValue;
        if (res !== null && res !== undefined) {
          yield res;
        }
      }
      return;
    }

    case 'FilterProjection': {
      if (!isStreamableNode(node)) {
        yield* drainAndEvaluate(source, node, interpreter, checkDeadline, options);
        return;
      }
      const { condition, right } = node;
      if (right.type === 'Identity' || right.type === 'Current') {
        for await (const item of source) {
          checkDeadline();
          if (!isFalse(interpreter.visit(condition, item as JSONValue))) {
            yield item as JSONValue;
          }
        }
        return;
      }
      if (right.type === 'Field') {
        const key = right.name;
        for await (const item of source) {
          checkDeadline();
          if (!isFalse(interpreter.visit(condition, item as JSONValue))) {
            if (item && typeof item === 'object' && !Array.isArray(item)) {
              const val = (item as Record<string, unknown>)[key];
              if (val !== undefined && val !== null) {
                yield val as JSONValue;
              }
            }
          }
        }
        return;
      }
      for await (const item of source) {
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
      const leftStream = evaluateStreamNode(source, node.left, interpreter, options);
      if (isStreamableNode(node.right)) {
        for await (const res of evaluateStreamNode(leftStream, node.right, interpreter, options)) {
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
      for await (const item of source) {
        checkDeadline();
        yield item as JSONValue;
      }
      return;
    }

    case 'Field': {
      const key = node.name;
      for await (const item of source) {
        checkDeadline();
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const val = (item as Record<string, unknown>)[key];
          if (val !== undefined && val !== null) {
            yield val as JSONValue;
          }
        }
      }
      return;
    }

    default: {
      // General expression on each item
      if (isStreamableNode(node)) {
        for await (const item of source) {
          checkDeadline();
          const res = interpreter.visit(node, item as JSONValue) as JSONValue;
          if (res !== null && res !== undefined) {
            yield res;
          }
        }
        return;
      }

      // Non-streamable root: accumulate items and evaluate
      yield* drainAndEvaluate(source, node, interpreter, checkDeadline, options);
      return;
    }
  }
}

function isExpressionNode(val: unknown): val is ExpressionNode {
  return (
    typeof val === 'object' &&
    val !== null &&
    'type' in val &&
    typeof (val as { type: unknown }).type === 'string' &&
    !(Symbol.iterator in val) &&
    !(Symbol.asyncIterator in val)
  );
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

  if (options) {
    const fnError = findDisallowedFunction(ast, options);
    if (fnError) {
      throw new Error(fnError);
    }
  }

  const interpreter = new TreeInterpreter(options);
  interpreter.runtime._functionTable = TreeInterpreterInstance.runtime._functionTable;

  const items = normalizeSource(source, options);
  const results = evaluateStreamNode(items, ast, interpreter, options);

  const limit = options?.limit;
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
