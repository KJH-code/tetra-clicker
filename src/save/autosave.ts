import type { SaveStore } from './SaveStore';
import type { SaveData } from './schema';

export const AUTOSAVE_MS = 10_000;

// Saves on a timer and at the two moments a tab is most likely to be lost:
// when it is hidden and when it is about to unload.
export function startAutosave(store: SaveStore, snapshot: () => SaveData): () => void {
  const save = (): void => store.save(snapshot());
  const timer = window.setInterval(save, AUTOSAVE_MS);
  const onVisibility = (): void => { if (document.hidden) save(); };
  window.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('beforeunload', save);
  window.addEventListener('pagehide', save);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('beforeunload', save);
    window.removeEventListener('pagehide', save);
  };
}
