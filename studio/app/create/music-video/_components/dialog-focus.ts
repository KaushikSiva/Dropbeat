"use client";
import { useEffect, useRef } from "react";

/** Keep keyboard navigation within the studio dialog, yielding to provider checkout. */
export function useDialogFocus(open: boolean, suspended = false) {
  const paused = useRef(suspended);
  useEffect(() => { paused.current = suspended; }, [suspended]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>(".mv-modal");
    if (!dialog) return;
    const targets = () => [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), summary, a[href], [tabindex="0"]')].filter(el => el.getClientRects().length);
    targets()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || paused.current) return;
      const items = targets(), first = items[0], last = items[items.length - 1];
      if (!first) return;
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => { document.removeEventListener("keydown", trap); previous?.focus(); };
  }, [open]);
}
