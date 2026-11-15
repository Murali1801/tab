import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { evaluateMinor, ExprError, isExpression, previewMinor } from '../core/expr';
import { currencyInfo, currencySymbol, formatMoney, minorToDecimal } from '../core/money';
import { computeShares, equalPercents, validateSplit } from '../core/split';
import type { Expense, Group, Split, SplitMethod } from '../core/types';
import { deleteExpense, firstName, restoreExpense, revertExpense, saveExpense, uid, now } from '../state/store';
import { Initial, Segmented } from '../ui/bits';
import { haptic, toast } from '../ui/feedback';
import { IconBackspace, IconClose, IconTrash } from '../ui/icons';

interface Props {
  group: Group;
  expense?: Expense;
  onDone: () => void;
}

const METHODS: { value: SplitMethod; label: string }[] = [
  { value: 'equal', label: 'Equal' },
  { value: 'exact', label: 'Exact' },
  { value: 'shares', label: 'Shares' },
  { value: 'percent', label: '%' },
];

const KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '.', '0', 'back', '+', '(', ')'] as const;

const trimZeros = (s: string) => (s.includes('.') ? s.replace(/\.?0+$/, '') : s);
const toDateInput = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function initialValues(e: Expense | undefined, cur: string): Record<string, string> {
  if (!e || e.split.method === 'equal') return {};
  const out: Record<string, string> = {};
  for (const [id, v] of Object.entries(e.split.values)) {
    if (!v) continue;
    out[id] = e.split.method === 'exact' ? trimZeros(minorToDecimal(v, cur)) : e.split.method === 'percent' ? trimZeros((v / 100).toFixed(2)) : String(v);
  }
  return out;
}

