import { useState } from 'preact/hooks';
import { CURRENCIES } from '../core/money';
import { isVpa } from '../core/share';
import type { Group, Member } from '../core/types';
import { createGroup, deleteGroup, getState, restoreGroup, uid, updateGroup, updateSettings, upsertMember } from '../state/store';
import { Initial } from '../ui/bits';
import { haptic, toast } from '../ui/feedback';
import { IconClose, IconPlus, IconTrash } from '../ui/icons';
import { Sheet } from '../ui/SheetView';

function CurrencyPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div class="chips wrap" role="radiogroup" aria-label="Currency">
      {CURRENCIES.map((c) => (
        <button
          type="button"
          role="radio"
          aria-checked={c.code === value}
          class={'chip mono' + (c.code === value ? ' on' : '')}
          title={c.name}
          onClick={() => {
            haptic(4);
            onChange(c.code);
          }}
        >
          {c.code}
        </button>
      ))}
    </div>
  );
}

export function NewGroupSheet({ onDone, onCreated }: { onDone: () => void; onCreated: (g: Group) => void }) {
  const settings = getState().settings;
  const [name, setName] = useState('');
  const [me, setMe] = useState(settings.name);
  const [draft, setDraft] = useState('');
  const [people, setPeople] = useState<string[]>([]);
  const [currency, setCurrency] = useState(settings.currency);
  const [busy, setBusy] = useState(false);

  function addPerson() {
    const n = draft.trim();
    if (!n) return;
    setPeople((p) => (p.includes(n) ? p : [...p, n]));
    setDraft('');
    haptic(4);
  }

  async function create(e: Event) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const others = draft.trim() ? [...people, draft.trim()] : people;
    if (me.trim() && !settings.name) await updateSettings({ name: me.trim() });
    const g = await createGroup(name, currency, me, others);
    haptic(12);
    onCreated(g);
    onDone();
  }

  return (
    <form class="form" onSubmit={create}>
      <div class="sheet-head">
        <h2 class="sheet-title">New group</h2>
        <button type="button" class="icon-btn" onClick={onDone} aria-label="Close">
          <IconClose />
        </button>
      </div>
      <label class="lbl" for="ng-name">
        Group name
      </label>
      <input id="ng-name" class="field" placeholder="Goa trip, Flat 302, Friday lunch" value={name} maxLength={60} onInput={(e) => setName(e.currentTarget.value)} autocomplete="off" />
      <label class="lbl" for="ng-me">
        Your name
      </label>
      <input id="ng-me" class="field" placeholder="You" value={me} maxLength={40} onInput={(e) => setMe(e.currentTarget.value)} autocomplete="given-name" />
      <label class="lbl" for="ng-person">
        People
      </label>
      <div class="add-row">
        <input
          id="ng-person"
          class="field"
          placeholder="Add a name"
          value={draft}
          maxLength={40}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addPerson();
            }
          }}
          autocomplete="off"
          enterKeyHint="next"
        />
        <button type="button" class="btn" onClick={addPerson} aria-label="Add person">
          <IconPlus size={20} />
        </button>
      </div>
      {people.length > 0 && (
        <ul class="chips wrap" aria-label="People in this group">
          {people.map((p) => (
            <li>
              <button type="button" class="chip on" onClick={() => setPeople(people.filter((x) => x !== p))} aria-label={`Remove ${p}`}>
                <Initial name={p} size={24} />
                {p}
                <IconClose size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <span class="lbl">Currency</span>
      <CurrencyPicker value={currency} onChange={setCurrency} />
      <button type="submit" class="btn primary block" disabled={busy}>
        Create group
      </button>
      <p class="fine">You can add more people later. Each person can add a UPI ID so others can pay them in one tap.</p>
    </form>
  );
}

export function MemberSheet({ group: g, member, onDone }: { group: Group; member?: Member; onDone: () => void }) {
  const [name, setName] = useState(member?.name ?? '');
  const [upi, setUpi] = useState(member?.upi ?? '');
  const [err, setErr] = useState<string | null>(null);

  async function save(e: Event) {
    e.preventDefault();
    const n = name.trim();
    const v = upi.trim();
    if (!n) return setErr('Add a name');
    if (v && !isVpa(v)) return setErr('A UPI ID looks like name@bank');
    const m: Member = { id: member?.id ?? uid(), name: n, updatedAt: 0 };
    if (v) m.upi = v;
    await upsertMember(g, m);
    haptic(10);
    onDone();
  }

  return (
    <form class="form" onSubmit={save}>
      <div class="sheet-head">
        <h2 class="sheet-title">{member ? `Edit ${member.name}` : 'Add a person'}</h2>
        <button type="button" class="icon-btn" onClick={onDone} aria-label="Close">
          <IconClose />
        </button>
      </div>
      <label class="lbl" for="m-name">
        Name
      </label>
      <input id="m-name" class="field" value={name} maxLength={40} onInput={(e) => setName(e.currentTarget.value)} autocomplete="off" />
      <label class="lbl" for="m-upi">
        UPI ID <span class="opt">optional</span>
      </label>
      <input id="m-upi" class="field mono" placeholder="name@bank" value={upi} maxLength={80} inputMode="email" autocapitalize="off" spellcheck={false} onInput={(e) => setUpi(e.currentTarget.value)} autocomplete="off" />
      <p class={'xs-status' + (err ? ' warn' : '')} aria-live="polite">
        {err ?? 'With a UPI ID, the settle-up receipt shows a Pay by UPI button for this person.'}
      </p>
      <button type="submit" class="btn primary block">
        {member ? 'Save' : 'Add person'}
      </button>
    </form>
  );
}

export function GroupSettingsSheet({ group: g, onDone, onDeleted }: { group: Group; onDone: () => void; onDeleted: () => void }) {
  const [name, setName] = useState(g.name);
  const [editing, setEditing] = useState<Member | 'new' | null>(null);

  async function rename() {
    const n = name.trim();
    if (n && n !== g.name) await updateGroup({ ...g, name: n }, `Renamed to ${n}`);
  }

  async function remove() {
    await deleteGroup(g);
    haptic([8, 30, 8]);
    onDone();
    onDeleted();
    toast(`Deleted ${g.name}`, { label: 'Undo', run: () => void restoreGroup(g) });
  }

  return (
    <div class="form">
      <div class="sheet-head">
        <h2 class="sheet-title">Group settings</h2>
        <button type="button" class="icon-btn" onClick={onDone} aria-label="Close">
          <IconClose />
        </button>
      </div>
      <label class="lbl" for="gs-name">
        Group name
      </label>
      <input id="gs-name" class="field" value={name} maxLength={60} onInput={(e) => setName(e.currentTarget.value)} onBlur={rename} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} />

      <span class="lbl">Currency</span>
      <CurrencyPicker value={g.currency} onChange={(c) => void updateGroup({ ...g, currency: c }, `Currency set to ${c}`)} />
      <p class="fine">Changing the currency relabels amounts. It does not convert them.</p>

      <span class="lbl">Which one is you?</span>
      <div class="chips wrap" role="radiogroup" aria-label="Which one is you">
        {g.members.map((m) => (
          <button
            type="button"
            role="radio"
            aria-checked={g.meId === m.id}
            class={'chip' + (g.meId === m.id ? ' on' : '')}
            onClick={() => {
              haptic(4);
              void updateGroup({ ...g, meId: m.id });
            }}
          >
            <Initial name={m.name} me={g.meId === m.id} size={24} />
            {m.name}
          </button>
        ))}
      </div>

      <span class="lbl">People</span>
      <ul class="rows">
        {g.members.map((m) => (
          <li>
            <button type="button" class="row" onClick={() => setEditing(m)}>
              <Initial name={m.name} me={g.meId === m.id} />
              <span class="row-main">
                <span class="row-title">{m.name}</span>
                <span class="row-sub mono">{m.upi ?? 'No UPI ID'}</span>
              </span>
              <span class="row-end">Edit</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" class="btn block" onClick={() => setEditing('new')}>
        <IconPlus size={20} /> Add a person
      </button>
      <button type="button" class="btn danger block" onClick={remove}>
        <IconTrash size={20} /> Delete group
      </button>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} label="Person">
        {editing !== null && <MemberSheet group={g} member={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}
