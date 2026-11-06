// Audyt PR #180 — Żywy Tester, partia dominaria-brg|ravnica-wur, seed 4242
// (transkrypt .arena/t1.txt, krok 69–72). Człowiek aktywował cycling Expunge
// {2} i opłacił go w kreatorze many tapnięciem zaczarowanego Chronic Flooding
// lasu. Kolejność rozstrzygnięcia była ODWROTNA do CR: najpierw rozstrzygnęła
// się ZDOLNOŚĆ (dobranie Fiery Hellhound), dopiero potem trigger aury
// (mielenie Final Parting / Kavu Primarch / Mountain). Deterministyczna
// rekonstrukcja biblioteki (shuffle(seed+0) = 34/34 pozycji transkryptu)
// dowodzi, że wynik materialnie inny niż regułowy: wg CR mielenie bierze
// wierzchnie 3 karty PRZED dobieraniem.
//
// CR (wydanie effective as of November 6, 2026, mirror nwgarne/mtg-data):
//  - 602.2a: zdolność jest ogłaszana i tworzona na stosie jako obiekt,
//    „It becomes the topmost object on the stack” — PRZED zapłatą;
//  - 602.2b: dalszy przebieg aktywacji (w tym płatność) identyczny z
//    601.2b–i (analog 601.2g/h: aktywacja zdolności many w trakcie płatności);
//  - 603.3 + 117.5: trigger odpalony podczas płatności trafia na stos
//    „the next time a player would receive priority” (czyli po domknięciu
//    aktywacji) i „becomes the topmost object on the stack” — NAD opłacaną
//    zdolnością, więc rozstrzyga się PRZED nią (mielenie przed dobieraniem).
//
// Kreator many (ADR 0003, E.3a) płaci OSOBNYMI komendami tap_for_mana, więc
// trigger ląduje na stosie, ZANIM komenda aktywacji zostanie wysłana — i tu
// tkwił błąd: finishWizardPayment drenował stos TYLKO, gdy komenda była
// nielegalna przy niepustym stosie (rzuty sorcery-speed, audyt PR #171 F-1).
// Natychmiastowe komendy (cycling, instanty) są legalne od razu, więc
// wjeżdżały NAD trigger z płatności i rozstrzygały się przed nim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { finishWizardPayment } from '../src/table/mana-wizard.js';

const registry = createCardRegistry();

function put(state, id, cardId, zone, patch = {}) {
  const def = registry.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: HUMAN_ID, ownerId: HUMAN_ID,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes,
    keywords: def.keywords ?? [], ...patch,
  });
  return state.objects.get(id);
}

function land(state, id, sub, controllerId = HUMAN_ID) {
  return put(state, id, `basic-${sub.toLowerCase()}`, 'battlefield', {
    controllerId, ownerId: controllerId,
    kind: 'land', types: ['Land'], colors: [],
    abilities: [{ type: 'mana', produces: [sub[0]], text: '{T}: dodaj 1 manę' }],
  });
}

/** Umieszcza kartę NA WIERZCHU segmentu biblioteki danego gracza. */
function putOnLibraryTop(state, id, cardId, controllerId) {
  put(state, id, cardId, 'library', { controllerId, ownerId: controllerId });
  const lib = state.zones.library;
  lib.splice(lib.indexOf(id), 1);
  const topIndex = lib.findIndex((entryId) => state.objects.get(entryId).controllerId === controllerId);
  lib.splice(topIndex === -1 ? lib.length : topIndex, 0, id);
}

function makeWizardSession() {
  // pauseOnBotMoves: false — asercje czytają STAN KOŃCOWY (po rozstrzygnięciu
  // triggera i zdolności); pauza wstrzymałaby rozstrzyganie na passie bota.
  const sess = createSession({
    seed: 67, registry, pauseOnBotMoves: false,
    decks: new Map([
      [HUMAN_ID, Array(60).fill('basic-forest')],
      [BOT_ID, Array(60).fill('basic-island')],
    ]),
  });
  const s = sess.state;
  s.pendingMulligans = [];
  s.turn = jumpToStep(s.turn, 'main1', HUMAN_ID);
  s.turn.activePlayerId = HUMAN_ID;
  s.turn.priorityPlayerId = HUMAN_ID;
  return sess;
}

