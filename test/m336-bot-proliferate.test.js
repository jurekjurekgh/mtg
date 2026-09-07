import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { addCounter } from '../src/engine/counters.js';
import { POISON_LOSS_LIMIT } from '../src/engine/state-based.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

/**
 * M336 (klasa L133 — decyzja oferowana, ale nie wyceniona): Proliferate.
 *
 * CR 701.27: „You choose any number of permanents that have at least one
 * counter on them and/or players that have at least one counter of a given
 * kind, then put one counter of each kind already present on each of those
 * permanents and/or players onto each of them." „Any number" znaczy także zero
 * — silnik słusznie enumeruje PODZBIORY kandydatów (game-state.js ~6117), a
 * wariant PUSTY jest pierwszy, bo `subsets()` liczy od najuboższych.
 *
 * `resolve_proliferate` nie miało swojego `case` w `scoreCommand` bota, więc
 * wpadało w `default: finish(0)`; przy remisie `greedyChoice` wygrywa
 * KOLEJNOŚĆ ofert, a jedynymi ofertami przy tej decyzji są warianty
 * proliferate (+ koncesja). Efekt zmierzony sondą na `courage-in-crisis`
 * ({2}{G}, sorcery, +1/+1 na cel, potem proliferate): bot ZAWSZE wybierał pusty
 * zbiór, czyli:
 *   • przepuszczał darmowy +1/+1 na własnym stworze,
 *   • przepuszczał WYGRANĄ partii (przeciwnik przy 9 truciznach),
 *   • „bezpiecznie" odmawiał własnej dziesiątej trucizny — nie dlatego, że
 *     policzył, tylko dlatego, że pierwsza oferta była pusta.
 * Ta ostatnia pozycja jest najważniejsza diagnostycznie: komentarz w
 * `game-state.js` twierdził, że „pierwsza oferta = WSZYSTKO (deterministyczna
 * polityka botów)". Ktoś, kto dopasowałby kod do tego zdania, włożyłby botom
 * samobójstwo w ręce. Dlatego naprawa ma DWA nogi: wycena decyzji u bota i
 * komentarz opisujący stan faktyczny (oba pinowane poniżej).
 */

const REGISTRY = createCardRegistry();

function board({ ownCounters = {}, foeCounters = {}, ownToughnessCreature = 'goblin-piker', ownPoison = 0, foePoison = 0, bezWroga = false, czar = 'courage-in-crisis' }) {
  const state = createGameState({ seed: 336, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 10);
  const put = (id, cardId, controller, counters) => {
    const d = REGISTRY.get(cardId);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: controller, ownerId: controller, zone: 'battlefield',
      ...gameObjectDataOf(d), types: d.types ?? [], keywords: d.keywords ?? [], subtypes: d.subtypes ?? [],
    });
    for (const [kind, n] of Object.entries(counters)) addCounter(state, id, kind, n);
  };
  put('own', ownToughnessCreature, 'p1', ownCounters);
  if (!bezWroga) put('foe', 'goblin-piker', 'p2', foeCounters);
  // Gracz: `poison` mieszka w records graczy (nie w state.objects) i NIE wolno
  // zamrażać kopii — silnik mutuje player.manaPool w tym samym obiekcie.
  for (const [pid, n] of [['p1', ownPoison], ['p2', foePoison]]) {
    if (!n) continue;
    const i = state.players.findIndex((p) => p.id === pid);
    state.players[i] = { ...state.players[i], poison: n };
  }
  const def = REGISTRY.get(czar);
  addObject(state, {
    id: 'sp', instanceId: 'i-sp', cardId: czar, controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state;
}

/** Komenda rzutu NASZEGO czaru z ręki ('sp') na cel — bez deklarowania karty. */
function castCmd(state, targetId) {
  const karta = state.objects.get('sp');
  return {
    type: 'cast_spell', playerId: 'p1', cardId: karta.cardId, objectId: 'sp',
    ...(targetId ? { targets: [targetId] } : {}),
  };
}

/** Rzuca czar (+1/+1 albo destroy) na wybrany cel i czeka na decyzję proliferate. */
function castAndWaitForProliferate(state, targetId) {
  const r = execute(state, castCmd(state, targetId));
  assert.ok(r.ok, `rzut przyjęty: ${JSON.stringify(r.events ?? r.reason)}`);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(state.pendingProliferate, 'decyzja proliferate czeka (CR 701.27 — „any number")');
  return state;
}

function botChoice(state) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 7, registry: REGISTRY });
  const cmd = bot.chooseCommand(view);
  assert.equal(cmd.type, 'resolve_proliferate', `bot musi rozstrzygnąć decyzję, a nie: ${cmd.type}`);
  const res = execute(state, cmd);
  assert.ok(res.ok, `wybór legalny: ${JSON.stringify(res.events ?? res.reason)}`);
  return { chosen: cmd.targetIds ?? [], state };
}

