// =============================================================================
// PMSSB-34 — `activate_ability`: wymiar KOSZTU MANY + TREŚĆ SPRZĘTU.
//
// Wejście (nowy dowód): tabela triage'u PMSSB-33 rozstrzygnęła 2 remisy
// `activate_ability` hasłem „dwa równie dobre źródła", a projekcja pokazała
// różne KOSZTY przy tym samym wyniku: `mana` 3, 4 i 1 przy 16 (seed 4012 t16)
// oraz 3 vs 4 przy 22 (t20). To ominięcie obowiązkowej kontroli procedury (b):
// „wymiar KOSZTU (S11: 5 vs 2 many nie mogą remisować bez uzasadnienia)".
//
// Pomiar PRZED (sonda `/home/user/scratch/pmssb34-koszt-przed.mjs`, symulacja
// PRZED = oba nowe pokrętła 0, bo całą zmianę wnosi ten jeden wymiar):
//   A. Squire's Lightblade {3} +1/+0 / Brawler's Plate {4} +2/+2 trample /
//      Wooden Stake {1} +1/+0 na tym samym nosicielu 3/3 → 18/18/18 (remis,
//      wybór po KOLEJNOŚCI OFERT),
//   B. ten sam pump +1/+0 za {3} vs {1} → 18 = 18,
//   C. kontrola: 2 lądy → tylko Stake {1} w ofercie (bramka PŁATNOŚCI silnika),
//   D. kontrola anty-over-fix: Apprentice Wizard (add_mana) −4 przed i po
//      (koszt liczony raz, w `net`).
// PO: A → 20 Plate > 19 Stake > 17 Lightblade (Plate WYBRANY), B → 19 > 17.
//
// Pierwiastki (L41 + kontrola (b)):
//  (1) gałąź pierwszego założenia sprzętu liczyła `10 + 2×moc nosiciela`
//      i NIE czytała własnej pompy sprzętu → +1/+0 ({1}) = +2/+2 trample ({4}),
//  (2) koszt many aktywacji nie był wyceniany w żadnej gałęzi poza `add_mana`.
//
// Anty-over-fix: identyczne koszty i treści NADAL remisują (A3 — kotwica
// PRZED), sprzęt „nic nie dodający" ma dalej −12 (`nothingAdded` nietknięte),
// zdolności o koszcie 0 / samym {T} bez zmian (F), `add_mana` bez podwójnej
// kary (D). Wymiary nowe są WYŁĄCZNIE karami/dopłatami (baza 2 i treść efektów
// bez przeliczeń).
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createGameState, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();
/** Symulacja drzewa 8ee8eec: całą zmianę PMSSB-34 niosą te dwa pokrętła. */
const PRZED = { abilityManaCostPenalty: 0, equipPumpBonusPerPoint: 0 };

function game(mana = 20) {
  const state = createGameState({ seed: 4012, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  if (mana > 0) addMana(state, 'p1', mana, { W: Math.ceil(mana / 5), U: Math.ceil(mana / 5), G: Math.ceil(mana / 5), C: mana });
  return state;
}

function creature(state, id, cardId) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', ...gameObjectDataOf(def),
    types: def.types ?? ['Creature'], subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], abilities: def.abilities ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

function equipment(state, id, cardId) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'artifact', ...gameObjectDataOf(def),
    types: def.types ?? ['Artifact'], subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], abilities: def.abilities ?? [], equipment: def.equipment,
  });
}

function kartaWF(state, id, cardId, over = {}) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(def),
    types: def.types ?? [], subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], abilities: def.abilities ?? [], ...over,
  });
}

function biblioteka(state, n) {
  for (let i = 0; i < n; i += 1) {
    addObject(state, {
      id: `lib${i}`, instanceId: `i-lib${i}`, cardId: `x-lib${i}`,
      controllerId: 'p1', ownerId: 'p1', zone: 'library', kind: 'creature',
      power: 0, toughness: 0, manaCost: 2, abilities: [], keywords: [],
      subtypes: [], types: ['Creature'], colors: [], cardName: `lib${i}`,
    });
  }
}

/** Trzy sprzęty na tym samym nosicielu 3/3 (scenariusz A/B z pomiaru). */
function trzySprzety(mana = 20) {
  const state = game(mana);
  creature(state, 'host', 'hill-giant');
  equipment(state, 'light', 'squires-lightblade'); // {3} +1/+0 (ability #1)
  equipment(state, 'plate', 'brawlers-plate');    // {4} +2/+2 trample
  equipment(state, 'stake', 'wooden-stake');      // {1} +1/+0
  return state;
}

