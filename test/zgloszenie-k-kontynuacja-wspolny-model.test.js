// =============================================================================
// Zgłoszenie „K", kontynuacja (uwaga właściciela 2026-11-07, wieczór): po
// zamknięciu K podsumowanie agenta OPISAŁO nieistniejącą „lupę" przy
// przyciskach modala kolejności zdolności. Właściciel stanowczo: „Żadnych
// lup! Modale wyboru mają być wszystkie z jednego wspólnego źródła, ze
// wspólnym modelem wyświetlania. Jedynym akceptowalnym modelem jest
// podkreślona nazwa karty/efektu i hover z img karty ze scryfall (fullscreen
// po kliknięciu na ekranach dotykowych). ŻADNYCH NOWYCH NIEZALEŻNYCH
// MODALI!!!"
//
// Stan kodu po K (zweryfikowany): modal kolejności renderuje WSPÓLNY helper
// M302 (buttonsPlan → renderMultiTargetWizard → wiersze pickera), a nazwa
// wiersza jest podkreślona (picker-name is-openable, kropkowane podkreślenie
// w index.html) z hoverem pokazującym img karty ze Scryfall; na dotyku (brak
// hovera) klik w nazwę otwiera pełny ekran. Ikony lup NIE MA nigdzie w
// modalach (renderPeekButton od O2/2026-10-18 i 2026-11-05 to nazwa, nie
// ikona). Niniejszy plik PRZYPINA tę konwencję na_scenie zgłoszenia K, żeby
// żaden przyszły „podgląd" nie odjechał od wspólnego modelu.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { buttonsPlanOf } from '../src/table/multi-target.js';
import { commandLabel, choiceGroupTitle } from '../src/table/render.js';
import { previewCardIdOfOption, renderMultiTargetWizard } from '../src/table/choice-request.js';

const reg = createCardRegistry();

