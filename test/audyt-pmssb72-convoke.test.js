// PMSSB-72 (2026-10-20) — convoke (CR 702.51a): oferty wyboru stworów w grze.
// Plan: docs/plans/PLAN_2026-10-20f-pmssb72-convoke.md. Luka z batcha 69: `legalCommands`
// nie tworzył żadnej oferty convoke (sonda: 2 many + 2 stwory → 0 ofert), a test batcha 69
// wołał `execute` ręcznie. Te testy idą przez `playerView(...).legalCommands` i bota.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGameState, addObject, execute, playerView,
} from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { paymentDescriptorOf } from '../src/table/mana-wizard.js';

const registry = createCardRegistry();

function game() {
  const state = createGameState({ seed: 72, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (let i = 0; i < 8; i += 1) put(state, `lib-p1-${i}`, 'basic-swamp', 'p1', 'library');
  return state;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand', patch = {}) {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes,
    keywords: def.keywords,
  });
  if (Object.keys(patch).length > 0) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

/** Scena: Kavu Primarch na ręce, `mana` many (`g` z nich zielonych), stwory z puli `creatures`. */
function scene({ mana, g = 0, creatures = ['tusk', 'mak', 'myr'] }) {
  const state = game();
  put(state, 'kav', 'kavu-primarch');
  // kolejność z `creatures` = kolejność wstawienia (remisy rozstrzyga kolejność legalnych komend)
  const CIALA = { tusk: 'tuskguard-captain', mak: 'makindi-aeronaut', myr: 'myr-scrapling' };
  for (const id of creatures) put(state, id, CIALA[id], 'p1', 'battlefield');
  if (mana - g > 0) addMana(state, 'p1', mana - g, { colors: [] });
  if (g > 0) addMana(state, 'p1', g, { colors: ['G'] });
  return state;
}

const castOffers = (state) => playerView(state, 'p1').legalCommands
  .filter((c) => c.type === 'cast_permanent' && c.objectId === 'kav');
const convokeOffers = (state) => castOffers(state).filter((c) => c.convokePayments);

test('PMSSB-72 RED→GREEN: 2 many + 2 stwory → legalCommands oferuje wariant convoke', () => {
  const offers = convokeOffers(scene({ mana: 2, creatures: ['tusk', 'mak'] }));
  assert.equal(offers.length, 1, `oczekiwany 1 wariant, jest ${offers.length}`);
  assert.deepEqual(
    offers[0].convokePayments.map((p) => p.creatureId).sort(),
    ['mak', 'tusk'],
    'wariant tapuje oba stwory',
  );
});

test('PMSSB-72: każda oferta convoke przechodzi `execute` (zgodność z walidacją silnika)', () => {
  const sceny = [
    { mana: 0, creatures: ['tusk', 'mak', 'myr'] },
    { mana: 1, creatures: ['tusk', 'mak', 'myr'] },
    { mana: 2, creatures: ['tusk', 'mak'] },
    { mana: 2, creatures: ['tusk', 'mak', 'myr'] },
    { mana: 3, creatures: ['tusk', 'myr'] },
    { mana: 6, creatures: ['tusk', 'mak', 'myr'] },
  ];
  let sprawdzone = 0;
  for (const s of sceny) {
    for (const cmd of convokeOffers(scene(s))) {
      // świeża scena dla każdej oferty: execute zmienia stan
      const state = scene(s);
      const fresh = convokeOffers(state).find((c) => JSON.stringify(c) === JSON.stringify(cmd));
      assert.ok(fresh, 'oferta odtwarzalna');
      const result = execute(state, fresh);
      assert.ok(result.ok, `oferta odrzucona (${s.mana} many): ${result.reason ?? ''} ${JSON.stringify(cmd.convokePayments)}`);
      sprawdzone += 1;
    }
  }
  assert.ok(sprawdzone >= 4, `za mało sprawdzonych ofert: ${sprawdzone}`);
});

test('PMSSB-72: wariant kicked liczy koszt kickera i jest oferowany, gdy stwory go pokrywają', () => {
  // koszt 4 + kicker {4} = 8: 6 many + 2 stwory
  const offers = convokeOffers(scene({ mana: 6, creatures: ['tusk', 'mak'] }))
    .filter((c) => c.kicked === true);
  assert.ok(offers.length >= 1, 'wariant kicked istnieje');
  const state = scene({ mana: 6, creatures: ['tusk', 'mak'] });
  const result = execute(state, offers[0]);
  assert.ok(result.ok, `kicked convoke odrzucone: ${result.reason ?? ''}`);
});

test('PMSSB-72/A-12: 6 many wystarcza → zwykły rzut i dobrowolne convoke są obie legalne', () => {
  const state = scene({ mana: 6, g: 1, creatures: ['tusk', 'mak', 'myr'] });
  const plain = castOffers(state).filter((c) => !c.kicked && !c.convokePayments);
  assert.equal(plain.length, 1, 'zwykły rzut za manę pozostaje dostępny');
  const optional = convokeOffers(state).filter((c) => !c.kicked);
  assert.ok(optional.some((c) => c.convokePayments.length === 1),
    'CR 702.51a: możesz zachować część many, tapując jednego stwora');
  assert.ok(optional.every((c) => c.convokePayments.length <= 4),
    'nie wolno tapnąć więcej stworów niż jednostek całkowitego kosztu {3}{G}');
});

test('PMSSB-72: bez stworów i bez many nie ma ofert convoke', () => {
  assert.equal(convokeOffers(scene({ mana: 2, creatures: [] })).length, 0);
  assert.equal(convokeOffers(scene({ mana: 0, creatures: ['tusk'] })).length, 0,
    'jeden stwór to za mało na {3}{G}');
});

test('PMSSB-72: stwór już stapowany nie jest kandydatem convoke', () => {
  const state = scene({ mana: 2, creatures: ['tusk', 'mak'] });
  state.objects.set('tusk', Object.freeze({ ...state.objects.get('tusk'), tapped: true }));
  assert.equal(convokeOffers(state).length, 0, 'brak wariantu z tapniętym stworem');
});

test('PMSSB-72 kreator płatności: wariant convoke pyta tylko o resztę many', () => {
  const state = scene({ mana: 2, creatures: ['tusk', 'mak'] });
  const [cmd] = convokeOffers(state);
  const view = playerView(state, 'p1');
  const descriptor = paymentDescriptorOf(cmd, view, {});
  assert.ok(descriptor, 'kreator dostaje deskryptor');
  // koszt {3}{G} = 4 jednostki; 2 stwory płacą jedną G i jedną generyczną → 2 do zapłacenia
  assert.equal(descriptor.totalNeeded, 2, 'totalNeeded = koszt − stwory');
  assert.equal(descriptor.requirements.length, 0, 'pip G zapłacony stworem nie wraca do wymagań');
});

test('PMSSB-72 bot: kara convokeTapPenalty liczona za każdy tapnięty stwór (pokrętło, liniowo)', () => {
  const state = scene({ mana: 2, creatures: ['tusk', 'mak'] });
  const view = playerView(state, 'p1');
  const wynik = (params) => {
    const bot = createHeuristicBot({ seed: 7, params });
    bot.chooseCommand(view, {});
    const opcje = bot.trace().at(-1)?.options ?? [];
    const opcja = opcje.find((x) => x.cmd === "cast_permanent(kav)");
    assert.ok(opcja, `opcja convoke w ocenach bota: ${opcje.map((x) => x.cmd).join(' | ')}`);
    return opcja.score;
  };
  const s0 = wynik({ convokeTapPenalty: 0 });
  const s2 = wynik({ convokeTapPenalty: 2 });
  const s4 = wynik({ convokeTapPenalty: 4 });
  // kara = penalty × 2 tapnięte stwory × wspólna waga rodziny rzutu → liniowo
  assert.ok(s0 > s4, 'kara zmniejsza ocenę convoke');
  assert.ok(Math.abs((s0 - s4) - 2 * (s0 - s2)) < 1e-9, `kara liniowa: ${s0 - s4} vs 2×${s0 - s2}`);
});

test('PMSSB-72 bot: tapuje najmniejsze ciało (kara z wartością ciała, nie płasko)', () => {
  // 2 bezbarwne + 1 zielona = 3 many; koszt 4 → dokładnie jeden stwór do convoke.
  // Ciała: Tuskguard 2/3 (suma 5), Makindi 1/3 (4), Myr Scrapling 1/1 (2).
  // Kolejność wstawienia odwrotna do „ładnej”: przy płaskiej karze remis wybrałby tusk.
  const state = scene({ mana: 3, g: 1, creatures: ['myr', 'mak', 'tusk'] });
  const bot = createHeuristicBot({ seed: 7 });
  const wybrany = bot.chooseCommand(playerView(state, 'p1'), {});
  assert.equal(wybrany.type, 'cast_permanent', 'bot rzuca Kavu przez convoke');
  assert.deepEqual(wybrany.convokePayments.map((p) => p.creatureId), ['myr'],
    'tapuje najmniejsze ciało (1/1), nie 2/3 ani 1/3');
});
