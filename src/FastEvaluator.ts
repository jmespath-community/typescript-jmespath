import type { ExpressionNode } from './AST.type';
import type { JSONValue } from './JSON.type';
import type { Options } from './Parser.type';
import type { Runtime } from './Runtime';
import { isFalse, strictDeepEqual } from './utils';

export interface FastExecutionContext {
  readonly root: JSONValue;
  readonly runtime: Runtime;
}

export type FastEvaluatorFn = (current: JSONValue, context: FastExecutionContext) => JSONValue;

/**
 * Compiles subexpression field chains into a flattened key array when possible.
 * E.g., `a.b.c.d` -> `['a', 'b', 'c', 'd']`
 */
function tryFlattenFieldChain(node: ExpressionNode): string[] | null {
  const fields: string[] = [];
  let cur: ExpressionNode = node;
  while (cur.type === 'Subexpression') {
    if (cur.right.type === 'Field') {
      fields.unshift(cur.right.name);
      cur = cur.left;
    } else {
      return null;
    }
  }
  if (cur.type === 'Field') {
    fields.unshift(cur.name);
    return fields;
  }
  return null;
}

function compareOrdering(operator: 'GT' | 'GTE' | 'LT' | 'LTE', first: unknown, second: unknown): boolean | null {
  if (typeof first !== 'number' || typeof second !== 'number') {
    return null;
  }
  switch (operator) {
    case 'GT':
      return first > second;
    case 'GTE':
      return first >= second;
    case 'LT':
      return first < second;
    case 'LTE':
      return first <= second;
  }
}

