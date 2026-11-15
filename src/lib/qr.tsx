import { useEffect, useState } from 'preact/hooks';

/**
 * QR code as inline SVG. `uqr` (MIT, no deps) is loaded on demand so it stays
 * out of the first-load bundle; it is still precached for offline use.
 */
export function QR({ text, label, size = 200 }: { text: string; label: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    setErr(false);
    import('uqr')
      .then(({ renderSVG }) => {
        if (alive) setSvg(renderSVG(text, { ecc: 'L', border: 2, blackColor: '#16150F', whiteColor: '#FFFFFF' }));
      })
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [text]);
  if (err) return <p class="fine">This link is too long for a QR code. Use Copy link or Share instead.</p>;
  return <div class="qr" role="img" aria-label={label} style={{ width: size + 'px', height: size + 'px' }} dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />;
}
