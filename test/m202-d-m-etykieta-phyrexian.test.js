// M202/D + M202/M — zgłoszenia właściciela (ta sama przyczyna):
//
//   D. „Karta Ruthless Invasion. W Twoje działania pokazuje się jako opcja bez
//       nazwy (Wybierz: Zapłata: mana czy życie? (2 opcje))”
//   M. „Karta Porcelain Legionnaire. Podobnie jak poprzednio Ruthless Invasion
//       rzucenie tej karty w Twoje działania jest opisane generycznie i nie
//       wiadomo, że to chodzi o wystawienie tej kreatury”
//
// Przyczyna: warianty zapłaty many phyrexian ({W/P} — mana ALBO 2 życia)
// grupują się w panelu pod kluczem `phyrexian`, ale `choiceSourceTitle` nie
// miał dla nich gałęzi, więc tytuł spadał do generycznego deskryptora
// „Wybierz: Zapłata: mana czy życie?”. Gracz widział wybór nie wiedząc,
// KTÓREJ karty dotyczy — a to dokładnie uwaga C właściciela z 2026-08-10
// („modal wyboru ma nazywać kartę, która go wywołała”), tylko dla tej rodziny.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { choiceGroupTitle, choiceGroupLabel } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

const emptyZones = () => ({ hand: [], battlefield: [], stack: [], graveyard: [], library: [], exile: [] });

function fakeSession(view) {
  return {
    view: () => view, log: [], reasoning: [], state: { seed: 87 },
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    nameOfObject: (id) => id,
    cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
    colorsOf: (cardId) => REGISTRY.get(cardId)?.colors ?? [],
    abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? [],
  };
}

function baseView(overrides = {}) {
  return {
    status: 'active', winnerId: null, playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20 }],
    turn: { number: 3, activePlayerId: 'p1', phase: 'precombat_main', step: 'main' },
    zones: emptyZones(), legalCommands: [],
    ...overrides,
  };
}

/** Grupa wariantów zapłaty phyrexian dla karty z ręki/pola bitwy. */
function phyrexianGroup(cardId, objectId, zone, commandType) {
  const card = REGISTRY.get(cardId);
  const zones = { ...emptyZones(), [zone]: [{ id: objectId, cardId, kind: zone === 'hand' ? (card.spell ? 'spell' : 'creature') : 'creature', spell: card.spell ?? null }] };
  const view = baseView({ zones });
  const request = {
    id: 'phy', type: 'phyrexian',
    options: [
      { type: commandType, playerId: 'p1', objectId, phyrexianPayWithLife: 0 },
      { type: commandType, playerId: 'p1', objectId, phyrexianPayWithLife: 1 },
    ],
  };
  return { request, session: fakeSession(view), view };
}

test('M202/D: tytuł grupy phyrexian nazywa kartę (Ruthless Invasion)', () => {
  const { request, session, view } = phyrexianGroup('ruthless-invasion', 'ri', 'hand', 'cast_spell');
  const title = choiceGroupTitle(request, session, view);
  assert.match(title, /Ruthless Invasion/, `tytuł bez nazwy karty: ${title}`);
  assert.match(title, /mana czy życie/, 'tytuł mówi, czego dotyczy wybór');
  assert.doesNotMatch(title, /^Wybierz: Zapłata/, 'to właśnie był generyczny wpis zgłoszony przez właściciela');
});

test('M202/M: to samo dla permanentu (Porcelain Legionnaire)', () => {
  const { request, session, view } = phyrexianGroup('porcelain-legionnaire', 'pl', 'hand', 'cast_permanent');
  const title = choiceGroupTitle(request, session, view);
  assert.match(title, /Porcelain Legionnaire/, `tytuł bez nazwy karty: ${title}`);
  assert.match(title, /mana czy życie/);
});

test('M202/D+M: etykieta panelu „Twoje działania” też niesie nazwę karty', () => {
  const { request, session, view } = phyrexianGroup('ruthless-invasion', 'ri', 'hand', 'cast_spell');
  const label = choiceGroupLabel(request, session, view);
  assert.match(label, /Ruthless Invasion/, `etykieta panelu: ${label}`);
  assert.match(label, /2 opcje/, 'licznik opcji zostaje');
});

test('M202/D+M (anty-over-fix): grupa bez karty nadal ma generyczny, ale odmieniony opis', () => {
  // Gdy komenda nie niesie objectId (nie ma czego nazwać), tytuł musi zostać
  // czytelny — nie wolno wypuścić „undefined — zapłata…”.
  const view = baseView();
  const session = fakeSession(view);
  const request = { id: 'x', type: 'phyrexian', options: [{ type: 'cast_spell', phyrexianPayWithLife: 0 }] };
  const title = choiceGroupTitle(request, session, view);
  assert.doesNotMatch(title, /undefined/);
  assert.match(title, /mana czy życie/);
});
