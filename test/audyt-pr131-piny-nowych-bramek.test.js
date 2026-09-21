// Audyt PR #131 (ADR 0020 pkt 2) — piny bramek, które PR #131 dodał albo
// przepisał, a żaden test ich nie mierzył. Odkryte mutacjami audytu
// (wyłączenie bramki zostawiało wszystkie ówczesne piny ZIELONE — L13):
//
//  F1. `resolveDelveExile` (spells.js) odrzuca liczbę kart spoza listy
//      opłacalnych wariantów (`affordableCounts`). Bramka pochodzi z PR #130,
//      ale PR #131 przepisywał całą ścieżkę Delve (znalezisko B) i dopisał
//      pin F1 dopiero teraz. Pomiar sondą (`scratch/probe-delve-atomicity.mjs`
//      w sesji audytu): z bramką odrzucona komenda zostawia decyzję
//      `pendingDelveExile` czekającą, bez bramki decyzja jest KONSUMOWANA
//      (zerowana PRZED rzutem, który i tak pada na płatności) — czyli
//      nielegalna komenda mutowała stan (klasa L48 / atomowość CR 601.2h).
//  F2. Decyzja gospodarza aury emituje parę zdarzeń
//      `aura_host_choice_required` → `aura_host_resolved` (protokół, L112;
//      sesja ma osobną gałąź logu dla `aura_host_resolved`). Usunięcie emisji
//      nie czerwieniło żadnego testu — kontrakt nie był mierzony.
//  F3. `resolve_aura_host` przyjmuje wyłącznie gospodarza z `candidateIds`:
//      oferta i walidacja muszą się zgadzać w OBIE strony (L48). Kontrola jest
//      tym istotniejsza, że `isLegalAuraHost` jest predykatem CHWILI — nowy
//      permanent na polu bitwy byłby legalnym gospodarzem, ale nie był
//      opublikowany w ofercie.
//  F4. Pin GRANICY (L158 — „nie naprawiamy świadomie" = pomiar + powód + pin
//      braku pogorszenia). Kontrakt `applyEffect` mówi, że efekt otwierający
//      blokującą decyzję zwraca `true` — wtedy rozstrzyganie czaru czeka na
//      `finishPendingSpell`. Gałąź zwrotu aury (effects.js) zwraca `undefined`,
//      więc kolejne efekty tej samej listy poszłyby PRZED wyborem gospodarza
//      (CR 608.2 — kolejność efektów w rozstrzyganiu). W dzisiejszym katalogu
//      jest to nieosiągalne: zwrot permanentu z grobu jest ZAWSZE ostatnim
//      efektem swojej listy (Zoraline ×2, Unbreakable Bond, Unearth,
//      Annie Flash — sprawdza ten test). Pin pilnuje granicy: pierwsza karta
//      z efektem PO zwrocie czerwienieje i wymusza dokończenie kontynuacji
//      (`resolve_aura_host` musiałby domykać `pendingSpell`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createAggroBot } from '../src/controllers/aggro-bot.js';
import { describeGameEvent } from '../src/table/session.js';
import { readFileSync } from 'node:fs';

const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 131, players: players.map((id) => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of players) for (let i = 0; i < 4; i++) put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
  return state;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand') {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  return state.objects.get(id);
}

/** Stwór na polu bitwy bez choroby przywołania (wzorzec E6). */
function putCreature(state, id, cardId, controllerId, patch = {}) {
  const card = registry.get(cardId);
  assert.ok(card, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    types: card.types ?? [], keywords: card.keywords ?? [], subtypes: card.subtypes ?? [],
    cardName: card.name, ...gameObjectDataOf(card),
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...patch }));
  return id;
}

