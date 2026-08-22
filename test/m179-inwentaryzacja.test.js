// M179 — inwentaryzacja i łatanie dziur (zlecenie właściciela A–F).
// Oś D: nielandowe źródła czystej many w ofercie i płatności.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana, producibleMana, untappedFreeManaSources } from '../src/engine/resources.js';
import { createHeuristicBot, IDEMPOTENT_EOT_EFFECTS, STACKING_ACTIVATED_EFFECTS } from '../src/controllers/heuristic-bot.js';
import { KEYWORD_LABELS } from '../src/table/render.js';
import { KEYWORD_EVENT_LABELS } from '../src/table/session.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 179, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

// ---- D: nielandowe źródła czystej many --------------------------------------

test('D1: producibleMana liczy Seer\'s Lantern i Scorned Villager (czysty {T}: add mana)', () => {
  const state = game('p1');
  assert.equal(producibleMana(state, 'p1'), 0, 'bez źródeł zero');
  putCard(state, 'lantern', 'seers-lantern', 'p1');
  putCard(state, 'villager', 'scorned-villager', 'p1', 'battlefield', { summoningSickness: false });
  assert.equal(producibleMana(state, 'p1'), 2, 'artefakt + stwór bez choroby');
  const free = untappedFreeManaSources(state, 'p1');
  assert.equal(free.length, 2);
});

test('D2: stwór z chorobą przywołania NIE liczy się (CR 302.6); źródła z kosztami/skutkami poza listą', () => {
  const state = game('p1');
  putCard(state, 'villager', 'scorned-villager', 'p1');
  // addObject nie przenosi summoningSickness z patcha (L21) — ustaw wprost.
  state.objects.set('villager', Object.freeze({ ...state.objects.get('villager'), summoningSickness: true }));
  assert.equal(producibleMana(state, 'p1'), 0, 'choroba przywołania blokuje {T}');
  // Apprentice Wizard (koszt {1}{U}) i Pristine Talisman (skutek uboczny —
  // życie) NIE wchodzą do auto-many (świadoma decyzja gracza).
  putCard(state, 'wizard', 'apprentice-wizard', 'p1', 'battlefield', { summoningSickness: false });
  putCard(state, 'talisman', 'pristine-talisman', 'p1');
  assert.equal(untappedFreeManaSources(state, 'p1').length, 0, 'wizard/talisman poza czystą maną');
});

test('D3: oferta rzutu widzi manę z Lantern/Villager i płatność je auto-tapuje (L48)', () => {
  const state = game('p1');
  // Highland Game {1}{G}: 1 Forest (na pipa {G}) + Seer\'s Lantern (generic).
  putCard(state, 'forest', 'basic-forest', 'p1');
  putCard(state, 'lantern', 'seers-lantern', 'p1');
  putCard(state, 'game-card', 'highland-game', 'p1', 'hand');
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'game-card');
  assert.ok(cast, 'oferta rzutu z maną land+artefakt (bez ręcznej aktywacji)');
  assert.ok(execute(state, cast).ok, 'płatność przechodzi');
  assert.equal(state.objects.get('lantern').tapped, true, 'Lantern auto-tapnięty w płatności');
  assert.equal(state.objects.get('forest').tapped, true, 'Forest tapnięty na pipa {G}');
});

test('D3b: pip kolorowy pokrywa nielandowe źródło (Scorned Villager → {G})', () => {
  const state = game('p1');
  putCard(state, 'villager', 'scorned-villager', 'p1', 'battlefield', { summoningSickness: false });
  putCard(state, 'island', 'basic-island', 'p1');
  putCard(state, 'game-card', 'highland-game', 'p1', 'hand'); // {1}{G}
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'game-card');
  assert.ok(cast, 'oferta: {G} z Villagera + generic z Island');
  assert.ok(execute(state, cast).ok, 'płatność przechodzi');
  assert.equal(state.objects.get('villager').tapped, true, 'Villager tapnięty na pipa {G}');
});

// ---- A1: triki bojowe — czary rzucane we właściwym oknie walki ---------------

function sick(state, id, value) {
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: value }));
}

test('A1a: bot NIE rzuca instant-trika (Awaken the Bear) we własnej main — czeka na walkę', () => {
  const state = game('p2');
  putCard(state, 'bear-spell', 'awaken-the-bear', 'p2', 'hand');
  putCard(state, 'me', 'highland-game', 'p2');
  sick(state, 'me', false);
  addMana(state, 'p2', 3, { colors: ['G'] });
  const view = playerView(state, 'p2');
  assert.ok(view.legalCommands.some((c) => c.type === 'cast_spell' && c.objectId === 'bear-spell'), 'oferta istnieje');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.ok(!(chosen.type === 'cast_spell' && chosen.objectId === 'bear-spell'),
    `trik w main = strata okna (wybrał: ${chosen.type})`);
});

