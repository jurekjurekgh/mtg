// Audyt PR #130 (ADR 0020 pkt 2) — piny RED dla znalezisk A/B/C.
//
// Znalezione w audycie diffu `8af0c7c..0b49b12` (Batch 57 + zgłoszenia
// właściciela z gry), wszystkie trzy w kodzie, który PR #130 DODAŁ:
//
//  A. Delve na PERMANENCIE: bramka oferty wymagała `delveLimit > 0`, więc przy
//     PUSTYM grobie Hooting Mandrills nie miał żadnej oferty rzutu — gracz nie
//     mógł zapłacić pełnego {5}{G}. CR 702.66a: „For each generic mana in this
//     spell's total cost, you MAY exile a card from your graveyard rather than
//     pay that mana” — wygnanie jest OPCJONALNE, więc brak materiału nie
//     odbiera rzutu (ścieżka czarów w spells.js miała to poprawnie — rozjazd
//     bliźniaczych bramek, klasa L107).
//
//  B. Limit wygnania liczony z kosztu WYDRUKOWANEGO, a CR 702.66a/66b mówi o
//     części generycznej kosztu CAŁKOWITEGO (po obniżkach, „applies only after
//     the total cost … is determined”; ruling KTK 2021-03-19: „you can't exile
//     more cards than the generic mana requirement … unless an effect has
//     increased its cost”). Skutek: przy reduktorze gracz mógł wygnać więcej
//     kart, niż wynosi koszt — `manaSpent` stawał się ujemny, `spendMana`
//     rzucała RangeError, a ponieważ wygnanie kosztu szło PRZED płatnością,
//     odrzucona komenda zostawiała karty w exile (mutacja stanu komendą
//     nielegalną — dokładnie to, przed czym chroni atomowość `spendMana`).
//
//  C. `instantSorceryCastThisTurnByPlayer` (Baral and Kari Zev, „your first
//     instant or sorcery spell each turn”, ruling TDC 2023-04-14) nie był
//     zerowany przy zmianie tury — blok resetów w game-state.js zeruje
//     `spellsCastThisTurnByPlayer`, `cardsDrawnThisTurn`, `landEnteredThisTurn`
//     i resztę, ale nie ten licznik. Trigger odpalał RAZ NA PARTIĘ.
//
// Źródła reguł (ADR 0030): CR 702.66a-c, CR 118.7/601.2f (koszt całkowity),
// rulingi Scryfall KTK 2021-03-19 (Hooting Mandrills) i TDC 2023-04-14 (Baral).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { delveExileLimit } from '../src/engine/spells.js';

const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 130, players: players.map((id) => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of players) for (let i = 0; i < 4; i++) put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
  return state;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand') {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  return state.objects.get(id);
}

const commands = (s, p = s.turn.priorityPlayerId) => playerView(s, p).legalCommands;
const find = (s, cardId, zone = 'battlefield') => [...s.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
const player = (s, id) => s.players.find((p) => p.id === id);
const reasonOf = (r) => r?.events?.find((e) => e.type === 'command_rejected')?.reason ?? '';

function run(s, cmd) {
  assert.ok(cmd, 'oferta komendy istnieje');
  const r = execute(s, cmd);
  assert.ok(r.ok, `komenda przyjęta (${reasonOf(r)})`);
  return r;
}

function resolve(s) {
  for (let i = 0; s.zones.stack.length && i < 40; i += 1) {
    const choices = commands(s);
    run(s, choices.find((c) => c.type.startsWith('resolve_')) ?? choices.find((c) => c.type === 'pass_priority'));
  }
  assert.equal(s.zones.stack.length, 0, 'cały stos rozstrzygnięty');
}

/** Oddaje priorytet, aż `gotowe()` zwróci true (decyzje tworzone PRZEZ trigger). */
function passUntil(s, gotowe, limit = 8) {
  for (let i = 0; i < limit && !gotowe(); i += 1) {
    run(s, commands(s).find((c) => c.type === 'pass_priority'));
  }
  assert.ok(gotowe(), `warunek osiągnięty w ${limit} passach`);
}

/** Rozstrzyga stos bez dotykania decyzji darmowego rzutu z ręki (Baral). */
function resolveIgnoringHandFreeCast(s) {
  for (let i = 0; s.zones.stack.length && i < 40; i += 1) {
    const choices = commands(s);
    const pick = choices.find((c) => c.type.startsWith('resolve_') && c.type !== 'resolve_hand_free_cast')
      ?? choices.find((c) => c.type === 'pass_priority');
    assert.ok(pick, 'jest czym rozstrzygnąć stos');
    run(s, pick);
  }
}

/** Karty własnego grobu — materiał kosztu delve. */
function delveFodder(s, count, playerId = 'p1') {
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    put(s, `fodder-${i}`, 'basic-swamp', playerId, 'graveyard');
    ids.push(`fodder-${i}`);
  }
  return ids;
}

