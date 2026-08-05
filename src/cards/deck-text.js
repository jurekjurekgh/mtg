import { assertDeckSupported } from './registry.js';
import { validateDeck, countCards } from './deck-validation.js';

const LINE = /^(\d+)x\s+(.+)$/;

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
    let card = registry.all().find((entry) => entry.name === match[2].trim());
    if (!card) throw new Error(`Nieznana karta w talii: ${match[2].trim()}`);
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
  for (const [id, amount] of validation.counts) names.set(id, `${amount}x ${registry.get(id).name}`);
  return [`# ${name}`, '', ...names.values()].join('\n') + '\n';
}
