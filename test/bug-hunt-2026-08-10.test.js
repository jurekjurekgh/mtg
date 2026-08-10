import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { processTriggers } from '../src/engine/triggers.js';

// =============================================================================
// Polowanie na błędy 2026-08-10 (brązowa odznaka) — behawioralnie, nie
// definicyjnie (lekcja M54/M55/M65): każdy test odtwarza realny przebieg gry.
//
// ZNALEZIONE BŁĘDY:
//  1) Karty z keywordami WPISANYMI WIELKĄ LITERĄ — silnik dopasowuje małe
//     snake_case: 'Defender'/'Reach'/'Trample'/'Deathtouch'/'Flash' były
//     MARTWE. Trestle Troll mógł atakować (!), Goblin Deathraiders nie
//     przebijali, Deadly Recluse bez deathtouch, Benevolent Blessing bez flash.
//  2) Channel (Greater Tanuki): deterministycznie pierwszy basic land —
//     CR 701.19b: szukający WYBIERA kartę; ten sam błąd co stary Springbloom.
// =============================================================================

const REGISTRY = createCardRegistry();

function game(seed = 2026) {
  return createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function mainPhase(state, active = 'p1') {
  state.turn = jumpToStep(state.turn, 'main', active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = active;
  return state;
}

function addRealCard(state, id, cardId, playerId, zone, extra = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...data, ...extra,
  });
}

function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 200) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    const pick = pass ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) return false;
    const r = execute(state, pick);
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

function giveMana(state, playerId, amount, colored = {}) {
  const player = state.players.find((pl) => pl.id === playerId);
  player.mana = amount;
  player.manaPool = { ...(player.manaPool ?? {}), ...colored };
}

// ---------------------------------------------------------------------------
// Błąd 1a: Trestle Troll — defender działa (NIE może atakować)
// ---------------------------------------------------------------------------
test('Sherlock 1a: Trestle Troll ma prawdziwy defender — legalne warianty ataku go nie zawierają (CR 702.3)', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addRealCard(state, 'troll', 'trestle-troll', 'p1', 'battlefield', { summoningSickness: false });
  const view = playerView(state, 'p1');
  const withTroll = view.legalCommands.filter((c) => c.type === 'declare_attackers'
    && (c.attackerIds ?? []).includes('troll'));
  assert.equal(withTroll.length, 0,
    'Trestle Troll ma defender — nie może być deklarowany atakującym (CR 702.3); martwy keyword „Defender" (wielka litera)');
});

// ---------------------------------------------------------------------------
// Błąd 1b: Trestle Troll — reach działa (może blokować stwora z flying)
// ---------------------------------------------------------------------------
test('Sherlock 1b: Trestle Troll ma prawdziwy reach — może blokować latającego (CR 702.17)', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1'; // atakuje p1, broni p2
  state.turn.priorityPlayerId = 'p1';
  addRealCard(state, 'moogle', 'cloudbound-moogle', 'p1', 'battlefield', { summoningSickness: false });
  addRealCard(state, 'troll', 'trestle-troll', 'p2', 'battlefield');
  const atk = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['moogle'] });
  assert.ok(atk.ok, 'moogle atakuje: ' + (atk.events?.[0]?.reason ?? ''));
  const blk = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { moogle: ['troll'] } });
  assert.ok(blk.ok, 'troll z reach blokuje latającego (CR 702.17): ' + (blk.events?.[0]?.reason ?? ''));
});

// ---------------------------------------------------------------------------
// Błąd 1c: Deadly Recluse — deathtouch: 1 obrażenie zabija 5/5 (CR 702.2)
// ---------------------------------------------------------------------------
test('Sherlock 1c: Deadly Recluse ma prawdziwy deathtouch — 1 punkt obrażeń niszczy 5/5', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addRealCard(state, 'recluse', 'deadly-recluse', 'p1', 'battlefield', { summoningSickness: false });
  addRealCard(state, 'mauler', 'gloomfang-mauler', 'p2', 'battlefield');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['recluse'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { recluse: ['mauler'] } }).ok);
  const r = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.ok(r.ok, r.events?.[0]?.reason ?? '');
  const maulerZone = state.objects.get('mauler')?.zone ?? 'moved';
  const maulerGone = maulerZone !== 'battlefield';
  assert.ok(maulerGone,
    'bloker 5/5 zginął od 1 obrażenia z deathtouch (CR 702.2+704.5g); martwy keyword „Deathtouch" (wielka litera)');
});

