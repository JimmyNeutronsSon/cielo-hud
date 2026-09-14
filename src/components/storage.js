/**
 * Safe localStorage wrapper — works on any page including cross-origin iframes
 * and sandboxed contexts where localStorage access throws SecurityError.
 * Falls back to an in-memory store so the HUD always works.
 */

const _lgMemStore = {};

function _lgStorageAvailable() {
  try {
    const k = '__lgtest__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch (e) {
    return false;
  }
}

let _lgHasLS = null;

export function lgStore(key, value) {
  if (_lgHasLS === null) _lgHasLS = _lgStorageAvailable();
  if (value === undefined) {
    // GET
    try {
      if (_lgHasLS) return localStorage.getItem(key);
    } catch (e) {}
    return _lgMemStore[key] !== undefined ? _lgMemStore[key] : null;
  } else {
    // SET
    _lgMemStore[key] = value;
    try {
      if (_lgHasLS) localStorage.setItem(key, value);
    } catch (e) {}
  }
}
