import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { applyEffect } from '../src/engine/effects.js';
import { createCardRegistry, REAL_CARDS } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { setupCardMatch } from '../src/cards/materialize.js';
import { runSimulation } from '../src/engine/simulation.js';
import { createAggroBot } from '../src/controllers/aggro-bot.js';
import { createRandomBot } from '../src/controllers/random-bot.js';

/**
 * M337 (przerwana pełna macierz B0 — znalezione na polecenie właściciela).
 *
 * Przebieg `node tools/benchmark.mjs --full` padł na 56% z komunikatem:
 *
 *   Błąd benchmarku: Bot wybrał nielegalną komendę: trigger_target_unresolved
 *    — mecz: aggro(mirrodin-wu) vs random(ravnica), seed 1001, maxCommands 8000
 *
 * Powtórzone deterministycznie (test D poniżej, ten sam mecz krok po kroku):
 * tura 22, krok `declare_blockers`, gracz p2 ma otwartą decyzję celu triggera
 * (`pendingTriggerTargets`) ORAZ cloak na polu bitwy. `playerView` wystawił mu
 * wtedy listę:
 *
 *   ["turn_cloak_face_up","resolve_trigger_target","resolve_trigger_target","concede"]
 *
 * a `execute` odrzucił `turn_cloak_face_up` bramką `trigger_target_unresolved`.
 * Czyli OFERTA była szerzej niż WALIDACJA — klasa L48 (oferta = walidacja) i
 * trzecie wcielenie tej samej dziury w tym pliku (Batch 47 łatał ją dla
 * `pass_priority`, M255/G dla `pendingExploits`): pętle obrotów twarzą do góry
 * pytały wyłącznie o `hasPriority`, podczas gdy execute pilnuje „żadna akcja
 * inna niż resolve_*", gdy JAKA KOLWIEK decyzja czeka — także własna (CR 117.5
 * okna priorytetu nie istnieją w środku rozstrzygania).
 *
 * Naprawa: JEDEN predykat `optionalActionsOpen` (priorytet + brak jakiejkolwiek
 * czekającej decyzji), użyty w obu pętlach face-up i w bramce `pass_priority`;
 * ręcznie enumerowana lista ~54 warunków `!state.pending*` przy passie
 * zniknęła, bo `firstPendingDecision` ogarnia 64 pola (nadzbiór — 10 brakujących
 * miało odpowiedniki w derivatach, więc żadna legalna oferta nie wypada).
 * Liczby zmierzone: 64 bramki `if (cmd.type !== 'resolve_*'` w execute ↔ 64 pola
 * w `firstPendingDecision`, 1:1.
 */

const REGISTRY = createCardRegistry();

function gra() {
  const state = createGameState({ seed: 337, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 10);
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} jest w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, morph: def.morph ?? null,
  });
}

/** Cloak wierzchu biblioteki p1 (Veiled Ascension) — wzorzec z M321. */
function cloakedTop(state) {
  put(state, 'va', 'veiled-ascension', 'p1');
  put(state, 'lib-top', 'razorfoot-griffin', 'p1', 'library');
  // Zapas pod scry: cloak ZABIERA wierzch (idzie na pole bitwy zakryty), więc
  // bez tego biblioteka byłaby pusta i scry nie kolejkowałoby decyzji.
  put(state, 'lib-spare', 'shock', 'p1', 'library');
  state.zones.library = ['lib-top', 'lib-spare'];
  applyEffect(state, { type: 'cloak' }, state.objects.get('va'), []);
}

/** Scry p1 — decyzja, której właścicielem jest SAM gracz (nie „cudza"). */
function scryPending(state) {
  applyEffect(state, { type: 'scry', amount: 1 }, state.objects.get('va'), []);
  assert.ok(state.pendingScry, 'scry zebrało decyzję');
}

const types = (view) => view.legalCommands.map((c) => c.type);

test('M337/A: bez czekającej decyzji akcje opcjonalne są oferowane (brama nie jest „zawsze zamknięta")', () => {
  const state = gra();
  cloakedTop(state);
  const view = playerView(state, 'p1');
  assert.ok(types(view).includes('turn_cloak_face_up'), `obrót cloaka oferowany: ${types(view).join(',')}`);
  assert.ok(types(view).includes('pass_priority'), 'pass oferowany normalnie');
});

test('M337/B: WŁASNA czekająca decyzja zamyka akcje opcjonalne i wraca po jej rozstrzygnięciu', () => {
  const state = gra();
  cloakedTop(state);
  scryPending(state);
  const view = playerView(state, 'p1');
  const oferty = types(view);
  assert.ok(oferty.includes('resolve_scry'), `własna decyzja jest oferowana: ${oferty.join(',')}`);
  assert.equal(oferty.includes('turn_cloak_face_up'), false,
    `przy czekającym scry nie wolno oferować obrotu twarzą do góry (execute i tak odrzuci): ${oferty.join(',')}`);
  assert.equal(oferty.includes('pass_priority'), false, 'ani pasa (też bramkowany tą samą regułą)');
  assert.ok(oferty.includes('concede'), 'koncesja pozostaje (CR 720.4a — z niej nikt nie musi korzystać z priorytetu)');

  const scry = view.legalCommands.find((c) => c.type === 'resolve_scry');
  assert.ok(execute(state, scry).ok, 'rozstrzygnięcie scry przyjęte');
  const po = types(playerView(state, 'p1'));
  assert.ok(po.includes('turn_cloak_face_up'), `oferta wraca po decyzji: ${po.join(',')}`);
  assert.ok(po.includes('pass_priority'), 'pass też wraca — bramka nie jest lepka');
});