/** Para o IDENTYCZNEJ treści +1/+0, różny koszt ({3} vs {1}) — scenariusz B. */
function paraPomp(mana = 20) {
  const state = game(mana);
  creature(state, 'host', 'hill-giant');
  equipment(state, 'light', 'squires-lightblade');
  equipment(state, 'stake', 'wooden-stake');
  return state;
}

/** Pełna lista ofert aktywacji + wybrany cmd (piny czytają CAŁĄ listę, L48). */
function oferta(state, params) {
  const bot = createHeuristicBot({ seed: 4012, params });
  const wybrany = bot.chooseCommand(playerView(state, 'p1'), {});
  const wszystkie = (bot.trace().at(-1)?.options ?? []);
  const aktywacje = wszystkie.filter((o) => o.cmd.startsWith('activate_ability'));
  return {
    wybrany,
    etykiety: aktywacje.map((o) => o.cmd),
    wynik: (cmd) => {
      const trafiona = wszystkie.find((o) => o.cmd === cmd);
      assert.ok(trafiona, `brak opcji ${cmd} w: ${wszystkie.map((o) => o.cmd).join(' | ')}`);
      return trafiona.score;
    },
  };
}

test('PMSSB-34/A1 (L41): treść sprzętu wchodzi do PIERWSZEGO założenia — 20 > 19 > 17', () => {
  // PRZED: 18/18/18 — bot brał pierwszą ofertę (Lightblade), choć Plate daje
  // +2/+2 trample, a Lightblade tylko +1/+0 za droższą aktywację.
  const o = oferta(trzySprzety());
  assert.equal(o.wynik('activate_ability(plate#0->host)'), 20, 'Plate {4} +2/+2 trample: 18 − 4 + 6 (ciało 2×2+2)');
  assert.equal(o.wynik('activate_ability(stake#0->host)'), 19, 'Stake {1} +1/+0: 18 − 1 + 2 (ciało 2×1+0)');
  assert.equal(o.wynik('activate_ability(light#1->host)'), 17, 'Lightblade {3} +1/+0: 18 − 3 + 2 (ciało 2×1+0)');
  assert.equal(o.wybrany.objectId, 'plate', `bot wybiera treść, nie kolejność ofert: ${JSON.stringify(o.wybrany)}`);
});

test('PMSSB-34/A2 (kontrola procedury (b)): ten sam efekt za różny koszt NIE remisuje', () => {
  // PRZED: +1/+0 za {1} = +1/+0 za {3} (18 = 18). Teraz tańsza wygrywa.
  const o = oferta(paraPomp());
  assert.deepEqual(o.etykiety.sort(), ['activate_ability(light#1->host)', 'activate_ability(stake#0->host)']);
  assert.equal(o.wynik('activate_ability(stake#0->host)'), 19);
  assert.equal(o.wynik('activate_ability(light#1->host)'), 17);
  assert.ok(o.wynik('activate_ability(stake#0->host)') > o.wynik('activate_ability(light#1->host)'),
    'identyczna treść: {1} musi bić {3} (1 punkt za manę, skala `creatureManaCostWeight`)');
  assert.equal(o.wybrany.objectId, 'stake');
});

test('PMSSB-34/A3 (kotwica PRZED / anty-over-fix): oba pokrętła 0 → wraca 18/18/18', () => {
  // Dowód, że CAŁĄ zmianę niosą nowe wymiary: identyczne koszty i treści nadal
  // remisują, a wybór wraca do kolejności ofert (Lightblade pierwszy w ofercie).
  const o = oferta(trzySprzety(), PRZED);
  assert.equal(o.wynik('activate_ability(plate#0->host)'), 18);
  assert.equal(o.wynik('activate_ability(stake#0->host)'), 18);
  assert.equal(o.wynik('activate_ability(light#1->host)'), 18);
  assert.equal(o.wybrany.objectId, 'light', 'remis rozstrzyga kolejność ofert (PRZED)');
});

test('PMSSB-34/B1 (mutacja kosztu): abilityManaCostPenalty=0 zrównuje {1} i {3} (20 = 20)', () => {
  // Pin A2 czerwienieje dokładnie od tego pokrętła — koszt many to jedyny
  // nośnik różnicy między Stake a Lightblade (ta sama treść +1/+0).
  const o = oferta(trzySprzety(), { equipPumpBonusPerPoint: 1, abilityManaCostPenalty: 0 });
  assert.equal(o.wynik('activate_ability(stake#0->host)'), 20, '18 + ciało 2 (bez kary kosztu)');
  assert.equal(o.wynik('activate_ability(light#1->host)'), 20, '18 + ciało 2 (bez kary kosztu)');
  assert.equal(o.wynik('activate_ability(stake#0->host)'), o.wynik('activate_ability(light#1->host)'),
    'z karą ×0 różnica kosztu znika — remis wraca');
});

