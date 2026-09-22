// Uwaga z gry właściciela (2026-09-22) — WSZYSTKIE czary modalne: żadnych
// opcji z wpiętym „pierwszym z brzegu” targetem.
//
// Zgłoszenie (Twiddle, wprost): „Klikam w »Twoje działania« »Rzuć: Twiddle«
// i zamiast modala wyboru wszystkich możliwych celów do tapnięcia i
// odtapowania to dostaję jakieś losowe (pewnie pierwsze możliwe) targety —
// jeden do tapa, jeden do untapa. ILE RAZY BĘDĘ POPRAWIAĆ TEN BŁĄD????
// Przejrzyj wszystkie czary modalne i popraw je, żeby NIE WYBIERAŁY
// UPROSZCZONEGO PIERWSZEGO TARGETU!!!! Przed chwilą poprawiałeś Vandalize
// z identycznym błędem.”
//
// Pomiar PRZED naprawą (sonda probe-twiddle): rodzina Twiddle = 10 ofert
// (2 tryby × 5 celów), `chooseOneOrBothPlanOf` = null (wymagał trybu
// złożonego), więc kaskada szła w `castModePlanOf`, który pokazywał
// reprezentanty obu trybów z wpiętymi celami (oba = dragonbroods-2 —
// dosłownie „jeden do tapa, jeden do untapa”). Po naprawie:
//   - kształt B planu gniazd: same tryby 1-celowe (Twiddle, Steel Sabotage,
//     Agate Assault, Keep Out) = JEDEN modal z pickerem 0–1 na KAŻDY tryb
//     (mapa WYBÓR→KOMENDA jak w Vandalize; „choose one” = dokładnie jedno
//     gniazdo — dwa wypełnione gaszą „Zatwierdź”);
//   - krok 1 `castModePlanOf` (kształty mieszane/varTV — Robbers, Selesnya
//     Charm) niesie odtąd WYŁĄCZNIE nazwy trybów z modelu — cele wybiera
//     krok 2 (picker po pełnej liście), więc klasa „pre-więzu” jest martwa
//     w całej kaskadzie.
//
// Piny mierzą klasę (zero nazw kart):
//   CM/1 — Twiddle: modal z pickerami WSZYSTKICH celów obu trybów, wybór
//          gracza wiąże WYBRANY cel (RED przed naprawą: plan=null);
//   CM/2 — inwentarz katalogu: każdy modalny czar = kształt A/B/C; klasa B
//          = dokładnie {agate-assault, keep-out, steel-sabotage, twiddle};
//   CM/3 — anty-over-fix: varTV/tryby 0-celowe/mieszane NIE wpadają w gniazda
//          (dwustopniowy M2 bez zmian), wybór krzyżowy między odrębnymi
//          pulami gniazd nie ma komendy;
//   CM/4 — źródło: krok 1 buduje etykiety z `spell.modes[…].name`
//          (NIE z `labelChoiceOptions(reps)`), kaskada bez zmian.
// Mutacje: M-E1 (gałąź kształtu B → null) czerwieni CM/1; M-E2 (etykiety
// kroku 1 wracają do `labelChoiceOptions(reps)`) czerwieni CM/4.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { chooseOneOrBothPlanOf, commandForChooseOneOrBoth, castModePlanOf } from '../src/table/multi-target.js';
import { renderMultiTargetWizard } from '../src/table/choice-request.js';

const REGISTRY = createCardRegistry();
const SESSION = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? id,
  nameOfObject: (id) => REGISTRY.get(String(id).split('#')[0])?.name ?? id,
  cardDetails: (id) => REGISTRY.get(id),
  abilitiesOf: (id) => gameObjectDataOf(REGISTRY.get(id)).abilities ?? [],
  colorsOf: () => [],
};

