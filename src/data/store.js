// File-based persistent store via Electron IPC.
// Falls back to localStorage in non-Electron environments.

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electronAPI?.storeGet;

let _cache = null; // in-memory cache so reads are synchronous after init

export async function initStore() {
  if (!IS_ELECTRON) return;
  _cache = await window.electronAPI.storeGet();
}

export function storeGet(key, defaultValue) {
  if (!IS_ELECTRON) {
    try { const v = localStorage.getItem(`lr-store-${key}`); return v !== null ? JSON.parse(v) : defaultValue; }
    catch { return defaultValue; }
  }
  return _cache && key in _cache ? _cache[key] : defaultValue;
}

export async function storeSet(key, value) {
  if (!IS_ELECTRON) {
    try { localStorage.setItem(`lr-store-${key}`, JSON.stringify(value)); } catch {}
    return;
  }
  _cache = { ...(_cache || {}), [key]: value };
  await window.electronAPI.storeSet(_cache);
}
