// Audyt PR #171 — F-2 (CR 701.35a + CR 605.3 + L41/L48):
// Zatrzymany (detained) permanent nie może blokować ani aktywować ŻADNYCH
// zdolności aktywowanych — w tym zdolności manowych (CR 605.1a / CR 305.6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createBattlefieldToken } from '../src/engine/tokens.js';
import { jumpToStep } from '../src/engine/turn.js';
import { creatureCantBlock, detainUntilYourNextTurn } from '../src/engine/permanents.js';
import { producibleMana, canPayColoredCost, treasureManaAvailable } from '../src/engine/resources.js';
import { manaSourcesOf } from '../src/table/mana-wizard.js';
import { buildStateOverlay, cardInfo } from '../src/table/render.js';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';

const registry = createCardRegistry();

class MiniEl {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.className = '';
    this.text = '';
    this.style = {};
    this.listeners = {};
  }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(' | '); }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
}

const renderSession = {
  cardDetails: (cardId) => registry.get(cardId) ?? null,
  nameOf: (cardId) => registry.get(cardId)?.name ?? cardId,
};

function makeState() {
  const s = createGameState({ seed: 171, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main1', 'p2');
  s.turn.activePlayerId = 'p2';
  s.turn.priorityPlayerId = 'p2';
  return s;
}

function putCard(state, id, cardId, zone, { runtime = {}, ...patch } = {}) {
  const def = registry.get(cardId);
  assert.ok(def, `Karta ${cardId} musi istnieć w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p2', ownerId: 'p2',
    zone,
    ...gameObjectDataOf(def),
    types: [...(def.types ?? [])],
    subtypes: [...(def.subtypes ?? [])],
    keywords: [...(def.keywords ?? [])],
    ...patch,
  });
  const base = state.objects.get(id);
  const updated = Object.freeze({ ...base, summoningSickness: false, ...runtime });
  state.objects.set(id, updated);
  return updated;
}

test('F-2/1 (CR 701.35a + CR 605.3): zatrzymany dork manowy nie liczy się do producibleMana i nie jest auto-tapowany', () => {
  const s = makeState();
  putCard(s, 'f1', 'basic-forest', 'battlefield');
  putCard(s, 'dork', 'scorned-villager', 'battlefield');
  putCard(s, 'ally', 'makindi-aeronaut', 'hand', { colors: ['G'], manaCost: 2 });

  assert.equal(producibleMana(s, 'p2'), 2);

  detainUntilYourNextTurn(s, 'dork', 'p1');
  assert.equal(producibleMana(s, 'p2'), 1, 'zatrzymany Scorned Villager nie może dawać many do producibleMana');
  const casts = playerView(s, 'p2').legalCommands.filter((c) => c.type === 'cast_permanent' && c.objectId === 'ally');
  assert.equal(casts.length, 0, 'oferta rzutu za 2 many nie może powstać z 1 lądu i zatrzymanego dorka');
  const illegal = execute(s, { type: 'cast_permanent', playerId: 'p2', objectId: 'ally' });
  assert.equal(illegal.ok, false, 'wykonanie rzutu musi odrzucić płatność bez auto-tapu zatrzymanego dorka');
  assert.equal(s.objects.get('dork').tapped, false, 'zatrzymany dork pozostaje nietapnięty');
});

test('F-2/2 (CR 701.35a + CR 605.3): zatrzymane źródło kosztowe i zatrzymany Skarb nie dają many ani kolorów', () => {
  const s = makeState();
  putCard(s, 'f1', 'basic-forest', 'battlefield');
  putCard(s, 'cylix', 'mana-cylix', 'battlefield');
  // Okaz Skarbu MUSI mieć kształt kontraktu `treasureManaAbilityOf`
  // (mana-sources.js): koszt { tap, sacrificeSelf } i `fromTreasure: true`
  // — dokładnie jak `token_treasure` w katalogu. Audyt PR #172 F-1: okaz
  // `{ sacrifice: true }` bez `fromTreasure` nie był dla silnika Skarbem,
  // więc asercje po detainie przechodziły także bez bramki `detained`
  // (mutacja B audytu; klasa L65). Asercje bazowe PRZED detainem poniżej
  // dowodzą, że okaz realnie produkuje manę i kolor {U}.
  const treasure = createBattlefieldToken(s, 'p2', {
    cardId: 'token_treasure', name: 'Treasure', kind: 'artifact',
    types: ['Artifact'], subtypes: ['Treasure'],
    abilities: [{ type: 'activated', cost: { tap: true, sacrificeSelf: true }, effect: { type: 'add_mana', amount: 1, colors: ['W', 'U', 'B', 'R', 'G'], fromTreasure: true } }],
  });

  assert.equal(treasureManaAvailable(s, 'p2'), 1, 'BAZA: Skarb o katalogowym kształcie daje manę przed detainem');
  assert.equal(producibleMana(s, 'p2'), 2, 'BAZA: Forest + Skarb produkują 2 przed detainem');
  assert.equal(canPayColoredCost(s, 'p2', [['U']]), true,
    'BAZA: Mana Cylix i Skarb pokrywają kolor {U} przed detainem');

  detainUntilYourNextTurn(s, 'cylix', 'p1');
  detainUntilYourNextTurn(s, treasure.id, 'p1');

  assert.equal(treasureManaAvailable(s, 'p2'), 0, 'zatrzymany Skarb nie może być wliczany do treasureManaAvailable');
  assert.equal(producibleMana(s, 'p2'), 1, 'zatrzymany Skarb nie podnosi producibleMana');
  assert.equal(canPayColoredCost(s, 'p2', [['U']]), false,
    'zatrzymany Mana Cylix i zatrzymany Skarb nie pokrywają koloru {U}');
});

test('F-2/3 (CR 701.35a + CR 305.6 + L48): zatrzymany animowany ląd odrzuca tap_for_mana i znika z kreatora many', () => {
  const s = makeState();
  putCard(s, 'anim-land', 'basic-forest', 'battlefield', {
    kind: 'creature', types: ['Creature', 'Land'], subtypes: ['Forest', 'Elemental'],
    power: 3, toughness: 3,
  });
  detainUntilYourNextTurn(s, 'anim-land', 'p1');

  assert.equal(producibleMana(s, 'p2'), 0, 'zatrzymany animowany ląd nie daje many');
  const tapRes = execute(s, { type: 'tap_for_mana', playerId: 'p2', objectId: 'anim-land' });
  assert.equal(tapRes.ok, false, 'tap_for_mana na zatrzymanym lądzie musi zostać odrzucone');
  assert.equal(s.objects.get('anim-land').tapped, false);

  const view = playerView(s, 'p2');
  const wizardSources = manaSourcesOf(view, 'p2', () => null);
  assert.deepEqual(wizardSources, [], 'kreator many nie może oferować tap_for_mana dla zatrzymanego lądu');
});

test('F-2/4 (CR 701.35a + CR 509.1b/c + L41): zatrzymany stwór nie przechodzi walidacji declare_blockers i nie blokuje pustej deklaracji przy blocksIfAble', () => {
  const s = makeState();
  putCard(s, 'atk', 'makindi-aeronaut', 'battlefield', { controllerId: 'p1', ownerId: 'p1', keywords: [] });
  putCard(s, 'blk', 'makindi-aeronaut', 'battlefield', {
    controllerId: 'p2', ownerId: 'p2', keywords: [],
    runtime: { blocksIfAble: true, blockRequirementCount: 1 },
  });
  detainUntilYourNextTurn(s, 'blk', 'p1');
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p1');
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p1';
  assert.equal(execute(s, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] }).ok, true);
  while (s.turn.step !== 'declare_blockers') {
    assert.equal(execute(s, { type: 'pass_priority', playerId: s.turn.priorityPlayerId }).ok, true);
  }

  const detainedBlk = s.objects.get('blk');
  assert.equal(creatureCantBlock(detainedBlk, s), true, 'creatureCantBlock musi zwracać true dla detained');
  const illegalBlock = execute(s, { type: 'declare_blockers', playerId: 'p2', assignments: { atk: ['blk'] } });
  assert.equal(illegalBlock.ok, false, 'declare_blockers z zatrzymanym stworem musi być odrzucone');
  assert.match(illegalBlock.reason ?? '', /Nielegalny blokujący/, 'odrzucenie z powodu zakazu blokowania, nie kroku tury');
  const legalEmpty = execute(s, { type: 'declare_blockers', playerId: 'p2', assignments: {} });
  assert.equal(legalEmpty.ok, true, 'zatrzymany stwór z blocksIfAble nie może wymuszać niemożliwego bloku');
});

test('F-2/5 (CR 701.35a + CR 708.2): kafel zakrytego permanentu pod detain renderuje badge zakazu zdolności aktywowanych', () => {
  const prevDoc = globalThis.document;
  globalThis.document = { createElement: (tagName) => new MiniEl(tagName) };
  try {
    const sess = createSession({
      seed: 7, registry,
      decks: new Map([
        [HUMAN_ID, Array(60).fill('basic-plains')],
        [BOT_ID, Array(60).fill('basic-island')],
      ]),
    });
    putCard(sess.state, 'morph-victim', 'makindi-aeronaut', 'battlefield', {
      controllerId: BOT_ID, ownerId: BOT_ID,
      kind: 'creature', types: ['Creature'], subtypes: [], colors: [],
      power: 2, toughness: 2, manaCost: 0, abilities: [], keywords: [],
      runtime: { faceDown: true, faceDownCause: 'morph' },
    });
    detainUntilYourNextTurn(sess.state, 'morph-victim', HUMAN_ID);

    const viewObj = sess.view().zones.battlefield.find((o) => o.id === 'morph-victim');
    const info = cardInfo(sess, viewObj);
    assert.equal(info.cantActivateAbilitiesNow, true,
      'cardInfo zakrytego permanentu pod detain musi nieść cantActivateAbilitiesNow=true');
    const visual = new MiniEl('div');
    buildStateOverlay(visual, info);
    assert.match(visual.textContent, /nie może używać zdolności aktywowanych/);
    assert.match(visual.textContent, /nie może atakować ani blokować/);
  } finally {
    globalThis.document = prevDoc;
  }
});
