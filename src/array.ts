function findOne<T>(items: T[], predicate: (item: T) => boolean): T {
  const filtered = items.filter(predicate);
  if (filtered.length !== 1) {
    throw new Error(
      `Expected 1 element matching predicate, got ${items.length}`,
    );
  }
  return filtered[0];
}

export { findOne };
