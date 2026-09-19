// =============================================================================
// B (zgłoszenie właściciela 2026-09-19b) — You're Not Alone:
//
//   „W »Rozgrywce« pokazuje mi się tylko »…zostaje rozstrzygnięty«, a nie ma
//    efektu czaru, który jest w logu."
//
// Objaw: gracz rzuca własny pump (druga tura, obaj pasują — auto-pass), modal
// „Rozgrywka" pokazuje rzut i rozstrzygnięcie, ale POMIJA skutek, choć log
// partii ma linię „Colossodon Yearling dostaje +4/+4". Gracz grający przez
// modale (telefon) nie wie, że jego stwór urósł.
//
// Root cause: bramka szumu modala (`isBotMoveNoise`, session.js) przepuszcza
// `stats_modified` TYLKO w dwóch wypadkach: (M99) rozstrzyga się czar bota
// (`!botActing && stackSize > 0`) albo (M255/A) zdarzenie niesie
// `untilEndOfTurn === true` — „P/T przelicza się przy każdym zdarzeniu, ale
// buff do końca tury jest skutkiem". Pump szedł jednak przez `modifyStats`
// (permanents.js), które jako JEDYNE ze wszystkich emitentów `stats_modified`
// nie stawiało tej flagi (set_base_pt_*, mass buffy, kopia, untap-lock —
// wszystkie niosą swoje znaczniki). Zdarzenie było więc nierozróżnialne od
// przeliczenia P/T i leciało do kosza.
//
// Fix u root cause: `modifyStats` stempluje `untilEndOfTurn: true` — jego
// modyfikatory naprawdę żyją do końca tury (cleanup je zeruje, CR 611.2a),
// a nie „na stałe". Reguła pozostaje generyczna (ADR 0002): dotyczy każdego
// przyszłego efektu idącego przez `modifyStats`, nie tylko tej karty.
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import {
  BOT_ID, HUMAN_ID, createSession, describeGameEvent, isBotMoveNoise,
} from '../src/table/session.js';

const REGISTRY = createCardRegistry();
const SESSION_HELPERS = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? id,
  nameOfObject: (id) => REGISTRY.get(String(id).split('#')[0])?.name ?? id,
  cardDetails: (id) => REGISTRY.get(id),
  abilitiesOf: (id) => gameObjectDataOf(REGISTRY.get(id)).abilities ?? [],
  colorsOf: () => [],
};

let counter = 0;

/** Stół silnika: trzy stwory (upgrade „+4/+4 instead”) + pump w ręce + {W}. */
function pumpBoard() {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  const put = (cardId, zone, controllerId = 'p1') => {
    const def = REGISTRY.get(cardId);
    assert.ok(def, `karta ${cardId} istnieje`);
    const data = gameObjectDataOf(def);
    const id = `${cardId}#${counter += 1}`;
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
      kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
      abilities: data.abilities ?? [], keywords: def.keywords ?? [], types: def.types ?? [],
      cardName: def.name, spell: def.spell,
    });
    return id;
  };
  put('basic-plains', 'battlefield');
  const cel = put('dawntreader-elk', 'battlefield');
  put('dawntreader-elk', 'battlefield');
  put('dawntreader-elk', 'battlefield');
  const spellId = put('youre-not-alone', 'hand');
  addMana(state, 'p1', 1, { colors: ['W'] });
  return { state, cel, spellId };
}

