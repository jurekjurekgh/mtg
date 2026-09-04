// M255 (2026-08-29) — pętla jakości Żywym Testerem po Batchu 51 (ADR 0021).
//
// 12 partii na taliach, które dostały nowe karty (ravnica, tarkir-bg/wur,
// warhammer-ubr/wu, theros, worek-mroczny, dominaria-wu), profile
// explorer/greedy/defensive/impatient/random, detektory: 0 zgłoszeń.
// Poniżej to, co wyszło z lektury transkryptów (L27/L40 — zero detektorów to
// dolna granica, nie dowód jakości):
//
// A. `buff_creature_until_end_of_turn` nie ogłaszał skutku żadnym zdarzeniem,
//    więc `resolveTrigger` czytał „0 zdarzeń” jako „trigger bez efektu” i log
//    KŁAMAŁ graczowi (Kulrath Mystic dostał realnie +2/+0 i czujność). Ta sama
//    klasa co M138/Z4 dla `set_base_pt_until_end_of_turn`. Po naprawie M254/E
//    kłamstwo dotyczyłoby też Altara of the Goyf (właściciel zgłaszał właśnie
//    ten komunikat — po naprawie celu nadal by go widział).
// B. Bloodrush (Skinbrand Goblin) — log nie nazywał mechaniki ani faktu, że
//    odrzucenie karty jest KOSZTEM (wzorzec: cycling / Morph / Equip).
// C. `ABILITY_EFFECT_LABELS` nie miało wpisów dla `buff_attacking_creatures`
//    i `buff_creature_until_end_of_turn` — aktywacja Thunderstaffa w logu to
//    było gołe „Nieprzyjaciel aktywuje zdolność: Thunderstaff" (klasa L84:
//    nowy deskryptor ma cztery dowiązania; tu: etykieta logu).
// D. Dynamiczne P/T (Altar of the Goyf, Jyoti, Tarmogoyf) traciło „+X/+X" —
//    panel mówił „Gdy atakuje samotnie: liczba typów kart w grobach do końca
//    tury", jakby treścią efektu była definicja X, a nie premia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { describeSpellEffects } from '../src/table/render.js';
import { PLAYER_NAMES, describeGameEvent, isBotMoveNoise } from '../src/table/session.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1', step = 'main') {
  const state = createGameState({ seed: 255, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

/** Przepycha stos passami priorytetu i zwraca WSZYSTKIE zdarzenia z drogi. */
function resolveStackCollecting(state, limit = 24) {
  const seen = [];
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    if (!pass) break;
    const r = execute(state, pass);
    seen.push(...(r.events ?? []));
  }
  return seen;
}

const LOG_HELPERS = { nameOf: (id) => id, nameOfObject: (id) => id };
const logLine = (e) => describeGameEvent(e, LOG_HELPERS, PLAYER_NAMES);

// =============================================================================
// A — skutek bez zdarzenia = log, który kłamie (Kulrath Mystic)
// =============================================================================

test('M255/A1: Kulrath Mystic — trigger „gdy rzucisz czar MV ≥ 4” NIE loguje „bez efektu”', () => {
  const state = game('p1', 'main');
  put(state, 'mystic', 'kulrath-mystic', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'big', 'voice-of-the-vermin', 'p1', 'hand'); // mana value 4
  addMana(state, 'p1', 6, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'big');
  assert.ok(cast, 'czar MV 4 do rzucenia');
  execute(state, cast);
  const seen = resolveStackCollecting(state);

  const buff = (state.untilEndOfTurnBuffs ?? []).find((b) => b.objectId === 'mystic');
  assert.ok(buff, 'buff do końca tury wchodzi na Mystica (+2/+0 i czujność)');
  assert.ok(seen.some((e) => e.type === 'stats_modified' && e.objectId === 'mystic'),
    'skutek jest OGŁOSZONY zdarzeniem (inaczej „0 zdarzeń” = „bez efektu”)');
  assert.ok(seen.some((e) => e.type === 'keyword_granted' && (e.keywords ?? []).includes('vigilance')),
    'czujność też ma być widoczna w logu');

  const resolved = seen.find((e) => e.type === 'trigger_resolved' && e.cardId === 'kulrath-mystic');
  assert.ok(resolved, 'trigger się rozstrzygnął');
  assert.equal(resolved.noEffect, undefined,
    'flaga noEffect to kłamstwo, gdy buff realnie wszedł na stwora');
  const line = logLine(resolved);
  assert.ok(!/bez efektu/.test(line), `log nie może mówić „bez efektu”: ${line}`);
});

test('M255/A2: Altar of the Goyf — po naprawie celu (M254/E) log NADAL nie może kłamać', () => {
  const state = game('p1', 'declare_attackers');
  put(state, 'altar', 'altar-of-the-goyf', 'p1', 'battlefield');
  put(state, 'atk', 'goblin-piker', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'g-creature', 'goblin-piker', 'p1', 'graveyard');
  put(state, 'g-instant', 'shock', 'p2', 'graveyard');
  const r = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] });
  assert.ok(r.ok, 'deklaracja ataku');
  const seen = resolveStackCollecting(state);

  assert.equal(effectivePower(state.objects.get('atk'), state), 4, '2 typy kart w grobach → +2/+2');
  assert.equal(effectiveToughness(state.objects.get('atk'), state), 3);
  const resolved = seen.find((e) => e.type === 'trigger_resolved' && e.cardId === 'altar-of-the-goyf');
  assert.ok(resolved, 'trigger Altara się rozstrzygnął');
  assert.equal(resolved.noEffect, undefined,
    'właściciel zgłaszał „trigger bez efektu” — po naprawie celu komunikat musi zniknąć, nie zmienić treść');
});

