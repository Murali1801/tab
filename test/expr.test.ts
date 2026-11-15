import { describe, expect, it } from 'vitest';
import { evaluateMinor, ExprError, isExpression, previewMinor } from '../src/core/expr';

describe('expression parser', () => {
  it('follows operator precedence', () => {
    expect(evaluateMinor('1200+340/2')).toBe(137000);
    expect(evaluateMinor('2+3*4')).toBe(1400);
    expect(evaluateMinor('(2+3)*4')).toBe(2000);
    expect(evaluateMinor('10-4-3')).toBe(300); // left associative
    expect(evaluateMinor('100/4/5')).toBe(500);
  });

  it('uses exact fractions, rounding once at the end', () => {
    expect(evaluateMinor('0.1+0.2')).toBe(30);
    expect(evaluateMinor('100/3')).toBe(3333);
    expect(evaluateMinor('100/3*3')).toBe(10000); // not 99.99
    expect(evaluateMinor('0.005')).toBe(1); // half away from zero
    expect(evaluateMinor('-0.005')).toBe(-1);
    expect(evaluateMinor('1000/3', 0)).toBe(333);
  });

  it('accepts friendly symbols, unary signs, commas and spaces', () => {
    expect(evaluateMinor('1,200 × 2')).toBe(240000);
    expect(evaluateMinor('90 ÷ 3')).toBe(3000);
    expect(evaluateMinor('500 − 120')).toBe(38000);
    expect(evaluateMinor('-5+10')).toBe(500);
    expect(evaluateMinor('--5')).toBe(500);
    expect(evaluateMinor('.5+5.')).toBe(550);
  });

  it('throws ExprError on bad input, never runs code', () => {
    for (const bad of ['', '1+', '(1+2', '1+2)', '1..2', '2/0', 'alert(1)', '1;2', 'constructor', '2**3', '()']) {
      expect(() => evaluateMinor(bad), bad).toThrow(ExprError);
    }
  });

  it('previews partial input while typing', () => {
    expect(previewMinor('1200+')).toBe(120000);
    expect(previewMinor('1200+340/')).toBe(154000);
    expect(previewMinor('(100+50')).toBe(15000);
    expect(previewMinor('5/0')).toBeNull();
    expect(previewMinor('')).toBeNull();
  });

  it('knows a plain number from an expression', () => {
    expect(isExpression('1200')).toBe(false);
    expect(isExpression('-1200')).toBe(false);
    expect(isExpression('1200+5')).toBe(true);
  });
});
