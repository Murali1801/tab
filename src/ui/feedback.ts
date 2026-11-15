/** Light haptics on key actions, only where the device supports it. */
export function haptic(pattern: number | number[] = 8) {
  if ('vibrate' in navigator && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* some browsers throw without user activation */
    }
  }
}

let el: HTMLDivElement | null = null;
let timer = 0;

function hide() {
  clearTimeout(timer);
  if (!el) return;
  try {
    if (el.matches(':popover-open')) el.hidePopover();
  } catch {
    /* popover unsupported */
  }
  el.replaceChildren();
}

/**
 * One toast at a time, as a manual popover so it sits in the top layer. A
 * modal sheet makes everything outside it inert, so while a sheet is open the
 * toast lives inside that sheet's <dialog> and its Undo button stays usable.
 * Undo toasts stay up for 6 s, plain notes for 3 s.
 */
export function toast(text: string, action?: { label: string; run: () => void }) {
  hide();
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.popover = 'manual';
  }
  const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog.sheet[open]');
  const host = dialogs[dialogs.length - 1] ?? document.body;
  if (el.parentElement !== host) host.append(el);

  const t = document.createElement('span');
  t.className = 'toast-text';
  t.textContent = text;
  el.append(t);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-action';
    b.textContent = action.label;
    b.addEventListener('click', () => {
      action.run();
      haptic(6);
      hide();
    });
    el.append(b);
  }
  try {
    el.showPopover();
  } catch {
    /* without popover support it still renders in flow */
  }
  timer = window.setTimeout(hide, action ? 6000 : 3000);
}

/** Moves a visible toast out of a sheet that is about to be removed. */
function rescueToast(dialog: HTMLDialogElement) {
  if (el && el.parentElement === dialog && el.childElementCount) {
    const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog.sheet[open]')].filter((d) => d !== dialog);
    const wasOpen = el.matches(':popover-open');
    (dialogs[dialogs.length - 1] ?? document.body).append(el);
    try {
      if (wasOpen && !el.matches(':popover-open')) el.showPopover();
    } catch {
      /* ignore */
    }
  }
}

document.addEventListener('sheet:remove', (e) => rescueToast((e as CustomEvent<HTMLDialogElement>).detail));
