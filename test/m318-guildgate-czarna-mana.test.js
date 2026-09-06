// M318 — zgloszenie wlasciciela (2026-09-06, cz. 5 / NA3):
// „Dimir Guildgate moze produkowac czarna albo niebieska mane. Mam czarny czar
// za 1 czarnej many, nie mam Swampow, mam nietapnietego Dimir Guildgate i nie
// dostaje w opcjach Twoje Dzialania mozliwosci rzucenia tego czarnego czaru”.
//
// Diagnoza: silnik jest zgodny z CR — bramka jako nietapniety dual (U/B) pokrywa
// czarny pip i pojawia sie w ofercie rzutu (deskryptor zrodel M193/A). Skan
// 10240 kombinacji (bramka x landy x pule x czarne czary talii ravnica) nie
// znalazl zadnego brakujacego oferu. Dwa wyjasnienia zgloszenia:
//  1) czar {1}{B} (Lilianas Triumph/Severed Strands w ravnica) kosztuje 2 many —
//     sama bramka daje tylko 1, wiec brak oferty jest poprawny (CR 107.4a);
//  2) bramka z entersTapped w turze wejscia jest tapnieta → zero many.
// Ten test utrwala SEMANTYKE (pips {B} z dual landa bez Swampow) jako gvardian
// przed regresja w planerze pipow / zrodlach many.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { untapObject } from '../src/engine/permanents.js';
import { addMana } from '../src/engine/resources.js';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import fs from 'node:fs';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 318, players: [{ id: 'p1' }, { id: 'p2' }] });
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

// addObject gubi pola stanu bojowego (kontrakt L21) — tap nadajemy po dodaniu.
function setTapped(state, id, tapped) {
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped }));
}

function spellOffered(state, objectId) {
  const view = playerView(state, 'p1');
  return view.legalCommands.some(
    (c) => (c.type === 'cast_spell' || c.type === 'cast_permanent') && c.objectId === objectId,
  );
}

test('M318/A: bramka jako jedyne zrodlo pokrywa pip {B} — czar za {B} jest oferowany', () => {
  const state = game();
  putCard(state, 'gate', 'dimir-guildgate', 'p1');
  setTapped(state, 'gate', false);
  const rats = putCard(state, 'rats', 'typhoid-rats', 'p1', 'hand'); // {B}, creature, bez celow
  assert.equal(spellOffered(state, rats.id), true, 'czar/kreatura za {B} oferowana z samego dual landa');
});

test('M318/B: {1}{B} przy samej bramce NIE jest oferowany (2 many), po dolozenu landa — tak', () => {
  const state = game();
  putCard(state, 'gate', 'dimir-guildgate', 'p1');
  setTapped(state, 'gate', false);
  const lil = putCard(state, 'lil', 'lilianas-triumph', 'p1', 'hand'); // {1}{B}
  assert.equal(spellOffered(state, lil.id), false, '{1}{B} przy jednej manie: brak oferty jest poprawny (CR 107.4a)');
  putCard(state, 'isle', 'basic-island', 'p1');
  setTapped(state, 'isle', false);
  assert.equal(spellOffered(state, lil.id), true, 'pip {B} z bramki + {1} z island → oferta jest');
});

test('M318/C: bramka tapnieta nie produkuje — brak oferty; po untapie oferta jest', () => {
  const state = game();
  putCard(state, 'gate', 'dimir-guildgate', 'p1');
  setTapped(state, 'gate', true);
  const rats = putCard(state, 'rats', 'typhoid-rats', 'p1', 'hand');
  assert.equal(spellOffered(state, rats.id), false, 'tapnieta bramka = brak many = brak oferty');
  untapObject(state, 'gate', 'p1');
  assert.equal(spellOffered(state, rats.id), true, 'po untapie bramka pokrywa {B}');
});

test('M318/D: pula {U} + bramka → {1}{B} oferowany (pula pokrywa {1}, bramka pip {B})', () => {
  const state = game();
  putCard(state, 'gate', 'dimir-guildgate', 'p1');
  setTapped(state, 'gate', false);
  const lil = putCard(state, 'lil', 'lilianas-triumph', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['U'] });
  assert.equal(spellOffered(state, lil.id), true, 'pula {U} + bramka {B} = {1}{B} do zaplacenia');
});