test('B/1: pump emituje stats_modified z untilEndOfTurn (skutek do końca tury)', () => {
  const { state, cel, spellId } = pumpBoard();
  const cast = execute(state, {
    type: 'cast_spell', playerId: 'p1', cardId: 'youre-not-alone', objectId: spellId, targets: [cel],
  });
  assert.ok(cast.ok, 'rzut przechodzi');
  // Rozstrzygnięcie następuje po spasowaniu przez OBU graczy.
  let tail = [];
  for (let i = 0; i < 4 && state.zones.stack.length > 0; i += 1) {
    const who = state.turn.priorityPlayerId ?? 'p2';
    const r = execute(state, { type: 'pass_priority', playerId: who });
    assert.ok(r.ok, `pass ${who} przechodzi`);
    tail = tail.concat(r.events ?? []);
  }
  const pump = tail.find((e) => e.type === 'stats_modified');
  assert.ok(pump, 'rozstrzygnięcie emituje stats_modified (efekt widać w logu)');
  assert.equal(pump.untilEndOfTurn, true,
    'modyfikatory modifyStats żyją do końca tury — zdarzenie musi to nieść, inaczej bramka modala bierze je za szum P/T');
  assert.equal(pump.powerModifier, 4, 'upgrade „+4/+4 instead” (3 stwory)');
  assert.equal(pump.toughnessModifier, 4, 'upgrade „+4/+4 instead” (3 stwory)');
});

test('B/2: buff do końca tury jest TREŚCIĄ modala (a przeliczenie P/T nadal szumem)', () => {
  const pump = {
    type: 'stats_modified', objectId: 'dawntreader-elk#9', powerModifier: 4, toughnessModifier: 4,
    untilEndOfTurn: true,
  };
  // Rozstrzygnięcie czaru CZŁOWIEKA wywołane auto-passem: botActing jest wtedy
  // PRAWDĄ i stare kryterium M99 (`!botActing && stackSize > 0`) nie działa —
  // skutek musi wejść na wyjątku „do końca tury”.
  assert.equal(isBotMoveNoise(pump, { botActing: true, stackSize: 1 }), false,
    'pump przy auto-passie nie może być szumem');
  assert.equal(isBotMoveNoise(pump, { botActing: false, stackSize: 1 }), false,
    'pump w oknie rozstrzygania nie może być szumem');
  // Strażnik drugiej strony: zwykłe przeliczenie P/T (bez flagi) zostaje
  // szumem, gdy nie rozstrzyga się żaden czar — inaczej modal zaleje log.
  assert.equal(isBotMoveNoise({ type: 'stats_modified', objectId: 'x', powerModifier: 0, toughnessModifier: 0 },
    { botActing: true, stackSize: 0 }), true,
    'przeliczenie P/T poza oknem rozstrzygania zostaje szumem');
  // Opis zdarzenia (wspólny dla logu i modala — parytet treści).
  const text = describeGameEvent(pump, SESSION_HELPERS, undefined, { drugaOsoba: false });
  assert.match(text, /Dawntreader Elk dostaje \+4\/\+4/,
    'zdarzenie niesie modyfikatory, więc opis nazywa stwora i kwotę');
});

/**
 * Rozgrywa partię do momentu, w którym CZŁOWIEK ma na polu bitwy stwora
 * i czysty stos w swojej fazie głównej — wtedy dokładamy pump do ręki.
 * (Deterministyczne: stały seed + stałe talie.)
 */
function reachHumanMainWithCreature(session) {
  const FIRST = (view, type) => view.legalCommands.find((c) => c.type === type) ?? null;
  for (let i = 0; i < 300; i += 1) {
    if (session.botPausePending) { session.clearBotMoves(); session.continueBotPlay(); continue; }
    if (session.state.status !== 'active') return false;
    const view = session.view();
    const mine = session.state.zones.battlefield.filter((id) => {
      const o = session.state.objects.get(id);
      return o?.controllerId === HUMAN_ID && o.kind === 'creature';
    });
    const canAct = view.legalCommands.some((c) => c.type === 'cast_spell' || c.type === 'play_land');
    if (view.playerId === HUMAN_ID && mine.length > 0 && session.state.zones.stack.length === 0 && canAct) return true;
    const cmd = FIRST(view, 'keep_hand') ?? FIRST(view, 'play_land') ?? FIRST(view, 'cast_permanent')
      ?? FIRST(view, 'declare_attackers') ?? FIRST(view, 'declare_blockers') ?? FIRST(view, 'resolve_combat')
      ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? FIRST(view, 'pass_priority');
    if (!cmd || !session.apply(cmd).ok) return false;
  }
  return false;
}

