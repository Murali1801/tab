import { formatMoney } from '../core/money';
import type { ActivityType } from '../core/types';
import type { State } from '../state/store';
import { Mark } from '../ui/bits';
import { go } from '../ui/nav';

const VERB: Record<ActivityType, string> = {
  add: 'ADDED',
  edit: 'EDITED',
  delete: 'DELETED',
  restore: 'UNDONE',
  paid: 'PAID',
  group: 'GROUP',
  import: 'LINK',
  member: 'PERSON',
};

export function ActivityScreen({ state }: { state: State }) {
  const items = state.activity;
  const live = new Set(state.groups.map((g) => g.id));
  const cur = (id: string) => state.groups.find((g) => g.id === id)?.currency ?? state.settings.currency;

  const days: { label: string; items: typeof items }[] = [];
  for (const a of items) {
    const label = new Date(a.at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
    const last = days[days.length - 1];
    if (last && last.label === label) last.items.push(a);
    else days.push({ label, items: [a] });
  }

  return (
    <section class="screen" aria-labelledby="act-h">
      <header class="topbar">
        <h1 id="act-h" class="topbar-title big">
          Activity
        </h1>
      </header>
      <div class="scroll">
        {items.length === 0 ? (
          <div class="empty">
            <p>Nothing here yet.</p>
            <p class="fine">Every expense you add, edit, delete or settle is listed here, newest first.</p>
          </div>
        ) : (
          days.map((d) => (
            <div class="day">
              <h2 class="day-h mono">{d.label}</h2>
              <ul class="log">
                {d.items.map((a) => {
                  const body = (
                    <>
                      <span class="log-time mono">{new Date(a.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
                      <span class="log-main">
                        <span class={'log-tag mono t-' + a.type}>{VERB[a.type]}</span>
                        <span class="log-text">{a.text}</span>
                      </span>
                      {a.amount !== undefined && <span class="log-amt money">{formatMoney(a.amount, cur(a.groupId))}</span>}
                    </>
                  );
                  return <li>{live.has(a.groupId) ? <button type="button" class="log-row" onClick={() => go({ tab: 'groups', groupId: a.groupId })}>{body}</button> : <div class="log-row">{body}</div>}</li>;
                })}
              </ul>
            </div>
          ))
        )}
        {items.length > 0 && (
          <p class="end-glyph" aria-hidden="true">
            <Mark />
          </p>
        )}
      </div>
    </section>
  );
}
