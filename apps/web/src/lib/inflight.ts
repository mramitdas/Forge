"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Synchronous double-submit guard. `busy` drives disabled states; the ref
 * rejects re-entry within the same tick, before React re-renders.
 */
export function useInFlight(): { busy: boolean; run: (fn: () => Promise<void>) => Promise<void> } {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const run = useCallback(async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, run };
}
