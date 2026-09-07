import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { applyEffect, manifestCardFaceDown } from '../src/engine/effects.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

/**
 * M334 (kontynuacja otwartych tematów po audycie PR #102): bot NIE wyceniał
 * obrotu twarzą do góry z MANIFESTU (CR 701.40b) — `turn_manifest_face_up`
 * nie miało swojego `case` i spadało do `default: return finish(0)`.
 *
 * Zmierzone PRZED naprawą (sonda na `chooseCommand`, stan: zmanifestowany
 * Goblin Piker pod botem, 10 many w puli, main1):
 *
 *   oferty: ["turn_manifest_face_up","concede","pass_priority"]
 *   bot:    ["turn_manifest_face_up"]     ← odsłonięcie 2/2 w 2/1 za manę
 *
 * czyli remis 0:0 z pasem, a `greedyChoice` bierze sort stabilny i pierwszą
 * ofertę — bot płacił koszt many karty ZAWSZE, gdy oferta istniała, niezależnie
 * od tego, co jest pod zakryciem. To ta sama klasa co L133 (nowa decyzja w
 * kontrakcie bez wyceny) i powtórka błędu, który M321 naprawił dla cloaka.
 *
 * Naprawa nie dokłada drugiej kopii wyceny: cloak i manifest to TA SAMA
 * decyzja („zapłać koszt many karty, żeby odzyskać kartę spod zakrycia\"),
 * więc dzielą JEDEN `case`, a różnica (utrata ward {2} tylko pod cloakiem)
 * wynika ze stanu, nie z nazwy mechaniki (M333: `object.ward` jest zerowane
 * przy manifeście, a dla cloaka niesie 2).
 */

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone = 'battlefield', extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, morph: def.morph ?? null, ...extra,
  });
  return state.objects.get(id);
}

