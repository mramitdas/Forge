import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

let version = 0;

export function subscribeStore(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notifyStore(): void {
  version += 1;
  emit();
}

export function useStoreVersion(): number {
  return useSyncExternalStore(subscribeStore, () => version, () => version);
}
