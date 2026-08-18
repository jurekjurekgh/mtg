// =============================================================================
// M138 — audyt „wcielam się w gracza” Żywym Testerem (2026-08-18).
//
// Dziesięć znalezisk z 22 partii na prawdziwym artefakcie. Detektory testera
// zgłosiły w tych partiach ZERO nowych rzeczy — wszystko poniżej pochodzi
// z ręcznego czytania transkryptu (L27: „brak zgłoszeń” znaczy „nie mam
// reguły”, nie „nie ma błędów”). Dlatego trzy klasy dostały też własne
// detektory (test/m138-detektory.test.js).
//
// Pełny opis objawów z cytatami: docs/audits/AUDYT_2026-08-18-m138-zywy-tester.md
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addCounter } from '../src/engine/counters.js';
import { jumpToStep } from '../src/engine/turn.js';
import { applyEffect } from '../src/engine/effects.js';

const REGISTRY = createCardRegistry();
const ALL_CARDS = REGISTRY.all();

function freshState() {
  return createGameState({ seed: 4242, players: [{ id: 'p1' }, { id: 'p2' }], registry: REGISTRY });
}

function putCard(state, id, cardId, controllerId = 'p1', zone = 'battlefield', extra = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone, ...data, ...extra });
  return state.objects.get(id);
}

// ---------------------------------------------------------------------------
// Z1 — bot wzmacniał MOJE stwory
// ---------------------------------------------------------------------------

test('M138/Z1: bot NIE daje keywordu stworowi przeciwnika (wolałby własnego)', async () => {
  const { createHeuristicBot } = await import('../src/controllers/heuristic-bot.js');
  const bot = createHeuristicBot({ seed: 99 });

  const state = freshState();
  // Bot = p1. Ma Soulbright Flamekin ({2}: cel stwór zyskuje trample).
  putCard(state, 'flamekin', 'soulbright-flamekin', 'p1');
  state.objects.set('flamekin', Object.freeze({ ...state.objects.get('flamekin'), summoningSickness: false }));
  // Własny atakujący (bez trample) i stwór PRZECIWNIKA.
  addObject(state, {
    id: 'mine', instanceId: 'i-mine', cardId: 'x-mine', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 3, toughness: 3, types: ['Creature'], subtypes: [], keywords: [], abilities: [], colors: [], manaCost: 2,
  });
  state.objects.set('mine', Object.freeze({ ...state.objects.get('mine'), summoningSickness: false }));
  addObject(state, {
    id: 'theirs', instanceId: 'i-theirs', cardId: 'x-theirs', controllerId: 'p2', ownerId: 'p2', zone: 'battlefield',
    kind: 'creature', power: 4, toughness: 4, types: ['Creature'], subtypes: [], keywords: [], abilities: [], colors: [], manaCost: 3,
  });

  // Mana na aktywację (Soulbright: {2}) — inaczej komenda nie jest legalna.
  for (let i = 0; i < 4; i++) {
    addObject(state, {
      id: `land${i}`, instanceId: `i-land${i}`, cardId: 'mountain', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'land', types: ['Land'], subtypes: ['Mountain'], keywords: [], abilities: [], colors: [], manaCost: 0,
    });
  }
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.priorityPlayerId = 'p1';
  const view = playerView(state, 'p1');

  const grants = view.legalCommands.filter((c) => c.type === 'activate_ability'
    && c.objectId === 'flamekin' && (c.targets ?? []).length > 0);
  assert.ok(grants.length >= 2,
    'scenariusz ma oferować grant na własnego I na wrogiego stwora (inaczej test nic nie sprawdza)');

  const choice = bot.chooseCommand(view, {});
  const targetsEnemy = choice.type === 'activate_ability'
    && choice.objectId === 'flamekin'
    && (choice.targets ?? []).includes('theirs');
  assert.ok(!targetsEnemy,
    'bot NIE może płacić many za wzmocnienie stwora przeciwnika (na stole robił to 24× w jednej partii)');
});

// ---------------------------------------------------------------------------
// Z4 — „nic się nie wydarzyło”, choć się wydarzyło
// ---------------------------------------------------------------------------

test('M138/Z4: efekt ustawiający bazowe P/T emituje zdarzenie (nie jest „cichy”)', () => {
  const state = freshState();
  addObject(state, {
    id: 'c1', instanceId: 'i-c1', cardId: 'x-c1', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 2, types: ['Creature'], subtypes: [], keywords: [], abilities: [], colors: [], manaCost: 1,
  });
  const source = state.objects.get('c1');
  state.events.length = 0;
  applyEffect(state, { type: 'set_base_pt_until_end_of_turn', power: 4, toughness: 4 }, source, ['c1']);

  assert.equal(state.objects.get('c1').tempBasePT.power, 4, 'efekt ma zadziałać');
  assert.ok(state.events.length > 0,
    'skutek BEZ zdarzenia jest niewidzialny — resolveTrigger uzna go za „zerowy wynik” i skłamie graczowi');
});

