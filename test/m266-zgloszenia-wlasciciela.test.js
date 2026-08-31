// M266 — zgłoszenia właściciela z rozgrywki (2026-08-31).
//
// A.  Boks cmentarza na stole ma czyste czarne tło (#000) — „nie wygląda
//     najlepiej", ma być jaśniejszy szary.
// B.  „Nieprzyjaciel rzuca Liliana's Triumph → cel: Ty" — a karta NIE MA
//     celu. Oracle: „Each opponent sacrifices a creature of their choice."
//     Brak słowa „target" ⇒ czar bezcelowy (CR 115.1: tylko czar, który
//     mówi „target", ma cele). Modelowanie jako `targets: [{type:'player'}]`
//     zmienia reguły: czar dawał się kontrować przez usunięcie celu,
//     fizzlował przy hexproof/shroud gracza i pokazywał nieistniejący wybór.
// C1. Terminal Agony rzucona z madness: panel pokazywał generyczne
//     „Wybierz: Wariant (5 opcji)" — brak deskryptora grupy.
// C2. Terminal Agony z madness rzucana DWUKROTNIE: dwa modale i dwie linie
//     w logu, choć czar poszedł na stos raz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { choiceGroupTitle } from '../src/table/render.js';

const REGISTRY = createCardRegistry();
const SESSION = { nameOf: (id) => REGISTRY.get(id)?.name ?? String(id), nameOfObject: (id) => String(id) };

