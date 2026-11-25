export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export type JSONObject = Readonly<{ [member: string]: JSONValue }>;
export type JSONArrayKeyValuePairs = ReadonlyArray<[string, JSONValue]>;
export type JSONArrayArray = ReadonlyArray<JSONArray>;
export type JSONArray = ReadonlyArray<JSONValue>;
