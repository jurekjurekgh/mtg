// W3 — wizard podziału obrażeń po stronie BLOKERA (CR 510.1c/510.1d) w UI stołu.
//
// Dlaczego ten test istnieje (pomiar 2026-09-12): ścieżka istnieje zarówno w silniku
// (`combat.js` — `pending.role === 'blocker'`, `buildDamageAssignmentView`,
// `validateBlockerDamageAssignment`), jak i w UI (`choice-request.js` —
// `renderDamageWizard` normalizuje role i pokazuje „przydziel moc blokera atakującym,
// których blokuje"), ale NIE BYŁO ani jednej partii, w której ten ekran się pojawił:
// podwójny blok daje w katalogu jedna karta (Cenn's Tactician — `blockSlotsFor`),
// a do tego potrzeba jeszcze licznika +1/+1 (drugi slot) i dwójki atakujących.
// Polowanie na seed tego nie daje, więc brakowało DETERMINISTYCZNEGO scenariusza stołu.
// Ten plik jest takim scenariuszem i spina całą oś: stan → widok gracza → wizard →
// komenda gracza → obrażenia w silniku, plus równoważność bramki UI z walidatorem
// silnika na wszystkich osiągalnych podziałach (L48: oferta i protokół zgodne).
//
// CR (dosłownie, jak w teście regułowym wyzwanie-3):
//   510.1a „Each attacking creature and each blocking creature assigns combat damage
//           equal to its power. Creatures that would assign 0 or less damage this way
//           don't assign combat damage at all."
//   510.1c „...if a creature is blocking or being blocked by more than one creature,
//           its controller chooses how its damage is divided among them..." (podział
//           dowolny — lethal-first to polityka domyślna, nie wymóg)
//   510.1d „A blocking creature assigns combat damage to the creatures it's blocking.
//           ... If it's blocking two or more creatures, it assigns its combat damage
//           divided as its controller chooses among them."
// Bloker nie ma trample (CR 702.19b dotyczy atakującego), więc suma podziału = moc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { validateBlockerDamageAssignment } from '../src/engine/combat.js';
import { renderDamageWizard } from '../src/table/choice-request.js';

// Stub DOM — ta sama konwencja co test/choice-request-ui.test.js (L17: `dataset`
// jak w przeglądarce, `replaceChildren` dla przebudowy wierszy).
class MiniEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.className = '';
    this.text = '';
    this.html = '';
    this.type = '';
    this.disabled = false;
    this.dataset = {};
  }

  set textContent(value) { this.text = String(value); this.html = ''; this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(value) { this.html = String(value); this.text = String(value).replace(/<[^>]*>/g, ''); this.children = []; }
  get innerHTML() { return (this.html ? this.html : this.text) + this.children.map((c) => c.innerHTML).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...nodes) { this.children = nodes.flat(); }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  click() { for (const listener of this.listeners.click ?? []) listener({ stopPropagation() {}, preventDefault() {} }); }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };

const has = (el, cls) => String(el.className ?? '').split(/\s+/).includes(cls);
function byClass(host, cls) {
  const out = [];
  const walk = (el) => {
    if (has(el, cls)) out.push(el);
    for (const child of el.children ?? []) walk(child);
  };
  walk(host);
  return out;
}
function byText(host, tag, tekst) {
  const out = [];
  const walk = (el) => {
    if (el.tagName === tag && el.textContent.includes(tekst)) out.push(el);
    for (const child of el.children ?? []) walk(child);
  };
  walk(host);
  return out;
}

const REGISTRY = createCardRegistry();
const SESSION = { nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? '?' };

function atStep(state, step, priorityId, activeId = priorityId) {
  state.turn = { ...jumpToStep(state.turn, step, priorityId), activePlayerId: activeId };
  return state;
}
function putCard(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  const object = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...object, summoningSickness: false }));
  return state.objects.get(id);
}

