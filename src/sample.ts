import type { Expense, Group, Split } from './core/types';
import { now, uid } from './state/store';

/** A realistic weekend in Goa, only created when someone taps "Try with sample group". */
export function sampleGroup(myName: string): { group: Group; expenses: Expense[] } {
  const t = now();
  const day = 86_400_000;
  const ids = { me: uid(), asha: uid(), ravi: uid(), priya: uid(), kabir: uid(), neha: uid() };
  const group: Group = {
    id: uid(),
    name: 'Goa trip',
    currency: 'INR',
    meId: ids.me,
    createdAt: t - 6 * day,
    updatedAt: t - 6 * day,
    members: [
      // shows as "You" on this device; the name is what friends see in a shared link
      { id: ids.me, name: myName.trim() || 'Aarav Shah', updatedAt: t },
      { id: ids.asha, name: 'Asha Menon', updatedAt: t },
      // example VPA: shows the UPI button without pointing at a real account
      { id: ids.ravi, name: 'Ravi Kumar', upi: 'ravi.kumar@example', updatedAt: t },
      { id: ids.priya, name: 'Priya Nair', updatedAt: t },
      { id: ids.kabir, name: 'Kabir Singh', updatedAt: t },
      { id: ids.neha, name: 'Neha Joshi', updatedAt: t },
    ],
  };
  const all = Object.values(ids);
  const mk = (daysAgo: number, title: string, rupees: number, payer: string, split: Split, kind: Expense['kind'] = 'expense'): Expense => {
    const at = t - daysAgo * day + Math.round(Math.random() * 1000);
    return { id: uid(), groupId: group.id, kind, title, amount: Math.round(rupees * 100), payerId: payer, split, date: at, createdAt: at, updatedAt: at };
  };
  const expenses = [
    mk(5, 'Villa, Anjuna (2 nights)', 18000, ids.asha, { method: 'equal', participants: all }),
    mk(5, 'Groceries and water', 1125.5, ids.neha, { method: 'equal', participants: all }),
    mk(4, 'Scooter rental', 2400, ids.kabir, { method: 'shares', values: { [ids.kabir]: 2, [ids.ravi]: 2, [ids.me]: 1, [ids.neha]: 1 } }),
    mk(4, 'Fish thali lunch, Panjim', 1240, ids.me, { method: 'exact', values: { [ids.me]: 20000, [ids.asha]: 26000, [ids.priya]: 26000, [ids.neha]: 52000 } }),
    mk(3, 'Dinner, Thalassa', 7260, ids.ravi, { method: 'equal', participants: all }),
    mk(3, 'Petrol', 850, ids.ravi, { method: 'equal', participants: [ids.kabir, ids.ravi, ids.me, ids.neha] }),
    mk(2, 'Cab to airport', 1980, ids.priya, { method: 'percent', values: { [ids.priya]: 4000, [ids.asha]: 3000, [ids.neha]: 3000 } }),
    mk(1, 'Kabir paid Asha', 2000, ids.kabir, { method: 'exact', values: { [ids.asha]: 200000 } }, 'payment'),
  ];
  return { group, expenses };
}
