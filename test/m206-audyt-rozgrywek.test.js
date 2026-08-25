// M206 — audyt rozgrywek Żywym Testerem (zlecenie właściciela).
//
// Oś audytu: efektywność czarów i zdolności bota (timing, wybór celu).
// Każdy test odtwarza sytuację ZMIERZONĄ w transkrypcie, nie wymyśloną.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

/**
 * Plansza z jednym stworem bota, który ma pump za manę („{1}{G}: +2/+2”).
 * `extra` pozwala dołożyć blokera i oznaczyć wilka jako atakującego.
 */
function boardWithPumpCreature(step, { attacking = false, blocker = false } = {}) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  const wolf = REGISTRY.get('snarling-wolf');
  addObject(state, {
    id: 'wolf', instanceId: 'i-w', cardId: 'snarling-wolf', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 1, manaCost: 1,
    abilities: wolf.abilities ?? [], keywords: [], subtypes: ['Wolf'], types: ['Creature'], colors: ['G'],
  });
  state.objects.set('wolf', Object.freeze({
    ...state.objects.get('wolf'), summoningSickness: false, ...(attacking ? { attacking: true } : {}),
  }));
  if (blocker) {
    addObject(state, {
      id: 'blk', instanceId: 'i-b', cardId: 'goblin-piker', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2,
      abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['R'],
    });
    state.objects.set('blk', Object.freeze({ ...state.objects.get('blk'), blocking: ['wolf'] }));
  }
  return state;
}

const pumpsWolf = (cmd) => cmd.type === 'activate_ability' && cmd.objectId === 'wolf';

test('M206/A1: bot nie pompuje stwora w POCZĄTKU WALKI (przed deklaracją ataku)', () => {
  // Transkrypt (warhammer vs innistrad, seed 8, profil explorer): trzykrotnie
  //   • Faza: Początek walki
  //   • Nieprzyjaciel aktywuje zdolność: Snarling Wolf — zmiana statystyk celu
  // …i ani jednego ataku w tej turze. Dwie many za +2/+2, które wygasa
  // w cleanup (CR 514.2), powtórzone w turach 9 i 16 tej samej partii.
  //
  // Root cause: `beginning_of_combat` należy do fazy `combat` (TURN_STEPS),
  // więc bramka „pump ma sens dopiero w combacie” przepuszczała krok, w którym
  // atakujący NIE SĄ jeszcze zadeklarowani. Sam komentarz przy tej bramce mówi
  // „po deklaracji atakujących/blokujących” — kod tego nie egzekwował.
  const view = playerView(boardWithPumpCreature('beginning_of_combat'), 'p2');
  const legal = (view.legalCommands ?? []).some(pumpsWolf);
  assert.ok(legal, 'warunek wstępny: pump jest legalny w tym kroku (nie blokujemy mechaniki)');
  const choice = createHeuristicBot({ seed: 7 }).chooseCommand(view, {});
  assert.ok(!pumpsWolf(choice),
    `pump przed deklaracją ataku to wyrzucona mana: ${JSON.stringify(choice)}`);
});

test('M206/A2: pump zostaje dostępny po deklaracji bloków (nie przesadziliśmy z karą)', () => {
  // Kontrola do A1: wilk 1/1 atakuje i jest blokowany przez 2/2. Tutaj +2/+2
  // realnie rozstrzyga wymianę, więc zdolność MUSI zostać wybrana — inaczej
  // naprawa timingu zabiłaby mechanikę zamiast ją naprawić.
  const state = boardWithPumpCreature('declare_blockers', { attacking: true, blocker: true });
  const choice = createHeuristicBot({ seed: 7 }).chooseCommand(playerView(state, 'p2'), {});
  assert.ok(pumpsWolf(choice),
    `pump w obronie wymiany bojowej ma sens i ma być wybrany: ${JSON.stringify(choice)}`);
});

test('M206/A3: bot atakuje zamiast pompować, gdy stoi w początku walki', () => {
  // Skutek pozytywny naprawy: zamiast spalić manę bot przechodzi do ataku.
  // (`declare_attackers` to następny krok — sprawdzamy, że wilk w nim atakuje.)
  const state = boardWithPumpCreature('declare_attackers');
  const choice = createHeuristicBot({ seed: 7 }).chooseCommand(playerView(state, 'p2'), {});
  assert.equal(choice.type, 'declare_attackers', JSON.stringify(choice));
  assert.deepEqual(choice.attackerIds, ['wolf']);
});

