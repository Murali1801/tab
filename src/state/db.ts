import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Activity, Expense, Group } from '../core/types';

interface TabDB extends DBSchema {
  groups: { key: string; value: Group };
  expenses: { key: string; value: Expense; indexes: { groupId: string } };
  activity: { key: string; value: Activity; indexes: { at: number } };
  kv: { key: string; value: unknown };
}

let dbp: Promise<IDBPDatabase<TabDB>> | null = null;

export function db(): Promise<IDBPDatabase<TabDB>> {
  dbp ??= openDB<TabDB>('tab', 1, {
    upgrade(d) {
      d.createObjectStore('groups', { keyPath: 'id' });
      d.createObjectStore('expenses', { keyPath: 'id' }).createIndex('groupId', 'groupId');
      d.createObjectStore('activity', { keyPath: 'id' }).createIndex('at', 'at');
      d.createObjectStore('kv');
    },
  });
  return dbp;
}

export async function loadAll() {
  const d = await db();
  const [groups, expenses, activity, settings] = await Promise.all([d.getAll('groups'), d.getAll('expenses'), d.getAll('activity'), d.get('kv', 'settings')]);
  return { groups, expenses, activity, settings };
}

export async function putGroup(g: Group) {
  await (await db()).put('groups', g);
}

export async function putExpenses(es: Expense[]) {
  const tx = (await db()).transaction('expenses', 'readwrite');
  await Promise.all([...es.map((e) => tx.store.put(e)), tx.done]);
}

export async function putActivity(a: Activity) {
  const d = await db();
  await d.put('activity', a);
  // keep the log bounded
  const count = await d.count('activity');
  if (count > 600) {
    const tx = d.transaction('activity', 'readwrite');
    let cur = await tx.store.index('at').openCursor();
    for (let n = count - 500; cur && n > 0; n--) {
      await cur.delete();
      cur = await cur.continue();
    }
    await tx.done;
  }
}

export async function putSetting(key: string, v: unknown) {
  await (await db()).put('kv', v, key);
}

export async function wipe() {
  const d = await db();
  const tx = d.transaction(['groups', 'expenses', 'activity', 'kv'], 'readwrite');
  await Promise.all([tx.objectStore('groups').clear(), tx.objectStore('expenses').clear(), tx.objectStore('activity').clear(), tx.objectStore('kv').clear(), tx.done]);
}