const LOG_HELPERS = { nameOf: (id) => ({ 'annie-flash-the-veteran': 'Annie Flash, the Veteran', 'containment-membrane': 'Containment Membrane' }[id] ?? 'Karta'), nameOfObject: () => 'Obiekt' };
const LOG_NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };
const commands = (s, p = s.turn.priorityPlayerId) => playerView(s, p).legalCommands;
const find = (s, cardId, zone = 'battlefield') => [...s.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
const reasonOf = (r) => r?.events?.find((e) => e.type === 'command_rejected')?.reason ?? '';

function run(s, cmd) {
  assert.ok(cmd, 'oferta komendy istnieje');
  const r = execute(s, cmd);
  assert.ok(r.ok, `komenda przyjęta (${reasonOf(r)})`);
  return r;
}

// --- F1 ---------------------------------------------------------------------
test('F1: liczba kart Delve spoza listy opłacalnych nie konsumuje decyzji (L48/CR 601.2h)', () => {
  const s = game();
  put(s, 'mandrills', 'hooting-mandrills');
  addObject(s, {
    id: 'reducer', instanceId: 'i-reducer', cardId: 'x-reducer', controllerId: 'p1', zone: 'battlefield',
    kind: 'artifact', manaCost: 2, keywords: [], subtypes: [], types: ['Artifact'], colors: [], cardName: 'Reduktor',
    abilities: [Object.freeze({ type: 'static', costModifier: Object.freeze({ spellTypes: ['Creature'], amount: 1 }), cost: null, effect: null, trigger: null })],
  });
  for (let i = 0; i < 6; i += 1) put(s, `fodder-${i}`, 'basic-swamp', 'p1', 'graveyard');
  addMana(s, 'p1', 1, { colors: ['G'] }); // opłacalny tylko wariant k=4

  const offer = commands(s).find((c) => c.type === 'cast_permanent' && c.objectId === 'mandrills');
  run(s, offer);
  const pending = s.pendingDelveExile;
  assert.deepEqual(pending.affordableCounts, [4], 'oferta publikuje wyłącznie k=4');

  // k=0 jest poza listą opłacalnych (brak 5 many): odrzucenie REGUŁĄ, nie płatnością.
  const bad = execute(s, { type: 'resolve_delve_exile', playerId: 'p1', exileIds: [] });
  assert.equal(bad.ok, false, 'wariant nieopłacalny jest odrzucany');
  assert.match(reasonOf(bad), /Nieprawidłowy koszt Delve/, 'powód nazywa regułę Delve');
  assert.ok(s.pendingDelveExile, 'ODRZUCONA komenda nie konsumuje decyzji (atomowość komendy)');
  assert.equal(s.objects.get('mandrills').zone, 'hand', 'karta zostaje w ręce');
  assert.equal(s.zones.graveyard.length, 6, 'grób nietknięty');
  assert.equal(s.zones.exile.length, 0, 'nic nie wygnano');
  assert.equal(s.players[0].mana, 1, 'mana nietknięta');

  // Legalny wariant nadal domyka rzut — decyzja nie została „zjedzona".
  run(s, { type: 'resolve_delve_exile', playerId: 'p1', exileIds: ['fodder-0', 'fodder-1', 'fodder-2', 'fodder-3'] });
  assert.equal(s.zones.exile.length, 4, 'k=4 przyjęte po odrzuconym wariancie');
});

// --- F2, F3 -----------------------------------------------------------------
function annieReturnsAura(s, { extraCreatures = 0 } = {}) {
  for (let i = 0; i < extraCreatures; i += 1) put(s, `walker-${i}`, 'lightwalker', 'p1', 'battlefield');
  put(s, 'annie', 'annie-flash-the-veteran');
  put(s, 'gy-membrane', 'containment-membrane', 'p1', 'graveyard');
  addMana(s, 'p1', 6, { colors: ['R', 'G', 'W'] });
  run(s, commands(s).find((c) => c.type === 'cast_permanent' && c.objectId === 'annie'));
  for (let i = 0; i < 24 && s.zones.stack.length > 0 && !s.pendingAuraHost; i += 1) {
    const choices = commands(s);
    const pick = choices.find((c) => c.type === 'resolve_trigger_target') ?? choices.find((c) => c.type === 'pass_priority');
    assert.ok(pick, 'jest czym popchnąć rozstrzygnięcie triggera');
    run(s, pick);
  }
  assert.ok(s.pendingAuraHost, 'decyzja o gospodarzu otwarta');
}

test('F2: decyzja gospodarza aury emituje zdarzenie `aura_host_resolved` (kontrakt decyzji)', () => {
  const s = game();
  annieReturnsAura(s, { extraCreatures: 1 });
  const annieBf = find(s, 'annie-flash-the-veteran', 'battlefield');
  const r = run(s, commands(s).find((c) => c.type === 'resolve_aura_host' && c.auraHostId === annieBf.id));
  const zdarzenia = (r.events ?? []).filter((e) => e.type === 'aura_host_resolved');
  assert.equal(zdarzenia.length, 1, 'dokładnie jedno zdarzenie rozstrzygnięcia decyzji');
  assert.equal(zdarzenia[0].auraHostId, annieBf.id, 'zdarzenie nazywa wybranego gospodarza');
  assert.equal(find(s, 'containment-membrane', 'battlefield')?.attachedTo, annieBf.id, 'wybór wykonany');
  // Decyzja nie wraca — zdarzenie jest domknięciem, nie zapowiedzią.
  assert.equal(s.pendingAuraHost ?? null, null, 'decyzja zdjęta');
});

test('F3: gospodarz spoza oferty jest odrzucany, choć byłby legalny (oferta = walidacja w obie strony)', () => {
  const s = game();
  annieReturnsAura(s, { extraCreatures: 1 });
  const oferta = commands(s).filter((c) => c.type === 'resolve_aura_host').map((c) => c.auraHostId);
  assert.equal(oferta.length, 2, 'dwa warianty w ofercie');

  // Permanent, który pojawił się PO otwarciu decyzji: `isLegalAuraHost` mówi
  // „tak", ale nie był opublikowany w ofercie — silnik nie może go przyjąć.
  put(s, 'walker-nowy', 'lightwalker', 'p1', 'battlefield');
  assert.ok(!oferta.includes('walker-nowy'), 'nowy permanent nie jest w ofercie');

  const r = execute(s, { type: 'resolve_aura_host', playerId: 'p1', auraHostId: 'walker-nowy' });
  assert.equal(r.ok, false, 'gospodarz spoza candidateIds odrzucony');
  assert.match(reasonOf(r), /illegal_aura_host/, 'powód nazywa nielegalnego gospodarza');
  assert.ok(s.pendingAuraHost, 'decyzja czeka — gracz wybiera z oferty');
  assert.equal(find(s, 'containment-membrane', 'battlefield'), undefined, 'aura nie weszła');

  run(s, commands(s).find((c) => c.type === 'resolve_aura_host'));
  assert.ok(find(s, 'containment-membrane', 'battlefield'), 'wariant z oferty domyka decyzję');
});

// --- F4 ---------------------------------------------------------------------
/** Wszystkie listy efektów karty (zaklęcie, cleave, tryby, zdolności). */
function effectListsOf(def) {
  const lists = [];
  const push = (arr) => { if (Array.isArray(arr) && arr.length > 0) lists.push(arr); };
  push(def.spell?.effects);
  push(def.spell?.cleave?.effects);
  for (const mode of def.spell?.modes ?? []) push(mode.effects);
  for (const ability of def.abilities ?? []) push(ability.effect);
  return lists;
}

test('F4: zwrot permanentu z grobu jest ZAWSZE ostatnim efektem listy (granica kontraktu `blocked`)', () => {
  const znalezione = [];
  for (const def of registry.all()) {
    for (const effects of effectListsOf(def)) {
      const index = effects.findIndex((e) => e?.type === 'return_permanent_from_graveyard');
      if (index === -1) continue;
      znalezione.push(`${def.id}[${index}/${effects.length - 1}]`);
      assert.equal(index, effects.length - 1,
        `${def.name}: efekt PO zwrocie permanentu z grobu wymaga dokończenia kontynuacji `
        + `(gałąź aury w effects.js nie zwraca \`blocked\`, więc kolejne efekty poszłyby przed `
        + `wyborem gospodarza, CR 608.2) — zanim karta wejdzie do katalogu, domknij `
        + `\`pendingSpell\` w handlerze \`resolve_aura_host\``);
    }
  }
  assert.ok(znalezione.length >= 3, `pin nie ma przedmiotu (znalezione: ${znalezione.join(', ')})`);
});

// --- F5 ---------------------------------------------------------------------
// E6 (pula kandydatów) pinuje gałąź PARTNERA wyłącznie przez menace; drugi
// powód, dla którego samotny bloker jest nielegalny — „can't block alone"
// (Ember Beast, CR 509.1c/508.1d, `cantBlockAlone`) — nie miał żadnego pinu.
// Sonda audytu (`scratch/probe-pool.mjs`, 8 scen z cBA/menace/tapnięciami)
// pokazała zgodność puli z prawdą z komendy, ale dopóki nie ma pinu, regresja
// w tej gałęzi nie czerwieniłaby niczego (L5: strażnik klasy).
import { blockCandidatePool } from '../src/engine/combat.js';

test('F5: pula kandydatów = prawda z KOMENDY w scenach z „can\'t block alone" (CR 509.1c)', () => {
  const scene = (attackers, blockers) => {
    const state = createGameState({ seed: 1310, players: [{ id: 'p1' }, { id: 'p2' }] });
    state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
    state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
    state.turn.number = 9;
    state.pendingMulligans = [];
    const attackerIds = attackers.map((cardId, i) => putCreature(state, `a${i}`, cardId, 'p1'));
    const blockerIds = blockers.map((cardId, i) => putCreature(state, `b${i}`, cardId, 'p2'));
    const declared = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds });
    assert.ok(declared.ok, `deklaracja ataku: ${declared.reason ?? ''}`);
    state.turn = jumpToStep(state.turn, 'declare_blockers', 'p2');
    state.turn.activePlayerId = 'p1';
    state.turn.priorityPlayerId = 'p2';
    return { state, attackerIds, blockerIds };
  };
  const legal = (state, assignments) => execute(structuredClone(state),
    { type: 'declare_blockers', playerId: 'p2', assignments }).ok === true;
  /** Prawda z komendy: bloker sam, z partnerem, z parą partnerów (reguły zbioru). */
  const truth = (state, attackerIds, blockerIds) => {
    const t = {};
    for (const attackerId of attackerIds) {
      t[attackerId] = blockerIds.filter((blockerId) => {
        const others = blockerIds.filter((id) => id !== blockerId);
        if (legal(state, { [attackerId]: [blockerId] })) return true;
        if (others.some((o) => legal(state, { [attackerId]: [blockerId, o] }))) return true;
        return others.some((o1) => others.some((o2) => o1 !== o2
          && legal(state, { [attackerId]: [blockerId, o1, o2] })));
      });
    }
    return t;
  };
  const sceny = [
    { attackers: ['dire-fleet-ravager'], blockers: ['ember-beast', 'highland-game'] },
    { attackers: ['dire-fleet-ravager'], blockers: ['ember-beast', 'ember-beast'] },
    { attackers: ['highland-game'], blockers: ['ember-beast', 'ember-beast'] },
    { attackers: ['dire-fleet-ravager', 'highland-game'], blockers: ['ember-beast', 'highland-game', 'highland-game'] },
    { attackers: ['dire-fleet-ravager'], blockers: ['highland-game'] }, // samotny bloker przy menace = nieosiągalny
  ];
  for (const scena of sceny) {
    const { state, attackerIds, blockerIds } = scene(scena.attackers, scena.blockers);
    const pula = blockCandidatePool(state, 'p2');
    const prawda = truth(state, attackerIds, blockerIds);
    for (const attackerId of attackerIds) {
      assert.deepEqual([...(pula[attackerId] ?? [])].sort(), [...prawda[attackerId]].sort(),
        `pula ≠ komenda: atakujących ${scena.attackers.join('/')}, blokerzy ${scena.blockers.join('/')} `
        + `(pula: ${(pula[attackerId] ?? []).join(',') || '—'}, komenda: ${prawda[attackerId].join(',') || '—'})`);
    }
  }
});

