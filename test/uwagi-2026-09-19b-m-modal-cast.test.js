// =============================================================================
// M (zgłoszenie właściciela 2026-09-19b) — You're Confronted by Robbers:
//
//   „Znów to samo. Oferta w »Twoje działania« rozdzielona na dwie opcje.
//    Rzucenie czaru powinno być jedną ofertą w »Twoje działania«, a potem
//    modal wyboru, a wygląda teraz tak:
//      TWOJE DZIAŁANIA
//      You're Confronted by Robbers — tryb: Zyskiwanie czasu
//      Rzuć: You're Confronted by Robbers — Wezwanie pomocy (koszt 3W)
//    Tu ma być jedno: Rzuć: You're Confronted by Robbers. A wybór trybu
//    w modalu, a nie tak niespójnie jak teraz — raz Rzuć:, raz z kosztem,
//    raz bez. Bez sensu.”
//
// Kontrakt (CR 601.2b — tryb modalnego czaru ogłasza się W TRAKCIE rzucania,
// więc oba tryby należą do JEDNEGO rzutu — tak jak dar w zgłoszeniu K):
//   1. panel „Twoje działania" ma JEDEN wpis na czar modalny;
//   2. wpis nazywa CZYNNOŚĆ i kartę („Rzuć: <karta>") — bez wybierania trybu
//      w tytule (tytuł liczył się z pierwszego wariantu pierwszego trybu, stąd
//      „<karta> — tryb: Zyskiwanie czasu" bez kosztu obok drugiego wpisu
//      z kosztem: dwie konwencje etykiety jednej akcji);
//   3. klik otwiera modal, w którym są WSZYSTKIE warianty rzutu, a etykieta
//      każdego wariantu nazywa jego tryb (`commandLabel`) — wybór trybu nie
//      ginie, tylko przenosi się tam, gdzie jego miejsce.
//
// Reguła jest generyczna (ADR 0002 — po KSZTAŁCIE grupy: jedna karta, komendy
// `cast_spell` z `modeIndex`, karta ma >1 trybów w deskryptorze), a grupuje
// silnikowa lista komend bez zmian: oba tryby nadal są osobnymi komendami
// (bot i kreator celów z nich korzystają) — scalanie jest PREZENTACJĄ panelu.
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { buildActionEntries, choiceGroupTitle, choiceRequestGroupKey, commandLabel, labelChoiceOptions } from '../src/table/render.js';
import { renderMultiTargetWizard } from '../src/table/choice-request.js';
import { castModePlanOf, castWindowPlanOf, multiTargetPlanOf, commandForCastWindowSelection, commandForSelection } from '../src/table/multi-target.js';

const REGISTRY = createCardRegistry();
const SESSION = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? id,
  nameOfObject: (id) => REGISTRY.get(String(id).split('#')[0])?.name ?? id,
  cardDetails: (id) => REGISTRY.get(id),
  abilitiesOf: (id) => gameObjectDataOf(REGISTRY.get(id)).abilities ?? [],
  colorsOf: () => [],
};

let counter = 0;

/** Stół ze zgłoszenia: Robbers w ręce, 3W+1 w puli, stwory na polu bitewnym. */
function robbersBoard({ withCreatures = true } = {}) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  const put = (cardId, zone, controllerId = 'p1') => {
    const def = REGISTRY.get(cardId);
    assert.ok(def, `karta ${cardId} istnieje`);
    const data = gameObjectDataOf(def);
    const id = `${cardId}#${counter += 1}`;
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
      kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
      abilities: data.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
      types: def.types ?? [], colors: data.colors ?? [], cardName: def.name, spell: def.spell,
    });
    return id;
  };
  const spellId = put('youre-confronted-by-robbers', 'hand');
  const moj = withCreatures ? put('scorch-spitter', 'battlefield') : null;
  const obcy = withCreatures ? put('scorch-spitter', 'battlefield', 'p2') : null;
  addMana(state, 'p1', 4, { colors: ['W'] }); // {3}{W}
  return { state, spellId, moj, obcy };
}

/** Wpisy panelu dotyczące rzutu Robbers (pojedyncze komendy albo grupy/modal). */
function robbersEntries(state) {
  const view = playerView(state, 'p1');
  const wpisy = buildActionEntries(view.legalCommands, SESSION, view).filter((e) => {
    const cmds = e.request?.options ?? (e.group?.commands ?? (e.command ? [e.command] : []));
    return cmds.some((c) => c.type.startsWith('cast_') && c.objectId?.startsWith('youre-confronted-by-robbers'));
  });
  return { view, wpisy };
}