class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {}; this.className = '';
    this.text = ''; this.type = ''; this.checked = false; this.disabled = false;
    this.title = ''; this.dataset = {}; this.name = '';
    this.classList = { toggle: () => {}, add: () => {} };
  }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.text = String(v).replace(/<[^>]*>/g, ''); this.html = String(v); this.children = []; }
  get innerHTML() { return this.html ?? this.textContent; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(t, l) { (this.listeners[t] ??= []).push(l); }
  fire(t, ev = { stopPropagation() {}, preventDefault() {}, clientX: 10, clientY: 20 }) {
    for (const l of this.listeners[t] ?? []) l(ev);
  }
  click() { this.fire('click'); }
  descendants() {
    const out = [];
    const walk = (n) => { for (const c of n.children ?? []) { out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  find(pred) { return this.descendants().find(pred); }
}

function zDocumentem(fn) {
  const old = globalThis.document;
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  try {
    return fn(new MiniEl('div'));
  } finally {
    globalThis.document = old;
  }
}

function put(s, id, cardId, zone = 'battlefield', player = 'p1') {
  const d = reg.get(cardId);
  assert.ok(d, `karta ${cardId} w rejestrze`);
  addObject(s, {
    id, instanceId: `i-${id}`, cardId, ownerId: player, controllerId: player, zone,
    ...gameObjectDataOf(d), types: d.types ?? [], subtypes: d.subtypes ?? [], keywords: d.keywords ?? [],
  });
}

/** Scena zgłoszenia K: dwa równoczesne triggery ataku (jak w K/1–K/4). */
function attackChoices() {
  const s = createGameState({ seed: 2107, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  put(s, 'spitter', 'scorch-spitter');
  put(s, 'beast', 'gruul-beastmaster');
  s.objects.set('spitter', Object.freeze({ ...s.objects.get('spitter'), summoningSickness: false }));
  s.objects.set('beast', Object.freeze({ ...s.objects.get('beast'), summoningSickness: false }));
  for (let i = 0; i < 5; i += 1) put(s, `lib${i}`, 'basic-mountain', 'library');
  assert.ok(execute(s, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['spitter', 'beast'] }).ok);
  const view = playerView(s, 'p1');
  const choices = view.legalCommands.filter((c) => c.type === 'resolve_trigger_order');
  assert.equal(choices.length, 2, 'dwie zdolności do ułożenia');
  return { view, choices };
}

const session = {
  nameOf: (id) => reg.get(id)?.name ?? String(id),
  nameOfObject: (id) => String(id),
  abilitiesOf: (id) => reg.get(id)?.abilities ?? [],
};

/** Mostek jak w main.js (gałąź buttonsPlan): plan + etykiety + cardId wierszy. */
function buildModalProps({ view, choices }, hoverProps) {
  const plan = buttonsPlanOf(choices);
  const resolveCardId = (id) => (reg.get(id) ? id : null);
  plan.rows = choices.map((option, i) => ({
    id: plan.rows[i].id,
    label: commandLabel(option, session, view),
    cardId: previewCardIdOfOption(option, resolveCardId, view),
  }));
  return {
    view, session, plan, commands: choices,
    intro: choiceGroupTitle({ type: 'command', options: choices }, session, view),
    ...hoverProps,
    onComplete: () => {},
    onCancel: () => {},
  };
}

function rowNames(host) {
  return host.descendants().filter((el) => String(el.className).includes('picker-name'));
}

// ---- K/5: wspólne źródło — wiersze pickera, żadnych „lup"/osobnych podglądów --

test('K/5: modal kolejności = wspólny helper (radio + Zatwierdź), ZERO osobnych podglądów', () => {
  zDocumentem((host) => {
    const hover = { onHoverCardByCardId: () => {}, onHoverCardEnd: () => {} };
    renderMultiTargetWizard(host, buildModalProps(attackChoices(), hover));
    // Wspólny picker: wiersze radio + przycisk potwierdzenia.
    const rows = host.descendants().filter((el) => String(el.className).includes('multi-target-row'));
    assert.equal(rows.length, 2, 'dwa wiersze wspólnego pickera (nie ściana przycisków)');
    const confirmBtn = host.descendants().find((el) => el.tagName === 'button'
      && String(el.textContent).includes('Zatwierdź'));
    assert.ok(confirmBtn, 'przycisk „Zatwierdź wybór” ze wspólnego helpera');
    // ŻADNYCH osobnych nazw-podglądów ani ikon: nazwa WIERZA jest podglądem.
    const peeks = host.descendants().filter((el) => String(el.className).includes('choice-request-peek'));
    assert.equal(peeks.length, 0, 'zero osobnych elementów podglądu — wiersz sam jest nazwą');
  });
});

// ---- K/6: podkreślona nazwa + hover z img karty ŹRÓDŁA ------------------------

test('K/6: nazwa wiersza podkreślona (is-openable), hover pokazuje kartę źródła', () => {
  zDocumentem((host) => {
    const starts = [];
    let ends = 0;
    const hover = {
      onHoverCardByCardId: (cardId) => starts.push(cardId),
      onHoverCardEnd: () => { ends += 1; },
    };
    const { view, choices } = attackChoices();
    renderMultiTargetWizard(host, buildModalProps({ view, choices }, hover));
    const names = rowNames(host);
    assert.equal(names.length, 2, 'nazwa w każdym wierszu');
    for (const name of names) {
      assert.ok(String(name.className).includes('is-openable'),
        `nazwa podkreślona (wspólny model): „${name.textContent}”`);
      assert.ok(name.textContent.startsWith('Najpierw: '), `etykieta komendy: „${name.textContent}”`);
    }
    // Hover pokazuje KARTĘ ŹRÓDŁA zdolności (scryfall img — ten sam handler
    // co reszta stołu).
    names[0].fire('mouseenter');
    names[1].fire('mouseenter');
    assert.deepEqual([...starts].sort(), ['gruul-beastmaster', 'scorch-spitter'],
      'hover nazywa kartę źródła każdej zdolności');
    names[0].fire('mouseleave');
    assert.equal(ends, 1, 'opuszczenie nazwy kończy hover');
  });
});

// ---- K/7: dotyk — klik w nazwę otwiera pełny ekran; z hoverem klik nie otwiera -

test('K/7: z hoverem klik w nazwę nie otwiera karty; bez hovera (dotyk) otwiera źródło', () => {
  zDocumentem((host) => {
    const opened = [];
    const hover = { onHoverCardByCardId: () => {}, onHoverCardEnd: () => {} };
    const props = buildModalProps(attackChoices(), hover);
    renderMultiTargetWizard(host, { ...props, onOpenCardByCardId: (id) => opened.push(id) });
    rowNames(host)[0].click();
    assert.deepEqual(opened, [], 'klik w nazwę przy hoverze nie otwiera pełnego ekranu (mysz)');
  });
  zDocumentem((host) => {
    const opened = [];
    // Dotyk: brak kursora = brak callbacków hover — klik w nazwę = fullscreen.
    const props = buildModalProps(attackChoices(), {});
    renderMultiTargetWizard(host, { ...props, onOpenCardByCardId: (id) => opened.push(id) });
    rowNames(host)[0].click();
    assert.equal(opened.length, 1, 'na dotyku tap w nazwę otwiera pełny ekran karty');
    assert.ok(['scorch-spitter', 'gruul-beastmaster'].includes(opened[0]),
      `otwiera kartę ŹRÓDŁA zdolności: ${opened[0]}`);
  });
});

// ---- K/8: decyzja wraca komendą silnika (radio + Zatwierdź) -------------------

test('K/8: radio + Zatwierdź oddaje komendę wybranej zdolności', () => {
  zDocumentem((host) => {
    const completed = [];
    const hover = { onHoverCardByCardId: () => {}, onHoverCardEnd: () => {} };
    const { view, choices } = attackChoices();
    const props = buildModalProps({ view, choices }, hover);
    renderMultiTargetWizard(host, { ...props, onComplete: (cmd) => completed.push(cmd) });
    const rows = host.descendants().filter((el) => String(el.className).includes('multi-target-row'));
    // Zaznacz wiersz Scorch Spittera (radio) i potwierdź.
    const spitterRow = rows.find((r) => r.textContent.includes('Scorch Spitter'));
    assert.ok(spitterRow, 'wiersz Scorch Spittera widoczny');
    const radio = spitterRow.descendants().find((el) => el.tagName === 'input' && el.type === 'radio');
    assert.ok(radio, 'wiersz z radiem ze wspólnego pickera');
    radio.checked = true;
    for (const fn of radio.listeners.change ?? []) fn({});
    const confirmBtn = host.descendants().find((el) => el.tagName === 'button'
      && String(el.textContent).includes('Zatwierdź'));
    assert.ok(!confirmBtn.disabled, 'Zatwierdź aktywne po zaznaczeniu');
    confirmBtn.click();
    assert.equal(completed.length, 1, 'potwierdzenie oddaje jedną komendę');
    assert.equal(completed[0].cardId, 'scorch-spitter', 'komenda wybranej zdolności (ŹRÓDŁO)');
    assert.equal(completed[0].type, 'resolve_trigger_order');
  });
});
