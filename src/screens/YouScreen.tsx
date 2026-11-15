import { useEffect, useState } from 'preact/hooks';
import { CURRENCIES } from '../core/money';
import { downloadBlob } from '../lib/receipt';
import { eraseEverything, exportAll, updateSettings, type State, type Theme } from '../state/store';
import { Segmented, Signature } from '../ui/bits';
import { haptic, toast } from '../ui/feedback';
import { IconDownload, IconTrash } from '../ui/icons';
import { canInstall, install, isStandalone, onInstallChange } from '../ui/pwa';
import { Sheet } from '../ui/SheetView';

export function YouScreen({ state }: { state: State }) {
  const s = state.settings;
  const [name, setName] = useState(s.name);
  const [offline, setOffline] = useState<'checking' | 'ready' | 'no'>('checking');
  const [installable, setInstallable] = useState(canInstall());
  const [confirm, setConfirm] = useState(false);

  useEffect(() => setName(s.name), [s.name]);
  useEffect(() => onInstallChange(() => setInstallable(canInstall())), []);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return setOffline('no');
    let alive = true;
    const t = setTimeout(() => alive && setOffline((o) => (o === 'checking' ? 'no' : o)), 4000);
    void navigator.serviceWorker.ready.then(() => alive && setOffline('ready'));
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  const groups = state.groups.length;
  const entries = [...state.expenses.values()].reduce((n, l) => n + l.filter((e) => !e.deleted).length, 0);

  return (
    <section class="screen" aria-labelledby="you-h">
      <header class="topbar">
        <h1 id="you-h" class="topbar-title big">
          You
        </h1>
      </header>
      <div class="scroll">
        <div class="form">
          <label class="lbl" for="you-name">
            Your name
          </label>
          <input
            id="you-name"
            class="field"
            placeholder="Used when you start a group"
            value={name}
            maxLength={40}
            onInput={(e) => setName(e.currentTarget.value)}
            onBlur={() => name.trim() !== s.name && void updateSettings({ name: name.trim() })}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
            autocomplete="given-name"
          />

          <span class="lbl">Default currency for new groups</span>
          <div class="chips wrap" role="radiogroup" aria-label="Default currency">
            {CURRENCIES.map((c) => (
              <button
                type="button"
                role="radio"
                aria-checked={c.code === s.currency}
                class={'chip mono' + (c.code === s.currency ? ' on' : '')}
                title={c.name}
                onClick={() => {
                  haptic(4);
                  void updateSettings({ currency: c.code });
                }}
              >
                {c.code}
              </button>
            ))}
          </div>

          <span class="lbl">Theme</span>
          <Segmented<Theme>
            label="Theme"
            value={s.theme}
            onChange={(t) => void updateSettings({ theme: t })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </div>

        <h2 class="section-h">This device</h2>
        <ul class="facts mono">
          <li>
            <span>Offline</span>
            <span class={offline === 'ready' ? 'tone-pos' : ''}>{offline === 'ready' ? 'READY' : offline === 'checking' ? 'CHECKING' : 'NOT YET'}</span>
          </li>
          <li>
            <span>Installed</span>
            <span>{isStandalone() ? 'YES' : 'NO'}</span>
          </li>
          <li>
            <span>Stored here</span>
            <span>
              {groups} GROUP{groups === 1 ? '' : 'S'} · {entries} ENTR{entries === 1 ? 'Y' : 'IES'}
            </span>
          </li>
        </ul>
        {!isStandalone() &&
          (installable ? (
            <button type="button" class="btn primary block" onClick={() => void install()}>
              Install Tab
            </button>
          ) : (
            <p class="fine">To install: in Chrome use the menu and Install app. On iPhone use Share, then Add to Home Screen.</p>
          ))}

        <h2 class="section-h">Your data</h2>
        <p class="fine">Tab has no server. Groups live in this browser (IndexedDB) and only leave it when you share a link or a receipt.</p>
        <div class="settle-actions">
          <button
            type="button"
            class="btn"
            onClick={() => {
              downloadBlob(new Blob([exportAll()], { type: 'application/json' }), `tab-backup-${new Date().toISOString().slice(0, 10)}.json`);
              toast('Backup saved');
            }}
          >
            <IconDownload size={20} /> Export JSON
          </button>
          <button type="button" class="btn danger" onClick={() => setConfirm(true)}>
            <IconTrash size={20} /> Erase all
          </button>
        </div>

        <h2 class="section-h">About</h2>
        <p class="fine">Tab splits bills with whole-paise maths, finds the fewest settle-up payments for groups up to 12, and shares groups as links that never touch a server. Open source, MIT.</p>
        <Signature />
      </div>

      <Sheet open={confirm} onClose={() => setConfirm(false)} label="Erase everything">
        <div class="form">
          <div class="sheet-head">
            <h2 class="sheet-title">Erase everything?</h2>
          </div>
          <p class="lede">
            This deletes {groups} group{groups === 1 ? '' : 's'} and all activity from this device. There is no server copy, so it cannot be undone. Export a backup first if you might need it.
          </p>
          <button
            type="button"
            class="btn danger block"
            onClick={async () => {
              await eraseEverything();
              haptic([10, 40, 10]);
              setConfirm(false);
              toast('Everything erased');
            }}
          >
            Erase everything
          </button>
          <button type="button" class="btn block" onClick={() => setConfirm(false)}>
            Keep my data
          </button>
        </div>
      </Sheet>
    </section>
  );
}
