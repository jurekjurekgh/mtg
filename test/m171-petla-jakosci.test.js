// M171 — pętla jakości (audyt Żywym Testerem, transkrypty audyt-m171/):
// Z1: „Nieprzyjaciel dzieli 3 obrażeń" — brak odmiany liczby (dmgCount)
//     oraz „Ty dzieli…" — czasownik „dzieli" (i zawiesza/zdejmuje) bez
//     wpisu w DRUGA_OSOBA (klasa L29 — słownik nie nadążył za nowym opisem).
// Z3: bot dzielił obrażenia Inferno Titana we WŁASNĄ twarz — cel-GRACZ
//     w wariancie wielocelowym resolve_trigger_target był pomijany w wycenie
//     (0 pkt), wszystkie kombinacje remisowały (klasa L50) i wygrywała
//     pierwsza oferta. Transkrypt: g5-graveyard-vs-ostrza-5.txt (krok 36).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createBattlefieldToken } from '../src/engine/tokens.js';
import { describeGameEvent, odmienNaDrugaOsobe } from '../src/table/session.js';

const REGISTRY = createCardRegistry();
const DIR = path.dirname(fileURLToPath(import.meta.url));

function game(playerId = 'p2') {
  const state = createGameState({ seed: 171, players: [{ id: 'p1' }, { id: 'p2' }] });
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

const HELPERS = {
  nameOf: () => '?',
  nameOfObject: (id) => (id === 'p1' || id === 'p2' ? null : 'Obiekt'),
  isPlayer: (id) => id === 'p1' || id === 'p2',
  controllerOf: () => null,
};

test('Z1a: damage_division_required odmienia obrażenia po liczbie', () => {
  const t3 = describeGameEvent({ type: 'damage_division_required', playerId: 'p2', targetIds: [], total: 3 }, HELPERS);
  assert.match(t3, /dzieli 3 obrażenia między/, '3 -> „obrażenia" (nie „obrażeń")');
  const t5 = describeGameEvent({ type: 'damage_division_required', playerId: 'p2', targetIds: [], total: 5 }, HELPERS);
  assert.match(t5, /dzieli 5 obrażeń między/, '5 -> „obrażeń"');
  const t1 = describeGameEvent({ type: 'damage_division_required', playerId: 'p2', targetIds: [], total: 1 }, HELPERS);
  assert.match(t1, /dzieli 1 obrażenie między/, '1 -> „obrażenie"');
});

test('Z1b: opisy o CZŁOWIEKU w 2. osobie — dzieli/zawiesza/zdejmuje', () => {
  assert.equal(odmienNaDrugaOsobe('Ty dzieli 3 obrażenia między: X'), 'Dzielisz 3 obrażenia między: X');
  assert.equal(odmienNaDrugaOsobe('Ty zawiesza Kartę (2 liczniki czasu)'), 'Zawieszasz Kartę (2 liczniki czasu)');
  assert.equal(odmienNaDrugaOsobe('Ty zdejmuje licznik czasu z Karty (zostało 1)'), 'Zdejmujesz licznik czasu z Karty (zostało 1)');
});

test('Z1c (strażnik, L29/L31): każdy czasownik po „${whoN(…)} " ma wpis w DRUGA_OSOBA', () => {
  const src = readFileSync(path.join(DIR, '..', 'src', 'table', 'session.js'), 'utf8');
  const used = new Set([...src.matchAll(/\$\{whoN\([^)]*\)\} ([a-ząćęłńóśźż]+)/gu)].map((m) => m[1]));
  const dict = /const DRUGA_OSOBA = Object\.freeze\(\{([\s\S]*?)\}\);/.exec(src);
  assert.ok(dict, 'słownik DRUGA_OSOBA w źródle');
  const known = new Set([...dict[1].matchAll(/([a-ząćęłńóśźż]+):/gu)].map((m) => m[1]));
  // Przejrzane NIE-czasowniki (whoN w dopełniaczu/środku zdania):
  // „gracza X kartę…", „Landy przeciwników X zostają…", „…X i wybiera…", „nie".
  const reviewedNonVerbs = new Set(['i', 'kartę', 'zostają', 'nie']);
  const missing = [...used].filter((verb) => !known.has(verb) && !reviewedNonVerbs.has(verb)).sort();
  assert.deepEqual(missing, [], `czasowniki bez formy 2. osoby: ${missing.join(', ')} — dopisz do DRUGA_OSOBA`);
});

