/**
 * Ekstraktory DOM dla Żywego Testera stołu (M88).
 *
 * Problem: tester czytał `body.textContent` z `replace(/\s+/g, ' ')`
 * — każdy `<div>` w modale (wpis, karta, etykieta) tracił swój
 * wizualny separator. W realnej przeglądarce użytkownik widzi układ
 * CSS, ale w transkrypcie pojawiały się zlepki („Faza: Główna 1G
 * Garruk's Companion wchodzi na bitwisko") — to SZUM, który maskował
 * realne bugi UI.
 *
 * Rozwiązanie: wydzielamy ekstraktory, które zwracają LISTY linii
 * (po jednej na element DOM) z czytelnymi separatorami. Tester
 * dostaje z powrotem `extractBotMoves({title, entries})` i po prostu
 * loguje każdą linię osobno. Separatory `•` (wpisy modala) i `·`
 * (pola kafla) są widoczne i jednoznaczne w transkrypcie.
 *
 * Funkcje są czyste (operują na plain obiektach/elementach DOM, brak
 * efektów ubocznych) — testowane w `test/table-tester-output.test.js`.
 */

/** Tekst elementu DOM bez agresywnej normalizacji spacji (zachowaj pojedyncze separatory). */
function readText(el) {
  if (!el) return '';
  // textContent z natury zlepia dzieci spacjami, ale NIE zamienia \n na ' ';
  // i tak tu potrzebujemy oryginalnego tekstu (bez spacji trim/normalizacji).
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Tekst KONTENERA znaczników, w którym każde dziecko jest osobnym badge.
 *
 * M122/#10: `textContent` skleja rodzeństwo bez separatora, więc kafel dawał
 * „blokuje: Armored Skaabchoroba", a nakładka z badge obrażeń „−3" tuż obok
 * P/T „2" produkowała fantomowe „-3/2" przy stworze 1/1. Wyglądało to jak
 * błąd renderowania siły/wytrzymałości, a było zlepieniem dwóch niezależnych
 * informacji — dokładnie ta sama klasa błędu co M88 dla modali.
 */
function readBadgeContainer(el) {
  if (!el) return '';
  const children = [...(el.children ?? [])];
  if (children.length === 0) return readText(el);
  return children.map((child) => readText(child)).filter(Boolean).join(' · ');
}

/** Tekst z konkretnego pola kafla (.fname, .fcost, .ftype, .fbox, .fpt, .fbadges). */
function readField(el, fieldClass) {
  if (!el) return null;
  // Przeglądaj bezpośrednie dzieci (kafel ma płaską strukturę: .face > .ftop/.fart/.ftype/.fbox).
  // Kontenery znaczników trzymają wiele niezależnych badge obok siebie —
  // muszą być czytane z separatorem (M122/#10).
  const isBadgeBox = fieldClass === 'fbadges' || fieldClass === 'ovl-badges';
  const read = isBadgeBox ? readBadgeContainer : readText;
  for (const child of el.children ?? []) {
    if (String(child.className ?? '').split(/\s+/).includes(fieldClass)) {
      return read(child) || null;
    }
  }
  // Rekurencyjnie szukaj w zagnieżdżonych (face > fart > ftop > fname/fcost).
  if (el.querySelector) {
    const found = el.querySelector(`.${fieldClass}`);
    if (found) return read(found) || null;
  }
  return null;
}

/**
 * Zwraca linie transkryptu z modala „Rozgrywka".
 *
 * @param {{ title?: string, entries: Array<{text: string}> }} payload
 * @returns {string[]} — każda linia osobno: tytuł + każdy wpis z prefiksem "  • ".
 *
 * @example
 *   extractBotMoves({ title: 'Rozgrywka', entries: [
 *     { text: 'Tura 5 — Nieprzyjaciel' },
 *     { text: 'Faza: Główna 1' },
 *     { text: 'G Garruk\\'s Companion wchodzi na bitwisko' },
 *   ]})
 *   // → [
 *   //   'Rozgrywka',
 *   //   '  • Tura 5 — Nieprzyjaciel',
 *   //   '  • Faza: Główna 1',
 *   //   '  • G Garruk\\'s Companion wchodzi na bitwisko',
 *   // ]
 */
export function extractBotMoves({ title = '', entries = [] } = {}) {
  const lines = [];
  if (title) lines.push(title);
  for (const entry of entries) {
    if (entry && entry.text) lines.push(`  • ${entry.text}`);
  }
  return lines;
}

/**
 * Zwraca linie transkryptu z modala wyboru (choice-request): intro,
 * każda opcja osobno, opcja wybrana oznaczona `▶`.
 *
 * @param {{ intro: string, options: Array<{text: string}>, chosenIndex?: number, confirmText?: string }} payload
 * @returns {string[]}
 */
export function extractModalChoice({ intro = '', options = [], chosenIndex = -1, confirmText = null } = {}) {
  const lines = [];
  if (intro) lines.push(intro);
  options.forEach((option, i) => {
    if (!option || !option.text) return;
    const marker = i === chosenIndex ? '▶' : ' ';
    lines.push(`  ${marker} ${option.text}`);
  });
  if (confirmText) lines.push(`  → ${confirmText}`);
  return lines;
}

/**
 * Tekst kafla karty — pola rozdzielone `·`, BEZ zlepień.
 * Realna przeglądarka używa CSS, by `.fname` `.fcost` `.ftype` `.fbox`
 * wyglądały jak karta; tester wcześniej czytał `textContent` całego
 * kafla i sklejał wszystko spacją. Tu czytamy pola osobno.
 *
 * @param {Element|null} tile — element `.tile` z karty
 * @returns {string} — np. "Hunter's Blowgun · {1} · Artifact — Equipment · Equip {2} +1/+1"
 *                    lub "" gdy brak danych
 */
export function extractTileText(tile) {
  if (!tile) return '';
  // M122/#7: na BITWISKU kafel renderuje się z `skipLiveState: true` — P/T
  // i znaczniki stanu (tapnięcie, choroba, liczniki, „zakryty (morph)")
  // trafiają wtedy do NAKŁADKI o klasach `ovl-*`, których ekstraktor nie
  // czytał. Transkrypt pokazywał więc „Willbender · Creature" bez P/T i bez
  // informacji, że to zakryty morph — audytor (i detektory) tracili dane
  // o realnym stanie stołu. Czytamy oba źródła; puste po prostu odpadają.
  const fields = ['fname', 'fcost', 'ftype', 'fbox', 'fpt', 'fbadges', 'ovl-badges', 'ovl-pt'];
  const parts = [];
  for (const field of fields) {
    const value = readField(tile, field);
    if (value) parts.push(value);
  }
  // Gdy nic nie znaleziono (np. kafel pusty / placeholder), nie zwracaj śmieci.
  if (parts.length === 0) {
    const fallback = readText(tile);
    // Filtruj puste / placeholdery ('(pusty)' / '·').
    return fallback && fallback.length >= 3 ? fallback : '';
  }
  return parts.join(' · ');
}
