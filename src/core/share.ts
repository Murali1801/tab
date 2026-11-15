/**
 * Share a group without a server: the group is packed into compact JSON,
 * deflated, base64url-encoded and put in the URL fragment (#g=...). Fragments
 * never reach a server, not even the one hosting the app.
 */
import { validateSplit } from './split';
import type { Expense, Group, Member, Split } from './types';

export class ShareError extends Error {}

export interface SharedGroup {
  group: Group;
  expenses: Expense[];
}

const VERSION = 1;
const MAX_AMOUNT = 1e13;

// ---------- compact wire format ----------
type WMember = [id: string, name: string, upi: string, updatedAt: number];
type WSplit = ['e', string[]] | ['x' | 's' | 'p', Record<string, number>];
type WExpense = [id: string, kind: 0 | 1, title: string, amount: number, payer: string, split: WSplit, date: number, createdAt: number, updatedAt: number, deleted: 0 | 1];
interface Wire {
  v: number;
  g: [id: string, name: string, currency: string, createdAt: number, updatedAt: number, members: WMember[]];
  e: WExpense[];
}

const M2W = { exact: 'x', shares: 's', percent: 'p' } as const;
const W2M = { x: 'exact', s: 'shares', p: 'percent' } as const;

export function toWire({ group, expenses }: SharedGroup): Wire {
  return {
    v: VERSION,
    g: [group.id, group.name, group.currency, group.createdAt, group.updatedAt, group.members.map((m) => [m.id, m.name, m.upi ?? '', m.updatedAt])],
    e: expenses.map((x) => [
      x.id,
      x.kind === 'payment' ? 1 : 0,
      x.title,
      x.amount,
      x.payerId,
      x.split.method === 'equal' ? ['e', x.split.participants] : [M2W[x.split.method], x.split.values],
      x.date,
      x.createdAt,
      x.updatedAt,
      x.deleted ? 1 : 0,
    ]),
  };
}

// ---------- validation (incoming data is untrusted) ----------
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const isId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(v);
const isTime = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const clean = (s: string, max: number) => s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

export function fromWire(raw: unknown): SharedGroup {
  const w = raw as Wire;
  if (!w || typeof w !== 'object' || w.v !== VERSION || !Array.isArray(w.g) || !Array.isArray(w.e)) throw new ShareError('This link is not a Tab group');
  const [gid, gname, cur, gc, gu, wm] = w.g;
  if (!isId(gid) || !isStr(gname, 200) || !isStr(cur, 3) || !/^[A-Z]{3}$/.test(cur) || !isTime(gc) || !isTime(gu) || !Array.isArray(wm)) {
    throw new ShareError('The group in this link is damaged');
  }
  if (wm.length === 0 || wm.length > 50) throw new ShareError('The group in this link has no valid members');
  const members: Member[] = [];
  const ids = new Set<string>();
  for (const m of wm) {
    if (!Array.isArray(m)) continue;
    const [id, name, upi, u] = m;
    if (!isId(id) || ids.has(id) || !isStr(name, 200) || !isStr(upi, 200) || !isTime(u)) continue;
    const n = clean(name, 40);
    if (!n) continue;
    ids.add(id);
    const vpa = clean(upi, 80);
    members.push({ id, name: n, ...(isVpa(vpa) ? { upi: vpa } : {}), updatedAt: u });
  }
  if (!members.length) throw new ShareError('The group in this link has no valid members');
  const group: Group = { id: gid, name: clean(gname, 60) || 'Shared group', currency: cur, members, createdAt: gc, updatedAt: gu };

  const expenses: Expense[] = [];
  const seen = new Set<string>();
  for (const x of w.e) {
    if (!Array.isArray(x) || x.length < 10) continue;
    const [id, kind, title, amount, payer, ws, date, c, u, del] = x;
    if (!isId(id) || seen.has(id) || !isStr(title, 400) || !Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) continue;
    if (!ids.has(payer) || !isTime(date) || !isTime(c) || !isTime(u)) continue;
    const split = splitFromWire(ws, ids);
    if (!split || validateSplit(amount, split)) continue;
    seen.add(id);
    expenses.push({
      id,
      groupId: gid,
      kind: kind === 1 ? 'payment' : 'expense',
      title: clean(title, 80),
      amount,
      payerId: payer,
      split,
      date,
      createdAt: c,
      updatedAt: u,
      ...(del === 1 ? { deleted: true } : {}),
    });
  }
  return { group, expenses };
}

