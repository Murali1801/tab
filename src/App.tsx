import { useEffect, useState } from 'preact/hooks';
import { decodeGroup, groupCodeFromHash, ShareError, type SharedGroup } from './core/share';
import { QR } from './lib/qr';
import { ActivityScreen } from './screens/ActivityScreen';
import { GroupScreen } from './screens/GroupScreen';
import { GroupsScreen } from './screens/GroupsScreen';
import { YouScreen } from './screens/YouScreen';
import { NewGroupSheet } from './sheets/GroupSheets';
import { ImportSheet } from './sheets/ImportSheet';
import { findGroup, useStore } from './state/store';
import { Mark, Signature } from './ui/bits';
import { haptic, toast } from './ui/feedback';
import { IconActivity, IconReceipt, IconYou } from './ui/icons';
import { go, useRoute, type Tab } from './ui/nav';
import { Sheet } from './ui/SheetView';

const TABS: { id: Tab; label: string; Icon: typeof IconReceipt }[] = [
  { id: 'groups', label: 'Groups', Icon: IconReceipt },
  { id: 'activity', label: 'Activity', Icon: IconActivity },
  { id: 'you', label: 'You', Icon: IconYou },
];

export function App() {
  const state = useStore();
  const route = useRoute();
  const [newGroup, setNewGroup] = useState(false);
  const [incoming, setIncoming] = useState<SharedGroup | null>(null);
  const wide = useMedia('(min-width: 960px)');

  // theme: system unless the person picked one
  useEffect(() => {
    const t = state.settings.theme;
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }, [state.settings.theme]);

  // a shared group arrives in the URL fragment (#g=...), never the query string
  useEffect(() => {
    if (!state.ready) return;
    const check = async () => {
      const code = groupCodeFromHash(location.hash);
      if (!code) return;
      history.replaceState(history.state, '', location.pathname + location.search);
      try {
        setIncoming(await decodeGroup(code));
      } catch (e) {
        toast(e instanceof ShareError ? e.message : 'Could not open that link');
      }
    };
    void check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, [state.ready]);

  const group = route.groupId ? findGroup(route.groupId) : undefined;
  useEffect(() => {
    if (state.ready && route.groupId && !group) go({ tab: route.tab }, 'back');
  }, [state.ready, route.groupId, group]);

  let screen;
  if (!state.ready) screen = <Boot />;
  else if (route.tab === 'groups' && group) screen = <GroupScreen key={group.id} group={group} />;
  else if (route.tab === 'activity') screen = <ActivityScreen state={state} />;
  else if (route.tab === 'you') screen = <YouScreen state={state} />;
  else screen = <GroupsScreen state={state} onNew={() => setNewGroup(true)} />;

  const active: Tab = route.tab;

  return (
    <div class="shell">
      {wide && <aside class="side" aria-label="About Tab">
        <p class="wordmark big">
          <Mark /> Tab
        </p>
        <p class="side-lede">Split bills with friends. No account, no server, works offline.</p>
        <ul class="side-points">
          <li>Groups, expenses and balances live in this browser. Nothing is uploaded.</li>
          <li>Share a group as a link or QR. The data rides after the #, which never reaches a server.</li>
          <li>Settle up in the fewest payments, then pay by UPI or share the receipt.</li>
        </ul>
        <div class="side-qr">
          <QR text={location.origin + location.pathname} label="QR code to open Tab on your phone" size={132} />
          <p class="fine">Open on your phone, then add it to your home screen. It is built for one thumb.</p>
        </div>
        <Signature />
      </aside>}

      <div class="app" id="app">
        <main class="stage">{screen}</main>
        <nav class="tabbar" aria-label="Main">
          {TABS.map(({ id, label, Icon }) => (
            <button
              type="button"
              class={'tab' + (active === id ? ' on' : '')}
              aria-current={active === id ? 'page' : undefined}
              onClick={() => {
                if (active === id && !route.groupId) return;
                haptic(4);
                go({ tab: id }, active === id ? 'back' : 'swap');
              }}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      <Sheet open={newGroup} onClose={() => setNewGroup(false)} label="New group">
        {newGroup && <NewGroupSheet onDone={() => setNewGroup(false)} onCreated={(g) => go({ tab: 'groups', groupId: g.id })} />}
      </Sheet>
      <Sheet open={!!incoming} onClose={() => setIncoming(null)} label="Shared group">
        {incoming && <ImportSheet shared={incoming} onDone={() => setIncoming(null)} onImported={(g) => go({ tab: 'groups', groupId: g.id })} />}
      </Sheet>
    </div>
  );
}

function useMedia(q: string): boolean {
  const [on, setOn] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const f = () => setOn(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [q]);
  return on;
}

function Boot() {
  return (
    <div class="boot" role="status" aria-label="Opening Tab">
      <Mark blink />
    </div>
  );
}
