import type { ExpressionNode, ExpressionReference, SliceNode } from './AST.type';
import type { JSONArray, JSONObject, JSONValue } from './JSON.type';
import { Token } from './Lexer.type';
import { DEFAULT_MAX_DEPTH } from './Parser';
import { Options, ScopeEntry } from './Parser.type';
import { Runtime } from './Runtime';
import { ScopeChain } from './Scope';
import { add, countNodes, div, divide, ensureNumbers, isFalse, mod, mul, strictDeepEqual, sub } from './utils';

const emptyScopeChain = new ScopeChain();

export class TreeInterpreter {
  runtime: Runtime;
  private _rootValue: JSONValue | null = null;
  private _scope: ScopeChain;
  private _options?: Options;
  private _depth = 0;
  private _maxDepth: number = DEFAULT_MAX_DEPTH;
  private _deadline = 0;

  constructor(options?: Options) {
    this.runtime = new Runtime(this);
    this._scope = new ScopeChain();
    this._maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
    if (options) {
      this._options = options;
      this._deadline = options.timeoutMs !== undefined ? Date.now() + options.timeoutMs : 0;
    }
  }

  withScope(scope: ScopeEntry): TreeInterpreter {
    const interpreter = new TreeInterpreter(this._options);
    interpreter.runtime = this.runtime;
    interpreter._rootValue = this._rootValue;
    interpreter._scope = this._scope.withScope(scope);
    interpreter._depth = this._depth;
    interpreter._maxDepth = this._maxDepth;
    interpreter._deadline = this._deadline;
    return interpreter;
  }

  search(node: ExpressionNode, value: JSONValue, options?: Options): JSONValue {
    if (options?.maxNodes !== undefined && countNodes(node) > options.maxNodes) {
      throw new Error(`Expression exceeds maximum allowed node count of ${options.maxNodes}`);
    }
    this._rootValue = value;
    this._scope = emptyScopeChain;
    this._options = options;
    this._maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
    this._depth = 0;
    this._deadline = options?.timeoutMs !== undefined ? Date.now() + options.timeoutMs : 0;
    const result = this.visit(node, value) as JSONValue;
    this.checkOutputSize(result);
    return result;
  }

  private checkOutputSize(val: unknown): void {
    const max = this._options?.maxOutputSize;
    if (max === undefined || val == null) {
      return;
    }

    const size =
      Array.isArray(val) || typeof val === 'string'
        ? val.length
        : typeof val === 'object'
          ? Object.keys(val).length
          : 0;

    if (size > max) {
      throw new Error(`Output size exceeds maximum allowed size of ${max}`);
    }
  }

  private collect(target: JSONValue[], item: JSONValue): void {
    target.push(item);
    if (this._options?.maxOutputSize !== undefined && target.length > this._options.maxOutputSize) {
      throw new Error(`Output size exceeds maximum allowed size of ${this._options.maxOutputSize}`);
    }
  }

  private evaluateProjectionItems(items: JSONArray, right: ExpressionNode): JSONValue {
    const collected: JSONValue[] = [];
    if (right.type === 'Field') {
      const key = right.name;
      for (let i = 0; i < items.length; i++) {
        if (this._deadline > 0 && Date.now() >= this._deadline) {
          throw new Error(`Query execution timed out after ${this._options?.timeoutMs}ms`);
        }
        const elem = items[i];
        if (!elem || typeof elem !== 'object' || Array.isArray(elem)) {
          continue;
        }
        if (!Object.prototype.hasOwnProperty.call(elem, key)) {
          continue;
        }
        const val = (elem as JSONObject)[key];
        if (val !== undefined && val !== null) {
          this.collect(collected, val);
        }
      }
      return collected;
    }
    if (right.type === 'Identity') {
      for (let i = 0; i < items.length; i++) {
        const elem = items[i];
        if (elem !== null) {
          this.collect(collected, elem);
        }
      }
      return collected;
    }
    for (const elem of items) {
      const current = this.visit(right, elem) as JSONValue;
      if (current !== null) {
        this.collect(collected, current);
      }
    }
    return collected;
  }

  visit(node: ExpressionNode, value: JSONValue | ExpressionNode): JSONValue | ExpressionNode | ExpressionReference {
    if (this._deadline > 0 && Date.now() >= this._deadline) {
      throw new Error(`Query execution timed out after ${this._options?.timeoutMs}ms`);
    }
    if (this._depth >= this._maxDepth) {
      throw new Error(`Evaluation exceeds maximum allowed depth of ${this._maxDepth}`);
    }
    this._depth += 1;
    try {
      return this.evaluateNode(node, value);
    } finally {
      this._depth -= 1;
    }
  }

