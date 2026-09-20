// =============================================================================
// P3 (paka uwag właściciela 2026-09-19b) — punkty E1, E2, L.
//
// E1 — Inferno Titan, modal podziału obrażeń:
//   „Nie widzę, kto kontroluje stworzenia na liście celów.”
//   Lista kandydatów miesza stwory obu graczy, a sama nazwa tego nie mówi
//   (dwie kopie tego samego elka u przeciwników wyglądają identycznie).
//   Fix: cel-permanent w wizardzie podziału niesie dopisek kontrolera
//   („(Twój)” / „(Nieprzyjaciela)”) — z widoku DECYDENTA, nie z nazwy karty
//   (ADR 0002); przy nieznanym decydencie brak dopisku (L41).
//
// E2 — ten sam modal: „brakuje Merfolk Tokenu bota 1/1”.
//   POMIAR, nie założenie (plan P3): token Merfolk z Jungleborn Pioneera ma
//   hexproof, a źródłem podziału jest zdolność CZŁOWIEKA — brak na liście
//   celów jest POPRAWNY (CR 702.11b: hexproof blokuje cele z czarów i
//   zdolności PRZECIWNIKÓW). Ten plik przypina OBIE strony pomiaru: z
//   hexproofem nie ma go na liście, bez hexproofa jest; własny stwór z
//   hexproofem jest celem legalnym dla własnej zdolności.
//
// L — Óin the Brave: „badge powinien brzmieć »Storied: +1/0«, a jest samo
//   »+1/0«”. Fix: widok niesie KLUCZ warunku nazwanej mechaniki
//   (`grantedStatMechanics`), a render nazywa ją na badge’u
//   („Storied: +1/+0” — zapis P/T jak w Oracle). Warunek anonimowy
//   (Evangel of Synthesis: liczba dobranych kart) zostaje bez etykiety.
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createBattlefieldToken } from '../src/engine/tokens.js';
import { runStateBasedActions } from '../src/engine/state-based.js';
import {
  STATIC_CONDITION_MECHANIC_LABELS, buildStateOverlay, cardInfo,
} from '../src/table/render.js';

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

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

/** Token Merfolk jak z Jungleborn Pioneera (ten sam konstruktor co silnik). */
function merfolkToken(state, controllerId, { hexproof }) {
  return createBattlefieldToken(state, controllerId, {
    cardId: 'token_merfolk', name: 'Merfolk', kind: 'creature', power: 1, toughness: 1,
    colors: ['U'], types: ['Creature'], subtypes: ['Merfolk'],
    keywords: hexproof ? ['hexproof'] : [],
  });
}

/** Rzut Inferno Titana i domknięcie stosu do decyzji celów (ETB trigger). */
function titanPending(state) {
  put(state, 'titan', 'inferno-titan', 'p1', 'hand');
  addMana(state, 'p1', 6, { colors: ['R', 'R', 'R', 'R', 'R', 'R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'titan');
  assert.ok(cast, 'oferta rzutu Tytana');
  assert.ok(execute(state, cast).ok, 'rzut przyjęty');
  let required = null;
  for (let i = 0; i < 20 && !required; i += 1) {
    const pid = state.turn.priorityPlayerId;
    const view = playerView(state, pid);
    const cmd = view.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!cmd) break;
    const r = execute(state, cmd);
    required = (r.events ?? []).find((e) => e.type === 'trigger_target_required') ?? null;
  }
  assert.ok(required, 'decyzja celów triggera otwarta');
  return required.candidateIds;
}

// ---------------------------------------------------------------------------
// E1 — kontroler przy kandydacie w wizardzie podziału obrażeń
// ---------------------------------------------------------------------------

class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {}; this.className = '';
    this.text = ''; this.dataset = {}; this.disabled = false;
    this.classList = { toggle: () => {} };
  }

  set textContent(v) { this.text = String(v); this.children = []; }

  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }

  set innerHTML(v) { this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }

  get innerHTML() { return this.textContent; }

  appendChild(c) { this.children.push(c); return c; }

  addEventListener(t, l) { (this.listeners[t] ??= []).push(l); }

  click() { for (const l of this.listeners.click ?? []) l({ preventDefault() {}, stopPropagation() {} }); }
}