/** Rozstrzyga stos do końca (gra z samymi czarami). */
function resolveStack(state) {
  for (let i = 0; i < 12 && state.zones.stack.length > 0; i += 1) {
    const rv = playerView(state, state.turn.priorityPlayerId);
    const cmd = rv.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? rv.legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(cmd, 'jest komenda rozstrzygająca stos');
    assert.ok(execute(state, cmd).ok, 'rozstrzygnięcie stosu się powiodło');
  }
}

test('M/1: rzut modalnego czaru to JEDEN wpis panelu (scena ze zgłoszenia)', () => {
  const { state } = robbersBoard();
  const { wpisy } = robbersEntries(state);
  assert.equal(wpisy.length, 1,
    `jeden wpis na czar, nie osobne oferty trybów: ${JSON.stringify(wpisy.map((w) => (w.request ? 'modal' : 'akcja')))}`);
  const wpis = wpisy[0];
  assert.ok(wpis.request, 'wpis otwiera modal wyboru sposobu rzucenia (M)');
  const warianty = wpis.request.options;
  const tryby = new Set(warianty.map((c) => c.modeIndex));
  assert.deepEqual([...tryby].sort(), [0, 1], 'modal niesie oba tryby czaru');
  assert.ok(warianty.length > 2, 'modal niesie też warianty celów trybu 0–3 stwory');
});

test('M/2: tytuł wpisu to czynność + karta + koszt („Rzuć: <karta> (koszt …)”)', () => {
  const { state } = robbersBoard();
  const { view, wpisy } = robbersEntries(state);
  const tytul = choiceGroupTitle(wpisy[0].request, SESSION, view).replace(/<[^>]*>/g, '').trim();
  // M2 (krok 1 zgłoszenia): „Klikam w »Twoje działania« w »Rzuć: You're
  // Confronted by Robbers (koszt)«" — koszt należy do tytułu wpisu, bo to
  // jedyna informacja o cenie przed otwarciem modala.
  assert.equal(tytul, "Rzuć: You're Confronted by Robbers (koszt {3}{W})",
    `tytuł ma nazywać rzut karty z kosztem, nie pierwszy tryb grupy: „${tytul}"`);
  assert.doesNotMatch(tytul, /tryb:/, 'tryb wybiera się w modalu, nie w tytule panelu');
});

// ---------------------------------------------------------------------------
// M2 (dokończenie zgłoszenia): DWUSTOPNIOWY rzut — tryb, potem cele.
//   „(2) Wybieram Stall for Time albo Call for Aid → (3) Otwiera się nowy
//    modal z możliwymi do tapnięcia kreaturami, których mogę zaznaczyć
//    »up to 3« i zatwierdzić.”
// ---------------------------------------------------------------------------

/** Oferta rzutu Robbersami z widoku (oba tryby, wszystkie warianty celów). */
function robbersOffers(state) {
  const view = playerView(state, 'p1');
  const oferty = view.legalCommands.filter((c) => c.type === 'cast_spell'
    && c.objectId?.startsWith('youre-confronted-by-robbers'));
  return { view, oferty };
}

test('M2/1: KROK 1 — plan trybów ma wiersz na tryb, nie na kombinację celów', () => {
  const { state } = robbersBoard();
  const { oferty } = robbersOffers(state);
  const plan = castModePlanOf(oferty);
  assert.ok(plan, 'grupa czaru modalnego daje plan kroku 1 (tryby)');
  assert.equal(plan.rows.length, 2, `wiersz na tryb: ${JSON.stringify(plan.rows)}`);
  assert.equal(new Set(plan.reps.map((c) => c.modeIndex)).size, 2, 'reprezentanty obu trybów');
  assert.ok(plan.reps.every((c) => c.modeIndex != null), 'reprezentant niesie tryb');
  // Zatwierdź kroku 1 zwraca komendę-reprezentanta trybu (L48: z ofert silnika).
  const wybrany = commandForCastWindowSelection(plan.reps, 'opt-1');
  assert.equal(wybrany.modeIndex, 1, 'wiersz 2 = tryb 2');
  // Kontrola: to nie jest plan dla zwykłej grupy rzutów (anty-over-fix).
  assert.equal(castModePlanOf([{ type: 'cast_spell', objectId: 'x', targets: [] }]), null);
});

