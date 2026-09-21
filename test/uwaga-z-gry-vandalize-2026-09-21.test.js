// Uwaga z gry właściciela (2026-09-21, M405/C) — Vandalize: „Choose one
// or both” jako multi-target modal z gniazdami wyboru.
//
// Zgłoszenie: „Karta Vandalize. Rzucam ją. Zamiast multi-target modal
// z możliwością wybrania 0-1 artefaktu ze wszystkich możliwych oraz 0-1 lądu
// ze wszystkich możliwych (treść karty to "Choose one or both • Destroy target
// artifact. • Destroy target land.") dostałem jakiś bezsensowny modal wyboru
// z trzema opcjami - a. jednym losowym artefaktem, b. jednym losowym lądem
// albo c=a+b. Wybrał sobie pierwszy z brzegu.”
//
// Pomiar PRZED naprawą (sonda probe-vandalize, 10 ofert): multiTargetPlanOf
// zwracał worek min1/max2 BEZ gniazd (`slots: null` — targetSlotsOf umierał
// na zmiennych długościach trybów), więc rodzina szła do trybów przyciskowych
// (castModePlanOf) — 3 wiersze z celami reprezentantów wpiętymi „pierwsze
// z brzegu”. Po naprawie: `chooseOneOrBothPlanOf` czyta kształt rodziny
// (tryb złożony = gniazda, tryby 1-celowe = gniazdo pojedyncze) i daje
// dwa niezależne pickery 0–1 (sekcja na gniazdo, wiersz na każdego
// kandydata — ląd-artefakt typu Great Furnace kandyduje w OBU gniazdach,
// ale to RÓŻNE tryby). Czerwień dowodzą mutacje M-C1 (plan zawsze null)
// i M-C2 (komenda „pierwsza z brzegu” zamiast wyboru).
//
// Piny mierzą REGUŁĘ, nie kartę:
//   V/1 — plan + mapa WYBÓR→KOMENDA dla scenariusza właściciela (w tym
//         ląd-artefakt w obu gniazdach) + wykonalność komendy „oba”;
//   V/2 — modal DOM: WSZYSCY kandydaci w sekcjach gniazd (0–1), wybór
//         gracza art2+lad1 daje komendę [art2,lad1] — NIE „pierwszy z brzegu”;
//   V/3 — anty-over-fix: rodziny trybów celowanych (Twiddle) i „up to N”
//         (Robbers) NIE wpadają w gniazda — kaskada M2/M195/C bez zmian;
//   V/4 — strażnik kaskady (L83): gałąź w main.js PRZED castModePlanOf
//         i matcher w commandForSlots nie jest obchodzony.
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

/** Scenariusz właściciela: Vandalize + 2 artefakty (w tym ląd-artefakt) + 2 lądy. */
function board() {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  const spellId = put(state, 'vandalize', 'hand');
  const art1 = put(state, 'great-furnace', 'battlefield', 'p2'); // Artifact Land!
  const art2 = put(state, 'dragonbroods-relic', 'battlefield', 'p2');
  const lad1 = put(state, 'basic-forest', 'battlefield', 'p2');
  const lad2 = put(state, 'basic-island', 'battlefield', 'p2');
  addMana(state, 'p1', 5, { R: 1 });
  const view = playerView(state, 'p1');
  const oferty = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === spellId);
  return { state, view, oferty, spellId, art1, art2, lad1, lad2 };
}

function resolveStack(state) {
  for (let i = 0; i < 12 && state.zones.stack.length > 0; i += 1) {
    const rv = playerView(state, state.turn.priorityPlayerId);
    const cmd = rv.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? rv.legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(cmd, 'jest komenda rozstrzygająca stos');
    assert.ok(execute(state, cmd).ok, 'rozstrzygnięcie stosu się powiodło');
  }
}