test('M138/Z4: blokady odkręcania też emitują zdarzenie', () => {
  for (const type of ['lock_untap', 'dont_untap_next_untap_step']) {
    const state = freshState();
    addObject(state, {
      id: 'src', instanceId: 'i-src', cardId: 'x-src', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
      kind: 'artifact', types: ['Artifact'], subtypes: [], keywords: [], abilities: [], colors: [], manaCost: 2,
    });
    addObject(state, {
      id: 'victim', instanceId: 'i-victim', cardId: 'x-victim', controllerId: 'p2', ownerId: 'p2', zone: 'battlefield',
      kind: 'creature', power: 2, toughness: 2, types: ['Creature'], subtypes: [], keywords: [], abilities: [], colors: [], manaCost: 1,
    });
    state.events.length = 0;
    applyEffect(state, { type }, state.objects.get('src'), ['victim']);
    assert.ok(state.events.length > 0, `${type}: skutek bez zdarzenia (L24)`);
  }
});

test('M138/Z4: trigger ze skutkiem NIE jest opisany jako „bez efektu”', () => {
  const state = freshState();
  addObject(state, {
    id: 'c1', instanceId: 'i-c1', cardId: 'x-c1', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 2, types: ['Creature'], subtypes: [], keywords: [], abilities: [], colors: [], manaCost: 1,
  });
  state.events.length = 0;
  applyEffect(state, { type: 'set_base_pt_until_end_of_turn', power: 4, toughness: 4 }, state.objects.get('c1'), ['c1']);
  const emitted = state.events.filter((e) => e.type === 'stats_modified');
  assert.equal(emitted.length, 1, 'dokładnie jedno zdarzenie opisujące zmianę bazowego P/T');
  assert.equal(emitted[0].basePower, 4);
  // Heurystyka „0 zdarzeń = brak skutku” w resolveTrigger (triggers.js) to
  // dokładnie ten mechanizm, który skłamał graczowi — zdarzenie ją rozbraja.
  const triggers = fs.readFileSync('src/engine/triggers.js', 'utf8');
  assert.ok(/state\.events\.length === beforeEffects/.test(triggers),
    'jeśli ta heurystyka zniknie, test trzeba przemyśleć na nowo (a nie usunąć)');
});

// ---------------------------------------------------------------------------
// Z2 — koszty pozamanowe (strażnik DWUSTRONNY: dane ↔ opis)
// ---------------------------------------------------------------------------