test('F6: partner z „can\'t block alone" nie liczy się SAM ZE SOBĄ jako partner (L48)', () => {
  // Mutacja, która tę regułę wyłącza (`otherId !== blockerId` → `true`):
  // Ember Beast jako JEDYNY legalny bloker dostaje blok z samym sobą
  // ([b0, b0] przechodzi „menace/cantBlockAlone" liczone po długości listy),
  // więc pula obiecywałaby blok, którego komenda nie przyjmie.
  const { state, attackerIds, blockerIds } = (() => {
    const s = createGameState({ seed: 1311, players: [{ id: 'p1' }, { id: 'p2' }] });
    s.turn = jumpToStep(s.turn, 'declare_attackers', 'p1');
    s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
    s.turn.number = 9;
    s.pendingMulligans = [];
    const attackerIds = [putCreature(s, 'a0', 'dire-fleet-ravager', 'p1')];
    const blockerIds = [putCreature(s, 'b0', 'ember-beast', 'p2')];
    assert.ok(execute(s, { type: 'declare_attackers', playerId: 'p1', attackerIds }).ok, 'deklaracja ataku');
    s.turn = jumpToStep(s.turn, 'declare_blockers', 'p2');
    s.turn.activePlayerId = 'p1';
    s.turn.priorityPlayerId = 'p2';
    return { state: s, attackerIds, blockerIds };
  })();
  assert.deepEqual(blockCandidatePool(state, 'p2')[attackerIds[0]], [],
    'jeden bloker z „can\'t block alone" NIE może być swoim własnym partnerem');
  assert.equal(blockerIds.length, 1, 'scena ma dokładnie jednego blokera');
});

