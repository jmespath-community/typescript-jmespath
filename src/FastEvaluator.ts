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

function compileNode(node: ExpressionNode): FastEvaluatorFn | null {
  if (!node) {
    return () => null;
  }

  if (node.type === 'Subexpression') {
    const chain = tryFlattenFieldChain(node);
    if (chain) {
      const len = chain.length;
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
      return cur =>
        cur !== null && typeof cur === 'object' && !Array.isArray(cur)
          ? ((cur as Record<string, JSONValue>)[name] ?? null)
          : null;
    }
    case 'Subexpression':
    case 'Pipe':
    case 'IndexExpression': {
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
    case 'Projection': {
      const left = compileNode(node.left);
      const right = compileNode(node.right);
      if (!left || !right) {
        return null;
      }
      return (cur, ctx) => {
        const items = left(cur, ctx);
        if (!Array.isArray(items)) {
          return null;
        }
        const out: JSONValue[] = [];
        for (let i = 0; i < items.length; i++) {
          const res = right(items[i], ctx);
          if (res !== null) {
            out.push(res);
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
          const res = right(items[i], ctx);
          if (res !== null) {
            out.push(res);
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
      return (cur, ctx) => {
        const items = left(cur, ctx);
        if (!Array.isArray(items)) {
          return null;
        }
        const out: JSONValue[] = [];
        for (let i = 0; i < items.length; i++) {
          const el = items[i];
          if (!isFalse(cond(el, ctx))) {
            const res = right(el, ctx);
            if (res !== null) {
              out.push(res);
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
      const op = node.name;
      if (!left || !right) {
        return null;
      }
      if (op === 'EQ') {
        return (cur, ctx) => strictDeepEqual(left(cur, ctx), right(cur, ctx));
      }
      if (op === 'NE') {
        return (cur, ctx) => !strictDeepEqual(left(cur, ctx), right(cur, ctx));
      }
      return (cur, ctx) => {
        const a = left(cur, ctx);
        const b = right(cur, ctx);
        if (typeof a !== 'number' || typeof b !== 'number') {
          return null;
        }
        return op === 'GT' ? a > b : op === 'GTE' ? a >= b : op === 'LT' ? a < b : a <= b;
      };
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
        const res = child(cur, ctx);
        return Array.isArray(res) ? (res.flat() as JSONValue) : null;
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
          return null;
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

export function compileFastEvaluator(
  node: ExpressionNode,
  options: Options | undefined,
  runtime: Runtime,
): ((data: JSONValue) => JSONValue) | null {
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

  return (data: JSONValue): JSONValue =>
    compiled(data, {
      root: data,
      runtime,
    });
}
