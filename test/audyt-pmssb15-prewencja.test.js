import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck, gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';

// PMSSB-15 (metoda M429) — audyt taktyczny prewencji/fog (prevent_*), 4 karty:
// Withstand / Revealing Wind / Inspire Awe / Ethersworn Shieldmage.
//
// Matryca wartości WŁAŚCICIELA (zgłoszenie B, kryterium wiążące):
//   „preventować u stworów które by lethal dostały albo u siebie jeśli
//   któryś z kreatur przeciwnika go zrani" + odpowiedź na dmg-czar
//   z lethalem — zysk maksimum = ratunek przed śmiercią w tym starciu,
//   zysk średni = chip, zysk 0/ujemny = nic nie da się zapobiec.
//
// Findingi (pomiar PRZED: /tmp/pmssb15-prewencja-przed.mjs):
//   F1 (L41): okna fog (M91 −300 / M236 −75 / +15) siedziały WYŁĄCZNIE
//     w cast_spell — rodzina darmowych rzutów (epic/rebound/suspend/
//     madness/exile) wyceniała flat 70, więc darmowy fog w własnej turze
//     zabijał własny atak (S07: 70 zamiast −230), a przed deklaracją
//     marnował się (S08: 70 zamiast −5).
//   F2 (skala): +15 płaskie — fog vs chip 1/1 = fog vs lethal 12@5hp = fog
//     vs 6 infect @8 poison (wszystkie 65). Właściciel: lethal-save to
//     „zysk największy".
//   F3 (wyciek): `prevent_combat_damage_except_enchanted` liczył pełną
//     moc napastników — Inspire Awe vs samych enchantment creatures
//     (leak 100%, nic nie zapobiega) = 53, rzucone! (S05).
//   F4 (Shieldmage): ETB flat 3 niezależnie od okna — odwrócona wartość:
//     bezsensowny main-phase (70.2) wypadał LEPIEJ niż flash-ratunek
//     własnego artifact-stwora z lethalem (66.6) (S09b/c).
//
// Anty-over-fix (M429): najsłabszy realny wariant = dawna wartość
// (chip = +15, own-turn = −300, wasted = −75, ETB-baza = 3); nowe wymiary
// to DOPŁATY (lethal-save, saved-creature) i kary wycieku (skala do mocy
// zapobiegalnej, pełny wyciek = wasted).
//
// CR (cytaty dosłowne w helperze fogWindowValue): 615.4 (prewencja tylko
// PRZED rozdaniem — DEBT), 615.6 + 702.90b (zapobiegane damage nie daje
// liczników trucizny — fog ratuje też zegar poison, 10 = śmierć CR 104.3d).

const REGISTRY = createCardRegistry();

function putSpell(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
    ...extra,
  });
  return state.objects.get(id);
}