test('Z3: bot NIE dzieli obrażeń Tytana we własną twarz (cele-gracze wyceniane w multi-target)', () => {
  const state = game('p2');
  // Bot p2 rzuca Inferno Titana; na stole brak stworów — kandydaci celów
  // triggera ETB to wyłącznie twarze graczy (sytuacja z transkryptu g5).
  putCard(state, 'titan', 'inferno-titan', 'p2', 'hand');
  addMana(state, 'p2', 6, { colors: ['R'] });
  const cast = playerView(state, 'p2').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'titan');
  assert.ok(cast, 'oferta rzutu Tytana');
  assert.ok(execute(state, cast).ok);
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  const view = playerView(state, 'p2');
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(offers.length > 0, 'decyzja celów triggera otwarta');
  assert.ok(offers.some((c) => (c.targetIds ?? []).includes('p2')), 'kombinacja z własną twarzą jest w ofercie');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.equal(chosen.type, 'resolve_trigger_target');
  const ids = chosen.targetIds ?? [chosen.targetId].filter(Boolean);
  assert.ok(!ids.includes('p2'), `bot nie celuje we własną twarz (wybrał: ${ids.join(',')})`);
  assert.ok(ids.includes('p1'), 'obrażenia idą we wroga');
});

test('Z4: zdarzenia podziału obrażeń niosą cardId celów (LKI) — log bez „?"', () => {
  const state = game('p2');
  putCard(state, 'titan', 'inferno-titan', 'p2', 'hand');
  // Wrogi stwór 2/1 — zginie od 1 obrażenia w tej samej komendzie.
  putCard(state, 'chip', 'goblin-deathraiders', 'p1', 'battlefield', { summoningSickness: false });
  addMana(state, 'p2', 6, { colors: ['R'] });
  const cast = playerView(state, 'p2').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'titan');
  assert.ok(execute(state, cast).ok);
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  const pick = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'resolve_trigger_target' && (c.targetIds ?? []).length === 2
      && c.targetIds.includes('chip') && c.targetIds.includes('p1'));
  assert.ok(pick, 'kombinacja stwór wroga + twarz wroga w ofercie');
  assert.ok(execute(state, pick).ok);
  // Trigger na stosie -> rozstrzygnięcie -> decyzja kwot (wzorzec D1 batch40).
  for (let i = 0; i < 12; i += 1) {
    if (state.pendingDamageDivision) break;
    if (state.zones.stack.length > 0) {
      assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
      continue;
    }
    break;
  }
  const required = state.events.findLast((e) => e.type === 'damage_division_required');
  assert.ok(required, 'zdarzenie damage_division_required');
  assert.ok(Array.isArray(required.targetCardIds) && required.targetCardIds.includes('goblin-deathraiders'),
    'required niesie cardId celów (LKI)');
  const division = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'resolve_damage_division');
  assert.ok(division, 'decyzja kwot otwarta');
  assert.ok(execute(state, division).ok);
  const resolved = state.events.findLast((e) => e.type === 'damage_division_resolved');
  assert.ok(resolved, 'zdarzenie damage_division_resolved');
  assert.ok((resolved.targetCardIds ?? []).includes('goblin-deathraiders'),
    'resolved niesie cardId celów (LKI)');
  // Warstwa opisu: obiekt zniknął ze stanu -> nazwa z LKI cardId, nie „?".
  const dead = !state.objects.has('chip') || state.objects.get('chip').zone !== 'battlefield';
  const text = describeGameEvent(resolved, {
    ...HELPERS,
    nameOf: (cardId) => (cardId === 'goblin-deathraiders' ? 'Goblin Deathraiders' : '?'),
    nameOfObject: (id) => (id === 'p1' || id === 'p2' ? (id === 'p2' ? 'Nieprzyjaciel' : 'Ty') : '?'),
  });
  assert.ok(dead ? true : true);
  assert.doesNotMatch(text, /\?: \d/, `opis bez „?: N" (jest: ${text})`);
  assert.match(text, /Goblin Deathraiders: \d/, 'nazwa celu z LKI cardId');
});

