/**
 * Rozwiązywanie adresów ilustracji karty — bez dotykania sieci.
 *
 * Moduł zwraca wyłącznie LISTY KANDYDATÓW (adresów) w kolejności prób; samo
 * ładowanie i obsługę błędów robi render (`<img onerror>` → kolejny kandydat →
 * syntetyczna twarz). Dzięki temu testy core i UI są headless.
 *
 * Trzy tory adresów, wzorowane na pliku legacy (`card_viewer_12_10_for_Github.html`):
 *
 * 1. **scryfall** — pełna karta. Realne karty niosą `imageUri` konkretnego
 *    druku (`cards.scryfall.io/large/front/...`, DFC ma osobny URL tyłu);
 *    karty bez `imageUri` (wirtualne landy podstawowe, karty syntetyczne)
 *    dostają przekierowanie po nazwie (`api.scryfall.com/cards/named?exact=`)
 *    — dokładnie jak `getPlaytableFullCardImage()` w legacy.
 * 2. **fot** — panoramiczna ilustracja 21:9 z lokalnego `./img/` właściciela
 *    (`<artId>FOT.png`), jak `getPlaytableCardImage()`.
 * 3. **kon** — wariant bestiariusza 16:9 (`<artId>KON.png`), jak
 *    `getPlaytableKonImage()`.
 *
 * `artId` to numer z arkusza kolekcji właściciela (audyt §3.2: ID jest
 * prefiksem nazwy pliku ilustracji). Nie ma go w repozytorium dla żadnej karty,
 * dopóki `tools/fetch-art-ids.mjs` nie uzupełni definicji — brak `artId`
 * oznacza po prostu brak kandydata lokalnego i spadek na Scryfall.
 */

export const IMAGE_MODE = Object.freeze({ localFirst: 'local-first', remoteFirst: 'remote-first' });

/** Tory podglądu przełączane scrollem myszy nad kartą (legacy: playtableState.hoverMode). */
export const HOVER_MODES = Object.freeze(['scryfall', 'fot', 'kon']);

/**
 * Rewers karty Magica ze Scryfall — jeden stały obraz dla każdej karty
 * zakrytej (morph/megamorph, ręka przeciwnika). Świadomie ten sam adres dla
 * wszystkich: gdyby zależał od karty, sam fakt pobrania pliku ujawniałby
 * tożsamość (FoW, ADR 0003).
 */
export const CARD_BACK_URL = 'https://backs.scryfall.io/large/0/a/0aeebaf5-8c7d-4636-9e82-8c27447861f7.jpg';

/** Rozmiary obrazu Scryfall (kafel na stole vs powiększenie). */
export const IMAGE_SIZE = Object.freeze({ tile: 'normal', zoom: 'large' });

const SCRYFALL_SIZES = Object.freeze(['small', 'normal', 'large', 'png', 'art_crop', 'border_crop']);