/**
 * Syntetyczny reduktor kosztu (wzorzec test/real-cards-batch57.test.js i
 * test/cost-reduction-alt-costs.test.js): „czary tego typu kosztują {1} mniej”
 * — reguła po deskryptorze `costModifier`, nie po nazwie karty (ADR 0002).
 */
function reducer(s, spellTypes) {
  addObject(s, {
    id: 'reducer', instanceId: 'i-reducer', cardId: 'x-reducer', controllerId: 'p1',
    zone: 'battlefield', kind: 'artifact', manaCost: 2, keywords: [], subtypes: [],
    types: ['Artifact'], colors: [], cardName: 'Reduktor',
    abilities: [Object.freeze({
      type: 'static', costModifier: Object.freeze({ spellTypes, amount: 1 }),
      cost: null, effect: null, trigger: null,
    })],
  });
}

const delveOffer = (s, objectId = 'mandrills') => commands(s)
  .find((c) => c.type === 'cast_permanent' && c.objectId === objectId);
const delveResolve = (exileIds) => ({ type: 'resolve_delve_exile', playerId: 'p1', exileIds });

// ---------------------------------------------------------------------------
// ZNALEZISKO A — pusty grób nie odbiera rzutu za pełny koszt (CR 702.66a).
// ---------------------------------------------------------------------------
test('audyt PR130/A: Hooting Mandrills przy PUSTYM grobie jest rzucalny za {5}{G}', () => {
  const s = game();
  put(s, 'mandrills', 'hooting-mandrills');
  assert.equal(s.zones.graveyard.length, 0, 'grób pusty — delve nie ma materiału');
  addMana(s, 'p1', 6, { colors: ['G'] });

  const offer = delveOffer(s);
  assert.ok(offer, 'oferta rzutu istnieje: wygnanie jest OPCJONALNE („you may exile”)');

  const r = execute(s, offer);
  assert.ok(r.ok, `deklaracja przyjęta (${reasonOf(r)})`);
  assert.equal(s.pendingDelveExile, null,
    'bez kart w grobie nie ma czego wybierać — decyzja bez alternatywy domyka się sama');
  resolve(s);
  assert.ok(find(s, 'hooting-mandrills'), 'stwór wszedł na pole bitwy');
  assert.equal(player(s, 'p1').mana, 0, 'zapłacono pełne 6 many');
  assert.equal(s.zones.exile.length, 0, 'nic nie wygnano');
});

// ---------------------------------------------------------------------------
// ZNALEZISKO B — limit = część generyczna kosztu CAŁKOWITEGO (CR 702.66a/b).
// ---------------------------------------------------------------------------
test('audyt PR130/B: limit wygnania permanentu z delve liczy się PO obniżce kosztu', () => {
  const s = game();
  reducer(s, ['Creature']); // {5}{G} → koszt całkowity {4}{G}
  const fodder = delveFodder(s, 6);
  put(s, 'mandrills', 'hooting-mandrills');
  addMana(s, 'p1', 1, { colors: ['G'] }); // opłacalne tylko k ≥ 4 (5 − k ≤ 1)

  assert.equal(delveExileLimit(s, 'p1', s.objects.get('mandrills')), 4,
    'limit = część generyczna kosztu całkowitego (4), nie wydrukowana (5) — CR 702.66a');

  run(s, delveOffer(s));
  const pending = playerView(s, 'p1').pendingDelveExile;
  assert.equal(pending.maxExile, 4, 'decyzja niesie limit z kosztu całkowitego');
  assert.deepEqual(pending.affordableCounts, [4], 'jedyny opłacalny wariant to k=4 (L48)');

  // Piąta karta to wygnanie ponad część generyczną kosztu całkowitego —
  // odrzucenie ma być REGUŁĄ, nie awarią płatności (ujemna mana → RangeError).
  const r5 = execute(s, delveResolve(fodder.slice(0, 5)));
  assert.equal(r5.ok, false, '5 kart przy koszcie {4}{G} jest nielegalne');
  assert.match(reasonOf(r5), /Nieprawidłowy koszt Delve/, 'odrzucenie regułą Delve, nie błędem płatności');
  assert.equal(s.zones.exile.length, 0, 'odrzucona komenda NIC nie mutuje (koszt atomowy, CR 601.2h)');
  assert.equal(s.zones.graveyard.length, 6, 'grób nietknięty po odrzuceniu');
  assert.ok(s.pendingDelveExile, 'decyzja nadal czeka — gracz może wybrać legalnie');

  assert.ok(execute(s, delveResolve(fodder.slice(0, 4))).ok, 'k=4 przyjęte');
  resolve(s);
  assert.ok(find(s, 'hooting-mandrills'), 'rzut domknięty');
  assert.equal(player(s, 'p1').mana, 0, 'zapłacono 1 many (4 po obniżce − 4 wygnane... plus {G} z puli)');
  assert.equal(s.zones.exile.length, 4, 'wygnano dokładnie tyle, ile wynosi część generyczna kosztu całkowitego');
});