// =============================================================================
// B — bloodrush: log nazywa mechanikę i koszt odrzucenia
// =============================================================================

test('M255/B1: log nazywa bloodrush (wzorzec cycling / Morph / Equip)', () => {
  const line = logLine({
    type: 'ability_activated', playerId: 'p1', objectId: 'grave-0',
    cardId: 'skinbrand-goblin', abilityIndex: 0, effectTypes: ['pump'],
    targets: ['atk'], onStack: true, bloodrush: true,
  });
  assert.ok(/bloodrush/i.test(line),
    `mechanika ma być nazwana po imieniu (gracz widział: „${line}”)`);
  assert.ok(/odrzuc/i.test(line), `koszt odrzucenia karty ma być w logu: ${line}`);
});

test('M255/B2: odrzucenie karty jako KOSZT różni się od zwykłego odrzucenia', () => {
  const line = logLine({
    type: 'card_discarded', playerId: 'p1', cardId: 'skinbrand-goblin',
    cost: true, bloodrush: true,
  });
  assert.ok(/koszt/i.test(line),
    `bez dopisku wygląda jak strata karty z ręki, a to cena zdolności: ${line}`);
});

// =============================================================================
// C — strażnik: każdy typ efektu zdolności aktywowanej ma opis w logu
// =============================================================================

test('M255/C1 (strażnik): aktywacja dowolnej zdolności z katalogu niesie OPIS efektu w logu', () => {
  const types = new Set();
  for (const def of REGISTRY.all()) {
    if (def.support?.status !== 'supported') continue; // wzorzec strażników m179/A2a
    for (const ability of def.abilities ?? []) {
      if (ability?.type !== 'activated') continue;
      const effects = Array.isArray(ability.effect) ? ability.effect : ability.effect ? [ability.effect] : [];
      for (const e of effects) if (e?.type) types.add(e.type);
    }
  }
  assert.ok(types.size > 20, `katalog niesie zdolności aktywowane (typów: ${types.size})`);
  const missing = [...types].filter((type) => {
    const line = logLine({
      type: 'ability_activated', playerId: 'p1', objectId: 'o', cardId: 'X', effectTypes: [type],
    });
    return !String(line).includes(' — ');
  });
  assert.deepEqual(missing, [],
    `typy efektów bez opisu w logu (gracz widzi gołą nazwę karty): ${missing.join(', ')}`);
});

test('M255/C2: Thunderstaff — aktywacja loguje CO robi zdolność', () => {
  const line = logLine({
    type: 'ability_activated', playerId: 'p2', objectId: 'ts', cardId: 'thunderstaff',
    abilityIndex: 1, effectTypes: ['buff_attacking_creatures'],
  });
  assert.ok(/—/.test(line), `etykieta efektu musi być w logu: ${line}`);
  assert.ok(/atakuj/i.test(line), `opis mówi o atakujących stworach: ${line}`);
});

// =============================================================================
// D — dynamiczne P/T: panel pokazuje +X/+X, a definicję X osobno
// =============================================================================

