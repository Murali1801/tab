import { useMemo, useRef, useState } from 'preact/hooks';
import { computeBalances, groupSpend, pairwiseDebtCount } from '../core/balances';
import { formatMoney, minorToDecimal } from '../core/money';
import { EXACT_LIMIT, settlePlan } from '../core/settle';
import type { Group, Transfer } from '../core/types';
import { downloadBlob, receiptDate, receiptPng, shareReceipt, type ReceiptData } from '../lib/receipt';
import { deleteExpense, firstName, liveExpenses, markPaid } from '../state/store';
import { Leader, Mark } from '../ui/bits';
import { haptic, toast } from '../ui/feedback';
import { IconCheck, IconClose, IconDownload, IconShare } from '../ui/icons';

export function upiLink(vpa: string, name: string, amount: number, currency: string): string {
  const q = new URLSearchParams({ pa: vpa, pn: name, am: minorToDecimal(amount, currency), cu: currency, tn: 'Tab' });
  return 'upi://pay?' + q.toString().replace(/\+/g, '%20');
}

export function SettleSheet({ group: g, onDone }: { group: Group; onDone: () => void }) {
  const expenses = liveExpenses(g.id);
  const [busy, setBusy] = useState(false);
  const printed = useRef(false);
  const firstPrint = !printed.current;
  printed.current = true;

  const { plan, naive } = useMemo(() => {
    const bal = computeBalances(g, expenses);
    const entries = g.members.map((m) => [m.id, bal.get(m.id) ?? 0] as const);
    return { plan: settlePlan(entries), naive: pairwiseDebtCount(g, expenses) };
  }, [g, expenses]);

  const n = plan.transfers.length;
  const notes: string[] = [];
  if (n && naive > n) notes.push(`${n} payment${n === 1 ? '' : 's'} instead of ${naive}`);
  if (n) notes.push(plan.method === 'exact' ? (plan.greedyCount > n ? `Exact minimum. Greedy would need ${plan.greedyCount}` : 'Exact minimum for this group') : `Greedy plan (over ${EXACT_LIMIT} people owe or are owed)`);
  notes.push(`Total spend ${formatMoney(groupSpend(expenses), g.currency)}`);

  const name = (id: string) => firstName(g, id);
  const member = (id: string) => g.members.find((m) => m.id === id);
  // the shared receipt goes to friends, so it names everyone (no "You")
  const realName = (id: string) => (member(id)?.name ?? 'Someone').split(/\s+/)[0]!;
  const data: ReceiptData = {
    group: g.name,
    currency: g.currency,
    date: new Date(),
    people: g.members.length,
    lines: plan.transfers.map((t) => ({ from: realName(t.from), to: realName(t.to), amount: t.amount })),
    notes,
    upi: [...new Set(plan.transfers.map((t) => t.to))].flatMap((id) => {
      const m = member(id);
      return m?.upi && g.currency === 'INR' ? [{ name: realName(id), vpa: m.upi }] : [];
    }),
  };

  async function paid(t: Transfer) {
    const p = await markPaid(g, t);
    haptic([10, 30, 14]);
    toast(`${name(t.from)} paid ${name(t.to)} ${formatMoney(t.amount, g.currency)}`, { label: 'Undo', run: () => void deleteExpense(p) });
  }

  async function share() {
    setBusy(true);
    try {
      const r = await shareReceipt(data);
      if (r === 'downloaded') toast('Receipt saved as PNG, text copied');
      if (r === 'shared') haptic(8);
    } catch {
      toast('Could not make the receipt image');
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    try {
      downloadBlob(await receiptPng(data), 'tab-settle-up.png');
    } catch {
      toast('Could not make the receipt image');
    }
  }

  return (
    <div class="settle">
      <div class="sheet-head">
        <h2 class="sheet-title">Settle up</h2>
        <button type="button" class="icon-btn" onClick={onDone} aria-label="Close">
          <IconClose />
        </button>
      </div>

      <div class={'receipt-slot' + (firstPrint ? ' print' : '')}>
        <article class="receipt" aria-label={`Settle-up receipt for ${g.name}`}>
          <header class="receipt-head">
            <span class="receipt-brand">
              <Mark /> Tab
            </span>
            <span class="receipt-kind">SETTLE-UP</span>
          </header>
          <h3 class="receipt-group">{g.name}</h3>
          <p class="receipt-meta">
            {receiptDate(data.date).toUpperCase()} · {g.members.length} PEOPLE
          </p>
          <hr class="receipt-rule" />
          {n === 0 ? (
            <p class="receipt-empty">ALL SETTLED. NOTHING TO PAY.</p>
          ) : (
            <ol class="receipt-lines">
              {plan.transfers.map((t) => {
                const to = member(t.to);
                const canUpi = !!to?.upi && g.currency === 'INR';
                return (
                  <li class="receipt-line">
                    <Leader
                      left={
                        <>
                          {name(t.from).toUpperCase()} <span class="arrow">→</span> {name(t.to).toUpperCase()}
                        </>
                      }
                      right={formatMoney(t.amount, g.currency)}
                    />
                    <span class="receipt-actions">
                      <button type="button" class="tiny-btn" onClick={() => paid(t)}>
                        <IconCheck size={16} /> Mark paid
                      </button>
                      {canUpi && (
                        <a class="tiny-btn upi" href={upiLink(to!.upi!, to!.name, t.amount, g.currency)} onClick={() => haptic(8)}>
                          Pay by UPI
                        </a>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          <hr class="receipt-rule" />
          <ul class="receipt-notes">
            {notes.map((x) => (
              <li>{x.toUpperCase()}</li>
            ))}
          </ul>
          {data.upi.length > 0 && <p class="receipt-upi">UPI · {data.upi.map((u) => `${u.name.toUpperCase()} ${u.vpa}`).join(' · ')}</p>}
        </article>
      </div>

      <div class="settle-actions">
        <button type="button" class="btn primary" onClick={share} disabled={busy}>
          <IconShare size={20} /> {busy ? 'Making image' : 'Share receipt'}
        </button>
        <button type="button" class="btn" onClick={download} aria-label="Download receipt as PNG">
          <IconDownload size={20} /> PNG
        </button>
      </div>
      {n > 0 && <p class="fine">Mark a line paid once the money has moved. It is saved as a payment and the balances update.</p>}
    </div>
  );
}
