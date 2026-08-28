// M244 — zgłoszenia D, G, F właściciela (2026-08-27): wyposażanie bota.
//
// D: Cloak of the Bat (flying + haste) nakładana na stwora, który JUŻ lata.
//    Grant ewazji niczego nie dodaje (keyword mający się już = no-op), bot
//    wydawał 2 many na nic.
// G: Thieves' Tools (ewazja „can't be blocked as long as its power ≤ 3")
//    nakładane na stwora 4+ siły — warunkowa ewazja martwa, kara nie złapała.
// F: Lurking Green Dragon (statyczne „nie może atakować, jeśli obrońca nie
//    ma latającego") wyposażany, choć nie może atakować — premia ofensywna
//    (siła nosiciela + ewazja + haste) nic w jego garści nie warta.
//
// Root cause wspólny (L28): wycena Equip brała „premię nosiciela"
// 10+2·power jako wartość bazową BEZ sprawdzania, czy zawartość sprzętu
// dodaje nosicielowi COŚ nowego w tej sytuacji. Fix: wycena realnie dodanej
// wartości (nowe keyw., pompa P/T, ewazja warunkowa ważona obecnym stanem);
// nic-nie-dodaje = kara poniżej passu; cel nieatakujący traci premię
// ofensywną. Flaga stanu `cantAttackStatic` F leci w PlayerView
// (statyczne ograniczenia ataku = publiczna cecha, CR 603; silnik dzieli
// z view ten sam kod — staticAttackPrevented w combat.js, L48).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createGameState, execute, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 20, { W: 4, U: 4, B: 4, R: 4, G: 4 });
  addMana(state, 'p2', 4);
  return state;
}

function addCreature(state, id, cardId, controllerId, over = {}) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', ...gameObjectDataOf(def),
    types: def.types ?? ['Creature'], subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], abilities: def.abilities ?? [], ...over,
  });
  state.objects.set(id, Object.freeze({
    ...state.objects.get(id), summoningSickness: over.summoningSickness ?? false,
  }));
  return state.objects.get(id);
}

function addEquipment(state, id, cardId, controllerId) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'artifact', ...gameObjectDataOf(def),
    types: def.types ?? ['Artifact'], subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], abilities: def.abilities ?? [],
    equipment: def.equipment,
  });
}

function equipOffers(state) {
  return playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && (REGISTRY.get(c.cardId ?? '')?.equipment ?? c.objectId));
}

function botScoresForEquip(state, equipmentId) {
  const bot = createHeuristicBot({ seed: 2026 });
  bot.chooseCommand(playerView(state, 'p1'), {});
  const options = bot.trace()[0].options;
  return options.filter((o) => o.cmd.startsWith(`activate_ability(${equipmentId}`));
}

test('M244/D: Cloak of the Bat na stworze, który JUŻ lata = strata many (kara poniżej passu)', () => {
  const state = game();
  addCreature(state, 'flier', 'rustwing-falcon', 'p1'); // 1/2 flying
  addEquipment(state, 'cloak', 'cloak-of-the-bat', 'p1');
  const bot = createHeuristicBot({ seed: 2026 });
  const pick = bot.chooseCommand(playerView(state, 'p1'), {});
  const opt = botScoresForEquip(state, 'cloak');
  assert.ok(opt.length > 0, 'equip w ogóle oferowany');
  assert.ok(opt[0].score < 0, `cloak na latający stwór = niczego nie dodaje: score=${opt[0].score}`);
  assert.equal(pick.type, 'pass_priority', `bot nie wyposaża latającego w Cloak (wybrał: ${pick.type} ${pick.objectId ?? ''})`);
});

