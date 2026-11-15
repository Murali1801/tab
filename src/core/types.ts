/** All money is stored as integer minor units (paise, cents). Never floats. */
export type Minor = number;

export interface Member {
  id: string;
  name: string;
  /** UPI ID (VPA) like name@bank. Only then can others pay this member by UPI. */
  upi?: string;
  updatedAt: number;
}

export interface Group {
  id: string;
  name: string;
  currency: string;
  members: Member[];
  /** Which member is the person using this device. Local only, never shared. */
  meId?: string;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export type SplitMethod = 'equal' | 'exact' | 'shares' | 'percent';

export type Split =
  | { method: 'equal'; participants: string[] }
  /** Exact minor units per member. Must add up to the amount. */
  | { method: 'exact'; values: Record<string, Minor> }
  /** Whole-number shares per member. */
  | { method: 'shares'; values: Record<string, number> }
  /** Basis points per member (10000 = 100%). Must add up to 10000. */
  | { method: 'percent'; values: Record<string, number> };

export interface Expense {
  id: string;
  groupId: string;
  /** 'payment' is a settle-up transfer: payer paid the single participant back. */
  kind: 'expense' | 'payment';
  title: string;
  amount: Minor;
  payerId: string;
  split: Split;
  /** When it happened (ms). */
  date: number;
  createdAt: number;
  updatedAt: number;
  /** Tombstone, so a delete survives merging a shared copy. */
  deleted?: boolean;
}

export interface Transfer {
  from: string;
  to: string;
  amount: Minor;
}

export type ActivityType = 'add' | 'edit' | 'delete' | 'restore' | 'paid' | 'group' | 'import' | 'member';

export interface Activity {
  id: string;
  groupId: string;
  type: ActivityType;
  text: string;
  amount?: Minor;
  at: number;
}
