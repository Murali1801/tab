/**
 * Amount expressions like `1200+340/2`, parsed by hand (no eval, no Function).
 * Arithmetic is done on exact fractions (BigInt numerator/denominator), so
 * 0.1+0.2 is exactly 0.3 and the result is rounded to minor units only once.
 */

export class ExprError extends Error {}

interface Q {
  n: bigint;
  d: bigint;
}

const abs = (x: bigint) => (x < 0n ? -x : x);
function gcd(a: bigint, b: bigint): bigint {
  a = abs(a);
  b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}
function q(n: bigint, d: bigint = 1n): Q {
  if (d === 0n) throw new ExprError('Cannot divide by zero');
  if (d < 0n) [n, d] = [-n, -d];
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}
const add = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Q, b: Q) => q(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q) => {
  if (b.n === 0n) throw new ExprError('Cannot divide by zero');
  return q(a.n * b.d, a.d * b.n);
};

type Tok = { t: 'num'; v: Q } | { t: 'op'; v: '+' | '-' | '*' | '/' | '(' | ')' };

const ALIASES: Record<string, string> = { '×': '*', x: '*', X: '*', '÷': '/', '−': '-', '–': '-' };

export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    let c = src[i]!;
    c = ALIASES[c] ?? c;
    if (c === ' ' || c === ',' || c === '_') {
      i++;
      continue;
    }
    if ((c >= '0' && c <= '9') || c === '.') {
      let j = i;
      let dot = -1;
      while (j < src.length && ((src[j]! >= '0' && src[j]! <= '9') || src[j] === '.' || src[j] === ',')) {
        if (src[j] === '.') {
          if (dot >= 0) throw new ExprError('Two decimal points in one number');
          dot = j;
        }
        j++;
      }
      const raw = src.slice(i, j).replace(/,/g, '');
      const [intPart = '', frac = ''] = raw.split('.');
      if (!intPart && !frac) throw new ExprError('Lonely decimal point');
      if (intPart.length + frac.length > 15) throw new ExprError('Number too long');
      out.push({ t: 'num', v: q(BigInt((intPart || '0') + frac), 10n ** BigInt(frac.length)) });
      i = j;
      continue;
    }
    if ('+-*/()'.includes(c)) {
      out.push({ t: 'op', v: c as '+' });
      i++;
      continue;
    }
    throw new ExprError(`Unexpected "${src[i]}"`);
  }
  return out;
}

function parse(toks: Tok[]): Q {
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => {
    const t = peek();
    return t?.t === 'op' && t.v === v;
  };
  function expr(): Q {
    let v = term();
    while (isOp('+') || isOp('-')) {
      const op = (toks[p++] as { v: string }).v;
      const r = term();
      v = op === '+' ? add(v, r) : sub(v, r);
    }
    return v;
  }
  function term(): Q {
    let v = unary();
    while (isOp('*') || isOp('/')) {
      const op = (toks[p++] as { v: string }).v;
      const r = unary();
      v = op === '*' ? mul(v, r) : div(v, r);
    }
    return v;
  }
  function unary(): Q {
    if (isOp('-')) {
      p++;
      const v = unary();
      return q(-v.n, v.d);
    }
    if (isOp('+')) {
      p++;
      return unary();
    }
    return primary();
  }
  function primary(): Q {
    const t = peek();
    if (!t) throw new ExprError('Expression ends too early');
    if (t.t === 'num') {
      p++;
      return t.v;
    }
    if (t.v === '(') {
      p++;
      const v = expr();
      if (!isOp(')')) throw new ExprError('Missing )');
      p++;
      return v;
    }
    throw new ExprError(`Unexpected "${t.v}"`);
  }
  if (!toks.length) throw new ExprError('Empty');
  const v = expr();
  if (p < toks.length) throw new ExprError('Unexpected ")"');
  return v;
}

/** Round an exact fraction to `exp` decimal places, half away from zero, as an integer of minor units. */
function toMinor(v: Q, exp: number): number {
  const scale = 10n ** BigInt(exp);
  const num = v.n * scale;
  const neg = num < 0n;
  const a = abs(num);
  let r = a / v.d;
  if ((a % v.d) * 2n >= v.d) r += 1n;
  const out = Number(neg ? -r : r);
  if (!Number.isSafeInteger(out)) throw new ExprError('Number too large');
  return out;
}

/** Strict: evaluate the whole expression to minor units, or throw ExprError. */
export function evaluateMinor(src: string, exp = 2): number {
  return toMinor(parse(tokenize(src)), exp);
}

/** True when the input is more than a plain number (worth showing a live result). */
export function isExpression(src: string): boolean {
  return /[-+*/×÷−()x]/.test(src.replace(/^\s*[-−]/, ''));
}

/**
 * Lenient, for the live preview while typing: drops trailing operators and
 * closes open brackets, so `1200+340/` previews 1540. Returns null if hopeless.
 */
export function previewMinor(src: string, exp = 2): number | null {
  let s = src.trim();
  for (let guard = 0; guard < 64 && s; guard++) {
    try {
      const open = (s.match(/\(/g) ?? []).length - (s.match(/\)/g) ?? []).length;
      return evaluateMinor(s + ')'.repeat(Math.max(0, open)), exp);
    } catch (e) {
      if (!(e instanceof ExprError)) throw e;
      if (/divide by zero/.test(e.message)) return null;
      s = s.slice(0, -1).trimEnd();
    }
  }
  return null;
}
