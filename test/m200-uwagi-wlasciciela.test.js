// M200 — uwagi właściciela z testów (2026-08-23): A (wycofane — patrz test), A2, B, C, C2, D, E, E2,
// F, G, H + weryfikacja zgłoszenia L z audytu agenta. Każdy punkt osobnym
// commitem (ADR 0020 C); plik rośnie kumulatywnie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { ventureIntoUndercityForTest } from '../src/engine/effects.js';
import fs from 'node:fs';
import { HUMAN_ID, BOT_ID, createSession } from '../src/table/session.js';
import { parseDeckText } from '../src/cards/deck-text.js';

class MiniEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.style = {}; this.dataset = {}; this.className = ''; this.text = ''; this.html = ''; this.value = ''; this.disabled = false; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.html = String(v); }
  get innerHTML() { return this.html; }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  querySelectorAll(selector) {
    const cls = selector.replace('.', '');
    const out = [];
    const walk = (node) => {
      for (const c of node.children ?? []) {
        if (String(c.className).split(' ').includes(cls)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
}
globalThis.document = {
  createElement: (tag) => new MiniEl(tag),
  createTextNode: (text) => ({ isText: true, text: String(text), get textContent() { return this.text; } }),
};

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 2001, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

/** Wchodzi do pokoju 2 (Forge): sekretne wejście → wybór trasy → Forge. */
function enterForge(state, playerId) {
  state.undercityProgress = { [playerId]: 1 };
  ventureIntoUndercityForTest(state, playerId);
  const forge = playerView(state, playerId).legalCommands
    .find((c) => c.type === 'resolve_undercity_route' && c.roomName === 'Forge');
  assert.ok(forge, 'oferta trasy „Forge”');
  assert.ok(execute(state, forge).ok, 'wybór Forge');
}

// ---- A2: rozgałęzienie lochu — nazwany tytuł wyboru -----------------------

test('M200/A2: wybór trasy Undercity ma nazwany tytuł (nie „Wariant (2 opcje)")', async () => {
  const { choiceGroupLabel } = await import('../src/table/render.js');
  const state = game('p1');
  state.undercityProgress = { p1: 1 };
  ventureIntoUndercityForTest(state, 'p1');
  assert.ok(state.pendingUndercityRoute, 'oczekująca decyzja trasy (Secret Entrance → Forge/Lost Well)');
  const view = playerView(state, 'p1');
  const routes = view.legalCommands.filter((c) => c.type === 'resolve_undercity_route');
  assert.equal(routes.length, 2, 'dwie ścieżki w ofercie');
  const session = {
    nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
    nameOfObject: (id) => String(id),
    abilitiesOf: (id) => REGISTRY.get(id)?.abilities ?? [],
  };
  const label = choiceGroupLabel({ type: 'target', options: routes }, session, view);
  assert.ok(label.includes('Ścieżka w Undercity'), `tytuł nazywa czynność: ${label}`);
  assert.ok(!label.includes('Wariant'), 'bez generycznego „Wariant”: ' + label);
});

// ---- A (WYCOFANE, decyzja właściciela 2026-08-23): pokój Forge CELOWA DOWOLNEGO stwora ----
// Wstępna „poprawka" A (kandydaci = tylko własne stwory) została WYCOFANA po
// przeanalizowaniu Oracle przez właściciela: zdolność pokoju MUSI się rozstrzygnąć,
// gdy istnieje legalny cel — stwór przeciwnika jest legalnym celem i musi móc
// go dostać liczniki. Reguła procesu (L57): zgłoszenie właściciela weryfikować
// wobec Oracle/CR PRZED wdrożeniem — rozbieżność zgłaszać, nie wdrażać ślepo.

test('M200/A (wycofane): Forge — stwór PRZECIWNIKA jest legalnym celem i dostaje liczniki', () => {
  const state = game('p1');
  putCard(state, 'foe', 'highland-game', 'p2'); // jedyny stwór na stole
  enterForge(state, 'p1');
  assert.equal(state.pendingRoomTargets.length, 1,
    'istnieje legalny cel (stwór przeciwnika) — decyzja celu OBOWIĄZUJE (Oracle)');
  assert.deepEqual(state.pendingRoomTargets[0].candidateIds, ['foe'],
    'kandydaci = wszystkie stwory na polu bitwy');
  const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_room_target');
  assert.ok(cmd, 'oferta wyboru celu');
  assert.ok(execute(state, cmd).ok, 'wybór celu');
  assert.equal(state.objects.get('foe')?.counters?.['+1/+1'] ?? 0, 2,
    'zdolność rozstrzyga się na jedynym legalnym celu (właściciel: „musi być wykonana”)');
});

test('M200/A (wycofane): Forge bez JAKIEGOKOLWIEK stwora — efekt fizzluje (brak legalnego celu)', () => {
  const state = game('p1');
  enterForge(state, 'p1');
  assert.equal(state.pendingRoomTargets.length, 0, 'zero stworów = brak legalnego celu = fizzle');
});
// ---- B: nazwy kart w logu partii są klikalne (fullscreen Scryfall) --------
// M167/E2 napisało linki (appendLogLineWithCardLinks + delegacja kliku w
// main.js), ale render czytał `session.cardIdByName` — a sesja NIE EKSPONUJĄC
// mapy (żyła tylko w closure) log był zawsze czystym tekstem. Klasa L5:
// testy M167 testowały funkcję z rękodziełem, nie wiring sesja→render.

test('M200/B: sesja eksponuje cardIdByName, a log partii rendery linkowane nazwy', async () => {
  const fs = await import('node:fs');
  const { HUMAN_ID, BOT_ID } = await import('../src/table/session.js');
  const { parseDeckText } = await import('../src/cards/deck-text.js');
  const { renderTableView } = await import('../src/table/render.js');
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/innistrad.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/dominaria.txt', 'utf8'), registry).cardIds],
  ]);
  const session = createSession({ seed: 3, registry, decks });
  assert.ok(session.cardIdByName instanceof Map, 'mapa nazwa→cardId na sesji (root cause B)');
  assert.equal(session.cardIdByName.get('Highland Game'), 'highland-game',
    'w mapie są karty rejestru');
  // Wpis logu z nazwą karty → render owija ją w klikalny span (delegacja
  // kliku otwierająca fullscreen podpięta jest w main.js na els.log).
  session.log.push({ kind: 'event', text: 'Nieprzyjaciel rzuca Highland Game i przepuszcza.' });
  const els = {};
  for (const key of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn', 'exileZone', 'hand', 'actions', 'log']) {
    els[key] = new MiniEl(`#${key}`);
  }
  renderTableView({ els, session, play: () => {}, onCardClick: () => {} });
  const spans = [...els.log.querySelectorAll('.log-card')];
  assert.ok(spans.length >= 1, `nazwa karty owinięta w span.log-card: ${els.log.textContent.slice(0, 120)}`);
  assert.equal(spans[0].dataset.cardId, 'highland-game', 'span niesie cardId do openCardFullscreenByCardId');
});
// ---- C: mulligan — odłożenie N kart na spód zaznaczaniem (nie kombinacje) ---

function subsetsOf(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [head, ...rest] = arr;
  return [
    ...subsetsOf(rest, k - 1).map((s) => [head, ...s]),
    ...subsetsOf(rest, k),
  ];
}

test('M200/C: plan mulliganu = wiersz na kartę; komenda odnawiana po podzbiorze (L48)', async () => {
  const { mulliganBottomPlanOf, commandForMulliganSelection } = await import('../src/table/multi-target.js');
  const cards = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'];
  const commands = subsetsOf(cards, 3)
    .map((combo) => ({ type: 'resolve_mulligan_bottom_choice', playerId: 'p1', cardIds: combo }));
  assert.equal(commands.length, 35, 'engine enumeruje C(7,3)=35 komend (bez zmian — boty wybierają z listy)');
  const plan = mulliganBottomPlanOf(commands);
  assert.deepEqual([...plan.targets].sort(), cards, 'wizard: 7 wierszy (po karcie), nie 35 przycisków');
  assert.equal(plan.count, 3);
  const found = commandForMulliganSelection(commands, ['a7', 'a2', 'a1']);
  assert.ok(found, 'dowolna kolejność zaznaczania = ten sam podzbiór');
  assert.equal(commandForMulliganSelection(commands, ['a1', 'a2']), null, '2 < 3 — brak komendy');
  assert.equal(commandForMulliganSelection(commands, ['a1', 'a2', 'x']), null, 'karta spoza ręki — brak komendy');
  assert.equal(mulliganBottomPlanOf([{ type: 'resolve_mulligan_bottom_choice', cardIds: ['a1'] }]), null,
    'pojedyncza komenda — zwykła lista, bez wizarda');
});

test('M200/C: wizard mulliganu — zatwierdź aktywuje się przy dokładnie N kart i oddaje komendę silnika', async () => {
  const { renderMultiTargetWizard } = await import('../src/table/choice-request.js');
  const { mulliganBottomPlanOf } = await import('../src/table/multi-target.js');
  const cards = ['a1', 'a2', 'a3', 'a4', 'a5'];
  const commands = subsetsOf(cards, 2)
    .map((combo) => ({ type: 'resolve_mulligan_bottom_choice', playerId: 'p1', cardIds: combo }));
  const plan = mulliganBottomPlanOf(commands);
  const view = {
    zones: {
      hand: cards.map((id) => ({ id, cardId: id, controllerId: 'p1' })),
      battlefield: [], stack: [], graveyard: [], library: [],
    },
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
  };
  const session = { nameOf: (id) => `Karta ${id}`, nameOfObject: (id) => `Karta ${id}` };
  let completed = null;
  const host = new MiniEl('div');
  renderMultiTargetWizard(host, {
    view, session, plan, commands,
    intro: 'Mulligan: zaznacz 2 karty do odłożenia na spód biblioteki:',
    onComplete: (cmd) => { completed = cmd; },
    onCancel: () => {},
  });
  const toggles = host.querySelectorAll('.multi-target-toggle');
  assert.equal(toggles.length, 5, 'wiersz na każdą kartę ręki');
  const confirm = host.querySelectorAll('.multi-target-confirm')[0];
  assert.equal(confirm.disabled, true, 'bez zaznaczenia — Zatwierdź wyłączone');
  toggles[0].listeners.click[0](); // a1
  assert.equal(confirm.disabled, true, '1 z 2 — nadal wyłączone');
  toggles[2].listeners.click[0](); // a3
  assert.equal(confirm.disabled, false, 'dokładnie 2 karty — włączone (komenda istnieje w engine)');
  confirm.listeners.click[0]();
  assert.ok(completed, 'zatwierdzenie oddało komendę');
  assert.deepEqual([...completed.cardIds].sort(), ['a1', 'a3'], 'komenda = podzbiór z legalCommands silnika');
});

// ---- C2: etykieta „Zatrzymaj tę rękę” liczy ŻYWĄ rękę -----------------------

test('M200/C2: „Zatrzymaj tę rękę” pokazuje aktualną liczbę kart (nie zawsze 7)', async () => {
  const { commandLabel } = await import('../src/table/render.js');
  const view = {
    zones: { hand: ['h1', 'h2', 'h3', 'h4', 'h5'].map((id) => ({ id, cardId: id, controllerId: 'p1' })) },
    players: [{ id: 'p1', name: 'Ty' }],
  };
  const session = { nameOf: (id) => id, nameOfObject: (id) => id, state: { mulliganCounts: {} } };
  const label = commandLabel({ type: 'resolve_mulligan_choice', playerId: 'p1', keep: true }, session, view);
  assert.ok(label.includes('5 kart'), `etykieta liczy żywą rękę (5): ${label}`);
  assert.ok(!label.includes('7 kart'), 'stare „7 kart” zniknęło: ' + label);
});
// ---- D+E2: any_creature_dies dotyczy WYŁĄCZNIE stworów (CR 700.4c) --------
// Zgłoszenie D: „w jednej turze trigger zadziałał dwa razy” — Selhoff
// Occultist mielił przy poświęceniu Blazing Torch (ARTEFAKT) i przy śmierci
// Reassembling Skeleton (stwór). E2: „poświęciłem Rupture Spire (LAND) i
// aktywował się trigger”. Wspólna przyczyna: skan zgonów odpalał
// any_creature_dies dla KAŻDEGO obiektu battlefield→grób, bez filtra
// kind === 'creature'. Naprawa w fireDeathTriggers (triggers.js).

function addLibCards(state, playerId, n, cardId = 'highland-game') {
  for (let i = 0; i < n; i += 1) putCard(state, `${playerId}-lib${i}`, cardId, playerId, 'library');
}

function milledBy(state, playerId) {
  return [...state.objects.values()]
    .filter((o) => o.cardId === 'highland-game' && o.zone === 'graveyard' && o.controllerId === playerId).length;
}

/** Rozstrzyga stos i decyzje celu Selhoffa (cel: p2). */
function drainTriggersAndStack(state) {
  for (let i = 0; i < 30; i += 1) {
    if (state.pendingTriggerTargets.length > 0) {
      const pending = state.pendingTriggerTargets[0];
      const done = execute(state, { type: 'resolve_trigger_target', playerId: pending.playerId, targetId: 'p2' });
      assert.ok(done.ok, done.events?.[0]?.reason);
      continue;
    }
    if (state.zones.stack.length > 0) {
      const done = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
      assert.ok(done.ok, done.events?.[0]?.reason);
      continue;
    }
    break;
  }
}

test('M200/E2: poświęcenie LANDU nie odpala any_creature_dies (Selhoff)', () => {
  const state = game('p1');
  putCard(state, 'occ', 'selhoff-occultist', 'p1');
  putCard(state, 'mon', 'seismic-monstrosaur', 'p1');
  putCard(state, 'land', 'basic-mountain', 'p1');
  putCard(state, 'land2', 'basic-island', 'p1');
  putCard(state, 'p1lib0', 'highland-game', 'p1', 'library'); // monstrosaur dobiera (pusta biblioteka = przegrana, CR 106.3)
  addLibCards(state, 'p2', 3);
  const p1 = state.players.find((p) => p.id === 'p1');
  p1.mana = 3;
  p1.manaPool = { R: 1, '': 2 };
  // {2}{R}, Sacrifice a land: Draw a card — poświęcenie lądu jako KOSZT.
  const res = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'mon', abilityIndex: 0, sacrificeLandId: 'land' });
  assert.ok(res.ok, res.events?.[0]?.reason);
  drainTriggersAndStack(state);
  assert.equal(state.pendingTriggerTargets.length, 0,
    'poświęcony LAND nie jest śmiercią (CR 700.4c) — trigger NIE mógł odpalić');
  assert.equal(milledBy(state, 'p2'), 0, 'żadna karta zmielona');
  assert.ok(state.objects.get('land') == null, 'ląd faktycznie poświęcony (test nie jest próżny)');
});