test('F-CYK/1 (CR 602.2a+b, 603.3, 117.5): trigger z tapnięcia zaczarowanego lasu podczas płatności za cycling rozstrzyga się PRZED zdolnością (mielenie przed dobieraniem)', () => {
  const sess = makeWizardSession();
  const s = sess.state;
  put(s, 'exp', 'expunge', 'hand');
  land(s, 'isl', 'Island');
  land(s, 'swm', 'Swamp');
  put(s, 'aura', 'chronic-flooding', 'battlefield', { controllerId: BOT_ID, ownerId: BOT_ID });
  attachAuraToCreature(s, 'aura', 'isl');
  // Wierzch biblioteki człowieka: cztery rozróżnialne karty (A, B, C, D).
  const top = ['goblin-picker', 'mournful-zombie', 'dead-ringers', 'garruks-companion'];
  // Wstawianie OD OSTATNIEJ karty — każdy putOnLibraryTop ląduje na wierzchu,
  // więc po pętli wierzch = A (goblin-picker), potem B, C, D.
  for (let i = top.length - 1; i >= 0; i -= 1) putOnLibraryTop(s, `top-${i}`, top[i], HUMAN_ID);
  // Kreator many: tapnięcia z { holdPriority: true } (jak w UI). Tapnięcie
  // zaczarowanej Wyspy kładzie trigger CF na stos; pula = U + B = 2 (cycling {2}).
  assert.equal(sess.apply({ type: 'tap_for_mana', playerId: HUMAN_ID, objectId: 'isl' }, { holdPriority: true }).ok, true);
  assert.equal(sess.apply({ type: 'tap_for_mana', playerId: HUMAN_ID, objectId: 'swm' }, { holdPriority: true }).ok, true);
  assert.equal(s.zones.stack.length, 1, 'trigger Chronic Flooding siedzi na stosie przed commitem');

  const cyc = sess.view().legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'exp');
  assert.ok(cyc, 'cycling jest legalny także przy niepustym stosie (natychmiastowy)');

  const notices = [];
  const res = finishWizardPayment(sess, { cmd: cyc }, {
    runCommand: (cmd, opts) => sess.apply(cmd, opts),
    onNotice: (msg) => notices.push(msg),
  });
  assert.equal(res.committed, true, `płatność musi się domknąć: ${JSON.stringify(notices)}`);

  const graveCards = s.zones.graveyard.map((id) => s.objects.get(id)).filter((o) => o.controllerId === HUMAN_ID);
  const handCards = s.zones.hand.map((id) => s.objects.get(id));
  const graveIds = new Set(graveCards.map((o) => o.cardId));
  const handIds = new Set(handCards.map((o) => o.cardId));
  // CR: trigger (mielenie) rozstrzyga się PRZED zdolnością (dobranie):
  // zmielone A, B, C; dobrana karta D — nie odwrotnie.
  assert.deepEqual([...graveIds].sort(), ['dead-ringers', 'goblin-picker', 'mournful-zombie', 'expunge'].sort(),
    `w grobie mają się znaleźć zmielone A/B/C + odrzucony Expunge, jest: ${[...graveIds].join(', ')}`);
  assert.ok(handIds.has('garruks-companion'), 'dobrana ma być czwarta karta z wierzchu (D), nie pierwsza');
  assert.ok(!handIds.has('goblin-picker'), 'pierwsza karta z wierzchu musiała zostać zmielona PRZED dobieraniem');
});

test('F-CYK/2: kontrola — bez aury na tapniętym lądzie cycling domyka się bez drenażu i dobiera wierzch', () => {
  const sess = makeWizardSession();
  const s = sess.state;
  put(s, 'exp', 'expunge', 'hand');
  land(s, 'isl', 'Island');
  land(s, 'swm', 'Swamp');
  const top = ['goblin-picker', 'mournful-zombie', 'dead-ringers', 'garruks-companion'];
  for (let i = top.length - 1; i >= 0; i -= 1) putOnLibraryTop(s, `top-${i}`, top[i], HUMAN_ID);
  assert.equal(sess.apply({ type: 'tap_for_mana', playerId: HUMAN_ID, objectId: 'isl' }, { holdPriority: true }).ok, true);
  assert.equal(sess.apply({ type: 'tap_for_mana', playerId: HUMAN_ID, objectId: 'swm' }, { holdPriority: true }).ok, true);
  assert.equal(s.zones.stack.length, 0, 'bez aury na stosie nie ma nic do drenowania');

  const cyc = sess.view().legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'exp');
  const res = finishWizardPayment(sess, { cmd: cyc }, { runCommand: (cmd, opts) => sess.apply(cmd, opts) });
  assert.equal(res.committed, true);
  const handIds = new Set(s.zones.hand.map((id) => s.objects.get(id).cardId));
  assert.ok(handIds.has('goblin-picker'), 'bez triggera dobrana jest pierwsza karta z wierzchu');
});
