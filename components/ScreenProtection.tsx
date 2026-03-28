'use client';
import { useEffect, useState } from 'react';

export default function ScreenProtection() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    // --- Disable right-click ---
    const noContext = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', noContext);

    // --- Disable drag on images ---
    const noDrag = (e: DragEvent) => e.preventDefault();
    document.addEventListener('dragstart', noDrag);

    // --- Block keyboard shortcuts ---
    const blockKeys = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // PrintScreen
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        setBlocked(true);
        setTimeout(() => setBlocked(false), 500);
      }
      // Ctrl+P (print/screenshot)
      if (ctrl && e.key === 'p') { e.preventDefault(); }
      // Ctrl+S (save page)
      if (ctrl && e.key === 's') { e.preventDefault(); }
      // Ctrl+Shift+I / F12 (devtools — hides source)
      if (ctrl && e.shiftKey && e.key === 'I') { e.preventDefault(); }
      if (e.key === 'F12') { e.preventDefault(); }
    };
    document.addEventListener('keydown', blockKeys);

    // --- Black screen when tab loses visibility ---
    // Catches: screen recorders that switch to app, Loom, OBS tab capture
    const onVisibility = () => {
      if (document.hidden) setBlocked(true);
      else setBlocked(false);
    };
    document.addEventListener('visibilitychange', onVisibility);

    // --- Black screen when window loses focus ---
    // Catches: Snipping Tool (Win), Cmd+Shift+3/4 (Mac) which momentarily blur
    const onBlur = () => setBlocked(true);
    const onFocus = () => setBlocked(false);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    return () => {
      document.removeEventListener('contextmenu', noContext);
      document.removeEventListener('dragstart', noDrag);
      document.removeEventListener('keydown', blockKeys);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  if (!blocked) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        zIndex: 2147483647,
        userSelect: 'none',
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    />
  );
}
