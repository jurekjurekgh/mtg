import { assertDeckSupported } from './registry.js';
import { validateDeck, countCards } from './deck-validation.js';

const LINE = /^(\d+)x\s+(.+)$/;

/**
 * M194/K1 (Batch 47): egzemplarz karty w pliku talii.
 *
 * Do Batcha 47 katalog nie miał dwóch kart o tej samej nazwie, więc linia
 * „1x Curate" była jednoznaczna. Właściciel dodał DRUGIE warianty (Curate
 * BRO + STX, Negate M20 + M15) — inny druk, art i plan, każdy w innej talii.
 * Sama nazwa przestała identyfikować kartę: parser brałby PIERWSZY pasujący
 * wpis, więc obie talie wskazywałyby ten sam egzemplarz, a druga karta po
 * cichu zniknęłaby z gry (strażniki ADR 0023 przestałyby mówić prawdę).
 *
 * Format rozszerzamy MINIMALNIE i symetrycznie: przy realnej kolizji nazw
 * linia niesie set — „1x Curate (STX)". Karty o unikalnej nazwie zapisują
 * się jak dotąd, więc istniejące pliki talii nie zmieniają się ani o znak.
 */
const NAME_WITH_SET = /^(.*?)\s*\(([^()]+)\)$/;

/** Czy nazwa karty jest w rejestrze zdublowana (≥2 egzemplarze). */
function isAmbiguousName(registry, name) {
  return registry.all().filter((entry) => entry.name === name).length > 1;
}

/** Etykieta egzemplarza do zapisu: „Curate (STX)" albo „Lightning Bolt". */
export function deckCardLabel(card, registry) {
  return isAmbiguousName(registry, card.name) && card.set
    ? `${card.name} (${card.set})`
    : card.name;
}

/** Parsuje dokładnie ten sam tekst, który jest przechowywany jako plik talii. */
export function parseDeckText(text, registry) {
  if (typeof text !== 'string' || !registry) throw new TypeError('Parser wymaga tekstu i registry');
  const lines = text.split(/\r?\n/);
  const titleLine = lines.find((line) => line.trim().startsWith('#'));
  if (!titleLine) throw new Error('Brak nagłówka # Nazwa talii');
  const name = titleLine.trim().slice(1).trim();
  if (!name) throw new Error('Nazwa talii nie może być pusta');
  const cardIds = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(LINE);
    if (!match) throw new Error(`Nieprawidłowa linia talii: ${line}`);
    const amount = Number.parseInt(match[1], 10);
    const label = match[2].trim();
    // M194/K1: „Nazwa (SET)" wskazuje KONKRETNY egzemplarz; sama nazwa działa
    // dalej, dopóki jest jednoznaczna.
    const withSet = NAME_WITH_SET.exec(label);
    const wantedName = withSet ? withSet[1].trim() : label;
    const wantedSet = withSet ? withSet[2].trim() : null;
    const sameName = registry.all().filter((entry) => entry.name === wantedName);
    let card = wantedSet
      ? sameName.find((entry) => entry.set === wantedSet)
      : sameName[0];
    // Nazwa zdublowana bez wskazania setu = niejednoznaczność. Zgadywanie
    // („weź pierwszą") jest tu gorsze niż błąd: cicho zamieniłoby jedną kartę
    // na drugą, a talie/strażniki nadal wyglądałyby poprawnie.
    if (!wantedSet && sameName.length > 1) {
      const sets = sameName.map((entry) => entry.set ?? '?').join(', ');
      throw new Error(`Niejednoznaczna karta w talii: ${wantedName} — podaj set (dostępne: ${sets})`);
    }
    if (!card) throw new Error(`Nieznana karta w talii: ${label}`);
    if (amount < 1) throw new Error(`Liczba kopii musi być dodatnia: ${line}`);
    // Karty dwustronne (DFC): zapis talii może wskazywać dowolną stronę —
    // fizyczna karta w bibliotece/ręce istnieje wyłącznie przodem (CR 711.4).
    // Nazwa TYŁU (status limited) zamienia się na stronę frontową, żeby
    // karta trafiała do ręki grywalna (bug ze stołu 2026-08-05: „Guidestone
    // Compass" na ręku nie dał się rzucić). Tokeny nadal odrzuca walidacja.
    if (card.support?.status === 'limited') {
      const front = transformFrontOf(registry, card.id);
      if (front) card = front;
    }
    cardIds.push(...Array.from({ length: amount }, () => card.id));
  }
  assertDeckSupported(cardIds, registry);
  return { name, cardIds, counts: countCards(cardIds) };
}

/**
 * Strona frontowa pary transform dla karty `backId` o statusie limited —
 * wskazana wprost (`X.transformTo === backId`) albo przez cykl A↔B
 * (wilkołaki: obie strony mają `transformTo`; frontem jest strona supported).
 * Zwraca null, gdy karta limited nie jest tyłem transform (np. token).
 */
function transformFrontOf(registry, backId) {
  const direct = registry.all().find(
    (def) => def.transformTo === backId && def.support?.status === 'supported',
  );
  if (direct) return direct;
  const back = registry.get(backId);
  if (back?.transformTo && registry.get(back.transformTo)?.support?.status === 'supported') {
    return registry.get(back.transformTo);
  }
  return null;
}

/** Zapisuje deck w formacie używanym również przez pliki repozytorium. */
export function writeDeckText({ name, cardIds }, registry, options = {}) {
  if (!name || !Array.isArray(cardIds) || !registry) throw new TypeError('Writer wymaga nazwy, kart i registry');
  const validation = validateDeck(cardIds, registry, options);
  if (!validation.valid) throw new Error(`Nieprawidłowa talia: ${validation.errors.join(', ')}`);
  const names = new Map();
  for (const [id, amount] of validation.counts) names.set(id, `${amount}x ${deckCardLabel(registry.get(id), registry)}`);
  return [`# ${name}`, '', ...names.values()].join('\n') + '\n';
}
