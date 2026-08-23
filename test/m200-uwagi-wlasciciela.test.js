// M200 — uwagi właściciela z testów (2026-08-23): A (wycofane — patrz test), A2, B, C, C2, D, E, E2,
// F, G, H + weryfikacja zgłoszenia L z audytu agenta. Każdy punkt osobnym
// commitem (ADR 0020 C); plik rośnie kumulatywnie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { ventureIntoUndercityForTest } from '../src/engine/effects.js';
import fs from 'node:fs';
import { HUMAN_ID, BOT_ID, createSession } from '../src/table/session.js';
import { parseDeckText } from '../src/cards/deck-text.js';

class MiniEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.style = {}; this.dataset = {}; this.className = ''; this.text = ''; this.html = ''; this.value = ''; this.disabled = false; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.html = String(v); }
  get innerHTML() { return this.html; }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  querySelectorAll(selector) {
    const cls = selector.replace('.', '');
    const out = [];
    const walk = (node) => {
      for (const c of node.children ?? []) {
        if (String(c.className).split(' ').includes(cls)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
}
globalThis.document = {
  createElement: (tag) => new MiniEl(tag),
  createTextNode: (text) => ({ isText: true, text: String(text), get textContent() { return this.text; } }),
};

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 2001, players: [{ id: 'p1' }, { id: 'p2' }] });
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

/** Wchodzi do pokoju 2 (Forge): sekretne wejście → wybór trasy → Forge. */
function enterForge(state, playerId) {
  state.undercityProgress = { [playerId]: 1 };
  ventureIntoUndercityForTest(state, playerId);
  const forge = playerView(state, playerId).legalCommands
    .find((c) => c.type === 'resolve_undercity_route' && c.roomName === 'Forge');
  assert.ok(forge, 'oferta trasy „Forge”');
  assert.ok(execute(state, forge).ok, 'wybór Forge');
}

// ---- A2: rozgałęzienie lochu — nazwany tytuł wyboru -----------------------

test('M200/A2: wybór trasy Undercity ma nazwany tytuł (nie „Wariant (2 opcje)")', async () => {
  const { choiceGroupLabel } = await import('../src/table/render.js');
  const state = game('p1');
  state.undercityProgress = { p1: 1 };
  ventureIntoUndercityForTest(state, 'p1');
  assert.ok(state.pendingUndercityRoute, 'oczekująca decyzja trasy (Secret Entrance → Forge/Lost Well)');
  const view = playerView(state, 'p1');
  const routes = view.legalCommands.filter((c) => c.type === 'resolve_undercity_route');
  assert.equal(routes.length, 2, 'dwie ścieżki w ofercie');
  const session = {
    nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
    nameOfObject: (id) => String(id),
    abilitiesOf: (id) => REGISTRY.get(id)?.abilities ?? [],
  };
  const label = choiceGroupLabel({ type: 'target', options: routes }, session, view);
  assert.ok(label.includes('Ścieżka w Undercity'), `tytuł nazywa czynność: ${label}`);
  assert.ok(!label.includes('Wariant'), 'bez generycznego „Wariant”: ' + label);
});

// ---- A (WYCOFANE, decyzja właściciela 2026-08-23): pokój Forge CELOWA DOWOLNEGO stwora ----
// Wstępna „poprawka" A (kandydaci = tylko własne stwory) została WYCOFANA po
// przeanalizowaniu Oracle przez właściciela: zdolność pokoju MUSI się rozstrzygnąć,
// gdy istnieje legalny cel — stwór przeciwnika jest legalnym celem i musi móc
// go dostać liczniki. Reguła procesu (L57): zgłoszenie właściciela weryfikować
// wobec Oracle/CR PRZED wdrożeniem — rozbieżność zgłaszać, nie wdrażać ślepo.

test('M200/A (wycofane): Forge — stwór PRZECIWNIKA jest legalnym celem i dostaje liczniki', () => {
  const state = game('p1');
  putCard(state, 'foe', 'highland-game', 'p2'); // jedyny stwór na stole
  enterForge(state, 'p1');
  assert.equal(state.pendingRoomTargets.length, 1,
    'istnieje legalny cel (stwór przeciwnika) — decyzja celu OBOWIĄZUJE (Oracle)');
  assert.deepEqual(state.pendingRoomTargets[0].candidateIds, ['foe'],
    'kandydaci = wszystkie stwory na polu bitwy');
  const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_room_target');
  assert.ok(cmd, 'oferta wyboru celu');
  assert.ok(execute(state, cmd).ok, 'wybór celu');
  assert.equal(state.objects.get('foe')?.counters?.['+1/+1'] ?? 0, 2,
    'zdolność rozstrzyga się na jedynym legalnym celu (właściciel: „musi być wykonana”)');
});

test('M200/A (wycofane): Forge bez JAKIEGOKOLWIEK stwora — efekt fizzluje (brak legalnego celu)', () => {
  const state = game('p1');
  enterForge(state, 'p1');
  assert.equal(state.pendingRoomTargets.length, 0, 'zero stworów = brak legalnego celu = fizzle');
});
// ---- B: nazwy kart w logu partii są klikalne (fullscreen Scryfall) --------
// M167/E2 napisało linki (appendLogLineWithCardLinks + delegacja kliku w
// main.js), ale render czytał `session.cardIdByName` — a sesja NIE EKSPONUJĄC
// mapy (żyła tylko w closure) log był zawsze czystym tekstem. Klasa L5:
// testy M167 testowały funkcję z rękodziełem, nie wiring sesja→render.

test('M200/B: sesja eksponuje cardIdByName, a log partii rendery linkowane nazwy', async () => {
  const fs = await import('node:fs');
  const { HUMAN_ID, BOT_ID } = await import('../src/table/session.js');
  const { parseDeckText } = await import('../src/cards/deck-text.js');
  const { renderTableView } = await import('../src/table/render.js');
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/innistrad.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/dominaria.txt', 'utf8'), registry).cardIds],
  ]);
  const session = createSession({ seed: 3, registry, decks });
  assert.ok(session.cardIdByName instanceof Map, 'mapa nazwa→cardId na sesji (root cause B)');
  assert.equal(session.cardIdByName.get('Highland Game'), 'highland-game',
    'w mapie są karty rejestru');
  // Wpis logu z nazwą karty → render owija ją w klikalny span (delegacja
  // kliku otwierająca fullscreen podpięta jest w main.js na els.log).
  session.log.push({ kind: 'event', text: 'Nieprzyjaciel rzuca Highland Game i przepuszcza.' });
  const els = {};
  for (const key of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn', 'exileZone', 'hand', 'actions', 'log']) {
    els[key] = new MiniEl(`#${key}`);
  }
  renderTableView({ els, session, play: () => {}, onCardClick: () => {} });
  const spans = [...els.log.querySelectorAll('.log-card')];
  assert.ok(spans.length >= 1, `nazwa karty owinięta w span.log-card: ${els.log.textContent.slice(0, 120)}`);
  assert.equal(spans[0].dataset.cardId, 'highland-game', 'span niesie cardId do openCardFullscreenByCardId');
});

