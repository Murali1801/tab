/**
 * Bottom sheets behind one tiny API, so the implementation can later be
 * swapped for the <bottom-sheet> Web Component from the Sheet project:
 *
 *   const h = open(el, { snap: 'auto' | 'half' | 'full' });
 *   await close();      // closes the top-most sheet
 *
 * This lean version: a modal <dialog> (top layer, focus trap, Esc), drag from
 * the grabber or from content scrolled to the top, velocity projection to pick
 * the detent, flick or drag past half to dismiss, rubber band above the top,
 * critically damped spring, and no motion under prefers-reduced-motion.
 */

export type Snap = 'auto' | 'half' | 'full';

export interface SheetOptions {
  snap?: Snap;
  /** Accessible name for the dialog. */
  label?: string;
  /** Called once after the sheet has fully closed, however it was closed. */
  onClose?: () => void;
}

export interface SheetHandle {
  close(): Promise<void>;
  readonly dialog: HTMLDialogElement;
}

const STIFFNESS = 400;
const DAMPING = 40;
const DECEL = 0.998; // per ms, for the iOS-style release projection
const FLICK = 0.5; // px/ms downward dismisses

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const stack: Inst[] = [];

class Inst implements SheetHandle {
  dialog: HTMLDialogElement;
  panel: HTMLElement;
  body: HTMLElement;
  scrim: HTMLElement;
  y = 0;
  vel = 0; // px/s
  raf = 0;
  height = 0;
  detents: number[] = [0];
  closing: Promise<void> | null = null;
  resolveClose: (() => void) | null = null;
  opener: Element | null;
  cleanup: (() => void)[] = [];

  constructor(
    public content: HTMLElement,
    public opts: SheetOptions,
  ) {
    this.opener = document.activeElement;
    const d = document.createElement('dialog');
    d.className = 'sheet';
    d.dataset.snap = opts.snap ?? 'auto';
    if (opts.label) d.setAttribute('aria-label', opts.label);
    d.innerHTML = '<div class="sheet-scrim"></div><div class="sheet-panel" tabindex="-1" autofocus><div class="sheet-grab" data-sheet-drag><span class="sheet-handle" aria-hidden="true"></span></div><div class="sheet-body"></div></div>';
    this.dialog = d;
    this.scrim = d.querySelector('.sheet-scrim')!;
    this.panel = d.querySelector('.sheet-panel')!;
    this.body = d.querySelector('.sheet-body')!;
    this.body.append(content);
    document.body.append(d);

    d.addEventListener('cancel', (e) => {
      e.preventDefault();
      void this.close();
    });
    d.addEventListener('close', () => this.finish());
    this.scrim.addEventListener('click', () => void this.close());
    this.bindDrag();
    this.bindViewport();
  }

  show() {
    this.dialog.showModal();
    document.documentElement.classList.add('sheet-open');
    this.measure();
    this.setY(this.height);
    this.animateTo(this.detents[this.detents.length > 1 ? 1 : 0]!);
    const ro = new ResizeObserver(() => {
      const atTop = this.y <= this.detents[0]! + 1;
      this.measure();
      if (!this.closing && !this.raf && atTop) this.setY(this.detents[0]!);
    });
    ro.observe(this.content);
    this.cleanup.push(() => ro.disconnect());
  }

  measure() {
    const p = this.panel;
    this.height = p.getBoundingClientRect().height;
    const snap = this.opts.snap ?? 'auto';
    this.detents = snap === 'half' ? [0, Math.round(this.height * 0.45)] : [0];
  }

  setY(y: number) {
    this.y = y;
    this.panel.style.transform = `translate3d(0, ${y}px, 0)`;
    const t = this.height ? Math.min(1, Math.max(0, 1 - y / this.height)) : 1;
    this.scrim.style.opacity = String(t);
  }