// ---------------------------------------------------------------------------
// Błąd 1d: Goblin Deathraiders — trample: nadmiar przechodzi na gracza
// ---------------------------------------------------------------------------
test('Sherlock 1d: Goblin Deathraiders mają prawdziwy trample — nadmiar nad lethal trafia zagrożonego gracza (CR 702.19)', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addRealCard(state, 'raiders', 'goblin-deathraiders', 'p1', 'battlefield', { summoningSickness: false });
  addRealCard(state, 'bear', 'highland-game', 'p2', 'battlefield'); // 2/1
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['raiders'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { raiders: ['bear'] } }).ok);
  const lifeBefore = state.players.find((p) => p.id === 'p2').life;
  const r = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.ok(r.ok, r.events?.[0]?.reason ?? '');
  // Trample przy blokerze = decyzja atakującego (CR 510.1c). Martwy keyword
  // (wielka litera) → silnik sam zada pełną moc blokerowi, bez decyzji
  // i bez nadmiaru na graczu.
  assert.ok(state.pendingDamageAssignment,
    'trample wymusza decyzję atakującego o rozdzieleniu obrażeń (CR 510.1c)');
  const r2 = execute(state, {
    type: 'resolve_damage_assignment',
    playerId: 'p1',
    assignments: { raiders: [{ blockerId: 'bear', amount: 1 }] }, // lethal na 2/1 = 1
  });
  assert.ok(r2.ok, r2.events?.[0]?.reason ?? '');
  const lifeAfter = state.players.find((p) => p.id === 'p2').life;
  assert.equal(lifeBefore - lifeAfter, 2,
    '3/1 trample vs 1/1: nadmiar 2 trafia gracza (CR 702.19); martwy keyword „Trample" (wielka litera)');
});

// ---------------------------------------------------------------------------
// Błąd 1e: Benevolent Blessing — flash: rzut w turze przeciwnika (CR 702.8)
// ---------------------------------------------------------------------------
test('Sherlock 1e: Benevolent Blessing ma prawdziwy flash — oferta rzutu w turze PRZECIWNIKA', () => {
  const state = game();
  // Tura p2 (aktywny), priorytet w main u p1 (np. po stacku).
  mainPhase(state, 'p2');
  state.turn.priorityPlayerId = 'p1';
  addRealCard(state, 'blessing', 'benevolent-blessing', 'p1', 'hand');
  addRealCard(state, 'host', 'goldmeadow-nomad', 'p1', 'battlefield');
  addRealCard(state, 'plains1', 'basic-plains', 'p1', 'battlefield', { tapped: false });
  addRealCard(state, 'plains2', 'basic-plains', 'p1', 'battlefield', { tapped: false });
  const view = playerView(state, 'p1');
  const casts = view.legalCommands.filter((c) => c.type === 'cast_permanent' && c.objectId === 'blessing');
  assert.ok(casts.length > 0,
    'aura z flash oferowana w turze przeciwnika (CR 702.8); martwy keyword „Flash" (wielka litera)');
});

// ---------------------------------------------------------------------------
// Strażnik: słownik keywordów registry — tylko małe snake_case znane silnikowi.
// (Ochrona przed powtórką błędu 1: wielka litera = keyword martwy na zawsze.)
// ---------------------------------------------------------------------------
const KNOWN_KEYWORDS = new Set([
  'flying', 'trample', 'vigilance', 'haste', 'first_strike', 'double_strike',
  'lifelink', 'deathtouch', 'menace', 'hexproof', 'indestructible', 'reach',
  'defender', 'flash', 'persist', 'infect', 'changeling', 'morph', 'transform',
  'level_up',
]);

test('Sherlock strażnik: każdy keyword w registry to mały snake_case z listy obsługiwanych', () => {
  const bad = [];
  for (const card of REGISTRY.all()) {
    for (const kw of card.keywords ?? []) {
      if (!/^[a-z][a-z0-9_]*$/.test(kw)) bad.push(`${card.id}:${kw} (wielka litera)`);
      else if (!KNOWN_KEYWORDS.has(kw)) bad.push(`${card.id}:${kw} (poza listą — dopisać mechanikę albo listę)`);
    }
  }
  assert.deepEqual(bad, [], `martwe keywordy: ${bad.join(', ')}`);
});

