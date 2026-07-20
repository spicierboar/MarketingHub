type ResetHook = () => void;

const hooks = new Set<ResetHook>();

/**
 * Register process-local state that belongs to the in-memory demo lifecycle.
 * The neutral registry keeps the store and feature modules from importing each
 * other while making resetStore the single reset owner.
 */
export function registerStoreResetHook(hook: ResetHook): () => void {
  hooks.add(hook);
  return () => hooks.delete(hook);
}

export function runStoreResetHooks(): void {
  for (const hook of hooks) hook();
}
