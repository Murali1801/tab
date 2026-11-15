import { describe, expect, it } from 'vitest';
import { computeBalances, pairwiseDebtCount } from '../src/core/balances';
import { exactSettle, greedySettle, settlePlan, type Balance } from '../src/core/settle';
import type { Expense, Group, Transfer } from '../src/core/types';

const members = ['asha', 'ravi', 'priya', 'kabir'].map((id) => ({ id, name: id, updatedAt: 0 }));
const group: Pick<Group, 'members'> = { members };
let n = 0;
const exp = (payerId: string, amount: number, split: Expense['split'], extra: Partial<Expense> = {}): Expense => ({
  id: 'e' + n++,
  groupId: 'g',
  kind: 'expense',
  title: 't',
  amount,
  payerId,
  split,
  date: 0,
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});

/** Apply transfers to balances and check everyone ends at exactly zero. */
function settles(bal: readonly Balance[], ts: Transfer[]) {
  const m = new Map(bal);
  for (const t of ts) {
    expect(t.amount).toBeGreaterThan(0);
    expect(Number.isInteger(t.amount)).toBe(true);
    m.set(t.from, m.get(t.from)! + t.amount);
    m.set(t.to, m.get(t.to)! - t.amount);
  }
  for (const v of m.values()) expect(v === 0).toBe(true);
}

// Seeded PRNG so property tests are reproducible.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}
function randomBalances(r: () => number, size: number, pool?: number[]): Balance[] {
  const vals = Array.from({ length: size - 1 }, () => (pool ? pool[Math.floor(r() * pool.length)]! : Math.round((r() - 0.5) * 2e6)));
  vals.push(-vals.reduce((a, b) => a + b, 0));
  return vals.map((v, i) => ['m' + i, v] as const);
}

describe('balances', () => {
  it('nets paid minus owed and sums to zero', () => {
    const es = [
      exp('asha', 120000, { method: 'equal', participants: ['asha', 'ravi', 'priya'] }),
      exp('ravi', 30000, { method: 'exact', values: { asha: 10000, kabir: 20000 } }),
      exp('priya', 1001, { method: 'shares', values: { priya: 1, kabir: 2 } }),
      exp('kabir', 99999, { method: 'equal', participants: ['asha'] }, { deleted: true }),
    ];
    const b = computeBalances(group, es);
    expect(b.get('asha')).toBe(120000 - 40000 - 10000);
    expect(b.get('ravi')).toBe(30000 - 40000);
    expect(b.get('kabir')).toBe(-20000 - 667);
    expect([...b.values()].reduce((x, y) => x + y, 0)).toBe(0);
  });

  it('a settle-up payment moves both balances toward zero', () => {
    const es = [exp('asha', 10000, { method: 'equal', participants: ['asha', 'ravi'] })];
    es.push(exp('ravi', 5000, { method: 'exact', values: { asha: 5000 } }, { kind: 'payment' }));
    const b = computeBalances(group, es);
    expect(b.get('asha')).toBe(0);
    expect(b.get('ravi')).toBe(0);
  });

  it('counts unsimplified pairwise debts honestly', () => {
    const es = [
      exp('asha', 300, { method: 'equal', participants: ['asha', 'ravi', 'priya'] }),
      exp('ravi', 300, { method: 'equal', participants: ['asha', 'ravi', 'priya'] }),
    ];
    // ravi->asha 100 and asha->ravi 100 cancel; priya owes both
    expect(pairwiseDebtCount(group, es)).toBe(2);
  });
});

describe('settle-up', () => {
  it('greedy: largest debtor pays largest creditor', () => {
    const bal: Balance[] = [
      ['a', 500],
      ['b', -300],
      ['c', -200],
    ];
    expect(greedySettle(bal)).toEqual([
      { from: 'b', to: 'a', amount: 300 },
      { from: 'c', to: 'a', amount: 200 },
    ]);
  });

  it('exact finds every zero-sum pair: 6 people, 3 transfers', () => {
    const bal: Balance[] = [
      ['a', 10],
      ['b', 9],
      ['c', -9],
      ['d', -10],
      ['e', 3],
      ['f', -3],
    ];
    const g = greedySettle(bal);
    const x = exactSettle(bal)!;
    settles(bal, g);
    settles(bal, x);
    expect(x.length).toBe(3); // three zero-sum pairs -> 6 - 3
    expect(g.length).toBeGreaterThanOrEqual(x.length);
  });

  it('known case where greedy is not minimal', () => {
    // greedy pairs 7 with -6 first and leaves crumbs (4 transfers);
    // exact finds the zero-sum groups {7,-4,-3} and {6,-6}: 5 - 2 = 3 transfers
    const bal: Balance[] = [
      ['a', 7],
      ['b', 6],
      ['c', -6],
      ['d', -4],
      ['e', -3],
    ];
    const g = greedySettle(bal);
    const x = exactSettle(bal)!;
    settles(bal, g);
    settles(bal, x);
    expect(x.length).toBe(3); // n=5, k=2 -> 3
    expect(g.length).toBe(4);
    const plan = settlePlan(bal);
    expect(plan.method).toBe('exact');
    expect(plan.transfers.length).toBe(3);
    expect(plan.greedyCount).toBe(4);
  });

  it('empty and already-settled groups need no transfers', () => {
    expect(exactSettle([])).toEqual([]);
    expect(exactSettle([['a', 0]])).toEqual([]);
    expect(greedySettle([['a', 0]])).toEqual([]);
  });

  it('falls back to greedy above the exact limit', () => {
    const r = rng(7);
    const bal = randomBalances(r, 14);
    expect(exactSettle(bal)).toBeNull();
    const plan = settlePlan(bal);
    expect(plan.method).toBe('greedy');
    settles(bal, plan.transfers);
  });

  it('property: random groups always net to zero, exact <= greedy <= n-1', () => {
    const r = rng(42);
    for (let t = 0; t < 400; t++) {
      const size = 2 + Math.floor(r() * 11); // 2..12
      // a small value pool makes zero-sum subsets common, which is where exact wins
      const bal = randomBalances(r, size, t % 2 ? [500, -500, 1200, -700, 300, -300, -1200] : undefined);
      const nonZero = bal.filter(([, a]) => a !== 0).length;
      const g = greedySettle(bal);
      const x = exactSettle(bal)!;
      settles(bal, g);
      settles(bal, x);
      expect(x.length).toBeLessThanOrEqual(g.length);
      expect(g.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
    }
  });

  it('property: exact matches brute force on small groups', () => {
    const r = rng(99);
    // brute force: minimum transfers = n - (max number of disjoint zero-sum subsets), by trying all partitions
    function bruteK(vals: number[]): number {
      if (!vals.length) return 0;
      let best = 0;
      const [first, ...rest] = vals;
      const m = rest.length;
      for (let mask = 0; mask < 1 << m; mask++) {
        let s = first!;
        const others: number[] = [];
        for (let i = 0; i < m; i++) (mask & (1 << i) ? (s += rest[i]!) : others.push(rest[i]!));
        if (s === 0) best = Math.max(best, 1 + bruteK(others));
      }
      return best;
    }
    for (let t = 0; t < 120; t++) {
      const size = 2 + Math.floor(r() * 6);
      const bal = randomBalances(r, size, [100, -100, 200, -200, 300, -300, 50]);
      const nz = bal.map(([, a]) => a).filter((a) => a !== 0);
      expect(exactSettle(bal)!.length).toBe(nz.length - bruteK(nz));
    }
  });
});
