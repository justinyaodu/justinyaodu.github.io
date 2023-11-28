type Serializable =
  | boolean
  | null
  | number
  | string
  | readonly Serializable[]
  | { readonly [k: string]: Serializable };

function deserialize<T extends Serializable>(s: string): T {
  return JSON.parse(s) as T;
}

function serialize(s: Serializable): string {
  return JSON.stringify(s);
}

export { type Serializable, serialize, deserialize };
