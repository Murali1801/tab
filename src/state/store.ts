import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_CURRENCY } from '../core/money';
import { mergeGroup, type MergeResult, type SharedGroup } from '../core/share';
import type { Activity, ActivityType, Expense, Group, Member, Minor, Transfer } from '../core/types';
import * as idb from './db';

export type Theme = 'system' | 'light' | 'dark';
export interface Settings {
  name: string;
  currency: string;
  theme: Theme;
}

export interface State {
  ready: boolean;
  groups: Group[];
  /** All expenses incl. tombstones, by group id. */
  expenses: Map<string, Expense[]>;
  activity: Activity[];
  settings: Settings;
}

const DEFAULT_SETTINGS: Settings = { name: '', currency: DEFAULT_CURRENCY, theme: 'system' };

let state: State = { ready: false, groups: [], expenses: new Map(), activity: [], settings: DEFAULT_SETTINGS };
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function getState() {
  return state;
}

export function useStore(): State {
  const [, force] = useState(0);
  const seen = state;
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    // effects run after paint: catch a change (like boot finishing) that landed in between
    if (state !== seen) l();
    return () => void listeners.delete(l);
  }, []);
  return state;
}

export function uid(): string {
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
}

/** Monotonic clock so two edits in the same millisecond still order correctly. */
let lastNow = 0;
export function now(): number {
  lastNow = Math.max(Date.now(), lastNow + 1);
  return lastNow;
}

export async function boot() {
  const { groups, expenses, activity, settings } = await idb.loadAll();
  const byGroup = new Map<string, Expense[]>();
  for (const e of expenses) {
    const list = byGroup.get(e.groupId) ?? [];
    list.push(e);
    byGroup.set(e.groupId, list);
  }
  set({
    ready: true,
    expenses: byGroup,
    activity: activity.sort((a, b) => b.at - a.at),
    settings: { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) },
  });
  set({ groups: sortGroups(groups.filter((g) => !g.deleted)) });
}

// ---------- selectors ----------
export const liveExpenses = (groupId: string) => (state.expenses.get(groupId) ?? []).filter((e) => !e.deleted).sort((a, b) => b.date - a.date || b.createdAt - a.createdAt);
export const findGroup = (id: string | undefined) => state.groups.find((g) => g.id === id);
export const memberName = (g: Group, id: string) => g.members.find((m) => m.id === id)?.name ?? 'Someone';
export const firstName = (g: Group, id: string) => (id === g.meId ? 'You' : memberName(g, id).split(/\s+/)[0]!);

// ---------- writes ----------
async function log(groupId: string, type: ActivityType, text: string, amount?: Minor) {
  const a: Activity = { id: uid(), groupId, type, text, at: now(), ...(amount !== undefined ? { amount } : {}) };
  set({ activity: [a, ...state.activity].slice(0, 500) });
  await idb.putActivity(a);
}

/** Most recently touched group first (group edit or any expense change). */
function lastTouched(g: Group): number {
  let t = g.updatedAt;
  for (const e of state.expenses.get(g.id) ?? []) if (e.updatedAt > t) t = e.updatedAt;
  return t;
}
const sortGroups = (gs: Group[]) => gs.slice().sort((a, b) => lastTouched(b) - lastTouched(a));

async function writeGroup(g: Group) {
  const others = state.groups.filter((x) => x.id !== g.id);
  set({ groups: g.deleted ? others : sortGroups([g, ...others]) });
  await idb.putGroup(g);
}

async function writeExpenses(groupId: string, es: Expense[]) {
  const map = new Map(state.expenses);
  const list = (map.get(groupId) ?? []).slice();
  for (const e of es) {
    const i = list.findIndex((x) => x.id === e.id);
    if (i >= 0) list[i] = e;
    else list.push(e);
  }
  map.set(groupId, list);
  set({ expenses: map });
  set({ groups: sortGroups(state.groups) });
  await idb.putExpenses(es);
}

export async function createGroup(name: string, currency: string, meName: string, others: string[]): Promise<Group> {
  const t = now();
  const me: Member = { id: uid(), name: meName.trim() || 'You', updatedAt: t };
  const g: Group = {
    id: uid(),
    name: name.trim() || 'New group',
    currency,
    members: [me, ...others.map((n) => n.trim()).filter(Boolean).map((n) => ({ id: uid(), name: n, updatedAt: t }))],
    meId: me.id,
    createdAt: t,
    updatedAt: t,
  };
  await writeGroup(g);
  await log(g.id, 'group', `Started ${g.name}`);
  void navigator.storage?.persist?.();
  return g;
}

export async function updateGroup(g: Group, note?: string) {
  await writeGroup({ ...g, updatedAt: now() });
  if (note) await log(g.id, 'group', note);
}