test('M255/D1: Altar of the Goyf — „+X/+X (X = liczba typów kart w grobach)”', () => {
  const text = describeSpellEffects({
    effects: [{
      type: 'buff_creature_until_end_of_turn',
      power: 'card_types_in_all_graveyards',
      toughness: 'card_types_in_all_graveyards',
    }],
  });
  assert.ok(/\+X\/\+X/.test(text),
    `panel musi powiedzieć, że stwór DOSTAJE premię (widziałem: „${text}”)`);
  assert.ok(text.includes('liczba typów kart w grobach'), `definicja X zostaje: ${text}`);
});

test('M255/D2: Tarmogoyf — różne wartości dynamiczne to +X/+Y z dwiema definicjami', () => {
  const text = describeSpellEffects({
    effects: [{
      type: 'pump',
      power: 'card_types_in_all_graveyards',
      toughness: 'card_types_in_all_graveyards_plus_1',
    }],
  });
  assert.ok(/\+X\/\+Y/.test(text), `premia i dwie definicje (widziałem: „${text}”)`);
  assert.ok(text.includes('liczba typów kart w grobach'), `definicja X: ${text}`);
  assert.ok(text.includes('liczba typów kart w grobach +1'), `definicja Y: ${text}`);
  assert.ok(!text.includes('card_types_in_all_graveyards_plus_1'),
    `surowy slug nie może trafić do panelu: ${text}`);
});

test('M255/D3 (anty-over-fix): zwykłe liczby dalej drukują się jako +P/+T', () => {
  const text = describeSpellEffects({ effects: [{ type: 'pump', power: 2, toughness: 1 }] });
  assert.ok(text.includes('+2/+1'), `liczby bez zmian: ${text}`);
});

// =============================================================================
// E — bot: „atakujące stwory dostają +1/+0” (Thunderstaff) tylko w oknie walki
// =============================================================================

function thunderstaffState(step) {
  const state = game('p1', step);
  put(state, 'staff', 'thunderstaff', 'p1', 'battlefield');
  put(state, 'atk', 'hill-giant', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'foe', 'segmented-krotiq', 'p2');
  addMana(state, 'p1', 4);
  return state;
}

test('M255/E1: bot NIE pali {2} + tap na Thunderstaffa w Głównej 1 (nikt nie atakuje)', () => {
  // Transkrypt r1-twur-whwu-s37, tura 16: „Nieprzyjaciel aktywuje zdolność:
  // Thunderstaff” w Głównej 1 → „zdolność rozstrzygnięta” bez ŻADNEGO skutku
  // (efekt wygasa w cleanup — klasa M96/firebreathing).
  const state = thunderstaffState('main');
  const chosen = createHeuristicBot({ seed: 5 }).chooseCommand(playerView(state, 'p1'));
  const isStaff = chosen.type === 'activate_ability' && chosen.objectId === 'staff';
  assert.ok(!isStaff,
    `premia „do końca tury” poza walką to wyrzucanie many (wybrał: ${JSON.stringify(chosen)})`);
});

test('M255/E2 (anty-over-fix): bot UŻYWA Thunderstaffa, gdy jego stwory atakują', () => {
  const state = thunderstaffState('declare_attackers');
  const attack = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'declare_attackers' && (c.attackerIds ?? []).includes('atk'));
  assert.ok(attack, 'atak legalny');
  assert.ok(execute(state, attack).ok);
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
  state.turn.priorityPlayerId = 'p1';
  const chosen = createHeuristicBot({ seed: 5 }).chooseCommand(playerView(state, 'p1'));
  assert.equal(chosen.type, 'activate_ability', `oczekiwano aktywacji (wybrał: ${JSON.stringify(chosen)})`);
  assert.equal(chosen.objectId, 'staff', '+1/+0 dla atakujących ma wartość w oknie walki');
});

test('M255/A3: buff „do końca tury” NIE jest szumem w modalu — gracz widzi „+2/+0”', () => {
  const e = { type: 'stats_modified', objectId: 'm', powerModifier: 2, toughnessModifier: 0, untilEndOfTurn: true };
  assert.equal(isBotMoveNoise(e, { botActing: false, stackSize: 0 }), false,
    'własny trigger (Kulrath Mystic) też ma pokazać skutek, nie tylko „zyskuje: czujność”');
  assert.equal(isBotMoveNoise(e, { botActing: true, stackSize: 0 }), false,
    'ruch bota — bez zmian (M99)');
});

