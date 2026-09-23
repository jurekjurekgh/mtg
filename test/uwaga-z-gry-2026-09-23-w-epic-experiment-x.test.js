// Uwaga J z gry (właściciel, 2026-09-23c): „Epic Experiment = jedna oferta
// »Rzuć: Epic Experiment (koszt XUR)« → modal X +/- → Mana Wizard (chyba że
// wybór bezalternatywny)”.
//
// Stan przed: silnik enumeruje warianty X = 0…N, więc panel pokazywał N
// przycisków „Rzuć: Epic Experiment (koszt 3UR, X=3)”, a płatność szła
// auto-tapem — `paymentDescriptorOf` odrzucał komendy z `xValue` jako
// „koszt zmienny”, więc kreator many nie miał czego pokazać.
//
// Kontrakt po: JEDNA oferta panelu (grupa `spell-x-value:<objectId>`), tytuł
// z X w miejscu części bezbarwnej, po kliknięciu modal ze stepperem X (bez
// listy celów — `xOnly`), a wybrany wariant ma normalny deskryptor płatności,
// więc bramka M202/O decyduje o kreatorze many jak dla każdego rzutu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { buildActionEntries, choiceGroupLabel, commandLabel } from '../src/table/render.js';
import { renderMultiTargetWizard } from '../src/table/choice-request.js';
import { multiTargetPlanOf } from '../src/table/multi-target.js';
import { paymentDescriptorOf, shouldOpenManaWizard } from '../src/table/mana-wizard.js';

const REGISTRY = createCardRegistry();

function stol({ mountains = 5, islands = 5 } = {}) {
  const state = createGameState({ seed: 2309, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  const put = (id, cardId, zone, playerId = 'p1') => {
    const def = REGISTRY.get(cardId);
    assert.ok(def, `${cardId} w rejestrze`);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
      ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
      keywords: def.keywords ?? [], spell: def.spell,
    });
  };
  put('epic', 'epic-experiment', 'hand');
  for (let i = 0; i < mountains; i += 1) put(`mtn${i}`, 'basic-mountain', 'battlefield');
  for (let i = 0; i < islands; i += 1) put(`isl${i}`, 'basic-island', 'battlefield');
  for (let i = 0; i < 6; i += 1) put(`lib${i}`, 'shock', 'library');
  const view = playerView(state, 'p1');
  const session = {
    nameOf: (id) => REGISTRY.get(id)?.name ?? id,
    cardDetails: (id) => REGISTRY.get(id) ?? null,
    state,
  };
  return { state, view, session };
}

const wpisy = ({ view, session }) => buildActionEntries(
  view.legalCommands.filter((c) => c.type !== 'concede'), session, view);

const bezTagow = (html) => String(html).replace(/<[^>]*>/g, '');

test('J/1: Epic Experiment to JEDNA oferta panelu (grupa wariantów X)', () => {
  const s = stol();
  const warianty = s.view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'epic');
  assert.ok(warianty.length > 1, `setup: silnik enumeruje warianty X (jest ${warianty.length})`);
  const oferty = wpisy(s).filter((e) => (e.request
    ? (e.request.options ?? []).some((c) => c.objectId === 'epic')
    : commandLabel(e.command, s.session, s.view).includes('Epic Experiment')));
  assert.equal(oferty.length, 1, `jedna oferta na czar (jest ${oferty.length})`);
});

test('J/2: tytuł oferty niesie koszt z symbolem X („koszt XUR")', () => {
  const s = stol();
  const wpis = wpisy(s).find((e) => e.request
    && (e.request.options ?? []).some((c) => c.objectId === 'epic'));
  assert.ok(wpis, 'Epic Experiment grupuje się w modal (oferta → modal wyboru X)');
  const panel = bezTagow(choiceGroupLabel(wpis.request, s.session, s.view));
  assert.equal(panel, 'Rzuć: Epic Experiment (koszt XUR)', `tytuł oferty: ${panel}`);
  const tytulModala = bezTagow(choiceGroupLabel(wpis.request, s.session, s.view, { manaHtml: true }));
  assert.equal(tytulModala, panel, 'panel i nagłówek modala mówią to samo (bez HTML w tytule)');
});

test('J/3: modal wybiera tylko X — plan „xOnly" ze stepperem 0–8', () => {
  const s = stol();
  const wpis = wpisy(s).find((e) => e.request
    && (e.request.options ?? []).some((c) => c.objectId === 'epic'));
  const plan = multiTargetPlanOf(wpis.request.options);
  assert.ok(plan, 'plan kreatora powstaje z wariantów X');
  assert.equal(plan.xOnly, true, 'brak celów — jedyną decyzją jest X');
  assert.equal(plan.hasX, true);
  assert.equal(plan.xMin, 0);
  // 10 źródeł (5 gór + 5 wysp) minus {U}{R} = X do 8.
  assert.equal(plan.xMax, 8, `X maksymalne z dostępnej many: ${plan.xMax}`);
  assert.equal(plan.targets.length, 0, 'kreator nie pokazuje listy celów');
});