/** Kładzie `cardId` na wierzch biblioteki p2 i zakrywa go (cloak albo manifest). */
function cover({ mechanism, cardId, mana = 10, step = 'main' }) {
  const state = createGameState({ seed: 334, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  if (mana > 0) addMana(state, 'p2', mana);
  put(state, 'libtop', cardId, 'p2', 'library');
  state.zones.library = ['libtop'];
  if (mechanism === 'cloak') {
    put(state, 'va', 'veiled-ascension', 'p2', 'battlefield');
    applyEffect(state, { type: 'cloak' }, state.objects.get('va'), []);
  } else if (mechanism === 'manifest') {
    manifestCardFaceDown(state, 'libtop', 'p2');
  } else {
    throw new Error(`nieznany mechanizm ${mechanism}`);
  }
  const covered = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.faceDown);
  assert.ok(covered, `zakryty permanent (${mechanism})`);
  return { state, covered };
}

/** Puszczaj decyzje bota, aż wykonuje obrót albo wyczerpie okno. */
function botPlays({ mechanism, cardId, mana = 10, step = 'main', moves = 6 }) {
  const { state, covered } = cover({ mechanism, cardId, mana, step });
  const flipType = mechanism === 'cloak' ? 'turn_cloak_face_up' : 'turn_manifest_face_up';
  const bot = createHeuristicBot({ seed: 334 });
  const applied = [];
  for (let i = 0; i < moves; i++) {
    const view = playerView(state, 'p2');
    const cmd = bot.chooseCommand(view, {});
    if (!cmd) break;
    applied.push(cmd.type);
    if (cmd.type === flipType) {
      const r = execute(state, cmd);
      assert.ok(r.ok, `obrót przyjęty: ${JSON.stringify(r.events?.slice(-1))}`);
      return { applied, state, covered, uncovered: true };
    }
    const r = execute(state, cmd);
    if (!r?.ok) break;
    if (state.turn.priorityPlayerId !== 'p2') break;
  }
  return { applied, state, covered, uncovered: false };
}

test('M334/A: manifest dużej karty (6/5 za {3}) — bot odsłania', () => {
  const { state, uncovered, applied, covered } = botPlays({ mechanism: 'manifest', cardId: 'plague-reaver' });
  assert.ok(uncovered, `bot ma odsłonić 6/5; wykonał: ${applied.join(',')}`);
  assert.equal(covered.faceDownCause, 'manifest', 'to manifest, nie cloak (przyczyna z M333)');
  const faceUp = state.objects.get(covered.id);
  assert.equal(faceUp.faceDown, false, 'twarz do góry');
  assert.equal(faceUp.power, 6, `ciało karty wraca: ${faceUp.power}/${faceUp.toughness}`);
  assert.equal(faceUp.toughness, 5, 'toughness spod zakrycia');
  assert.equal(faceUp.faceDownCause ?? null, null, 'obrót zdejmuje przyczynę (ten sam punkt zbierający co cloak)');
});

test('M334/B: manifest słabej karty (2/1 Goblin Piker) — bot NIE płaci za degradację', () => {
  // RED przed naprawą (zmierzone w headingu): brak `case` → remis 0 z pasem →
  // sort stabilny wybiera pierwszą ofertę → bot płacił {1} i zamieniał 2/2 na 2/1.
  const { uncovered, applied } = botPlays({ mechanism: 'manifest', cardId: 'goblin-piker' });
  assert.ok(!uncovered, `2/1 pod zakryciem zostaje 2/2; wykonał: ${applied.join(',')}`);
});

test('M334/C: ta sama karta pod cloakiem i pod manifestem — różnicuje tylko utracony ward', () => {
  // Wormfang Newt: ciało 2/2 (zysk 0), brak keywordów, trigger ETB (+5),
  // koszt many 2 → wartość obrotu 3. Pod MANIFESTEM: 3 > 0 → odsłania.
  // Pod CLOAKIEM: zakrycie daje ward {2} (CR 701.56a), więc obrót go zabiera
  // i podatek 3 znosi decyzję do zera → zostaje zakryte (wycena z M321).
  const manifest = botPlays({ mechanism: 'manifest', cardId: 'wormfang-newt' });
  assert.ok(manifest.uncovered, `manifest bez wardu do stracenia: ${manifest.applied.join(',')}`);
  const cloak = botPlays({ mechanism: 'cloak', cardId: 'wormfang-newt' });
  assert.ok(!cloak.uncovered, `ten sam tekst pod cloakiem płaci za ward: ${cloak.applied.join(',')}`);
});

test('M334/D: bez many na koszt karty — żaden obrót nie jest oferowany', () => {
  for (const mechanism of ['manifest', 'cloak']) {
    const { uncovered, applied } = botPlays({ mechanism, cardId: 'plague-reaver', mana: 0 });
    assert.ok(!uncovered, `${mechanism}: brak many → brak obrotu; wykonał: ${applied.join(',')}`);
  }
});

test('M334/E: poza główną faza (declare_blockers) — obrót nie jest wyceniany', () => {
  const { uncovered, applied } = botPlays({ mechanism: 'manifest', cardId: 'plague-reaver', step: 'declare_blockers', moves: 4 });
  assert.ok(!uncovered, `odsłonięcie po deklaracji bloków nie ratuje ciała; wykonał: ${applied.join(',')}`);
});

test('M334/F: rodzina ma JEDNO źródło wyceny — drugi typ decyzji nie wypadnie z switcha', () => {
  const source = readFileSync(new URL('../src/controllers/heuristic-bot.js', import.meta.url), 'utf8');
  const from = source.indexOf("case 'turn_cloak_face_up'");
  assert.notEqual(from, -1, 'wycena obrotu cloaka istnieje');
  const window = source.slice(from, from + 400);
  assert.match(window, /case 'turn_manifest_face_up'/,
    'manifest musi obsługiwać TEN SAM przypadek co cloak — osobne kopie wyceny rozjadą się przy pierwszej zmianie (L137)');
  // Podatek za ward liczony ze STANU, nie z nazwy mechaniki i nie stałą.
  const body = source.slice(from, source.indexOf("case 'draw_card'"));
  assert.match(body, /covered\.ward \?\? 0/, 'utratę wardu liczymy z pola `ward` widoku (M333/M258)');
  assert.doesNotMatch(body, /- 3;.*utrata ward/, 'twarde „−3: utrata ward {2}\\" wróciło — wycena znowu rozróżnia mechanikę po numerze, a nie po stanie');
  assert.doesNotMatch(body, /faceDownCause === 'cloak'/, 'wycena nie może rozgałęziać się po nazwie mechaniki (ADR 0002 + L137)');
});
