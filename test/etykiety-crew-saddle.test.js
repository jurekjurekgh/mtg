import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandLabel } from '../src/table/render.js';
import { createCardRegistry } from '../src/cards/card-data.js';

/**
 * M101/B7 — etykiety crew (CR 701.36) i saddle (CR 702.171) w panelu
 * „Twoje działania".
 *
 * Zgłoszenie właściciela (2026-08-15): „saddle i vehicles można zasilić
 * tapując kreatury — sprawdź czy to działa poprawnie". Silnik okazał się
 * zgodny z CR, ale UI opisywało obie akcje tak, że gracz nie wiedział, co
 * klika:
 *
 *   „Aktywuj: Trained Arynx — efekt (set_saddled) — załoga/saddle: Ainok Tracker"
 *   „Aktywuj: Irontread Crusher — animuj do końca tury — załoga/saddle: Woolly Loxodon"
 *
 * Trzy wady, ten sam wzorzec co zgłoszenie B (Furious Forebear):
 *  1. `set_saddled` nie miał opisu → surowy slug z kodu wyciekał na ekran;
 *  2. koszt (crew 3 / saddle 2) nigdzie nie był pokazany — `abilityCostHtml`
 *     zna tylko manę/tap/discard, więc opcja wyglądała na darmową;
 *  3. „załoga/saddle:" wymieniało oba słowa naraz, zamiast nazwać tę akcję,
 *     którą gracz właśnie wykonuje, i powiedzieć, że stwory zostaną TAPNIĘTE.
 */

const REGISTRY = createCardRegistry();

const NAMES = {
  veh: 'Irontread Crusher', mount: 'Trained Arynx',
  big: 'Woolly Loxodon', helper: 'Ainok Tracker',
};

const SESSION = {
  nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
  nameOfObject: (o) => NAMES[o?.id] ?? o?.cardId ?? '?',
  cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
  abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? [],
};

function viewWith() {
  return {
    playerId: 'p1',
    turn: { number: 5, step: 'precombat_main' },
    players: [{ id: 'p1', life: 20 }, { id: 'p2', life: 20 }],
    zones: {
      battlefield: [
        { id: 'veh', cardId: 'irontread-crusher' },
        { id: 'mount', cardId: 'trained-arynx' },
        { id: 'big', cardId: 'woolly-loxodon' },
        { id: 'helper', cardId: 'ainok-tracker' },
      ],
      hand: [], graveyard: [], exile: [], stack: [],
    },
    legalCommands: [],
  };
}

const crewCmd = { type: 'activate_ability', playerId: 'p1', objectId: 'veh', abilityIndex: 0, crewCreatureIds: ['big'] };
const saddleCmd = { type: 'activate_ability', playerId: 'p1', objectId: 'mount', abilityIndex: 1, crewCreatureIds: ['helper'] };

test('saddle: etykieta nie pokazuje surowego sluga „set_saddled"', () => {
  const label = commandLabel(saddleCmd, SESSION, viewWith());
  assert.doesNotMatch(label, /set_saddled/, `slug w etykiecie: ${label}`);
  assert.doesNotMatch(label, /efekt \(/, `fallback „efekt (…)" w etykiecie: ${label}`);
});

test('saddle: etykieta mówi o osiodłaniu i o TAPNIĘCIU stworów', () => {
  const label = commandLabel(saddleCmd, SESSION, viewWith());
  assert.match(label, /siodł/i, `brak słowa o osiodłaniu: ${label}`);
  assert.match(label, /tapnij/i, `nie widać, że stwory zostaną tapnięte: ${label}`);
  assert.match(label, /Ainok Tracker/, `brak nazwy tapowanego stwora: ${label}`);
});

test('saddle: etykieta pokazuje koszt (saddle 2)', () => {
  const label = commandLabel(saddleCmd, SESSION, viewWith());
  assert.match(label, /2/, `brak wymaganej mocy w etykiecie: ${label}`);
});

test('crew: etykieta mówi „załoga" i o tapnięciu, bez słowa „saddle"', () => {
  const label = commandLabel(crewCmd, SESSION, viewWith());
  assert.match(label, /załog/i, `brak słowa o załodze: ${label}`);
  assert.match(label, /tapnij/i, `nie widać tapnięcia: ${label}`);
  assert.doesNotMatch(label, /saddle/i, `crew nie powinien wspominać saddle: ${label}`);
  assert.match(label, /Woolly Loxodon/, `brak nazwy stwora załogi: ${label}`);
});

test('crew: etykieta pokazuje koszt (crew 3) i skutek animacji', () => {
  const label = commandLabel(crewCmd, SESSION, viewWith());
  assert.match(label, /3/, `brak wymaganej mocy: ${label}`);
  assert.match(label, /stwor/i, `nie widać, że pojazd staje się stworem: ${label}`);
});

test('crew i saddle mają RÓŻNE etykiety (nie generyczne „załoga/saddle")', () => {
  const view = viewWith();
  const a = commandLabel(crewCmd, SESSION, view);
  const b = commandLabel(saddleCmd, SESSION, view);
  assert.notEqual(a, b);
  for (const label of [a, b]) {
    assert.doesNotMatch(label, /załoga\/saddle/, `generyczna etykieta: ${label}`);
  }
});
