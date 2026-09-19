// =============================================================================
// P4 (paka uwag właściciela 2026-09-19b) — punkty C i D: wycena bota.
//
// C — Thieves' Tools („Equipped creature can't be blocked as long as its power
//   is 3 or less”): „wyposażony 1/1 może atakować nieblokowany; bot nie atakuje
//   nim — zła wycena”.
//   Reguła walki (CR 509.1b) była w silniku od Batcha 44
//   (`cantBeBlockedFromEquipment`, combat.js), ale WIDOK nie niósł tego faktu:
//   bot czytał `cantBeBlocked` (efekt) i próg mocy blokera
//   (`cantBeBlockedByPower`), więc nosiciela 1/1 z ewazją z załącznika widział
//   jako „zablokowalnego” i wyceniał jego atak jak chump-block. Fix u źródła:
//   widok ustawia `cantBeBlocked`, gdy ewazja z equipmentu realnie działa
//   (moc EFEKTYWNA nosiciela ≤ progu z deskryptora) — ten sam fakt publiczny
//   dla bota, badge’a i przyszłych konsumentów; warunek liczony przy odczycie,
//   więc pump ponad próg zdejmuje flagę.
//
// D — Stirring Bard „Mantle of Inspiration — {T}: Target creature gains menace
//   and haste until end of turn”: bot tapował Bardem w Main 1. Reguła
//   właściciela: używać TYLKO we własnej turze w kroku deklaracji atakujących
//   i tylko na (a) stwora z chorobą przyzwania, który zaatakuje (haste
//   odblokowuje — CR 302.6), albo (b) atakującego (menace utrudnia blok —
//   CR 702.76); każde inne okno = nie używać wcale.
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

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

/** `summoningSickness` jest polem spoza kontraktu `addObject` — ustawiany jawnie. */
function patch(state, id, fields) {
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...fields }));
}

function attach(state, attachmentId, hostId) {
  patch(state, attachmentId, { attachedTo: hostId });
  patch(state, hostId, { attachments: [attachmentId] });
}

function game(step, activeId = 'p1') {
  const state = createGameState({ seed: 91, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, activeId);
  state.turn.activePlayerId = activeId;
  state.turn.priorityPlayerId = activeId;
  return state;
}

const bot = () => createHeuristicBot({ seed: 7, randomness: 0, registry: REGISTRY });

/** Czy wybór bota to aktywacja zdolności `objectId` (a jeśli tak — na kogo). */
function chosenActivation(view, objectId) {
  const chosen = bot().chooseCommand(view);
  if (chosen?.type !== 'activate_ability' || chosen.objectId !== objectId) return null;
  return chosen.targets?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// C — ewazja z Thieves' Tools widziana przez widok i wyceniana przez bota
// ---------------------------------------------------------------------------

/** Nosiciel 2/1 + (opcjonalnie) Thieves' Tools; wróg: 6/6 Inferno Titan. */
function equippedBoard({ equipped = true, bearerPower = null } = {}) {
  const state = game('declare_attackers');
  put(state, 'bearer', 'highland-game', 'p1');
  patch(state, 'bearer', { summoningSickness: false, ...(bearerPower == null ? {} : { power: bearerPower }) });
  put(state, 'foe', 'inferno-titan', 'p2');
  if (equipped) {
    put(state, 'tools', 'thieves-tools', 'p1');
    attach(state, 'tools', 'bearer');
  }
  return state;
}

test('C/1: widok niesie ewazję z equipmentu (cantBeBlocked) przy mocy ≤ progu', () => {
  const state = equippedBoard();
  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'bearer');
  assert.equal(entry.power, 2, 'moc nosiciela 2 ≤ próg 3 z deskryptora sprzętu');
  assert.equal(entry.cantBeBlocked, true,
    'ewazja z załącznika to ten sam fakt publiczny co cantBeBlocked z efektu (CR 509.1b)');
  // Kontrola: bez sprzętu ten sam stwór nie jest nieblokowalny.
  const bez = equippedBoard({ equipped: false });
  const entryBez = playerView(bez, 'p1').zones.battlefield.find((o) => o.id === 'bearer');
  assert.notEqual(entryBez.cantBeBlocked, true, 'bez sprzętu brak flagi (kontrola)');
});

test('C/2: pump ponad próg zdejmuje ewazję (moc liczona przy odczycie)', () => {
  const state = equippedBoard({ bearerPower: 4 });
  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'bearer');
  assert.equal(entry.power, 4, 'nosiciel podniesiony ponad próg 3');
  assert.notEqual(entry.cantBeBlocked, true, '„as long as its power is 3 or less” — przy 4/… ewazji nie ma');
});

test('C/3: bot ATAKUJE nosicielem z ewazją, choć bloker jest dużo większy', () => {
  const state = equippedBoard();
  const chosen = bot().chooseCommand(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'declare_attackers',
    `bot ma zadeklarować atak (wybrał: ${chosen?.type} ${chosen?.objectId ?? ''})`);
  assert.deepEqual(chosen.attackerIds, ['bearer'],
    'atak nosicielem z ewazją jest darmowy (6/6 nie może blokować) — zgłoszenie C');
});

test('C/4: bez sprzętu ten sam atak jest jałowy — bot go nie deklaruje (kontrola)', () => {
  const state = equippedBoard({ equipped: false });
  const chosen = bot().chooseCommand(playerView(state, 'p1'));
  const attackers = chosen?.type === 'declare_attackers' ? chosen.attackerIds : [];
  assert.deepEqual(attackers, [], '2/1 w nietapnięte 6/6 to zmarnowany stwór (kontrola pomiaru C)');
});

