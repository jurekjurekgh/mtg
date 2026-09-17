import { event } from '../protocol/types.js';

/**
 * Jedyna droga zmiany życia gracza.
 *
 * Funkcja świadomie NIE rozstrzyga przegranej: stan „życie <= 0" obsługują
 * wyłącznie centralne state-based actions (state-based.js), uruchamiane po
 * każdej zaakceptowanej komendzie oraz przez API obrażeń. Dzięki temu reguła
 * „gracz z zerowym życiem przegrywa" istnieje w dokładnie jednym miejscu.
 */
export function changeLife(state, playerId, amount) {
  if (!Number.isInteger(amount) || !state.players.some((player) => player.id === playerId)) {
    throw new TypeError('Zmiana życia wymaga gracza i całkowitej wartości');
  }
  const player = state.players.find((entry) => entry.id === playerId);
  const before = player.life;
  player.life += amount;
  // „Gained life this turn" (Ulna Alley Shopkeep — Infusion; CR 122.1b):
  // licznik zyskanego życia per gracz, zerowany przy zmianie tury (jak
  // cardsDrawnThisTurn). changeLife to jedyny choke point zmiany życia, więc
  // obejmuje gain_life, gain_life_target i lifelink (CR 702.15).
  if (amount > 0) {
    state.lifeGainedThisTurn = {
      ...(state.lifeGainedThisTurn ?? {}),
      [playerId]: (state.lifeGainedThisTurn?.[playerId] ?? 0) + amount,
    };
  }
  const events = [event('life_changed', { playerId, before, after: player.life, amount })];
  state.events.push(...events);
  return events;
}

/**
 * Jedyna droga nadawania znaczników trucizny graczowi (Infect — CR 702.89c).
 * Przegraną przy 10+ znacznikach obsługują centralne SBA (state-based.js).
 */
export function addPoisonCounters(state, playerId, amount) {
  if (!Number.isInteger(amount) || amount < 0 || !state.players.some((player) => player.id === playerId)) {
    throw new TypeError('Dodanie znaczników trucizny wymaga gracza i nieujemnej wartości');
  }
  if (amount === 0) return [];
  const player = state.players.find((entry) => entry.id === playerId);
  const before = player.poison ?? 0;
  player.poison = before + amount;
  const events = [event('poison_counters_added', { playerId, before, after: player.poison, amount })];
  state.events.push(...events);
  return events;
}

/**
 * Energia (CR 122.1, AER „you get {E}"): licznik GRACZA, nie permanentu.
 * JEDYNA droga nadania energii (analogia: `addPoisonCounters` dla trucizny,
 * `changeLife` dla życia) — rodzina pól gracza w `tools/family-audit.mjs`
 * pilnuje, żeby żadna nowa ścieżka nie pisała wprost.
 *
 * Rulingi AER (Scryfall, 2024-06-07 — docs/cards/scryfall-shipwreck-moray.json):
 *  - „If an effect says you get one or more {E}, you get that many energy
 *    counters" — jedno zdarzenie na całą pulę, nie N zdarzeń;
 *  - „They're not associated with any specific permanents" — licznik należy do
 *    gracza, więc nie ginie razem ze źródłem;
 *  - „Energy counters aren't mana. They don't go away as steps, phases, and
 *    turns end" — brak jakiegokolwiek czyszczenia na koniec tury.
 */
export function addEnergyCounters(state, playerId, amount) {
  if (!Number.isInteger(amount) || amount < 0 || !state.players.some((player) => player.id === playerId)) {
    throw new TypeError('Nadanie energii wymaga gracza i nieujemnej wartości');
  }
  if (amount === 0) return [];
  const player = state.players.find((entry) => entry.id === playerId);
  const before = player.energy ?? 0;
  player.energy = before + amount;
  const events = [event('energy_counters_added', { playerId, before, after: player.energy, amount })];
  state.events.push(...events);
  return events;
}

