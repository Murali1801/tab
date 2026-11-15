import type { Minor, Split } from './types';

/**
 * Split `total` minor units by integer weights so the parts add up exactly.
 * Each part gets floor(total * w / W); the leftover units go one each to the
 * largest fractional remainders, ties broken by position (stable, deterministic).
 * BigInt keeps total * w exact for any realistic amount.
 */
export function distribute(total: Minor, weights: readonly number[]): Minor[] {
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError('total must be a non-negative integer');
  for (const w of weights) {
    if (!Number.isSafeInteger(w) || w < 0) throw new RangeError('weights must be non-negative integers');
  }
  const W = weights.reduce((a, b) => a + b, 0);
  if (W === 0) throw new RangeError('weights must not all be zero');
  const T = BigInt(total);
  const BW = BigInt(W);
  const parts: number[] = [];
  const rems: bigint[] = [];
  let given = 0;
  for (const w of weights) {
    const p = T * BigInt(w);
    const q = Number(p / BW);
    parts.push(q);
    rems.push(p % BW);
    given += q;
  }
  let left = total - given;
  const order = weights.map((_, i) => i).sort((a, b) => {
    const d = rems[b]! - rems[a]!;
    return d > 0n ? 1 : d < 0n ? -1 : a - b;
  });
  for (let k = 0; left > 0; k++, left--) parts[order[k]!]! += 1;
  return parts;
}

/** Members that carry part of the cost, in the given member order. */
export function splitParticipants(split: Split, order: readonly string[]): string[] {
  const ids = split.method === 'equal' ? split.participants : Object.keys(split.values).filter((id) => (split.values[id] ?? 0) > 0);
  const set = new Set(ids);
  const ordered = order.filter((id) => set.has(id));
  // ids not in the member list (should not happen) keep a stable order at the end
  for (const id of [...set].sort()) if (!order.includes(id)) ordered.push(id);
  return ordered;
}

/** Returns null when the split is valid for the amount, else a short reason. */
export function validateSplit(amount: Minor, split: Split): string | null {
  if (!Number.isSafeInteger(amount) || amount <= 0) return 'Enter an amount';
  if (split.method === 'equal') {
    return split.participants.length ? null : 'Pick at least one person';
  }
  const vals = Object.values(split.values);
  if (vals.some((v) => !Number.isSafeInteger(v) || v < 0)) return 'Use whole, positive values';
  const sum = vals.reduce((a, b) => a + b, 0);
  if (sum === 0) return 'Pick at least one person';
  if (split.method === 'exact' && sum !== amount) return sum < amount ? 'Amounts add up to less than the total' : 'Amounts add up to more than the total';
  if (split.method === 'percent' && sum !== 10000) return sum < 10000 ? 'Percentages add up to less than 100%' : 'Percentages add up to more than 100%';
  return null;
}

/** What each member owes for this expense. Parts always add up to `amount`. */
export function computeShares(amount: Minor, split: Split, order: readonly string[]): Map<string, Minor> {
  const ids = splitParticipants(split, order);
  const out = new Map<string, Minor>();
  if (!ids.length) return out;
  if (split.method === 'exact') {
    for (const id of ids) out.set(id, split.values[id] ?? 0);
    return out;
  }
  const weights = split.method === 'equal' ? ids.map(() => 1) : ids.map((id) => split.values[id] ?? 0);
  const parts = distribute(amount, weights);
  ids.forEach((id, i) => out.set(id, parts[i]!));
  return out;
}

/** Equal percentages in basis points that add up to exactly 100%. */
export function equalPercents(ids: readonly string[]): Record<string, number> {
  const parts = ids.length ? distribute(10000, ids.map(() => 1)) : [];
  return Object.fromEntries(ids.map((id, i) => [id, parts[i]!]));
}
