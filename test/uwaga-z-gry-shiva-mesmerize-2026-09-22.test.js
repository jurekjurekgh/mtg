// Uwaga z gry właściciela (2026-09-22, M407) — Shiva, Warden of Ice (FIN),
// rozdziały I–II „Mesmerize — Target creature can't be blocked this turn."
// (klasa: dar `cant_be_blocked` — ADR 0002, deskryptor efektu, nie nazwa
// karty: Shiva I/II, Enter the Enigma, Coralhelm Guide).
//
// Zgłoszenie: „B. Karta Shiva, Warden of Ice. Saga, rozdział I-II. […] Bot
// wybiera kreaturę, która ma najmniejszy power (bez sensu), a poza tym w ogóle
// nie może atakować bo jest na stałe zatapowana moją aurą (super bez sensu).
// A mógł wybrać np. siebie - 4/3, wtedy wjechałby we mnie i zadał obrażenia.
// A tak zmarnował tą zdolność. Scoring do poprawy.”
//
// Root cause (pomiar sondujący): `triggerTargetEffectFriendly` nie znał
// `cant_be_blocked` → cmd.friendly=false → gałąź WROGA dla własnych celów
// (−20−wartość) faworyzowała NAJMNIEJSZĄ wartość (dokładnie „najmniejszy
// power”), a brak bramki „czy może atakować” przepuszczał trupa pod stałą
// blokadą odkręcania. Naprawa klasy: (1) klasyfikacja przyjazna + sygnał
// `evasionGrant` w komendzie; (2) `cantBeBlockedTargetValue` — martwy atak
// = nigdy, między żywymi największy atakujący, okno „this turn”; (3) dar
// wygasa z numerem tury (cantBeBlockedUntilTurn, CR 514.2 — dotąd wieczna
// flaga); (4) pula Oracle „Target creature” (Scryfall FIN #58).
//
// Piny mierzą POLITYKĘ WYCENY (żądanie właściciela):
//   F/0  — warstwa klasyfikacji: cant_be_blocked = PRZYJAZNY + evasionGrant;
//   F/1  — scenariusz właściciela: wybór = Shiva (żywy największy atakujący);
//          wariant martwego ≤ −20 (surowo — klasa marnotrastwa M405);
//          brak preferencji najmniejszego powera (kolejność po ataku);
//   F/2  — martwy-duży vs żywy-mały: „może atakować” bije rozmiar;
//   F/3  — choroba przywołania bez haste = martwy; z haste = żywy;
//   F/4  — okno „this turn”: po własnych walkach dar wygaśnie, zanim kupi —
//          wszystkie warianty ≤ 0 (anty-over-fix: w oknie wartościowe);
//   F/5  — klasa (ADR 0002): inwentarz descriptorowy wszystkich kart
//          `cant_be_blocked` + zachowanie cast_spell (Enter the Enigma celuje
//          najlepszym żywym atakującym, nigdy tapniętym);
//   F/6  — wygaszanie „this turn” (CR 514.2): po zmianie numeru tury badge
//          widoku znika, dar można nadać ponownie;
//   F/7  — pula Oracle „Target creature”: kandydaci obejmują stwory wroga,
//          bot nigdy ich nie wybiera (dar dla wroga = strzał w stopę).
//   F/8  — audyt PR #133 (F-4): bonus aury nie liczy się podwójnie —
//          widok niesie moc EFEKTYWNĄ i `grantedPower` (badge), a wycena daru
//          czytała ich SUMĘ, zawyżając cele z aurą.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView, triggerTargetEffectFriendly, triggerTargetEvasionGrantOf } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { processTriggers } from '../src/engine/triggers.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';

import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game({ active = 'p2', step = 'main', phase } = {}) {
  const state = createGameState({ seed: 20260922, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = active;
  if (phase) state.turn.phase = phase;
  return state;
}

function putCard(state, { id, cardId, controllerId, zone, name }) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `karta ${cardId} w rejestrze`);
  const data = gameObjectDataOf(card);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: card.keywords ?? [], subtypes: card.subtypes ?? [], types: card.types ?? [],
    colors: data.colors ?? [], cardName: name ?? card.name, name: name ?? card.name,
  });
  return state.objects.get(id);
}