/**
 * Scenariusz z testu regułowego W3 (`wyzwanie-3-bloker-dwóch-atakujacych-510-1d`):
 * p2 atakuje DWOMA gurmag-drowner (2/4), p1 blokuje OBA jednym segmented-krotiq
 * (6/5 + licznik +1/+1 = 7/6). Licznik daje drugi slot bloku (statyka Cenn's
 * Tactician na stole p1) — bez niego podwójny blok jest odrzucany.
 */
function doubleBlock() {
  const state = createGameState({ seed: 113, players: [{ id: 'p1' }, { id: 'p2' }] });
  atStep(state, 'declare_attackers', 'p2');
  putCard(state, 'tact', 'cenns-tactician', 'p1');
  const wall = putCard(state, 'wall', 'segmented-krotiq', 'p1');
  state.objects.set('wall', Object.freeze({ ...wall, counters: { '+1/+1': 1 } }));
  putCard(state, 'a1', 'gurmag-drowner', 'p2');
  putCard(state, 'a2', 'gurmag-drowner', 'p2');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['a1', 'a2'] }).ok);
  atStep(state, 'declare_blockers', 'p1', 'p2');
  const blocks = execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: { a1: ['wall'], a2: ['wall'] } });
  assert.ok(blocks.ok, `podwójny blok legalny dzięki statyce: ${blocks.events?.[0]?.reason}`);
  atStep(state, 'combat_damage', 'p2');
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' }).ok);
  return state;
}

/** Widok gracza z zakolejkowanym przydziałem blokera + komenda domyślna. */
function widokBlokera(state = doubleBlock()) {
  const view = playerView(state, 'p1');
  const pending = view.pendingDamageAssignment;
  assert.ok(pending, 'widok niesie zakolejkowany przydział');
  const defaultCommand = view.legalCommands.find((c) => c.type === 'resolve_damage_assignment');
  assert.ok(defaultCommand, 'dokładnie jedna oferta przydziału (M66/R)');
  return { state, view, pending, defaultCommand };
}

function renderWizard({ view, pending, defaultCommand }, onComplete = () => {}) {
  const host = new MiniEl('div');
  renderDamageWizard(host, { view, session: SESSION, pending, defaultCommand, onComplete });
  return host;
}

const kwoty = (host) => byClass(host, 'damage-wizard-amount').map((el) => Number(el.textContent));
const minusy = (host) => byClass(host, 'damage-wizard-minus');
const plusy = (host) => byClass(host, 'damage-wizard-plus');
const potwierdz = (host) => byText(host, 'button', 'Zatwierdź przydział')[0];

/** Ustawia kwoty stepperami tak, jak zrobiłby to gracz (najpierw zero, potem w górę). */
function ustaw(host, want) {
  for (let i = 0; i < kwoty(host).length; i += 1) {
    let guard = 0;
    while (kwoty(host)[i] > 0 && guard < 20) { minusy(host)[i].click(); guard += 1; }
  }
  for (let i = 0; i < want.length; i += 1) {
    let guard = 0;
    while (kwoty(host)[i] < want[i] && guard < 20) { plusy(host)[i].click(); guard += 1; }
  }
  return kwoty(host);
}

const split = (a, b) => [{ attackerId: 'a1', amount: a }, { attackerId: 'a2', amount: b }];
const alive = (state, id) => state.objects.get(id)?.zone === 'battlefield';

test('B/1 (silnik → widok): podwójny blok daje przydział BLOKERA u jego kontrolera', () => {
  const { view, pending } = widokBlokera();
  assert.equal(pending.playerId, 'p1', 'decyduje obrońca (kontroler blokera)');
  assert.equal(pending.role, 'blocker', 'rola blokera — nie atakującego');
  assert.equal(view.playerId, 'p1');
  assert.equal(pending.entries.length, 1, 'jeden bloker czeka na przydział');
  const entry = pending.entries[0];
  assert.equal(entry.blockerId, 'wall');
  assert.equal(entry.power, 7, 'moc 6 + licznik +1/+1');
  assert.equal(entry.byToughness, undefined, 'obrażenia wg mocy, nie wytrzymałości');
  assert.deepEqual(entry.attackers.map((a) => a.id), ['a1', 'a2'], 'cele w kolejności deklaracji');
  assert.deepEqual(entry.attackers.map((a) => a.lethal), [4, 4], 'lethal = wytrzymałość 2/4 bez obrażeń');
  assert.equal(entry.trample, undefined, 'trample istnieje tylko po stronie atakującego (CR 702.19b)');
});

