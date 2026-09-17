// M370 (znaleziska właściciela 2026-09-17c, C/F/G): etykiety decyzji i panel
// „Twoje działania".
//
// C (Krumar Initiate): decyzja o X pokazywała nagłówek „Wybierz: Wartość X" —
//    bez nazwy karty i bez opisu skutku. Teraz tytuł nazywa kartę i czynność
//    (deskryptor efektu z danych karty — ADR 0002), a konkretne X niosą opcje.
// F (hover): pasek toru wymienia NAZWĘ podglądanej karty przed etykietą toru,
//    z numerem porządkowym kopii, gdy na stole jest ich kilka.
// G (panel): zdolność many (CR 605.1a — np. „{U}, {T}: Add {C}{C}{C}" na
//    stworze) nie jest ofertą „Twoich działań" (jak lądy podstawowe); zostaje
//    w ofercie silnika i w kreatorze many.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import {
  buildActionEntries, cardInfo, choiceGroupTitle, isManaAbilityCommand, renderHoverPreview,
} from '../src/table/render.js';

const REGISTRY = createCardRegistry();

function putCard(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
    cardName: def.name,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

/** Plansza z kartami znalezisk + mana i faza główna (oferta zdolności legalna). */
function sessionWithBoard() {
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/innistrad-brg.txt', 'utf8'), REGISTRY).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/innistrad-wu.txt', 'utf8'), REGISTRY).cardIds],
  ]);
  const session = createSession({ seed: 370, registry: REGISTRY, decks, pauseOnBotMoves: false });
  const state = session.state;
  putCard(state, 'krumar', 'krumar-initiate', HUMAN_ID);
  putCard(state, 'wizard', 'apprentice-wizard', HUMAN_ID);
  putCard(state, 'gate-a', 'manor-gate', HUMAN_ID);
  putCard(state, 'gate-b', 'manor-gate', HUMAN_ID);
  addMana(state, HUMAN_ID, 4, { colors: ['B'] });
  addMana(state, HUMAN_ID, 2, { colors: ['U'] });
  // Faza główna z priorytetem człowieka — zdolność Krumara działa „as a sorcery".
  state.turn = jumpToStep(state.turn, 'main1', HUMAN_ID);
  state.turn.priorityPlayerId = HUMAN_ID;
  state.pendingMulligans = [];
  state.pendingMulliganBottom = null;
  return session;
}

function installFakeDom() {
  const makeEl = (tag) => ({
    tag, children: [], style: {}, textContent: '', className: '',
    appendChild(child) { this.children.push(child); return child; },
    addEventListener() {}, removeEventListener() {}, setAttribute() {},
  });
  globalThis.document = { createElement: makeEl, createTextNode: (text) => ({ textContent: String(text) }) };
  return makeEl;
}

test('C: decyzja „Wartość X" nazywa kartę i opisuje, co robi zdolność', () => {
  const session = sessionWithBoard();
  const view = playerView(session.state, HUMAN_ID);
  const offer = view.legalCommands.find((c) => c.type === 'activate_ability' && c.xValue != null);
  assert.ok(offer, 'oferta zdolności z X jest w widoku (Krumar Initiate)');
  const title = choiceGroupTitle({ type: 'value', options: [offer] }, session, view);
  assert.match(title, /Krumar Initiate/, 'tytuł nazywa kartę');
  assert.match(title, /liczników \+1\/\+1/, 'tytuł mówi, że można dołożyć liczniki +1/+1');
  assert.match(title, /Spirit X\/X/, 'tytuł mówi o wariancie z tokenem Spirit X/X');
  assert.notEqual(title, 'Wybierz: Wartość X', 'koniec z bezznacznikowym nagłówkiem');
});

test('G: zdolność many znika z panelu, ale zostaje w ofercie silnika (kreator many)', () => {
  const session = sessionWithBoard();
  const view = playerView(session.state, HUMAN_ID);
  const manaOffer = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'wizard');
  assert.ok(manaOffer, 'zdolność many Apprentice Wizard jest w legalCommands');
  assert.equal(isManaAbilityCommand(manaOffer, session), true,
    'silnik uznaje ją za zdolność many (CR 605.1a) — jedno źródło prawdy');

  const entries = buildActionEntries(view.legalCommands, session, view);
  // Wpis panelu to komenda albo grupa decyzji (`request.options`) — sprawdzamy
  // oba kształty, żeby pin nie był zielony przez „nie ma wpisu".
  const commandsOf = (entry) => [entry.command, entry.first, ...(entry.request?.options ?? [])]
    .filter(Boolean);
  const offersObject = (objectId) => entries
    .some((entry) => commandsOf(entry).some((cmd) => cmd.objectId === objectId));
  assert.equal(offersObject('wizard'), false,
    'panel „Twoje działania" nie oferuje tapnięcia po manę');
  assert.equal(offersObject('krumar'), true,
    'kontrola pozytywna: zwykła zdolność (X + tap + życie) zostaje w panelu');
});

test('F: pasek podglądu wymienia nazwę karty (z numerem kopii) przed torem', () => {
  const makeEl = installFakeDom();
  const session = sessionWithBoard();
  const info = cardInfo(session, session.state.objects.get('gate-a'));
  assert.match(info.name, /#\d+/, 'dwie kopie Manor Gate dostają numer porządkowy');
  const host = makeEl('div');
  renderHoverPreview(host, info);
  const label = host.children.find((child) => String(child.className).includes('hover-mode'));
  assert.ok(label, 'pasek toru wyrenderowany');
  assert.ok(label.textContent.startsWith(`${info.name} — `),
    `nazwa karty przed etykietą toru („${label.textContent}")`);
  assert.match(label.textContent, /pełna karta \(Scryfall\)/);
});
