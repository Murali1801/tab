import { useEffect, useState } from 'preact/hooks';

export type Tab = 'groups' | 'activity' | 'you';
export interface Route {
  tab: Tab;
  groupId?: string;
}

let route: Route = (history.state as Route | null)?.tab ? (history.state as Route) : { tab: 'groups' };
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());

export function useRoute(): Route {
  const [, force] = useState(0);
  const seen = route;
  useEffect(() => {
    const s = () => force((n) => n + 1);
    subs.add(s);
    if (route !== seen) s();
    return () => void subs.delete(s);
  }, []);
  return route;
}

type Dir = 'forward' | 'back' | 'swap';

/** Swap screens inside a View Transition where supported. */
function transition(dir: Dir, apply: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => Promise<void> | void) => unknown };
  if (!doc.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    apply();
    return;
  }
  document.documentElement.dataset.nav = dir;
  doc.startViewTransition(() => {
    apply();
    // Preact renders on a microtask; wait one macrotask so the new DOM is in.
    return new Promise<void>((r) => setTimeout(r, 0));
  });
}

export function go(next: Route, dir: Dir = 'forward') {
  transition(dir, () => {
    route = next;
    if (dir === 'forward') history.pushState(next, '');
    else history.replaceState(next, '');
    emit();
  });
}

/** Back from a pushed screen: uses the browser history so the Android back button agrees. */
export function back() {
  if (history.state && (history.state as Route).groupId && history.length > 1) history.back();
  else go({ tab: route.tab }, 'back');
}

window.addEventListener('popstate', (e) => {
  // a hash-only change (a #g= share link) is not navigation: keep the screen
  if (!e.state) {
    history.replaceState(route, '');
    return;
  }
  const next = (e.state as Route | null)?.tab ? (e.state as Route) : { tab: 'groups' as Tab };
  const dir: Dir = route.groupId && !next.groupId ? 'back' : 'forward';
  transition(dir, () => {
    route = next;
    emit();
  });
});

if (!history.state) history.replaceState(route, '');
