import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { rulesText } from '../src/table/render.js';

/**
 * M257 r4 — audyt Żywym Testerem (transkrypcje g2001–g2006, seeds 2001–2006;
 * talie: worek-basni/theros, wornik-siły/worek-basni, worek-basni/worek-basni,
 * worek-legend/theros, worek-legend/worek-legend, worek-basni/worek-legend).
 *
 * Znaleziska:
 *  F1 (g2001): kafel nie pokazywał „enters with a counter” — 7 kart
 *     (Trigon of Corruption, Kappa Tech-Wrecker, Servant of the Scale,
 *     Necrosquito, Voice of the Vermin, Swooping Protector, Creakwood
 *     Safewright) wchodziło z licznikami, a opis kafla o tym nie mówił
 *     (klasa L1/ADR 0017: widoczny stan musi być widoczny na kaflu).
 *  F3 (g2004): Kappa Tech-Wrecker — Oracle „Ninjutsu {1}{G}”, a w rejestrze
 *     koszt {2} GENERYCZNY (pita zielona zgubiona, L57/ADR 0022); silnik
 *     (oferta + płatność ninjutsu) ignorował pipy KOLORÓW — jedyne
 *     aktywowane kosztowanie bez koloru (cycling/reinforce/bloodrush/
 *     channel/forecast/equip pipy respektują; L48: oferta = walidacja);
 *     etykieta kafla „Ninjutsu {2}” + gramatyka żeńska na karcie męskiej.
 *  F4 (g2004, narzędzie audytu): profil defensive w run-game.mjs — wzorzec
 *     /pomij|nie |brak|zostaw/ bez granic słów łapał „zostaNIE 5” w etykiecie
 *     mulligana → pętla mulliganów do 0 kart (legalne, nieintendowane).
 *
 * Zamknięte fałszywe alarmy (L57, zweryfikowane z docs/cards/*.json):
 *  Colossodon Yearling (vanilla 2/4 — oracle_text puste), Greater Tanuki
 *  (CMC 6: {4}{G}{G}), Thistledown Players (untap NONLAND permanentu),
 *  Breaching Hippocamp (untap another creature you control — nie lądu),
 *  Blade-Blizzard Kitsune (Ninjutsu {3}{W} — koszt {4,['W']} poprawny),
 *  koszt rzutu Kappy {1}{G} w MANA_COSTS (poprawny od początku).
 */

const REGISTRY = createCardRegistry();

function game(seed = 2026) {
  return createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function addRealCard(state, id, cardId, playerId, zone) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...data,
  });
}

// --- F3: Kappa Tech-Wrecker, „Ninjutsu {1}{G}” -------------------------------

test('F3-a: dane — ninjutsu Kappy kosztuje {1}{G} (pita ZIELONA), nie generyczny {2}', () => {
  const kappa = REGISTRY.get('kappa-tech-wrecker');
  const nj = kappa.abilities.find((a) => a.keyword === 'ninjutsu');
  assert.ok(nj, 'Kappa bez ninjutsu w rejestrze');
  // Semantyka kosztu: `mana` = SUMA jednostek, `colors` = pipy wśród nich
  // (generyczny = mana − pipy). {1}{G} = 2 jednostki, 1 pita G.
  assert.equal(nj.cost.mana, 2, 'CMC ninjutsu {1}{G} = 2');
  assert.deepEqual(nj.cost.colors, ['G'], 'pita zielona w koszcie ninjutsu');
  // Strażnik karty Z PRAWIŁOWYM kosztem kolorowym (audyt wykazał, że tylko
  // Kappa była zła — poprawiamy, nie „dopasowujemy” do złego wzorca).
  const kitsune = REGISTRY.get('blade-blizzard-kitsune');
  const nj2 = kitsune.abilities.find((a) => a.keyword === 'ninjutsu');
  assert.equal(nj2.cost.mana, 4, 'Kitsune {3}{W}: suma 4');
  assert.deepEqual(nj2.cost.colors, ['W'], 'Kitsune {3}{W}: pita biała');
});