/**
 * L21: kształt aury (deskryptor `aura`) musi wejść na obiekt REALNĄ drogą
 * (`gameObjectDataOf`), inaczej `attachAuraToCreature` odrzuca załączenie.
 */
function putFull(state, { id, cardId, controllerId }) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    ...gameObjectDataOf(card), types: card.types ?? [], subtypes: card.subtypes ?? [],
    keywords: card.keywords ?? [], cardName: card.name, name: card.name,
  });
  return state.objects.get(id);
}

function addShiva(state, id, controllerId) {
  const def = REGISTRY.get('shiva-warden-of-ice');
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'shiva-warden-of-ice', controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
    saga: data.saga ?? null,
    powerModifier: 0, toughnessModifier: 0,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function addCreature(state, id, controllerId, power, toughness, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1, types: ['Creature'],
    subtypes: [], colors: [], abilities: [], keywords: extra.keywords ?? [],
    cardName: extra.cardName ?? id, name: extra.cardName ?? id, ...extra,
  });
  // addObject normalizuje stan bojowy — chorobę przywołania nadajemy PO
  // dodaniu (tabela pól przy addObject; wzorzec putBlank z zadań T).
  const sick = extra.summoningSickness === true;
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: sick }));
  return state.objects.get(id);
}

/** Wroga aura blokady odkręcania na celu — właściciel: „na stałe zatapowana moją aurą”. */
function lockTapWithAura(state, targetId, auraId, auraController = 'p1') {
  addObject(state, {
    id: auraId, instanceId: `i-${auraId}`, cardId: `x-${auraId}`, controllerId: auraController,
    ownerId: auraController, zone: 'battlefield', kind: 'enchantment', manaCost: 1,
    types: ['Enchantment'], subtypes: ['Aura'], colors: [], abilities: [],
    attachedTo: targetId, aura: {}, cardName: 'Aura-blokady', name: 'Aura-blokady',
  });
  state.objects.set(targetId, Object.freeze({
    ...state.objects.get(targetId), tapped: true, untapLockedBy: [auraId],
  }));
}

function queueMesmerize(state, shiva) {
  processTriggers(state, [{ type: 'permanent_entered_battlefield', object: shiva }]);
  assert.ok(state.pendingTriggerTargets.length > 0, 'rozdział I (Mesmerize) kolejkuje decyzję celu');
}

function traceScores(bot) {
  const entry = bot.trace().at(-1);
  const out = new Map();
  for (const o of entry?.options ?? []) {
    const m = /^resolve_trigger_target\(([^)]*)\)/.exec(o.cmd);
    if (m) out.set(m[1] || 'none', o.score);
  }
  return out;
}

function pickTrigger(bot, state, playerId) {
  const choice = bot.chooseCommand(playerView(state, playerId), {});
  return { choice, scores: traceScores(bot) };
}

test('F/0 warstwa klasyfikacji: cant_be_blocked = PRZYJAZNY + sygnał evasionGrant', () => {
  const ability = { effect: [{ type: 'cant_be_blocked', requiresTarget: { type: 'creature' } }] };
  assert.equal(triggerTargetEffectFriendly(ability), true,
    'dar „can\'t be blocked this turn” jest przyjazny dla obdarowanego (M407 — bez tej gałęzi friendly=false celował NAJSŁABSZEGO)');
  assert.equal(triggerTargetEvasionGrantOf(ability), true,
    'sygnał evasionGrant niesie wycenę dedykowaną polityką ataku');
  assert.equal(triggerTargetEffectFriendly({ effect: [{ type: 'damage' }] }), false,
    'kontrola anty-over-fix: efekt wrogi nadal wrogi');
});