// ---- E/F/G: pełna sesja — scenariusz zgłoszenia (Severed Strands {1}{B}) ----
// Zgłoszenie (2026-09-06): „odtapowany Guildgate + kilka innych lądów, brak
// Swampów, w ręku Severed Strands; w panelu jest tylko „Użyj Dimir Guildgate",
// brak „Rzuć Severed Strands"”. Repro z pełną sesją (ravnica vs srodziemie):
// przy nietapniętych landach oferta JEST bez tapnięcia czegokolwiek (planer
// many liczy nietapnięte źródła, M193/A); brak oferty wynika wyłącznie z
// warunków POZA maną: cel = stwór przeciwnika (CR 601.2b-c) albo własny stwór
// do poświęcenia jako koszt dodatkowy (CR 601.2h). Sama bramka tapnięta daje
// 1 manę — {1}{B}=2, więc „najpierw tapnę bramkę” nigdy nie odblokowuje rzutu.

function sessionWithSS({ tappedOthers = false, ownCreature = true, foeCreature = true } = {}) {
  const REG = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/ravnica.txt', 'utf8'), REG).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/srodziemie.txt', 'utf8'), REG).cardIds],
  ]);
  const session = createSession({ seed: 5, registry: REG, decks });
  const state = session.state;
  for (let i = 0; i < 8; i++) {
    const cmds = session.view().legalCommands;
    const keep = cmds.find((c) => c.type === 'resolve_mulligan_choice' && c.keep === true)
      ?? cmds.find((c) => c.type === 'resolve_mulligan_choice' || c.type === 'resolve_mulligan_bottom_choice');
    if (!keep) break;
    session.apply(keep);
  }
  const used = new Set();
  const take = (cardId) => {
    const id = [...state.objects.entries()]
      .find(([oid, o]) => !used.has(oid) && o?.cardId === cardId && (o.zone === 'library' || o.zone === 'hand'))?.[0];
    if (!id) return null;
    used.add(id);
    state.zones.library = state.zones.library.filter((x) => x !== id);
    state.zones.hand = state.zones.hand.filter((x) => x !== id);
    return id;
  };
  const toBF = (cardId, ctrl, tapped) => {
    const id = take(cardId);
    if (!id) return null;
    state.zones.battlefield.push(id);
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), zone: 'battlefield', tapped, controllerId: ctrl, ownerId: ctrl }));
    return id;
  };
  toBF('dimir-guildgate', HUMAN_ID, false);
  toBF('basic-plains', HUMAN_ID, tappedOthers);
  toBF('basic-forest', HUMAN_ID, tappedOthers);
  toBF('basic-island', HUMAN_ID, tappedOthers);
  const own = ownCreature ? toBF('tenth-district-veteran', HUMAN_ID, false) : null;
  const foe = foeCreature ? toBF('greenwood-sentinel', BOT_ID, false) : null;
  const ss = take('severed-strands');
  state.zones.hand.push(ss);
  state.objects.set(ss, Object.freeze({ ...state.objects.get(ss), zone: 'hand' }));
  let guard = 0;
  while (guard++ < 300) {
    const t = state.turn;
    if ((t.step === 'main1' || t.step === 'main') && t.activePlayerId === HUMAN_ID && t.priorityPlayerId === HUMAN_ID) break;
    const cmds = session.view().legalCommands;
    const pass = cmds.find((c) => c.type === 'pass_priority')
      ?? cmds.find((c) => ['resolve_discard_choice', 'confirm', 'choose_option', 'resolve_mulligan_choice'].includes(c.type));
    if (!pass) break;
    session.apply(pass);
  }
  const ssOffered = () => session.view().legalCommands.some(
    (c) => c.type === 'cast_spell' && c.objectId === ss,
  );
  return { session, state, gate: state.zones.battlefield[0], ssOffered };
}

test('M318/E: sesja — bramka+landy untap (zero Swampów), oba stwor — SS ofertowany BEZ tapnienia', () => {
  const { ssOffered } = sessionWithSS({});
  assert.equal(ssOffered(), true, 'planer many liczy nietapnięte źródła: {B} z bramki bez tapnienia');
});

test('M318/F: sesja — brak stwora przeciwnika (celu) → brak oferty jest poprawny (CR 601.2b-c)', () => {
  const { ssOffered } = sessionWithSS({ foeCreature: false });
  assert.equal(ssOffered(), false, 'SS celuje we wrogiego stwora — bez celu czaru nie można rzucić');
});

test('M318/G: sesja — tylko bramka untap: brak oferty, a tapnięcie bramki NIE pomaga (1 < {1}{B})', () => {
  const { session, gate, ssOffered } = sessionWithSS({ tappedOthers: true });
  assert.equal(ssOffered(), false, '1 mana < {1}{B}');
  const act = session.view().legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === gate);
  if (act) session.apply(act);
  assert.equal(ssOffered(), false, 'pula 1 po bramce nie pokrywa kosztu 2 — tapnięcie nie odblokowuje');
});
