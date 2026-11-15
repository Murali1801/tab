import { describe, expect, it } from 'vitest';
import { computeShares, distribute, equalPercents, validateSplit } from '../src/core/split';
import { evaluateMinor } from '../src/core/expr';
import type { Split } from '../src/core/types';

const order = ['a', 'b', 'c', 'd'];
const sum = (m: Map<string, number>) => [...m.values()].reduce((x, y) => x + y, 0);

describe('distribute (remainder distribution)', () => {
  it('splits 100 paise three ways as 34/33/33, first in order gets the extra', () => {
    expect(distribute(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });

  it('gives leftovers to the largest fractional parts, not just the first', () => {
    // 10 by 1:2:2 -> exact 2, 4, 4 ; 11 by 1:2:2 -> 2.2, 4.4, 4.4 -> 2, 5, 4 (tie between b and c: b first)
    expect(distribute(10, [1, 2, 2])).toEqual([2, 4, 4]);
    expect(distribute(11, [1, 2, 2])).toEqual([2, 5, 4]);
    // 7 by 3:3:1 -> 3, 3, 1 exact ; 8 by 3:3:1 -> 3.43, 3.43, 1.14 -> 4, 3, 1
    expect(distribute(8, [3, 3, 1])).toEqual([4, 3, 1]);
  });

  it('is deterministic and always adds up', () => {
    for (let t = 0; t < 500; t++) {
      const total = Math.floor(Math.random() * 1e9);
      const w = Array.from({ length: 1 + Math.floor(Math.random() * 9) }, () => Math.floor(Math.random() * 20));
      if (!w.some((x) => x > 0)) w[0] = 1;
      const a = distribute(total, w);
      expect(a.reduce((x, y) => x + y, 0)).toBe(total);
      expect(distribute(total, w)).toEqual(a);
      // each part is within one unit of its exact value; zero weight gets zero
      const W = w.reduce((x, y) => x + y, 0);
      a.forEach((p, i) => {
        expect(Math.abs(p - (total * w[i]!) / W)).toBeLessThan(1 + 1e-6);
        if (w[i] === 0) expect(p).toBe(0);
      });
    }
  });

  it('handles huge amounts exactly with BigInt', () => {
    const big = 9_007_199_254_740_000;
    expect(distribute(big, [1, 1, 1]).reduce((x, y) => x + y, 0)).toBe(big);
  });

  it('rejects bad input', () => {
    expect(() => distribute(-1, [1])).toThrow();
    expect(() => distribute(10, [0, 0])).toThrow();
    expect(() => distribute(1.5, [1])).toThrow();
  });
});

describe('split methods', () => {
  it('equal: 1000.00 among 3 -> 333.34 / 333.33 / 333.33 in member order', () => {
    const s: Split = { method: 'equal', participants: ['c', 'a', 'b'] };
    const m = computeShares(100000, s, order);
    expect([...m.entries()]).toEqual([
      ['a', 33334],
      ['b', 33333],
      ['c', 33333],
    ]);
  });

  it('exact: uses the given amounts and validates the total', () => {
    const s: Split = { method: 'exact', values: { a: 50000, b: 30000, c: 20000 } };
    expect(validateSplit(100000, s)).toBeNull();
    expect(sum(computeShares(100000, s, order))).toBe(100000);
    expect(validateSplit(90000, s)).toMatch(/more/);
    expect(validateSplit(110000, s)).toMatch(/less/);
  });

  it('shares: 2:1:1 of 1201 paise', () => {
    const s: Split = { method: 'shares', values: { a: 2, b: 1, c: 1 } };
    const m = computeShares(1201, s, order);
    expect(m.get('a')).toBe(601); // 600.5 -> largest remainder goes to a
    expect(m.get('b')).toBe(300);
    expect(m.get('c')).toBe(300);
    expect(sum(m)).toBe(1201);
  });

  it('percent: basis points must make 100%', () => {
    const s: Split = { method: 'percent', values: { a: 5000, b: 2500, c: 2500 } };
    expect(validateSplit(999, s)).toBeNull();
    const m = computeShares(999, s, order);
    expect(sum(m)).toBe(999);
    // 499.5 / 249.75 / 249.75: the two .75 remainders win the leftover paise
    expect([m.get('a'), m.get('b'), m.get('c')]).toEqual([499, 250, 250]);
    expect(validateSplit(999, { method: 'percent', values: { a: 5000 } })).toMatch(/less than 100%/);
  });

  it('equalPercents adds up to 100% exactly', () => {
    const p = equalPercents(['a', 'b', 'c']);
    expect(Object.values(p)).toEqual([3334, 3333, 3333]);
  });

  it('zero-share members are left out', () => {
    const s: Split = { method: 'shares', values: { a: 1, b: 0, c: 1 } };
    expect([...computeShares(1000, s, order).keys()]).toEqual(['a', 'c']);
  });

  it('pairs with the expression parser: 1200+340/2 split 3 ways', () => {
    const amt = evaluateMinor('1200+340/2');
    expect(amt).toBe(137000);
    expect(sum(computeShares(amt, { method: 'equal', participants: ['a', 'b', 'c'] }, order))).toBe(amt);
  });
});
