/**
 * Biblioteka nazwanych talii w IndexedDB (decyzja właściciela 2026-08-04).
 *
 * ADR 0012 zabrania localStorage dla STANU kreatora (Safari/ITP czyści po 7
 * dniach bez wizyty). Właściciel wprost poprosił o load/save/delete talii —
 * IndexedDB jest pod ITP trwalsze niż localStorage i mieści nazwany zbiór talii.
 * Mimo to przeglądarka pozostaje tylko wygodnym cache: trwałość gwarantuje
 * eksport do `decks/` (commit do repozytorium), o czym przypomina UI.
 *
 * Moduł nie dotyka DOM-u (testowalny headless). Gdy IndexedDB jest niedostępny
 * (stara przeglądarka / tryb prywatny / testy), wszystkie operacje degadują
 * do pustej biblioteki bez rzucania błędów.
 */

const DB_NAME = 'mtg-deck-library';
const STORE = 'decks';
const DB_VERSION = 1;

let dbPromise = null;

function supportsIndexedDB() {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function openDb() {
  if (!supportsIndexedDB()) return Promise.reject(new Error('IndexedDB niedostępne'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'name' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open error'));
  });
  return dbPromise;
}

function txStore(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Lista zapisanych talii (najnowsze najpierw), każda jako
 * { name, cardIds, text, updatedAt }.
 */
export async function listDecks() {
  try {
    const db = await openDb();
    const all = await promisify(txStore(db, 'readonly').getAll());
    return (all ?? [])
      .map((entry) => ({ name: entry.name, cardIds: [...(entry.cardIds ?? [])], text: entry.text ?? '', updatedAt: entry.updatedAt ?? 0 }))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  } catch { return []; }
}

/** Zapisuje (nadpisuje) talię pod nazwą. Zwraca true, gdy się udało. */
export async function saveDeck(name, cardIds, text = '') {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return false;
  try {
    const db = await openDb();
    await promisify(txStore(db, 'readwrite').put({ name: trimmed, cardIds: [...cardIds], text, updatedAt: Date.now() }));
    return true;
  } catch { return false; }
}

/** Wczytuje talię pod nazwą; null, gdy nie istnieje. */
export async function loadDeck(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return null;
  try {
    const db = await openDb();
    const entry = await promisify(txStore(db, 'readonly').get(trimmed));
    if (!entry) return null;
    return { name: entry.name, cardIds: [...(entry.cardIds ?? [])], text: entry.text ?? '', updatedAt: entry.updatedAt ?? 0 };
  } catch { return null; }
}

/** Usuwa talię pod nazwą. Zwraca true, gdy się udało (lub jej nie było). */
export async function deleteDeck(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return true;
  try {
    const db = await openDb();
    await promisify(txStore(db, 'readwrite').delete(trimmed));
    return true;
  } catch { return false; }
}

/** Czy biblioteka jest dostępna w tym środowisku. */
export function deckStoreAvailable() {
  return supportsIndexedDB();
}
