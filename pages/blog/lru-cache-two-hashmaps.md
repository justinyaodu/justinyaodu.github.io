# Making an LRU cache out of two hashmaps

```json
{ "date": "2023-12-02" }
```

Look ma, no linked lists!

## Background

An [LRU cache](https://redis.com/glossary/lru-cache/) with a capacity of $n$ elements should:

1. Set a key-value pair in $\mathcal{O}(1)$ time
2. Get the value associated with one of the $n$ most recently used keys in $\mathcal{O}(1)$ time
3. Use $\mathcal{O}(n)$ memory

A hashmap has $\mathcal{O}(1)$ set and get, but if you never remove anything, it uses more than $\mathcal{O}(n)$ space. Typical LRU cache implementations pair a hashmap with a doubly linked list, which orders keys by how recently they were used. This enables efficient identification and removal of the least recently used key to maintain $\mathcal{O}(n)$ memory usage.

I promised no linked lists though, so let's try something else.

## The algorithm

Instead of using one hashmap, we use two hashmaps of different sizes:

1. The _leader_ caches the $n_1$ most recent keys, where $n_1$ changes over time, but is always **at least** $n$.
2. The _follower_ caches the $n_2$ most recent keys, where $n_2$ changes over time, but is always **less than** $n$.

> `aside.info`
>
> If fewer than $n$ keys have been used so far, let's say $k$, then $n_1 = k$ instead.

Since $n_1 \ge n$, the leader contains all the keys that an LRU cache with a capacity of $n$ would have, so we make the leader handle all the get and set operations. Whenever we access the leader, we also update the follower with the corresponding key-value pair.

The leader and the follower both grow over time, but preventing unbounded growth is actually quite straightforward. Once the follower reaches a size of $n$, we replace the leader with the follower, and create a new, empty follower. This preserves our invariants, $n_1 \ge n$ and $n_2 < n$, and evicts the keys that are not in the $n$ most recently used. Deallocating the old leader may take $\mathcal{O}(n)$ time, but we only do this once every $n$ operations in the worst case, so each operation is still amortized $\mathcal{O}(1)$.

The size of the leader is always less than $2n$, because any operation that increases the leader's size will also increase the follower's size, and we replace the leader after the follower's size increases $n$ times. Thus, the space complexity is the desired $\mathcal{O}(n)$.

## Implementation

In TypeScript:

```ts
// I release this code into the public domain - feel free to use it!

// This work is marked with CC0 1.0. To view a copy of this
// license, visit https://creativecommons.org/publicdomain/zero/1.0

class LRUCache<K, V> {
  private leader = new Map<K, V>();
  private follower = new Map<K, V>();

  constructor(private readonly capacity: number) {}

  set(key: K, value: V): void {
    this.leader.set(key, value);
    this.follow(key, value);
  }

  get(key: K): V | undefined {
    if (!this.leader.has(key)) {
      return undefined;
    }
    const value = this.leader.get(key)!;
    this.follow(key, value);
    return value;
  }

  private follow(key: K, value: V): void {
    this.follower.set(key, value);
    if (this.follower.size === this.capacity) {
      this.leader = this.follower;
      this.follower = new Map();
    }
  }
}
```

> `aside.info`
>
> If you want to avoid deallocating the leader and allocating a new follower, you can swap the leader and follower, then clear the follower. I haven't benchmarked it though, and I thought the approach used above would be easier to understand.

## Should I use this?

This approach is primarily useful if your hashmaps don't preserve the insertion order of keys. If they do, there's an even easier implementation: remove and reinsert existing keys whenever you access them, and remove the first key (which is also the least recently used) when the capacity is exceeded.

Hashmaps that preserve insertion order include JavaScript's [`Map`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map), Python's [`dict`](https://docs.python.org/3/library/stdtypes.html#dict) (since [3.7](https://docs.python.org/3/whatsnew/3.7.html#summary-release-highlights)) and [`OrderedDict`](https://docs.python.org/3/library/collections.html#collections.OrderedDict), and Java's [`LinkedHashMap`](https://docs.oracle.com/javase/8/docs/api/java/util/LinkedHashMap.html). Python also has [`functools.lru_cache`](https://docs.python.org/3/library/functools.html#functools.lru_cache) in the standard library, which lets you wrap an LRU cache around any pure function.

But if all else fails, at least you won't need a linked list!