test('J/4: wybrany wariant X ma koszt płatności (X w części bezbarwnej)', () => {
  const s = stol();
  const cmd = s.view.legalCommands.find((c) => c.type === 'cast_spell' && c.xValue === 3);
  assert.ok(cmd, 'setup: wariant X=3');
  const d = paymentDescriptorOf(cmd, s.view, {});
  assert.ok(d, 'deskryptor płatności istnieje (kreator many ma co pokazać)');
  assert.equal(d.totalNeeded, 5, 'X=3 + {U}{R} = 5 many');
  assert.equal(d.effectiveGeneric, 3, 'część bezbarwna = X');
  assert.deepEqual(d.requirements, [['U'], ['R']], 'pipy kolorów z wydruku bez zmian');
  assert.match(d.costStr, /\{X\}/, `etykieta płatności pokazuje X: ${d.costStr}`);
  assert.doesNotMatch(d.costStr, /^\{2\}/, 'nie pokazuje liczby generycznej karty');
});

test('J/5: kreator many decyduje jak zawsze — brak alternatyw = auto-płatność', () => {
  const requirements = [['U'], ['R']];
  const jedenKsztalt = shouldOpenManaWizard({
    sources: [{ id: 'a', colors: ['U'] }, { id: 'b', colors: ['R'] }],
    poolMana: 0, totalNeeded: 2, requirements, poolUnits: [],
  });
  assert.equal(jedenKsztalt, false, 'jedna góra i jedna wyspa to jeden kształt płatności');
  const wieleKsztaltow = shouldOpenManaWizard({
    sources: [
      { id: 'dual', colors: ['U', 'R'] }, { id: 'island', colors: ['U'] }, { id: 'mountain', colors: ['R'] },
    ],
    poolMana: 0, totalNeeded: 2, requirements, poolUnits: [],
  });
  assert.equal(wieleKsztaltow, true, 'źródło dwukolorowe daje drugi kształt płatności → kreator');
});

test('J/6: kreator X rysuje sam stepper (bez wierszy celów) i oddaje wariant', () => {
  const s = stol();
  const wpis = wpisy(s).find((e) => e.request
    && (e.request.options ?? []).some((c) => c.objectId === 'epic'));
  const plan = multiTargetPlanOf(wpis.request.options);

  class MiniEl {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.listeners = {};
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
  const poprzedniDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  try {
    const host = new MiniEl('div');
    let wybrany = null;
    renderMultiTargetWizard(host, {
      view: s.view, session: s.session, plan, commands: wpis.request.options,
      sourceName: 'Epic Experiment',
      onComplete: (cmd) => { wybrany = cmd; }, onCancel: () => {},
    });
    const walk = (el) => [el, ...el.children.flatMap(walk)];
    const wszystkie = walk(host);
    assert.equal(wszystkie.filter((el) => String(el.className).includes('multi-target-toggle')).length, 0,
      'brak wierszy celów — jedyną decyzją jest X');
    assert.match(host.textContent, /wybierz X \(0–8\)/, `intro kreatora: ${host.textContent.slice(0, 120)}`);
    const plus = wszystkie.find((el) => String(el.className).includes('multi-target-x-plus'));
    assert.ok(plus, 'stepper X ma przycisk +1');
    plus.click();
    const licznik = wszystkie.find((el) => String(el.className).includes('multi-target-x-count'));
    assert.equal(licznik.textContent, '1', 'licznik pokazuje wybrane X');
    assert.match(host.textContent, /X = 1/, `status po zmianie X: ${host.textContent.slice(-90)}`);
    assert.match(host.textContent, /koszt: 3 many/, 'status podaje łączny koszt (X=1 + {U}{R})');
    const zatwierdz = wszystkie.find((el) => String(el.className).includes('multi-target-confirm'));
    assert.equal(zatwierdz.disabled, false, 'Zatwierdź aktywny — wariant X=1 istnieje w legalCommands');
    zatwierdz.click();
    assert.equal(wybrany?.xValue, 1, 'kreator oddaje komendę z wybranym X (L48: z legalCommands)');
  } finally {
    if (poprzedniDocument === undefined) delete globalThis.document;
    else globalThis.document = poprzedniDocument;
  }
});
