import { migrate, type SaveData } from './schema';

// A save as text to carry to another browser: a short tag, then the save's
// JSON in base64 (UTF-8), so it survives being pasted into a chat or a note.
const TAG = 'TETRA1:';

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): string {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function exportSave(data: SaveData): string {
  return TAG + toBase64(JSON.stringify(data));
}

// The save the text holds, brought up to this version; null for anything
// that is not one (wrong tag, broken base64 or JSON, a save from a newer
// version, or one missing its world).
export function importSave(text: string): SaveData | null {
  const t = text.replace(/\s+/g, '');
  if (!t.startsWith(TAG)) return null;
  try {
    const data = migrate(JSON.parse(fromBase64(t.slice(TAG.length))));
    if (!data || typeof data.world?.seed !== 'number' || !data.world.manual || !data.world.economy) return null;
    return data;
  } catch {
    return null;
  }
}
