function getOrSetComputed<K, V>(
  map: Map<K, V>,
  key: K,
  callback: (key: K) => V,
): V {
  const existing = map.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const value = callback(key);
  map.set(key, value);
  return value;
}

export { getOrSetComputed };