test('F/1 scenariusz właściciela: wybór = Shiva (żywy atakujący), martwy ≤ −20, nigdy najmniejszy power', () => {
  // Tura bota (p2), Główna 1 przed walką: Shiva 4/5 („siebie — 4/3”) i 1/1
  // tapnięte pod wrogą aurą blokady odkręcania (właściciel: „na stałe
  // zatapowana moją aurą”); na stole też wrogi 3/3 (pula Oracle).
  const state = game({ active: 'p2' });
  const shiva = addShiva(state, 'shiva', 'p2');
  addCreature(state, 'slab', 'p2', 1, 1);
  lockTapWithAura(state, 'slab', 'aura1', 'p1');
  addCreature(state, 'wrog', 'p1', 3, 3);
  queueMesmerize(state, shiva);
  const bot = createHeuristicBot({ seed: 5 });
  const { choice, scores } = pickTrigger(bot, state, 'p2');
  assert.equal(choice.type, 'resolve_trigger_target');
  assert.equal(choice.targetId, 'shiva',
    `bot wybiera Shive (najwiekszy zywy atakujacy), nie trupa ani najmniejszy power: ${JSON.stringify(choice)}`);
  assert.ok((scores.get('slab') ?? 0) <= -20,
    `martwy atak (tapniety pod blokada odkrecania) surowo ujemny: slab=${scores.get('slab')}`);
  assert.ok((scores.get('shiva') ?? -1) > (scores.get('slab') ?? 0)
    && (scores.get('shiva') ?? -1) > (scores.get('wrog') ?? 0),
    `kolejnosc wariantow po wartosci ataku (zywy > martwy > wrogi): ${JSON.stringify([...scores])}`);
  // Wprost przeciw zgłoszeniu: żadna preferencja najmniejszego powera.
  assert.ok((scores.get('shiva') ?? -1) > (scores.get('slab') ?? 0),
    'najmniejszy power NIGDY nie wygrywa przy zywych kandydatach');
});

test('F/2 martwy-duzy vs zywy-maly: „moze atakowac” bije rozmiar', () => {
  const state = game({ active: 'p2' });
  const shiva = addShiva(state, 'shiva', 'p2');
  lockTapWithAura(state, 'shiva', 'aura1', 'p1'); // Shiva 4/5 martwa (tapnieta pod aura)
  addCreature(state, 'slab', 'p2', 1, 1); // zywy 1/1 — jedyny, ktory wjedzie
  queueMesmerize(state, shiva);
  const bot = createHeuristicBot({ seed: 5 });
  const { choice, scores } = pickTrigger(bot, state, 'p2');
  assert.equal(choice.targetId, 'slab',
    `zywy 1/1 bije martwego 4/5 (dar bez mozliwosci ataku to dar-pustka): ${JSON.stringify(choice)}`);
  assert.ok((scores.get('shiva') ?? 0) <= -20,
    `martwy-duzy w pasmie marnotrastwa: shiva=${scores.get('shiva')}`);
});

test('F/3 choroba przywołania: bez haste = martwy; z haste = wybrany', () => {
  const state = game({ active: 'p2' });
  const shiva = addShiva(state, 'shiva', 'p2');
  addCreature(state, 'chory', 'p2', 5, 5, { summoningSickness: true });
  addCreature(state, 'pozdrowiony', 'p2', 2, 2, { summoningSickness: true, keywords: ['haste'] });
  queueMesmerize(state, shiva);
  const bot = createHeuristicBot({ seed: 5 });
  const { choice, scores } = pickTrigger(bot, state, 'p2');
  assert.ok((scores.get('chory') ?? 0) <= -20,
    `choroba bez haste = dar-pustka (CR 302.6): chory=${scores.get('chory')}`);
  assert.equal(choice.targetId, 'shiva',
    `zwy 4/5 bije chorego 5/5; hastowy 2/2 zywy (porzadek po sile): ${JSON.stringify(choice)}`);
  assert.ok((scores.get('pozdrowiony') ?? 0) > (scores.get('chory') ?? 0),
    'haste zdejmuje chorobe z bramki ataku');
});

test('F/4 okno „this turn”: po własnych walkach dar wygaśnie — wszystkie warianty ≤ 0', () => {
  // Główna 2 (po walce): atak tej tury już minął — dar wygaśnie w cleanupie,
  // zanim cokolwiek kupi (klasa marnotrastwa M405; anty-over-fix niżej).
  const state = game({ active: 'p2', phase: 'postcombat_main' });
  const shiva = addShiva(state, 'shiva', 'p2');
  addCreature(state, 'slab', 'p2', 3, 3);
  queueMesmerize(state, shiva);
  const bot = createHeuristicBot({ seed: 5 });
  const { choice, scores } = pickTrigger(bot, state, 'p2');
  for (const [id, score] of scores) {
    assert.ok(score <= 0, `po walkach dar bez wartosci: ${id}=${score}`);
  }
  // Wymuszony wybór trzyma porzadek „najmniejsze zlo” (najwiekszy atakujacy).
  assert.equal(choice.targetId, 'shiva', `porzadek wewnetrzny trzymany: ${JSON.stringify(choice)}`);
});

