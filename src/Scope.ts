import { ScopeEntry, ScopeItem } from './Parser.type';

export class ScopeChain {
  private inner?: ScopeChain = undefined;
  private data: ScopeEntry = {};

  public withScope(data: ScopeEntry): ScopeChain {
    const outer: ScopeChain = new ScopeChain();
    outer.inner = this;
    outer.data = data;
    return outer;
  }

  public getValue(identifier: string): ScopeItem {
    if (identifier in this.data) {
      const result = this.data[identifier];
      if (result !== null && result !== undefined) {
        return result;
      }
    }
    if (this.inner) {
      return this.inner.getValue(identifier);
    }
    return null;
  }
}