const countersOf = (state, id) => state.objects.get(id)?.counters ?? {};
const poisonOf = (state, id) => state.players.find((p) => p.id === id).poison ?? 0;

test('M336/A: darmowy +1/+1 na własnym stworze jest brany (dawniej: pusty zbiór)', () => {
  const state = castAndWaitForProliferate(board({ ownCounters: {}, foeCounters: {} }), 'own');
  const { chosen } = botChoice(state);
  assert.deepEqual(chosen, ['own'], `bot ma dobrać własnego stwora, wybrał: ${JSON.stringify(chosen)}`);
  assert.equal(countersOf(state, 'own')['+1/+1'], 2, 'licznik doszedł (spell 1 + proliferate 1)');
});

test('M336/B: przeciwnik przy 9 truciznach — proliferacja ZAKOŃCZA partię wygraną', () => {
  const state = castAndWaitForProliferate(board({ foeCounters: {}, foePoison: POISON_LOSS_LIMIT - 1 }), 'foe');
  const { chosen } = botChoice(state);
  assert.ok(chosen.includes('p2'), `musi dołożyć truciznę wrogowi, wybrał: ${JSON.stringify(chosen)}`);
  assert.equal(state.status, 'finished', 'dziesiąty licznik = przegrana wroga (CR 120.7) przez SBA');
  assert.equal(state.winnerId, 'p1', 'bot wygrywa tę partię');
});

test('M336/C: własna dziewiąta trucizna NIE jest dobierana, ale buff znad niej tak', () => {
  const state = castAndWaitForProliferate(
    board({ ownCounters: {}, ownPoison: POISON_LOSS_LIMIT - 1 }), 'own');
  assert.deepEqual(state.pendingProliferate.candidateIds, ['own', 'p1'], 'kandydaci: nasz stwór i my z trucizną');
  const { chosen } = botChoice(state);
  assert.ok(chosen.includes('own'), 'bierzemy +1/+1');
  assert.ok(!chosen.includes('p1'), 'nie dobieramy sobie dziesiątej trucizny (to przegrana)');
  assert.equal(poisonOf(state, 'p1'), POISON_LOSS_LIMIT - 1, 'trucizna bez zmian');
  assert.equal(state.status, 'active', 'partia trwa');
});

test('M336/D: same szkodliwe warianty — bot wybiera PUSTY zbiór (legalne „any number")', () => {
  // Własny stwór z -1/-1 (drugi go dobija: wytrzymałość efektywna 1 → 0) i
  // wróg z +1/+1 (dokładka dla niego) — żaden wybór nie jest dobry.
  const state = castAndWaitForProliferate(board({
    ownToughnessCreature: 'wormfang-newt', ownCounters: { '-1/-1': 1 }, foeCounters: { '+1/+1': 1 },
  }), 'foe');
  const { chosen } = botChoice(state);
  assert.deepEqual(chosen, [], `pusty wybór jest jedynym sensownym, było: ${JSON.stringify(chosen)}`);
  assert.equal(countersOf(state, 'own')['-1/-1'], 1, 'własny stwór nie dostaje drugiego -1/-1');
  assert.equal(countersOf(state, 'foe')['+1/+1'], 2, 'wróg nie dostaje prezentu od nas');
});

test('M336/E: brak kandydatów = brak decyzji (i czar nie wisi na stosie — klasa M335)', () => {
  // Spread the Sickness ({4}{B}): „Destroy target creature, then proliferate".
  // Jedyny stwór na stole jest celem destroy, więc w chwili proliferate nie ma
  // NA CZYM kłaść liczników i nikt nie ma liczników — decyzji nie wolno
  // kolejkować (inaczej: wiszący stos jak w M335).
  const state = board({ bezWroga: true, czar: 'spread-the-sickness' });
  const r = execute(state, castCmd(state, 'own'));
  assert.ok(r.ok, `rzut przyjęty: ${JSON.stringify(r.events ?? r.reason)}`);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(state.pendingProliferate ?? null, null, 'efekt bez kandydatów nie kolejkuje decyzji');
  assert.equal(state.pendingSpell ?? null, null, 'a rozstrzygacz nie zostawia pendingSpell (M335)');
  assert.equal(state.zones.stack.length, 0, 'czar OPUSZCZA stos');
  const own = state.objects.get('own');
  assert.ok(!own || own.zone !== 'battlefield', 'cel zniszczony — nie jest już na polu bitwy');
  assert.ok(state.zones.graveyard.length > 0, 'i leży w czyimś grobie (nie w limbo)');
});

