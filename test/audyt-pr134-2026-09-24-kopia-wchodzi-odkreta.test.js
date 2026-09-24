/**
 * Pin O-1 z audytu PR #134 (docs/audits/AUDYT_PR134_2026-09-24.md, §5/O-1).
 *
 * O-1: ścieżki KOPII ustawiały `tapped: true` z kopiowalnego „enters tapped”
 * (CR 707.2 + 614.1d — poprawnie), ale nie konsultowały efektu zastępczego
 * kontrolera „Gates you control enter untapped” (Batch 58/B7, Gond Gate).
 * Cztery ścieżki wejścia układały tę decyzję każda po swojemu, dwie z nich
 * zgubiły trzeci człon — dokładnie wzorzec L101 (helper istnieje, ścieżka go
 * omija) i L107 (jedna implementacja dla wszystkich ścieżek).
 *
 * Naprawa: `entersTappedNow(state, cechy, { enteringId })` w `permanents.js`
 * jest teraz JEDYNĄ funkcją rozstrzygającą „czy wchodzący obiekt wchodzi
 * tapnięty z wydrukowanego enters tapped”; używają jej `moveObjectDirectly`
 * (objects.js), wejście z biblioteki (game-state.js), token-kopia
 * (effects.js) i „enter as a copy” (game-state.js). Ścieżki kopii dostają
 * kopiowalne cechy oryginału (CR 707.2) z kontrolerem kopii, bo obiektu
 * jeszcze nie ma / jest przepisywany w miejscu.
 *
 * Fixture celowo jedzie na obiektach syntetycznych (brama jako artefakt,
 * brama jako stwór): w obecnym katalogu kopiowanie lądu-Bramy jest
 * nieosiągalne (Cogwork Assembler kopiuje artefakty, Jwari/Clone — stwory),
 * a silnik ma być kartoniezależny (ADR 0002), więc błąd klasy trzeba domknąć
 * i przypiąć niezależnie od tego, czy dzisiejszy katalog go sięga.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { applyEffect } from '../src/engine/effects.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
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

/**
 * `addObject` (helper testowy) celowo NIE przyjmuje `enteringAsCopy` — pole
 * spoza kontraktu ginie po cichu (L21). Realna ścieżka (spells.js) ustawia je
 * po wejściu na pole, więc fixture robi tak samo.
 */
function oznaczJakoWchodzacyKopia(state, id) {
  const obiekt = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...obiekt, enteringAsCopy: true }));
  return state.objects.get(id);
}

function findToken(state, knownIds) {
  const token = [...state.objects.values()]
    .find((o) => o.zone === 'battlefield' && !knownIds.includes(o.id));
  assert.ok(token, 'token-kopia powstał na polu bitwy');
  return token;
}

/** Bramka jako ARTEFAKT z kopiowalnym „enters tapped” (ścieżka Cogwork Assembler). */
function bramkaArtefakt(state, id, controllerId) {
  return putCard(state, id, 'dimir-guildgate', controllerId, 'battlefield', {
    kind: 'artifact', types: ['Artifact', 'Land'], subtypes: ['Gate'],
  });
}

test('O-1/1: token-kopia Bramy wchodzi ODKRĘCONA pod statykiem „Gates you control enter untapped”', () => {
  const state = game('p1');
  putCard(state, 'gond', 'gond-gate', 'p1');
  const cel = bramkaArtefakt(state, 'brama', 'p1');
  const zrodlo = putCard(state, 'asembler', 'cogwork-assembler', 'p1');

  applyEffect(state, { type: 'create_copy_token' }, zrodlo, [cel.id]);

  const token = findToken(state, ['gond', 'brama', 'asembler']);
  assert.deepEqual(token.subtypes, ['Gate'], 'kopia niesie kopiowalny podtyp (CR 707.2)');
  assert.equal(token.tapped, false,
    'efekt zastępczy kontrolera znosi tapnięcie także kopii (CR 614.1d) — O-1');
});

test('O-1/2: bez Bramy ze statykiem token-kopia nadal wchodzi TAPNIĘTA (regresja)', () => {
  const state = game('p1');
  const cel = bramkaArtefakt(state, 'brama', 'p1');
  const zrodlo = putCard(state, 'asembler', 'cogwork-assembler', 'p1');

  applyEffect(state, { type: 'create_copy_token' }, zrodlo, [cel.id]);

  const token = findToken(state, ['brama', 'asembler']);
  assert.equal(token.tapped, true, 'bez źródła override’u kopiowalne „enters tapped” działa');
});