  animateTo(target: number, onDone?: () => void) {
    cancelAnimationFrame(this.raf);
    if (reduced()) {
      this.setY(target);
      this.vel = 0;
      this.raf = 0;
      onDone?.();
      return;
    }
    let last = performance.now();
    const closingDown = target >= this.height;
    const step = (t: number) => {
      let dt = Math.min(0.064, (t - last) / 1000);
      last = t;
      // semi-implicit Euler in small sub-steps keeps the spring stable at any frame rate
      while (dt > 0) {
        const h = Math.min(dt, 1 / 240);
        const a = -STIFFNESS * (this.y - target) - DAMPING * this.vel;
        this.vel += a * h;
        this.y += this.vel * h;
        dt -= h;
      }
      this.setY(this.y);
      const done = closingDown ? this.y >= target - 1 : Math.abs(this.y - target) < 0.5 && Math.abs(this.vel) < 20;
      if (done) {
        this.setY(target);
        this.vel = 0;
        this.raf = 0;
        onDone?.();
      } else this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closing = new Promise((r) => (this.resolveClose = r));
    this.animateTo(this.height + 8, () => {
      if (this.dialog.open) this.dialog.close();
      else this.finish();
    });
    return this.closing;
  }

  finished = false;
  finish() {
    if (this.finished) return;
    this.finished = true;
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach((f) => f());
    // let anything parked inside the dialog (e.g. a toast) move out first
    document.dispatchEvent(new CustomEvent('sheet:remove', { detail: this.dialog }));
    this.dialog.remove();
    const i = stack.indexOf(this);
    if (i >= 0) stack.splice(i, 1);
    if (!stack.length) document.documentElement.classList.remove('sheet-open');
    if (this.opener instanceof HTMLElement && this.opener.isConnected) this.opener.focus({ preventScroll: true });
    this.resolveClose?.();
    this.opts.onClose?.();
  }

  rubber(over: number) {
    const dim = this.height || 1;
    return (1 - 1 / ((over * 0.55) / dim + 1)) * dim;
  }

  bindDrag() {
    const panel = this.panel;
    const body = this.body;
    let startY = 0;
    let startX = 0;
    let originY = 0;
    let pointer: number | null = null;
    let dragging = false;
    let samples: { t: number; y: number }[] = [];
    let startTarget: Element | null = null;

    const canStart = (target: Element, dy: number) => {
      if (target.closest('[data-sheet-drag]')) return true;
      if (target.closest('input, textarea, select, [contenteditable], [data-no-drag]')) return false;
      const scroller = target.closest('.sheet-body') as HTMLElement | null;
      if (dy > 0) return !scroller || scroller.scrollTop <= 0;
      return this.y > this.detents[0]! + 1; // dragging up only to expand a half sheet
    };

    panel.addEventListener('pointerdown', (e) => {
      if (pointer !== null || e.button !== 0 || this.closing) return;
      pointer = e.pointerId;
      startY = e.clientY;
      startX = e.clientX;
      originY = this.y;
      dragging = false;
      startTarget = e.target as Element;
      samples = [{ t: e.timeStamp, y: this.y }];
    });

    // moves and releases are read on window, so a fast drag that leaves the panel still counts
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      const dy = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(dy) < 8 || Math.abs(dy) < Math.abs(e.clientX - startX)) return;
        if (!canStart(startTarget ?? (e.target as Element), dy)) {
          pointer = null;
          return;
        }
        dragging = true;
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        panel.setPointerCapture(e.pointerId);
        panel.classList.add('dragging');
      }
      let y = originY + (e.clientY - startY);
      if (y < this.detents[0]!) y = this.detents[0]! - this.rubber(this.detents[0]! - y);
      this.setY(y);
      samples.push({ t: e.timeStamp, y });
      while (samples.length > 2 && e.timeStamp - samples[0]!.t > 100) samples.shift();
    };

    const end = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      if (!dragging) return;
      dragging = false;
      panel.classList.remove('dragging');
      // swallow the click that would follow a drag
      const stop = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);

      const first = samples[0]!;
      const last = samples[samples.length - 1]!;
      const v = last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0; // px/ms
      const projected = this.y + (v * DECEL) / (1 - DECEL);
      const lowest = this.detents[this.detents.length - 1]!;
      this.vel = v * 1000;
      if (e.type === 'pointerup' && (v > FLICK || projected > lowest + (this.height - lowest) * 0.5)) {
        void this.close();
        return;
      }
      let best = this.detents[0]!;
      for (const d of this.detents) if (Math.abs(d - projected) < Math.abs(best - projected)) best = d;
      this.animateTo(best);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    this.cleanup.push(() => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    });

    // Touch: stop the browser from claiming a downward pan at scrollTop 0,
    // otherwise it fires pointercancel and the drag dies.
    let tStartY = 0;
    let tStartX = 0;
    panel.addEventListener(
      'touchstart',
      (e) => {
        tStartY = e.touches[0]!.clientY;
        tStartX = e.touches[0]!.clientX;
      },
      { passive: true },
    );
    panel.addEventListener(
      'touchmove',
      (e) => {
        if (dragging) {
          e.preventDefault();
          return;
        }
        const t = e.touches[0]!;
        const dy = t.clientY - tStartY;
        if (Math.abs(dy) > Math.abs(t.clientX - tStartX) && canStart(e.target as Element, dy) && (dy > 0 || this.y > 0) && body.scrollTop <= 0) e.preventDefault();
      },
      { passive: false },
    );
  }

  bindViewport() {
    const vv = window.visualViewport;
    if (!vv) return;
    const fit = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      this.dialog.style.setProperty('--kb', kb + 'px');
      this.dialog.style.setProperty('--vvh', vv.height + 'px');
    };
    fit();
    vv.addEventListener('resize', fit);
    this.cleanup.push(() => vv.removeEventListener('resize', fit));
  }
}

export function open(el: HTMLElement, opts: SheetOptions = {}): SheetHandle {
  const inst = new Inst(el, opts);
  stack.push(inst);
  inst.show();
  return inst;
}

export function close(): Promise<void> {
  const top = stack[stack.length - 1];
  return top ? top.close() : Promise.resolve();
}
