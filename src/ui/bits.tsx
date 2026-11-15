import type { ComponentChildren } from 'preact';
import { formatMoney } from '../core/money';
import type { Group, Minor } from '../core/types';
import { haptic } from './feedback';

export const REPO_URL = 'https://github.com/Murali1801/tab';

export function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return (w.length > 1 ? w[0]![0]! + w[w.length - 1]![0]! : w[0]!.slice(0, 1)).toUpperCase();
}

/** Plain letter chip for a person. The device owner gets the yellow block. */
export function Initial({ name, me, size = 32 }: { name: string; me?: boolean; size?: number }) {
  return (
    <span class={'initial' + (me ? ' is-me' : '')} style={{ width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.38) + 'px' }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function Money({ v, cur, sign, class: cls }: { v: Minor; cur: string; sign?: boolean; class?: string }) {
  return <span class={'money' + (cls ? ' ' + cls : '')}>{formatMoney(v, cur, { sign })}</span>;
}

/** A receipt line: label, dotted leader, value. */
export function Leader({ left, right, class: cls }: { left: ComponentChildren; right: ComponentChildren; class?: string }) {
  return (
    <span class={'leader' + (cls ? ' ' + cls : '')}>
      <span class="leader-l">{left}</span>
      <span class="leader-dots" aria-hidden="true" />
      <span class="leader-r">{right}</span>
    </span>
  );
}

export function Mark({ blink }: { blink?: boolean }) {
  return <span class={'mark' + (blink ? ' blink' : '')} aria-hidden="true" />;
}

/** "You're owed ₹1,240" from the device owner's point of view. */
export function balanceWords(g: Group, net: Minor | undefined): { text: string; tone: 'pos' | 'neg' | 'zero' } {
  if (net === undefined || !g.meId) return { text: 'Pick which member is you', tone: 'zero' };
  if (net > 0) return { text: `You're owed ${formatMoney(net, g.currency)}`, tone: 'pos' };
  if (net < 0) return { text: `You owe ${formatMoney(-net, g.currency)}`, tone: 'neg' };
  return { text: 'You are settled up', tone: 'zero' };
}

export function Signature() {
  return (
    <footer class="signature">
      <p class="sig-line">
        <Mark /> Murali · github.com/Murali1801
      </p>
      <p class="sig-links">
        <a href="https://github.com/Murali1801" target="_blank" rel="noopener">
          GitHub
        </a>
        <a href={REPO_URL} target="_blank" rel="noopener">
          Source
        </a>
      </p>
    </footer>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div class="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          role="radio"
          aria-checked={o.value === value}
          class={o.value === value ? 'on' : ''}
          onClick={() => {
            if (o.value !== value) haptic(4);
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