test('C/5: nosiciel ponad progiem nie dostaje „darmowego” ataku (kontrola)', () => {
  const state = equippedBoard({ bearerPower: 4 });
  const chosen = bot().chooseCommand(playerView(state, 'p1'));
  const attackers = chosen?.type === 'declare_attackers' ? chosen.attackerIds : [];
  assert.deepEqual(attackers, [], 'ewazja wygasła (moc > 3) — atak w 6/6 znów jest jałowy');
});

// ---------------------------------------------------------------------------
// D — Stirring Bard: okno grantu (menace + haste)
// ---------------------------------------------------------------------------

const BARD = 'stirring-bard';

/**
 * Własna tura w zadanym kroku: Bard (0/4, obrońca), chory na przyzwanie 2/1
 * `sick`, zdrowy 2/1 `zdrowy`, wrogi 6/6. Pusta ręka/biblioteka — jedyne
 * nietrywialne oferty to aktywacje Barda, więc wybór `pass_priority` jest
 * mierzalnym „nie użył zdolności”.
 */
function bardBoard(step) {
  const state = game(step);
  put(state, 'bard', BARD, 'p1');
  patch(state, 'bard', { summoningSickness: false });
  put(state, 'sick', 'highland-game', 'p1');
  patch(state, 'sick', { summoningSickness: true });
  put(state, 'zdrowy', 'highland-game', 'p1');
  patch(state, 'zdrowy', { summoningSickness: false });
  put(state, 'foe', 'inferno-titan', 'p2');
  return state;
}

test('D/1: w Main 1 bot NIE tapuje Barda (zgłoszenie: tapował) — wybiera pass', () => {
  const state = bardBoard('main1');
  const chosen = bot().chooseCommand(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'pass_priority',
    `zdolność do użycia tylko w kroku deklaracji atakujących (wybrał: ${chosen?.type} ${chosen?.objectId ?? ''})`);
});

test('D/2: w kroku deklaracji atakujących bot wskazuje CHOREGO stwora (haste odblokowuje)', () => {
  const state = bardBoard('declare_attackers');
  const target = chosenActivation(playerView(state, 'p1'), 'bard');
  assert.equal(target, 'sick',
    `(a) chory stwór, którego haste realnie odblokuje (wybrał: ${target})`);
});

test('D/3: grant przed deklaracją realnie odblokowuje chorego stwora (kontrakt silnika)', () => {
  const state = bardBoard('declare_attackers');
  const view = playerView(state, 'p1');
  const attackersPrzed = view.legalCommands.filter((c) => c.type === 'declare_attackers')
    .map((c) => c.attackerIds);
  assert.ok(!attackersPrzed.some((ids) => ids.includes('sick')),
    `chory stwór nie może atakować bez haste (CR 302.6): ${JSON.stringify(attackersPrzed)}`);
  const act = view.legalCommands.find((c) => c.type === 'activate_ability'
    && c.objectId === 'bard' && c.targets?.includes('sick'));
  assert.ok(act, 'oferta aktywacji Barda na chorego stwora');
  assert.ok(execute(state, act).ok, 'aktywacja przyjęta');
  for (let i = 0; i < 6 && state.zones.stack.length > 0; i += 1) {
    assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
  }
  const po = playerView(state, 'p1');
  const attackersPo = po.legalCommands.filter((c) => c.type === 'declare_attackers')
    .map((c) => c.attackerIds);
  assert.ok(attackersPo.some((ids) => ids.includes('sick')),
    `po grancie haste chory stwór jest legalnym atakującym: ${JSON.stringify(attackersPo)}`);
  assert.ok((po.zones.battlefield.find((o) => o.id === 'sick')?.keywords ?? []).includes('haste'),
    'haste do końca tury na stworze');
});

test('D/4: gdy atakuje zdrowszy stwór (bez chorego) — bot wskazuje ATAKUJĄCEGO', () => {
  const state = game('declare_attackers');
  put(state, 'bard', BARD, 'p1');
  patch(state, 'bard', { summoningSickness: false });
  put(state, 'atak', 'highland-game', 'p1');
  patch(state, 'atak', { summoningSickness: false });
  put(state, 'foe', 'inferno-titan', 'p2');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atak'] }).ok);
  const target = chosenActivation(playerView(state, 'p1'), 'bard');
  assert.equal(target, 'atak', `(b) atakujący dostaje menace (CR 702.76) — wybrał: ${target}`);
});

test('D/5: w kroku bloków (i poza oknem) bot NIE używa zdolności', () => {
  const state = bardBoard('declare_blockers');
  const chosen = bot().chooseCommand(playerView(state, 'p1'));
  assert.notEqual(chosen?.type === 'activate_ability' && chosen.objectId === 'bard', true,
    'grant menace/haste po deklaracji bloków nic już nie zmienia');
});

test('D/6: w oknie, ale bez przypadku (a)/(b) — zdrowy, nieatakujący stwór — brak użycia', () => {
  // W oknie deklaracji, ale cel jest zdrowy i jeszcze nie atakuje: grant
  // menace/haste nic nie zmienia (haste nie odblokowuje, menace nie działa
  // przed deklaracją) — bot ma zadeklarować atak/pas, a nie tapować Barda.
  const state = game('declare_attackers');
  put(state, 'bard', BARD, 'p1');
  patch(state, 'bard', { summoningSickness: false });
  put(state, 'zdrowy', 'highland-game', 'p1');
  patch(state, 'zdrowy', { summoningSickness: false });
  put(state, 'foe', 'inferno-titan', 'p2');
  const view = playerView(state, 'p1');
  const chosen = bot().chooseCommand(view);
  assert.ok(!(chosen?.type === 'activate_ability' && chosen.objectId === 'bard'),
    `zdrowy, nieatakujący stwór nie jest ani (a), ani (b) (wybrał: ${chosen?.type} ${chosen?.objectId ?? ''})`);
});