test('M200/D: poświęcenie lądu + śmierć stwora w tej samej turze = DOKŁADNIE 1 trigger', () => {
  const state = game('p1');
  putCard(state, 'occ', 'selhoff-occultist', 'p1');
  putCard(state, 'mon', 'seismic-monstrosaur', 'p1');
  putCard(state, 'land', 'basic-mountain', 'p1');
  putCard(state, 'land2', 'basic-island', 'p1');
  putCard(state, 'p1lib0', 'highland-game', 'p1', 'library'); // monstrosaur dobiera (CR 106.3)
  const victim = putCard(state, 'victim', 'highland-game', 'p1');
  state.objects.set('victim', Object.freeze({ ...victim, power: 1, toughness: 1, summoningSickness: false }));
  addLibCards(state, 'p2', 3);
  const p1 = state.players.find((p) => p.id === 'p1');
  p1.mana = 3;
  p1.manaPool = { R: 1, '': 2 };
  // 1) poświęcenie lądu (artefakt/land — NIE śmierć):
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'mon', abilityIndex: 0, sacrificeLandId: 'land' }).ok);
  drainTriggersAndStack(state);
  assert.equal(state.pendingTriggerTargets.length, 0, 'po poświęceniu lądu: zero triggerów');
  // 2) śmierć stwora (prawdziwy zgon — SBA po obrażeniach walki):
  const atk = putCard(state, 'atk', 'highland-game', 'p2');
  state.objects.set('atk', Object.freeze({ ...atk, power: 5, toughness: 5, summoningSickness: false }));
  state.turn = { ...state.turn, number: 4, activePlayerId: 'p2', priorityPlayerId: 'p2', phase: 'combat', step: 'declare_attackers', stepIndex: 5, passes: 0 };
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['atk'] }).ok);
  // Ofiara BLOKUJE (5 mocy zabija 1/1 w odbiciu; niewyblokowany atak raniłby gracza).
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: { atk: ['victim'] } }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' }).ok);
  assert.equal(state.objects.get('victim'), undefined, 'ofiara zginęła (test nie jest próżny)');
  drainTriggersAndStack(state);
  assert.equal(milledBy(state, 'p2'), 1,
    'dokładnie JEDEN trigger (za śmierć stwora) — przed fixem było 2 (fałszywy + prawdziwy)');
});
// ---- E: kreator many decyzji płatniczej — tap źródła przechodzi bramkę ----
// Zgłoszenie: Rupture Spire („sacrifice it unless you pay {1}") — wybór
// „zapłać maną” otwierał kreatora many, w którym NIE DAŁO SIĘ nic tapnąć:
// tap_for_mana odrzucany „pay_or_sacrifice_unresolved”. Gracz musiał
// poświęcić. Root cause: bramka oczekującej decyzji blokowała WSZYSTKO poza
// komendą płatności, a kreator (M195/A) tapuje źródła PRZED nią. Fix:
// komendy dodające manę do puli decydującego przechodzą normalne
// rozstrzygnięcie (rodzina trzech bramek — L28).