test('audyt PR130/B2: ścieżka CZARU z delve — ten sam limit po obniżce (bliźniacza bramka)', () => {
  const s = game();
  reducer(s, ['Instant']);
  const fodder = delveFodder(s, 5);
  // Karta spoza MANA_COSTS: część generyczna bierze się z `manaCost` (CR 202.3)
  // — ten sam przypadek co test B57/66 dla ścieżki czaru.
  addObject(s, {
    id: 'bolt', instanceId: 'i-bolt', cardId: 'x-delve-bolt', controllerId: 'p1', zone: 'hand',
    kind: 'spell', manaCost: 5, keywords: [], subtypes: [], types: ['Instant'], colors: [],
    cardName: 'Delve Bolt', delve: true,
    spell: Object.freeze({ timing: 'instant', targets: [], effects: Object.freeze([{ type: 'draw_cards', amount: 1 }]) }),
  });
  // Zero many: opłacalny jest wyłącznie wariant, w którym koszt generyczny
  // (4 po obniżce) pokrywa wygnanie — k=5 byłoby ponad limit i dało −1 many.
  assert.equal(delveExileLimit(s, 'p1', s.objects.get('bolt')), 4, 'limit czaru też z kosztu całkowitego');
  const cast = commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'bolt');
  assert.ok(cast, 'oferta rzutu czaru z delve (L48)');
  run(s, cast);
  const pending = playerView(s, 'p1').pendingDelveExile;
  assert.deepEqual(pending.affordableCounts, [4], 'opłacalne tylko k=4');

  const r5 = execute(s, delveResolve(fodder));
  assert.equal(r5.ok, false, '5 kart przy koszcie {4} jest nielegalne');
  assert.match(reasonOf(r5), /Nieprawidłowy koszt Delve/, 'odrzucone regułą, nie awarią spendMana');
  assert.equal(s.zones.exile.length, 0, 'odrzucona komenda nie wygania kart z grobu');

  assert.ok(execute(s, delveResolve(fodder.slice(0, 4))).ok, 'k=4 przyjęte');
  resolve(s);
  assert.equal(s.zones.exile.length, 4, 'czar zapłacony wygnaniem 4 kart');
  assert.equal(player(s, 'p1').mana, 0, 'zero many do zapłacenia');
  assert.ok(find(s, 'x-delve-bolt', 'graveyard'), 'czar rozstrzygnięty');
});

test('audyt PR130/B3: komenda z `delveExileIds` wprost — limit pilnowany bez decyzji', () => {
  // Protokół pozwala wysłać `cast_permanent` z gotowym kosztem Delve (bot,
  // fuzzer, wizard) — wtedy `pendingDelveExile` nie istnieje i JEDYNĄ bramką
  // jest walidacja płatności (L48: oferta = walidacja, a nie „decyzja pilnuje”).
  const s = game();
  reducer(s, ['Creature']); // {5}{G} → koszt całkowity {4}{G}
  const fodder = delveFodder(s, 6);
  put(s, 'mandrills', 'hooting-mandrills');
  addMana(s, 'p1', 5, { colors: ['G'] });

  const over = execute(s, {
    type: 'cast_permanent', playerId: 'p1', objectId: 'mandrills',
    delveExileIds: fodder.slice(0, 5),
  });
  assert.equal(over.ok, false, '5 wygnań przy części generycznej 4 → odrzucone');
  assert.match(reasonOf(over), /część generyczn[ae] kosztu całkowitego/, 'powód nazywa regułę Delve');
  assert.equal(s.zones.exile.length, 0, 'odrzucona komenda NIE wygania kart (koszt atomowy)');
  assert.equal(s.zones.graveyard.length, 6, 'grób nietknięty');
  assert.equal(player(s, 'p1').mana, 5, 'mana nietknięta');
  assert.equal(s.objects.get('mandrills').zone, 'hand', 'karta zostaje w ręce');

  const ok = execute(s, {
    type: 'cast_permanent', playerId: 'p1', objectId: 'mandrills',
    delveExileIds: fodder.slice(0, 4),
  });
  assert.ok(ok.ok, `k=4 przyjęte wprost z komendy (${reasonOf(ok)})`);
  resolve(s);
  assert.ok(find(s, 'hooting-mandrills'), 'stwór wszedł');
  assert.equal(s.zones.exile.length, 4, 'wygnane dokładnie 4 karty');
});