test('A1b: bot RZUCA instant-trik na WŁASNEGO zadeklarowanego atakującego (pump+trample)', () => {
  const state = game('p2');
  putCard(state, 'bear-spell', 'awaken-the-bear', 'p2', 'hand');
  putCard(state, 'me', 'highland-game', 'p2');
  sick(state, 'me', false);
  addMana(state, 'p2', 3, { colors: ['G'] });
  state.turn = { ...state.turn, phase: 'combat', step: 'declare_attackers', activePlayerId: 'p2', priorityPlayerId: 'p2' };
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['me'] }).ok);
  state.turn.priorityPlayerId = 'p2';
  const view = playerView(state, 'p2');
  const cast = view.legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'bear-spell' && c.targets?.[0] === 'me');
  assert.ok(cast, 'oferta trika w walce');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.ok(chosen.type === 'cast_spell' && chosen.objectId === 'bear-spell' && chosen.targets?.[0] === 'me',
    `trik na atakującym = właściwe okno (wybrał: ${JSON.stringify(chosen)})`);
});

// ---- C: sorcery-triki — Główna 1 przed atakiem, nie postcombat ----------------

const SORCERY_PUMP = Object.freeze({
  timing: 'sorcery',
  targets: [{ type: 'creature' }],
  effects: [{ type: 'pump', power: 3, toughness: 1 }],
});

test('C1: sorcery-pump rzucany w Głównej 1, gdy stwór może zaatakować', () => {
  const state = game('p2');
  putCard(state, 'sorc', 'titans-strength', 'p2', 'hand', { spell: SORCERY_PUMP });
  putCard(state, 'me', 'highland-game', 'p2');
  sick(state, 'me', false);
  addMana(state, 'p2', 1, { colors: ['R'] });
  state.turn = { ...state.turn, phase: 'precombat_main', step: 'main' };
  const view = playerView(state, 'p2');
  const cast = view.legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'sorc' && c.targets?.[0] === 'me');
  assert.ok(cast, 'oferta sorcery-pumpa w Głównej 1');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.ok(chosen.type === 'cast_spell' && chosen.objectId === 'sorc',
    `sorcery nie poczeka na combat — Główna 1 przed atakiem to jego okno (wybrał: ${chosen.type})`);
});

test('C2: sorcery-pump NIE rzucany w Głównej 2 (efekt wyparuje w cleanup)', () => {
  const state = game('p2');
  putCard(state, 'sorc', 'titans-strength', 'p2', 'hand', { spell: SORCERY_PUMP });
  putCard(state, 'me', 'highland-game', 'p2');
  sick(state, 'me', false);
  addMana(state, 'p2', 1, { colors: ['R'] });
  state.turn = { ...state.turn, phase: 'postcombat_main', step: 'main' };
  const view = playerView(state, 'p2');
  assert.ok(view.legalCommands.some((c) => c.type === 'cast_spell' && c.objectId === 'sorc'), 'oferta istnieje');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.ok(!(chosen.type === 'cast_spell' && chosen.objectId === 'sorc'),
    `pump w Głównej 2 nie zdąży pomóc (wybrał: ${chosen.type})`);
});

// ---- A2: strażnik kompletności etykiet keywordów (badge + log) ---------------

function grantableKeywords() {
  const kws = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const x of node) walk(x); return; }
    for (const [key, val] of Object.entries(node)) {
      if (key === 'keywords' && Array.isArray(val) && val.every((v) => typeof v === 'string')) for (const k of val) kws.add(k);
      else walk(val);
    }
  };
  for (const c of REGISTRY.all()) {
    if (c.support?.status !== 'supported') continue;
    // Kontenery GRANTÓW (celowo bez wydrukowanych `keywords` karty — te mają
    // własną linię na kaflu, nie badge).
    walk({ spell: c.spell, abilities: c.abilities, conditionalKeywords: c.conditionalKeywords, aura: c.aura, equipment: c.equipment, backup: c.backup, saga: c.saga });
  }
  return [...kws].sort();
}

test('A2a (strażnik): każdy grantowalny keyword katalogu ma etykietę badge (KEYWORD_LABELS)', () => {
  const missing = grantableKeywords().filter((kw) => !KEYWORD_LABELS[kw]);
  assert.deepEqual(missing, [], `keywordy bez etykiety badge (kafel pokaże surowy slug): ${missing.join(', ')}`);
});

test('A2b (strażnik): każdy grantowalny keyword katalogu ma etykietę logu (KEYWORD_EVENT_LABELS)', () => {
  const missing = grantableKeywords().filter((kw) => !KEYWORD_EVENT_LABELS[kw]);
  assert.deepEqual(missing, [], `keywordy bez etykiety logu („zyskuje: surowy_slug”): ${missing.join(', ')}`);
});