let counter = 0;
function put(state, cardId, zone, controllerId = 'p1') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} istnieje`);
  const data = gameObjectDataOf(def);
  const id = `${cardId.split('-')[0]}-${counter += 1}`;
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    abilities: data.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: data.colors ?? [], cardName: def.name, spell: def.spell,
  });
  return id;
}

/** Scenariusz właściciela: Twiddle + kilka celów obu kategorii. */
function board() {
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  const spellId = put(state, 'twiddle', 'hand');
  const art1 = put(state, 'dragonbroods-relic', 'battlefield', 'p2');
  const cr1 = put(state, 'scorch-spitter', 'battlefield', 'p2');
  const lad1 = put(state, 'basic-forest', 'battlefield', 'p2');
  const lad2 = put(state, 'basic-island', 'battlefield');
  addMana(state, 'p1', 2, { U: 1 });
  const view = playerView(state, 'p1');
  const oferty = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === spellId);
  return { state, view, oferty, spellId, art1, cr1, lad1, lad2 };
}

test('CM/1 Twiddle: JEDEN modal z pickerami WSZYSTKICH celów obu trybów (scenariusz właściciela)', () => {
  const { state, oferty, art1, cr1, lad1, lad2 } = board();
  assert.equal(oferty.length, 8, `2 tryby × 4 cele: ${oferty.length}`);
  const plan = chooseOneOrBothPlanOf(oferty);
  assert.ok(plan, 'rodzina Twiddle daje plan gniazd (RED przed naprawą: null → 2 wiersze z celami)');
  assert.ok(plan.oneOfModesShape, 'kształt B — „choose one” (dokładnie jedno gniazdo)');
  assert.deepEqual(plan.slotModes, [0, 1], 'gniazdo na każdy tryb: Tapnięcie / Odkręcenie');
  const wszyscy = [art1, cr1, lad1, lad2];
  for (const ids of plan.slots) {
    assert.deepEqual([...ids].sort(), [...wszyscy].sort(),
      'każdy picker niesie WSZYSTKICH kandydatów — nic nie jest „pierwsze z brzegu”');
  }
  // mapa WYBÓR→KOMENDA: tryb wynika z wypełnionego gniazda
  const tap = commandForChooseOneOrBoth(plan, [cr1, null]);
  assert.equal(tap?.modeIndex, 0, 'wypełnione gniazdo „Tapnięcie” = tryb tapnięcia');
  assert.deepEqual(tap?.targets, [cr1], 'cel = WYBRANY przez gracza');
  const untap = commandForChooseOneOrBoth(plan, [null, lad2]);
  assert.equal(untap?.modeIndex, 1, 'wypełnione gniazdo „Odkręcenie” = tryb odkręcenia');
  assert.deepEqual(untap?.targets, [lad2]);
  assert.equal(commandForChooseOneOrBoth(plan, [art1, lad1]), null,
    'oba gniazda = brak komendy (Twiddle to „tapnięcie ALBO odkręcenie”)');
  assert.equal(commandForChooseOneOrBoth(plan, [null, null]), null, 'pusty wybór = brak komendy');
  // L48: komenda z pickera wykonalna
  assert.ok(execute(state, tap).ok, 'komenda tapnięcia przyjmowana przez silnik');
});

test('CM/1b DOM: sekcja na tryb, wiersz na KAŻDEGO kandydata, nic wstępnie zaznaczone', () => {
  const { view, oferty, art1, cr1, lad1, lad2 } = board();
  const plan = chooseOneOrBothPlanOf(oferty);
  assert.ok(plan, 'plan gniazd istnieje');
  const modeNames = REGISTRY.get('twiddle').spell.modes.map((m) => m.name);
  const slotLabels = plan.slotModes.map((modeIndex) => modeNames[modeIndex]);
  assert.deepEqual(slotLabels, ['Tapnięcie', 'Odkręcenie'], 'etykiety gniazd = nazwy trybów (terminologia projektowa)');

  const dom = installMiniDom();
  const host = dom.createElement('div');
  let done = null;
  renderMultiTargetWizard(host, {
    view, session: SESSION, plan, commands: oferty, slotLabels,
    intro: 'Rzuć: Twiddle (koszt {U}) — wskaż cel DOKŁADNIE jednej pozycji (0–1):',
    onComplete: (cmd) => { done = cmd; }, onCancel: () => {},
  });
  assert.match(host.textContent, /DOKŁADNIE jednej/, `intro mówi o wyborze jednego trybu: ${host.textContent.slice(0, 120)}`);
  assert.match(host.textContent, /Tapnięcie/, 'sekcja „Tapnięcie”');
  assert.match(host.textContent, /Odkręcenie/, 'sekcja „Odkręcenie”');
  const toggles = walkDom(host).filter((el) => String(el.className).includes('multi-target-toggle'));
  assert.equal(toggles.length, 8, `wiersz na każdego kandydata w każdym trybie (4+4): ${toggles.length}`);
  assert.ok(toggles.every((t) => !t.checked), 'NIC wstępnie zaznaczonego — żadnego „pierwszego z brzegu”');
  const confirm0 = walkDom(host).find((el) => /Zatwierdź/.test(el.textContent) && el.tagName === 'BUTTON');
  assert.equal(confirm0.disabled, true, 'pusty wybór blokuje Zatwierdź');
  // Gracz wybiera cel ODKRĘCENIA = las. Kolejność wierszy = plan.slots,
  // a pule trybów mogą się NAKŁADAć (ten sam cel w obu sekcjach) — indeks
  // liczymy SEKCJA-ŚWIADOMIE (offset długości gniazda 0).
  const idxUntapLad1 = plan.slots[0].length + plan.slots[1].indexOf(lad1);
  toggles[idxUntapLad1].checked = true;
  toggles[idxUntapLad1].emit('change');
  const confirm = walkDom(host).find((el) => /Zatwierdź/.test(el.textContent) && el.tagName === 'BUTTON');
  assert.equal(confirm.disabled, false, 'wybór jednego gniazda odblokowuje');
  confirm.click();
  assert.ok(done, 'Zatwierdź zwraca komendę');
  assert.equal(done.modeIndex, 1, 'Odkręcenie');
  assert.deepEqual(done.targets, [lad1], 'komenda niesie WYBRANY cel, nie pierwszy z brzegu');
});

test('CM/2 inwentarz katalogu: każdy czar modalny = klasa A/B/C (strażnik „przejrzyj wszystkie”)', () => {
  // „Przejrzyj wszystkie czary modalne” — strażnik inwentarza: NOWY czar
  // modalny w katalogu wymaga świadomej klasyfikacji poniżej:
  //   A — tryb złożony („choose one or both”, gniazda pozycji) — piny V/1–V/5b;
  //   B — same tryby 1-celowe (gniazdo na tryb, jeden modal) — piny CM/1;
  //   C — mieszane/0-celowe/varTV (krok 1 = nazwy trybów, krok 2 = picker).
  const KLASA_A = ['vandalize'];
  const KLASA_B = ['agate-assault', 'keep-out', 'steel-sabotage', 'twiddle'];
  const KLASA_C = ['aerith-rescue-mission', 'fortify', 'ruinous-rampage',
    'selesnya-charm', 'your-temple-is-under-attack', 'youre-confronted-by-robbers'];
  const foundA = [];
  const foundB = [];
  const foundC = [];
  for (const card of REGISTRY.all ? [...REGISTRY.all()] : []) {
    const modes = card?.spell?.modes;
    if (!modes || modes.length < 2) continue;
    const hasCombo = modes.some((m) => !m.variableTargets && (m.targets ?? []).length >= 2);
    const allOne = modes.every((m) => !m.variableTargets && (m.targets ?? []).length === 1);
    if (hasCombo) foundA.push(card.id);
    else if (allOne) foundB.push(card.id);
    else foundC.push(card.id);
  }
  assert.deepEqual([...foundA].sort(), KLASA_A, 'klasa A (tryb złożony) — nowy = wpisać tu + piny wyboru');
  assert.deepEqual([...foundB].sort(), KLASA_B,
    'klasa B (same tryby 1-celowe) — nowy = wpisać tu + pin klasy');
  assert.deepEqual([...foundC].sort(), KLASA_C,
    'klasa C (mieszane/0-celowe/varTV) — nowy = wpisać tu');
});

test('CM/3 anty-over-fix: varTV/0-celowe/mieszane BEZ gniazd; wybór krzyżowy bez komendy', () => {
  // Robbers-like („up to 3” + tryb 0-celowy) — kaskada M2 bez zmian.
  const robbersLike = [
    { type: 'cast_spell', objectId: 'rb', modeIndex: 0, targets: ['c1'] },
    { type: 'cast_spell', objectId: 'rb', modeIndex: 0, targets: [] },
    { type: 'cast_spell', objectId: 'rb', modeIndex: 0, targets: ['c1', 'c2'] },
    { type: 'cast_spell', objectId: 'rb', modeIndex: 1, targets: [] },
  ];
  assert.equal(chooseOneOrBothPlanOf(robbersLike), null, '„up to N”/mieszane bez gniazd — M2 zostaje');
  assert.ok(castModePlanOf(robbersLike), 'krok 1–2 dla kształtów mieszanych bez zmian');
  // Fortify-like (same tryby 0-celowe) — bez gniazd.
  const fortifyLike = [
    { type: 'cast_spell', objectId: 'fo', modeIndex: 0, targets: [] },
    { type: 'cast_spell', objectId: 'fo', modeIndex: 1, targets: [] },
  ];
  assert.equal(chooseOneOrBothPlanOf(fortifyLike), null, 'tryby 0-celowe = poza kształtem B');
  // Selesnya-like (mieszane 0/1) — bez gniazd (krok 1 = nazwy trybów).
  const mixedLike = [
    { type: 'cast_spell', objectId: 'se', modeIndex: 0, targets: [] },
    { type: 'cast_spell', objectId: 'se', modeIndex: 1, targets: ['e1'] },
    { type: 'cast_spell', objectId: 'se', modeIndex: 1, targets: ['e2'] },
  ];
  assert.equal(chooseOneOrBothPlanOf(mixedLike), null, 'mieszane 0/1 = poza kształtem B');
  // Keep-Out-like (rozłączne pulę: cel na stosie vs tapnięty stwór) —
  // wybór krzyżowy (kandydat z gniazda 0 w gnieździe 1) nie ma komendy.
  const keepOutLike = [
    { type: 'cast_spell', objectId: 'ko', modeIndex: 0, targets: ['spellX'] },
    { type: 'cast_spell', objectId: 'ko', modeIndex: 1, targets: ['crTapped'] },
  ];
  const koPlan = chooseOneOrBothPlanOf(keepOutLike);
  assert.ok(koPlan, 'rozłączne pule to dalej kształt B');
  assert.deepEqual(koPlan.slots, [['spellX'], ['crTapped']], 'każde gniazdo = pula swojego trybu');
  assert.equal(commandForChooseOneOrBoth(koPlan, ['crTapped', null]), null,
    'kandydat spoza gniazda 0 nie ma komendy (wybór krzyżowy gaśnie)');
});

test('CM/4 źródło: krok 1 niesie NAZWY TRYBÓW z modelu, nigdy `labelChoiceOptions(reps)`', () => {
  const main = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
  const stripped = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  assert.ok(!/labelChoiceOptions\(castModePlan\.reps/.test(stripped),
    'etykiety kroku 1 nie pochodzą z komend-reprezentantów (te niosły cele „pierwsze z brzegu”)');
  assert.ok(/modeNameList\[castModePlan\.modes\[i\]\]/.test(stripped),
    'etykieta wiersza = nazwa trybu z modelu karty (spell.modes)');
  const oneIdx = stripped.indexOf('chooseOneOrBothPlanOf(');
  const modeIdx = stripped.indexOf('castModePlanOf(');
  assert.ok(oneIdx > 0 && modeIdx > 0 && oneIdx < modeIdx,
    'plan gniazd (kształty A+B) przed planem trybów (kontrakt kaskady M300/1)');
});

/** Mini-DOM jak w testach kreatora (M2/4) — tylko to, czego używa picker. */
function walkDom(el) { return [el, ...(el.children ?? []).flatMap(walkDom)]; }

function installMiniDom() {
  class MiniEl {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase(); this.children = []; this.listeners = {};
      this.className = ''; this.text = ''; this.html = '';
      this.type = ''; this.checked = false; this.disabled = false; this.dataset = {};
    }
    set textContent(v) { this.text = String(v); this.html = ''; this.children = []; }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
    set innerHTML(v) { this.html = String(v); this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
    get innerHTML() { return (this.html ? this.html : this.text) + this.children.map((c) => c.innerHTML).join(''); }
    appendChild(c) { this.children.push(c); return c; }
    replaceChildren(...n) { this.children = n.flat(); }
    addEventListener(t, l) { (this.listeners[t] ??= []).push(l); }
    click() { for (const l of this.listeners.click ?? []) l({}); }
    emit(t, v) { for (const l of this.listeners[t] ?? []) l(v ?? {}); }
  }
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  return { createElement: (tag) => new MiniEl(tag) };
}
