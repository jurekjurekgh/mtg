// Uwagi właściciela z testów 2026-09-19 — D i E.
//
// D (Malamet Battle Glyph): „Efekty użycia tej karty nie pokazują się w panelu
// Rozgrywka. Informacje są już w logu […], ale w panelu Rozgrywka dalej tego
// nie ma.” Pomiar 2026-09-19: po scalonym ficie M386 (PR #128 — crash
// renderEnergyPanel przerywał showBotMoves) ŻADNA badana ścieżka nie gubi
// linii walki — bufor modala „Rozgrywka” (botMoves) i przebieg tur niosą
// licznik, oba wzajemne obrażenia (CR 701.14) i obie śmierci, dla rzutu
// człowieka i bota. Ten plik to STRAŻNIK tego stanu (L13: pin, który ma być
// zielony — mutacją jest tu każda przyszła zmiana bramki noteBotMove).
//
// E (latacz vs reach): „Bot atakuje mnie kreaturą 2/2 z lataniem, podczas gdy
// mam na stole kreaturę 2/4 z »reach« nadanym przez aurę.” Pomiar: reach
// z załączników jest w PlayerView (effectiveKeywords → attachmentBonuses)
// i w scoringu (attackerCanBeBlocked + gałąź chump, M202/H — premia wyścigu
// pomijana dla ataku jałowego); fuzz 30 partii bez naruszeń. Strażnik:
// bot NIE atakuje latacza w blokera z reach, gdy atak jest jałowy — dla
// trzech źródeł reach (bestow, grant EOT, własny keyword), plus kontrola,
// że bez reach ten sam atak WYBIERA (dowód, że test nie jest pusty).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HUMAN_ID, BOT_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { grantKeywordsUntilEndOfTurn } from '../src/engine/permanents.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

function sesja(seed = 7) {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/ravnica.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/ixalan.txt', 'utf8'), registry).cardIds],
  ]);
  const session = createSession({ seed, registry, decks, pauseOnBotMoves: true });
  for (let i = 0; i < 4; i += 1) {
    const m = session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice');
    if (!m) break;
    session.apply(m);
  }
  return { session, registry };
}
function put(session, registry, cardId, id, zone, controller) {
  const def = registry.get(cardId);
  const data = gameObjectDataOf(def);
  // gameObjectDataOf nie niesie keywordów — bez nich stwór w stanie ich nie ma
  // (widok i scoring widziałyby np. latacza jako stwora naziemnego).
  addObject(session.state, {
    id, instanceId: `i-${id}`, cardId, controllerId: controller, ownerId: controller, zone, ...data,
    ...(def.keywords?.length ? { keywords: [...def.keywords] } : {}),
  });
}

test('D/1: walka z Malamet Battle Glyph (rzut człowieka) — linie efektów w buforze modala „Rozgrywka”', () => {
  const { session, registry } = sesja();
  const state = session.state;
  state.turn = jumpToStep(state.turn, 'main', HUMAN_ID);
  state.turn.activePlayerId = HUMAN_ID;
  state.turn.priorityPlayerId = HUMAN_ID;
  // Własny stwór wszedł W TEJ TURZE (dodany w main) → licznik +1/+1 się należy.
  put(session, registry, 'malamet-battle-glyph', 'mbg', 'hand', HUMAN_ID);
  put(session, registry, 'skinbrand-goblin', 'mine', 'battlefield', HUMAN_ID);
  put(session, registry, 'tenth-district-veteran', 'theirs', 'battlefield', BOT_ID);
  addMana(state, HUMAN_ID, 1, { colors: ['G'] });

  session.clearBotMoves();
  const cmd = session.view().legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'mbg');
  assert.ok(cmd, 'rzut Malamet w ofercie');
  assert.ok(session.apply(cmd).ok);

  const typy = session.botMoves.map((m) => m.type);
  assert.ok(session.botMoves.some((m) => m.type === 'counter_added' && /licznik/.test(m.text)),
    `licznik +1/+1 w modalu (cel wszedł w tej turze): ${JSON.stringify(session.botMoves.map((m) => m.text))}`);
  const damages = session.botMoves.filter((m) => m.type === 'damage_dealt');
  assert.equal(damages.length, 2, 'oba wzajemne obrażenia walki (CR 701.14) w modalu');
  assert.ok(session.botMoves.some((m) => m.type === 'spell_resolved'), 'rozstrzygnięcie czaru w modalu');
  const deaths = session.botMoves.filter((m) => m.type === 'creature_destroyed' || m.type === 'permanent_destroyed');
  assert.ok(deaths.length >= 1, `śmierć z walki w modalu (typy: ${JSON.stringify(typy)})`);
});

