import { computeBalances, groupSpend } from '../core/balances';
import { formatMoney } from '../core/money';
import type { Group } from '../core/types';
import { sampleGroup } from '../sample';
import { getState, liveExpenses, seedGroup, type State } from '../state/store';
import { balanceWords, Mark } from '../ui/bits';
import { haptic } from '../ui/feedback';
import { IconPlus } from '../ui/icons';
import { go } from '../ui/nav';

export function GroupsScreen({ state, onNew }: { state: State; onNew: () => void }) {
  const groups = state.groups;

  async function trySample() {
    const { group, expenses } = sampleGroup(getState().settings.name);
    await seedGroup(group, expenses);
    haptic(12);
    go({ tab: 'groups', groupId: group.id });
  }

  return (
    <section class="screen" aria-labelledby="groups-h">
      <header class="topbar">
        <span class="wordmark">
          <Mark /> Tab
        </span>
        <h1 id="groups-h" class="sr-only">
          Groups
        </h1>
        {groups.length > 0 && (
          <button type="button" class="btn small" onClick={onNew}>
            <IconPlus size={18} /> New group
          </button>
        )}
      </header>
      <div class="scroll">
        {groups.length === 0 ? (
          <div class="onboard">
            <h2 class="onboard-title">Split bills with friends.</h2>
            <p class="onboard-sub">No account, no server. Everything stays on this phone and keeps working offline.</p>
            <ol class="onboard-steps">
              <li>Make a group and add people.</li>
              <li>Add expenses with the keypad. Type sums like 1200+340/2.</li>
              <li>Settle up in the fewest payments, then pay by UPI.</li>
            </ol>
            <div class="onboard-actions">
              <button type="button" class="btn primary block" onClick={onNew}>
                <IconPlus size={20} /> New group
              </button>
              <button type="button" class="btn block" onClick={trySample}>
                Try with sample group
              </button>
            </div>
            <p class="fine">Got a link from a friend? Open it on this phone and Tab will offer to save the group.</p>
          </div>
        ) : (
          <>
            <h2 class="section-h">Groups</h2>
            <ul class="cards">
              {groups.map((g) => (
                <GroupCard g={g} />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

function GroupCard({ g }: { g: Group }) {
  const es = liveExpenses(g.id);
  const bal = computeBalances(g, es);
  const words = es.length ? balanceWords(g, g.meId ? bal.get(g.meId) : undefined) : { text: 'Nothing spent yet', tone: 'zero' as const };
  const spend = groupSpend(es);
  return (
    <li>
      <button type="button" class="card" onClick={() => go({ tab: 'groups', groupId: g.id })}>
        <span class="card-top">
          <span class="card-name">{g.name}</span>
          <span class="card-meta mono">
            {g.members.length} PEOPLE · {g.currency}
          </span>
        </span>
        <span class={'card-balance ' + words.tone}>{words.text}</span>
        <span class="card-foot mono">
          {es.filter((e) => e.kind === 'expense').length} EXPENSES · SPEND {formatMoney(spend, g.currency)}
        </span>
      </button>
    </li>
  );
}