export function ExpenseSheet({ group: g, expense, onDone }: Props) {
  const cur = g.currency;
  const exp = currencyInfo(cur).exp;
  const order = g.members.map((m) => m.id);
  const isPayment = expense?.kind === 'payment';

  const [title, setTitle] = useState(expense?.title ?? '');
  const [date, setDate] = useState(toDateInput(expense?.date ?? Date.now()));
  const [expr, setExpr] = useState(expense ? trimZeros(minorToDecimal(expense.amount, cur)) : '');
  const [payerId, setPayer] = useState(expense?.payerId ?? g.meId ?? order[0]!);
  const [method, setMethodRaw] = useState<SplitMethod>(expense?.split.method ?? 'equal');
  const [included, setIncluded] = useState<string[]>(() => {
    if (!expense) return order.slice();
    const s = expense.split;
    return s.method === 'equal' ? s.participants.slice() : Object.keys(s.values).filter((id) => s.values[id]! > 0);
  });
  const [vals, setVals] = useState<Record<string, string>>(() => initialValues(expense, cur));
  const [target, setTarget] = useState<'total' | string>('total');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pressTimer = useRef<number>(0);
  const longPressed = useRef(false);

  const inc = order.filter((id) => included.includes(id));
  const amount = previewMinor(expr, exp) ?? 0;

  const valueMinor = (id: string) => {
    const v = vals[id] ?? '';
    if (!v) return 0;
    const n = previewMinor(v, method === 'exact' ? exp : method === 'percent' ? 2 : 0);
    return n !== null && n > 0 ? n : 0;
  };

  const split: Split = useMemo(() => {
    if (method === 'equal') return { method, participants: inc };
    const values: Record<string, number> = {};
    for (const id of inc) {
      const v = valueMinor(id);
      if (v > 0) values[id] = v;
    }
    return { method, values } as Split;
  }, [method, inc.join(), JSON.stringify(vals), exp]);

  const valid = validateSplit(amount, split);
  const shares = useMemo(() => {
    if (amount <= 0) return new Map<string, number>();
    if (method === 'exact') return new Map(inc.map((id) => [id, valueMinor(id)]));
    if (validateSplit(amount, split) && method !== 'shares') return new Map<string, number>();
    try {
      return computeShares(amount, split, order);
    } catch {
      return new Map<string, number>();
    }
  }, [amount, split]);

  function setMethod(m: SplitMethod, focus?: string) {
    if (m !== method) {
      haptic(4);
      setMethodRaw(m);
      const ids = focus && !inc.includes(focus) ? order.filter((id) => inc.includes(id) || id === focus) : inc;
      if (focus && !inc.includes(focus)) setIncluded(ids);
      if (m === 'shares') setVals(Object.fromEntries(ids.map((id) => [id, '1'])));
      else if (m === 'percent') setVals(Object.fromEntries(Object.entries(equalPercents(ids)).map(([id, bp]) => [id, trimZeros((bp / 100).toFixed(2))])));
      else setVals({});
    }
    setTarget(m === 'equal' ? 'total' : (focus ?? 'total'));
    setError(null);
  }

  function toggle(id: string) {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    haptic(4);
    setError(null);
    if (inc.includes(id)) {
      setIncluded(inc.filter((x) => x !== id));
      if (target === id) setTarget('total');
    } else {
      setIncluded([...inc, id]);
      if (method === 'shares') setVals((v) => ({ ...v, [id]: v[id] || '1' }));
    }
  }

  /** Edit the targeted value from its latest state, so fast typing never drops keys. */
  function edit(f: (prev: string) => string) {
    const apply = (prev: string) => {
      const next = f(prev);
      return next.length > 40 ? prev : next;
    };
    if (target === 'total') setExpr(apply);
    else setVals((v) => ({ ...v, [target]: apply(v[target] ?? '') }));
    setError(null);
  }
  const write = (next: string) => edit(() => next);

  function press(k: string) {
    haptic(3);
    if (k === 'back') return edit((c) => c.slice(0, -1));
    if (k === 'clear') return write('');
    const map: Record<string, string> = { '÷': '/', '×': '*', '−': '-' };
    const ch = map[k] ?? k;
    edit((c) =>
      // replace a trailing operator instead of stacking two
      '+-*/'.includes(ch) && /[+\-*/]$/.test(c) && !(ch === '-' && /[*/]$/.test(c)) ? c.slice(0, -1) + ch : c + ch,
    );
  }

  async function save() {
    let total: number;
    try {
      total = evaluateMinor(expr || '0', exp);
    } catch (e) {
      setError(e instanceof ExprError ? `Amount: ${e.message.toLowerCase()}` : 'Check the amount');
      haptic([10, 40, 10]);
      return;
    }
    const why = validateSplit(total, split);
    if (why) {
      setError(why);
      haptic([10, 40, 10]);
      return;
    }
    const [y, m, d] = date.split('-').map(Number);
    const picked = y && m && d ? new Date(y, m - 1, d, new Date().getHours(), new Date().getMinutes()).getTime() : Date.now();
    const keepTime = expense && toDateInput(expense.date) === date ? expense.date : picked;
    const t = now();
    const e: Expense = {
      id: expense?.id ?? uid(),
      groupId: g.id,
      kind: expense?.kind ?? 'expense',
      title: title.trim() || (isPayment ? 'Payment' : 'Expense'),
      amount: total,
      payerId,
      split,
      date: keepTime,
      createdAt: expense?.createdAt ?? t,
      updatedAt: t,
    };
    const saved = await saveExpense(e, expense);
    haptic(12);
    onDone();
    if (expense) toast(`Saved ${saved.title}`, { label: 'Undo', run: () => void revertExpense(expense) });
    else toast(`Added ${saved.title}, ${formatMoney(saved.amount, cur)}`, { label: 'Undo', run: () => void deleteExpense(saved) });
  }

  async function remove() {
    if (!expense) return;
    await deleteExpense(expense);
    haptic([8, 30, 8]);
    onDone();
    toast(`Deleted ${expense.title}`, { label: 'Undo', run: () => void restoreExpense(expense) });
  }

  // Bring the selected payer into view in the sideways chip row.
  const payerRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = payerRow.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (on && payerRow.current) payerRow.current.scrollLeft = Math.max(0, on.offsetLeft - payerRow.current.clientWidth / 2 + on.offsetWidth / 2);
  }, []);

  // Close the hold menu on any tap outside it.
  useEffect(() => {
    if (!menuFor) return;
    const off = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.hold-menu')) setMenuFor(null);
    };
    const t = setTimeout(() => window.addEventListener('pointerdown', off), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', off);
    };
  }, [menuFor]);

  // Physical keyboard: type the amount when focus is not in a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9.+\-*/()]$/.test(e.key)) {
        e.preventDefault();
        press({ '*': '×', '/': '÷', '-': '−' }[e.key] ?? e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        press('back');
      } else if (e.key === 'Enter' && !el.closest('button')) {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function startPress(id: string) {
    longPressed.current = false;
    clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      haptic(15);
      setMenuFor(id);
    }, 450);
  }
  const cancelPress = () => clearTimeout(pressTimer.current);

  const sum = inc.reduce((a, id) => a + valueMinor(id), 0);
  let status = '';
  let statusTone: 'ok' | 'warn' | '' = '';
  if (method === 'exact') {
    const left = amount - sum;
    status = left === 0 ? 'Adds up to the total' : left > 0 ? `${formatMoney(left, cur)} left to assign` : `Over by ${formatMoney(-left, cur)}`;
    statusTone = left === 0 && amount > 0 ? 'ok' : 'warn';
  } else if (method === 'percent') {
    const left = 10000 - sum;
    const pct = (bp: number) => trimZeros((Math.abs(bp) / 100).toFixed(2)) + '%';
    status = left === 0 ? 'Adds up to 100%' : left > 0 ? `${pct(left)} left` : `Over by ${pct(left)}`;
    statusTone = left === 0 ? 'ok' : 'warn';
  } else if (method === 'shares') {
    status = `${sum} share${sum === 1 ? '' : 's'}`;
  } else if (inc.length) {
    const people = `${inc.length} ${inc.length === 1 ? 'person' : 'people'}`;
    const lo = Math.floor(amount / inc.length);
    status = amount > 0 ? `${formatMoney(lo, cur)}${amount % inc.length ? ' or ' + formatMoney(lo + 1, cur) : ''} each, ${people}` : people;
  }

  const targetName = target === 'total' ? null : firstName(g, target);
  const unit = method === 'percent' ? '%' : method === 'shares' ? 'shares' : currencySymbol(cur);

  return (
    <div class="xs">
      <div class="sheet-head">
        <h2 class="sheet-title">{expense ? (isPayment ? 'Edit payment' : 'Edit expense') : 'New expense'}</h2>
        {expense && (
          <button type="button" class="icon-btn danger" onClick={remove} aria-label="Delete">
            <IconTrash />
          </button>
        )}
        <button type="button" class="icon-btn" onClick={onDone} aria-label="Close">
          <IconClose />
        </button>
      </div>

      <div class="xs-row">
        <label class="sr-only" for="xs-title">
          What was it for?
        </label>
        <input id="xs-title" class="field xs-title" placeholder="What was it for?" value={title} maxLength={80} onInput={(e) => setTitle(e.currentTarget.value)} enterKeyHint="done" autocomplete="off" />
        <label class="sr-only" for="xs-date">
          Date
        </label>
        <input id="xs-date" class="field xs-date" type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} />
      </div>

      <button type="button" class={'amount' + (target === 'total' ? ' is-target' : '')} onClick={() => setTarget('total')} aria-label={`Amount ${formatMoney(amount, cur)}${isExpression(expr) ? ', from ' + expr : ''}`}>
        <span class="amount-expr">{isExpression(expr) ? expr.replace(/\*/g, '×').replace(/\//g, '÷') : target === 'total' ? 'Amount' : 'Total'}</span>
        <span class={'amount-val' + (expr ? '' : ' is-empty')} aria-live="polite">
          {formatMoney(amount, cur)}
          {target === 'total' && <span class="caret" aria-hidden="true" />}
        </span>
      </button>

      <div class="xs-label">Paid by</div>
      <div class="chips" role="radiogroup" aria-label="Paid by" ref={payerRow}>
        {g.members.map((m) => (
          <button
            type="button"
            role="radio"
            aria-checked={payerId === m.id}
            class={'chip' + (payerId === m.id ? ' on' : '')}
            onClick={() => {
              haptic(4);
              setPayer(m.id);
            }}
          >
            <Initial name={m.name} me={m.id === g.meId} size={24} />
            {firstName(g, m.id)}
          </button>
        ))}
      </div>

      <div class="xs-split-head">
        <span class="xs-label">Split</span>
        <Segmented label="Split method" value={method} options={METHODS} onChange={(m) => setMethod(m)} />
      </div>
      <div class="chips" role="group" aria-label="Split between">
        {g.members.map((m) => {
          const on = inc.includes(m.id);
          const part = shares.get(m.id);
          return (
            <button
              type="button"
              aria-pressed={on}
              class={'chip' + (on ? ' on' : '') + (target === m.id ? ' is-target' : '')}
              onPointerDown={() => startPress(m.id)}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              onPointerCancel={cancelPress}
              onContextMenu={(e) => {
                e.preventDefault();
                cancelPress();
                longPressed.current = false;
                setMenuFor(m.id);
              }}
              onClick={() => toggle(m.id)}
              aria-describedby="xs-hold-hint"
            >
              <Initial name={m.name} me={m.id === g.meId} size={24} />
              <span class="chip-name">{firstName(g, m.id)}</span>
              {on && part !== undefined && amount > 0 && <span class="chip-part">{formatMoney(part, cur)}</span>}
            </button>
          );
        })}
      </div>
      {menuFor && (
        <div class="hold-menu" role="menu" aria-label={`Split for ${firstName(g, menuFor)}`}>
          <span class="hold-menu-h">Split for {firstName(g, menuFor)}</span>
          {METHODS.map((o) => (
            <button
              type="button"
              role="menuitem"
              ref={(el) => {
                if (el && o.value === 'exact') el.focus({ preventScroll: true });
              }}
              onClick={() => {
                const id = menuFor;
                setMenuFor(null);
                setMethod(o.value, id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  e.preventDefault();
                  setMenuFor(null);
                }
              }}
            >
              {o.value === 'equal' ? 'Split equally' : o.value === 'exact' ? 'Exact amount' : o.value === 'shares' ? 'Shares' : 'Percent'}
            </button>
          ))}
        </div>
      )}
      <p class="xs-hint" id="xs-hold-hint">
        Tap to include. Hold a name for exact, shares or percent.
      </p>

      {method !== 'equal' && inc.length > 0 && (
        <ul class="xs-people" aria-label="Amount per person">
          {inc.map((id) => (
            <li><button type="button" class={'xs-person' + (target === id ? ' is-target' : '')} onClick={() => setTarget(id)} aria-label={`${firstName(g, id)}: ${vals[id] || '0'} ${unit}. Tap to edit with the keypad.`}>
              <span class="xs-person-name">{firstName(g, id)}</span>
              <span class="xs-person-val">
                {method === 'exact' && <span class="unit">{currencySymbol(cur)}</span>}
                {vals[id] || '0'}
                {method === 'percent' && <span class="unit">%</span>}
                {method === 'shares' && <span class="unit"> sh</span>}
                {target === id && <span class="caret" aria-hidden="true" />}
              </span>
              {method !== 'exact' && <span class="xs-person-part">{amount > 0 && shares.get(id) !== undefined ? formatMoney(shares.get(id)!, cur) : ''}</span>}
            </button></li>
          ))}
        </ul>
      )}
      <p class={'xs-status ' + statusTone} aria-live="polite">
        {error ?? status}
      </p>

      <div class="keypad" data-no-drag role="group" aria-label={targetName ? `Keypad, editing ${targetName}` : 'Keypad, editing amount'}>
        {KEYS.map((k) =>
          k === 'back' ? (
            <button
              type="button"
              class="key"
              aria-label="Delete last character. Hold to clear."
              onClick={() => {
                if (longPressed.current) {
                  longPressed.current = false;
                  return;
                }
                press('back');
              }}
              onPointerDown={() => {
                longPressed.current = false;
                clearTimeout(pressTimer.current);
                pressTimer.current = window.setTimeout(() => {
                  longPressed.current = true;
                  haptic(15);
                  write('');
                }, 500);
              }}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
            >
              <IconBackspace />
            </button>
          ) : (
            <button type="button" class={'key' + ('÷×−+()'.includes(k) ? ' op' : '')} onClick={() => press(k)} aria-label={{ '÷': 'divide', '×': 'times', '−': 'minus', '+': 'plus', '(': 'open bracket', ')': 'close bracket' }[k as string] ?? k}>
              {k}
            </button>
          ),
        )}
        <button type="button" class={'key save' + (amount <= 0 || valid ? ' is-off' : '')} onClick={save}>
          {expense ? 'Save' : 'Add'}
        </button>
      </div>
    </div>
  );
}