test('D/2: walka z Malamet Battle Glyph trafia też do przebiegu tur (panel „Przebieg tur”)', () => {
  const { session, registry } = sesja(9);
  const state = session.state;
  state.turn = jumpToStep(state.turn, 'main', HUMAN_ID);
  state.turn.activePlayerId = HUMAN_ID;
  state.turn.priorityPlayerId = HUMAN_ID;
  put(session, registry, 'malamet-battle-glyph', 'mbg', 'hand', HUMAN_ID);
  put(session, registry, 'skinbrand-goblin', 'mine', 'battlefield', HUMAN_ID);
  put(session, registry, 'tenth-district-veteran', 'theirs', 'battlefield', BOT_ID);
  addMana(state, HUMAN_ID, 1, { colors: ['G'] });
  const cmd = session.view().legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'mbg');
  assert.ok(session.apply(cmd).ok);
  // Domknij turę, żeby przebieg wszedł do historii.
  let guard = 0;
  while (state.status === 'active' && state.turn.number <= 1 && guard++ < 30) {
    const v = session.view();
    if (v.turn.priorityPlayerId !== HUMAN_ID) { session.continueBotPlay?.(); continue; }
    const pass = v.legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    session.apply(pass);
  }
  const text = session.turnHistoryTextAll();
  assert.match(text, /Malamet Battle Glyph/, 'nazwa czaru w przebiegu tur');
  assert.match(text, /zadaje \d+ obraże/, 'obrażenia walki w przebiegu tur');
  assert.match(text, /ginie/, 'śmierć z walki w przebiegu tur');
});

test('D/3: walka z Malamet Battle Glyph (rzut BOTA) — linie efektów w modalu „Rozgrywka”', () => {
  const { session, registry } = sesja(11);
  const state = session.state;
  state.turn = jumpToStep(state.turn, 'main', BOT_ID);
  state.turn.activePlayerId = BOT_ID;
  state.turn.priorityPlayerId = BOT_ID;
  put(session, registry, 'malamet-battle-glyph', 'mbg', 'hand', BOT_ID);
  put(session, registry, 'skinbrand-goblin', 'his', 'battlefield', BOT_ID);
  put(session, registry, 'tenth-district-veteran', 'hers', 'battlefield', HUMAN_ID);
  addMana(state, BOT_ID, 1, { colors: ['G'] });

  session.clearBotMoves();
  // Wzór B1/4: rozkaz bota konstruowany wprost (session.view() przy
  // pauseOnBotMoves nie odsłania rozkazów bota — gra je przez wewnętrzną pętlę).
  // Cele karty: [stwór, który kontrolujesz, stwór, którego nie kontrolujesz].
  const wynik = session.apply({ type: 'cast_spell', playerId: BOT_ID, objectId: 'mbg', targets: ['his', 'hers'] });
  assert.ok(wynik.ok, `rzut bota przyjęty: ${wynik.reason}`);
  assert.ok(session.botMoves.some((m) => m.type === 'damage_dealt'),
    `obrażenia walki bota w modalu: ${JSON.stringify(session.botMoves.map((m) => m.text))}`);
});