test('M337/C: ta sama reguła dla manifestu (druga pętla face-up)', () => {
  const state = gra();
  put(state, 'md', 'manifest-dread', 'p1', 'hand');
  for (const id of ['lib-a', 'lib-b']) put(state, id, 'razorfoot-griffin', 'p1', 'library');
  state.zones.library = ['lib-a', 'lib-b'];
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'md');
  assert.ok(cast, 'Manifest Dread do rzucenia');
  assert.ok(execute(state, cast).ok, 'rzut przyjęty');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(state.pendingManifestDread, 'decyzja manifestu czeka (dwie karty wierzchu)');
  // DORZUCAMY własne scry — decyzja wciąż nasza, a i tak blokuje akcje opcjonalne.
  put(state, 'va', 'veiled-ascension', 'p1');
  applyEffect(state, { type: 'scry', amount: 1 }, state.objects.get('va'), []);
  const oferty = types(playerView(state, 'p1'));
  assert.ok(oferty.length > 0, `widok żywy: ${oferty.join(',')}`);
  for (const zabronione of ['turn_manifest_face_up', 'turn_cloak_face_up', 'play_land', 'pass_priority']) {
    assert.equal(oferty.includes(zabronione), false, `przy czekającej decyzji nie ma ${zabronione}: ${oferty.join(',')}`);
  }
});

test('M337/D: mecz z macierzy, który przerywał przebieg, dochodzi do końca', () => {
  // aggro(mirrodin-wu) vs random(ravnica), seed 1001 — dokładnie ten z logu
  // benchmarku. Bramka: ŻADNA komenda wybrana przez kontrolera nie może być
  // odrzucona przez silnik (runSimulation rzuca „Bot wybrał nielegalną
  // komendę" — i to jest błąd, nie wynik partii).
  const decksDir = path.join(process.cwd(), 'decks');
  const list = (n) => parseDeckText(readFileSync(path.join(decksDir, `${n}.txt`), 'utf8'), REGISTRY).cardIds;
  const state = setupCardMatch({
    seed: 1001,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([['p1', list('mirrodin-wu')], ['p2', list('ravnica')]]),
    registry: REGISTRY,
  });
  const { results } = runSimulation({
    state,
    controllers: new Map([
      ['p1', createAggroBot()],
      ['p2', createRandomBot({ seed: 1003, allowConcede: false })],
    ]),
    maxCommands: 8000,
  });
  assert.ok(results.length > 500, `partia przeszła daleko poza dawny punkt awarii (kroków: ${results.length})`);
  assert.ok(state.status === 'finished' || state.turn.number > 22,
    'mecz żył dalej niż dawniej (urażony był na 513. komendzie, tura 22)');
});

test('M337/E: rodzina — jedna reguła po obu stronach, bez ręcznych list pending*', () => {
  const gs = readFileSync(new URL('../src/engine/game-state.js', import.meta.url), 'utf8');
  assert.match(gs, /const optionalActionsOpen = state\.turn\.priorityPlayerId === playerId && firstDecisionOwner == null;/,
    'reguła „okno na akcję opcjonalną\ musi być jednym predykatem');
  const from = gs.indexOf('const optionalActionsOpen');
  const doKoncaOfert = gs.slice(from, gs.indexOf('\n  return legalCommands', from));
  assert.equal(doKoncaOfert.match(/if \(hasPriority\) \{/g)?.length ?? 0, 0,
    'żadna pętla akcji opcjonalnej nie może pytać TYLKO o priorytet (to był błąd M337)');
  const bramy = [...doKoncaOfert.matchAll(/if \(optionalActionsOpen\) \{/g)];
  assert.equal(bramy.length, 2,
    `dokładnie dwie pętle face-up (manifest + cloak) bramkowane wspólnym predykatem, jest: ${bramy.length}`);
  for (const brama of bramy) {
    const blok = doKoncaOfert.slice(brama.index, brama.index + 1400);
    assert.match(blok, /command\('turn_(cloak|manifest)_face_up'/,
      'każda taka brama musi kończyć się ofertą obrotu (inaczej predykat wisi bezużytecznie)');
  }
  // Ręczna lista ~54 warunków przy passie nie może wrócić (to ona rozjeżdżała
  // się z execute przy każdej nowej decyzji).
  const br = doKoncaOfert.slice(doKoncaOfert.indexOf("trailingCommands.push(command('pass_priority'") - 900,
    doKoncaOfert.indexOf("trailingCommands.push(command('pass_priority'"));
  assert.equal((br.match(/!state\.pending[A-Za-z]+/g) ?? []).length, 0,
    `bramka pasa nie enumeruje już pól pending (znaleziono ${br.match(/!state\.pending[A-Za-z]+/g)?.length ?? 0}): ${br.slice(-160)}`);
});