test('M255/A4 (anty-over-fix): „stats_modified” bez „do końca tury” zostaje szumem (M99)', () => {
  assert.equal(isBotMoveNoise({ type: 'stats_modified', objectId: 'm', powerModifier: 2 }, { botActing: false, stackSize: 0 }), true,
    'P/T przeliczane przy każdym zdarzeniu to szum — nie zalewamy modalu');
  assert.equal(isBotMoveNoise({ type: 'stats_modified', objectId: 'm' }, { botActing: false, stackSize: 2 }), false,
    'M99: skutek czaru/zdolności bota zostaje widoczny');
  assert.equal(isBotMoveNoise({ type: 'mana_changed' }, {}), true, 'mana to szum');
  assert.equal(isBotMoveNoise({ type: 'card_drawn', source: 'effect', playerId: 'p2' }, { humanId: 'p1' }), false,
    'dobranie z efektu to treść (M89)');
  assert.equal(isBotMoveNoise({ type: 'card_drawn', source: 'draw_step', playerId: 'p2' }, { humanId: 'p1' }), true,
    'dobranie bota w kroku dobierania to szum (M100/E8)');
});

// ------------------------------------------------------------------ F. Pełna macierz benchmarku
//
// Pełna macierz (`node tools/benchmark.mjs --full`, 23 400 meczów) nie
// dobiegła końca: aggro-bot rzucał „nie znalazł ruchu mimo legalnych komend",
// a komunikat nie mówił NIC o tym, który mecz i jaki stan go wywołał. Z kontekstem
// (poprawka narzędzia poniżej) wyszło: tura 15, combat/combat_damage, priorytet p2,
// komendy: activate_ability + concede — obrońca NIE MA PASS ani resolve_combat.
// `blockedByCombat` z M172/C zakazywał passu każdemu graczowi, a jedyna
// alternatywa (`resolve_combat`) jest oferowana wyłącznie aktywnemu. Obrońca
// zostawał z samym `concede` (martwy punkt: ani gra, ani benchmark nie idą dalej).

/** Walka: 3/3 (p1, atakujący) zablokowany przez 1/1 (p2, obrońca), krok obrażeń. */
function combatDamageWindow({ passes = 1, priority = 'p2' } = {}) {
  const state = game('p1', 'declare_attackers');
  put(state, 'atk', 'hill-giant', 'p1'); // 3/3 wanilia
  put(state, 'blk', 'token_soldier', 'p2'); // 1/1
  const atak = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] });
  assert.ok(atak.ok, 'deklaracja ataku');
  state.turn.priorityPlayerId = 'p2';
  const blok = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { atk: ['blk'] } });
  assert.ok(blok.ok, 'deklaracja bloku');
  assert.equal(state.turn.step, 'combat_damage', 'krok obrażeń');
  assert.equal(state.zones.stack.length, 0, 'pusty stos');
  state.turn.passes = passes;
  state.turn.priorityPlayerId = priority;
  return state;
}

function offerTypes(state, playerId) {
  return [...new Set(playerView(state, playerId).legalCommands.map((cmd) => cmd.type))].sort();
}

test('F1 — obrońca w kroku obrażeń DOSTAJE pass (bez niego zostaje z samym concede)', () => {
  const state = combatDamageWindow({ passes: 1, priority: 'p2' });
  const oferta = offerTypes(state, 'p2');
  assert.ok(oferta.includes('pass_priority'), `obrońca musi mieć pass; oferta: ${oferta.join(', ')}`);
});

test('F2 — atakujący w tym samym oknie NADAL nie ma pass (M172/C nienaruszone): jedyna droga to resolve_combat', () => {
  const state = combatDamageWindow({ passes: 1, priority: 'p1' });
  const oferta = offerTypes(state, 'p1');
  assert.ok(!oferta.includes('pass_priority'), `pass domykający nadal zakazany; oferta: ${oferta.join(', ')}`);
  assert.ok(oferta.includes('resolve_combat'), 'atakujący ma resolve_combat');
  // Oferta = walidacja (L48): execute musi odrzucić to, czego nie oferowaliśmy.
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, false, 'execute odrzuca domykający pass');
});

