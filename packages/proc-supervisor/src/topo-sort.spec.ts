import { describe, expect, test } from 'bun:test';
import { reverseTopoOrder, topoSort } from './topo-sort.ts';

describe('topoSort', () => {
  test('orders independent nodes alphabetically in a single wave', () => {
    const r = topoSort([
      { name: 'b', dependsOn: [] },
      { name: 'a', dependsOn: [] },
    ]);
    expect(r.waves).toEqual([
      [
        { name: 'a', dependsOn: [] },
        { name: 'b', dependsOn: [] },
      ],
    ]);
    expect(r.flat.map((n) => n.name)).toEqual(['a', 'b']);
  });

  test('orders dependents into later waves (BLUEPRINT §3.4)', () => {
    const services = [
      { name: 'trader', dependsOn: ['ctrader-gateway', 'news'] },
      { name: 'news', dependsOn: [] },
      { name: 'ctrader-gateway', dependsOn: [] },
      { name: 'dashboard', dependsOn: [] },
    ];
    const r = topoSort(services);
    expect(r.waves[0]?.map((n) => n.name)).toEqual(['ctrader-gateway', 'dashboard', 'news']);
    expect(r.waves[1]?.map((n) => n.name)).toEqual(['trader']);
  });

  test('rejects cycles', () => {
    expect(() =>
      topoSort([
        { name: 'a', dependsOn: ['b'] },
        { name: 'b', dependsOn: ['a'] },
      ]),
    ).toThrow(/cycle/i);
  });

  test('rejects unknown deps', () => {
    expect(() => topoSort([{ name: 'a', dependsOn: ['ghost'] }])).toThrow(/unknown/i);
  });

  test('rejects duplicate names', () => {
    expect(() =>
      topoSort([
        { name: 'a', dependsOn: [] },
        { name: 'a', dependsOn: [] },
      ]),
    ).toThrow(/duplicate/i);
  });

  test('reverseTopoOrder reverses the flat order', () => {
    const r = reverseTopoOrder([
      { name: 'trader', dependsOn: ['gw'] },
      { name: 'gw', dependsOn: [] },
    ]);
    expect(r.map((n) => n.name)).toEqual(['trader', 'gw']);
  });
});