test('M336/E2: wybór proliferate poprzedza znoszenie liczników przez SBA (CR 704.4)', () => {
  // M343/F5: poprzedni pin nazywał przedwczesne SBA „kosmetyką oferty”.
  // Wynik końcowy liczników bywa ten sam, lecz nie wynik gry (test m343).
  const state = board({ ownToughnessCreature: 'wormfang-newt', ownCounters: { '-1/-1': 1 } });
  assert.ok(execute(state, castCmd(state, 'own')).ok, 'rzut przyjęty');
  for (const playerId of ['p1', 'p2']) assert.ok(execute(state, { type: 'pass_priority', playerId }).ok);
  assert.deepEqual(state.pendingProliferate?.candidateIds, ['own']);
  assert.deepEqual(countersOf(state, 'own'), { '-1/-1': 1, '+1/+1': 1 }, 'oba rodzaje nadal istnieją w środku czaru');
  const offer = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_proliferate' && c.targetIds?.includes('own'));
  assert.ok(offer);
  const res = execute(state, offer);
  assert.ok(res.ok, 'wybór przyjęty');
  assert.equal(res.events.filter((e) => e.type === 'counter_added' && e.objectId === 'own').length, 2);
  assert.deepEqual(countersOf(state, 'own'), {}, 'SBA po zakończeniu znosi obie pary');
  assert.equal(state.pendingSpell, null);
  assert.equal(state.zones.stack.length, 0);
  assert.equal(state.status, 'active');
});

test('M336/F: próg trucizny z JEDNEGO źródła i wycena bez nazw kart', () => {
  const bot = readFileSync(new URL('../src/controllers/heuristic-bot.js', import.meta.url), 'utf8');
  const sba = readFileSync(new URL('../src/engine/state-based.js', import.meta.url), 'utf8');
  assert.match(bot, /import \{ POISON_LOSS_LIMIT \} from '\.\.\/engine\/state-based\.js';/,
    'bot ma czytać próg z silnika, nie trzymać własnej dziesiątki');
  assert.match(sba, />= POISON_LOSS_LIMIT/, 'SBA używa eksportowanej stałej');
  // Gałąź decyzji nie może wymieniać kart (ADR 0002) — tylko fakty ze stanu.
  const from = bot.indexOf("case 'resolve_proliferate'");
  assert.notEqual(from, -1, 'wycena proliferate istnieje');
  const doKonca = bot.slice(from, bot.indexOf("case 'resolve_manifest_dread'", from));
  assert.ok(doKonca.length > 200 && doKonca.length < 6000, `rozmiar gałęzi do przejrzenia: ${doKonca.length}`);
  for (const nazwa of ['courage', 'sickness', 'CRUEL', 'plague-reaver']) {
    assert.equal(doKonca.toLowerCase().includes(nazwa.toLowerCase()), false,
      `wycena nie może znać karty „${nazwa}" (silnik i bot są kartowo-agnostyczne)`);
  }
  // Liczba „10" nie może wrócić do gałęzi jako literal progu.
  assert.equal(/poison \+ 1 >= 10/.test(doKonca), false, 'próg musi być stałą, nie literałem');

  // Ślady wag, których NIE DA się uchwycić zachowaniem w tej decyzji: model
  // jest addytywny, a wariant pusty kosztuje 0 i jest zawsze dostępny (CR
  // 701.27 „any number"), więc każda pojedyncza ujemna dokładka jest z góry
  // przegrana z pustym zbiorem — mutacja „usuń ochronę przed własną
  // dziesiątą trucizną" NIE zmienia żadnego wyboru (zmierzone: testy A–E na
  // tej mutacji zielone). Pin jest więc strukturalny, tak samo jak w M334/F
  // pinowano `covered.ward ?? 0` zamiast Stałej.
  assert.match(doKonca, /if \(poison \+ 1 >= POISON_LOSS_LIMIT\) return finish\(NEVER\);/,
    'własna dziesiąta trucizna musi być odrzucana NA SZTYWNO (NEVER), nie przez wagę -1 — '
    + 'inaczej pierwsza zmiana wag (albo nowy licznik z plusem) pozwala botowi się zabić');
  for (const wzorzec of [/tough - 1 <= 0 \? 6 : 2/, /tough - 1 <= 0 \? 4 : 2/]) {
    assert.match(doKonca, wzorzec,
      `dokładka -1/-1 musi rozróżniać dobicie od zwykłej dokładek (szukane: ${wzorzec})`);
  }
  assert.match(doKonca, /permanent\.toughness \?\? 0/,
    'wytrzymałość czytana z widoku (efektywna), nie z definicji karty');
});

test('M336/G: enumeracja ofert w silniku — komentarz nie może obiecywać „pierwsza = WSZYSTKO"', () => {
  const gs = readFileSync(new URL('../src/engine/game-state.js', import.meta.url), 'utf8');
  const from = gs.indexOf("activeProliferate) {");
  assert.notEqual(from, -1, 'blok enumeracji proliferate istnieje');
  const blok = gs.slice(from, gs.indexOf('for (const chosen of ordered)', from));
  assert.ok(blok.length > 100, 'wycinek bloku znaleziony');
  assert.equal(/Pierwsza oferta = WSZYSTKO/.test(blok), false,
    'kolejność ofert NIE jest polityką bota — komentarz, który to obiecywał, '
    + 'opisywał stan przeciwny do kodu i był gotówką na samobójcze proliferacje (M336)');
});