test('audyt PR130/B4: koszt alternatywny (morph) — strażnik sumy przed mutacją', () => {
  // CR 702.66a: limit to część generyczna kosztu CAŁKOWITEGO. Przy koszcie
  // alternatywnym (morph {3}) wydrukowana część generyczna ({5}) przeszacowuje
  // limit, więc twardy strażnik sumy musi odrzucić rzut PRZED wygnaniem kart —
  // inaczej `spendMana` rzucała RangeError po mutacji (audyt PR #130, B).
  const s = game();
  reducer(s, ['Creature']);
  const fodder = delveFodder(s, 6);
  addObject(s, {
    id: 'morphdelve', instanceId: 'i-morphdelve', cardId: 'x-morph-delve', controllerId: 'p1',
    zone: 'hand', kind: 'creature', manaCost: 6, power: 4, toughness: 4, keywords: [],
    subtypes: [], types: ['Creature'], colors: ['G'], cardName: 'Morph Delve', delve: true,
    morph: Object.freeze({ cost: 3 }),
  });
  addMana(s, 'p1', 5, { colors: ['G'] });

  const r = execute(s, {
    type: 'cast_permanent', playerId: 'p1', objectId: 'morphdelve', faceDown: true,
    delveExileIds: fodder.slice(0, 5),
  });
  assert.equal(r.ok, false, 'zakryty rzut za {2} nie przyjmie 5 wygnań');
  assert.match(reasonOf(r), /część generyczną kosztu całkowitego/, 'strażnik sumy, nie awaria płatności');
  assert.equal(s.zones.exile.length, 0, 'nic nie wygnano');
  assert.equal(s.zones.graveyard.length, 6, 'grób nietknięty');
  assert.equal(player(s, 'p1').mana, 5, 'mana nietknięta');
  assert.equal(s.objects.get('morphdelve').zone, 'hand', 'karta zostaje w ręce');

  // Legalny wariant: 2 wygnania pokrywają całe {2} kosztu morph (po obniżce).
  const ok = execute(s, {
    type: 'cast_permanent', playerId: 'p1', objectId: 'morphdelve', faceDown: true,
    delveExileIds: fodder.slice(0, 2),
  });
  assert.ok(ok.ok, `zakryty rzut z delve 2 przyjęty (${reasonOf(ok)})`);
  assert.equal(s.zones.exile.length, 2, 'koszt wygnania zapłacony');
  assert.equal(player(s, 'p1').mana, 5, 'zero many do zapłacenia — mana została');
});

test('audyt PR130/B5: rzut BEZ płacenia kosztu many nie ma czego pokryć wygnaniem', () => {
  // CR 118.7/702.66a: przy koszcie całkowitym zredukowanym do {0} (plot,
  // impuls, darmowy rzut) nie ma części generycznej, więc wygnanie kart jest
  // nielegalne — a bez strażnika sumy karty szły do exile i DOPIERO wtedy
  // `spendMana` rzucała RangeError (mutacja przy odrzuconej komendzie).
  const s = game();
  const fodder = delveFodder(s, 3);
  addObject(s, {
    id: 'plotted', instanceId: 'i-plotted', cardId: 'x-delve-plotted', controllerId: 'p1',
    zone: 'hand', kind: 'spell', manaCost: 4, keywords: [], subtypes: [], types: ['Sorcery'],
    colors: [], cardName: 'Plotted Delve', delve: true, plotted: true,
    spell: Object.freeze({ timing: 'sorcery', targets: [], effects: Object.freeze([{ type: 'draw_cards', amount: 1 }]) }),
  });
  const r = execute(s, {
    type: 'cast_spell', playerId: 'p1', objectId: 'plotted', targets: [],
    delveExileIds: fodder.slice(0, 1),
  });
  assert.equal(r.ok, false, 'przy składniku manowym {0} wygnanie nie ma czego pokryć');
  assert.match(reasonOf(r), /część generyczną kosztu całkowitego/, 'strażnik sumy, nie awaria spendMana');
  assert.equal(s.zones.exile.length, 0, 'odrzucona komenda nie wygania kart');
  assert.equal(s.zones.graveyard.length, 3, 'grób nietknięty');
  assert.equal(s.objects.get('plotted').zone, 'hand', 'karta zostaje w ręce');
});