export function imageFileName(cardName) {
  if (typeof cardName !== 'string' || !cardName.trim()) throw new TypeError('Nazwa karty musi być niepustym tekstem');
  return cardName.trim().toLowerCase()
    .replace(/['",.:;!()?/]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
}

export function localImagePath(card) {
  if (!card?.set || !card?.name) throw new TypeError('Karta musi mieć set i nazwę');
  return `img/${card.set}/${imageFileName(card.name)}.jpg`;
}

export function scryfallImageUrl(card, { version = 'normal' } = {}) {
  if (!card?.name) throw new TypeError('Karta musi mieć nazwę');
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&format=image&version=${version}`;
}

/**
 * Zamienia rozmiar w adresie `cards.scryfall.io/<size>/...` albo parametr
 * `version=` w adresie `api.scryfall.com`. Adresy spoza Scryfalla zwraca bez
 * zmian — definicja karty może kiedyś wskazywać inny hosting.
 */
export function scaleScryfallImage(url, size = IMAGE_SIZE.tile) {
  if (typeof url !== 'string' || !url) return url;
  if (!SCRYFALL_SIZES.includes(size)) throw new TypeError(`Nieznany rozmiar obrazu Scryfall: ${size}`);
  if (url.includes('cards.scryfall.io/')) {
    return url.replace(/cards\.scryfall\.io\/[a-z_]+\//, `cards.scryfall.io/${size}/`);
  }
  if (url.includes('api.scryfall.com/') && url.includes('version=')) {
    return url.replace(/version=[a-z_]+/, `version=${size}`);
  }
  return url;
}

/** Czy karta ma własny adres druku (realne karty batchy) — inaczej idziemy po nazwie. */
export function hasPrintImage(card) {
  return typeof card?.imageUri === 'string' && card.imageUri.length > 0;
}

/**
 * Adres pełnej karty (tor „scryfall"): druk z definicji, a przy jego braku
 * przekierowanie po nazwie. Wirtualne landy podstawowe trafiają w tę drugą
 * ścieżkę — właściciel wybrał druk domyślny Scryfalla, jak w legacy.
 */
export function scryfallCardUrl(card, { size = IMAGE_SIZE.tile } = {}) {
  if (hasPrintImage(card)) return scaleScryfallImage(card.imageUri, size);
  return scryfallImageUrl(card, { version: size });
}

/** Adres lokalnego wariantu ilustracji z arkusza właściciela (`./img/<artId>FOT.png`). */
export function localArtUrl(card, variant) {
  const key = String(variant || '').toLowerCase();
  if (key !== 'fot' && key !== 'kon') throw new TypeError(`Nieznany wariant lokalnej ilustracji: ${variant}`);
  if (card?.artId == null) return null;
  return `img/${card.artId}${key.toUpperCase()}.png`;
}

/**
 * Kandydaci obrazu dla kafla na stole i dla pełnego podglądu.
 * Kolejność: (opcjonalnie) plik lokalny → karta ze Scryfalla. Ostatnią
 * instancją jest syntetyczna twarz rysowana przez render, gdy wszystkie
 * adresy zawiodą.
 */
export function cardImageSources(card, { mode = IMAGE_MODE.localFirst, size = IMAGE_SIZE.tile } = {}) {
  const remote = scryfallCardUrl(card, { size });
  // Karty bez `set` (wirtualne landy) nie mają lokalnej ścieżki katalogowej.
  const local = card?.set ? localImagePath(card) : null;
  const list = mode === IMAGE_MODE.remoteFirst ? [remote, local] : [local, remote];
  return list.filter(Boolean);
}

/**
 * Kandydaci dla kafla karty na stole.
 * @param {object} card definicja karty (registry) albo `{ faceDown: true }`
 */
export function tileImageSources(card) {
  if (card?.faceDown) return [CARD_BACK_URL];
  // Kafel pokazuje obraz tylko dla karty z realnym drukiem (decyzja właściciela:
  // „na stole img ze Scryfall"). Karty syntetyczne i tokeny nie mają druku —
  // dla nich render zostaje przy kolorowej twarzy i nie rusza sieci.
  if (!hasPrintImage(card)) return [];
  return [scaleScryfallImage(card.imageUri, IMAGE_SIZE.tile)];
}

/**
 * Kandydaci dla podglądu (hover/modal) w wybranym torze.
 * Tory lokalne (`fot`, `kon`) spadają na Scryfall, gdy karta nie ma `artId`
 * albo pliku nie ma na dysku — legacy w tej sytuacji pokazywał zbity obrazek.
 */
export function hoverImageSources(card, { hoverMode = 'scryfall' } = {}) {
  if (card?.faceDown) return [CARD_BACK_URL];
  const scryfall = hasPrintImage(card) ? [scaleScryfallImage(card.imageUri, IMAGE_SIZE.zoom)] : [];
  const key = String(hoverMode || 'scryfall').toLowerCase();
  if (key === 'scryfall') return scryfall;
  const local = localArtUrl(card, key);
  return local ? [local, ...scryfall] : scryfall;
}

/** Proporcje okna podglądu dla toru (legacy: 320×448, 900×386, 900×~550). */
export function hoverPreviewShape(hoverMode) {
  const key = String(hoverMode || 'scryfall').toLowerCase();
  if (key === 'fot') return Object.freeze({ width: 900, height: 386, fit: 'cover' });
  if (key === 'kon') return Object.freeze({ width: 900, height: 550, fit: 'contain' });
  return Object.freeze({ width: 320, height: 448, fit: 'cover' });
}

/** Następny tor podglądu (scroll nad kartą, jak `onwheel` w legacy).
 *  `availableModes` (opcjonalne) zawęża listę do rzeczywistych opcji.
 *  Karty bez `artId` (basic landy, tokeny, Undercity) nie mają FOT/KON —
 *  dla nich dostępny jest tylko tor `scryfall`. */
export function nextHoverMode(current, direction = 1, availableModes = HOVER_MODES) {
  if (availableModes.length <= 1) return availableModes[0] ?? 'scryfall';
  const index = availableModes.indexOf(String(current || '').toLowerCase());
  const from = index === -1 ? 0 : index;
  const step = direction < 0 ? -1 : 1;
  return availableModes[(from + step + availableModes.length) % availableModes.length];
}

/** Polska etykieta toru do paska statusu podglądu. */
export function hoverModeLabel(hoverMode) {
  const key = String(hoverMode || 'scryfall').toLowerCase();
  if (key === 'fot') return 'ilustracja panoramiczna (FOT)';
  if (key === 'kon') return 'bestiariusz (KON)';
  return 'pełna karta (Scryfall)';
}

export function detectImageMode(protocol) {
  return protocol === 'file:' ? IMAGE_MODE.localFirst : IMAGE_MODE.remoteFirst;
}