test('F3-b: kafel Kappy — „Ninjutsu {1}{G}” + męska gramatyka + linia liczników wejścia', () => {
  const def = REGISTRY.get('kappa-tech-wrecker');
  const text = rulesText({
    cardId: def.id, controllerId: 'p1', abilities: def.abilities ?? [],
    keywords: def.keywords ?? [], spell: def.spell ?? null,
    equipment: def.equipment ?? null, plot: def.plot ?? null,
    saga: def.saga ?? null, entersWithCounters: def.entersWithCounters ?? null,
  });
  assert.ok(
    text.includes('Ninjutsu {1}{G}: wróć nieblokowanego atakującego, wejdź zatapnięty i atakujący'),
    `etykieta ninjutsu bez pipa zielonego / z gramatyką żeńską: ${text}`
  );
  assert.ok(!text.includes('zatapnięta i atakująca'), `forma żeńska na karcie męskiej: ${text}`);
  assert.ok(text.includes('Wchodzi z 1 licznikiem Dotykanie śmierci'),
    `brak linii licznika wejścia: ${text}`);
});

test('F3-c: silnik — ninjutsu NIE jest oferowane, gdy nie da się zapłacić pipa zielonego', () => {
  // Reprodukcja g2004 (RED przed fixem): pula 2×{U} opłacała „Ninjutsu {2}”,
  // bo oferta i płatność nie patrzyły na kolory. Po fixie {1}{G} wymaga
  // zielonej pity — oferta znika.
  const state = game();
  state.turn = jumpToStep(state.turn, 'combat_damage', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.combat = { attackingPlayerId: 'p1', defendingPlayerId: 'p2', attackers: ['attacker'], blockers: new Map(), declared: true };
  addRealCard(state, 'attacker', 'highland-game', 'p1', 'battlefield');
  addRealCard(state, 'kappa', 'kappa-tech-wrecker', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['U'] });
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'kappa');
  assert.equal(offers.length, 0, 'ninjutsu oferowane za 2×{U} (brak pipa zielonego)');
});

test('F3-d: silnik — ninjutsu {1}{G} opłacalne: oferta + płatność pipem zielonym', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'combat_damage', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.combat = { attackingPlayerId: 'p1', defendingPlayerId: 'p2', attackers: ['attacker'], blockers: new Map(), declared: true };
  addRealCard(state, 'attacker', 'highland-game', 'p1', 'battlefield');
  addRealCard(state, 'kappa', 'kappa-tech-wrecker', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['G'] });
  addMana(state, 'p1', 1, { colors: [] }); // generyczna (bezbarwna)
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'kappa');
  assert.equal(offers.length, 1, 'ninjutsu oferowane przy {G}+generycznej');
  assert.ok(execute(state, offers[0]).ok, 'aktywacja ninjutsu');
  assert.ok(
    [...state.objects.values()].some((o) => o.cardId === 'highland-game' && o.zone === 'hand'),
    'atakujący zwrócony do ręki (koszt ninjutsu)'
  );
  assert.equal(state.players.find((p) => p.id === 'p1').mana, 0, 'mana wydana (1G + 1 generyczna)');
  // Płatność pipem INNEGO koloru jest odrzucana na poziomie spłat
  // (obrona w głębi: gdyby oferta znowu kłamała, execute nie przepuści).
  const state2 = game();
  state2.turn = jumpToStep(state2.turn, 'combat_damage', 'p1');
  state2.turn.activePlayerId = 'p1';
  state2.turn.priorityPlayerId = 'p1';
  state2.combat = { attackingPlayerId: 'p1', defendingPlayerId: 'p2', attackers: ['attacker2'], blockers: new Map(), declared: true };
  addRealCard(state2, 'attacker2', 'highland-game', 'p1', 'battlefield');
  addRealCard(state2, 'kappa2', 'kappa-tech-wrecker', 'p1', 'hand');
  addMana(state2, 'p1', 2, { colors: ['U'] });
  const forced = playerView(state2, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'kappa2');
  if (forced) {
    assert.throws(
      () => execute(state2, forced),
      /many/i,
      'wymuszona płatność {1}{G} z 2×{U} musi rzucić'
    );
  }
});