test('M2/2: KROK 2 — tryb „up to 3” daje picker wielocelowy (nie listę kombinacji)', () => {
  const { state, moj, obcy } = robbersBoard();
  const { oferty } = robbersOffers(state);
  const tryb0 = oferty.filter((c) => c.modeIndex === 0);
  // E7 (2026-09-20c): krok 2 liczy PRODUKCJA — `main.js` po wyborze trybu wchodzi
  // ponownie w tę samą kaskadę panelu (castWindowPlanOf → tapXArtifactsPlanOf →
  // multiTargetPlanOf → … → buttonsPlanOf) z podzbiorem wariantów trybu. Pin
  // opisuje odtąd funkcje, które naprawdę woła gracz, a nie ich kopię
  // (`modeFollowUpPlanOf` usunięte: lustro miało INNĄ kolejność — multi przed
  // window, choć M300/1 wymaga odwrotnie — i nie znało części planów).
  assert.equal(castWindowPlanOf(tryb0), null,
    'warianty celów trybu nie są grupą okna rzutu — kaskada produkcji idzie dalej (M300/1)');
  const plan = multiTargetPlanOf(tryb0);
  assert.ok(plan, 'tryb z „up to 3 target creatures” to picker wielocelowy');
  assert.equal(plan.minTargets, 0, 'zero celów jest legalne („up to”)');
  assert.equal(plan.maxTargets, 2, `sufit = liczba kandydatów: ${plan.maxTargets}`);
  assert.deepEqual([...plan.targets].sort(), [moj, obcy].sort(), 'kandydaci = stwory z pola bitwy');
  // Zatwierdź pickera z dwoma ptaszkami → komenda z ofert silnika, wykonalna.
  const cmd = commandForSelection(tryb0, { targets: [moj, obcy] });
  assert.ok(cmd, 'dwa zaznaczone cele dają legalną komendę');
  assert.deepEqual(cmd.targets, [moj, obcy]);
  assert.ok(execute(state, cmd).ok, 'komenda z pickera jest wykonalna');
  resolveStack(state);
  assert.equal(state.objects.get(moj).tapped, true, 'oba cele tapnięte');
  assert.equal(state.objects.get(obcy).tapped, true, 'oba cele tapnięte (2/2)');
});

test('M2/3: KROK 2 — tryb bez decyzji (Call for Aid) rzuca od razu, bez pustego modala', () => {
  const { state } = robbersBoard();
  const { oferty } = robbersOffers(state);
  // Produkcja (main.js, gałąź castModePlan → onComplete): podzbiór jednego trybu
  // o JEDNEJ komendzie jest rzucany wprost, bez drugiego modala.
  const tryb1 = oferty.filter((c) => c.modeIndex === 1);
  assert.equal(tryb1.length, 1, 'tryb bez celów ma dokładnie jeden wariant — nie ma czego wybierać');
  assert.equal(tryb1[0].modeIndex, 1);
  // Audyt PR #131 (E2, znalezisko F9): poprzednia asercja `ok !== undefined`
  // przechodziła TAKŻE dla komendy odrzuconej (`false !== undefined`), więc pin
  // nie dowodził, że oferta trybu 1 jest komendą PRZYJMOWANĄ przez silnik
  // (L48: oferta = walidacja) ani że rzut nie otwiera drugiego modala.
  // Komenda musi być wykonana na TYM SAMYM stanie, z którego pochodzi oferta:
  // `objectId` jest unikalne per stan, więc egzekucja na świeżym stole kończy
  // się odrzuceniem „nie ma takiego obiektu" — właśnie to ukrywała poprzednia
  // asercja (dlatego stała się tak słaba).
  const wynik = execute(state, tryb1[0]);
  assert.equal(wynik.ok, true, `wariant trybu 1 przyjmowany przez silnik: ${wynik.reason ?? ''}`);
  assert.equal(state.zones.stack.length, 1, 'czar z wybranym trybem trafia na stos (bez drugiego modala)');
  const naStosie = state.objects.get(state.zones.stack[0]);
  assert.equal(naStosie?.chosenMode, 1, 'tryb wybrany w rzucie, nie w drugiej decyzji modalnej (CR 601.2b)');
  assert.equal(robbersOffers(state).oferty.length, 0, 'karta nie jest już oferowana z ręki po rzucie');
});

