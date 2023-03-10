export type ObjectDict<T = unknown> = Record<string, T | undefined>;

export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export type JSONObject = { [member: string]: JSONValue };
export type JSONArrayObject = JSONObject[];
export type JSONArrayKeyValuePairs = [string, JSONValue][];
export type JSONArrayArray = JSONArray[];
export type JSONArray = JSONValue[];