// ---------------------------------------------------------------------------
// E — bot nie atakuje lataczem w blokera z reach (trzy źródła reach).
// ---------------------------------------------------------------------------

function stanWalki(seed = 5) {
  const state = createGameState({ seed, players: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  return state;
}
function putRaw(state, registry, cardId, id, controller) {
  const def = registry.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: controller, ownerId: controller, zone: 'battlefield', ...data,
    ...(def.keywords?.length ? { keywords: [...def.keywords] } : {}),
  });
}
function decyzjaAtaku(state) {
  const bot = createHeuristicBot({ seed: 42 });
  const cmd = bot.chooseCommand(playerView(state, 'p2'), {});
  return cmd;
}

test('E/1: reach nadany aurą (bestow) — bot NIE atakuje 2/2 latacza w tak wzmocnionego blokera', () => {
  const registry = createCardRegistry();
  const state = stanWalki();
  putRaw(state, registry, 'dementia-bat', 'flyer', 'p2');        // 2/2 flying (bot)
  putRaw(state, registry, 'greenwood-sentinel', 'wall', 'p1');   // 2/2 baza
  putRaw(state, registry, 'leafcrown-dryad', 'dryad', 'p1');     // bestow +2/+2 + reach
  attachAuraToCreature(state, 'dryad', 'wall');

  const view = playerView(state, 'p2');
  const wallEntry = view.zones.battlefield.find((o) => o.id === 'wall');
  assert.ok((wallEntry?.keywords ?? []).includes('reach'), 'reach z aury jest w widoku bota (ADR 0017)');

  const cmd = decyzjaAtaku(state);
  const atakujeLataczem = cmd?.type === 'declare_attackers' && (cmd.attackerIds ?? []).includes('flyer');
  assert.ok(!atakujeLataczem, `bot nie może atakować lataczem w reach-blokera: ${JSON.stringify(cmd)}`);
});

test('E/2: reach nadany do końca tury (grant EOT) — też blokuje atak latacza', () => {
  const registry = createCardRegistry();
  const state = stanWalki();
  putRaw(state, registry, 'dementia-bat', 'flyer', 'p2');          // 2/2 flying
  // 2/3 — po grancie reach latacz ginie nie zabijając blokera (atak jałowy,
  // dokładnie scenariusz właściciela: flyer bez korzyści w reach-blokera).
  putRaw(state, registry, 'tenth-district-veteran', 'wall', 'p1');
  grantKeywordsUntilEndOfTurn(state, 'wall', ['reach']);

  const view = playerView(state, 'p2');
  const wallEntry = view.zones.battlefield.find((o) => o.id === 'wall');
  assert.ok((wallEntry?.keywords ?? []).includes('reach'), 'grant EOT w widoku bota');

  const cmd = decyzjaAtaku(state);
  const atakujeLataczem = cmd?.type === 'declare_attackers' && (cmd.attackerIds ?? []).includes('flyer');
  assert.ok(!atakujeLataczem, `bot nie atakuje lataczem w grantowanego reach-blokera: ${JSON.stringify(cmd)}`);
});

test('E/3 (kontrola — dowód, że test nie jest pusty): bez reach ten sam atak jest wybierany', () => {
  const registry = createCardRegistry();
  const state = stanWalki();
  putRaw(state, registry, 'dementia-bat', 'flyer', 'p2');        // 2/2 flying
  putRaw(state, registry, 'greenwood-sentinel', 'wall', 'p1');   // 2/2, NIE dosięga lataczy
  const cmd = decyzjaAtaku(state);
  assert.equal(cmd?.type, 'declare_attackers', 'bez reach bot atakuje');
  assert.ok((cmd.attackerIds ?? []).includes('flyer'),
    `latacz bez odpowiedzi u obrońcy idzie do ataku: ${JSON.stringify(cmd)}`);
});
