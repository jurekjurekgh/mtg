// M157 — regresje z uwag właściciela po testach artefaktu (review PR #66).
//
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { renderPoisonPanel } from '../src/table/render.js';

// C — Skilled Animator (CMR): Oracle „target artifact you control becomes an
//     artifact creature with base power and toughness 5/5 FOR AS LONG AS this
//     creature remains on the battlefield". Engine czyścił animację w cleanup
//     (jak „until end of turn"), więc animowany artefakt wracał do postaci
//     nie-stwora po jednej turze. Root cause: clearStatModifiers cofał KAŻDY
//     obiekt z originalBeforeAnimation, także ten z ŻYWYM linkiem w
//     state.linkedAnimations (mechanika LTB w moveObjectDirectly istnieje).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { applyEffect } from '../src/engine/effects.js';
import {
  animatePermanentUntilEndOfTurn, clearStatModifiers, effectivePower, effectiveToughness,
} from '../src/engine/permanents.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { addCounter } from '../src/engine/counters.js';

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 157, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function putCard(state, id, cardId, controllerId = 'p1', zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...data, types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

test('C1: animacja Skilled AnimatoRA trwa przez cleanup, póki źródło jest na polu bitwy', () => {
  const state = game();
  putCard(state, 'animator', 'skilled-animator', 'p1');
  putCard(state, 'talisman', 'pristine-talisman', 'p1');

  // ETB trigger AnimatoRA celuje we własny artefakt (efekt z definicji karty).
  const ability = REGISTRY.get('skilled-animator').abilities[0];
  applyEffect(state, Array.isArray(ability.effect) ? ability.effect[0] : ability.effect, state.objects.get('animator'), ['talisman']);

  let obj = state.objects.get('talisman');
  assert.equal(obj.kind, 'creature', 'artefakt animowany na stwora');
  assert.equal(effectivePower(obj, state), 5);
  assert.equal(effectiveToughness(obj, state), 5);

  // Koniec tury (cleanup) — animacja LINKED nie może się skończyć.
  clearStatModifiers(state);
  obj = state.objects.get('talisman');
  assert.equal(obj.kind, 'creature', 'M157/C: po cleanup animacja linked nadal trwa');
  assert.ok((obj.types ?? []).includes('Creature'), 'typ Creature utrzymany');
  assert.equal(effectivePower(obj, state), 5, 'moc nadal 5');
  assert.equal(effectiveToughness(obj, state), 5, 'wytrzymałość nadal 5');

  // Źródło odchodzi z pola bitwy → animacja cofnięta (CR: „as long as...").
  moveObjectDirectly(state, 'animator', 'graveyard', 'grave-animator');
  obj = state.objects.get('talisman');
  assert.notEqual(obj.kind, 'creature', 'po zejściu źródła artefakt wraca do siebie');
  assert.ok(!(obj.types ?? []).includes('Creature'), 'typ Creature znika z odejściem źródła');
  assert.equal(effectivePower(obj, state), null, 'artefakt bez mocy');
});

test('C2 (anty-over-fix): zwykła animacja „do końca tury" bez linku kończy się w cleanup', () => {
  const state = game();
  putCard(state, 'talisman', 'pristine-talisman', 'p1');
  animatePermanentUntilEndOfTurn(state, 'talisman', { power: 4, toughness: 4, typesAdd: ['Creature'] });
  let obj = state.objects.get('talisman');
  assert.equal(obj.kind, 'creature');
  clearStatModifiers(state);
  obj = state.objects.get('talisman');
  assert.notEqual(obj.kind, 'creature', 'EOT animacja kończy się w cleanup jak dotąd');
});

test('C3: station 9+ charge — po zejściu AnimatoRA stwór zostaje (L46 + linked)', () => {
  const state = game();
  putCard(state, 'animator', 'skilled-animator', 'p1');
  putCard(state, 'rammer', 'wedgelight-rammer', 'p1');
  const ability = REGISTRY.get('skilled-animator').abilities[0];
  applyEffect(state, Array.isArray(ability.effect) ? ability.effect[0] : ability.effect, state.objects.get('animator'), ['rammer']);
  addCounter(state, 'rammer', 'charge', 9);
  assert.equal(state.objects.get('rammer').kind, 'creature');

  clearStatModifiers(state);
  assert.equal(state.objects.get('rammer').kind, 'creature', 'linked utrzymuje przez cleanup');

  moveObjectDirectly(state, 'animator', 'graveyard', 'grave-animator-2');
  const obj = state.objects.get('rammer');
  // Animacja cofnięta, ale station 9+ charge sam utrzymuje typ stwora (L46).
  assert.equal(obj.kind, 'creature', 'station utrzymuje Creature po cofnięciu animacji');
  assert.equal(effectivePower(obj, state), 3, 'drukowana 3/4 po powrocie z animacji');
  assert.equal(effectiveToughness(obj, state), 4);
});


// B — każdy token rejestru ma ilustrację Scryfall (ADR 0022: karty grywalne
// i tokeny na stole mają obraz; „niby-karta" jako zaślepka usunięta z hovera).
test('B: każdy token rejestru ma imageUri ze Scryfall', () => {
  const missing = REGISTRY.all()
    .filter((c) => c.id.startsWith('token_'))
    .filter((c) => !(c.imageUri ?? '').startsWith('https://cards.scryfall.io/'));
  assert.deepEqual(missing.map((c) => c.id), [],
    'tokeny bez obrazu Scryfall (zaślepka na stole):');
});

// C — sanity karty: oracleText Skilled AnimatoRA potwierdza link (nie EOT).
test('C0: dane Skilled AnimatoRA mówią „as long as", nie „until end of turn"', () => {
  const def = REGISTRY.get('skilled-animator');
  assert.match(def.oracleText, /for as long as this creature remains/);
  assert.doesNotMatch(def.oracleText, /until end of turn/);
});

// D — Lodestone Needle / stun: koniec blokady ma być widoczny na stole.
// Pauza przy zdjęciu licznika stun i przy pierwszym untapie po stunie
// (inaczej kreatura „nigdy się nie odkręca wizualnie" — atakowała legalnie
// będąc narysowana zatapowana od Needle aż do okna ataku).
test('D: pauza i render przy zejściu stunów i pierwszym untapie po stunie', () => {
  const registry = REGISTRY;
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/green.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/black.txt', 'utf8'), registry).cardIds],
  ]);
  const session = createSession({ seed: 5, registry, decks, pauseOnBotMoves: true });
  // Stwór BOTA zatapowany z 2 licznikami stun (stan jak po Lodestone Needle).
  addObject(session.state, {
    id: 'stunned', instanceId: 'i-stunned', cardId: 'thornhide-wolves',
    controllerId: BOT_ID, ownerId: BOT_ID, zone: 'battlefield', kind: 'creature',
    power: 5, toughness: 5, manaCost: 5, abilities: [], keywords: [],
    subtypes: ['Wolf'], types: ['Creature'], colors: ['G'],
  });
  session.state.objects.set('stunned', Object.freeze({
    ...session.state.objects.get('stunned'),
    tapped: true, summoningSickness: false,
    counters: Object.freeze({ stun: 2 }),
  }));

  const seen = [];
  let guard = 0;
  while (session.state.status === 'active' && guard++ < 900) {
    if (session.botPausePending) {
      const texts = session.botMoves.map((m) => m.text ?? '');
      if (texts.some((x) => x.includes('licznik stun'))) {
        seen.push({ kind: 'stun-removed', obj: session.state.objects.get('stunned') });
      }
      if (texts.some((x) => x.includes('odkręca się (koniec liczników stun)'))) {
        seen.push({ kind: 'untap-visible', obj: session.state.objects.get('stunned') });
      }
      session.clearBotMoves();
      session.continueBotPlay();
      continue;
    }
    if (seen.some((s) => s.kind === 'untap-visible')) break;
    const view = session.view();
    const cmd = view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type !== 'concede');
    if (!cmd) break;
    session.apply(cmd);
  }

  assert.equal(seen.filter((s) => s.kind === 'stun-removed').length, 2,
    'dwa upkeepy ze zdjęciem licznika stun = dwie pauzy z widocznym licznikiem');
  const untap = seen.find((s) => s.kind === 'untap-visible');
  assert.ok(untap, 'pauza „odkręca się (koniec liczników stun)" w trzecim upkeepie');
  assert.equal(untap.obj.tapped, false, 'kafel rysowany odkręcony w momencie pauzy');
  assert.equal((untap.obj.counters ?? {}).stun ?? 0, 0, 'brak liczników stun');
});