function putCreature(state, id, controllerId, power, toughness, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 2,
    types: ['Creature'], subtypes: [], colors: [], abilities: [], keywords: [],
    ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function botTurn() {
  const state = createGameState({ seed: 15, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 12);
  for (let i = 0; i < 8; i++) putSpell(state, `lib${i}`, 'highland-game', 'p2', 'library');
  return state;
}

function foeCombat(state, { attackers, blockers = new Map(), blockedAttackers = new Set(), step = 'declare_blockers' } = {}) {
  state.turn = jumpToStep(state.turn, step, 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  state.combat = { attackingPlayerId: 'p1', attackers, blockers, blockedAttackers };
}

function decide(state, params = undefined) {
  const view = playerView(state, 'p2');
  const bot = createHeuristicBot({ seed: 99, ...(params ? { params } : {}) });
  const choice = bot.chooseCommand(view, {});
  const last = bot.trace().at(-1) ?? {};
  return { choice, options: last.options ?? [] };
}

function optionScore(options, cmd) {
  const found = options.find((o) => o.cmd === cmd);
  assert.ok(found, `brak opcji ${cmd} w: ${options.map((o) => o.cmd).join(' | ')}`);
  return found.score;
}

/** Wszystkie warianty danej komendy (np. resolve_epic_choice: done vs cast mają to samo cmd). */
function variantScores(options, cmd) {
  return options.filter((o) => o.cmd === cmd).map((o) => o.score);
}

// ---------------------------------------------------------------------------
// F1 (L41) — okna fog w rodzinie darmowych rzutów (flat 70 → helper).
// ---------------------------------------------------------------------------

test('PMSSB-15/F1: darmowy fog (epic) w MOJEJ turze przegrywa z done — nie zabija własnego ataku', () => {
  const state = botTurn();
  putSpell(state, 'w-ex', 'revealing-wind', 'p2', 'exile');
  putCreature(state, 'mine', 'p2', 3, 3);
  state.pendingEpicExperiment = {
    playerId: 'p2', sourceCardId: 'epic', exileIds: ['w-ex'], maxMV: 4, restorePriorityTo: 'p2',
  };
  const { choice, options } = decide(state);
  assert.equal(choice.type, 'resolve_epic_choice');
  assert.equal(choice.done, true, 'bot ma ODSTAWIĆ darmowy fog we własnej turze');
  // Baza 70 − 300 (M91, ta sama kara co w cast_spell — L41).
  assert.ok(variantScores(options, 'resolve_epic_choice').includes(-230));
});

test('PMSSB-15/F1: darmowy fog (epic) w turze wroga PRZED deklaracją przegrywa z done (M236)', () => {
  const state = botTurn();
  putSpell(state, 'w-ex', 'revealing-wind', 'p2', 'exile');
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  state.pendingEpicExperiment = {
    playerId: 'p2', sourceCardId: 'epic', exileIds: ['w-ex'], maxMV: 4, restorePriorityTo: 'p2',
  };
  const { choice, options } = decide(state);
  assert.equal(choice.done, true);
  // Baza 70 − 75 (M236 przedwczesne).
  assert.ok(variantScores(options, 'resolve_epic_choice').includes(-5));
});

test('PMSSB-15/F1: darmowy fog (epic) w oknie deklaracji z atakującymi — rzucenie wygrywa', () => {
  const state = botTurn();
  putSpell(state, 'w-ex', 'revealing-wind', 'p2', 'exile');
  putCreature(state, 'a1', 'p1', 3, 3);
  foeCombat(state, { attackers: ['a1'] });
  state.pendingEpicExperiment = {
    playerId: 'p2', sourceCardId: 'epic', exileIds: ['w-ex'], maxMV: 4, restorePriorityTo: 'p2',
  };
  const { choice, options } = decide(state);
  assert.equal(choice.done, undefined, 'wariant cast NIE jest done');
  assert.equal(choice.cardId, 'w-ex', 'fog w oknie z atakującymi ma być wzięty');
  // Baza 70 + chip 15 (pełna moc zapobiegalna) = 85.
  assert.ok(variantScores(options, 'resolve_epic_choice').includes(85));
});

// ---------------------------------------------------------------------------
// F2 (skala) — chip = dawna wartość; lethal-save (życie LUB poison) = dopłata.
// ---------------------------------------------------------------------------

test('PMSSB-15/F2 anty-over-fix: fog vs chip 1/1 zachowuje wartość historyczną (50+15)', () => {
  const state = botTurn();
  putSpell(state, 'w', 'revealing-wind', 'p2', 'hand');
  putCreature(state, 'chip', 'p1', 1, 1);
  foeCombat(state, { attackers: ['chip'] });
  const { choice, options } = decide(state);
  assert.deepEqual(choice, { type: 'cast_spell', playerId: 'p2', objectId: 'w', targets: [] });
  assert.equal(optionScore(options, 'cast_spell(w->)'), 65);
});

test('PMSSB-15/F2: fog ratujący bota z LETHALA — dopłata survivalowa (50+15+40=105)', () => {
  const state = botTurn();
  putSpell(state, 'w', 'revealing-wind', 'p2', 'hand');
  state.players.find((p) => p.id === 'p2').life = 5;
  putCreature(state, 'a1', 'p1', 4, 4);
  putCreature(state, 'a2', 'p1', 4, 4);
  putCreature(state, 'a3', 'p1', 4, 4);
  foeCombat(state, { attackers: ['a1', 'a2', 'a3'] });
  const { choice, options } = decide(state);
  assert.deepEqual(choice, { type: 'cast_spell', playerId: 'p2', objectId: 'w', targets: [] });
  assert.equal(optionScore(options, 'cast_spell(w->)'), 105);
});

test('PMSSB-15/F2: fog vs LETHAL przez zegar poison (infect @8 z 10) — ta sama dopłata survivalowa', () => {
  const state = botTurn();
  putSpell(state, 'w', 'revealing-wind', 'p2', 'hand');
  state.players.find((p) => p.id === 'p2').poison = 8;
  putCreature(state, 'inf1', 'p1', 3, 3, { keywords: ['infect'] });
  putCreature(state, 'inf2', 'p1', 3, 3, { keywords: ['infect'] });
  foeCombat(state, { attackers: ['inf1', 'inf2'] });
  const { choice, options } = decide(state);
  assert.deepEqual(choice, { type: 'cast_spell', playerId: 'p2', objectId: 'w', targets: [] });
  // CR 702.90b + 615.6: zapobiegane damage nie daje liczników — ratunek z 10.
  assert.equal(optionScore(options, 'cast_spell(w->)'), 105);
});

test('PMSSB-15/F2: fog ratujący mojego blokera z lethalem — dopłata za ocalone ciało (50+15+12)', () => {
  const state = botTurn();
  putSpell(state, 'w', 'revealing-wind', 'p2', 'hand');
  putCreature(state, 'my-blocker', 'p2', 1, 1);
  putCreature(state, 'a1', 'p1', 3, 3);
  foeCombat(state, {
    attackers: ['a1'], blockers: new Map([['a1', ['my-blocker']]]), blockedAttackers: new Set(['a1']),
  });
  const { options } = decide(state);
  // Twarz bezpieczna (zablokowany) → brak lethal-save; ciało ratowane +12.
  assert.equal(optionScore(options, 'cast_spell(w->)'), 77);
});

// ---------------------------------------------------------------------------
// F3 (wyciek Inspire Awe) — „except by enchanted/enchantment creatures".
// ---------------------------------------------------------------------------

test('PMSSB-15/F3: Inspire Awe vs samych enchantment creatures (leak 100%) — NIE rzucać', () => {
  const state = botTurn();
  putSpell(state, 'w', 'inspire-awe', 'p2', 'hand');
  putCreature(state, 'ench1', 'p1', 4, 4, { types: ['Creature', 'Enchantment'] });
  putCreature(state, 'ench2', 'p1', 4, 4, { types: ['Creature', 'Enchantment'] });
  foeCombat(state, { attackers: ['ench1', 'ench2'] });
  const { choice, options } = decide(state);
  assert.notEqual(choice.type, 'cast_spell', 'fog, który nic nie zapobiega, nie może być rzucony');
  // Baza 50 − 12 (scry-rider M218/4) − 75 (wasted) = −37 < pass 0.
  assert.equal(optionScore(options, 'cast_spell(w->)'), -37);
});

test('PMSSB-15/F3: leak 50% skaluje bazę do mocy zapobiegalnej (15*3/8)', () => {
  const state = botTurn();
  putSpell(state, 'w', 'inspire-awe', 'p2', 'hand');
  putCreature(state, 'ench', 'p1', 5, 5, { types: ['Creature', 'Enchantment'] });
  putCreature(state, 'plain', 'p1', 3, 3);
  foeCombat(state, { attackers: ['ench', 'plain'] });
  const { options } = decide(state);
  // 50 − 12 (scry-rider) + 15*(3/8) = 43.625 — mniej niż czysty fog (65).
  assert.equal(optionScore(options, 'cast_spell(w->)'), 43.625);
});

test('PMSSB-15/F3: stwór obrandowany aurą też wymyka się wyjątkowi (attachedTo z widoku)', () => {
  const state = botTurn();
  putSpell(state, 'w', 'inspire-awe', 'p2', 'hand');
  // Wróg atakuje jednym stworzeniem obrandowanym aurą — leak 100%.
  putCreature(state, 'branded', 'p1', 3, 3);
  addObject(state, {
    id: 'aura', instanceId: 'i-aura', cardId: 'x-aura', controllerId: 'p1', zone: 'battlefield',
    kind: 'enchantment', power: null, toughness: null, manaCost: 2, abilities: [], keywords: [],
    subtypes: ['Aura'], types: ['Enchantment'], aura: { enchant: 'creature' },
  });
  attachAuraToCreature(state, 'aura', 'branded');
  foeCombat(state, { attackers: ['branded'] });
  const { choice, options } = decide(state);
  assert.notEqual(choice.type, 'cast_spell');
  assert.equal(optionScore(options, 'cast_spell(w->)'), -37);
});

// ---------------------------------------------------------------------------
// F4 (Ethersworn Shieldmage) — okno flash + ETB „do artifact-stworów".
// ---------------------------------------------------------------------------

test('PMSSB-15/F4: Shieldmage — flash-ratunek własnego artifact-stwora wygrywa z pustym main-phase', () => {
  // Okno: artifact-bloker ginie w walce wroga (ratunek z lethalem).
  const save = botTurn();
  putSpell(save, 'sh', 'ethersworn-shieldmage', 'p2', 'hand');
  putCreature(save, 'bot-art', 'p2', 2, 2, { types: ['Artifact', 'Creature'] });
  putCreature(save, 'foe', 'p1', 4, 4);
  foeCombat(save, {
    attackers: ['foe'], blockers: new Map([['foe', ['bot-art']]]), blockedAttackers: new Set(['foe']),
  });
  const saved = decide(save);

  // Kontrola: ta sama ręka bez artifact-stworów (ETB = 0).
  const empty = botTurn();
  putSpell(empty, 'sh', 'ethersworn-shieldmage', 'p2', 'hand');
  putCreature(empty, 'foe', 'p1', 4, 4);
  foeCombat(empty, { attackers: ['foe'] });
  const emptyRun = decide(empty);

  const saveScore = optionScore(saved.options, 'cast_permanent(sh)');
  const emptyScore = optionScore(emptyRun.options, 'cast_permanent(sh)');
  // Dawniej odwrócona kolejność (66.6 ratunek < 70.2 pustka) — finding F4.
  assert.ok(saveScore > emptyScore, `ratunek (${saveScore}) ma wygrywać z pustką (${emptyScore})`);
  assert.ok(saveScore >= 75, `ratunek ma być zdecydowany (>=75), jest ${saveScore}`);
  assert.ok(emptyScore <= 68, `pustka bez artifact-stworów ma tracić ETB (<=68), jest ${emptyScore}`);
});

test('PMSSB-15/F4: moje atakujące artifact-stwory z lethalem też ratują ETB (moja tura)', () => {
  const state = botTurn();
  putSpell(state, 'sh', 'ethersworn-shieldmage', 'p2', 'hand');
  putCreature(state, 'bot-art-att', 'p2', 2, 2, { types: ['Artifact', 'Creature'] });
  putCreature(state, 'foe-block', 'p1', 4, 4);
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  state.combat = {
    attackingPlayerId: 'p2', attackers: ['bot-art-att'],
    blockers: new Map([['bot-art-att', ['foe-block']]]), blockedAttackers: new Set(['bot-art-att']),
  };
  const { options } = decide(state);
  const score = optionScore(options, 'cast_permanent(sh)');
  // Baza okna 3 + 12 za ocalone ciało (atakujący artifact przeżywa — CR 615.6).
  assert.ok(score >= 73, `ETB z ratunkiem atakującego artifactu (>=73), jest ${score}`);
});

// ---------------------------------------------------------------------------
// F5 (koszt, S11) — Inspire Awe MV4 vs Revealing Wind MV3 nie remisują.
// ---------------------------------------------------------------------------

test('PMSSB-15/F5: w tym samym oknie lethal fog MV4 i fog MV3 mają różne wartości (scry-rider)', () => {
  const state = botTurn();
  putSpell(state, 'rw', 'revealing-wind', 'p2', 'hand');
  putSpell(state, 'ia', 'inspire-awe', 'p2', 'hand');
  state.players.find((p) => p.id === 'p2').life = 5;
  putCreature(state, 'a1', 'p1', 4, 4);
  putCreature(state, 'a2', 'p1', 4, 4);
  putCreature(state, 'a3', 'p1', 4, 4);
  foeCombat(state, { attackers: ['a1', 'a2', 'a3'] });
  const { choice, options } = decide(state);
  const rwScore = optionScore(options, 'cast_spell(rw->)');
  const iaScore = optionScore(options, 'cast_spell(ia->)');
  assert.equal(rwScore, 105, 'fog MV3: 50+15+40');
  // IA: 50−12 (scry-rider M218/4) + 15 + 40 = 93 — remis z tańszym byłby kłamstwem.
  assert.ok(iaScore > 0 && iaScore < rwScore, `MV4 (${iaScore}) vs MV3 (${rwScore}) — bez remisu`);
  assert.equal(choice.objectId, 'rw', 'przy ograniczonej wartości bot bierze tańszy fog');
});

// ---------------------------------------------------------------------------
// Anty-over-fix + pokrętła (parametr = jedyne miejsce z wartością).
// ---------------------------------------------------------------------------

test('PMSSB-15/anty-over-fix: okna historyczne nietknięte (own-turn −250 pass, przedwczesne −25 pass)', () => {
  const own = botTurn();
  putSpell(own, 'w', 'revealing-wind', 'p2', 'hand');
  const ownRun = decide(own);
  assert.equal(ownRun.choice.type, 'pass_priority');
  assert.equal(optionScore(ownRun.options, 'cast_spell(w->)'), -250); // 50−300

  const early = botTurn();
  putSpell(early, 'w', 'revealing-wind', 'p2', 'hand');
  early.turn = jumpToStep(early.turn, 'main', 'p1');
  early.turn.activePlayerId = 'p1';
  early.turn.priorityPlayerId = 'p2';
  putCreature(early, 'foe', 'p1', 3, 3);
  const earlyRun = decide(early);
  assert.equal(earlyRun.choice.type, 'pass_priority');
  assert.equal(optionScore(earlyRun.options, 'cast_spell(w->)'), -25); // 50−75
});

test('PMSSB-15/pokrętła: fogWindowLethalSaveValue = 0 zdejmuje dopłatę survivalową (jedyne miejsce wartości)', () => {
  const build = () => {
    const state = botTurn();
    putSpell(state, 'w', 'revealing-wind', 'p2', 'hand');
    state.players.find((p) => p.id === 'p2').life = 5;
    putCreature(state, 'a1', 'p1', 4, 4);
    putCreature(state, 'a2', 'p1', 4, 4);
    putCreature(state, 'a3', 'p1', 4, 4);
    foeCombat(state, { attackers: ['a1', 'a2', 'a3'] });
    return state;
  };
  const base = decide(build());
  assert.equal(optionScore(base.options, 'cast_spell(w->)'), 105);
  const tweaked = decide(build(), { ...DEFAULT_HEURISTIC_PARAMS, fogWindowLethalSaveValue: 0 });
  assert.equal(optionScore(tweaked.options, 'cast_spell(w->)'), 65);
});

// ---------------------------------------------------------------------------
// L41 — jedno źródło prawdy: cast_spell i darmowe rzuty liczą TO samo okno.
// ---------------------------------------------------------------------------

test('PMSSB-15/L41: kara własnej tury identyczna w cast_spell i epic (−300 w obu lejkach)', () => {
  const cast = botTurn();
  putSpell(cast, 'w', 'revealing-wind', 'p2', 'hand');
  const castRun = decide(cast);
  const castScore = optionScore(castRun.options, 'cast_spell(w->)'); // 50−300 = −250

  const epic = botTurn();
  putSpell(epic, 'w-ex', 'revealing-wind', 'p2', 'exile');
  epic.pendingEpicExperiment = {
    playerId: 'p2', sourceCardId: 'epic', exileIds: ['w-ex'], maxMV: 4, restorePriorityTo: 'p2',
  };
  const epicRun = decide(epic);
  const epicScore = Math.min(...variantScores(epicRun.options, 'resolve_epic_choice')); // 70−300 = −230

  assert.equal(castScore + 300, 50 - 300 + 300);
  assert.equal(epicScore + 300, 70);
  // Oba lejki aplikują TĘ SAMĄ karę okna (różnica = tylko baza rzutu).
  assert.equal((castScore + 300) - (epicScore + 300), 50 - 70);
});

// ---------------------------------------------------------------------------
// Audyt PR #144 (2026-09-29) — czytniki stosu w rodzinie prewencji.
// F1 (L1): `preventDamageThisTurnValue` czytał `view.pendingEffects` — pole,
//   którego playerView NIGDY nie emituje (jedyne wystąpienie w repo) — więc
//   „burn na stosie" w oknie Shieldmage'a liczył zawsze 0.
// F2 (L41/L72): `incomingDamageOnStack` i `permanentDoomedThisTurn` sumowały
//   wyłącznie `spell` — zdolność na stosie (activated/triggered, deskryptor
//   w `abilityEffects`) była dla tarczy i dla „skazany w tej turze"
//   niewidzialna. Wszystkie trzy miejsca czytają teraz wspólny
//   `stackEntryEffects` (mutacje: F1-M przywraca martwy odczyt, F2-M wraca
//   do czytnika `spell`-only).
// ---------------------------------------------------------------------------

/** Realna aktywacja: Ballista Watcher ({3}{R}, {T}: 1 obrażenie) w cel `targetId`. */
function foePingOnStack(state, targetId) {
  const [{ objectId, ...data }] = createCardDeck({
    cardIds: ['ballista-watcher'], ownerId: 'p1', registry: REGISTRY,
  });
  addObject(state, { ...data, id: 'foe-ping', instanceId: 'i-foe-ping', controllerId: 'p1', zone: 'battlefield' });
  state.objects.set('foe-ping', Object.freeze({ ...state.objects.get('foe-ping'), summoningSickness: false, tapped: false }));
  addMana(state, 'p1', 4);
  state.turn.priorityPlayerId = 'p1';
  const result = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'foe-ping', abilityIndex: 0, targets: [targetId],
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  state.turn.priorityPlayerId = 'p2';
  return state;
}

test('Audyt #144/F2: ping AKTYWOWANEJ zdolności na stosie waży tyle, co czar (L41)', () => {
  const clean = botTurn();
  putSpell(clean, 'w', 'withstand', 'p2', 'hand');
  putCreature(clean, 'mine', 'p2', 1, 1);
  const base = optionScore(decide(clean).options, 'cast_spell(w->mine)');

  const spell = botTurn();
  putSpell(spell, 'w', 'withstand', 'p2', 'hand');
  putCreature(spell, 'mine', 'p2', 1, 1);
  const bolt = putSpell(spell, 'bolt', 'shock', 'p1', 'stack');
  spell.objects.set('bolt', Object.freeze({ ...bolt, chosenTargets: ['mine'] }));
  const spellScore = optionScore(decide(spell).options, 'cast_spell(w->mine)');

  const ability = foePingOnStack((() => {
    const s = botTurn();
    putSpell(s, 'w', 'withstand', 'p2', 'hand');
    putCreature(s, 'mine', 'p2', 1, 1);
    return s;
  })(), 'mine');
  const abilityScore = optionScore(decide(ability).options, 'cast_spell(w->mine)');

  // 61 = baza; +16 dopłaty ratunkowej, gdy damage realnie leci w 1/1.
  assert.equal(base, 61, 'pusty stos');
  assert.equal(spellScore, 77, 'czar z damage na stosie (bez dryfu)');
  assert.equal(abilityScore, 77, 'zdolność z damage na stosie — ten sam czytnik (było 61)');
});

test("Audyt #144/F1: burn na stosie podnosi okno ETB Shieldmage'a (martwy pendingEffects)", () => {
  const build = (ping) => {
    const s = botTurn();
    putSpell(s, 'sh', 'ethersworn-shieldmage', 'p2', 'hand');
    putCreature(s, 'bot-art', 'p2', 2, 2, { types: ['Artifact', 'Creature'] });
    if (ping) {
      const bolt = putSpell(s, 'bolt', 'shock', 'p1', 'stack');
      s.objects.set('bolt', Object.freeze({ ...bolt, chosenTargets: ['bot-art'] }));
    }
    return optionScore(decide(s).options, 'cast_permanent(sh)');
  };
  const without = build(false);
  const withBurn = build(true);
  assert.equal(without, 66.60090000000001, 'baza okna bez stosu (bez dryfu)');
  assert.equal(withBurn, 77.40090000000001, 'burn na stosie dolicza ocalone ciało (było 66.6 — pole martwe)');
  assert.ok(withBurn > without + 10, 'odpowiedź na burn musi realnie kupować ETB');
});

test('Audyt #144/F2b: permanentDoomedThisTurn widzi zdolność na stosie (L72)', () => {
  // Kheru Dreadmaw ({1}{G}, poświęć inne stworzenie: zyskaj życie = wytrzymałość)
  // na 1/1 z TMC 3. Skazany w tej turze = poświęcenie praktycznie darmowe
  // (M236/2) — liczy się też śmierć od pinga ZDOLNOŚCI na stosie, nie tylko
  // czaru (wspólny czytnik `stackEntryEffects`).
  const build = (ping) => {
    const s = botTurn();
    putCreature(s, 'sac', 'p2', 1, 1, { manaCost: 3 });
    const [{ objectId, ...dread }] = createCardDeck({ cardIds: ['kheru-dreadmaw'], ownerId: 'p2', registry: REGISTRY });
    addObject(s, { ...dread, id: 'dread', instanceId: 'i-dread', controllerId: 'p2', zone: 'battlefield' });
    s.objects.set('dread', Object.freeze({ ...s.objects.get('dread'), summoningSickness: false, tapped: false }));
    if (ping) foePingOnStack(s, 'sac');
    return optionScore(decide(s).options, 'activate_ability(dread#0)');
  };
  const clean = build(false);
  const pinged = build(true);
  // PMSSB-34/B: koszt many zdolności Kheru Dreadmaw ({1}{G} → mana 2) to −2.
  assert.equal(clean, -18, 'bez zagrożenia: kara za marnotrawstwo ciała + koszt {2}');
  assert.equal(pinged, 1, 'ping zdolności na stosie = stwór skazany, poświęcenie darmowe (było −16, potem −18)');
  assert.ok(pinged > clean, 'ryzyko śmierci z pinga musi zmieniać decyzję');
});