// --- F1: „enters with a counter” na kaflu -----------------------------------

test('F1: kafle kart wchodzących z licznikami pokazują linię „Wchodzi z …”', () => {
  const cases = [
    ['trigon-of-corruption', 'Wchodzi z 3 licznikami charge'],
    ['kappa-tech-wrecker', 'Wchodzi z 1 licznikiem Dotykanie śmierci'],
    ['servant-of-the-scale', 'Wchodzi z 1 licznikiem +1/+1'],
    ['necrosquito', 'Wchodzi z 2 licznikami oil'],
    ['voice-of-the-vermin', 'Wchodzi z 1 licznikiem shield'],
    ['swooping-protector', 'Wchodzi z 1 licznikiem shield'],
    ['creakwood-safewright', 'Wchodzi z 3 licznikami -1/-1'],
  ];
  for (const [id, expected] of cases) {
    const def = REGISTRY.get(id);
    assert.ok(def, `brak karty ${id} w rejestrze`);
    assert.ok(def.entersWithCounters, `${id}: Oracle „enters with a counter” nie w danych (ADR 0022)`);
    const text = rulesText({
      cardId: def.id, controllerId: 'p1', abilities: def.abilities ?? [],
      keywords: def.keywords ?? [], spell: def.spell ?? null,
      equipment: def.equipment ?? null, plot: def.plot ?? null,
      saga: def.saga ?? null, entersWithCounters: def.entersWithCounters ?? null,
    });
    assert.ok(text.includes(expected), `${id}: brak linii „${expected}” — ${text}`);
  }
});

test('F1 (strażnik): karta BEZ entersWithCounters nie dostaje linii „Wchodzi z”', () => {
  const def = REGISTRY.get('highland-game');
  assert.ok(!def.entersWithCounters, 'Highland Game bez liczników wejścia (wariant testowy)');
  const text = rulesText({
    cardId: def.id, controllerId: 'p1', abilities: def.abilities ?? [],
    keywords: def.keywords ?? [], spell: def.spell ?? null,
    equipment: def.equipment ?? null, plot: def.plot ?? null,
    saga: def.saga ?? null, entersWithCounters: def.entersWithCounters ?? null,
  });
  assert.ok(!text.includes('Wchodzi z'), `fałszywa linia liczników wejścia: ${text}`);
});

// --- F4: profil defensive — mulligan nie jest opcją „pomiń” ------------------

test('F4: wzorzec defensive nie łapie „zostanie” w etykiecie mulligana', () => {
  // Wzorzec dokładnie taki jak w tools/table-tester/run-game.mjs (profil
  // defensive, wybór opcji modalnej). Etykiety z g2004:
  const mulliganOpts = [
    'Mulligan: Zatrzymaj tę rękę (keep — 6 kart)',
    'Mulligan: Weź mulligana — dobierz 7 kart i odłóż 2 karty na spód (zostanie 5)',
  ];
  const pattern = /\bpomij|\bpomiń|\bbrak\b|\bzostaw\b|\bnie\b/i;
  const matched = mulliganOpts.filter((t) => pattern.test(t));
  assert.deepEqual(matched, [], `wzorzec fałszywie łapie opcje mulligana: ${matched.join(' | ')}`);
  // Legitymne opcje „pomiń” (etykiety istniejące w UI) dalej się łapią
  // (regresja zakresu heurystyki).
  assert.ok(pattern.test('Brak ataku'), '„Brak ataku” musi się łapać');
  assert.ok(pattern.test('Brak bloków'), '„Brak bloków” musi się łapać');
  assert.ok(pattern.test('Zostaw w wygnaniu'), '„Zostaw w wygnaniu” musi się łapać');
  assert.ok(pattern.test('Pomiń tę zdolność'), '„Pomiń” musi się łapać');
});
