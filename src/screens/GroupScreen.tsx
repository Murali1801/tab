import { useState } from 'preact/hooks';
import { computeBalances, groupSpend } from '../core/balances';
import { formatMoney } from '../core/money';
import { computeShares } from '../core/split';
import type { Expense, Group, Member } from '../core/types';
import { ExpenseSheet } from '../sheets/ExpenseSheet';
import { GroupSettingsSheet, MemberSheet } from '../sheets/GroupSheets';
import { SettleSheet } from '../sheets/SettleSheet';
import { ShareSheet } from '../sheets/ShareSheet';
import { firstName, liveExpenses } from '../state/store';
import { balanceWords, Initial, Leader, Segmented } from '../ui/bits';
import { haptic } from '../ui/feedback';
import { IconBack, IconPlus, IconShare, IconSliders } from '../ui/icons';
import { back } from '../ui/nav';
import { Sheet } from '../ui/SheetView';

type Open = { kind: 'expense'; expense?: Expense } | { kind: 'settle' } | { kind: 'share' } | { kind: 'settings' } | { kind: 'member'; member: Member } | null;

const dayLabel = (ms: number) => {
  const d = new Date(ms);
  const today = new Date();
  const y = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'TODAY';
  if (d.toDateString() === y.toDateString()) return 'YESTERDAY';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
};