// --- F7 ---------------------------------------------------------------------
// Kandydaci Craft (Lodestone Needle) leżą na polu bitwy ALBO w grobie, a wycena
// bota szukała ich wyłącznie przez `objectOnBoard` (pole bitwy) — karta z grobu
// dostawała `finish(0)`, więc wybór wśród artefaktów w grobie był arbitralny
// (pierwsza oferta), mimo komentarza „bot wybiera najsłabszy artefakt".
// Pomiar (sonda audytu, artefakty MV 2 vs MV 3 w grobie):
//   kolejność [drogi, tani] → wybrano DROGI (score obu = 0)
// Klasa L117/L32: remis nieodróżnialny od braku wyceny.
test('F7: bot wycenia kandydatów Craft w GROBIE — wybiera tańszy artefakt (nie pierwszy z oferty)', () => {
  const scene = (kolejnosc) => {
    const state = createGameState({ seed: 1312, players: [{ id: 'p1' }, { id: 'p2' }] });
    state.turn = jumpToStep(state.turn, 'main', 'p1');
    state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
    put(state, 'tani', 'angels-feather', 'p1', 'graveyard');   // MV 2
    put(state, 'drogi', 'seers-lantern', 'p1', 'graveyard');   // MV 3
    state.pendingCraftExile = {
      playerId: 'p1', sourceId: 'needle', candidateIds: [...kolejnosc],
      transformTo: null, restorePriorityTo: 'p1',
    };
    const bot = createHeuristicBot({ seed: 11 });
    const cmd = bot.chooseCommand(playerView(state, 'p1'));
    return { cmd, wpis: bot.trace()[0] };
  };
  // Kolejność ofert ODWROTNA do wartości: wybór „pierwszego z brzegu" = drogi.
  const { cmd, wpis } = scene(['drogi', 'tani']);
  assert.equal(cmd?.type, 'resolve_craft_exile', 'bot domyka decyzję Craft');
  assert.equal(cmd.targetId, 'tani',
    'bot wycenia kandydatów z grobu: tańszy artefakt (MV 2) przed droższym (MV 3), '
    + `a nie pierwszy z oferty — wybrał ${cmd.targetId}`);
  const punkty = wpis.options.filter((o) => o.cmd.startsWith('resolve_craft_exile')).map((o) => o.score);
  assert.equal(new Set(punkty).size, 2, `różne artefakty muszą mieć różne punkty: ${punkty.join(',')}`);
});

