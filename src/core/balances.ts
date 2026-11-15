import { computeShares } from './split';
import type { Expense, Group, Minor } from './types';

/** Net per member: what they paid minus what they owe. Positive = owed money. Sums to 0. */
export function computeBalances(group: Pick<Group, 'members'>, expenses: readonly Expense[]): Map<string, Minor> {
  const order = group.members.map((m) => m.id);
  const net = new Map<string, Minor>(order.map((id) => [id, 0]));
  for (const e of expenses) {
    if (e.deleted) continue;
    net.set(e.payerId, (net.get(e.payerId) ?? 0) + e.amount);
    for (const [id, part] of computeShares(e.amount, e.split, order)) {
      net.set(id, (net.get(id) ?? 0) - part);
    }
  }
  return net;
}

/**
 * Number of payments if nobody simplified anything: every participant pays each
 * payer back directly, netted per pair. This is the honest "instead of M" figure.
 */
export function pairwiseDebtCount(group: Pick<Group, 'members'>, expenses: readonly Expense[]): number {
  const order = group.members.map((m) => m.id);
  const pair = new Map<string, Minor>();
  for (const e of expenses) {
    if (e.deleted) continue;
    for (const [id, part] of computeShares(e.amount, e.split, order)) {
      if (id === e.payerId || part === 0) continue;
      // id owes payer `part`; store with a canonical key a<b
      const [a, b, sign] = id < e.payerId ? [id, e.payerId, 1] : [e.payerId, id, -1];
      const k = a + '\u0000' + b;
      pair.set(k, (pair.get(k) ?? 0) + sign * part);
    }
  }
  let n = 0;
  for (const v of pair.values()) if (v !== 0) n++;
  return n;
}

/** Totals for a group: spend excludes settle-up payments. */
export function groupSpend(expenses: readonly Expense[]): Minor {
  let s = 0;
  for (const e of expenses) if (!e.deleted && e.kind === 'expense') s += e.amount;
  return s;
}