test('M2/4: oba modale (DOM) — najpierw tryby, potem ptaszki celów + Zatwierdź', () => {
  const { state, moj, obcy } = robbersBoard();
  const { view, oferty } = robbersOffers(state);
  const plan = castModePlanOf(oferty);
  const labels = labelChoiceOptions(plan.reps, SESSION, view);
  plan.rows = plan.rows.map((row, i) => ({ ...row, label: labels[i] }));

  const dom = installMiniDom();
  const modeHost = dom.createElement('div');
  let chosenMode = null;
  renderMultiTargetWizard(modeHost, {
    view, session: SESSION, plan, commands: plan.reps,
    intro: "Rzuć: You're Confronted by Robbers (koszt {3}{W}) — wybierz tryb:",
    onComplete: (cmd) => { chosenMode = cmd; }, onCancel: () => {},
  });
  assert.match(modeHost.textContent, /Zyskiwanie czasu/, `krok 1 nazywa tryb 1: ${modeHost.textContent}`);
  assert.match(modeHost.textContent, /Wezwanie pomocy/, `krok 1 nazywa tryb 2: ${modeHost.textContent}`);
  const modeRows = walkDom(modeHost).filter((el) => el.dataset?.multiTargetId === 'opt-1'
    || String(el.className).includes('multi-target-toggle'));
  assert.ok(modeRows.length >= 1, 'krok 1 ma wiersze wyboru');
  // Zaznacz tryb 1 i zatwierdź.
  const radio = walkDom(modeHost).find((el) => String(el.className).includes('multi-target-toggle'));
  assert.ok(radio, 'krok 1 ma radio trybu');
  radio.checked = true; radio.emit('change');
  const confirm1 = walkDom(modeHost).find((el) => /Zatwierdź/.test(el.textContent) && el.tagName === 'BUTTON');
  assert.ok(confirm1, 'krok 1 ma Zatwierdź');
  confirm1.click();
  assert.ok(chosenMode, 'Zatwierdź kroku 1 zwraca wybrany tryb');
  const subset = oferty.filter((c) => c.modeIndex === chosenMode.modeIndex);
  // Krok 2 = kaskada produkcji na podzbiorze (jak w M2/2), nie osobne lustro.
  const followPlan = multiTargetPlanOf(subset);
  assert.ok(followPlan, 'wybrany tryb 0 ma krok 2 (cele)');

  const targetHost = dom.createElement('div');
  let talCmd = null;
  renderMultiTargetWizard(targetHost, {
    view, session: SESSION, plan: followPlan, commands: subset,
    onComplete: (cmd) => { talCmd = cmd; }, onCancel: () => {},
  });
  const toggles = walkDom(targetHost).filter((el) => String(el.className).includes('multi-target-toggle'));
  assert.equal(toggles.length, 2, `krok 2: ptaszek na kandydata (${toggles.length})`);
  assert.match(targetHost.textContent, /0–2/, `krok 2 mówi „up to” zakresem: ${targetHost.textContent.slice(0, 140)}`);
  toggles[0].checked = true; toggles[0].emit('change');
  toggles[1].checked = true; toggles[1].emit('change');
  const confirm2 = walkDom(targetHost).find((el) => /Zatwierdź/.test(el.textContent) && el.tagName === 'BUTTON');
  assert.ok(confirm2, 'krok 2 ma Zatwierdź');
  confirm2.click();
  assert.ok(talCmd, 'Zatwierdź kroku 2 zwraca komendę rzutu');
  assert.deepEqual([...talCmd.targets].sort(), [moj, obcy].sort(), 'komenda niesie oba zaznaczone cele');
});

/** Mini-DOM jak w testach kreatora (M104/bug-c1) — tylko to, czego używa picker. */
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

