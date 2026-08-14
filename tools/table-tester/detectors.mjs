/**
 * Automatyczne detektory podejrzanych zjawisk na stole (M97).
 *
 * Żywy tester rozgrywa partię, ale znalezienie błędu wymagało dotąd ręcznego
 * czytania setek linii transkryptu. Detektory robią pierwszy przesiew: zgłaszają
 * miejsca, którym warto się przyjrzeć, wraz z kategorią i cytatem.
 *
 * Kategorie odpowiadają OSIOM AUDYTU z docs/setup/TESTER_STOLU.md:
 *   `bot`   — oś 1: bezsensowne/powtarzalne działania bota,
 *   `info`  — oś 2: braki i przecieki w logu oraz modalu „Ruch przeciwnika",
 *   `ui`    — oś 3 i czytelność: etykiety, ptaszki, puste okna,
 *   `rules` — podejrzenia łamania reguł widoczne na stole.
 *
 * Detektory są CZYSTE (wejście: linie transkryptu + zebrane zdarzenia) —
 * dzięki temu mają testy jednostkowe w `test/table-tester-detectors.test.js`
 * i nie wymagają jsdom.
 */

/** Surowe identyfikatory, które nigdy nie powinny trafić do oczu gracza. */
const RAW_IDENTIFIER = /\b(battlefield|graveyard|library|exile|stack|hand)\s*→|→\s*(battlefield|graveyard|library|exile|stack|hand)\b/;
const SNAKE_CASE_EVENT = /\b[a-z]+(_[a-z]+){2,}\b/;
const PLACEHOLDER = /(^|[\s:(])\?($|[\s),.])|undefined|NaN|\[object |null\b/;

/** Ile razy ta sama akcja bota w jednej turze jest już podejrzana. */
const REPEAT_THRESHOLD = 4;

function push(out, category, message, evidence) {
  out.push({ category, message, evidence: String(evidence ?? '').slice(0, 160) });
}

/**
 * Oś 2 — przecieki techniczne w tekstach widocznych dla gracza.
 * Szuka surowych nazw stref, snake_case identyfikatorów zdarzeń i placeholderów.
 */
export function detectRawText(lines) {
  const found = [];
  for (const line of lines) {
    // Interesują nas wyłącznie teksty, które WIDZI gracz.
    const isPlayerFacing = /\[RUCH PRZECIWNIKA\]|LOG:|AKCJE:|\[modal choice\]/.test(line);
    if (!isPlayerFacing) continue;
    if (RAW_IDENTIFIER.test(line)) {
      push(found, 'info', 'Surowa nazwa strefy w tekście dla gracza', line);
    }
    // snake_case w tekście UI = przeciek identyfikatora zdarzenia/efektu.
    const m = line.match(SNAKE_CASE_EVENT);
    if (m && !/http|\.mjs|\.js\b/.test(line)) {
      push(found, 'info', `Surowy identyfikator „${m[0]}" w tekście dla gracza`, line);
    }
    if (PLACEHOLDER.test(line.replace(/\(brak\)|\(pusty\)|\(puste\)|\(pusta\)/g, ''))) {
      push(found, 'ui', 'Placeholder (?/undefined/null) w tekście dla gracza', line);
    }
  }
  return found;
}

/**
 * Oś 1 — bot powtarza tę samą akcję wielokrotnie w obrębie jednej tury.
 * Typowy objaw braku progu nasycenia w heurystyce (station, firebreathing,
 * re-equip, mill). Zwraca po jednym wpisie na (tura, akcja).
 */
export function detectBotRepeats(lines, { threshold = REPEAT_THRESHOLD } = {}) {
  const found = [];
  let turn = '?';
  const counts = new Map();
  const flush = () => {
    for (const [key, n] of counts) {
      if (n >= threshold) push(found, 'bot', `Bot powtórzył akcję ${n}× w jednej turze`, `tura ${turn}: ${key}`);
    }
    counts.clear();
  };
  for (const line of lines) {
    const turnMark = line.match(/•\s*Tura (\d+)/);
    if (turnMark) { flush(); turn = turnMark[1]; continue; }
    const act = line.match(/\[RUCH PRZECIWNIKA\]\s*•\s*(Nieprzyjaciel (?:aktywuje|rzuca)[^|]*)$/);
    if (!act) continue;
    const key = act[1].trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  flush();
  return found;
}

/**
 * Oś 1 — bot celuje efektem w SIEBIE tam, gdzie naturalnym celem jest wróg
 * (mill, obrażenia, discard). Heurystyka tekstowa: „→ cel: Nieprzyjaciel"
 * w akcji BOTA (bot nazywa się „Nieprzyjaciel" z perspektywy gracza).
 */
export function detectBotSelfTargeting(lines) {
  const found = [];
  // Celowanie w siebie bywa OPTYMALNE (Inspiration „target player draws two
  // cards", zysk życia, scry). Zgłaszamy tylko efekty jednoznacznie szkodliwe
  // dla celu — inaczej detektor produkuje fałszywe alarmy (M97: Inspiration).
  const HARMFUL = /mieli|mill|obrażeni|traci życie|odrzuc|discard|zniszcz|wygna|poświęc/i;
  const BENEFICIAL = /dobierz|dobiera|zysk|scry|surveil|szuka|licznik \+1/i;
  for (const line of lines) {
    if (!/\[RUCH PRZECIWNIKA\]/.test(line)) continue;
    if (!/Nieprzyjaciel (aktywuje|rzuca)/.test(line)) continue;
    if (!/→ cel: Nieprzyjaciel/.test(line)) continue;
    if (BENEFICIAL.test(line) && !HARMFUL.test(line)) continue;
    if (!HARMFUL.test(line)) continue;
    push(found, 'bot', 'Bot celuje SZKODLIWYM efektem w siebie', line);
  }
  return found;
}

/**
 * Oś 2 — istotne zagranie bota bez żadnego opisu skutku.
 * Wykrywa modal „Ruch przeciwnika", w którym jest tylko nagłówek fazy/tury
 * (gracz otwiera okno i nie dowiaduje się niczego).
 */
export function detectEmptyBotMoveModal(lines) {
  const found = [];
  let current = null;
  const finish = () => {
    if (current && current.entries.length > 0) {
      const meaningful = current.entries.filter((e) => !/^Faza:|^Tura \d+/.test(e));
      if (meaningful.length === 0) {
        push(found, 'info', 'Modal „Ruch przeciwnika" bez treści (same nagłówki)', current.entries.join(' | '));
      }
    }
    current = null;
  };
  for (const line of lines) {
    const head = line.match(/\[RUCH PRZECIWNIKA\]\s+(Ruch przeciwnika.*)$/);
    if (head) { finish(); current = { entries: [] }; continue; }
    const entry = line.match(/\[RUCH PRZECIWNIKA\]\s*•\s*(.+)$/);
    if (entry && current) current.entries.push(entry[1].trim());
    else if (!entry && current && !/\[RUCH PRZECIWNIKA\]/.test(line)) finish();
  }
  finish();
  return found;
}

/**
 * Oś 3 — akcje, które gracz może chcieć wyciszyć, ale panel nie dał ptaszka.
 * Tester zapisuje w transkrypcie listę akcji z informacją o ptaszku
 * (`[ptaszek]`), więc detektor porównuje typ akcji z obecnością znacznika.
 */
export function detectMissingIgnoreTick(actionRecords) {
  const found = [];
  const IGNORABLE = /^(Rzuć:|Zagraj:|Aktywuj:|Cycling:|Wyposaż:|Flashback:|Escape:|Przygoda:|Plot:|Cel czaru|Cel zdolności|Aura:|Bestow:)/;
  for (const rec of actionRecords ?? []) {
    if (!IGNORABLE.test(rec.label)) continue;
    if (rec.hasTick) continue;
    push(found, 'ui', 'Akcja bez ptaszka wyciszenia (auto-pass)', rec.label);
  }
  return found;
}

/**
 * Oś „rules" — sygnały łamania reguł widoczne w logu partii.
 * Celowo wąskie i konserwatywne: zgłaszamy tylko rzeczy jednoznaczne.
 */
export function detectRuleSmells(lines) {
  const found = [];
  for (const line of lines) {
    if (/Ruch odrzucony/.test(line)) {
      push(found, 'rules', 'Komenda gracza odrzucona przez engine', line);
    }
    if (/nie powinno się zdarzyć|Brak akcji —/.test(line)) {
      push(found, 'rules', 'Interfejs sam zgłasza stan nieoczekiwany', line);
    }
    // Życie rosnące u obrońcy przy zadawaniu mu obrażeń (sanity check logu).
    const dmg = line.match(/zadaje (\d+) obrażeń? \((Ty|Nieprzyjaciel)\)/);
    if (dmg && Number(dmg[1]) === 0) {
      push(found, 'rules', 'Zdarzenie „zadaje 0 obrażeń" w logu (powinno być pominięte)', line);
    }
  }
  return found;
}

/** Uruchamia komplet detektorów; zwraca listę zgłoszeń pogrupowaną po kategorii. */
export function runDetectors(lines, { actionRecords = [] } = {}) {
  const all = [
    ...detectRawText(lines),
    ...detectBotRepeats(lines),
    ...detectBotSelfTargeting(lines),
    ...detectEmptyBotMoveModal(lines),
    ...detectMissingIgnoreTick(actionRecords),
    ...detectRuleSmells(lines),
  ];
  // Deduplikacja: ten sam komunikat + dowód pojawia się raz.
  const seen = new Set();
  const unique = [];
  for (const item of all) {
    const key = `${item.category}|${item.message}|${item.evidence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

/** Formatuje zgłoszenia do sekcji transkryptu (czytelne dla człowieka). */
export function formatFindings(findings) {
  if (findings.length === 0) return ['== DETEKTORY: brak zgłoszeń =='];
  const out = [`== DETEKTORY: ${findings.length} zgłoszeń (do weryfikacji) ==`];
  const byCategory = new Map();
  for (const f of findings) {
    if (!byCategory.has(f.category)) byCategory.set(f.category, []);
    byCategory.get(f.category).push(f);
  }
  for (const [category, items] of byCategory) {
    out.push(`  [${category}] ${items.length}`);
    for (const item of items.slice(0, 12)) {
      out.push(`    - ${item.message}`);
      out.push(`      ${item.evidence}`);
    }
    if (items.length > 12) out.push(`    … i ${items.length - 12} więcej`);
  }
  return out;
}