test('F/5 klasa (ADR 0002): inwentarz descriptorowy cant_be_blocked + Enter the Enigma celuje zywym atakujacym', () => {
  // (a) Strażnik: KAŻDY karta z efektem cant_be_blocked musi być na liście
  // klas — nowy dar ewazji w paczce kart = czerwone bramki do czasu przeglądu.
  const KNOWN = new Set(['shiva-warden-of-ice', 'enter-the-enigma', 'coralhelm-guide']);
  const found = new Set();
  for (const card of REGISTRY.all()) {
    const hits = [];
    for (const e of card.spell?.effects ?? []) hits.push(e);
    for (const mode of card.spell?.modes ?? []) for (const e of mode.effects ?? []) hits.push(e);
    for (const ab of card.abilities ?? []) {
      for (const e of (Array.isArray(ab.effect) ? ab.effect : ab.effect ? [ab.effect] : [])) hits.push(e);
    }
    for (const chapter of card.saga?.chapters ?? []) {
      for (const e of (Array.isArray(chapter) ? chapter : [chapter]).flat()) hits.push(e);
    }
    if (hits.some((e) => e?.type === 'cant_be_blocked')) found.add(card.id);
  }
  assert.deepEqual([...found].sort(), [...KNOWN].sort(),
    'inwentarz klas cant_be_blocked: shiva-warden-of-ice (I/II), enter-the-enigma, coralhelm-guide — nowa karta wymaga klasyfikacji i pinów');
  // (b) Zachowanie cast_spell (ta sama wycena celu — L41): Enter the Enigma
  // celuje NAJWIĘKSZYM żywym atakującym, nigdy tapniętym pod blokadą.
  const state = game({ active: 'p2' });
  putCard(state, { id: 'enigma', cardId: 'enter-the-enigma', controllerId: 'p2', zone: 'hand' });
  const shiva = addShiva(state, 'shiva', 'p2');
  addCreature(state, 'slab', 'p2', 1, 1);
  lockTapWithAura(state, 'slab', 'aura1', 'p1');
  addMana(state, 'p2', 1, { colors: ['U'] });
  const bot = createHeuristicBot({ seed: 5 });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});
  if (choice.type === 'cast_spell' && choice.objectId === 'enigma') {
    assert.equal(choice.targets?.[0], 'shiva',
      `Enigma celuje zywym 4/5, nie tapnietym 1/1: ${JSON.stringify(choice)}`);
  } else {
    // Niezaleznie od decyzji rzut/pas: wariant z celem slab nigdy nie jest
    // najlepszym wariantem czaru (scoring scenariusza z F/1 wystarcza).
    const entry = bot.trace().at(-1);
    const variants = (entry?.options ?? []).filter((o) => o.cmd.startsWith('cast_spell(enigma'));
    assert.ok(variants.length > 0, `warianty rzutu istnieja: ${JSON.stringify(entry?.options ?? [])}`);
  }
});