// --- F8 ---------------------------------------------------------------------
// Klasa M195/B i M203/2 (L34/L40): opis w śladzie ma nazywać WARIANT, nie tylko
// typ decyzji — inaczej testy wyceny i audyt remisów (`tools/bot-tie-audit.mjs`)
// nie mają czego parować, a remis wygląda na „uczciwy" albo wpada do
// „bez danych". Trzy decyzje wprowadzone w audytowanych PR-ach (#130/#131) nie
// miały ani nazwy wariantu w `summarize`, ani projekcji w `tieProjection`
// (pomiar sondą: `chosen=resolve_craft_exile`, `proj: null`).
function traceDecyzji(przygotuj) {
  const state = createGameState({ seed: 1313, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  przygotuj(state);
  const bot = createHeuristicBot({ seed: 11 });
  bot.chooseCommand(playerView(state, 'p1'));
  return bot.trace()[0];
}

test('F8: ślad nazywa warianty decyzji (aura host / craft / ręka) i niesie projekcje', () => {
  const aura = traceDecyzji((s) => {
    put(s, 'w0', 'lightwalker', 'p1', 'battlefield');
    put(s, 'w1', 'lightwalker', 'p1', 'battlefield');
    put(s, 'gy-aura', 'containment-membrane', 'p1', 'graveyard');
    s.pendingAuraHost = {
      playerId: 'p1', targetId: 'gy-aura', cardId: 'containment-membrane', sourceCardId: null,
      candidateIds: ['w0', 'w1'], effect: null, restorePriorityTo: 'p1',
    };
  });
  assert.match(aura.chosen, /^resolve_aura_host\(.+?\)$/,
    `ślad nazywa WYBRANEGO gospodarza, a nie sam typ: ${aura.chosen}`);
  const auraOpcje = aura.options.filter((o) => o.cmd.startsWith('resolve_aura_host')).map((o) => o.cmd);
  assert.equal(new Set(auraOpcje).size, 2, `warianty muszą być rozróżnialne w śladzie: ${auraOpcje.join(' | ')}`);
  assert.ok(aura.tie?.every((t) => t.proj != null),
    `remis wariantów musi nieść projekcję danych: ${JSON.stringify(aura.tie)}`);

  const craft = traceDecyzji((s) => {
    put(s, 'tani', 'angels-feather', 'p1', 'graveyard');
    put(s, 'drogi', 'seers-lantern', 'p1', 'graveyard');
    s.pendingCraftExile = {
      playerId: 'p1', sourceId: 'needle', candidateIds: ['drogi', 'tani'],
      transformTo: null, restorePriorityTo: 'p1',
    };
  });
  assert.match(craft.chosen, /^resolve_craft_exile\(.+?\)$/,
    `ślad nazywa WYGNANY artefakt, a nie sam typ: ${craft.chosen}`);
  assert.equal(new Set(craft.options.filter((o) => o.cmd.startsWith('resolve_craft_exile')).map((o) => o.cmd)).size, 2,
    'warianty Craft muszą być rozróżnialne w śladzie');

  const reka = traceDecyzji((s) => {
    put(s, 'h0', 'lightwalker', 'p1', 'hand');
    put(s, 'h1', 'lightwalker', 'p1', 'hand');
    s.pendingHandCreature = {
      playerId: 'p1', sourceCardId: null, candidateIds: ['h0', 'h1'], restorePriorityTo: 'p1',
    };
  });
  assert.match(reka.chosen, /^resolve_hand_creature\(.+?\)$/,
    `ślad nazywa WYBRANEGO stwora (albo „skip"), a nie sam typ: ${reka.chosen}`);
  assert.ok(reka.tie?.every((t) => t.proj != null),
    `remis wariantów musi nieść projekcję danych: ${JSON.stringify(reka.tie)}`);
});

test('F8b: ratchet klasy — żadna NOWA decyzja resolve_* bez nazwy wariantu i projekcji', () => {
  // Lista wyjątków jest ZAMROŻONYM POMIAREM (2026-09-20e) i może się tylko
  // kurczyć; nowy `case 'resolve_*'` w scoreCommand bez pinu śladu czerwieni
  // ten test (klasa M195/B/M203/2 — pełny audyt 44 luk jest w raporcie E2).
// Zamrożony pomiar (2026-09-20e) — decyzje resolve_* z gałęzią wyceny, które
// nie mają nazwy wariantu (summarize) / projekcji (tieProjection). Listy mogą się
// tylko kurczyć; DODANIE wpisu wymaga pomiaru i powodu (L158).
const LEGACY_BEZ_NAZWY = new Set([
  'resolve_amass_choice', 'resolve_backup', 'resolve_clash_choice', 'resolve_combat',
  'resolve_copy_targets', 'resolve_counter_pay_choice', 'resolve_damage_assignment',
  'resolve_damage_division', 'resolve_damage_target', 'resolve_destroy_equipment_choice',
  'resolve_devour_choice', 'resolve_discover_choice', 'resolve_endure_choice', 'resolve_enter_as_copy',
  'resolve_epic_choice', 'resolve_explore_choice', 'resolve_fertile_thicket', 'resolve_food_choice',
  'resolve_hand_top_choice', 'resolve_index_choice', 'resolve_land_type_choice', 'resolve_legend_choice',
  'resolve_library_placement', 'resolve_modal_choice', 'resolve_moonlit_choice',
  'resolve_mulligan_bottom_choice', 'resolve_mulligan_choice', 'resolve_optional_draw',
  'resolve_optional_pay_choice', 'resolve_pay_or_sacrifice', 'resolve_proliferate',
  'resolve_redirect_choice', 'resolve_replacement_choice', 'resolve_reveal_choice', 'resolve_reveal_order',
  'resolve_sacrifice_choice', 'resolve_suspend_cast', 'resolve_undercity_route', 'resolve_ward_pay_choice',
]);
const LEGACY_BEZ_PROJEKCJI = new Set([
  'resolve_amass_choice', 'resolve_backup', 'resolve_clash_choice', 'resolve_combat',
  'resolve_copy_targets', 'resolve_counter_pay_choice', 'resolve_damage_assignment',
  'resolve_damage_division', 'resolve_damage_target', 'resolve_destroy_equipment_choice',
  'resolve_devour_choice', 'resolve_discover_choice', 'resolve_endure_choice', 'resolve_enter_as_copy',
  'resolve_epic_choice', 'resolve_explore_choice', 'resolve_fertile_thicket', 'resolve_food_choice',
  'resolve_hand_top_choice', 'resolve_index_choice', 'resolve_land_type_choice', 'resolve_legend_choice',
  'resolve_library_placement', 'resolve_moonlit_choice', 'resolve_mulligan_bottom_choice',
  'resolve_mulligan_choice', 'resolve_optional_draw', 'resolve_optional_pay_choice',
  'resolve_optional_trigger_choice', 'resolve_pay_or_sacrifice', 'resolve_proliferate',
  'resolve_redirect_choice', 'resolve_replacement_choice', 'resolve_reveal_choice', 'resolve_reveal_order',
  'resolve_sacrifice_choice', 'resolve_suspend_cast', 'resolve_undercity_route', 'resolve_ward_pay_choice',
]);

/** Usuwa komentarze (bramka L83: zakomentowana gałąź nie może udawać pinu). */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

  const src = stripComments(readFileSync(new URL('../src/controllers/heuristic-bot.js', import.meta.url), 'utf8'));
  const iScore = src.indexOf('function scoreCommand');
  const iProj = src.indexOf('function tieProjection');
  const iSum = src.indexOf('function summarize');
  assert.ok(iScore > 0 && iProj > iScore && iSum > iProj, 'granice funkcji śladu w heuristic-bot.js');
  const scoreBody = src.slice(iScore, iProj);
  const projBody = src.slice(iProj, iSum);
  const sumBody = src.slice(iSum, src.indexOf('return Object.freeze({', iSum));
  const kinds = [...new Set([...scoreBody.matchAll(/case '([a-z_]+)'/g)].map((m) => m[1]))]
    .filter((k) => k.startsWith('resolve_')).sort();
  const brakNazwy = kinds.filter((k) => !sumBody.includes(`'${k}'`));
  const brakProj = kinds.filter((k) => !projBody.includes(`'${k}'`));
  const nowe = [
    ...brakNazwy.filter((k) => !LEGACY_BEZ_NAZWY.has(k)).map((k) => `${k} (brak nazwy w summarize)`),
    ...brakProj.filter((k) => !LEGACY_BEZ_PROJEKCJI.has(k)).map((k) => `${k} (brak projekcji w tieProjection)`),
  ];
  assert.deepEqual(nowe, [],
    'nowa decyzja resolve_* musi nieść nazwę wariantu i projekcję (wzorzec resolve_scry/resolve_surveil): '
    + nowe.join(', '));
  // Ratchet w dół: trzy decyzje naprawione w tym audycie MUSZĄ mieć obie gałęzie.
  for (const kind of ['resolve_aura_host', 'resolve_craft_exile', 'resolve_hand_creature']) {
    assert.ok(sumBody.includes(`'${kind}'`), `${kind}: brak nazwy wariantu w summarize`);
    assert.ok(projBody.includes(`'${kind}'`), `${kind}: brak projekcji w tieProjection`);
  }
  // Rodzina darmowych rzutów: rzut NIE ma `cast: true` (tylko rezygnacja ma
  // `decline`/`cast: false`), więc stara forma `cmd.cast ? 1 : 0` dawała rzutom
  // 0 i projekcja nie odróżniała ich od odmowy. Scena z REMISEM rzutu
  // i odmowy nie jest konstruowalna (wyceny różnią się z założenia), więc pin
  // jest źródłowy — pilnuje wyrażenia, nie zachowania (komentarz w kodzie).
  assert.match(projBody, /cmd\.cast === false \|\| cmd\.decline === true \? 0 : 1/,
    'projekcja rodziny free-cast musi rozpoznawać rzut po braku `cast: false`/`decline`');
});

// --- F11 --------------------------------------------------------------------
// Znalezisko audytu: bramki `!state.pendingAuraHost` w łańcuchach auto-passu
// (`execute`) i w łańcuchach ofert (`playerView`) nie mają pinu — mutacje
// usuwające je pojedynczo nie zmieniają NICZEGO obserwowalnego (sprawdzone
// sondą `probe-aura-advance.mjs`: priorytet, krok i oferta bez zmian), bo
// decyzję trzymają DWA wcześniejsze mechanizmy: top-level guard
// `aura_host_unresolved` w `execute` i `firstPendingDecision` (odcisk B2).
// Pin mierzy więc NIEZMENNIK, który te bramki tylko osłaniają (L48/L112):
// otwarta decyzja blokuje priorytet, ofertę i próby popchnięcia gry.
test('F11: otwarta decyzja gospodarza aury wstrzymuje priorytet i ofertę (CR 303.4f, L48)', () => {
  const s = game();
  annieReturnsAura(s, { extraCreatures: 1 });
  const decydent = s.pendingAuraHost.playerId;
  const drugi = decydent === 'p1' ? 'p2' : 'p1';

  // 1. Priorytet został u decydenta — decyzja nie jest „przeskakiwana" automatem.
  assert.equal(s.turn.priorityPlayerId, decydent, 'priorytet u decydenta');
  assert.equal(s.turn.step, 'main1', 'krok bez zmian (bez auto-przejścia)');

  // 2. Oferta decydenta: WYŁĄCZNIE rozstrzygnięcie decyzji (+ koncesja, CR 104.3a).
  //    Typ oferty jest tu kontraktem: gdyby decyzja nie blokowała łańcuchów,
  //    gracz zobaczyłby `pass_priority`/`play_land`, których silnik nie przyjmie.
  const ofertaDecydenta = [...new Set(commands(s, decydent).map((c) => c.type))].sort();
  assert.deepEqual(ofertaDecydenta, ['concede', 'resolve_aura_host'],
    `decydent widzi tylko decyzję (dostał: ${ofertaDecydenta.join(', ')})`);

  // 3. Nikt nie może popchnąć gry: `pass_priority` OBU graczy odrzucony z powodem.
  for (const playerId of [decydent, drugi]) {
    const r = execute(s, { type: 'pass_priority', playerId });
    assert.equal(r.ok, false, `pass_priority(${playerId}) odrzucony`);
    assert.match(reasonOf(r), /aura_host_unresolved/, 'powód nazywa nierozstrzygniętą decyzję');
  }
  assert.equal(s.pendingAuraHost?.playerId, decydent, 'decyzja nadal czeka po odrzuceniach');
  assert.equal(s.turn.priorityPlayerId, decydent, 'priorytet nietknięty próbami');

  // 4. Decyzja jest JEDYNĄ drogą naprzód — po rozstrzygnięciu wraca normalne okno.
  run(s, commands(s, decydent).find((c) => c.type === 'resolve_aura_host'));
  assert.ok(s.pendingAuraHost == null, 'decyzja domknięta');
  assert.ok(commands(s, decydent).some((c) => c.type === 'pass_priority'),
    'po decyzji priorytet wraca do zwykłej oferty (gracz nie zostaje zablokowany)');
});

// --- F12 --------------------------------------------------------------------
// Znalezisko audytu (klasa jak F11): wpis `resolve_aura_host` w tablicy `simple`
// aggro-bota NIE jest mierzalny osobno — mutacja go usuwająca zostawia wszystkie
// testy zielone, bo tę samą decyzję łapie ogólny fallback `anyResolve`
// (`view.legalCommands.find((c) => c.type.startsWith('resolve_'))`). Obie drogi
// są wobec siebie redundantne, więc pin mierzy NIEZMIENNIK, który dopiero razem
// gwarantują: bot referencyjny benchmarku MUSI umieć rozstrzygnąć każdą decyzję
// blokującą, bo odrzucona komenda w pętli meczu = zatrzymanie partii.
// Dowód wrażliwości: mutacja usuwająca OBIE drogi (F12/N5b) czerwieni ten test.
test('F12: aggro-bot rozstrzyga decyzję gospodarza aury, nie utyka na niej (CR 303.4f)', () => {
  const s = game();
  annieReturnsAura(s, { extraCreatures: 1 });
  const aggro = createAggroBot();
  const view = playerView(s, 'p1');
  const cmd = aggro.chooseCommand(view);
  assert.ok(cmd, 'bot znalazł ruch, choć jedyną ofertą jest decyzja');
  assert.equal(cmd.type, 'resolve_aura_host', `bot odpowiada na decyzję (wybrał: ${cmd.type})`);
  const r = execute(s, cmd);
  assert.ok(r.ok, `komenda bota przyjęta (${reasonOf(r)})`);
  assert.ok(s.pendingAuraHost == null, 'decyzja domknięta — partia toczy się dalej');
  assert.ok(find(s, 'containment-membrane', 'battlefield')?.attachedTo, 'aura weszła na gospodarza');
});

// --- F13 --------------------------------------------------------------------
// Znalezisko audytu: WARSTWA LOGU decyzji aury nie była mierzona ani jednym
// testem (mutacja N10 — `aura_host_resolved` zwracające tekst zamiast `null`
// zostawiała wszystkie pliki #131 zielone). Kontrakt jest graczowy, nie
// kosmetyczny (klasa M106/Z2): gracz musi wiedzieć, że silnik na niego czeka
// i CO wybiera; po rozstrzygnięciu decyzji nie może zostać drugi wpis
// powtarzający wynik, który `object_moved`/`object_attached` już nazwały
// (inaczej log pokazuje decyzję dwa razy — raz jako otwartą, raz jako wynik).
test('F13: log decyzji aury nazywa źródło, wybór i liczbę kandydatów, a wynik nie dubluje wpisu', () => {
  const e = (type, extra = {}) => describeGameEvent({ type, ...extra }, LOG_HELPERS, LOG_NAMES);
  const wybor = e('aura_host_choice_required', {
    playerId: 'p1', sourceCardId: 'annie-flash-the-veteran', cardId: 'containment-membrane',
    candidateIds: ['a', 'b'],
  });
  assert.match(wybor, /Annie Flash, the Veteran/, 'wpis nazywa kartę źródła (skąd decyzja)');
  assert.match(wybor, /wybierasz/, 'wpis mówi, kto decyduje (druga osoba: „wybierasz”)');
  assert.match(wybor, /Containment Membrane/, 'wpis nazywa aurę, która wchodzi');
  assert.match(wybor, /kandydaci: 2/, 'wpis mówi, ile jest legalnych gospodarzy');

  // Wynik decyzji nie ma własnego wpisu: nazywają go `object_moved`
  // i `object_attached` (podwójny wpis = „decyzja wciąż otwarta” dla gracza).
  assert.equal(e('aura_host_resolved', {
    playerId: 'p1', cardId: 'containment-membrane', auraHostId: 'a', sourceCardId: 'annie-flash-the-veteran',
  }), null, 'rozstrzygnięcie nie dodaje dublującego wpisu');
});