test('B/2 (UI): wizard pokazuje podział BLOKERA — tekst, wiersze atakujących, bez trample', () => {
  const ctx = widokBlokera();
  const host = renderWizard(ctx);
  assert.match(host.textContent,
    /Rozdziel obrażenia bojowe — przydziel moc blokera atakującym, których blokuje:/,
    'intro jest po stronie blokera (nie „moc atakujących blokującym")');
  assert.match(host.textContent, /Segmented Krotiq \(moc 7\)/, 'nagłówek: bloker i jego moc');
  assert.equal(byClass(host, 'damage-wizard-row').length, 2, 'dwa wiersze — po jednym na atakującego');
  const etykiety = byClass(host, 'damage-wizard-name').map((el) => el.textContent);
  assert.equal(etykiety.length, 2);
  for (const e of etykiety) {
    assert.match(e, /Gurmag Drowner/, 'nazwa atakującego w wierszu');
    assert.match(e, /wytrz\. 4/, 'wytrzymałość celu');
    assert.match(e, /śmiertelne 4/, 'lethal celu');
  }
  assert.ok(!/do gracza/.test(host.textContent),
    'bloker nigdy nie przenosi nadwyżki na gracza — brak etykiety trample');
  assert.ok(!/trample/.test(host.textContent), 'bez słowa „trample" po stronie blokera');
});

test('B/3 (UI → silnik): domyślny lethal-first 4+3 zatwierdza się i zadaje obrażenia raz', () => {
  const ctx = widokBlokera();
  const host = renderWizard(ctx);
  assert.deepEqual(kwoty(host), [4, 3], 'start = lethal-first jak w silniku (4 zabija 2/4, reszta na drugiego)');
  const confirm = potwierdz(host);
  assert.equal(confirm.disabled, false, 'start legalny: suma = moc (CR 510.1a)');
  let cmd = null;
  const host2 = renderWizard(ctx, (c) => { cmd = c; });
  potwierdz(host2).click();
  assert.ok(cmd, 'Zatwierdź wywołuje onComplete');
  assert.equal(cmd.type, 'resolve_damage_assignment');
  assert.equal(cmd.playerId, 'p1');
  assert.deepEqual(cmd.assignments, { wall: split(4, 3) }, 'klucz = bloker, wpisy po attackerId');
  // Ta sama komenda w silniku — end-to-end, bez pośrednich założeń.
  const { state } = ctx;
  const res = execute(state, cmd);
  assert.ok(res.ok, JSON.stringify(res));
  assert.ok(!alive(state, 'a1'), 'pierwszy atakujący zginął (4 obrażenia na 2/4)');
  assert.equal(state.objects.get('a2').damage, 3, 'drugi dostał 3 — suma 7 = moc blokera, nie 7 i 7');
  assert.ok(alive(state, 'a2'), 'drugi przeżył');
  assert.equal(state.pendingDamageAssignment, null, 'przydział zamknięty');
});

