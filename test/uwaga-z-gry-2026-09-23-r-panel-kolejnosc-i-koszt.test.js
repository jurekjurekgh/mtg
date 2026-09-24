// Uwagi właściciela z gry 2026-09-23c — panel „Twoje działania”: kolejność
// deklaracji walki (E) i koszt w etykiecie odkrycia Cloaka (F3), a także sekcja
// „Przebieg tur (dla AI)” domyślnie rozwinięta (L).
//
// Zgłoszenia:
//  E  — „»Wybierz: Deklaracja atakujących« miała być w Twoje działania POD
//        »Dalej (Pass)«, a nie nad nim. »Wybierz: Deklaracja blokujących« też
//        miała być na górze, bezpośrednio POD »Dalej (Pass)«, a jest na samym
//        dole. Sprawdź też »Rozdziel obrażenia«.”
//  F3 — „Karta Cloak może być rzucona. Tylko w tej informacji w Twoje
//        działania powinien być też podany koszt tego rzucenia.”
//  L  — „Chciałbym, żeby domyślnie była rozwinięta tak jak log.”
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderTableView, commandLabel } from '../src/table/render.js';
import { createCardRegistry } from '../src/cards/card-data.js';

// --- minimalny DOM jak w strażnikach stołu (Q, M257 r3) ---------------------

class MiniEl {
  constructor() { this.children = []; this.text = ''; this.className = ''; this.dataset = {}; this.listeners = {}; }

  set textContent(v) { this.text = String(v); this.children = []; }

  get textContent() { return this.text + this.children.map((c) => c.textContent).join(' '); }

  set innerHTML(v) { this.text = String(v).replace(/<[^>]*>/g, ''); }

  get innerHTML() { return this.text; }

  appendChild(c) { this.children.push(c); return c; }

  addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }

  remove() {}

  querySelector() { return null; }

  querySelectorAll() { return []; }
}

const REGISTRY = createCardRegistry();

function renderPanel(legalCommands, { view = {} } = {}) {
  const baseView = {
    playerId: 'p1',
    status: 'active',
    players: [{ id: 'p1', name: 'Ty', life: 20, mana: 0 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20, mana: 0 }],
    zones: { stack: [], hand: [], battlefield: [], graveyard: [], exile: [], library: [] },
    turn: { number: 3, activePlayerId: 'p1', phase: 'combat', step: 'declare_attackers' },
    ...view,
    legalCommands,
  };
  const session = {
    view: () => baseView,
    log: [],
    logEntries: () => [],
    reasoning: [],
    state: { seed: 13, objects: new Map() },
    nameOf: (id) => REGISTRY.get(id)?.name ?? id,
    nameOfObject: (id) => id,
    cardDetails: (id) => REGISTRY.get(id) ?? null,
    colorsOf: () => [],
    abilitiesOf: () => [],
    hasMeaningfulDecision: () => true,
  };
  const els = {};
  for (const k of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn', 'exileZone', 'hand', 'handEnemy', 'actions', 'log']) {
    els[k] = new MiniEl();
  }
  const prevDoc = globalThis.document;
  globalThis.document = {
    createElement: () => new MiniEl(),
    createTextNode: (t) => ({ isText: true, text: String(t), get textContent() { return this.text; } }),
    addEventListener() {},
  };
  try {
    renderTableView({ els, session, play: () => {}, onCardClick: () => {}, onChoiceRequest: () => {} });
  } finally {
    globalThis.document = prevDoc;
  }
  return els.actions.children.map((b) => b.textContent);
}

test('E/1: deklaracje walki stoją POD „Dalej (Pass)” — nie nad nim i nie na dnie', () => {
  const labels = renderPanel([
    { type: 'pass_priority', playerId: 'p1' },
    { type: 'declare_attackers', playerId: 'p1', attackerIds: [] },
    { type: 'cast_spell', playerId: 'p1', objectId: 'shock', targets: [] },
  ]);
  assert.match(labels[0], /Dalej|Pass/, `pass musi być pierwszy: ${labels.join(' | ')}`);
  assert.match(labels[1], /Deklaracja atakujących/, `atakujący zaraz pod passem: ${labels.join(' | ')}`);
  assert.match(labels[2], /Rzuć/, `zwykłe zagrania niżej: ${labels.join(' | ')}`);
});

test('E/2: deklaracja blokujących też stoi bezpośrednio pod passem', () => {
  const labels = renderPanel([
    { type: 'pass_priority', playerId: 'p1' },
    { type: 'declare_blockers', playerId: 'p1', assignments: [] },
    { type: 'activate_ability', playerId: 'p1', objectId: 'x', abilityIndex: 0 },
  ]);
  assert.match(labels[0], /Dalej|Pass/);
  assert.match(labels[1], /Deklaracja blokujących/, `blokujący zaraz pod passem: ${labels.join(' | ')}`);
});

test('E/3: „Rozdziel obrażenia” ma to samo miejsce (pod passem)', () => {
  const labels = renderPanel([
    { type: 'pass_priority', playerId: 'p1' },
    { type: 'resolve_damage_assignment', playerId: 'p1', amounts: [] },
    { type: 'cast_spell', playerId: 'p1', objectId: 'shock', targets: [] },
  ]);
  assert.match(labels[0], /Dalej|Pass/);
  assert.match(labels[1], /Rozdziel obrażenia/, `rozdział zaraz pod passem: ${labels.join(' | ')}`);
});

