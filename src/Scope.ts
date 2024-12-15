import { JSONObject, JSONValue } from './JSON.type';

export class ScopeChain {
  private inner?: ScopeChain = undefined;
  private data: JSONObject = {};

  get currentScopeData(): JSONObject {
    return this.data;
  }

  public withScope(data: JSONObject): ScopeChain {
    const outer: ScopeChain = new ScopeChain();
    outer.inner = this;
    outer.data = data;
    return outer;
  }

  public getValue(identifier: string): JSONValue {
    if (Object.prototype.hasOwnProperty.call(this.data, identifier)) {
      return this.data[identifier];
    }

    if (this.inner) {
      return this.inner.getValue(identifier);
    }

    return null;
  }
}