/** Lista etykiet wierszy wizarda podziału dla widoku `view`. */
async function divisionRowLabels(view, candidateIds) {
  const { renderDamageDivisionWizard } = await import('../src/table/choice-request.js');
  const oldDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  try {
    const host = new MiniEl('div');
    const session = {
      nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
      nameOfObject: (id) => String(id),
      faceDownName: () => 'morph',
    };
    renderDamageDivisionWizard(host, {
      view, session, candidateIds, total: 3, maxTargets: 3,
      onComplete: () => {}, onCancel: () => {},
    });
    const out = [];
    const walk = (node) => {
      for (const child of node.children ?? []) {
        if (String(child.className).includes('damage-wizard-name')) out.push(child.textContent);
        walk(child);
      }
    };
    walk(host);
    return out;
  } finally {
    globalThis.document = oldDocument;
  }
}

test('E1/1: wiersz podziału obrażeń mówi, KTO kontroluje cel-permanent', async () => {
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    zones: {
      battlefield: [
        { id: 'moj', cardId: 'inferno-titan', controllerId: 'p1' },
        { id: 'wrogi', cardId: 'dawntreader-elk', controllerId: 'p2' },
      ],
      hand: [], stack: [], graveyard: [], library: [],
    },
  };
  const labels = await divisionRowLabels(view, ['moj', 'wrogi', 'p2']);
  assert.deepEqual(labels, ['Inferno Titan (Twój)', 'Dawntreader Elk (Nieprzyjaciela)', 'Nieprzyjaciel'],
    `kandydaci niosą kontrolera (a cel-gracz zostaje nazwą gracza): ${JSON.stringify(labels)}`);
});

test('E1/2: bez znanego decydenta w widoku wizard NIE zgaduje strony (L41)', async () => {
  const view = {
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    zones: {
      battlefield: [{ id: 'c1', cardId: 'dawntreader-elk', controllerId: 'p2' }],
      hand: [], stack: [], graveyard: [], library: [],
    },
  };
  const labels = await divisionRowLabels(view, ['c1']);
  assert.deepEqual(labels, ['Dawntreader Elk'],
    'brak `playerId` = brak dopisku kontrolera (żadnego „Nieprzyjaciela” nad własnym stworem)');
});

// ---------------------------------------------------------------------------
// E2 — hexproof w liście celów (pomiar, CR 702.11b)
// ---------------------------------------------------------------------------

test('E2/1: token z hexproofem NIE jest celem zdolności przeciwnika (CR 702.11b)', () => {
  const state = game();
  const token = merfolkToken(state, 'p2', { hexproof: true });
  put(state, 'plain', 'dawntreader-elk', 'p2');
  const candidates = titanPending(state);
  assert.ok(!candidates.includes(token.id),
    `hexproof blokuje cele ze zdolności przeciwnika — token nie może być kandydatem: ${JSON.stringify(candidates)}`);
  // Kontrola: to nie jest ślepe wycięcie tokenów — zwykły stwór bota JEST na liście.
  assert.ok(candidates.some((id) => state.objects.get(id)?.cardId === 'dawntreader-elk'),
    'inny stwór bota zostaje kandydatem');
  assert.ok((state.objects.get(token.id)?.keywords ?? []).includes('hexproof'),
    'token naprawdę ma hexproof (bo inaczej ten test nic nie mierzy)');
});

test('E2/2: ten sam token BEZ hexproofa jest kandydatem (kontrola pomiaru)', () => {
  const state = game();
  const token = merfolkToken(state, 'p2', { hexproof: false });
  put(state, 'plain', 'dawntreader-elk', 'p2');
  const candidates = titanPending(state);
  assert.ok(candidates.includes(token.id),
    `bez hexproofa token wchodzi na listę celów: ${JSON.stringify(candidates)}`);
});

test('E2/3: WŁASNY token z hexproofem jest celem własnej zdolności (kontrola)', () => {
  const state = game();
  const token = merfolkToken(state, 'p1', { hexproof: true });
  const candidates = titanPending(state);
  assert.ok(candidates.includes(token.id),
    `hexproof chroni tylko przed przeciwnikiem — własny cel zostaje: ${JSON.stringify(candidates)}`);
});

// ---------------------------------------------------------------------------
// L — badge Óina: „Storied: +1/+0”, nie gołe „+1/0”
// ---------------------------------------------------------------------------

const SESSION_MOCK = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
  nameOfObject: (id) => String(id),
  cardDetails: (id) => REGISTRY.get(id) ?? null,
  colorsOf: (id) => REGISTRY.get(id)?.colors ?? [],
  view: () => ({ zones: { battlefield: [] } }),
};

function badgesOf(info) {
  const oldDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  try {
    const visual = new MiniEl('div');
    buildStateOverlay(visual, info);
    return visual.descendants?.()
      ?? (() => {
        const out = [];
        const walk = (n) => { for (const c of n.children ?? []) { out.push(c); walk(c); } };
        walk(visual);
        return out;
      })().filter((el) => String(el.className).includes('ovl-badge'))
      .map((el) => el.textContent);
  } finally {
    globalThis.document = oldDocument;
  }
}

