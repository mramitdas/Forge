const mustChangeListeners = new Set<() => void>();

export function onMustChangePassword(fn: () => void): () => void {
  mustChangeListeners.add(fn);
  return () => {
    mustChangeListeners.delete(fn);
  };
}

export function emitMustChangePassword(): void {
  for (const fn of mustChangeListeners) fn();
}