function compileNode(node: ExpressionNode): FastEvaluatorFn | null {
  if (node.type === 'Subexpression') {
    const chain = tryFlattenFieldChain(node);
    if (chain) {
      const len = chain.length;
      if (len === 2) {
        const k0 = chain[0];
        const k1 = chain[1];
        return cur => {
          if (cur === null || typeof cur !== 'object' || Array.isArray(cur)) {
            return null;
          }
          const v0 = (cur as Record<string, JSONValue>)[k0];
          if (v0 === null || typeof v0 !== 'object' || Array.isArray(v0)) {
            return null;
          }
          return (v0 as Record<string, JSONValue>)[k1] ?? null;
        };
      }
      if (len === 3) {
        const k0 = chain[0];
        const k1 = chain[1];
        const k2 = chain[2];
        return cur => {
          if (cur === null || typeof cur !== 'object' || Array.isArray(cur)) {
            return null;
          }
          const v0 = (cur as Record<string, JSONValue>)[k0];
          if (v0 === null || typeof v0 !== 'object' || Array.isArray(v0)) {
            return null;
          }
          const v1 = (v0 as Record<string, JSONValue>)[k1];
          if (v1 === null || typeof v1 !== 'object' || Array.isArray(v1)) {
            return null;
          }
          return (v1 as Record<string, JSONValue>)[k2] ?? null;
        };
      }
      return cur => {
        let val: unknown = cur;
        for (let i = 0; i < len; i++) {
          if (val === null || typeof val !== 'object' || Array.isArray(val)) {
            return null;
          }
          val = (val as Record<string, JSONValue>)[chain[i]];
          if (val === undefined) {
            return null;
          }
        }
        return (val as JSONValue) ?? null;
      };
    }
  }

  switch (node.type) {
    case 'Field': {
      const name = node.name;
      return cur => {
        if (cur === null || typeof cur !== 'object' || Array.isArray(cur)) {
          return null;
        }
        return (cur as Record<string, JSONValue>)[name] ?? null;
      };
    }
    case 'Subexpression': {
      const left = compileNode(node.left);
      const right = compileNode(node.right);
      if (!left || !right) {
        return null;
      }
      return (cur, ctx) => {
        const v = left(cur, ctx);
        return v != null ? right(v, ctx) : null;
      };
    }
    case 'Pipe': {
      const left = compileNode(node.left);
      const right = compileNode(node.right);
      if (!left || !right) {
        return null;
      }
      return (cur, ctx) => right(left(cur, ctx), ctx);
    }
    case 'Index': {
      const idx = node.value;
      return cur => {
        if (!Array.isArray(cur)) {
          return null;
        }
        const pos = idx < 0 ? cur.length + idx : idx;
        return cur[pos] ?? null;
      };
    }
    case 'IndexExpression': {
      const left = compileNode(node.left);
      const right = compileNode(node.right);
      if (!left || !right) {
        return null;
      }
      return (cur, ctx) => right(left(cur, ctx), ctx);
    }
    case 'Projection': {
      const left = compileNode(node.left);
      const right = compileNode(node.right);
      if (!left || !right) {
        return null;
      }
      if (node.right.type === 'Field') {
        const key = node.right.name;
        return (cur, ctx) => {
          const items = left(cur, ctx);
          if (!Array.isArray(items)) {
            return null;
          }
          const out: JSONValue[] = [];
          for (let i = 0; i < items.length; i++) {
            const el = items[i];
            if (el !== null && typeof el === 'object' && !Array.isArray(el)) {
              const val = (el as Record<string, JSONValue>)[key];
              if (val !== undefined && val !== null) {
                out.push(val);
              }
            }
          }
          return out;
        };
      }
      return (cur, ctx) => {
        const items = left(cur, ctx);
        if (!Array.isArray(items)) {
          return null;
        }
        const out: JSONValue[] = [];
        for (let i = 0; i < items.length; i++) {
          const v = right(items[i], ctx);
          if (v !== null) {
            out.push(v);
          }
        }
        return out;
      };
    }
    case 'ValueProjection': {
      const left = compileNode(node.left);
      const right = compileNode(node.right);
      if (!left || !right) {
        return null;
      }
      return (cur, ctx) => {
        const base = left(cur, ctx);
        if (base === null || typeof base !== 'object' || Array.isArray(base)) {
          return null;
        }
        const items = Object.values(base);
        const out: JSONValue[] = [];
        for (let i = 0; i < items.length; i++) {
          const v = right(items[i], ctx);
          if (v !== null) {
            out.push(v);
          }
        }
        return out;
      };
    }
    case 'FilterProjection': {
      const left = compileNode(node.left);
      const cond = compileNode(node.condition);
      const right = compileNode(node.right);
      if (!left || !cond || !right) {
        return null;
      }
      if (node.right.type === 'Field') {
        const key = node.right.name;
        return (cur, ctx) => {
          const items = left(cur, ctx);
          if (!Array.isArray(items)) {
            return null;
          }
          const out: JSONValue[] = [];
          for (let i = 0; i < items.length; i++) {
            const el = items[i];
            if (!isFalse(cond(el, ctx))) {
              if (el !== null && typeof el === 'object' && !Array.isArray(el)) {
                const val = (el as Record<string, JSONValue>)[key];
                if (val !== undefined && val !== null) {
                  out.push(val);
                }
              }
            }
          }
          return out;
        };
      }
      return (cur, ctx) => {
        const items = left(cur, ctx);
        if (!Array.isArray(items)) {
          return null;
        }
        const out: JSONValue[] = [];
        for (let i = 0; i < items.length; i++) {
          const el = items[i];
          if (!isFalse(cond(el, ctx))) {
            const v = right(el, ctx);
            if (v !== null) {
              out.push(v);
            }
          }
        }
        return out;
      };
    }
    case 'OrExpression': {
      const left = compileNode(node.left);
      const right = compileNode(node.right);
      if (!left || !right) {
        return null;
      }
      return (cur, ctx) => {
        const l = left(cur, ctx);
        return isFalse(l) ? right(cur, ctx) : l;
      };
    }
    case 'AndExpression': {
      const left = compileNode(node.left);
      const right = compileNode(node.right);
      if (!left || !right) {
        return null;
      }
      return (cur, ctx) => {
        const l = left(cur, ctx);
        return isFalse(l) ? l : right(cur, ctx);
      };
    }
    case 'NotExpression': {
      const child = compileNode(node.child);
      if (!child) {
        return null;
      }
      return (cur, ctx) => isFalse(child(cur, ctx));
    }
    case 'Ternary': {
      const cond = compileNode(node.condition);
      const tExpr = compileNode(node.trueExpr);
      const fExpr = compileNode(node.falseExpr);
      if (!cond || !tExpr || !fExpr) {
        return null;
      }
      return (cur, ctx) => (!isFalse(cond(cur, ctx)) ? tExpr(cur, ctx) : fExpr(cur, ctx));
    }
    case 'Comparator': {
      const left = compileNode(node.left);
      const right = compileNode(node.right);
      if (!left || !right) {
        return null;
      }
      const name = node.name;
      if (name === 'EQ') {
        return (cur, ctx) => strictDeepEqual(left(cur, ctx), right(cur, ctx));
      }
      if (name === 'NE') {
        return (cur, ctx) => !strictDeepEqual(left(cur, ctx), right(cur, ctx));
      }
      return (cur, ctx) => compareOrdering(name, left(cur, ctx), right(cur, ctx));
    }
    case 'Literal': {
      const val = node.value;
      return () => val;
    }
    case 'Current':
    case 'Identity':
      return cur => cur;
    case 'Root':
      return (_cur, ctx) => ctx.root;
    case 'Flatten': {
      const child = compileNode(node.child);
      if (!child) {
        return null;
      }
      return (cur, ctx) => {
        const original = child(cur, ctx);
        return Array.isArray(original) ? (original.flat() as JSONValue) : null;
      };
    }
    case 'MultiSelectHash': {
      const pairs: { name: string; fn: FastEvaluatorFn }[] = [];
      for (const child of node.children) {
        const valFn = compileNode(child.value);
        if (!valFn) {
          return null;
        }
        pairs.push({ name: child.name, fn: valFn });
      }
      return (cur, ctx) => {
        const obj: Record<string, JSONValue> = {};
        for (let i = 0; i < pairs.length; i++) {
          obj[pairs[i].name] = pairs[i].fn(cur, ctx);
        }
        return obj;
      };
    }
    case 'MultiSelectList': {
      const fns: FastEvaluatorFn[] = [];
      for (const child of node.children) {
        const childFn = compileNode(child);
        if (!childFn) {
          return null;
        }
        fns.push(childFn);
      }
      return (cur, ctx) => {
        const arr: JSONValue[] = [];
        for (let i = 0; i < fns.length; i++) {
          arr.push(fns[i](cur, ctx));
        }
        return arr;
      };
    }
    case 'Function': {
      const fnName = node.name;
      const argFns: FastEvaluatorFn[] = [];
      for (const child of node.children) {
        if (child.type === 'ExpressionReference') {
          return null; // Expression references (&expref) delegate to TreeInterpreter
        }
        const afn = compileNode(child);
        if (!afn) {
          return null;
        }
        argFns.push(afn);
      }
      return (cur, ctx) => {
        const args: (JSONValue | ExpressionNode)[] = new Array(argFns.length);
        for (let i = 0; i < argFns.length; i++) {
          args[i] = argFns[i](cur, ctx);
        }
        return ctx.runtime.callFunction(fnName, args);
      };
    }
    default:
      return null;
  }
}

/**
 * Attempts to compile an AST node into a high-performance non-eval closure evaluator.
 * Returns `null` if the expression contains node types not specialized by the fast path
 * or if safety options (timeout, recursion depth ceiling, output limits) are configured.
 */
export function compileFastEvaluator(
  node: ExpressionNode,
  options: Options | undefined,
  runtime: Runtime,
): ((data: JSONValue) => JSONValue) | null {
  // If safety limits or custom options are passed, delegate to TreeInterpreter
  if (
    options &&
    (options.timeoutMs !== undefined ||
      options.maxDepth !== undefined ||
      options.maxNodes !== undefined ||
      options.maxOutputSize !== undefined)
  ) {
    return null;
  }

  const compiled = compileNode(node);
  if (!compiled) {
    return null;
  }

  return (data: JSONValue): JSONValue => {
    return compiled(data, {
      root: data,
      runtime,
    });
  };
}