test('E/4: gdy w oknie są OBIE deklaracje, kolejność jest stała (atakujący, blokujący)', () => {
  const labels = renderPanel([
    { type: 'cast_spell', playerId: 'p1', objectId: 'shock', targets: [] },
    { type: 'pass_priority', playerId: 'p1' },
    { type: 'declare_blockers', playerId: 'p1', assignments: [] },
    { type: 'declare_attackers', playerId: 'p1', attackerIds: [] },
  ]);
  assert.match(labels[0], /Dalej|Pass/);
  assert.match(labels[1], /Deklaracja atakujących/);
  assert.match(labels[2], /Deklaracja blokujących/);
});

test('F3: „Obróć twarzą do góry (Cloak)” pokazuje koszt odkrycia', () => {
  const text = commandLabel(
    { type: 'turn_cloak_face_up', playerId: 'p1', objectId: 'cl1' },
    {
      nameOfObject: () => 'Trostani Discordant (Cloak 1)',
      nameOf: (id) => REGISTRY.get(id)?.name ?? id,
      state: { objects: new Map([['cl1', { id: 'cl1', cardId: 'trostani-discordant', zone: 'battlefield', faceDown: true, cloakReady: true, cloakTurnUpCost: 5 }]]) },
      cardDetails: (id) => REGISTRY.get(id) ?? null,
    },
    {
      zones: {
        battlefield: [{ id: 'cl1', cardId: 'trostani-discordant', faceDown: true, faceDownCause: 'cloak', cloakTurnUpCost: 5 }],
        hand: [], graveyard: [], exile: [], stack: [], library: [],
      },
      pendingOptionalTrigger: null,
    },
  );
  assert.match(text, /Trostani Discordant/, `etykieta nazywa kartę: ${text}`);
  assert.match(text, /koszt/i, `etykieta musi nieść koszt (Cloak, CR 701.58b): ${text}`);
  assert.match(text, /ms-group/, `koszt ma ikony many: ${text}`);
});

test('L: sekcja „Przebieg tur (dla AI)” jest domyślnie rozwinięta', () => {
  const html = fs.readFileSync('src/table/index.html', 'utf8');
  const idx = html.indexOf('Przebieg tur (dla AI)');
  assert.ok(idx > 0, 'sekcja istnieje w stole');
  const openTag = html.lastIndexOf('<details', idx);
  const tag = html.slice(openTag, idx);
  assert.match(tag, /<details[^>]*\bopen\b/, `details sekcji AI musi mieć atrybut open: ${tag}`);
});


// --- F2: zakryta Aura to 2/2 bez typów (CR 708.2), nie „aura bez hosta" ------

test('F2: Aura zakryta (cloak) ZOSTAJE na polu bitwy — SBA aury jej nie dotyczy', async () => {
  const { createGameState, addObject } = await import('../src/engine/game-state.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const { runStateBasedActions } = await import('../src/engine/state-based.js');
  const state = createGameState({ seed: 4242, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn.number = 5;
  state.pendingMulligans = [];
  // Guildscorn Ward to czysta Aura („enchant creature") — dokładnie klasa
  // z raportu właściciela (Veiled Ascension + Aura na wierzchu biblioteki).
  const def = REGISTRY.get('guildscorn-ward');
  addObject(state, {
    id: 'cloaked-aura', instanceId: 'i-cloaked-aura', cardId: 'guildscorn-ward',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes,
  });
  // Chirurgia stanu: TEN SAM kształt, jaki nadaje ścieżka cloaka (effects.js:
  // faceDown + faceDownCause + brak gospodarza).
  const before = state.objects.get('cloaked-aura');
  state.objects.set('cloaked-aura', Object.freeze({ ...before, faceDown: true, faceDownCause: 'cloak' }));
  runStateBasedActions(state);
  // Ruch do grobu tworzy NOWY obiekt (inny id) — szukamy po cardId, jak pin H/3.
  const gdzie = [...state.objects.values()].filter((o) => o.cardId === 'guildscorn-ward').map((o) => o.zone);
  assert.deepEqual(gdzie, ['battlefield'],
    'zakryta Aura zostaje na stole (CR 708.2) — bez tego szła do grobu jak „aura bez hosta"');
});

test('F2/anty-over-fix: NIEZAKRYTA Aura bez hosta nadal idzie do grobu (CR 704.5m)', async () => {
  const { createGameState, addObject } = await import('../src/engine/game-state.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const { runStateBasedActions } = await import('../src/engine/state-based.js');
  const state = createGameState({ seed: 4243, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn.number = 5;
  state.pendingMulligans = [];
  const def = REGISTRY.get('guildscorn-ward');
  addObject(state, {
    id: 'loose-aura', instanceId: 'i-loose-aura', cardId: 'guildscorn-ward',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes,
  });
  runStateBasedActions(state);
  // Pin H/3 z 2026-09-21 (CR 704.5m, przypadek 3) — zwykła aura bez hosta
  // nadal umiera; ten test jest anty-over-fixem dla warunku `faceDown`.
  const gdzie = [...state.objects.values()].map((o) => o.zone);
  assert.equal(gdzie.includes('graveyard'), true,
    'zwykła aura bez hosta nadal umiera — reguła H/3 z 2026-09-21 obowiązuje');
});