test('PMSSB-34/B2 (mutacja treści): equipPumpBonusPerPoint=0 → 17 > 15 > 14', () => {
  // Pin A1 czerwienieje dokładnie od tego pokrętła: bez treści sprzętu zostaje
  // sam koszt (droższa aktywacja niżej), a Plate przestaje być najlepszy.
  const o = oferta(trzySprzety(), { equipPumpBonusPerPoint: 0, abilityManaCostPenalty: 1 });
  assert.equal(o.wynik('activate_ability(stake#0->host)'), 17);
  assert.equal(o.wynik('activate_ability(light#1->host)'), 15);
  assert.equal(o.wynik('activate_ability(plate#0->host)'), 14);
  assert.ok(o.wynik('activate_ability(plate#0->host)') < o.wynik('activate_ability(stake#0->host)'),
    'z treścią ×0 Plate {4} przegrywa ze Stake {1} — pin A1 jest czuły na to pokrętło');
});

test('PMSSB-34/C (bramka płatności silnika): 2 many → w ofercie TYLKO Stake {1}', () => {
  const o = oferta(trzySprzety(2));
  assert.deepEqual(o.etykiety, ['activate_ability(stake#0->host)'],
    'Lightblade {3}/{4} nieopłacalne z puli 2 — silnik ich nie oferuje (bramka PŁATNOŚCI, nie wycena)');
  assert.equal(o.wynik('activate_ability(stake#0->host)'), 19, 'kara jak przy pełnej puli (płatność != wartość)');
});

test('PMSSB-34/D (kontrola anty-over-fix): add_mana liczy koszt RAZ (net)', () => {
  // Apprentice Wizard {U},{T}: add {C}{C}{C} — koszt wchodzi w `net`
  // (PMSSB-32/A), więc druga kara byłaby podwójnym liczeniem. −4 bez zmian.
  const zbuduj = () => {
    const state = game(2);
    creature(state, 'wiz', 'apprentice-wizard');
    kartaWF(state, 'reka', 'hill-giant', { zone: 'hand', kind: 'creature' });
    return state;
  };
  assert.equal(oferta(zbuduj()).wynik('activate_ability(wiz#0)'), -4, 'domyślne (kara 1/mana)');
  assert.equal(oferta(zbuduj(), PRZED).wynik('activate_ability(wiz#0)'), -4, 'oba pokrętła 0 — bez zmiany (koszt w net)');
});

test('PMSSB-34/E (skala poza sprzętem): kara = dokładnie koszt many zdolności', () => {
  // Token Mutagen {1},poświęć: +1/+1 na 3/3 → 25, a z karą ×0 wraca 26.
  // Δ = 1 = koszt many (ta sama skala co `creatureManaCostWeight`).
  const zbuduj = () => {
    const state = game(6);
    kartaWF(state, 'tok', 'token_mutagen', { kind: 'artifact' });
    creature(state, 'big', 'hill-giant');
    return state;
  };
  const zKara = oferta(zbuduj()).wynik('activate_ability(tok#0->big)');
  const bezKary = oferta(zbuduj(), PRZED).wynik('activate_ability(tok#0->big)');
  assert.equal(bezKary, 26, 'kotwica sprzed wymiaru kosztu');
  assert.equal(zKara, 25, 'z karą: 26 − {1}');
  assert.equal(bezKary - zKara, 1, 'Δ == koszt many ({1})');
});

test('PMSSB-34/F (anty-over-fix): zdolność za sam {T} bez zmian (koszt 0 → kara 0)', () => {
  // Civilized Scholar {T}: loot = 4 (PMSSB-8/F-L1) — koszt many 0, więc nowy
  // wymiar nie ma czego pomniejszać; pin zgodny z PMSSB-8.
  const zbuduj = () => {
    const state = game(20);
    biblioteka(state, 10);
    creature(state, 'sc', 'civilized-scholar');
    return state;
  };
  assert.equal(oferta(zbuduj()).wynik('activate_ability(sc#0)'), 4, 'domyślne');
  assert.equal(oferta(zbuduj(), PRZED).wynik('activate_ability(sc#0)'), 4, 'oba pokrętła 0 — identycznie');
});
