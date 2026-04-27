export interface TopoNode {
  name: string;
  dependsOn: string[];
}

export interface TopoResult<T extends TopoNode> {
  waves: T[][];
  flat: T[];
}

export function topoSort<T extends TopoNode>(nodes: readonly T[]): TopoResult<T> {
  const byName = new Map<string, T>();
  for (const n of nodes) {
    if (byName.has(n.name)) {
      throw new Error(`topo-sort: duplicate node name: ${n.name}`);
    }
    byName.set(n.name, n);
  }

  for (const n of nodes) {
    for (const dep of n.dependsOn) {
      if (!byName.has(dep)) {
        throw new Error(`topo-sort: node "${n.name}" depends on unknown "${dep}"`);
      }
    }
  }

  const remaining = new Map<string, Set<string>>();
  for (const n of nodes) {
    remaining.set(n.name, new Set(n.dependsOn));
  }

  const waves: T[][] = [];
  const flat: T[] = [];

  while (remaining.size > 0) {
    const ready: T[] = [];
    for (const [name, deps] of remaining) {
      if (deps.size === 0) {
        const node = byName.get(name);
        if (node) ready.push(node);
      }
    }
    if (ready.length === 0) {
      const stuck = [...remaining.keys()].join(', ');
      throw new Error(`topo-sort: dependency cycle involving: ${stuck}`);
    }
    ready.sort((a, b) => a.name.localeCompare(b.name));
    waves.push(ready);
    for (const r of ready) {
      flat.push(r);
      remaining.delete(r.name);
      for (const deps of remaining.values()) {
        deps.delete(r.name);
      }
    }
  }

  return { waves, flat };
}

export function reverseTopoOrder<T extends TopoNode>(nodes: readonly T[]): T[] {
  const { flat } = topoSort(nodes);
  return [...flat].reverse();
}