export function GroupScreen({ group: g }: { group: Group }) {
  const [tab, setTab] = useState<'expenses' | 'balances'>('expenses');
  const [open, setOpen] = useState<Open>(null);
  const expenses = liveExpenses(g.id);
  const bal = computeBalances(g, expenses);
  const words = balanceWords(g, g.meId ? bal.get(g.meId) : undefined);
  const order = g.members.map((m) => m.id);
  const spend = groupSpend(expenses);
  const close = () => setOpen(null);

  // group expenses by day, newest first
  const days: { label: string; items: Expense[] }[] = [];
  for (const e of expenses) {
    const label = dayLabel(e.date);
    const last = days[days.length - 1];
    if (last && last.label === label) last.items.push(e);
    else days.push({ label, items: [e] });
  }

  function myLine(e: Expense): { text: string; tone: string } {
    if (!g.meId) return { text: '', tone: '' };
    const parts = computeShares(e.amount, e.split, order);
    const mine = parts.get(g.meId) ?? 0;
    if (e.kind === 'payment') {
      if (e.payerId === g.meId) return { text: 'you paid', tone: 'pos' };
      if (mine) return { text: 'you received', tone: 'neg' };
      return { text: '', tone: '' };
    }
    if (e.payerId === g.meId) {
      const lent = e.amount - mine;
      return lent ? { text: `you lent ${formatMoney(lent, g.currency)}`, tone: 'pos' } : { text: 'just you', tone: '' };
    }
    return mine ? { text: `you owe ${formatMoney(mine, g.currency)}`, tone: 'neg' } : { text: 'not in this one', tone: '' };
  }

  return (
    <section class="screen" aria-labelledby="group-h">
      <header class="topbar">
        <button type="button" class="icon-btn" onClick={back} aria-label="Back to groups">
          <IconBack />
        </button>
        <h1 id="group-h" class="topbar-title">
          {g.name}
        </h1>
        <button type="button" class="icon-btn" onClick={() => setOpen({ kind: 'share' })} aria-label="Share group">
          <IconShare />
        </button>
        <button type="button" class="icon-btn" onClick={() => setOpen({ kind: 'settings' })} aria-label="Group settings">
          <IconSliders />
        </button>
      </header>

      <div class="scroll">
        <div class="hero">
          <p class={'hero-balance ' + (expenses.length ? words.tone : 'zero')}>{expenses.length ? words.text : 'Nothing spent yet'}</p>
          <p class="hero-meta mono">
            SPEND {formatMoney(spend, g.currency)} · {g.members.length} PEOPLE
          </p>
        </div>

        <Segmented
          label="View"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'expenses', label: 'Expenses' },
            { value: 'balances', label: 'Balances' },
          ]}
        />

        {tab === 'expenses' ? (
          expenses.length === 0 ? (
            <div class="empty">
              <p>No expenses yet.</p>
              <p class="fine">Tap Add expense below. The keypad takes sums like 1200+340/2.</p>
            </div>
          ) : (
            days.map((d) => (
              <div class="day">
                <h2 class="day-h mono">{d.label}</h2>
                <ul class="lines">
                  {d.items.map((e) => {
                    const mine = myLine(e);
                    const isPay = e.kind === 'payment';
                    return (
                      <li>
                        <button type="button" class={'line' + (isPay ? ' is-pay' : '')} onClick={() => setOpen({ kind: 'expense', expense: e })}>
                          <Initial name={g.members.find((m) => m.id === e.payerId)?.name ?? '?'} me={e.payerId === g.meId} />
                          <span class="line-main">
                            <Leader left={e.title} right={formatMoney(e.amount, g.currency)} />
                            <span class="line-sub">
                              <span>{isPay ? 'Settle-up payment' : `${firstName(g, e.payerId)} paid${e.split.method !== 'equal' ? ' · ' + e.split.method : ''}`}</span>
                              {mine.text && <span class={'tone-' + mine.tone}>{mine.text}</span>}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )
        ) : (
          <ul class="rows balances">
            {g.members.map((m) => {
              const v = bal.get(m.id) ?? 0;
              return (
                <li>
                  <button type="button" class="row" onClick={() => setOpen({ kind: 'member', member: m })} aria-label={`${m.name}, ${v > 0 ? 'is owed' : v < 0 ? 'owes' : 'settled'} ${formatMoney(Math.abs(v), g.currency)}. Edit name or UPI ID.`}>
                    <Initial name={m.name} me={m.id === g.meId} />
                    <span class="row-main">
                      <Leader left={m.id === g.meId ? `${m.name} (you)` : m.name} right={<span class={v > 0 ? 'tone-pos' : v < 0 ? 'tone-neg' : 'tone-'}>{v === 0 ? 'settled' : formatMoney(v, g.currency, { sign: true })}</span>} />
                      <span class="row-sub mono">{m.upi ? 'UPI ' + m.upi : v > 0 ? 'gets money back' : v < 0 ? 'owes money' : 'all square'}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div class="scroll-pad" />
      </div>

      <div class="actionbar">
        <button
          type="button"
          class="btn"
          onClick={() => {
            haptic(6);
            setOpen({ kind: 'settle' });
          }}
        >
          Settle up
        </button>
        <button
          type="button"
          class="btn primary"
          onClick={() => {
            haptic(6);
            setOpen({ kind: 'expense' });
          }}
        >
          <IconPlus size={20} /> Add expense
        </button>
      </div>

      <Sheet open={open?.kind === 'expense'} onClose={close} label="Expense">
        {open?.kind === 'expense' && <ExpenseSheet group={g} expense={open.expense} onDone={close} />}
      </Sheet>
      <Sheet open={open?.kind === 'settle'} onClose={close} label="Settle up" snap="full">
        {open?.kind === 'settle' && <SettleSheet group={g} onDone={close} />}
      </Sheet>
      <Sheet open={open?.kind === 'share'} onClose={close} label="Share group">
        {open?.kind === 'share' && <ShareSheet group={g} onDone={close} />}
      </Sheet>
      <Sheet open={open?.kind === 'settings'} onClose={close} label="Group settings" snap="half">
        {open?.kind === 'settings' && <GroupSettingsSheet group={g} onDone={close} onDeleted={back} />}
      </Sheet>
      <Sheet open={open?.kind === 'member'} onClose={close} label="Person">
        {open?.kind === 'member' && <MemberSheet group={g} member={open.member} onDone={close} />}
      </Sheet>
    </section>
  );
}
