/**
 * Lets the API layer tell the app that the session is no longer valid, without
 * the API layer importing the auth provider (which would be a cycle).
 * Wired up in Phase 2, when the real client lands.
 */

export type AuthEvent = 'unauthorized';

type AuthEventHandler = (event: AuthEvent) => void;

let handler: AuthEventHandler | null = null;

export function onAuthEvent(fn: AuthEventHandler): () => void {
  handler = fn;
  return () => {
    handler = null;
  };
}

export function emitAuthEvent(event: AuthEvent): void {
  handler?.(event);
}