test('F3 — pass obrońcy nie domyka KROKU (obrażenia nie mogą zostać pominięte): priorytet wraca do atakującego', () => {
  const state = combatDamageWindow({ passes: 1, priority: 'p2' });
  const pass = execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(pass.ok, 'pass obrońcy jest legalny');
  assert.equal(state.turn.step, 'combat_damage', 'krok NIE domknięty — inaczej obrażenia by nie padły');
  assert.equal(state.turn.priorityPlayerId, 'p1', 'priorytet wraca do aktywnego gracza');
  assert.ok(state.turn.passes >= state.players.length, 'licznik zostaje domknięty (pass aktywnego odrzucany)');
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, false, 'atakujący nie ominie obrażeń passem');
  const combat = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.ok(combat.ok, 'resolve_combat');
  assert.equal(state.turn.step, 'end_of_combat', 'po obrażeniach koniec walki');
  const events = combat.events ?? [];
  assert.ok(events.filter((e) => e.type === 'damage_dealt').length >= 2, 'obrażenia walki padły');
  assert.ok(events.some((e) => e.type === 'creature_destroyed'), 'bloker 1/1 ginie od 3/3');
});

test('F4 — mecz, który wykładał pełną macierz (random/final-fantasy vs aggro/alara, seed 1001), kończy się', async () => {
  const [{ runSimulation }, { setupCardMatch }, bench, fs] = await Promise.all([
    import('../src/engine/simulation.js'),
    import('../src/cards/materialize.js'),
    import('../tools/benchmark.mjs'),
    import('node:fs'),
  ]);
  const parse = (await import('../src/cards/deck-text.js')).parseDeckText;
  const seed = 1001;
  const finalFantasy = parse(fs.readFileSync('decks/final-fantasy.txt', 'utf8'), REGISTRY).cardIds;
  const alara = parse(fs.readFileSync('decks/alara.txt', 'utf8'), REGISTRY).cardIds;
  const state = setupCardMatch({
    seed,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([['p1', finalFantasy], ['p2', alara]]),
    registry: REGISTRY,
  });
  // Bez poprawki F: aggro (p2, obrońca) w 15. turze nie ma żadnego ruchu →
  // wyjątek kontrolera. Z poprawką: mecz dochodzi do końca.
  const { state: final } = runSimulation({
    state,
    controllers: new Map([
      ['p1', bench.BENCH_BOT_FACTORIES.random(seed + 1, { opponentDeck: alara })],
      ['p2', bench.BENCH_BOT_FACTORIES.aggro(seed + 2, { opponentDeck: finalFantasy })],
    ]),
    maxCommands: 8000,
  });
  assert.equal(final.status, 'finished', 'mecz kończy się (przed poprawką: wyjątek „nie znalazł ruchu”)');
  assert.ok(final.winnerId, 'jest zwycięzca');
});

test('F5 — wyjątek aggro-bota niesie kontekst (krok/komendy): 50 min macierzy bez adresu to ślepy trop', async () => {
  const { createAggroBot } = await import('../src/controllers/aggro-bot.js');
  const bot = createAggroBot(255);
  const view = {
    playerId: 'p2',
    turn: { number: 15, phase: 'combat', step: 'combat_damage' },
    zones: { battlefield: [], hand: [], graveyard: [] },
    legalCommands: [{ type: 'activate_ability', objectId: 'permanent-44', abilityIndex: 1 }, { type: 'concede' }],
  };
  let blad = null;
  try { bot.chooseCommand(view); } catch (error) { blad = error; }
  assert.ok(blad, 'kontroler zgłasza brak ruchu (okno bez pass i bez resolve_combat)');
  assert.match(blad.message, /combat_damage/, 'komunikat mówi, w którym kroku');
  assert.match(blad.message, /activate_ability/, 'komunikat wymienia komendy, których nie rozpoznał');
});

// === M255/G =============================================================
// Trzecia powtórka tej samej klasy (po F i M254/E): OFERTA vs WALIDACJA.
// Tym razem nie o jedną regułę w dwóch kopiach, tylko o DWA PORZĄDKI:
// `firstPendingDecision` mówi „najpierw cel triggera, potem exploit",
// a bramka exploitu w execute stała WCZEŚNIEJ niż bramka celu triggera.
// Gdy gracz miał obie decyzje naraz, oferta dawała `resolve_trigger_target`,
// a execute odrzucał je wcześniejszą bramką:
//   „Bot wybrał nielegalną komendę: exploit_unresolved"
//   — aggro(tarkir-bg) vs random(theros), seed 1003 (58,5% pełnej macierzy).