test('M200/E: Rupture Spire — kreator może tapnąć źródło, potem płatność z puli (brak poświęcenia)', () => {
  const state = game('p1');
  putCard(state, 'spire', 'rupture-spire', 'p1', 'hand');
  putCard(state, 'l1', 'basic-island', 'p1');
  putCard(state, 'l2', 'basic-forest', 'p1');
  const res = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'spire' });
  assert.ok(res.ok, res.events?.[0]?.reason);
  drainTriggersAndStack(state);
  assert.ok(state.pendingPayOrSacrifice, 'oczekująca decyzja zapłać/poświęć');
  const p1 = state.players.find((p) => p.id === 'p1');
  assert.equal(p1.mana, 0, 'pula pusta (test nie jest próżny)');
  // 1) tap źródła — dokładnie to, co robi kreator many:
  const tap = execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: 'l1' });
  assert.ok(tap.ok, `tap_for_mana musi przejść mimo oczekującej decyzji: ${tap.events?.[0]?.reason ?? ''}`);
  assert.equal(p1.mana, 1, 'mana w puli');
  // 2) komendy NIEDODAJĄCE many wciąż blokowane (decyzja musi zostać rozstrzygnięta):
  const bad = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(bad.ok, false, 'pass bez rozstrzygnięcia decyzji — odrzucony');
  assert.equal(bad.events?.[0]?.reason, 'pay_or_sacrifice_unresolved', 'ten sam powód co przed fixem (bramka żywa)');
  // 3) płatność z puli — spire NIE jest poświęcony:
  const pay = execute(state, { type: 'resolve_pay_or_sacrifice', playerId: 'p1', pay: true });
  assert.ok(pay.ok, pay.events?.[0]?.reason);
  const spire = [...state.objects.values()].find((o) => o.cardId === 'rupture-spire');
  assert.ok(spire && spire.zone === 'battlefield', 'Rupture Spire na polu (nie poświęcony)');
  assert.equal(p1.mana, 0, '{1} opłacone z puli');
});
// ---- F: reanimacja Skeletona w turze bota — auto-pass nie może przeskoczyć ---
// Zgłoszenie: Skeleton zginął w fazie walki bota; auto-pass „przelatuje”
// do początku tury gracza i reanimację ({1}{B} z grobu) gracz dostaje
// dopiero w upkeepu. Weryfikacja: engine OFERUJE aktywację z grobu w
// postcombat bota (z priorytetem gracza) — więc sesja musi się na niej
// ZATRZYMAĆ, nie auto-passować. (Jeżeli w grze gracza źródła many były
// tapnięte w tym oknie, brak oferty jest poprawny — CR 502.4/601.2f;
// test pinuje zachowanie dla okna, w którym koszt jest opłacalny.)

