import { formatMoney } from '../core/money';

export interface ReceiptLine {
  from: string;
  to: string;
  amount: number;
  paid?: boolean;
}

export interface ReceiptData {
  group: string;
  currency: string;
  date: Date;
  people: number;
  lines: ReceiptLine[];
  /** Short mono lines under the transfers, e.g. "3 payments instead of 11". */
  notes: string[];
  upi: { name: string; vpa: string }[];
}

export const receiptDate = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** WhatsApp-friendly text version (proportional fonts, so no dotted leaders). */
export function receiptText(r: ReceiptData): string {
  const out = [`Tab · ${r.group} settle-up (${receiptDate(r.date)})`];
  if (!r.lines.length) out.push('Everyone is settled up.');
  r.lines.forEach((l, i) => out.push(`${i + 1}. ${l.from} → ${l.to}: ${formatMoney(l.amount, r.currency)}${l.paid ? ' (paid)' : ''}`));
  if (r.notes.length) out.push('', ...r.notes);
  if (r.upi.length) out.push('', 'UPI: ' + r.upi.map((u) => `${u.name} ${u.vpa}`).join(', '));
  return out.join('\n');
}

const INK = '#191814';
const STONE = '#6E6A62';
const PAPER = '#FFFFFF';
const YELLOW = '#F6D21F';
const MONO = '"JetBrains Mono", "Archivo", ui-monospace, monospace';
const SANS = '"Archivo", system-ui, sans-serif';

/** Draw the receipt on a canvas: perforated edges, dotted leaders, mono lines. */
export async function receiptPng(r: ReceiptData): Promise<Blob> {
  await Promise.all([document.fonts.load(`500 26px "JetBrains Mono"`, 'A1'), document.fonts.load(`700 40px "Archivo"`, 'A1₹'), document.fonts.load(`400 26px "Archivo"`, '₹')]).catch(() => undefined);

  const S = 2; // drawn at 2x for sharp text on phones
  const W = 380;
  const pad = 26;
  const lineH = 30;
  const rows = Math.max(1, r.lines.length);
  const H = 150 + rows * lineH + 26 + r.notes.length * 20 + (r.upi.length ? 20 : 0) + 60;
  const c = document.createElement('canvas');
  c.width = W * S;
  c.height = H * S;
  const ctx = c.getContext('2d')!;
  ctx.scale(S, S);

  // paper with a perforated (scalloped) top and bottom edge
  const hole = 6;
  const step = 16;
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.moveTo(0, hole);
  for (let x = 0; x < W; x += step) ctx.arc(x + step / 2, 0, hole, Math.PI, 0, true);
  ctx.lineTo(W, H - hole);
  for (let x = W; x > 0; x -= step) ctx.arc(x - step / 2, H, hole, 0, Math.PI, true);
  ctx.closePath();
  ctx.fill();

  let y = 46;
  // mark + wordmark
  ctx.fillStyle = YELLOW;
  ctx.fillRect(pad, y - 15, 15, 15);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.strokeRect(pad + 0.5, y - 14.5, 14, 14);
  ctx.fillStyle = INK;
  ctx.font = `700 22px ${SANS}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Tab', pad + 22, y);
  ctx.font = `500 11px ${MONO}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = STONE;
  ctx.fillText('SETTLE-UP', W - pad, y - 2);
  ctx.textAlign = 'left';

  y += 34;
  ctx.fillStyle = INK;
  ctx.font = `700 20px ${SANS}`;
  ctx.fillText(clip(ctx, r.group, W - pad * 2), pad, y);
  y += 22;
  ctx.font = `400 11px ${MONO}`;
  ctx.fillStyle = STONE;
  ctx.fillText(`${receiptDate(r.date).toUpperCase()} · ${r.people} PEOPLE`, pad, y);

  y += 18;
  dash(ctx, pad, W - pad, y);
  y += 30;

  ctx.font = `500 13px ${MONO}`;
  if (!r.lines.length) {
    ctx.fillStyle = INK;
    ctx.fillText('ALL SETTLED. NOTHING TO PAY.', pad, y);
    y += lineH;
  }
  for (const l of r.lines) {
    const left = `${l.from} → ${l.to}`.toUpperCase();
    const right = formatMoney(l.amount, r.currency);
    ctx.fillStyle = l.paid ? STONE : INK;
    const rw = ctx.measureText(right).width;
    const leftText = clip(ctx, left, W - pad * 2 - rw - 28);
    const lw = ctx.measureText(leftText).width;
    ctx.fillText(leftText, pad, y);
    ctx.textAlign = 'right';
    ctx.fillText(right, W - pad, y);
    ctx.textAlign = 'left';
    // dotted leader
    ctx.fillStyle = STONE;
    for (let x = pad + lw + 8; x < W - pad - rw - 8; x += 6) ctx.fillRect(x, y - 3, 1.6, 1.6);
    if (l.paid) {
      ctx.fillStyle = STONE;
      ctx.fillRect(pad, y - 5, lw, 1);
    }
    y += lineH;
  }
  y -= 8;
  dash(ctx, pad, W - pad, y);
  y += 26;
  ctx.font = `400 11px ${MONO}`;
  ctx.fillStyle = INK;
  for (const n of r.notes) {
    ctx.fillText(clip(ctx, n.toUpperCase(), W - pad * 2), pad, y);
    y += 20;
  }
  ctx.fillStyle = STONE;
  if (r.upi.length) {
    ctx.fillText(clip(ctx, 'UPI · ' + r.upi.map((u) => `${u.name.toUpperCase()} ${u.vpa}`).join(' · '), W - pad * 2), pad, y);
    y += 20;
  }
  y += 8;
  ctx.fillText('MADE WITH TAB · NO ACCOUNT, NO SERVER', pad, y);

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG export failed'))), 'image/png'));
}

function dash(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number) {
  ctx.fillStyle = STONE;
  for (let x = x0; x < x1; x += 8) ctx.fillRect(x, y, 4, 1);
}

function clip(ctx: CanvasRenderingContext2D, s: string, max: number): string {
  if (ctx.measureText(s).width <= max) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1);
  return s + '…';
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

/** Web Share with the PNG + text; falls back to text-only share, then to download + copy. */
export async function shareReceipt(r: ReceiptData): Promise<ShareOutcome> {
  const blob = await receiptPng(r);
  const name = `tab-${r.group.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group'}-settle-up.png`;
  const file = new File([blob], name, { type: 'image/png' });
  const text = receiptText(r);
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text, title: `${r.group} settle-up` });
      return 'shared';
    }
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return 'cancelled';
  }
  downloadBlob(blob, name);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard can be blocked; the PNG still downloaded */
  }
  return 'downloaded';
}