test('G1 — mecz, który wykładał macierz po naprawie rozmiaru (aggro/tarkir-bg vs random/theros, seed 1003), kończy się', async () => {
  const [{ runSimulation }, { setupCardMatch }, bench, fs] = await Promise.all([
    import('../src/engine/simulation.js'),
    import('../src/cards/materialize.js'),
    import('../tools/benchmark.mjs'),
    import('node:fs'),
  ]);
  const parse = (await import('../src/cards/deck-text.js')).parseDeckText;
  const seed = 1003;
  const tarkir = parse(fs.readFileSync('decks/tarkir-bg.txt', 'utf8'), REGISTRY).cardIds;
  const theros = parse(fs.readFileSync('decks/theros.txt', 'utf8'), REGISTRY).cardIds;
  const state = setupCardMatch({
    seed,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([['p1', tarkir], ['p2', theros]]),
    registry: REGISTRY,
  });
  // Bez poprawki G: p2 wybiera activate_ability / resolve_trigger_target,
  // a bramka exploitu (p1) odrzuca komendę wcześniej → wyjątek symulacji.
  const { state: final } = runSimulation({
    state,
    controllers: new Map([
      ['p1', bench.BENCH_BOT_FACTORIES.aggro(seed + 1, { opponentDeck: theros })],
      ['p2', bench.BENCH_BOT_FACTORIES.random(seed + 2, { opponentDeck: tarkir })],
    ]),
    maxCommands: 8000,
  });
  assert.equal(final.status, 'finished', 'mecz kończy się (przed poprawką: „nielegalna komenda: exploit_unresolved”)');
  assert.ok(final.winnerId, 'jest zwycięzca');
});

test('G2 — oczekująca decyzja Exploit blokuje wyłącznie wtedy, gdy jest PIERWSZA w kolejce (nie każda, nie cudza)', async () => {
  const { playerView } = await import('../src/engine/game-state.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const state = game('p1', 'main');

  // p1: stwór z exploitem + kandydat do poświęcenia.
  put(state, 'butcher', 'silumgar-butcher', 'p1');
  put(state, 'kandydat', 'highland-game', 'p1');
  const butcher = state.objects.get('butcher');
  const kandydat = state.objects.get('kandydat');
  assert.ok(butcher.exploit, 'karta ma mechanikę Exploit');

  // Stan: decyzja exploitu czeka na p1.
  state.pendingExploits.push({ playerId: 'p1', sourceId: butcher.id, candidateIds: [kandydat.id], restorePriorityTo: 'p2' });

  const widokP1 = playerView(state, 'p1');
  assert.ok(
    widokP1.legalCommands.some((c) => c.type === 'resolve_exploit_choice'),
    'właściciel decyzji dostaje komendę resolve_exploit_choice',
  );
  assert.ok(
    widokP1.legalCommands.some((c) => c.type === 'resolve_exploit_choice' && c.skip === true),
    'Exploit to „you may” — opcja skip musi być w ofercie',
  );
  // G: żadna zwykła akcja nie wchodzi do oferty, gdy czeka oczekująca decyzja.
  // Kontrola pozytywna: zdolność DO AKTYWACJI naprawdę istnieje (inaczej
  // twierdzenie byłoby puste — mutacja usunięcia wartownika przeszłaaby
  // na zielono, bo `legalActivatedAbilities` i tak zwracałoby zero).
  put(state, 'soulmender', 'soulmender', 'p1');
  const { legalActivatedAbilities } = await import('../src/engine/abilities.js');
  assert.ok(
    legalActivatedAbilities(state, 'p1').length > 0,
    'kontrola pozytywna: p1 ma zdolność do aktywacji (bez niej test byłby pusty)',
  );
  const poDodaniu = playerView(state, 'p1');
  assert.ok(
    !poDodaniu.legalCommands.some((c) => c.type === 'activate_ability'),
    'inwariant oferta↔walidacja: przy czekającej decyzji nie wolno oferować zwykłych akcji',
  );

  // Przeciwnik nie dostaje komendy cudzej decyzji.
  const widokP2 = playerView(state, 'p2');
  assert.ok(
    !widokP2.legalCommands.some((c) => c.type === 'resolve_exploit_choice'),
    'cudza decyzja nie daje komend przeciwnikowi',
  );
});
