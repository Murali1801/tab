import type { Minor } from './types';

export interface CurrencyInfo {
  code: string;
  name: string;
  /** Number of minor-unit digits (2 for paise, 0 for yen). */
  exp: number;
  locale: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'INR', name: 'Indian rupee', exp: 2, locale: 'en-IN' },
  { code: 'USD', name: 'US dollar', exp: 2, locale: 'en-US' },
  { code: 'EUR', name: 'Euro', exp: 2, locale: 'en-IE' },
  { code: 'GBP', name: 'Pound sterling', exp: 2, locale: 'en-GB' },
  { code: 'AED', name: 'UAE dirham', exp: 2, locale: 'en-AE' },
  { code: 'SGD', name: 'Singapore dollar', exp: 2, locale: 'en-SG' },
  { code: 'THB', name: 'Thai baht', exp: 2, locale: 'en-US' },
  { code: 'JPY', name: 'Japanese yen', exp: 0, locale: 'en-US' },
];

export const DEFAULT_CURRENCY = 'INR';

export function currencyInfo(code: string): CurrencyInfo {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0]!;
}

const fmtCache = new Map<string, Intl.NumberFormat>();
function formatter(code: string, trim: boolean): Intl.NumberFormat {
  const key = code + (trim ? ':t' : '');
  let f = fmtCache.get(key);
  if (!f) {
    const info = currencyInfo(code);
    f = new Intl.NumberFormat(info.locale, {
      style: 'currency',
      currency: info.code,
      minimumFractionDigits: trim ? 0 : info.exp,
      maximumFractionDigits: info.exp,
    });
    fmtCache.set(key, f);
  }
  return f;
}

/** Format minor units, e.g. 124000 INR -> "₹1,240" (trailing .00 dropped when trim). */
export function formatMoney(minor: Minor, code: string, opts: { trim?: boolean; sign?: boolean } = {}): string {
  const info = currencyInfo(code);
  const whole = minor % 10 ** info.exp === 0;
  const trim = opts.trim !== false && whole;
  const s = formatter(code, trim).format(Math.abs(minor) / 10 ** info.exp);
  if (minor < 0) return '−' + s;
  if (opts.sign && minor > 0) return '+' + s;
  return s;
}

/** Plain decimal string for UPI links and text export: 124050 -> "1240.50". */
export function minorToDecimal(minor: Minor, code: string): string {
  const exp = currencyInfo(code).exp;
  const neg = minor < 0;
  const abs = Math.abs(minor);
  if (exp === 0) return (neg ? '-' : '') + String(abs);
  const s = String(abs).padStart(exp + 1, '0');
  return (neg ? '-' : '') + s.slice(0, -exp) + '.' + s.slice(-exp);
}

export function currencySymbol(code: string): string {
  const parts = formatter(code, true).formatToParts(0);
  return parts.find((p) => p.type === 'currency')?.value ?? code;
}