test('M/3: tryby są rozróżnialne w modalu (etykiety wariantów nazywają tryb)', () => {
  const { state } = robbersBoard();
  const { view, wpisy } = robbersEntries(state);
  const etykiety = wpisy[0].request.options
    .map((c) => commandLabel(c, SESSION, view).replace(/<[^>]*>/g, ''));
  assert.ok(etykiety.some((l) => /Zyskiwanie czasu/.test(l)), `wariant trybu 1 nazwany: ${JSON.stringify(etykiety)}`);
  assert.ok(etykiety.some((l) => /Wezwanie pomocy/.test(l)), `wariant trybu 2 nazwany: ${JSON.stringify(etykiety)}`);
  assert.equal(new Set(etykiety).size, etykiety.length,
    `warianty o RÓŻNYM skutku nie mogą mieć identycznych etykiet: ${JSON.stringify(etykiety)}`);
});

test('M/4: silnik nadal oferuje OBA tryby i oba są wykonalne (scalanie to prezentacja)', () => {
  const { state, spellId, moj } = robbersBoard();
  const view = playerView(state, 'p1');
  const oferty = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === spellId);
  const tryby = new Set(oferty.map((c) => c.modeIndex));
  assert.deepEqual([...tryby].sort(), [0, 1], 'obie komendy trybów zostają w ofertach silnika');

  // Tryb 1 („Wezwanie pomocy"): trzy tokeny Soldier.
  const tokeny = oferty.find((c) => c.modeIndex === 1 && (c.targets ?? []).length === 0);
  assert.ok(tokeny, 'oferta trybu 1 bez celów');
  assert.ok(execute(state, tokeny).ok, 'rzut trybu 1 wykonalny');
  resolveStack(state);
  const sold = [...state.objects.values()].filter((o) => o.zone === 'battlefield' && o.cardId === 'token_soldier');
  assert.equal(sold.length, 3, 'trzy tokeny Soldier z trybu 1');
  assert.equal(state.zones.stack.length, 0, 'stos pusty po rozstrzygnięciu');

  // Tryb 0 („Zyskiwanie czasu"): tapnięcie celu.
  const { state: s2, spellId: spell2, moj: moj2 } = robbersBoard();
  const v2 = playerView(s2, 'p1');
  const tap = v2.legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === spell2
    && c.modeIndex === 0 && (c.targets ?? []).includes(moj2));
  assert.ok(tap, 'oferta trybu 0 z celem');
  assert.ok(execute(s2, tap).ok, 'rzut trybu 0 wykonalny');
  resolveStack(s2);
  assert.equal(s2.objects.get(moj2).tapped, true, 'cel trybu 0 został tapnięty');
  assert.ok(moj, 'scena ma własnego stwora do tapnięcia');
});

test('M/5 (klasa, ADR 0002): czar bez trybów zachowuje dawny tytuł grupy — anty-over-fix', () => {
  const objectId = 'zwykly-czar';
  const view = {
    zones: {
      hand: [{ id: objectId, cardId: objectId, spell: { timing: 'instant' } }],
      battlefield: [{ id: 'cel-1', cardId: 'scorch-spitter' }],
      stack: [], graveyard: [], library: [], exile: [],
    },
    players: [{ id: 'p1' }, { id: 'p2' }],
  };
  const session = { nameOf: (id) => (id === objectId ? 'Zwykły Czar' : id) };
  const options = [
    { type: 'cast_spell', objectId, targets: ['cel-1'] },
    { type: 'cast_spell', objectId, targets: [] },
  ];
  const tytul = choiceGroupTitle({ type: 'command', options }, session, view);
  assert.match(tytul, /Cel czaru/, `nie-modalny czar z celami zachowuje tytuł „Cel czaru": ${tytul}`);
  assert.doesNotMatch(tytul, /^Rzuć:/, 'tytułu rzutu nie dostaje grupa, która nie jest modalna');
});

test('M/6 (klasa): wszystkie warianty trybów lądują w JEDNEJ grupie klucza', () => {
  const a = { type: 'cast_spell', objectId: 'obj', modeIndex: 0, targets: [] };
  const b = { type: 'cast_spell', objectId: 'obj', modeIndex: 0, targets: ['x'] };
  const c = { type: 'cast_spell', objectId: 'obj', modeIndex: 1, targets: [] };
  const keys = new Set([a, b, c].map((cmd) => choiceRequestGroupKey(cmd)));
  assert.equal(keys.size, 1, `jeden klucz grupy na czar modalny: ${JSON.stringify([...keys])}`);
  const inny = { type: 'cast_spell', objectId: 'obj-inny', modeIndex: 0 };
  assert.notEqual(choiceRequestGroupKey(inny), choiceRequestGroupKey(a), 'inna karta = inna grupa');
});