test('V/1 plan gniazd „choose one or both” + mapa wybór→komenda (scenariusz właściciela)', () => {
  const { state, oferty, art1, art2, lad1, lad2 } = board();
  assert.ok(oferty.length >= 5, `rodzina wariantów w ofertach: ${oferty.length}`);
  const plan = chooseOneOrBothPlanOf(oferty);
  assert.ok(plan, 'rodzina Vandalize daje plan gniazd');
  assert.equal(plan.slots.length, 2, 'dwa gniazda: artefakt i ląd');
  assert.deepEqual(plan.slotOptional, [true, true], 'oba gniazda opcjonalne (0–1)');
  assert.deepEqual(plan.slots[0], [art1, art2], 'gniazdo 1 = wszyscy kandydaci artefaktu');
  assert.deepEqual([...plan.slots[1]].sort(), [art1, lad1, lad2].sort(),
    'gniazdo 2 = wszyscy kandydaci lądu (Great Furnace jako ląd-artefakt też)');
  // mapa WYBÓR→KOMENDA: tryb wynika z tego, które gniazda wypełniono
  const a = commandForChooseOneOrBoth(plan, [art2, null]);
  assert.equal(a?.modeIndex, 0, 'sam artefakt = tryb „Zniszcz artefakt”');
  assert.deepEqual(a?.targets, [art2], 'cel = WYBRANY artefakt, nie pierwszy z brzegu');
  const l = commandForChooseOneOrBoth(plan, [null, lad2]);
  assert.equal(l?.modeIndex, 1, 'sam ląd = tryb „Zniszcz ląd”');
  assert.deepEqual(l?.targets, [lad2], 'cel = WYBRANY ląd');
  const furn = commandForChooseOneOrBoth(plan, [null, art1]);
  assert.equal(furn?.modeIndex, 1, 'Great Furnace wybrany jako LĄD = tryb „Zniszcz ląd”');
  assert.deepEqual(furn?.targets, [art1]);
  const oba = commandForChooseOneOrBoth(plan, [art2, lad1]);
  assert.equal(oba?.modeIndex, 2, 'oba gniazda = tryb „Zniszcz oba”');
  assert.deepEqual(oba?.targets, [art2, lad1], 'kolejność gniazd: artefakt, ląd');
  assert.equal(commandForChooseOneOrBoth(plan, [null, null]), null,
    'pusty wybór = brak komendy („choose ONE or both” — wymagane co najmniej jedno)');
  // L48: komenda z pickera jest wykonalna i niszczy oba cele
  assert.ok(execute(state, oba).ok, 'komenda „oba” przyjmowana przez silnik');
  resolveStack(state);
  assert.notEqual(state.objects.get(art2)?.zone, 'battlefield', 'wybrany artefakt zniszczony');
  assert.notEqual(state.objects.get(lad1)?.zone, 'battlefield', 'wybrany ląd zniszczony');
  assert.equal(state.objects.get(art1)?.zone, 'battlefield', 'niewybrany artefakt nietknięty');
  assert.equal(state.objects.get(lad2)?.zone, 'battlefield', 'niewybrany ląd nietknięty');
});

test('V/2 modal DOM: WSZYSCY kandydaci w gniazdach 0–1, wybór gracza wiąże WYBRANE cele', () => {
  const { view, oferty, art1, art2, lad1, lad2 } = board();
  const plan = chooseOneOrBothPlanOf(oferty);
  assert.ok(plan, 'plan gniazd istnieje');
  // etykiety gniazd jak w main.js: nazwy trybów-składników z modelu karty
  const def = REGISTRY.get('vandalize');
  const slotLabels = plan.slotModes.map((modeIndex) => def.spell.modes[modeIndex].name);

  const dom = installMiniDom();
  const host = dom.createElement('div');
  let done = null;
  renderMultiTargetWizard(host, {
    view, session: SESSION, plan, commands: oferty, slotLabels,
    intro: 'Rzuć: Vandalize (koszt {4}{R}) — wskaż 0–1 cel na każdą pozycję (co najmniej jeden):',
    onComplete: (cmd) => { done = cmd; }, onCancel: () => {},
  });
  assert.match(host.textContent, /0–1 cel/, `intro mówi o wyborze 0–1: ${host.textContent.slice(0, 120)}`);
  assert.match(host.textContent, /Zniszcz artefakt/, 'sekcja gniazda 1 nazwana trybem-składnikiem');
  assert.match(host.textContent, /Zniszcz ląd/, 'sekcja gniazda 2 nazwana trybem-składnikiem');
  const toggles = walkDom(host).filter((el) => String(el.className).includes('multi-target-toggle'));
  assert.equal(toggles.length, 5,
    `wiersz na KAŻDEGO kandydata w KAŻDYM gnieździe (art1, art2 | lad1, lad2, art1-ląd): ${toggles.length}`);
  // Gracz wybiera art2 (gniazdo 1) i lad1 (gniazdo 2) — NIE „pierwszy z brzegu”
  toggles[1].checked = true; toggles[1].emit('change');
  toggles[2].checked = true; toggles[2].emit('change');
  const confirm = walkDom(host).find((el) => /Zatwierdź/.test(el.textContent) && el.tagName === 'BUTTON');
  assert.ok(confirm, 'jest Zatwierdź');
  assert.equal(confirm.disabled, false, 'wybór kompletny (oba gniazda) odblokowuje Zatwierdź');
  confirm.click();
  assert.ok(done, 'Zatwierdź zwraca komendę');
  assert.equal(done.modeIndex, 2, 'oba gniazda → tryb „Zniszcz oba”');
  assert.deepEqual(done.targets, [art2, lad1],
    'komenda niesie WYBRANE cele gracza, nie pierwsze z brzegu');
  // Pusty wybór blokuje (co najmniej jedno gniazdo wymagane)
  const host2 = dom.createElement('div');
  renderMultiTargetWizard(host2, {
    view, session: SESSION, plan, commands: oferty, slotLabels,
    onComplete: () => { assert.fail('pusty wybór nie może zatwierdzać'); }, onCancel: () => {},
  });
  const confirm2 = walkDom(host2).find((el) => /Zatwierdź/.test(el.textContent) && el.tagName === 'BUTTON');
  assert.equal(confirm2.disabled, true, 'pusty wybór = Zatwierdź zgaszony („choose one or both”)');
});