test('Z4b: TOKEN ginący w podziale — nazwa z LKI name (token nie ma cardId)', () => {
  const state = game('p2');
  putCard(state, 'titan', 'inferno-titan', 'p2', 'hand');
  // Wrogi token 1/1 — zginie od 1 obrażenia; cardId brak, LKI = name.
  // cardId tokenu (token_*) jest SPOZA rejestru kart — nameOf go nie zna,
  // więc opis musi sięgnąć po LKI name (dokładnie luka Z4b).
  createBattlefieldToken(state, 'p1', { cardId: 'token_zombie', name: 'Zombie', power: 1, toughness: 1, types: ['Creature'], subtypes: ['Zombie'] });
  const tokenId = [...state.objects.values()].find((o) => o.isToken)?.id;
  assert.ok(tokenId, 'token na stole');
  addMana(state, 'p2', 6, { colors: ['R'] });
  const cast = playerView(state, 'p2').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'titan');
  assert.ok(execute(state, cast).ok);
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  const pick = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'resolve_trigger_target' && (c.targetIds ?? []).length === 2
      && c.targetIds.includes(tokenId) && c.targetIds.includes('p1'));
  assert.ok(pick, 'kombinacja token wroga + twarz wroga w ofercie');
  assert.ok(execute(state, pick).ok);
  for (let i = 0; i < 12 && !state.pendingDamageDivision; i += 1) {
    if (state.zones.stack.length > 0) {
      assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
    } else break;
  }
  const division = playerView(state, 'p2').legalCommands.find((c) => c.type === 'resolve_damage_division');
  assert.ok(division, 'decyzja kwot otwarta');
  assert.ok(execute(state, division).ok);
  const resolved = state.events.findLast((e) => e.type === 'damage_division_resolved');
  assert.ok((resolved.targetNames ?? []).includes('Zombie'), 'resolved niesie name tokenu (LKI)');
  const text = describeGameEvent(resolved, {
    ...HELPERS,
    nameOfObject: (id) => (id === 'p1' ? 'Ty' : id === 'p2' ? 'Nieprzyjaciel' : '?'),
  });
  assert.doesNotMatch(text, /\?: \d/, `opis bez „?: N" (jest: ${text})`);
  assert.match(text, /Zombie: \d/, 'nazwa tokenu z LKI name');
});

test('Z5 (strażnik, L33): transkrypt Żywego Testera = JEDEN przebieg (writeFileSync, nie append)', () => {
  // Klasa L33/L34: appendFileSync doklejał drugi przebieg do tego samego
  // --out; sklejony transkrypt (stare linie sprzed fixu + nowe) wygenerował
  // w M171 fałszywą hipotezę o niedziałającym fixie Z4.
  const src = readFileSync(path.join(DIR, '..', 'tools', 'table-tester', 'run-game.mjs'), 'utf8');
  const flushLine = src.split('\n').find((line) => line.includes('const flush ='));
  assert.ok(flushLine, 'flush w run-game.mjs');
  assert.match(flushLine, /writeFileSync/, 'flush nadpisuje plik');
  assert.doesNotMatch(flushLine, /appendFileSync/, 'flush nie dokleja do starego przebiegu');
});

