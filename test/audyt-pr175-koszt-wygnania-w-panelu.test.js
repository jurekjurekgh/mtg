/**
 * Audyt PR #175, znalezisko F-1 (klasa L99 — „naprawa w jednej warstwie:
 * opis TAK, panel NIE") i F-2 (L29 — pin nie może przepuszczać surowego
 * `cardId`).
 *
 * Zgłoszenie właściciela W (Sultai Scavenger, Delve) brzmiało: wygnanie kart
 * za koszt „nie było widoczne w logu ANI w modalu «Rozgrywka»”. PR #175 dodał
 * gałąź opisu w `describeGameEventRaw`, co domyka LOG (i panel, gdy płaci
 * BOT — wtedy `botActing === true` przepuszcza wszystko), ale przy płatności
 * CZŁOWIEKA panel „Rozgrywka” nadal nie widział wygnania: bramka
 * `isMainLogEvent` znała wyłącznie `object_moved && additionalCost === true`.
 *
 * Reguła (CR 601.2h, precedens E7/E i M103/D): WYGNANIE KARTY JAKO KOSZT
 * (escape, dodatkowy koszt rzucenia, delve) jest płatnością jak mana —
 * widoczną w obu kanałach, niezależnie od tego, kto płaci. Jedno miejsce
 * prawdy dla tej klasy: `isCostPaymentZoneMove` (L41).
 *
 * Piny:
 *   P/1 — sesja: rzut człowieka z Delve zostawia wpis w panelu „Rozgrywka”
 *         nazywający wygnaną kartę (RED przed naprawą F-1);
 *   P/2 — bramka: delve / escape / additionalCost przechodzą, zwykły ruch
 *         strefowy NIE (antyp-over-fix: nie każdy `object_moved` to treść);
 *   P/3 — log: opis nazywa koszt Delve i PEŁNĄ nazwę karty, nigdy surowy
 *         `cardId` (F-2, L29).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOT_ID, HUMAN_ID, createSession, describeGameEvent, isCostPaymentZoneMove, isMainLogEvent,
} from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, zone, controllerId = HUMAN_ID) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
}

/**
 * Sesja człowiek–bot na minimalnych taliach (bagno + Sultai Scavenger), z
 * ręcznie dołożonym materiałem Delve w grobie i maną — dokładnie ten kształt,
 * w którym zgłoszenie właściciela było mierzalne.
 */
function sessionWithDelveMaterial() {
  const decks = new Map([
    [HUMAN_ID, [...Array(20).fill('basic-swamp'), 'sultai-scavenger']],
    [BOT_ID, Array(40).fill('basic-swamp')],
  ]);
  const session = createSession({ seed: 11, registry: REGISTRY, decks });
  const keep = session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice');
  if (keep) assert.ok(session.apply(keep).ok, 'keep ręki startowej');
  put(session.state, 'scav', 'sultai-scavenger', 'hand');
  put(session.state, 'g1', 'goblin-piker', 'graveyard');
  put(session.state, 'g2', 'goblin-piker', 'graveyard');
  addMana(session.state, HUMAN_ID, 6, { colors: ['B'] });
  return session;
}

function castDelve(session) {
  const cast = session.view().legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'scav');
  assert.ok(cast, 'oferta rzutu Sultai Scavenger z Delve istnieje');
  assert.ok(session.apply(cast).ok, 'deklaracja rzutu przyjęta');
  assert.ok(session.state.pendingDelveExile, 'deklaracja otwiera decyzję kosztu (pendingDelveExile)');
  const resolve = session.apply({ type: 'resolve_delve_exile', playerId: HUMAN_ID, exileIds: ['g1', 'g2'] });
  assert.ok(resolve.ok, `resolve_delve_exile: ${resolve.reason ?? 'ok'}`);
}

test('P/1: rzut człowieka z Delve — wygnanie widoczne w panelu „Rozgrywka"', () => {
  const session = sessionWithDelveMaterial();
  castDelve(session);
  // Panel „Rozgrywka" to bufor `botMoves`; przed naprawą F-1 nie było w nim
  // ŻADNEGO wpisu o wygnaniu (object_moved wypadał w bramce isMainLogEvent).
  const panel = session.botMoves.filter((m) => m.type === 'object_moved');
  assert.equal(panel.length, 2, `panel ma 2 wpisy wygnania (jest ${panel.length})`);
  assert.ok(
    panel.every((m) => /Goblin Piker/.test(m.text)),
    `wpisy nazywają wygnaną kartę (było: brak wpisów) — ${panel.map((m) => m.text).join(' | ')}`,
  );
  assert.ok(
    panel.every((m) => /wygnan/i.test(m.text)),
    'wpis mówi, że karta trafiła do wygnania',
  );
});

test('P/2: bramka panelu — cała klasa „wygnanie jako koszt", nie jedna flaga', () => {
  // Płatność kosztu (CR 601.2h) — trzy rodzaje tej samej klasy.
  for (const flag of ['delve', 'escape', 'additionalCost']) {
    const e = { type: 'object_moved', fromZone: 'graveyard', toZone: 'exile', [flag]: true };
    assert.equal(isCostPaymentZoneMove(e), true, `${flag} nie jest rozpoznane jako płatność kosztu`);
    assert.equal(
      isMainLogEvent(e, { botActing: false, phase: 'precombat_main', stackSize: 0 }),
      true,
      `płatność ${flag} wypada z panelu przy rzucie człowieka`,
    );
  }
  // Antyp-over-fix: zwykły ruch strefowy (nie koszt) nadal jest szumem panelu,
  // inaczej każda karta wchodząca do grobu zaśmiecałaby modal.
  for (const e of [
    { type: 'object_moved', fromZone: 'battlefield', toZone: 'graveyard' },
    { type: 'object_moved', fromZone: 'hand', toZone: 'graveyard', delve: false },
    { type: 'object_moved', bounced: true },
    { type: 'object_moved', fromZone: 'graveyard', toZone: 'exile' },
  ]) {
    assert.equal(isCostPaymentZoneMove(e), false, `nie-koszt rozpoznany jako koszt: ${JSON.stringify(e)}`);
  }
  assert.equal(isCostPaymentZoneMove({ type: 'spell_cast', delve: true }), false, 'tylko object_moved');
});

test('P/3: log nazywa koszt i PEŁNĄ nazwę karty (nigdy surowy cardId) — F-2/L29', () => {
  const session = sessionWithDelveMaterial();
  castDelve(session);
  const helpers = {
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    nameOfObject: () => '?',
    isPlayer: (id) => [HUMAN_ID, BOT_ID].includes(id),
  };
  const logLines = session.log
    .map((entry) => entry.text)
    // Sam PROMPT decyzji też mówi „koszt Delve” — pin dotyczy WYNIKU płatności.
    .filter((text) => /zostaje wygnane \(koszt Delve\)/.test(text));
  assert.equal(logLines.length, 2, 'każda wygnana karta ma własny wpis w logu');
  for (const line of logLines) {
    assert.match(line, /Goblin Piker/, 'log nazywa kartę nazwą z rejestru');
    assert.doesNotMatch(line, /goblin-piker/, 'log nie może pokazywać surowego cardId (L29)');
  }
  // Opis zdarzenia (ta sama warstwa co log) — pełne zdanie, nie sam identyfikator.
  const delveEvent = session.state.events.find((e) => e.type === 'object_moved' && e.delve);
  const described = describeGameEvent(delveEvent, helpers, { [HUMAN_ID]: 'Ty', [BOT_ID]: 'Nieprzyjaciel' });
  assert.equal(described, 'Goblin Piker zostaje wygnane (koszt Delve)');
});