// ---------------------------------------------------------------------------
// Błąd 2: Channel (Greater Tanuki) — wybór karty należy do gracza (CR 701.19b)
// ---------------------------------------------------------------------------
test('Sherlock 2: channel — gracz WYBIERA basic land (pendingSearchChoice), nie deterministycznie pierwszy', () => {
  const state = mainPhase(game());
  giveMana(state, 'p1', 3, { G: 1 });
  addRealCard(state, 'tanuki', 'greater-tanuki', 'p1', 'hand');
  addRealCard(state, 'lib-island', 'basic-island', 'p1', 'library');
  addRealCard(state, 'lib-swamp', 'basic-swamp', 'p1', 'library');
  // kolejność biblioteki: island na wierzchu (indeks 0), swamp niżej
  state.zones.library = ['lib-island', 'lib-swamp'];
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'tanuki', abilityIndex: 0 });
  assert.ok(r.ok, 'aktywacja channel: ' + (r.events?.[0]?.reason ?? ''));
  assert.ok(state.pendingSearchChoice, 'blokująca decyzja wyboru karty (CR 701.19b) — jak przy cycling/Temat 6');
  assert.equal(state.pendingSearchChoice.playerId, 'p1');
  // Gracz wybiera SWAMP (nie deterministyczny island z wierzchu).
  const pick = execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: 'lib-swamp' });
  assert.ok(pick.ok, 'wybór swampa: ' + (pick.events?.[0]?.reason ?? ''));
  const swamp = [...state.objects.values()].find((o) => o.cardId === 'basic-swamp' && o.zone === 'battlefield');
  assert.ok(swamp, 'wybrany swamp wszedł na bitwisko');
  assert.equal(swamp.tapped, true, 'channel kładzie ląd tapped');
  assert.ok(!state.objects.get('lib-island') || state.objects.get('lib-island').zone === 'library',
    'island został w bibliotece');
});

// ---------------------------------------------------------------------------
// Błąd 3: aura z flash — oferta flash pomijała cele (CR 601.2c), a walidacja
// castAuraSpell ignorowała flash (CR 702.8 + CR 303.4). W praktyce: bot w
// benchmarku dostawał z oferty cast_permanent aury BEZ targets i był
// odrzucany („Bot wybrał nielegalną komendę").
// ---------------------------------------------------------------------------
test('Sherlock 3a: aura z flash — oferta w turze przeciwnika niesie legalne cele (CR 601.2c)', () => {
  const state = game();
  mainPhase(state, 'p2');
  state.turn.priorityPlayerId = 'p1';
  addRealCard(state, 'blessing', 'benevolent-blessing', 'p1', 'hand');
  addRealCard(state, 'host', 'goldmeadow-nomad', 'p1', 'battlefield');
  addRealCard(state, 'plains1', 'basic-plains', 'p1', 'battlefield', { tapped: false });
  addRealCard(state, 'plains2', 'basic-plains', 'p1', 'battlefield', { tapped: false });
  const view = playerView(state, 'p1');
  const casts = view.legalCommands.filter((c) => c.type === 'cast_permanent' && c.objectId === 'blessing');
  assert.ok(casts.length > 0, 'aura z flash oferowana w turze przeciwnika (CR 702.8)');
  assert.ok(casts.every((c) => Array.isArray(c.targets) && c.targets.length === 1 && c.targets[0] === 'host'),
    `każda oferta cast aury niesie legalny cel (CR 601.2c); dostałem: ${JSON.stringify(casts)}`);
});

test('Sherlock 3b: aura z flash — rzut w turze przeciwnika jest AKCEPTOWANY (walidacja honoruje flash, CR 702.8)', () => {
  const state = game();
  mainPhase(state, 'p2');
  state.turn.priorityPlayerId = 'p1';
  addRealCard(state, 'blessing', 'benevolent-blessing', 'p1', 'hand');
  addRealCard(state, 'host', 'goldmeadow-nomad', 'p1', 'battlefield');
  addRealCard(state, 'plains1', 'basic-plains', 'p1', 'battlefield', { tapped: false });
  addRealCard(state, 'plains2', 'basic-plains', 'p1', 'battlefield', { tapped: false });
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'blessing', targets: ['host'] });
  assert.ok(r.ok, `rzut aury z flash w turze przeciwnika legalny (CR 702.8); powód: ${r.events?.[0]?.reason ?? '?'}`);
  const onStack = state.zones.stack.some((id) => state.objects.get(id)?.cardId === 'benevolent-blessing');
  assert.ok(onStack, 'czar aury na stosie');
});

test('Sherlock 3c: aura z flash w swojej main phase — bez duplikatów oferty', () => {
  const state = game();
  mainPhase(state, 'p1');
  state.turn.priorityPlayerId = 'p1';
  addRealCard(state, 'blessing', 'benevolent-blessing', 'p1', 'hand');
  addRealCard(state, 'host', 'goldmeadow-nomad', 'p1', 'battlefield');
  addRealCard(state, 'plains1', 'basic-plains', 'p1', 'battlefield', { tapped: false });
  addRealCard(state, 'plains2', 'basic-plains', 'p1', 'battlefield', { tapped: false });
  const view = playerView(state, 'p1');
  const casts = view.legalCommands.filter((c) => c.type === 'cast_permanent' && c.objectId === 'blessing');
  assert.equal(casts.length, 1,
    `dokładnie jeden wariant cast na jedyny legalny cel; dostałem ${casts.length} (duplikaty mnożą szum decyzji botów)`);
});