test('A2c: keyword nadany CZAREM widoczny jako grantedKeywords w widoku (badge, M175/A3)', () => {
  const state = game('p1');
  putCard(state, 'bear-spell', 'awaken-the-bear', 'p1', 'hand');
  putCard(state, 'me', 'highland-game', 'p1');
  addMana(state, 'p1', 3, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'bear-spell' && c.targets?.[0] === 'me');
  assert.ok(cast, 'oferta rzutu');
  assert.ok(execute(state, cast).ok);
  for (let i = 0; i < 8 && state.zones.stack.length > 0; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  const entry = playerView(state, 'p2').zones.battlefield.find((o) => o.id === 'me');
  assert.ok(entry.grantedKeywords?.includes('trample'), `trample z czaru jako badge: ${JSON.stringify(entry.grantedKeywords)}`);
  assert.ok(KEYWORD_LABELS.trample, 'etykieta badge istnieje');
});

// ---- B: aktywowane bez {T} — klasyfikacja i brak dubli na stosie --------------

test('B1 (strażnik): każdy efekt zdolności aktywowanej bez {T} sklasyfikowany (idempotentny/kumulujący)', () => {
  const missing = new Map();
  for (const c of REGISTRY.all()) {
    if (c.support?.status !== 'supported') continue;
    for (const ab of c.abilities ?? []) {
      if (ab?.type !== 'activated') continue;
      if (ab.cost?.tap || ab.cost?.tapHost) continue; // z {T} zdolność sama się wyłącza
      const effects = Array.isArray(ab.effect) ? ab.effect : (ab.effect ? [ab.effect] : []);
      for (const e of effects) {
        if (!e?.type) continue;
        if (IDEMPOTENT_EOT_EFFECTS.has(e.type) || STACKING_ACTIVATED_EFFECTS.has(e.type)) continue;
        if (!missing.has(e.type)) missing.set(e.type, []);
        missing.get(e.type).push(c.id);
      }
    }
  }
  const rows = [...missing.entries()].map(([type, ids]) => `${type} (${ids.join(', ')})`);
  assert.deepEqual(rows, [],
    'typy efektów bez klasyfikacji dubli na stosie (dopisz do IDEMPOTENT_EOT_EFFECTS albo STACKING_ACTIVATED_EFFECTS w heuristic-bocie):\n' + rows.join('\n'));
});

test('B2: bot nie dubluje IDEMPOTENTNEJ aktywacji na stosie (Coralhelm Guide — cant_be_blocked)', () => {
  const state = game('p2');
  putCard(state, 'guide', 'coralhelm-guide', 'p2', 'battlefield');
  sick(state, 'guide', false);
  putCard(state, 'runner', 'highland-game', 'p2');
  sick(state, 'runner', false);
  putCard(state, 'blocker', 'segmented-krotiq', 'p1');
  addMana(state, 'p2', 10, { colors: ['U'] });
  state.turn = { ...state.turn, phase: 'combat', step: 'declare_attackers' };
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['runner'] }).ok);
  state.turn.priorityPlayerId = 'p2';
  // Pierwsza aktywacja: nie do zablokowania na atakującym — legalna i sensowna.
  const first = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'guide' && c.targets?.[0] === 'runner');
  assert.ok(first, 'oferta aktywacji');
  assert.ok(execute(state, first).ok);
  state.turn.priorityPlayerId = 'p2';
  const view = playerView(state, 'p2');
  const again = view.legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'guide' && c.targets?.[0] === 'runner');
  if (again) {
    const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
    assert.ok(!(chosen.type === 'activate_ability' && chosen.objectId === 'guide' && chosen.targets?.[0] === 'runner'),
      `identyczna aktywacja wisi na stosie — dubel to strata many (wybrał: ${JSON.stringify(chosen)})`);
  }
});

// ---- E: pozytywne efekty tylko w sojuszników, negatywne tylko we wrogów -------

test('E1: bot NIE pompuje stwora PRZECIWNIKA (klamra friendlyMisaimPenalty)', () => {
  const state = game('p2');
  putCard(state, 'ts', 'titans-strength', 'p2', 'hand');
  putCard(state, 'foe', 'segmented-krotiq', 'p1'); // jedyny legalny cel = wróg
  addMana(state, 'p2', 1, { colors: ['R'] });
  state.turn = { ...state.turn, phase: 'combat', step: 'declare_blockers' };
  const view = playerView(state, 'p2');
  const badCast = view.legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'ts' && c.targets?.[0] === 'foe');
  assert.ok(badCast, 'oferta na wroga istnieje (MTG-legalna)');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.ok(!(chosen.type === 'cast_spell' && chosen.objectId === 'ts'),
    `pump we wroga = wzmacnianie przeciwnika (wybrał: ${JSON.stringify(chosen)})`);
});

test('E2: bot NIE niszczy WŁASNEGO stwora (selfHarmPenalty — regresja centralnej klamry)', () => {
  const state = game('p2');
  putCard(state, 'spin', 'spin-out', 'p2', 'hand');
  putCard(state, 'mine', 'segmented-krotiq', 'p2'); // jedyny legalny cel = własny
  addMana(state, 'p2', 3, { colors: ['B'] });
  const view = playerView(state, 'p2');
  const badCast = view.legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'spin' && c.targets?.[0] === 'mine');
  assert.ok(badCast, 'oferta na własnego istnieje (MTG-legalna)');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.ok(!(chosen.type === 'cast_spell' && chosen.objectId === 'spin'),
    `removal we własnego stwora (wybrał: ${JSON.stringify(chosen)})`);
});
