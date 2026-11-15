import { render, type ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { open, type SheetHandle, type Snap } from './sheet';

interface Props {
  open: boolean;
  onClose: () => void;
  snap?: Snap;
  label: string;
  children: ComponentChildren;
}

/**
 * Preact face of src/ui/sheet.ts. Children render into a host element (its own
 * small render root, so no preact/compat portal is needed); the sheet module
 * owns where that host lives and how it moves. The last children stay on
 * screen while the close animation plays.
 */
export function Sheet(p: Props) {
  const [host] = useState(() => {
    const d = document.createElement('div');
    d.className = 'sheet-content';
    return d;
  });
  const handle = useRef<SheetHandle | null>(null);
  const onClose = useRef(p.onClose);
  onClose.current = p.onClose;

  // Render children into the host while open; keep the last frame while closing.
  useLayoutEffect(() => {
    if (p.open) render(<>{p.children}</>, host);
  });

  useEffect(() => {
    if (p.open && !handle.current) {
      handle.current = open(host, {
        snap: p.snap,
        label: p.label,
        onClose: () => {
          handle.current = null;
          render(null, host);
          onClose.current();
        },
      });
    } else if (!p.open && handle.current) {
      void handle.current.close();
    }
  }, [p.open]);

  useEffect(
    () => () => {
      void handle.current?.close();
    },
    [],
  );

  return null;
}
