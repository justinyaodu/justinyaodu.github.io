# Costco is a CPU

```json
{ "date": "2023-12-18" }
```

## Fetch

Generally, a processor's instructions are stored in memory, so it needs to _fetch_ the instructions from memory before executing them. In many high-performance processors, instructions are fetched into a _reorder buffer_ (ROB), which keeps track of hundreds of instructions until they finish. Costco Wholesale is no exception:

<figure>

![A drawing of Costco Wholesale from the outside. The parking lot is labeled "reorder buffer", the adjacent street is labeled "memory bus", and the traffic lights are labeled as "memory controllers".](/images/costco-frontend.png)

<figcaption>The Costco Wholesale frontend.</figcaption>
</figure>

A larger ROB can keep track of more unfinished instructions, but also uses more area. Thankfully, implementers can configure the size of the ROB, depending on their performance and area requirements.

## Execute

In Costco, there are no control or data dependencies between instructions. Thus, an instruction is always ready to execute once it gets an ROB entry. There is still some delay between fetch and execute, however; the latency is proportional to the distance between the ROB entry and the rest of the core:

<figure>

![A top-down drawing of the Costco entrance and parking lot. An arrow labeled "low latency" points to the entrance from a nearby parking space. An arrow labeled "high latency" points to the entrance from a distant parking space.](/images/costco-fetch-execute-latency.png)

<figcaption>Comparing the latency between fetch and execute for two ROB entries.</figcaption>
</figure>

When a Costco instruction executes, it will load some number of items. The types and quantities of items loaded can vary significantly between instructions. Each instruction is accompanied by a very large item wagon (VLIW), which stores the items loaded so far:

<figure>

![A drawing of a shopping cart.](/images/costco-vliw.png)

<figcaption>A very large item wagon.</figcaption>
</figure>

Costco has a unique cache subsystem consisting of many small cache nodes for each type of item, linked by a mesh interconnect. Instructions move between the nodes and load the items that they need. This means that hundreds of instructions can be executing in parallel at different nodes, providing extremely high throughput.

The mesh has no fixed routing algorithm; instead, each instruction also determines its own routing. This flexibility sounds nice, but in practice, it often creates unnecessary congestion on the mesh.

Cache nodes are optimized for density instead of bandwidth, so they only support a small number of concurrent accesses. If too many instructions attempt to access the same node at the same time, this creates a structural hazard and some of them will stall.

<figure>

![A drawing of six in-store displays and the aisles between them, forming a grid layout. The displays are labeled as "cache nodes", and the aisles are labeled with "mesh interconnect". Four shopping carts surround one of the displays, blocking a fifth shopping cart labeled with "stalled instruction".](/images/costco-mesh.png)

<figcaption>When four instructions are already accessing the central cache node, the fifth instruction stalls.</figcaption>
</figure>

Within a cache node, most loads are serviced by items prefetched into an L1 cache. An L1 cache hit typically takes a few seconds. Some nodes also have a 3D stacked L2 cache, but this can take many minutes to access:

<figure>

![A drawing of a tall warehouse-style shelf. The bottom shelf has a few dozen ambiguous red boxes, and is labeled "L1 cache". The shelf above it has two large pallets of shrink-wrapped red boxes, and is labeled "L2 cache".](/images/costco-3d-cache.png)

<figcaption>A cache node with an L1 and an L2.</figcaption>
</figure>

Loads rarely miss in both levels of the cache, but when they do, the resulting access to main memory can take hours to days. With this extreme memory latency, aggressive prefetching is essential to maintain reasonable access times. Additionally, each memory operation has a significant overhead, so Costco uses large transfer sizes to make better use of the available bandwidth.

<figure>

![A drawing of a semi truck. The trailer has a Costco Wholesale logo.](/images/costco-memory-transfer.png)

<figcaption>A large memory transfer in progress.</figcaption>
</figure>

## Retire

As mentioned previously, there are no dependencies between Costco instructions, so they do not need to retire in any particular order. However, Costco's memory model guarantees that the same item will never be read by two different instructions. Thus, when an instruction finishes executing, it goes to one of the _retire units_ so that all of its loaded items can be accounted for.

Costco has a mix of fast and slow retire units. The fast retire units have low latency, but they use more power and area; conversely, the slow retire units have much higher latency, but use less power and area. This heterogeneous design provides a balance between throughput and energy consumption for different workloads. When the number of instructions in the pipeline is low, the fast retire units are often _power gated_ (turned off) to save even more energy.

<figure>

![A drawing of a Costco checkout. The two self-checkouts are labeled as "slow retire units". The large light on top of the self-checkout, which indicates whether it is in use, is labeled with "busy bit". Two regular checkouts are labeled as "fast retire units". One of them has two shopping carts lined up. The other one is not used, and has a sign saying "CLOSED". The sign is labeled with "power gating".](/images/costco-retire.png)

<figcaption>Comparing the fast and slow retire units.</figcaption>
</figure>

Each active retire unit has a queue of instructions waiting for it. The instructions in a queue are generally retired first-in-first-out, with one exception: if a retire unit is reactivated after being power gated, it will fill its queue by stealing arbitrary instructions from the queues of adjacent retire units.

## Handling Misspeculation

In Costco, most loads are treated as speculative loads, and can be reverted later if needed. However, it varies depending on the type of item. See Costco's [misspeculation policy](https://customerservice.costco.com/app/answers/answer_view/a_id/1191) for details.