/**
 * Zapłata energii („Pay {E}"): zdjęcie liczników z gracza. Ruling AER:
 * „You can't pay more energy counters than you have" — wołający MUSI sprawdzić
 * dostępność PRZED mutacją (koszt atomowy, CR 601.2h); ta funkcja rzuca, gdy
 * energia jest za mała, żeby nie dało się „zapłacić" w pustkę.
 */
export function payEnergyCounters(state, playerId, amount) {
  if (!Number.isInteger(amount) || amount < 0 || !state.players.some((player) => player.id === playerId)) {
    throw new TypeError('Zapłata energii wymaga gracza i nieujemnej wartości');
  }
  const player = state.players.find((entry) => entry.id === playerId);
  const before = player.energy ?? 0;
  if (amount > before) throw new Error('Niewystarczająca energia');
  if (amount === 0) return [];
  player.energy = before - amount;
  const events = [event('energy_counters_paid', { playerId, before, after: player.energy, amount })];
  state.events.push(...events);
  return events;
}

/**
 * Speed gracza (DFT „Start your engines!", CR: akcja stanowa) — JEDYNY zapis
 * pola `player.speed` w silniku (analogia: `changeLife` dla życia,
 * `recordCardDrawn` dla dobrań; rodzina pól `speed` w `tools/family-audit.mjs`
 * pilnuje, żeby żadna nowa ścieżka nie pisała wprost).
 * Zwraca wydarzenia `speed_changed` (wołający nie dubluje pusha do `state.events`).
 */
export function setPlayerSpeed(state, playerId, speed) {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) return [];
  const next = Math.max(0, Math.min(4, speed));
  if ((player.speed ?? 0) === next) return [];
  player.speed = next;
  const e = event('speed_changed', { playerId, speed: next });
  state.events.push(e);
  return [e];
}

/**
 * „Start your engines!" (CR: stan, nie trigger — ruling WotC dla Leonin
 * Surveyor, 2025-02-07, zapisany w `docs/cards/scryfall-leonin-surveyor.json`):
 * jeśli gracz NIE ma prędkości, dostaje 1. Ustawiamy, nie zwiększamy — drugi
 * silnik nie podnosi prędkości wyżej, a utrata źródła jej nie cofa.
 */
export function startEnginesFor(state, playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player || (player.speed ?? 0) >= 1) return [];
  return setPlayerSpeed(state, playerId, 1);
}

/**
 * Jedyny choke point licznika dobrań w turze (analogicznie do `changeLife`
 * dla życia): podnosi `state.cardsDrawnThisTurn` i STEMUPLUJE porządek
 * dobrania w zdarzeniu `card_drawn` (`drawNumberThisTurn`).
 *
 * Dlaczego porządek musi iść ZE ZDARZENIA, nie ze stanu: skan triggerów
 * (`processTriggers`) biegnie PO CAŁEJ komendzie, więc odczyt
 * `state.cardsDrawnThisTurn === 2` po komendzie widzi wartość KOŃCOWĄ —
 * „draw two” na starcie tury dawało dwa wyzwalacze Jolrael, a dobranie
 * w kroku + „draw two” nie dawało żadnego (audyt PR #92, znalezisko 3).
 *
 * Zakres: dobrania w rozumieniu CR 122.12. Karty wzięte po mulliganie NIE są
 * dobraniami (CR 701.3b) i nie przechodzą tędy — ich `card_drawn` nosi
 * jawne `drawNumberThisTurn: null`, bo kontrakt pola musi być wypełniony
 * u WSZYSTKICH emiterów (ADR 0027).
 */
export function recordCardDrawn(state, playerId, payload = {}) {
  const drawNumberThisTurn = (state.cardsDrawnThisTurn?.[playerId] ?? 0) + 1;
  state.cardsDrawnThisTurn = {
    ...(state.cardsDrawnThisTurn ?? {}), [playerId]: drawNumberThisTurn,
  };
  const drawnEvent = event('card_drawn', { ...payload, playerId, drawNumberThisTurn });
  state.events.push(drawnEvent);
  return drawnEvent;
}