test('Sherlock 3d: aura z flash bez legalnego gospodarza — BRAK oferty (CR 601.2c)', () => {
  const state = game();
  mainPhase(state, 'p2');
  state.turn.priorityPlayerId = 'p1';
  addRealCard(state, 'blessing', 'benevolent-blessing', 'p1', 'hand');
  addRealCard(state, 'plains1', 'basic-plains', 'p1', 'battlefield', { tapped: false });
  addRealCard(state, 'plains2', 'basic-plains', 'p1', 'battlefield', { tapped: false });
  const view = playerView(state, 'p1');
  const casts = view.legalCommands.filter((c) => c.type === 'cast_permanent' && c.objectId === 'blessing');
  assert.equal(casts.length, 0, 'bez stwora na bitwisku aura nie może zostać rzucona — brak oferty');
});

// ---------------------------------------------------------------------------
// Błąd 4 (uwaga właściciela B, 2026-08-10): triggery „At the beginning of
// YOUR upkeep" odpalały się w upkeep KAŻDEGO gracza — pętla krokowa w
// triggers.js nie liczyła kontrolera źródła. Etherwrought Page odpalało się
// w upkeep przeciwnika; token Goblin Construct zadawał obrażenia swojemu
// kontrolerowi także w turze przeciwnika. „EACH upkeep" (wilkołaki ISD/DKA)
// deklaruje się jawnie (condition.eachUpkeep) i musi działać jak dotąd.
// ---------------------------------------------------------------------------
function fireUpkeep(state, activePlayerId) {
  // Kroki upkeepowe przetwarza pipeline triggerów na zdarzeniu step_advanced.
  state.turn.activePlayerId = activePlayerId;
  state.turn.priorityPlayerId = activePlayerId;
  const events = [];
  processTriggers(state, [{ type: 'step_advanced', step: 'upkeep' }]);
  return state.pendingModalTrigger;
}

test('Sherlock 4a: Etherwrought Page — „your upkeep" NIE odpala w upkeepu przeciwnika', () => {
  const state = game();
  addRealCard(state, 'page', 'etherwrought-page', 'p2', 'battlefield');
  // Upkeep p1 (przeciwnika kontrolera Page) — błąd: pendingModalTrigger dla p2.
  const before = state.turn;
  const pendingWrong = fireUpkeep(state, 'p1');
  assert.equal(pendingWrong, null,
    'trigger „At the beginning of YOUR upkeep" odpalił się w upkeepu przeciwnika (CR 504.x — „your" = kontroler źródła)');
  // Upkeep właściciela-kontrolera p2 — trigger ma odpalić jak dotąd (regresja).
  state.turn = before;
  const pendingRight = fireUpkeep(state, 'p2');
  assert.ok(pendingRight && pendingRight.playerId === 'p2',
    'trigger „your upkeep" ma odpalać w upkeepu kontrolera (wybór trybu jego właściciela)');
});

test('Sherlock 4b: wilkołaki — „EACH upkeep" nadal odpala w upkeep obu graczy (strażnik regresji)', () => {
  const state = game();
  state.lastTurnSpellsCast = 0; // „if no spells were cast last turn"
  addRealCard(state, 'wolves', 'grizzled-outcasts', 'p1', 'battlefield', { summoningSickness: false });
  // Upkeep przeciwnika p2: „At the beginning of EACH upkeep..." — odpala.
  fireUpkeep(state, 'p2');
  const triggered = state.zones.stack.some((id) => {
    const o = state.objects.get(id);
    return o?.kind === 'trigger' && (o.cardId === 'grizzled-outcasts');
  }) || state.turn.priorityPlayerId === 'p1' && state.pendingTriggerTargets.length + Number(state.pendingModalTrigger != null) > 0;
  assert.ok(triggered || state.events.some((e) => e.type === 'ability_triggered' && e.objectId === 'wolves'),
    'wilkołak ma odpalać także w upkeepu przeciwnika („each upkeep" — CR 504.x by design)');
});

test('Sherlock 4c: token Goblin Construct — obrażenia kontrolera tylko w JEGO upkeepu', () => {
  const state = game();
  addRealCard(state, 'construct', 'token_goblin_construct', 'p1', 'battlefield', { summoningSickness: false });
  const p1Life = () => state.players.find((p) => p.id === 'p1').life;
  const before = p1Life();
  fireUpkeep(state, 'p2'); // upkeep przeciwnika — NIE może zadać 1 obrażenia p1
  // Rozstrzygnij ewentualny stos triggerów (błąd by tu doprowadził do damage).
  const leaked = state.zones.stack.filter((id) => state.objects.get(id)?.cardId === 'token_goblin_construct');
  assert.equal(leaked.length, 0, 'trigger tokenu nie może wejść na stos w upkeepu przeciwnika');
  assert.equal(p1Life(), before, 'przeciwnik nie może „spalać" mnie moim tokenem w swojej turze');
});