test('M138/Z2: KAŻDE pole kosztu obecne w danych kart ma obsługę w renderze', () => {
  const source = fs.readFileSync('src/table/render.js', 'utf8');
  const listed = new Set();
  const block = /const NON_MANA_COST_LABELS = Object\.freeze\(\[([\s\S]*?)\]\);/.exec(source);
  assert.ok(block, 'lista NON_MANA_COST_LABELS musi istnieć (jedno źródło prawdy dla obu miejsc)');
  for (const m of block[1].matchAll(/\['([a-zA-Z]+)'/g)) listed.add(m[1]);
  // Pola liczone osobno jako mana/tap — nie należą do listy pozamanowej.
  const manaFields = new Set(['mana', 'manaX', 'colors', 'tap', 'maxPowerX']);

  const used = new Map();
  for (const card of ALL_CARDS) {
    for (const ability of card.abilities ?? []) {
      for (const field of Object.keys(ability.cost ?? {})) {
        if (manaFields.has(field)) continue;
        if (!used.has(field)) used.set(field, []);
        used.get(field).push(card.name);
      }
    }
  }
  const missing = [...used.keys()].filter((field) => !listed.has(field));
  assert.deepEqual(missing, [],
    `pola kosztu bez opisu (gracz zapłaci coś, o czym nie wie): ${missing.map((f) => `${f} — ${used.get(f).slice(0, 3).join(', ')}`).join(' | ')}`);
});

test('M138/Z2: Goblin Picker — dane karty niosą koszt, którego kafel nie pokazywał', () => {
  const card = REGISTRY.get('goblin-picker');
  const cost = card.abilities[0].cost;
  assert.equal(cost.discardCard, true, 'dane karty: koszt zawiera odrzucenie');
  assert.deepEqual(cost.colors, ['R'], 'dane karty: pip czerwony (nie generyczna mana)');

  // Oba miejsca opisujące koszt muszą znać te pola. Sprawdzamy ŹRÓDŁO, bo
  // render wymaga pełnego DOM-u; kontrakt „pole danych ↔ etykieta” pilnuje
  // test wyżej (strażnik dwustronny), a tu potwierdzamy konkretną kartę.
  const source = fs.readFileSync('src/table/render.js', 'utf8');
  const list = /const NON_MANA_COST_LABELS = Object\.freeze\(\[([\s\S]*?)\]\);/.exec(source)[1];
  assert.ok(/'discardCard'/.test(list), 'koszt „odrzuć kartę” musi być opisany');
  const costFn = /function costTextOf\(ability\) \{([\s\S]*?)\n\}/.exec(source)[1];
  assert.ok(/for \(const \[field, label\] of NON_MANA_COST_LABELS\)/.test(costFn),
    'kafel (costTextOf) musi iterować po wspólnej liście kosztów pozamanowych');
});

// ---------------------------------------------------------------------------
// Z5/Z8 — typ celu z parametrem
// ---------------------------------------------------------------------------

test('M138/Z5: sparametryzowane typy celu mają obsługę parametru w opisie', () => {
  const source = fs.readFileSync('src/table/render.js', 'utf8');
  const parametrised = new Map();
  const walk = (spec, cardName) => {
    if (!spec?.type) return;
    const extra = Object.keys(spec).filter((k) => k !== 'type');
    if (extra.length) parametrised.set(spec.type, cardName);
  };
  for (const card of ALL_CARDS) {
    for (const ability of card.abilities ?? []) {
      for (const t of ability.targets ?? []) walk(t, card.name);
      const effects = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
      for (const e of effects) for (const t of e?.targets ?? []) walk(t, card.name);
    }
    for (const t of card.spell?.targets ?? []) walk(t, card.name);
    for (const mode of card.spell?.modes ?? []) for (const t of mode.targets ?? []) walk(t, card.name);
  }
  assert.ok(parametrised.size >= 4, 'w bazie są cele z parametrem — inaczej test nic nie pilnuje');

  // Każdy taki typ musi być wymieniony w funkcji budującej etykietę celu.
  const labelFn = /const targetTypeLabel = \(spec\) => \{([\s\S]*?)\n\};/.exec(source);
  assert.ok(labelFn, 'targetTypeLabel musi przyjmować SPEC (nie sam string), żeby znać parametr');
  const missing = [];
  for (const [type, card] of parametrised) {
    // player+opponent opisuje samo słowo „przeciwnik” — parametr nie zmienia treści.
    if (type === 'player') continue;
    if (!labelFn[1].includes(`'${type}'`)) missing.push(`${type} (${card})`);
  }
  assert.deepEqual(missing, [], `typ celu gubi parametr w etykiecie: ${missing.join(', ')}`);
});

// ---------------------------------------------------------------------------
// Z6 — Station: kafel czyta typy ze STANU, nie z rejestru
// ---------------------------------------------------------------------------

test('M138/Z6: Spacecraft po przekroczeniu progu jest stworem w widoku OBU graczy', () => {
  const state = freshState();
  putCard(state, 'ship', 'warmaker-gunship', 'p1');
  const threshold = state.objects.get('ship').station.threshold;
  addCounter(state, 'ship', 'charge', threshold);

  for (const observer of ['p1', 'p2']) {
    const seen = playerView(state, observer).zones.battlefield.find((o) => o.id === 'ship');
    assert.equal(seen.kind, 'creature', `${observer}: po progu to artefaktowy STWÓR`);
    assert.ok(seen.types.includes('Creature'), `${observer}: linia typów musi zawierać Creature (CR 205.1)`);
    assert.ok(seen.power != null && seen.toughness != null, `${observer}: stwór ma P/T`);
  }
});

test('M138/Z6: kafel bierze typy z OBIEKTU, nie ze statycznego rejestru', () => {
  const source = fs.readFileSync('src/table/render.js', 'utf8');
  const line = source.split('\n').find((l) => /^\s*types: faceDown \? \['Creature'\]/.test(l));
  assert.ok(line, 'nie znaleziono miejsca budującego types w cardInfo');
  assert.ok(/object\.types/.test(line),
    'types kafla muszą pochodzić z object.types — inaczej Station/animacja nie są widoczne dla gracza');
});

// ---------------------------------------------------------------------------
// Z7 — „you may” ze źródłem
// ---------------------------------------------------------------------------

test('M138/Z7: opis „you may” wymienia kartę źródłową (payload ją niesie)', () => {
  const source = fs.readFileSync('src/table/session.js', 'utf8');
  const idx = source.indexOf("case 'optional_trigger_resolved'");
  assert.ok(idx > 0, 'brak obsługi optional_trigger_resolved');
  const chunk = source.slice(idx, idx + 700);
  assert.ok(/sourceCardId/.test(chunk),
    'opis musi używać e.sourceCardId — „korzysta z efektu «you may»” bez nazwy karty nie niesie informacji (oś 2)');
});

// ---------------------------------------------------------------------------
// Z3/Z9/Z10 — treść reguł na kaflu
// ---------------------------------------------------------------------------

test('M138/Z3: statyczny keyword WARUNKOWY jest opisany (warunek + skutek)', () => {
  const source = fs.readFileSync('src/table/render.js', 'utf8');
  const idx = source.indexOf('if (ability?.keywords?.length');
  assert.ok(idx > 0);
  const chunk = source.slice(idx, idx + 200);
  assert.ok(/hasCondition/.test(chunk),
    'keyword warunkowy bez scope musi trafić do opisu — inaczej kafel pokazuje sam warunek („gdy ma licznik +1/+1” i tyle)');

  // Karty, których to dotyczy, faktycznie istnieją w bazie.
  const affected = ALL_CARDS.filter((c) => (c.abilities ?? []).some((a) => a.type === 'static'
    && a.keywords?.length && !a.scope && a.condition && Object.keys(a.condition).length));
  assert.ok(affected.length >= 4, 'test ma pilnować realnej rodziny kart');
});

test('M138/Z9: aura odbierająca keyword pokazuje treść („stwór traci: …”)', () => {
  const source = fs.readFileSync('src/table/render.js', 'utf8');
  assert.ok(/losesKeywords/.test(source),
    'render musi opisywać aury z losesKeywords — Grounded miał kafel bez ŻADNEJ treści reguł');
  const grounded = ALL_CARDS.find((c) => c.name === 'Grounded');
  assert.deepEqual(grounded.aura.losesKeywords, ['flying'], 'dane karty się nie zmieniły');
});

test('M138/#11: KAŻDE pole deskryptora aury ma opis w kaflu (strażnik dwustronny)', () => {
  const source = fs.readFileSync('src/table/render.js', 'utf8');
  const auraBlock = /const auraLine = aura\s*\?\s*\[([\s\S]*?)\]\s*\.filter/.exec(source);
  assert.ok(auraBlock, 'nie znaleziono bloku budującego opis aury');
  const described = auraBlock[1];

  // Pola czysto techniczne: nie niosą treści reguł dla gracza.
  const structural = new Set(['enchant', 'enchantType', 'chooseColor', 'keepOwnAttachmentsOnProtection']);
  const missing = [];
  for (const card of ALL_CARDS) {
    const aura = card.aura;
    if (!aura) continue;
    for (const [field, value] of Object.entries(aura)) {
      if (value == null || structural.has(field)) continue;
      if (Array.isArray(value) && value.length === 0) continue;
      if (!described.includes(`aura.${field}`)) missing.push(`${field} (${card.name})`);
    }
  }
  assert.deepEqual([...new Set(missing)], [],
    `deskryptor aury bez opisu — kafel pokaże samo „Enchantment — Aura”: ${[...new Set(missing)].join(', ')}`);
});

test('M138/Z10: zdolność keywordowa bez efektów ma opis, nie sam koszt', () => {
  const source = fs.readFileSync('src/table/render.js', 'utf8');
  assert.ok(/ABILITY_KEYWORD_LABELS/.test(source),
    'brak mapy etykiet dla zdolności keywordowych (Trestle Troll pokazywał gołe „{3}”)');
  const troll = ALL_CARDS.find((c) => c.name === 'Trestle Troll');
  const ability = troll.abilities.find((a) => a.keyword === 'regenerate');
  assert.ok(ability, 'dane karty: regenerate jako keyword zdolności');
  assert.equal((Array.isArray(ability.effect) ? ability.effect : []).length, 0,
    'to właśnie brak efektów sprawiał, że opis był pusty');
});

test('M138/Z10: koszt zdolności na kaflu zachowuje pipy kolorów', () => {
  const source = fs.readFileSync('src/table/render.js', 'utf8');
  const fn = /function costTextOf\(ability\) \{([\s\S]*?)\n\}/.exec(source);
  assert.ok(fn, 'brak costTextOf');
  assert.ok(/cost\.colors/.test(fn[1]),
    'costTextOf musi rozbijać koszt na generic + pipy — {1}{B}{G} pokazywane jako „{3}” sugeruje, że zapłaci dowolna mana (CR 202.1)');
  assert.ok(/NON_MANA_COST_LABELS/.test(fn[1]),
    'costTextOf musi używać wspólnej listy kosztów pozamanowych (inaczej kafel i przycisk znów się rozjadą)');
});

test('M138: describeAbility nie liczy kosztu po swojemu (jedno źródło prawdy)', () => {
  const source = fs.readFileSync('src/table/render.js', 'utf8');
  const fn = /function describeAbility\(ability, \{[\s\S]*?\n\}/.exec(source);
  assert.ok(fn, 'brak describeAbility');
  assert.ok(!/cost\.manaX \? '\{X\}' : \(cost\.mana \? /.test(fn[0]),
    'describeAbility miało TRZECIĄ kopię liczenia kosztu — ma wołać costTextOf (L28)');
});