export async function deleteGroup(g: Group) {
  await writeGroup({ ...g, deleted: true, updatedAt: now() });
  await log(g.id, 'delete', `Deleted ${g.name}`);
}

export async function restoreGroup(g: Group) {
  const back = { ...g, updatedAt: now() };
  delete back.deleted;
  await writeGroup(back);
  await log(g.id, 'restore', `Brought back ${g.name}`);
}

export async function upsertMember(g: Group, m: Member) {
  const exists = g.members.some((x) => x.id === m.id);
  const members = exists ? g.members.map((x) => (x.id === m.id ? { ...m, updatedAt: now() } : x)) : [...g.members, { ...m, updatedAt: now() }];
  await writeGroup({ ...g, members, updatedAt: now() });
  if (!exists) await log(g.id, 'member', `${m.name} joined ${g.name}`);
}

export async function saveExpense(e: Expense, prev?: Expense) {
  const g = findGroup(e.groupId);
  const saved = { ...e, updatedAt: now() };
  await writeExpenses(e.groupId, [saved]);
  if (g) await log(g.id, prev ? 'edit' : 'add', `${prev ? 'Edited' : 'Added'} ${saved.title} in ${g.name}`, saved.amount);
  return saved;
}

/** Put an older version back (undo for edits). */
export async function revertExpense(prev: Expense) {
  await writeExpenses(prev.groupId, [{ ...prev, updatedAt: now() }]);
}

export async function deleteExpense(e: Expense) {
  const g = findGroup(e.groupId);
  await writeExpenses(e.groupId, [{ ...e, deleted: true, updatedAt: now() }]);
  if (g) await log(g.id, 'delete', `Deleted ${e.title} in ${g.name}`, e.amount);
}

export async function restoreExpense(e: Expense) {
  const g = findGroup(e.groupId);
  const back = { ...e, updatedAt: now() };
  delete back.deleted;
  await writeExpenses(e.groupId, [back]);
  if (g) await log(g.id, 'restore', `Brought back ${e.title} in ${g.name}`, e.amount);
}

export async function markPaid(g: Group, t: Transfer): Promise<Expense> {
  const ts = now();
  const p: Expense = {
    id: uid(),
    groupId: g.id,
    kind: 'payment',
    title: `${memberName(g, t.from).split(/\s+/)[0]} paid ${memberName(g, t.to).split(/\s+/)[0]}`,
    amount: t.amount,
    payerId: t.from,
    split: { method: 'exact', values: { [t.to]: t.amount } },
    date: ts,
    createdAt: ts,
    updatedAt: ts,
  };
  await writeExpenses(g.id, [p]);
  await log(g.id, 'paid', `${firstName(g, t.from)} paid ${firstName(g, t.to)} in ${g.name}`, t.amount);
  return p;
}

export async function importShared(shared: SharedGroup, meId: string | undefined): Promise<MergeResult> {
  const localGroup = state.groups.find((g) => g.id === shared.group.id);
  const local = localGroup ? { group: localGroup, expenses: state.expenses.get(localGroup.id) ?? [] } : undefined;
  const r = mergeGroup(local, shared);
  const group = { ...r.group, ...(meId ? { meId } : {}) };
  await writeGroup(group);
  const map = new Map(state.expenses);
  map.set(group.id, r.expenses);
  set({ expenses: map });
  await idb.putExpenses(r.expenses);
  const bits = [r.added && `${r.added} new`, r.updated && `${r.updated} updated`, r.removed && `${r.removed} removed`].filter(Boolean).join(', ');
  await log(group.id, 'import', r.isNew ? `Joined ${group.name} from a link` : `Merged a link into ${group.name}${bits ? ` (${bits})` : ''}`);
  return { ...r, group };
}

export async function seedGroup(group: Group, expenses: Expense[]) {
  await writeGroup(group);
  const map = new Map(state.expenses);
  map.set(group.id, expenses);
  set({ expenses: map });
  await idb.putExpenses(expenses);
  await log(group.id, 'group', `Opened the sample group ${group.name}`);
}

export async function updateSettings(patch: Partial<Settings>) {
  const s = { ...state.settings, ...patch };
  set({ settings: s });
  await idb.putSetting('settings', s);
}

export async function eraseEverything() {
  await idb.wipe();
  set({ groups: [], expenses: new Map(), activity: [], settings: DEFAULT_SETTINGS });
}

export function exportAll(): string {
  return JSON.stringify(
    { app: 'tab', version: 1, exportedAt: new Date().toISOString(), groups: state.groups, expenses: [...state.expenses.values()].flat(), activity: state.activity },
    null,
    2,
  );
}
