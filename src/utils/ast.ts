import type { ExpressionNode, FunctionNode } from '../AST.type';
import type { Options } from '../Parser.type';

const CHILD_PROPS = ['left', 'right', 'condition', 'child', 'operand', 'trueExpr', 'falseExpr', 'expression'] as const;

function pushChildren(node: ExpressionNode, stack: ExpressionNode[]): void {
  const n = node as unknown as Record<string, unknown>;

  for (const prop of CHILD_PROPS) {
    const val = n[prop];
    if (val && typeof val === 'object' && 'type' in val) {
      stack.push(val as ExpressionNode);
    }
  }

  if (Array.isArray(n.children)) {
    for (const item of n.children) {
      if (!item) {
        continue;
      }
      stack.push(item);
      if (item.type === 'KeyValuePair' && item.value) {
        stack.push(item.value);
      }
    }
  }

  if (Array.isArray(n.bindings)) {
    for (const item of n.bindings) {
      if (!item) {
        continue;
      }
      stack.push(item);
      if (item.reference) {
        stack.push(item.reference);
      }
    }
  }
}

export function forEachNode(root: ExpressionNode, visitor: (node: ExpressionNode) => boolean): void {
  const stack: ExpressionNode[] = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      break;
    }
    if (visitor(current) === false) {
      return;
    }
    pushChildren(current, stack);
  }
}

export function countNodes(root: ExpressionNode): number {
  let count = 0;
  forEachNode(root, () => {
    count += 1;
    return true;
  });
  return count;
}

export function findDisallowedFunction(root: ExpressionNode, options: Options): string | null {
  const { allowedFunctions, disallowedFunctions } = options;
  if (!allowedFunctions && !disallowedFunctions) {
    return null;
  }

  let violation: string | null = null;
  forEachNode(root, node => {
    if (node.type !== 'Function') {
      return true;
    }
    const name = (node as FunctionNode).name;

    if (allowedFunctions && !allowedFunctions.includes(name)) {
      violation = `Function '${name}' is not allowed`;
      return false;
    }

    if (disallowedFunctions && disallowedFunctions.includes(name)) {
      violation = `Function '${name}' is disallowed`;
      return false;
    }

    return true;
  });

  return violation;
}
