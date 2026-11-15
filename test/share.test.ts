import { describe, expect, it } from 'vitest';
import { decodeGroup, encodeGroup, groupCodeFromHash, mergeGroup, ShareError, toWire, type SharedGroup } from '../src/core/share';

function sample(): SharedGroup {
  return {
    group: {
      id: 'g1',
      name: 'Goa trip',
      currency: 'INR',
      meId: 'asha',
      createdAt: 1,
      updatedAt: 10,
      members: [
        { id: 'asha', name: 'Asha Menon', updatedAt: 1 },
        { id: 'ravi', name: 'Ravi Kumar', upi: 'ravi@example', updatedAt: 1 },
        { id: 'priya', name: 'Priya Nair', updatedAt: 1 },
      ],
    },
    expenses: [
      { id: 'e1', groupId: 'g1', kind: 'expense', title: 'Villa, Anjuna', amount: 1800000, payerId: 'asha', split: { method: 'equal', participants: ['asha', 'ravi', 'priya'] }, date: 5, createdAt: 5, updatedAt: 5 },
      { id: 'e2', groupId: 'g1', kind: 'expense', title: 'Scooters', amount: 240000, payerId: 'ravi', split: { method: 'shares', values: { asha: 1, ravi: 2, priya: 1 } }, date: 6, createdAt: 6, updatedAt: 6 },
      { id: 'e3', groupId: 'g1', kind: 'expense', title: 'Thali', amount: 124000, payerId: 'priya', split: { method: 'exact', values: { asha: 40000, ravi: 44000, priya: 40000 } }, date: 7, createdAt: 7, updatedAt: 7 },
      { id: 'e4', groupId: 'g1', kind: 'expense', title: 'Cab', amount: 198000, payerId: 'asha', split: { method: 'percent', values: { asha: 5000, ravi: 2500, priya: 2500 } }, date: 8, createdAt: 8, updatedAt: 8, deleted: true },
      { id: 'p1', groupId: 'g1', kind: 'payment', title: 'Settle up', amount: 50000, payerId: 'ravi', split: { method: 'exact', values: { asha: 50000 } }, date: 9, createdAt: 9, updatedAt: 9 },
    ],
  };
}

describe('share link encode/decode', () => {
  it('round-trips a group exactly (except the local "which one is you")', async () => {
    const s = sample();
    const code = await encodeGroup(s);
    expect(code[0]).toBe('z');
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/); // URL-fragment safe, no padding
    const back = await decodeGroup(code);
    const { meId: _, ...groupWithoutMe } = s.group;
    expect(back.group).toEqual(groupWithoutMe);
    expect(back.expenses).toEqual(s.expenses);
  });

  it('compresses: the link is shorter than the raw JSON', async () => {
    const s = sample();
    const code = await encodeGroup(s);
    expect(code.length).toBeLessThan(JSON.stringify(toWire(s)).length);
  });

  it('reads the code from a fragment only', () => {
    expect(groupCodeFromHash('#g=zAbc_-1')).toBe('zAbc_-1');
    expect(groupCodeFromHash('#x=1&g=zQ')).toBe('zQ');
    expect(groupCodeFromHash('#nothing')).toBeNull();
  });

  it('rejects damaged or hostile links', async () => {
    await expect(decodeGroup('z!!!')).rejects.toBeInstanceOf(ShareError);
    await expect(decodeGroup('zAAAA')).rejects.toBeInstanceOf(ShareError);
    await expect(decodeGroup('q' + 'A'.repeat(8))).rejects.toBeInstanceOf(ShareError);
    const notTab = btoa(JSON.stringify({ hello: 1 })).replace(/=+$/, '');
    await expect(decodeGroup('j' + notTab)).rejects.toThrow(/not a Tab group/);
  });

  it('drops invalid expenses instead of trusting them', async () => {
    const s = sample();
    const w = toWire(s);
    w.e.push(['bad1', 0, 'x', -5, 'asha', ['e', ['asha']], 1, 1, 1, 0]); // negative amount
    w.e.push(['bad2', 0, 'x', 100, 'ghost', ['e', ['asha']], 1, 1, 1, 0]); // unknown payer
    w.e.push(['bad3', 0, 'x', 100, 'asha', ['x', { asha: 50 }], 1, 1, 1, 0]); // exact does not add up
    const code = 'j' + btoa(JSON.stringify(w)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const back = await decodeGroup(code);
    expect(back.expenses.map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4', 'p1']);
  });
});

describe('merge', () => {
  it('imports a new group as is', () => {
    const r = mergeGroup(undefined, sample());
    expect(r.isNew).toBe(true);
    expect(r.added).toBe(4); // tombstone not counted
  });

  it('is idempotent: merging the same copy twice changes nothing', () => {
    const local = sample();
    const r = mergeGroup(local, sample());
    expect(r.added + r.updated + r.removed).toBe(0);
    expect(r.expenses).toEqual(local.expenses);
    expect(r.group.meId).toBe('asha');
  });

  it('keeps the newest edit of each expense and spreads deletes', () => {
    const local = sample();
    const theirs = sample();
    theirs.expenses[0] = { ...theirs.expenses[0]!, title: 'Villa (edited)', updatedAt: 50 };
    theirs.expenses[1] = { ...theirs.expenses[1]!, deleted: true, updatedAt: 50 };
    theirs.expenses.push({ ...theirs.expenses[2]!, id: 'e9', title: 'New one', updatedAt: 60 });
    local.expenses[2] = { ...local.expenses[2]!, title: 'Local newer', updatedAt: 99 };
    theirs.group.members.push({ id: 'kabir', name: 'Kabir Singh', updatedAt: 70 });
    const r = mergeGroup(local, theirs);
    const by = new Map(r.expenses.map((e) => [e.id, e]));
    expect(by.get('e1')!.title).toBe('Villa (edited)');
    expect(by.get('e2')!.deleted).toBe(true);
    expect(by.get('e3')!.title).toBe('Local newer'); // local edit was newer
    expect(by.get('e9')!.title).toBe('New one');
    expect(r.group.members.map((m) => m.id)).toEqual(['asha', 'ravi', 'priya', 'kabir']);
    expect([r.added, r.updated, r.removed]).toEqual([1, 1, 1]);
  });
});