test('M244/G: Thieves\u2019 Tools na stworze z siłą 4 — ewazja warunkowa martwa (kara)', () => {
  const state = game();
  addCreature(state, 'big', 'lurking-green-dragon', 'p1'); // 4/4 (atak-unlock nieistotny tu)
  addEquipment(state, 'tools', 'thieves-tools', 'p1');
  const opt = botScoresForEquip(state, 'tools');
  assert.ok(opt.length > 0);
  assert.ok(opt[0].score < 0, `tools na 4-power: ewazja warunkowa martwa → score=${opt[0].score}`);
  // Sano, że na stworze power ≤3 ewazja warunkowa MUSI być wartościowa (anti-overfix):
  const state2 = game();
  addCreature(state2, 'foesmall', 'highland-game', 'p2'); // przeszkoda blokująca (nie-latająca)
  addCreature(state2, 'small', 'highland-game', 'p1', { summoningSickness: false }); // 2/1 własny
  addEquipment(state2, 'tools', 'thieves-tools', 'p1');
  const opt2 = botScoresForEquip(state2, 'tools');
  assert.ok(opt2.length > 0);
  assert.ok(opt2[0].score > 0, `tools na 2-power: ewazja warunkowa żyje → score=${opt2[0].score}`);
});

test('M244/F: Lurking Green Dragon bez latających u obrońcy nie jest wyposażany evasynnie', () => {
  const state = game();
  // Obrońca NIE ma latającego → LGD statycznie nie może atakować.
  addCreature(state, 'foe', 'highland-game', 'p2');
  addCreature(state, 'lgd', 'lurking-green-dragon', 'p1');
  // Flaga publiczna w PlayerView (integrity): engine widzi restrykcję.
  const lgdView = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'lgd');
  assert.equal(lgdView.cantAttackStatic, true, 'PlayerView niesie cantAttackStatic (LGD bez latania u obrońcy)');
  addEquipment(state, 'cloak', 'cloak-of-the-bat', 'p1');
  // Cloak dodaje flying+haste; LGD ma flying, a atak i tak zablokowany
  // restrykcją — nic nie zyskuje ofensywnie.
  const opt = botScoresForEquip(state, 'cloak');
  assert.ok(opt.length > 0);
  assert.ok(opt[0].score < 0, `wyposażanie nieatakującego = score<0: ${opt[0].score}`);
});

test('M244/F2: Lurking Green Dragon MOŻE atakować, gdy obrońca ma latacza (honorowanie cofnięcia restrykcji)', () => {
  const state = game();
  addCreature(state, 'foe-flier', 'rustwing-falcon', 'p2'); // obrońca ma latającego!
  addCreature(state, 'lgd', 'lurking-green-dragon', 'p1');
  const lgdView = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'lgd');
  assert.notEqual(lgdView.cantAttackStatic, true, 'restrykcja zamknięta, gdy obrońca ma latanie');
});


test('M244/F3: strażnik bramki cantAttackStatic — Equip z POMPKĄ (+3/+2) na nieatakującym daje WYRAŹNIE mniej (mutacja bramki F ma spaść)', () => {
  const state = game();
  addCreature(state, 'foe', 'highland-game', 'p2'); // obrońca bez latania
  addCreature(state, 'lgd', 'lurking-green-dragon', 'p1');
  addCreature(state, 'knight', 'locthwain-paladin', 'p1'); // zwykły atakujący 3/2
  addEquipment(state, 'sword', 'warriors-sword', 'p1'); // +3/+2 — ofensywnie przydatna
  const opts = botScoresForEquip(state, 'sword');
  const scoreFor = (targetId) => opts.find((o) => o.cmd.includes(`->${targetId}`))?.score;
  const onLgd = scoreFor('lgd');
  const onKnight = scoreFor('knight');
  assert.ok(onLgd != null && onKnight != null, `oferty na oba stwory: ${opts.map((o) => o.cmd).join(' | ')}`);
  // Bramka F działa: nieatakujący dostaje WYŁĄCZNIE wartość P/T pompy
  // (2+2·3+2=10), NIE premię ofensywną (10+2·4+…). Zwykły stwór ma więcej.
  // Bramka F działa: nieatakujący dostaje WYŁĄCZNIE wartość P/T pompy
  // (baza 2 + 2·3 + 2 = 12), NIE premię ofensywną (+10 i 2·moc nosiciela —
  // byłoby 20). Zwykły stwór (18) dostaje więcej.
  assert.ok(onLgd <= 12,
    `pompa na nieatakującym bez premii ofensywnej: ${onLgd} (mutant bez bramki F: ~20)`);
  assert.ok(onLgd < onKnight,
    `nieatakujący gorszy kandydat niż atakujący: ${onLgd} < ${onKnight}`);
});