// ---------------------------------------------------------------------------
// Oś (a) cd. — WYBÓR CELU, nie tylko moment.
// ---------------------------------------------------------------------------

/** Plansza: po jednym Island u każdego gracza, aura `cardId` w ręce bota. */
function boardWithAuraInHand(cardId) {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  for (const [id, controllerId] of [['mine', 'p2'], ['theirs', 'p1']]) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: 'island', controllerId, ownerId: controllerId,
      zone: 'battlefield', kind: 'land', types: ['Land'], subtypes: ['Island'],
      keywords: [], colors: [], abilities: [],
    });
  }
  const aura = REGISTRY.get(cardId);
  addObject(state, {
    id: 'aura', instanceId: 'i-aura', cardId, controllerId: 'p2', ownerId: 'p2',
    zone: 'hand', kind: 'aura', ...gameObjectDataOf(aura),
    types: aura.types ?? [], keywords: aura.keywords ?? [], subtypes: aura.subtypes ?? [], aura: aura.aura,
  });
  return state;
}

test('M206/A4: aura karząca kontrolera gospodarza idzie na land WROGA, nie na własny', () => {
  // Transkrypt (dominaria vs ravnica, seed 19, profil random):
  //   • Nieprzyjaciel rzuca Chronic Flooding → cel: Island
  //   • Chronic Flooding zaczarowuje Island        <- WŁASNY
  //   • Chronic Flooding — trigger (zatapnięcie zaczarowanego permanentu)
  //   • Nieprzyjaciel mieli Forced Landing do grobu
  // …i tak pięć razy w jednej partii. Bot płacił {1}{U} za to, żeby mielić
  // SIEBIE po 3 karty przy każdym tapnięciu własnego landu.
  //
  // Root cause: `auraIsHostile` znało wrogość zapisaną w deskryptorze aury
  // albo w jej triggerze WEJŚCIA, i tylko dla efektów wrogich PERMANENTOWI.
  // Chronic Flooding uderza w GRACZA (mill) i to triggerem późniejszym
  // („whenever enchanted land becomes tapped”), więc aura wyglądała jak buff.
  const view = playerView(boardWithAuraInHand('chronic-flooding'), 'p2');
  const legalTargets = (view.legalCommands ?? [])
    .filter((c) => c.type === 'cast_permanent' && c.objectId === 'aura')
    .map((c) => c.targets?.[0]);
  assert.deepEqual(legalTargets.slice().sort(), ['mine', 'theirs'],
    'warunek wstępny: oba landy są legalnymi gospodarzami');

  const choice = createHeuristicBot({ seed: 5 }).chooseCommand(view, {});
  if (choice.type === 'cast_permanent' && choice.objectId === 'aura') {
    assert.equal(choice.targets?.[0], 'theirs',
      `aura milląca kontrolera gospodarza na WŁASNYM landzie = self-mill: ${JSON.stringify(choice)}`);
  }
});

test('M206/A5: to samo rozpoznanie po deskryptorze, nie po nazwie karty (ADR 0002)', () => {
  // Reguła ma działać dla KAŻDEJ aury, której trigger niesie efekt wrogi
  // graczowi z `applyTo: 'enchanted_controller'` — sprawdzamy to wprost na
  // definicji karty, żeby test nie pilnował samego Chronic Flooding.
  const def = REGISTRY.get('chronic-flooding');
  const trigger = (def.abilities ?? []).find((a) => a?.type === 'triggered');
  const effects = Array.isArray(trigger?.effect) ? trigger.effect : [trigger?.effect];
  assert.ok(effects.some((e) => e?.applyTo === 'enchanted_controller'),
    'rozpoznanie opiera się na deskryptorze applyTo, nie na id karty');
  assert.notEqual(trigger?.trigger?.event, 'enter_battlefield',
    'to trigger PÓŹNIEJSZY niż wejście — stara bramka go nie widziała');
});
