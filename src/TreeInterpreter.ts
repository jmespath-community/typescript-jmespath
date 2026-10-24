import type { ExpressionNode, ExpressionReference, SliceNode } from './AST.type';
import type { JSONArray, JSONObject, JSONValue } from './JSON.type';
import { Token } from './Lexer.type';
import { Options, ScopeEntry } from './Parser.type';
import { Runtime } from './Runtime';
import { ScopeChain } from './Scope';
import { add, div, divide, ensureNumbers, isFalse, mod, mul, strictDeepEqual, sub } from './utils';

const emptyScopeChain = new ScopeChain();

export class TreeInterpreter {
  runtime: Runtime;
  private _rootValue: JSONValue | null = null;
  private _scope: ScopeChain;
  private _options?: Options;
  private _depth = 0;
  private _deadline = 0;

  constructor() {
    this.runtime = new Runtime(this);
    this._scope = new ScopeChain();
  }

  withScope(scope: ScopeEntry): TreeInterpreter {
    const interpreter = new TreeInterpreter();
    interpreter.runtime._functionTable = this.runtime._functionTable;
    interpreter._rootValue = this._rootValue;
    interpreter._scope = this._scope.withScope(scope);
    interpreter._options = this._options;
    interpreter._depth = this._depth;
    interpreter._deadline = this._deadline;
    return interpreter;
  }

  search(node: ExpressionNode, value: JSONValue, options?: Options): JSONValue {
    this._rootValue = value;
    this._scope = emptyScopeChain;
    this._options = options;
    this._depth = 0;
    this._deadline = options?.timeoutMs !== undefined ? Date.now() + options.timeoutMs : 0;
    return this.visit(node, value) as JSONValue;
  }

  visit(node: ExpressionNode, value: JSONValue | ExpressionNode): JSONValue | ExpressionNode | ExpressionReference {
    if (this._options) {
      if (this._options.maxDepth !== undefined && this._depth >= this._options.maxDepth) {
        throw new Error(`Evaluation exceeds maximum allowed depth of ${this._options.maxDepth}`);
      }
      if (this._deadline > 0 && Date.now() >= this._deadline) {
        throw new Error(`Query execution timed out after ${this._options.timeoutMs}ms`);
      }
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
        return (value as JSONObject)[identifier] ?? null;
      case 'LetExpression': {
        const { bindings, expression } = node;
        let scope = {};
        bindings.forEach(binding => {
          const reference = this.visit(binding, value) as JSONObject;
          scope = {
            ...scope,
            ...reference,
          };
        });
        return this.withScope(scope).visit(expression, value);
      }
      case 'Binding': {
        const { variable, reference } = node;
        const result = this.visit(reference, value);
        return { [variable]: result } as JSONObject;
      }
      case 'Variable': {
        const variable = node.name;
        if (
          !this._scope.getValue(variable) &&
          !Object.prototype.hasOwnProperty.call(this._scope.currentScopeData, variable)
        ) {
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
        const { start, stop, step } = this.computeSliceParams(value.length, node);
        if (typeof value === 'string') {
          // string slices is implemented by slicing
          // the corresponding array of codepoints and
          // converting the result back to a string
          const chars = [...value];
          const sliced = this.slice(chars, start, stop, step);
          return sliced.join('');
        } else {
          return this.slice(value, start, stop, step);
        }
      }
      case 'Projection': {
        const { left, right } = node;

        // projections typically operate on arrays
        // string slicing produces a 'Projection' whose
        // first child is an 'IndexExpression' whose
        // second child is an 'Slice'

        // we allow execution of the left index-expression
        // to return a string only if the AST has this
        // specific shape

        let allowString = false;
        if (left.type === 'IndexExpression' && left.right.type === 'Slice') {
          allowString = true;
        }

        const base = this.visit(left, value);
        if (allowString && typeof base === 'string') {
          // a projection is really a sub-expression in disguise
          // we must evaluate the right hand expression
          return this.visit(right, base) as JSONValue;
        }

        if (!Array.isArray(base)) {
          return null;
        }
        const collected: JSONValue[] = [];
        if (right.type === 'Field') {
          const key = right.name;
          for (let i = 0; i < base.length; i++) {
            if (this._deadline > 0 && Date.now() >= this._deadline) {
              throw new Error(`Query execution timed out after ${this._options?.timeoutMs}ms`);
            }
            const elem = base[i];
            if (elem !== null && typeof elem === 'object' && !Array.isArray(elem)) {
              const val = (elem as JSONObject)[key] ?? null;
              if (val !== null) {
                collected.push(val);
              }
            }
          }
          return collected as JSONValue;
        }
        if (right.type === 'Identity') {
          for (let i = 0; i < base.length; i++) {
            const elem = base[i];
            if (elem !== null) {
              collected.push(elem);
            }
          }
          return collected as JSONValue;
        }
        for (const elem of base) {
          const current = this.visit(right, elem) as JSONValue;
          if (current !== null) {
            collected.push(current);
          }
        }
        return collected as JSONValue;
      }
      case 'ValueProjection': {
        const { left, right } = node;

        const base = this.visit(left, value);
        if (base === null || typeof base !== 'object' || Array.isArray(base)) {
          return null;
        }
        const collected: JSONValue[] = [];
        const values = Object.values(base);
        if (right.type === 'Field') {
          const key = right.name;
          for (let i = 0; i < values.length; i++) {
            const elem = values[i];
            if (elem !== null && typeof elem === 'object' && !Array.isArray(elem)) {
              const val = (elem as JSONObject)[key] ?? null;
              if (val !== null) {
                collected.push(val);
              }
            }
          }
          return collected;
        }
        if (right.type === 'Identity') {
          for (let i = 0; i < values.length; i++) {
            const elem = values[i];
            if (elem !== null) {
              collected.push(elem);
            }
          }
          return collected;
        }
        for (const elem of values) {
          const current = this.visit(right, elem) as JSONValue;
          if (current !== null) {
            collected.push(current);
          }
        }
        return collected;
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
            const matched = this.visit(condition, elem);
            if (isFalse(matched)) {
              continue;
            }
            if (elem !== null && typeof elem === 'object' && !Array.isArray(elem)) {
              const val = (elem as JSONObject)[key] ?? null;
              if (val !== null) {
                results.push(val);
              }
            }
          }
          return results;
        }
        if (right.type === 'Identity') {
          for (let i = 0; i < base.length; i++) {
            const elem = base[i];
            const matched = this.visit(condition, elem);
            if (isFalse(matched)) {
              continue;
            }
            if (elem !== null) {
              results.push(elem);
            }
          }
          return results;
        }
        for (const elem of base) {
          const matched = this.visit(condition, elem);
          if (isFalse(matched)) {
            continue;
          }
          const result = this.visit(right, elem) as JSONValue;
          if (result !== null) {
            results.push(result);
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
        return Array.isArray(original) ? original.flat() : null;
      }
      case 'Root':
        return this._rootValue;
      case 'MultiSelectList': {
        const collected: JSONValue[] = [];
        for (const child of node.children) {
          collected.push(this.visit(child, value) as JSONValue);
        }
        return collected;
      }
      case 'MultiSelectHash': {
        const collected: Record<string, JSONValue> = {};
        for (const child of node.children) {
          collected[child.name] = this.visit(child.value, value) as JSONValue;
        }
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
        return this.runtime.callFunction(node.name, args);
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
    const len = Math.ceil(Math.abs(start - end) / Math.abs(step));
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