function splitFromWire(ws: unknown, ids: Set<string>): Split | null {
  if (!Array.isArray(ws) || ws.length !== 2) return null;
  const [k, body] = ws;
  if (k === 'e') {
    if (!Array.isArray(body)) return null;
    const ps = [...new Set(body.filter((id): id is string => typeof id === 'string' && ids.has(id)))];
    return ps.length === body.length && ps.length ? { method: 'equal', participants: ps } : null;
  }
  if ((k === 'x' || k === 's' || k === 'p') && body && typeof body === 'object' && !Array.isArray(body)) {
    const values: Record<string, number> = {};
    for (const [id, v] of Object.entries(body as Record<string, unknown>)) {
      if (!ids.has(id) || !Number.isSafeInteger(v) || (v as number) < 0) return null;
      values[id] = v as number;
    }
    return { method: W2M[k as 'x'], values } as Split;
  }
  return null;
}

export function isVpa(s: string): boolean {
  return /^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9.-]{1,32}$/.test(s);
}

// ---------- bytes <-> base64url, with native deflate ----------
function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new ShareError('This link is damaged');
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit = Infinity): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new ShareError('This link is too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

const hasDeflate = () => typeof CompressionStream === 'function';

/** Pack a group into the text that follows `#g=`. 'z' = deflated, 'j' = plain fallback. */
export async function encodeGroup(data: SharedGroup): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(toWire(data)));
  if (hasDeflate()) return 'z' + b64url(await pipe(json, new CompressionStream('deflate-raw')));
  return 'j' + b64url(json);
}

export async function decodeGroup(code: string): Promise<SharedGroup> {
  const kind = code[0];
  let bytes = unb64url(code.slice(1));
  if (kind === 'z') {
    if (typeof DecompressionStream !== 'function') throw new ShareError('This browser cannot open compressed links');
    try {
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'), 2_000_000);
    } catch (e) {
      throw e instanceof ShareError ? e : new ShareError('This link is damaged');
    }
  } else if (kind !== 'j') throw new ShareError('This link is not a Tab group');
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ShareError('This link is damaged');
  }
  return fromWire(raw);
}

/** Read `#g=...` out of a URL or a hash string. */
export function groupCodeFromHash(hash: string): string | null {
  const m = /[#&]g=([A-Za-z0-9_-]+)/.exec(hash.startsWith('#') ? hash : '#' + hash);
  return m ? m[1]! : null;
}

// ---------- merge ----------
export interface MergeResult extends SharedGroup {
  added: number;
  updated: number;
  removed: number;
  isNew: boolean;
}

/**
 * Merge a shared copy into the local one. Nothing is ever lost: members are a
 * union, each expense keeps whichever version was edited last (deletes travel
 * as tombstones), ties keep the local copy, and "which one is you" stays local.
 * Merging the same link twice changes nothing.
 */
export function mergeGroup(local: SharedGroup | undefined, incoming: SharedGroup): MergeResult {
  if (!local) {
    const live = incoming.expenses.filter((e) => !e.deleted).length;
    return { group: { ...incoming.group }, expenses: incoming.expenses.slice(), added: live, updated: 0, removed: 0, isNew: true };
  }
  const lg = local.group;
  const ig = incoming.group;
  const newer = ig.updatedAt > lg.updatedAt;
  const members = lg.members.map((m) => ({ ...m }));
  const byId = new Map(members.map((m) => [m.id, m]));
  for (const im of ig.members) {
    const lm = byId.get(im.id);
    if (!lm) {
      const copy = { ...im };
      members.push(copy);
      byId.set(im.id, copy);
    } else if (im.updatedAt > lm.updatedAt) {
      lm.name = im.name;
      if (im.upi) lm.upi = im.upi;
      else delete lm.upi;
      lm.updatedAt = im.updatedAt;
    }
  }
  const group: Group = {
    ...lg,
    name: newer ? ig.name : lg.name,
    currency: newer ? ig.currency : lg.currency,
    members,
    updatedAt: Math.max(lg.updatedAt, ig.updatedAt),
  };
  delete group.deleted;

  const exp = new Map(local.expenses.map((e) => [e.id, e]));
  let added = 0;
  let updated = 0;
  let removed = 0;
  for (const ie of incoming.expenses) {
    const le = exp.get(ie.id);
    if (!le) {
      exp.set(ie.id, ie);
      if (!ie.deleted) added++;
    } else if (ie.updatedAt > le.updatedAt) {
      exp.set(ie.id, ie);
      if (ie.deleted && !le.deleted) removed++;
      else if (!ie.deleted && le.deleted) added++;
      else if (!ie.deleted) updated++;
    }
  }
  return { group, expenses: [...exp.values()], added, updated, removed, isNew: false };
}