  private evaluateNode(
    node: ExpressionNode,
    value: JSONValue | ExpressionNode,
  ): JSONValue | ExpressionNode | ExpressionReference {
    switch (node.type) {
      case 'Ternary': {
        const condition = this.visit(node.condition, value);
        if (!isFalse(condition)) {
          return this.visit(node.trueExpr, value);
        }
        return this.visit(node.falseExpr, value);
      }
      case 'Field':
        const identifier = node.name;
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          return null;
        }
        // return the value of the field
        return Object.prototype.hasOwnProperty.call(value, identifier)
          ? ((value as JSONObject)[identifier] ?? null)
          : null;
      case 'LetExpression': {
        const scope: JSONObject = {};
        for (const binding of node.bindings) {
          const bound = this.visit(binding, value) as JSONObject;
          for (const key of Object.keys(bound)) {
            Object.defineProperty(scope, key, {
              value: bound[key],
              enumerable: true,
              writable: true,
              configurable: true,
            });
          }
        }
        return this.withScope(scope).visit(node.expression, value);
      }
      case 'Binding': {
        const { variable, reference } = node;
        const result = this.visit(reference, value);
        const binding: JSONObject = {};
        Object.defineProperty(binding, variable, {
          value: result,
          enumerable: true,
          writable: true,
          configurable: true,
        });
        return binding;
      }
      case 'Variable': {
        const variable = node.name;
        if (!this._scope.hasValue(variable)) {
          throw new Error(`Error referencing undefined variable ${variable}`);
        }
        return this._scope.getValue(variable);
      }
      case 'IndexExpression':
        return this.visit(node.right, this.visit(node.left, value));
      case 'Subexpression': {
        const result = this.visit(node.left, value);
        return result != null ? (this.visit(node.right, result) ?? null) : null;
      }
      case 'Index': {
        if (!Array.isArray(value)) {
          return null;
        }
        const index = node.value < 0 ? value.length + node.value : node.value;
        return value[index] ?? null;
      }
      case 'Slice': {
        if (!Array.isArray(value) && typeof value !== 'string') {
          return null;
        }
        const target = typeof value === 'string' ? [...value] : value;
        const { start, stop, step } = this.computeSliceParams(target.length, node);
        const sliced = this.slice(target, start, stop, step);
        const res = typeof value === 'string' ? (sliced as string[]).join('') : sliced;
        this.checkOutputSize(res);
        return res;
      }
      case 'Projection': {
        const { left, right } = node;
        const allowString = left.type === 'IndexExpression' && left.right.type === 'Slice';
        const base = this.visit(left, value);
        if (allowString && typeof base === 'string') {
          return this.visit(right, base) as JSONValue;
        }
        return Array.isArray(base) ? this.evaluateProjectionItems(base, right) : null;
      }
      case 'ValueProjection': {
        const base = this.visit(node.left, value);
        if (base === null || typeof base !== 'object' || Array.isArray(base)) {
          return null;
        }
        return this.evaluateProjectionItems(Object.values(base), node.right);
      }
      case 'FilterProjection': {
        const { left, right, condition } = node;

        const base = this.visit(left, value);
        if (!Array.isArray(base)) {
          return null;
        }

        const results: JSONValue[] = [];
        if (right.type === 'Field') {
          const key = right.name;
          for (let i = 0; i < base.length; i++) {
            const elem = base[i];
            if (isFalse(this.visit(condition, elem))) {
              continue;
            }
            if (!elem || typeof elem !== 'object' || Array.isArray(elem)) {
              continue;
            }
            if (!Object.prototype.hasOwnProperty.call(elem, key)) {
              continue;
            }
            const val = (elem as JSONObject)[key];
            if (val !== undefined && val !== null) {
              this.collect(results, val);
            }
          }
          return results;
        }
        if (right.type === 'Identity') {
          for (let i = 0; i < base.length; i++) {
            const elem = base[i];
            if (isFalse(this.visit(condition, elem))) {
              continue;
            }
            if (elem !== null) {
              this.collect(results, elem);
            }
          }
          return results;
        }
        for (const elem of base) {
          if (isFalse(this.visit(condition, elem))) {
            continue;
          }
          const result = this.visit(right, elem) as JSONValue;
          if (result !== null) {
            this.collect(results, result);
          }
        }
        return results;
      }
      case 'Arithmetic': {
        const first = this.visit(node.left, value) as JSONValue;
        const second = this.visit(node.right, value) as JSONValue;
        switch (node.operator) {
          case Token.TOK_PLUS:
            return add(first, second);

          case Token.TOK_MINUS:
            return sub(first, second);

          case Token.TOK_MULTIPLY:
          case Token.TOK_STAR:
            return mul(first, second);

          case Token.TOK_DIVIDE:
            return divide(first, second);

          case Token.TOK_MODULO:
            return mod(first, second);

          case Token.TOK_DIV:
            return div(first, second);

          default:
            throw new Error(`Syntax error: unknown arithmetic operator: ${node.operator}`);
        }
      }
      case 'Unary': {
        const operand = this.visit(node.operand, value) as JSONValue;
        switch (node.operator) {
          case Token.TOK_PLUS:
            ensureNumbers(operand);
            return operand as number;

          case Token.TOK_MINUS:
            ensureNumbers(operand);
            return -(operand as number);

          default:
            throw new Error(`Syntax error: unknown arithmetic operator: ${node.operator}`);
        }
      }
      case 'Comparator': {
        const first = this.visit(node.left, value);
        const second = this.visit(node.right, value);

        // equality is an exact match

        switch (node.name) {
          case 'EQ':
            return strictDeepEqual(first, second);
          case 'NE':
            return !strictDeepEqual(first, second);
        }

        // ordering operators are only valid for numbers

        if (typeof first !== 'number' || typeof second !== 'number') {
          return null;
        }

        switch (node.name) {
          case 'GT':
            return (first as number) > (second as number);
          case 'GTE':
            return (first as number) >= (second as number);
          case 'LT':
            return (first as number) < (second as number);
          case 'LTE':
            return (first as number) <= (second as number);
        }
      }
      case 'Flatten': {
        const original = this.visit(node.child, value);
        const res = Array.isArray(original) ? original.flat() : null;
        this.checkOutputSize(res);
        return res;
      }
      case 'Root':
        return this._rootValue;
      case 'MultiSelectList': {
        const collected: JSONValue[] = [];
        for (const child of node.children) {
          collected.push(this.visit(child, value) as JSONValue);
        }
        this.checkOutputSize(collected);
        return collected;
      }
      case 'MultiSelectHash': {
        const collected: Record<string, JSONValue> = {};
        for (const child of node.children) {
          Object.defineProperty(collected, child.name, {
            value: this.visit(child.value, value) as JSONValue,
            enumerable: true,
            writable: true,
            configurable: true,
          });
        }
        this.checkOutputSize(collected);
        return collected;
      }
      case 'OrExpression': {
        const result = this.visit(node.left, value);
        if (isFalse(result)) {
          return this.visit(node.right, value);
        }
        return result;
      }
      case 'AndExpression': {
        const result = this.visit(node.left, value);
        if (isFalse(result)) {
          return result;
        }
        return this.visit(node.right, value);
      }
      case 'NotExpression':
        return isFalse(this.visit(node.child, value));
      case 'Literal':
        return node.value;
      case 'Pipe':
        return this.visit(node.right, this.visit(node.left, value));
      case 'Function': {
        if (this._options?.allowedFunctions && !this._options.allowedFunctions.includes(node.name)) {
          throw new Error(`Function '${node.name}' is not allowed`);
        }
        if (this._options?.disallowedFunctions && this._options.disallowedFunctions.includes(node.name)) {
          throw new Error(`Function '${node.name}' is disallowed`);
        }
        const args: JSONValue[] = [];
        for (const child of node.children) {
          args.push(this.visit(child, value) as JSONValue);
        }
        const prevInterpreter = this.runtime._interpreter;
        this.runtime._interpreter = this;
        try {
          const res = this.runtime.callFunction(node.name, args);
          this.checkOutputSize(res);
          return res;
        } finally {
          this.runtime._interpreter = prevInterpreter;
        }
      }
      case 'ExpressionReference':
        return {
          expref: true,
          ...node.child,
        };
      case 'Current':
      case 'Identity':
        return value;
    }
  }

  computeSliceParams(arrayLength: number, sliceNode: SliceNode): { start: number; stop: number; step: number } {
    let { start, stop, step } = sliceNode;

    if (step === null) {
      step = 1;
    } else if (step === 0) {
      const error = new Error('Invalid value: slice step cannot be 0');
      error.name = 'RuntimeError';
      throw error;
    }

    start = start === null ? (step < 0 ? arrayLength - 1 : 0) : this.capSliceRange(arrayLength, start, step);
    stop = stop === null ? (step < 0 ? -1 : arrayLength) : this.capSliceRange(arrayLength, stop, step);

    return { start, stop, step };
  }

  capSliceRange(arrayLength: number, actualValue: number, step: number): number {
    let nextActualValue = actualValue;
    if (nextActualValue < 0) {
      nextActualValue += arrayLength;
      if (nextActualValue < 0) {
        nextActualValue = step < 0 ? -1 : 0;
      }
    } else if (nextActualValue >= arrayLength) {
      nextActualValue = step < 0 ? arrayLength - 1 : arrayLength;
    }
    return nextActualValue;
  }

  slice(collection: JSONArray, start: number, end: number, step: number): JSONArray {
    if (step === 1) {
      return collection.slice(start, end);
    }
    const len = Math.max(0, Math.ceil((end - start) / step));
    const result = new Array(len);
    let idx = 0;
    if (step > 0) {
      for (let i = start; i < end; i += step) {
        result[idx++] = collection[i];
      }
    } else {
      for (let i = start; i > end; i += step) {
        result[idx++] = collection[i];
      }
    }
    return result;
  }
}

export const TreeInterpreterInstance = new TreeInterpreter();
export default TreeInterpreterInstance;