test('B/4 (bramka UI): suma mniejsza od mocy blokuje Zatwierdź, przywrócenie odblokowuje', () => {
  const ctx = widokBlokera();
  const host = renderWizard(ctx);
  const confirm = potwierdz(host);
  minusy(host)[0].click();
  assert.deepEqual(kwoty(host), [3, 3], 'gracz zdjął jeden punkt z pierwszego atakującego');
  assert.equal(confirm.disabled, true, 'niedobór (suma 6 < moc 7) — CR 510.1a');
  plusy(host)[0].click();
  assert.deepEqual(kwoty(host), [4, 3]);
  assert.equal(confirm.disabled, false, 'powrót do pełnej mocy odblokowuje');
  // Sufit: suma ponad moc też jest nielegalna (wizard nie pozwala przekroczyć,
  // więc sprawdzamy przez walidator silnika).
  assert.equal(validateBlockerDamageAssignment(ctx.state, 'wall', split(4, 4)), 'damage_exceeds_power');
});

test('B/5 (etykieta): przycisk domyślnego przydziału mówi o atakujących i oddaje komendę silnika', () => {
  const ctx = widokBlokera();
  let cmd = null;
  const host = renderWizard(ctx, (c) => { cmd = c; });
  const def = byText(host, 'button', 'Użyj domyślnego przydziału')[0];
  assert.ok(def, 'przycisk istnieje');
  assert.match(def.textContent, /po kolei atakujących/,
    'przy podziale blokera celami są atakujący — „po kolei blokerów" byłoby cudzą sytuacją');
  assert.ok(!/po kolei blokerów/.test(def.textContent), 'stara etykieta nie wraca po stronie blokera');
  def.click();
  assert.deepEqual(cmd, ctx.defaultCommand, 'przycisk stosuje przydział domyślny silnika');
  assert.deepEqual(cmd.assignments.wall, split(4, 3), 'lethal-first 4+3');
});

test('B/6 (równoważność): bramka wizarda = walidator silnika na wszystkich osiągalnych podziałach', () => {
  const ctx = widokBlokera();
  const porownane = [];
  for (let a = 0; a <= 7; a += 1) {
    for (let b = 0; b <= 7 - a; b += 1) {
      const host = renderWizard(ctx);
      assert.deepEqual(ustaw(host, [a, b]), [a, b], `steppery ustawiają ${a}/${b}`);
      const uiLegal = !potwierdz(host).disabled;
      const silnik = validateBlockerDamageAssignment(ctx.state, 'wall', split(a, b));
      assert.equal(uiLegal, silnik === null,
        `podział ${a}/${b}: UI ${uiLegal ? 'przyjmuje' : 'blokuje'}, silnik ${silnik ?? 'przyjmuje'}`);
      porownane.push(`${a}/${b}`);
    }
  }
  assert.equal(porownane.length, 36, '36 osiągalnych podziałów (suma <= moc 7)');
  // Poza osiągalnym zakresem stepperów suma przekracza moc — silnik musi odrzucić.
  for (const [a, b] of [[4, 4], [7, 1], [5, 3]]) {
    assert.equal(validateBlockerDamageAssignment(ctx.state, 'wall', split(a, b)), 'damage_exceeds_power',
      `${a}/${b} ponad moc — odrzucone`);
  }
});

test('B/7 (CR 510.1c): podział inny niż lethal-first przechodzi z UI do silnika dosłownie', () => {
  const ctx = widokBlokera();
  const host = renderWizard(ctx);
  assert.deepEqual(ustaw(host, [0, 7]), [0, 7], 'cała moc na drugiego atakującego');
  const confirm = potwierdz(host);
  assert.equal(confirm.disabled, false, 'podział dowolny — lethal-first nie jest wymogiem');
  let cmd = null;
  const host2 = renderWizard(ctx, (c) => { cmd = c; });
  ustaw(host2, [0, 7]);
  potwierdz(host2).click();
  assert.deepEqual(cmd.assignments, { wall: split(0, 7) });
  const { state } = ctx;
  assert.ok(execute(state, cmd).ok, 'silnik przyjmuje wybór gracza');
  assert.equal(state.objects.get('a1').damage, 0, 'pierwszy nietknięty');
  assert.ok(alive(state, 'a1'));
  assert.ok(!alive(state, 'a2'), 'drugi zginął (7 na 2/4)');
});