test('O-1/3: „enter as a copy” Bramy wchodzi odkręcona, a kopia nie liczy samej siebie', () => {
  const state = game('p1');
  putCard(state, 'gond', 'gond-gate', 'p1');
  // Cel musi być stworem (ścieżka „enter as a copy” w game-state.js), więc
  // bramka jest ożywiona; podtyp Gate i kopiowalne „enters tapped” zostają.
  const cel = putCard(state, 'brama', 'dimir-guildgate', 'p1', 'battlefield', {
    kind: 'creature', types: ['Land', 'Creature'], subtypes: ['Gate'], power: 2, toughness: 2,
  });
  oznaczJakoWchodzacyKopia(state, putCard(state, 'zrodlo', 'jwari-shapeshifter', 'p1').id);
  state.pendingEnterAsCopy = {
    playerId: 'p1', sourceId: 'zrodlo', candidateIds: [cel.id], restorePriorityTo: 'p1',
  };

  const wynik = execute(state, { type: 'resolve_enter_as_copy', playerId: 'p1', targetId: cel.id });
  assert.ok(wynik.ok, `decyzja przyjęta: ${JSON.stringify(wynik)}`);

  const kopia = state.objects.get('zrodlo');
  assert.deepEqual(kopia.subtypes, ['Gate'], 'kopia niesie podtyp celu (CR 707.2)');
  assert.equal(kopia.entersTapped, true, 'kopia niesie kopiowalne „enters tapped”');
  assert.equal(kopia.tapped, false, 'statyk Gond Gate znosi tapnięcie kopii — O-1');
});

test('O-1/4: statyk musi należeć do KONTROLERA kopii — inaczej kopia wchodzi tapnięta', () => {
  const state = game('p1');
  // Bramka należy do p2: jej kopiowalne „enters tapped” przechodzi na kopię p1,
  // ale statyk „Gates you control enter untapped” (CR 614.1d — efekt zastępczy
  // kontrolera wchodzącego obiektu) nie dotyczy wejścia p1.
  const cel = putCard(state, 'brama', 'dimir-guildgate', 'p2', 'battlefield', {
    kind: 'creature', types: ['Land', 'Creature'], subtypes: ['Gate'], power: 2, toughness: 2,
  });
  oznaczJakoWchodzacyKopia(state, putCard(state, 'zrodlo', 'jwari-shapeshifter', 'p1').id);
  state.pendingEnterAsCopy = {
    playerId: 'p1', sourceId: 'zrodlo', candidateIds: [cel.id], restorePriorityTo: 'p1',
  };

  const wynik = execute(state, { type: 'resolve_enter_as_copy', playerId: 'p1', targetId: cel.id });
  assert.ok(wynik.ok, `decyzja przyjęta: ${JSON.stringify(wynik)}`);

  assert.equal(state.objects.get('zrodlo').tapped, true,
    'brak Bramy KONTROLERA (CR 614.1d: statyk musi należeć do tego samego gracza) → tapnięta');
});

test('O-1/5: decyzja „wchodzi tapnięty” ma jedną implementację (strażnik klasy L101)', () => {
  const katalog = path.join(import.meta.dirname, '..', 'src', 'engine');
  const czytaj = (plik) => fs.readFileSync(path.join(katalog, plik), 'utf8');
  const bezKomentarzy = (tekst) => tekst
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((linia) => (linia.trimStart().startsWith('//') ? '' : linia))
    .join('\n');

  // Stary idiom (sklejanie decyzji w miejscu, bez efektu zastępczego) nie ma
  // prawa wrócić do żadnej ścieżki wejścia.
  for (const plik of ['objects.js', 'effects.js', 'game-state.js', 'resources.js', 'spells.js']) {
    assert.ok(!bezKomentarzy(czytaj(plik)).includes('copyBase.entersTapped && !copyBase.entersTappedCondition'),
      `${plik}: ścieżka kopii znów skleja decyzję o tapnięciu bez wspólnego helpera (O-1)`);
  }
  // Wszystkie ścieżki wejścia czytają wspólny `entersTappedNow`.
  for (const plik of ['objects.js', 'effects.js', 'game-state.js']) {
    assert.ok(bezKomentarzy(czytaj(plik)).includes('entersTappedNow(state'),
      `${plik}: ścieżka wejścia nie używa wspólnego entersTappedNow`);
  }
});