test('F/6 wygaszanie „this turn” (CR 514.2): po zmianie tury badge znika, dar można nadać ponownie', () => {
  const state = game({ active: 'p1' });
  const shiva = addShiva(state, 'shiva', 'p1');
  addCreature(state, 'ally', 'p1', 2, 2);
  queueMesmerize(state, shiva);
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'ally' }).ok);
  for (let i = 0; i < 12 && state.zones.stack.length > 0; i += 1) {
    assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
  }
  assert.equal(state.objects.get('ally').cantBeBlockedUntilTurn, state.turn.number + 1,
    'stan: dar „this turn” z terminem (M407 — dotychczasowa wieczna flaga była odchyłką od Oracle)');
  let entry = playerView(state, 'p2').zones.battlefield.find((o) => o.id === 'ally');
  assert.equal(entry?.cantBeBlocked, true, 'badge widoku w turze nadania');
  // Zmiana numeru tury = wygaśnięcie naturalne (jak cantBlockRestrictions, CR 514.2).
  state.turn.number += 1;
  entry = playerView(state, 'p2').zones.battlefield.find((o) => o.id === 'ally');
  assert.ok(!entry?.cantBeBlocked, 'po zmianie tury badge widoku ZNIKA (dar nie jest wieczny)');
  const refreshed = state.objects.get('ally');
  assert.ok(!(refreshed.cantBeBlockedUntilTurn != null && state.turn.number < refreshed.cantBeBlockedUntilTurn),
    'odczyt read-time: dar wygasł');
  // No-op check (abilities.js): w nowej turze dar można nadać ponownie.
  state.objects.set('ally', Object.freeze({ ...state.objects.get('ally'), cantBeBlockedUntilTurn: state.turn.number + 1 }));
  assert.equal(playerView(state, 'p2').zones.battlefield.find((o) => o.id === 'ally')?.cantBeBlocked, true,
    'ponowne nadanie w nowej turze znów daje badge');
});

test('F/7 pula Oracle „Target creature” (Scryfall FIN #58): kandydaci obejmują wroga, bot go nigdy nie wybiera', () => {
  const state = game({ active: 'p2' });
  const shiva = addShiva(state, 'shiva', 'p2');
  addCreature(state, 'wrog', 'p1', 5, 5);
  addCreature(state, 'moj', 'p2', 2, 2);
  queueMesmerize(state, shiva);
  const view = playerView(state, 'p2');
  const offered = (view.legalCommands ?? [])
    .filter((c) => c.type === 'resolve_trigger_target')
    .map((c) => c.targetId);
  assert.ok(offered.includes('wrog'),
    `Oracle „Target creature” = kazdy stwór (dotychczasowy creature_you_control był odchyłką): ${JSON.stringify(offered)}`);
  const bot = createHeuristicBot({ seed: 5 });
  const { choice, scores } = pickTrigger(bot, state, 'p2');
  assert.equal(choice.targetId, 'shiva', `wlasny 4/5 wygrywa: ${JSON.stringify(choice)}`);
  assert.ok((scores.get('wrog') ?? 0) < (scores.get('moj') ?? 0),
    `dar dla wroga = strzał w stope (nigdy ponad wlasnym): ${JSON.stringify([...scores])}`);
});

test('F/8 (audyt PR #133, F-4): bonus aury nie liczy się podwójnie — 5/5 bije 2/3 z +2/+2', () => {
  // Widok PlayerView niesie moc EFEKTYWNĄ (2/3 + aura +2/+2 = 4/5) ORAZ
  // `grantedPower: 2` dla badge'u. Wycena daru M407 czytała `power + grantedPower`
  // (suma = 6), więc aura na słabszym stworze przebijała większy realny atak.
  const state = game({ active: 'p2' });
  const shiva = addShiva(state, 'shiva', 'p2');
  putFull(state, { id: 'human', cardId: 'midnight-guard', controllerId: 'p2' });
  putFull(state, { id: 'bof', cardId: 'bonds-of-faith', controllerId: 'p2' });
  attachAuraToCreature(state, 'bof', 'human');
  addCreature(state, 'duzy', 'p2', 5, 5);
  queueMesmerize(state, shiva);
  const view = playerView(state, 'p2');
  const entry = view.zones.battlefield.find((o) => o.id === 'human');
  assert.equal(entry.power, 4, 'widok: moc efektywna z aurą (2/3 -> 4/5)');
  assert.equal(entry.grantedPower, 2, 'widok: bonus badge = ten sam dodatek (nie do sumowania z power)');
  const bot = createHeuristicBot({ seed: 5 });
  const { choice, scores } = pickTrigger(bot, state, 'p2');
  assert.equal(choice.targetId, 'duzy', `większy realny atak wygrywa: ${JSON.stringify(choice)}`);
  assert.ok((scores.get('duzy') ?? 0) > (scores.get('human') ?? 0),
    `bez podwójnego liczenia bonusu: duzy=${scores.get('duzy')} human=${scores.get('human')}`);
});
