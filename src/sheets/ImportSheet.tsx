import { useState } from 'preact/hooks';
import { computeBalances, groupSpend } from '../core/balances';
import { formatMoney } from '../core/money';
import type { SharedGroup } from '../core/share';
import type { Group } from '../core/types';
import { findGroup, importShared } from '../state/store';
import { Initial } from '../ui/bits';
import { haptic, toast } from '../ui/feedback';
import { IconClose } from '../ui/icons';

export function ImportSheet({ shared, onDone, onImported }: { shared: SharedGroup; onDone: () => void; onImported: (g: Group) => void }) {
  const existing = findGroup(shared.group.id);
  const [me, setMe] = useState<string | undefined>(existing?.meId);
  const [busy, setBusy] = useState(false);
  const g = shared.group;
  const live = shared.expenses.filter((e) => !e.deleted);
  const bal = computeBalances(g, live);

  async function go() {
    setBusy(true);
    const r = await importShared(shared, me);
    haptic(12);
    onDone();
    onImported(r.group);
    if (r.isNew) toast(`Added ${r.group.name}`);
    else toast(r.added + r.updated + r.removed ? `Merged: ${r.added} new, ${r.updated} updated, ${r.removed} removed` : 'Already up to date');
  }

  return (
    <div class="form">
      <div class="sheet-head">
        <h2 class="sheet-title">{existing ? 'Update a group' : 'Open a shared group'}</h2>
        <button type="button" class="icon-btn" onClick={onDone} aria-label="Close">
          <IconClose />
        </button>
      </div>
      <div class="import-card">
        <p class="import-name">{g.name}</p>
        <p class="mono import-meta">
          {g.members.length} PEOPLE · {live.length} ENTRIES · SPEND {formatMoney(groupSpend(live), g.currency)}
        </p>
      </div>
      <p class="lede">{existing ? 'You already have this group. Merging keeps the newest version of every expense and never removes people.' : 'This group came inside the link. It will be saved on this device only.'}</p>
      <span class="lbl">Which one is you?</span>
      <div class="rows" role="radiogroup" aria-label="Which one is you">
        {g.members.map((m) => {
          const v = bal.get(m.id) ?? 0;
          return (
            <button type="button" role="radio" aria-checked={me === m.id} class={'row' + (me === m.id ? ' on' : '')} onClick={() => setMe(m.id)}>
              <Initial name={m.name} me={me === m.id} />
              <span class="row-main">
                <span class="row-title">{m.name}</span>
              </span>
              <span class={'row-end money ' + (v > 0 ? 'pos' : v < 0 ? 'neg' : '')}>{formatMoney(v, g.currency, { sign: true })}</span>
            </button>
          );
        })}
      </div>
      <button type="button" class="btn primary block" onClick={go} disabled={busy}>
        {existing ? 'Merge into my copy' : 'Save group'}
      </button>
      {!me && <p class="fine">You can skip this and pick later in group settings.</p>}
    </div>
  );
}
