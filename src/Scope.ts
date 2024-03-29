import { JSONObject, JSONValue } from './JSON.type';

export class ScopeChain {
  private inner?: ScopeChain = undefined;
  private data: JSONObject = {};

  public withScope(data: JSONObject): ScopeChain {
    const outer: ScopeChain = new ScopeChain();
    outer.inner = this;
    outer.data = data;
    return outer;
  }

  public getValue(identifier: string): JSONValue {
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