test('V/3 anty-over-fix: rodziny trybów celowanych i „up to N” NIE wpadają w gniazda', () => {
  // Twiddle: 2 tryby, ten sam zbiór kandydatów, arność 1 — tryby przyciskowe
  // (M2) zostają; gniazda wymagają trybu ZŁOŻONEGO (arność ≥ 2).
  const twiddleFamily = [
    { type: 'cast_spell', objectId: 'tw', modeIndex: 0, targets: ['a'] },
    { type: 'cast_spell', objectId: 'tw', modeIndex: 0, targets: ['b'] },
    { type: 'cast_spell', objectId: 'tw', modeIndex: 1, targets: ['a'] },
    { type: 'cast_spell', objectId: 'tw', modeIndex: 1, targets: ['b'] },
  ];
  assert.equal(chooseOneOrBothPlanOf(twiddleFamily), null, 'Twiddle bez gniazd — kaskada M2 bez zmian');
  assert.ok(castModePlanOf(twiddleFamily), 'Twiddle dalej ma plan trybów (krok 1–2)');
  // Robbers („up to 3” — mieszane długości w trybie) — null (jak dotąd).
  const robbersLike = [
    { type: 'cast_spell', objectId: 'rb', modeIndex: 0, targets: ['c1'] },
    { type: 'cast_spell', objectId: 'rb', modeIndex: 0, targets: [] },
    { type: 'cast_spell', objectId: 'rb', modeIndex: 0, targets: ['c1', 'c2'] },
    { type: 'cast_spell', objectId: 'rb', modeIndex: 1, targets: [] },
  ];
  assert.equal(chooseOneOrBothPlanOf(robbersLike), null, '„up to N” bez gniazd — multiTargetPlanOf bez zmian');
  // Rodzina bez trybu złożonego (same arności 1) — null.
  assert.equal(chooseOneOrBothPlanOf(twiddleFamily.filter((c) => c.modeIndex === 0)), null,
    'pojedynczy tryb = poza kształtem');
});

test('V/4 strażnik kaskady (L83): gałąź gniazd w main.js PRZED castModePlanOf, matcher podpięty', () => {
  const main = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
  const stripped = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const oneIdx = stripped.indexOf('chooseOneOrBothPlanOf(');
  const modeIdx = stripped.indexOf('castModePlanOf(');
  assert.ok(oneIdx > 0 && modeIdx > 0, 'obie gałęzie kaskady obecne w main.js');
  assert.ok(oneIdx < modeIdx,
    'plan gniazd musi biec PRZED planem trybów (kontrakt kaskady M300/1 — od najwęższego)');
  const req = readFileSync(new URL('../src/table/choice-request.js', import.meta.url), 'utf8');
  const reqStripped = req.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  assert.ok(/plan\.chooseOneOrBothMode\s*\?\s*commandForChooseOneOrBoth/.test(reqStripped),
    'currentCommand w wizardze woła matcher gniazd dla chooseOneOrBothMode');
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