test('B/3: skutek czaru CZŁOWIEKA widać w modalu „Rozgrywka" (nie tylko log)', () => {
  let checked = 0;
  // L25 (B4/M391): tarkir-bg (talia CZŁOWIEKA w tym pinie) dostała Hooting
  // Mandrills — seed 3 nie dobiera już Omenspeakera pod pump w oknie modala.
  // Hunter 2..12: 2 daje ten sam scenariusz (42 i 17 zostają bez zmian).
  for (const seed of [2, 42, 17]) {
    const decks = new Map([
      [HUMAN_ID, parseDeckText(fs.readFileSync('decks/tarkir-bg.txt', 'utf8'), REGISTRY).cardIds],
      [BOT_ID, parseDeckText(fs.readFileSync('decks/warhammer-ubr.txt', 'utf8'), REGISTRY).cardIds],
    ]);
    const session = createSession({ registry: REGISTRY, decks, seed, pauseOnBotMoves: true });
    if (!reachHumanMainWithCreature(session)) continue;
    // Wstrzykujemy pump + {W} (stan stołu jest już legalny — dostawiamy kartę
    // do ręki gracza i białe źródło many w puli).
    const def = REGISTRY.get('youre-not-alone');
    const data = gameObjectDataOf(def);
    const spellId = 'pin-pump';
    addObject(session.state, {
      id: spellId, instanceId: spellId, cardId: 'youre-not-alone', controllerId: HUMAN_ID,
      ownerId: HUMAN_ID, zone: 'hand', kind: data.kind, power: data.power, toughness: data.toughness,
      manaCost: data.manaCost, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
      types: def.types ?? [], cardName: def.name, spell: def.spell,
    });
    addMana(session.state, HUMAN_ID, 1, { colors: ['W'] });
    session.clearBotMoves();
    const cast = session.view().legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === spellId);
    assert.ok(cast, `seed ${seed}: oferta rzutu pumpa (harness)`);
    assert.ok(session.apply(cast).ok, `seed ${seed}: rzut przechodzi`);
    const modal = session.botMoves.map((m) => m.text);
    session.clearBotMoves();
    // Auto-pass człowieka + odpowiedź bota domykają rozstrzygnięcie.
    for (let i = 0; i < 6 && session.state.zones.stack.length > 0; i += 1) {
      const pass = session.view().legalCommands.find((c) => c.type === 'pass_priority');
      if (!pass) break;
      session.apply(pass);
      for (const m of session.botMoves) modal.push(m.text);
      session.clearBotMoves();
    }
    // Kontra (Negate) legalnie kończy czar bez skutku — wtedy nie ma czego
    // sprawdzać (scenariusz rozstrzygnięcia po prostu się nie wydarzył).
    const castLine = modal.find((t) => t.startsWith("Rzucasz You're Not Alone"));
    if (!castLine) continue;
    if (!modal.some((t) => t.includes("You're Not Alone zostaje rozstrzygnięty"))) continue;
    const logLines = session.log.map((l) => l.text ?? String(l));
    const effectInLog = logLines.filter((t) => /dostaje \+\d+\/\+\d+/.test(t));
    assert.ok(effectInLog.length > 0, `seed ${seed}: log nie opisał skutku pumpa (założenie testu)`);
    checked += 1;
    for (const line of effectInLog) {
      assert.ok(modal.includes(line),
        `seed ${seed}: log zna „${line}”, a modal „Rozgrywka” milczy (zgłoszenie B: gracz gra przez modale)`);
    }
  }
  assert.ok(checked > 0, 'żaden seed nie wyprodukował rozstrzygniętego pumpa człowieka — test nic nie sprawdził');
});