function put(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

function game(playerId = 'p1') {
  const state = createGameState({ seed: 266, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

/** Jasność względna #rrggbb (0 = czarny, 1 = biały). */
function lightness(hex) {
  const v = parseInt(hex.slice(1), 16);
  return (0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255;
}

// ---------------------------------------------------------------------------
// A — tło boksu cmentarza
// ---------------------------------------------------------------------------

test('M266/A: boks cmentarza nie jest czarny — czytelny ciemny szary', () => {
  const css = fs.readFileSync('src/table/index.html', 'utf8');
  const rule = css.match(/\.zone-box-grave\s*\{([^}]*)\}/);
  assert.ok(rule, 'brak reguły .zone-box-grave');
  const bg = rule[1].match(/background:\s*(#[0-9a-fA-F]{3,6})/);
  assert.ok(bg, 'boks cmentarza ma jawne tło');
  const hex = bg[1].length === 4
    ? `#${bg[1][1]}${bg[1][1]}${bg[1][2]}${bg[1][2]}${bg[1][3]}${bg[1][3]}`
    : bg[1];
  const l = lightness(hex);
  assert.ok(l > 0.05, `tło cmentarza ma być szare, nie czarne (jest ${hex})`);
  // …ale nadal wyraźnie ciemniejsze od wygnania (#0369a1) — cmentarz zostaje
  // wizualnie „ciemną" strefą, zgodnie z decyzją z M262.
  assert.ok(l < 0.35, `tło cmentarza pozostaje ciemne (jest ${hex})`);
});

// ---------------------------------------------------------------------------
// B — Liliana's Triumph nie ma celu (CR 115.1)
// ---------------------------------------------------------------------------

test("M266/B: Liliana's Triumph nie deklaruje CELU (Oracle bez słowa „target\")", () => {
  const def = REGISTRY.get('lilianas-triumph');
  assert.ok(def, 'karta w rejestrze');
  assert.ok(!/\btarget\b/i.test(def.oracleText), 'Oracle rzeczywiście nie mówi „target"');
  assert.deepEqual(def.spell?.targets ?? [], [],
    'czar bez „target" w Oracle nie może mieć celów (CR 115.1)');
});

test("M266/B: rzut Liliana's Triumph nie wymaga wskazania celu i przeciwnik poświęca", () => {
  const state = game('p1');
  put(state, 'lt', 'lilianas-triumph', 'p1', 'hand');
  put(state, 'ich', 'giant-spider', 'p2');
  addMana(state, 'p1', 4, { colors: ['B'] });

  const view = playerView(state, 'p1');
  const offers = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'lt');
  assert.equal(offers.length, 1, `czar bezcelowy ma DOKŁADNIE jedną ofertę, jest: ${offers.length}`);
  assert.deepEqual(offers[0].targets ?? [], [], 'oferta nie niesie celu');

  const cast = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'lt', targets: [] });
  assert.ok(cast.ok, cast.events?.[0]?.reason);
  const spellCast = cast.events.find((e) => e.type === 'spell_cast');
  assert.deepEqual(spellCast?.targets ?? [], [], 'zdarzenie rzutu nie niesie celu (log bez „→ cel: Ty")');

  for (let i = 0; i < 6 && state.zones.stack.length > 0 && !state.pendingSacrifice; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  assert.ok(state.pendingSacrifice, 'przeciwnik dostaje decyzję poświęcenia');
  assert.equal(state.pendingSacrifice.playerId, 'p2', 'poświęca PRZECIWNIK (each opponent)');
});

test("M266/B: bezcelowy czar działa mimo hexproof gracza (nie da się „usunąć celu\")", () => {
  // Anty-over-fix i dowód, że to zmiana REGUŁ, nie kosmetyka: czar bez celu
  // ignoruje ochronę celowania (CR 115.6 dotyczy tylko celów).
  const state = game('p1');
  put(state, 'lt', 'lilianas-triumph', 'p1', 'hand');
  put(state, 'ich', 'giant-spider', 'p2');
  state.players = state.players.map((p) => (p.id === 'p2' ? { ...p, hexproof: true } : p));
  addMana(state, 'p1', 4, { colors: ['B'] });
  const cast = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'lt', targets: [] });
  assert.ok(cast.ok, `rzut nie może zależeć od celowalności gracza: ${cast.events?.[0]?.reason}`);
});

// ---------------------------------------------------------------------------
// C — Terminal Agony (madness)
// ---------------------------------------------------------------------------

function madnessPending() {
  const state = game('p1');
  put(state, 'ta', 'terminal-agony', 'p1', 'exile');
  put(state, 'spider', 'giant-spider', 'p2');
  state.objects.set('ta', Object.freeze({ ...state.objects.get('ta'), madnessReady: true }));
  state.pendingMadnessCast = {
    playerId: 'p1', objectId: 'ta', cardId: 'terminal-agony', restorePriorityTo: 'p1',
  };
  addMana(state, 'p1', 6, { colors: ['B', 'R'] });
  return state;
}

test('M266/C1: decyzja rzutu z madness ma własny deskryptor grupy (nie „Wariant")', () => {
  const state = madnessPending();
  const view = playerView(state, 'p1');
  const options = view.legalCommands.filter((c) => c.type === 'resolve_madness_cast');
  assert.ok(options.length >= 2, 'są obie opcje (rzut i rezygnacja)');
  const title = choiceGroupTitle({ options }, SESSION, view);
  assert.doesNotMatch(title, /Wariant/, `tytuł grupy nie może być generyczny, jest: ${title}`);
  assert.match(title, /[Mm]adness/, `tytuł nazywa mechanikę, jest: ${title}`);
});

test('M266/C1 (klasa L102): CAŁA rodzina „rzuć wygnany czar" ma deskryptor grupy', () => {
  // Rodzina komend o tej samej strukturze oferty (jednorazowa decyzja
  // „rzuć albo odpuść" na karcie w wygnaniu). Brak wpisu = generyczne
  // „Wybierz: Wariant (N opcji)" — ten sam objaw, inna mechanika.
  const source = fs.readFileSync('src/table/render.js', 'utf8');
  const map = source.match(/const CHOICE_GROUP_COMMAND_DESCRIPTORS = Object\.freeze\(\{([\s\S]*?)\n\}\);/);
  assert.ok(map, 'mapa deskryptorów grup istnieje');
  const missing = ['resolve_madness_cast', 'resolve_suspend_cast', 'resolve_rebound_cast', 'resolve_epic_choice']
    .filter((key) => !new RegExp(`^\\s*${key}:`, 'm').test(map[1]));
  assert.deepEqual(missing, [], `rodzina „rzut z wygnania" bez deskryptora grupy: ${missing.join(', ')}`);
});

test('M266/C2: rzut z madness emituje spell_cast DOKŁADNIE RAZ', () => {
  const state = madnessPending();
  const view = playerView(state, 'p1');
  const cmd = view.legalCommands.find((c) => c.type === 'resolve_madness_cast' && c.cast);
  assert.ok(cmd, 'oferta rzutu istnieje');
  const result = execute(state, cmd);
  assert.ok(result.ok, result.events?.[0]?.reason);
  const inResult = result.events.filter((e) => e.type === 'spell_cast');
  assert.equal(inResult.length, 1,
    `czar poszedł na stos raz, więc log/modal dostaje JEDNO zdarzenie (jest ${inResult.length})`);
  const inState = state.events.filter((e) => e.type === 'spell_cast');
  assert.equal(inState.length, 1, 'stan gry też ma jedno zdarzenie rzutu');
  assert.equal(state.zones.stack.length, 1, 'na stosie jest jeden czar');
});

test('M266/B (klasa): żadna karta nie ma `targets` bez słowa „target" w Oracle', () => {
  // Root cause zgłoszenia B: Liliana's Triumph („Each opponent sacrifices…")
  // była modelowana przez `targets: [{ type: 'player', opponent: true }]` —
  // skrót działający na 1v1, ale zmieniający REGUŁY (CR 115.1/115.6: czar bez
  // celów nie fizzluje przy hexproof i nie da się go zepsuć usunięciem celu).
  // Ten strażnik jest KLASOWY (L101/2): enumeruje katalog zamiast pinować
  // jedną kartę, więc następna karta „each opponent" nie prześliźnie się.
  const registry = createCardRegistry();
  const offenders = [];
  for (const card of registry.all()) {
    const hasTargetWord = /\btarget/i.test(card.oracleText ?? '');
    if (hasTargetWord) continue;
    const specs = [
      ['spell', card.spell],
      ...(card.activated ?? []).map((a, i) => [`activated[${i}]`, a]),
      ...(card.triggered ?? []).map((a, i) => [`triggered[${i}]`, a]),
    ];
    for (const [where, spec] of specs) {
      if (spec?.targets?.length) offenders.push(`${card.id} (${where})`);
    }
  }
  assert.deepEqual(offenders, [],
    'karty z `targets`, choć Oracle nie zawiera słowa „target" — zakres należy '
    + 'do EFEKTU (scope), nie do listy celów');
});