/** Óin + trzy artefakty = enduring story (Storied ustawia się w SBA). */
function storiedBoard() {
  const state = game();
  put(state, 'oin', 'oin-the-brave', 'p1');
  put(state, 'art1', 'thieves-tools', 'p1');
  put(state, 'art2', 'thieves-tools', 'p1');
  put(state, 'art3', 'thieves-tools', 'p1');
  runStateBasedActions(state);
  return state;
}

test('L/1: widok niesie MECHANIKĘ nadanego bonusu (deskryptor warunku)', () => {
  const state = storiedBoard();
  assert.equal(state.players.find((p) => p.id === 'p1').enduringStory, true,
    'Storied ustawione (SBA) — punkt odniesienia pomiaru');
  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'oin');
  assert.equal(entry.grantedPower, 1, '+1/+0 z enduring story');
  assert.equal(entry.grantedToughness ?? 0, 0, 'wytrzymałość bez zmian');
  assert.deepEqual(entry.grantedStatMechanics,
    [{ condition: 'enduringStory', power: 1, toughness: 0 }],
    'widok nazywa WARUNEK (deskryptor), nie nazwę karty (ADR 0002)');
});

test('L/2: kafel Óina pokazuje badge „Storied: +1/+0” (bez gołego „+1/+0”)', () => {
  const state = storiedBoard();
  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'oin');
  const badges = badgesOf(cardInfo(SESSION_MOCK, entry, null));
  assert.ok(badges.includes('Storied: +1/+0'),
    `badge z nazwą mechaniki (badge: ${JSON.stringify(badges)})`);
  assert.ok(!badges.includes('+1/+0'),
    `goły „+1/+0” znika — inaczej ten sam bonus byłby policzony dwa razy (badge: ${JSON.stringify(badges)})`);
  assert.ok(badges.some((b) => b === 'Pośpiech'), 'haste z tej samej statyki bez zmian');
});

test('L/3: bez enduring story statyka nie działa — żadnego badge’a mocy (kontrola)', () => {
  const state = game();
  put(state, 'oin', 'oin-the-brave', 'p1');
  runStateBasedActions(state);
  assert.equal(state.players.find((p) => p.id === 'p1').enduringStory, false, 'brak etykiety Storied');
  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'oin');
  const badges = badgesOf(cardInfo(SESSION_MOCK, entry, null));
  assert.ok(!badges.some((b) => b.includes('+1/+0')),
    `przy niespełnionym warunku nie ma badge’a mocy (badge: ${JSON.stringify(badges)})`);
});

test('L/4: warunek ANONIMOWY zostaje bez etykiety mechaniki (kontrola regresji M188/A4)', () => {
  // Evangel of Synthesis: „+1/+0 i menace” pod warunkiem liczby dobranych kart
  // — karta NIE nazywa tego mechaniką, więc badge nie może dostać etykiety.
  const state = game();
  put(state, 'ev', 'evangel-of-synthesis', 'p1');
  state.cardsDrawnThisTurn = { p1: 2 };
  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'ev');
  const badges = badgesOf(cardInfo(SESSION_MOCK, entry, null));
  assert.ok(badges.includes('+1/+0'), `goły badge mocy zostaje (badge: ${JSON.stringify(badges)})`);
  assert.ok(!badges.some((b) => b.includes(': +1/+0')),
    `żadna nazwa mechaniki nie może się dokleić do anonimowego warunku (badge: ${JSON.stringify(badges)})`);
});

test('L/5: STRAŻNIK SŁOWNIKA — każda etykieta mapy ma pokrycie w katalogu', () => {
  // Mapa `condition → nazwa mechaniki` nie może się rozjechać z danymi:
  // dla każdego jej wpisu musi istnieć karta katalogu, która (a) ma statyczną
  // zdolność z tym warunkiem i (b) WYDRUKOWUJE nazwę mechaniki w Oracle.
  const cards = REGISTRY.all();
  for (const [condition, label] of Object.entries(STATIC_CONDITION_MECHANIC_LABELS)) {
    const zWarunkiem = cards.filter((def) => (def.abilities ?? [])
      .some((a) => a?.type === 'static' && a.condition && condition in a.condition));
    assert.ok(zWarunkiem.length > 0,
      `warunek ${condition} nie występuje w katalogu — etykieta „${label}” jest martwa`);
    assert.ok(zWarunkiem.some((def) => (def.oracleText ?? '').includes(label)),
      `żadna karta z warunkiem ${condition} nie nazywa mechaniki „${label}” w Oracle`);
  }
});