test('M200/F: sesja zatrzymuje się na opłacalnej reanimacji w postcombat bota', async () => {
  const fs = await import('node:fs');
  const { HUMAN_ID, BOT_ID } = await import('../src/table/session.js');
  const { parseDeckText } = await import('../src/cards/deck-text.js');
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/innistrad.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/dominaria.txt', 'utf8'), registry).cardIds],
  ]);
  const session = createSession({ seed: 77, registry, decks });
  // Domykamy mulligany (obaj zatrzymują ręce) aż do statusu active.
  // Decyzja bota idzie przez advance (session.continueBotPlay) — widok
  // sesji to zawsze widok CZŁOWIEKA.
  for (let i = 0; i < 30 && (session.state.pendingMulligans?.length ?? 0) > 0; i += 1) {
    const keep = session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice');
    if (keep) {
      const res = session.apply(keep);
      if (!res.ok) throw new Error(res.rejected?.reason ?? 'mulligan apply');
      continue;
    }
    session.continueBotPlay();
  }
  assert.equal(session.state.status, 'active', 'gra ruszyła po mulliganach');
  const state = session.state;
  // Skeleton w grobie gracza + dwa nietapnięte źródła {1}{B} (swamp + dowolne).
  putCard(state, 'skel', 'reassembling-skeleton', HUMAN_ID, 'graveyard');
  putCard(state, 'sw', 'basic-swamp', HUMAN_ID);
  putCard(state, 'mt', 'basic-mountain', HUMAN_ID);
  // Okno: tura bota, postcombat main, priorytet gracza, stos pusty.
  state.turn = { ...state.turn, number: 3, activePlayerId: BOT_ID, priorityPlayerId: HUMAN_ID,
    phase: 'postcombat_main', step: 'main', stepIndex: 11, passes: 0 };
  state.zones.stack = [];
  session.continueBotPlay();
  assert.equal(state.turn.phase, 'postcombat_main',
    'auto-pass NIE przeskoczył okna z opłacalną reanimacją (stan tury bez zmian)');
  assert.equal(state.turn.priorityPlayerId, HUMAN_ID, 'priorytet wciąż gracza');
  const offer = session.view().legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'skel');
  assert.ok(offer, 'oferta reanimacji ({1}{B}) widoczna dla gracza w turze bota');
});
