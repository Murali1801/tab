import { useEffect, useState } from 'preact/hooks';
import { encodeGroup } from '../core/share';
import type { Group } from '../core/types';
import { QR } from '../lib/qr';
import { getState } from '../state/store';
import { haptic, toast } from '../ui/feedback';
import { IconClose, IconCopy, IconShare } from '../ui/icons';

export function ShareSheet({ group: g, onDone }: { group: Group; onDone: () => void }) {
  const [link, setLink] = useState<string | null>(null);
  const expenses = getState().expenses.get(g.id) ?? [];

  useEffect(() => {
    let alive = true;
    const { meId: _local, ...shareable } = g;
    void encodeGroup({ group: shareable, expenses }).then((code) => {
      if (alive) setLink(`${location.origin}${location.pathname}#g=${code}`);
    });
    return () => {
      alive = false;
    };
  }, [g, expenses.length, expenses.reduce((t, e) => Math.max(t, e.updatedAt), 0)]);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      haptic(8);
      toast('Link copied');
    } catch {
      toast('Copy is blocked here. Long-press the link to copy it.');
    }
  }

  async function share() {
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${g.name} on Tab`, text: `Join ${g.name} on Tab. The group opens on your phone, no account needed.`, url: link });
        haptic(8);
        return;
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return;
      }
    }
    await copy();
  }

  return (
    <div class="share">
      <div class="sheet-head">
        <h2 class="sheet-title">Share {g.name}</h2>
        <button type="button" class="icon-btn" onClick={onDone} aria-label="Close">
          <IconClose />
        </button>
      </div>
      <p class="lede">The whole group travels inside the link, after the #. Nothing is uploaded anywhere. Opening it on another phone merges it with any copy already there.</p>
      <div class="qr-box">{link ? <QR text={link} label={`QR code that opens ${g.name} in Tab`} size={248} /> : <div class="qr" style={{ width: "248px", height: "248px" }} />}</div>
      <p class="link-meta mono">{link ? `${link.length.toLocaleString('en-IN')} characters · ${g.members.length} people · ${expenses.filter((e) => !e.deleted).length} entries` : 'Packing the group'}</p>
      <div class="settle-actions">
        <button type="button" class="btn primary" onClick={share} disabled={!link}>
          <IconShare size={20} /> Share link
        </button>
        <button type="button" class="btn" onClick={copy} disabled={!link}>
          <IconCopy size={20} /> Copy
        </button>
      </div>
      <p class="fine">Send a fresh link after new expenses. Your choice of "which member is you" stays on this phone.</p>
    </div>
  );
}