test('audyt PR130/B6: brak many — odrzucenie PRZED wygnaniem kart (ścieżka czaru)', () => {
  // Ta sama atomowość kosztu (CR 601.2h) dla zwykłej niewypłacalności: bramka
  // `producibleMana` w `castSpell` musi stać PRZED pętlą wygnania — wcześniej
  // jedyną bramką była `spendMana`, czyli już po mutacji grobu.
  const s = game();
  const fodder = delveFodder(s, 3);
  addObject(s, {
    id: 'bolt2', instanceId: 'i-bolt2', cardId: 'x-delve-sorcery', controllerId: 'p1',
    zone: 'hand', kind: 'spell', manaCost: 4, keywords: [], subtypes: [], types: ['Sorcery'],
    colors: [], cardName: 'Delve Sorcery', delve: true,
    spell: Object.freeze({ timing: 'sorcery', targets: [], effects: Object.freeze([{ type: 'draw_cards', amount: 1 }]) }),
  });
  const r = execute(s, {
    type: 'cast_spell', playerId: 'p1', objectId: 'bolt2', targets: [],
    delveExileIds: fodder.slice(0, 1),
  });
  assert.equal(r.ok, false, 'zero many przy koszcie {4} minus 1 wygnanie = 3 do zapłacenia');
  assert.match(reasonOf(r), /Niewystarczająca mana/, 'powód mówi o manie');
  assert.equal(s.zones.exile.length, 0, 'karta grobu NIE wygnana przy nieudanej płatności');
  assert.equal(s.zones.graveyard.length, 3, 'grób nietknięty');
});

// ---------------------------------------------------------------------------
// ZNALEZISKO C — licznik „pierwszy instant/sorcery w turze” jest PER TURA.
// ---------------------------------------------------------------------------
test('audyt PR130/C: trigger Barala odpala w KAŻDEJ turze (licznik zerowany z turą)', () => {
  const s = game();
  put(s, 'baral', 'baral-and-kari-zev', 'p1', 'battlefield');
  put(s, 'i1', 'raise-the-alarm', 'p1', 'hand'); // instant MV2
  put(s, 'i2', 'brute-force', 'p1', 'hand');     // instant MV1
  addMana(s, 'p1', 4, { colors: ['R', 'W', 'G'] });

  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'i1'));
  passUntil(s, () => s.pendingHandFreeCast != null);
  assert.equal(s.instantSorceryCastThisTurnByPlayer.p1, 1, 'licznik tury rośnie przy pierwszym instant/sorcery');
  run(s, commands(s).find((c) => c.type === 'resolve_hand_free_cast' && c.decline));
  resolveIgnoringHandFreeCast(s);

  // Zmiana tury: p1 → p2 → p1 (wzorzec test/e7-a-badge-nie-odkrece-sie.test.js).
  const nextTurn = () => {
    s.turn = jumpToStep(s.turn, 'cleanup', s.turn.activePlayerId);
    for (let i = 0; i < 2; i += 1) {
      assert.ok(execute(s, { type: 'pass_priority', playerId: s.turn.priorityPlayerId }).ok, 'pass przyjęty');
    }
  };
  nextTurn();
  assert.equal(s.turn.activePlayerId, 'p2', 'tura przeciwnika');
  assert.deepEqual(s.instantSorceryCastThisTurnByPlayer, {},
    'licznik „first instant or sorcery spell each turn” zeruje się z nową turą');
  nextTurn();
  assert.equal(s.turn.activePlayerId, 'p1', 'znowu tura p1');

  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p1';
  s.turn.passes = 0;
  put(s, 'i3', 'raise-the-alarm', 'p1', 'hand');
  put(s, 'i4', 'brute-force', 'p1', 'hand');
  addMana(s, 'p1', 4, { colors: ['R', 'W', 'G'] });

  const before = s.events.filter((e) => e.type === 'hand_free_cast_required').length;
  assert.equal(before, 1, 'w turze 1 trigger odpalił raz');
  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'i3'));
  passUntil(s, () => s.pendingHandFreeCast != null);
  assert.equal(s.events.filter((e) => e.type === 'hand_free_cast_required').length, before + 1,
    'pierwszy instant/sorcery NOWEJ tury odpala trigger znowu (ruling TDC 2023-04-14)');
  assert.equal(s.instantSorceryCastThisTurnByPlayer.p1, 1, 'licznik nowej tury liczy od zera');
});