// F — panel liczników trucizny (M157/F): widoczny z ilustracją i licznikami
// graczy, gdy ktoś ma truciznę; ukryty, gdy nikt nie ma.
class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.style = {}; this.className = '';
    this.text = ''; this.src = ''; this.alt = ''; this.loading = ''; this.decoding = '';
  }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener() {}
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
  find(p) { return this.descendants().find(p) ?? null; }
  findAll(p) { return this.descendants().filter(p); }
}

test('F: panel trucizny — ukryty przy 0, widoczny z licznikami przy poison > 0', async () => {
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  const { renderPoisonPanel } = await import('../src/table/render.js');
  const poisonEl = new MiniEl('div');

  renderPoisonPanel({ poison: poisonEl }, {
    playerId: 'p1', players: [{ id: 'p1', poison: 0 }, { id: 'p2', poison: 0 }],
  });
  assert.equal(poisonEl.hidden, true, 'bez trucizny panel ukryty');

  renderPoisonPanel({ poison: poisonEl }, {
    playerId: 'p1', players: [{ id: 'p1', poison: 3 }, { id: 'p2', poison: 1 }],
  });
  assert.equal(poisonEl.hidden, false, 'panel widoczny przy poison > 0');
  const img = poisonEl.find((el) => el.tagName === 'img');
  assert.ok(img, 'ilustracja Poison Counter w panelu');
  assert.match(img.src, /cards\.scryfall\.io\/large\/front\/8\/a\/8a9cb417/);
  assert.match(poisonEl.textContent, /Ty: 3 liczniki trucizny/, 'licznik gracza');
  assert.match(poisonEl.textContent, /Nieprzyjaciel: 1 licznik trucizny/, 'licznik przeciwnika');
  assert.match(poisonEl.textContent, /10 licznik/);
});

// F2: playerView niesie poison graczy (ADR 0017).
test('F2: playerView projektuje liczniki trucizny graczy', () => {
  const state = game();
  state.players[0].poison = 4;
  const view = playerView(state, 'p2');
  assert.equal(view.players.find((p) => p.id === 'p1').poison, 4, 'poison p1 jawny');
  assert.equal(view.players.find((p) => p.id === 'p2').poison ?? 0, 0, 'poison p2 default 0');
});
