import type { Minor, Transfer } from './types';

export type Balance = readonly [id: string, amount: Minor];

/** The largest debtor pays the largest creditor until everyone is at zero. At most n-1 transfers. */
export function greedySettle(balances: readonly Balance[]): Transfer[] {
  const people = balances.filter(([, a]) => a !== 0).map(([id, a], i) => ({ id, a, i }));
  const out: Transfer[] = [];
  for (;;) {
    let cred: (typeof people)[number] | undefined;
    let debt: (typeof people)[number] | undefined;
    for (const p of people) {
      if (p.a > 0 && (!cred || p.a > cred.a)) cred = p;
      if (p.a < 0 && (!debt || p.a < debt.a)) debt = p;
    }
    if (!cred || !debt) break;
    const amount = Math.min(cred.a, -debt.a);
    out.push({ from: debt.id, to: cred.id, amount });
    cred.a -= amount;
    debt.a += amount;
  }
  return out;
}

export const EXACT_LIMIT = 12;

/**
 * Provably minimal plan. A set of n non-zero balances split into k groups that
 * each sum to zero can be settled in n - k transfers, and no plan does better,
 * so we maximise k with a DP over subsets (2^n * n, fine for n <= 12), then run
 * greedy inside each group. Returns null when there are too many people.
 */
export function exactSettle(balances: readonly Balance[], limit = EXACT_LIMIT): Transfer[] | null {
  const nz = balances.filter(([, a]) => a !== 0);
  const n = nz.length;
  if (n > limit) return null;
  if (n === 0) return [];
  const full = (1 << n) - 1;
  const sum = new Float64Array(full + 1);
  for (let m = 1; m <= full; m++) {
    const low = m & -m;
    sum[m] = sum[m ^ low]! + nz[31 - Math.clz32(low)]![1];
  }
  const dp = new Int8Array(full + 1);
  for (let m = 1; m <= full; m++) {
    let best = 0;
    for (let r = m; r; r &= r - 1) {
      const v = dp[m ^ (r & -r)]!;
      if (v > best) best = v;
    }
    dp[m] = best + (sum[m] === 0 ? 1 : 0);
  }
  // Walk back from the full set, removing one element at a time along an optimal path.
  const removed: number[] = [];
  let m = full;
  while (m) {
    const bonus = sum[m] === 0 ? 1 : 0;
    let pick = -1;
    for (let i = 0; i < n; i++) {
      if (m & (1 << i) && dp[m ^ (1 << i)]! + bonus === dp[m]) {
        pick = i;
        break;
      }
    }
    removed.push(pick);
    m ^= 1 << pick;
  }
  // Adding elements back in reverse order, every zero-sum prefix closes a group.
  const out: Transfer[] = [];
  let group: number[] = [];
  let acc = 0;
  for (let k = removed.length - 1; k >= 0; k--) {
    const i = removed[k]!;
    group.push(i);
    acc += nz[i]![1];
    if (acc === 0) {
      group.sort((a, b) => a - b);
      out.push(...greedySettle(group.map((g) => nz[g]!)));
      group = [];
    }
  }
  return out;
}

export interface SettlePlan {
  transfers: Transfer[];
  method: 'exact' | 'greedy';
  greedyCount: number;
}

export function settlePlan(balances: readonly Balance[]): SettlePlan {
  const greedy = greedySettle(balances);
  const exact = exactSettle(balances);
  if (exact && exact.length <= greedy.length) return { transfers: exact, method: 'exact', greedyCount: greedy.length };
  return { transfers: greedy, method: 'greedy', greedyCount: greedy.length };
}
