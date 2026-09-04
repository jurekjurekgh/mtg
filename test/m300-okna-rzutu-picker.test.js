// M300 — okna rzutu (Vaan / Halo Forager / madness / rebound / suspend)
// dołączone do wspólnego kreatora (zlecenie właściciela 2026-09-03):
//
//   „Nie wiem co rozumiesz przez wizard dla okien rzutu — co to znaczy? Że te
//   efekty są nieobsłużone? Że nie korzystają ze wspólnego helpera? W obu
//   przypadkach trzeba to załatać."
//
// Stan zmierzony: silnik obsługuje okna w pełni (etykiety wariantów K1/K2),
// ale wybór padał na awaryjną ścianę przycisków renderChoiceRequest — poza
// wspólnym helperem. Każda opcja okna to GOTOWY wariant rzutu (K1/K2:
// „· tryb”, „· stun: cel”) albo odmowa — kształt „wybierz jedną z
// etykietowanych opcji”, nie „skomponuj cele”.
//
// Przy okazji wyszła klasa błędu: multiTargetPlanOf budował plan z PODZBIORU
// opcji niosących `targets`, gubiąc po drodze odmowę (decline) i warianty
// bezcelowe — dla okna Vaana z czarowym {X} powstawał kreator bez wiersza
// „nie rzucaj” (zmierzone testem M300/1 — przed naprawą plan powstawał).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choiceRequest } from '../src/protocol/types.js';
import {
  multiTargetPlanOf, castWindowPlanOf, commandForCastWindowSelection,
} from '../src/table/multi-target.js';
import { renderMultiTargetWizard } from '../src/table/choice-request.js';

class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {};
    this.className = ''; this.text = ''; this.type = ''; this.checked = false;
    this.disabled = false; this.name = ''; this.dataset = {};
  }
  set textContent(value) { this.text = String(value); }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...nodes) { this.children = nodes.flat(); }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  click() { for (const l of this.listeners.click ?? []) l({ preventDefault() {}, stopPropagation() {} }); }
  emit(type) { for (const l of this.listeners[type] ?? []) l({}); }
  all(pred, out = []) { if (pred(this)) out.push(this); for (const c of this.children) c.all(pred, out); return out; }
  byClass(cls) { return this.all((el) => String(el.className).split(/\s+/).includes(cls)); }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };

const VIEW = { playerId: 'p1', players: [{ id: 'p1', name: 'Ty' }], zones: { battlefield: [], hand: [], stack: [], graveyard: [], library: [] } };
const SESSION = { nameOf: (cardId) => `Karta:${cardId}`, nameOfObject: (id) => `Obiekt:${id}` };

/** Okno Vaana: odmowa + warianty rzutu czaru z {X} na różne cele. */
function vaanWindowCommands() {
  return [
    Object.freeze({ type: 'resolve_exile_cast', playerId: 'p1', cast: false, objectId: 'ex1', cardId: 'konsumpcja-ducha' }),
    Object.freeze({ type: 'resolve_exile_cast', playerId: 'p1', cast: true, objectId: 'ex1', cardId: 'konsumpcja-ducha', xValue: 1, targets: ['cA'] }),
    Object.freeze({ type: 'resolve_exile_cast', playerId: 'p1', cast: true, objectId: 'ex1', cardId: 'konsumpcja-ducha', xValue: 2, targets: ['cA'] }),
    Object.freeze({ type: 'resolve_exile_cast', playerId: 'p1', cast: true, objectId: 'ex1', cardId: 'konsumpcja-ducha', xValue: 1, targets: ['cB'] }),
  ];
}

/** Okno Halo Foragera: decline + warianty darmowego rzutu z grobu (K1: stun). */
function haloWindowCommands() {
  return [
    Object.freeze({ type: 'resolve_grave_free_cast', playerId: 'p1', decline: true }),
    Object.freeze({ type: 'resolve_grave_free_cast', playerId: 'p1', objectId: 'g1', cardId: 'misja-ratunkowa', xValue: 0, targets: ['cA', 'cB'], modeIndex: 1, stunTargetId: 'cB' }),
    Object.freeze({ type: 'resolve_grave_free_cast', playerId: 'p1', objectId: 'g1', cardId: 'misja-ratunkowa', xValue: 0, targets: ['cA', 'cB'], modeIndex: 1, stunTargetId: 'cA' }),
  ];
}

test('M300/1: multiTargetPlanOf NIE POŻERA opcji bez targets (odmowa nie może ginąć)', () => {
  // Przed naprawą: plan powstawał z 3 wariantów z targets, a decline
  // wypadał z kreatora — gracz nie mógł odmówić rzutu z okna.
  assert.equal(multiTargetPlanOf(vaanWindowCommands()), null,
    'okno z odmową + wariantami celowanymi nie daje planu wielocelowego');
  assert.equal(multiTargetPlanOf(haloWindowCommands()), null);
});

test('M300/2: okna rzutu dostają plan wierszy komend (jedna opcja = jeden wiersz)', () => {
  const plan = castWindowPlanOf(vaanWindowCommands());
  assert.ok(plan, 'okno Vaana ma dać plan');
  assert.equal(plan.castWindowMode, true);
  assert.equal(plan.rows.length, 4, 'wszystkie opcje — Z ODMOWĄ — są wierszami');
  const halo = castWindowPlanOf(haloWindowCommands());
  assert.ok(halo, 'okno Halo Foragera ma dać plan');
  assert.equal(halo.rows.length, 3);
  assert.equal(halo.rows[0].label, null, 'etykiety wypełnia wywołujący (K1/K2), plan daje null');
  assert.equal(halo.rows[1].cardId, 'misja-ratunkowa', 'wiersz niesie cardId do podglądu karty');
  // Dopasowanie przez tożsamość z legalCommands (L48).
  const cmds = haloWindowCommands();
  assert.equal(commandForCastWindowSelection(cmds, halo.rows[0].id), cmds[0], 'decline pod indeksem 0');
  assert.equal(commandForCastWindowSelection(cmds, halo.rows[2].id), cmds[2]);
  assert.equal(commandForCastWindowSelection(cmds, 'opt-99'), null, 'nieistniejący wiersz → null');
});

test('M300/3: etykiety wierszy przychodzą od wywołującego (K1/K2 + duplikaty)', () => {
  const commands = vaanWindowCommands();
  const plan = castWindowPlanOf(commands);
  plan.rows = commands.map((cmd, i) => ({
    id: plan.rows[i].id,
    label: i === 0 ? 'Nie rzucaj' : `Rzuć: Konsumpcja Ducha (X=${cmd.xValue})`,
    cardId: cmd.cardId ?? null,
  }));
  assert.match(plan.rows[0].label, /Nie rzucaj/);
  assert.equal(plan.rows[1].label, 'Rzuć: Konsumpcja Ducha (X=1)');
});

test('M300/4: negatywy — pojedyncza opcja i obce typy nie dają planu okna', () => {
  assert.equal(castWindowPlanOf(vaanWindowCommands().slice(0, 1)), null);
  assert.equal(castWindowPlanOf([
    { type: 'resolve_color_choice', playerId: 'p1', color: 'W' },
    { type: 'resolve_color_choice', playerId: 'p1', color: 'U' },
  ]), null, 'wybór koloru to nie okno rzutu');
  const mixed = [
    { type: 'resolve_exile_cast', cast: false, objectId: 'o1', cardId: 'k1' },
    { type: 'resolve_grave_free_cast', decline: true },
  ];
  assert.equal(castWindowPlanOf(mixed), null, 'mieszane typy okien to nie jedna rodzina');
});

// ---------------------------------------------------------------------------
// KREATOR: radio + Zatwierdź + podgląd karty nazwą.
// ---------------------------------------------------------------------------

function renderWizard(plan, commands) {
  const host = new MiniEl('div');
  const completed = [];
  const previews = [];
  const request = choiceRequest({ id: 'choice-x', type: 'command', options: commands });
  renderMultiTargetWizard(host, {
    view: VIEW, session: SESSION, plan, commands: request.options,
    intro: 'Okno rzutu — wybierz wariant:',
    onOpenCardByCardId: (cardId) => previews.push(cardId),
    onComplete: (cmd) => completed.push(cmd),
    onCancel: () => completed.push('cancel'),
  });
  return { host, completed, previews, request };
}

test('M300/5: wizard okna — wybór wariantu oddaje DOKŁADNĄ komendę silnika', () => {
  const commands = haloWindowCommands();
  const plan = castWindowPlanOf(commands);
  plan.rows = commands.map((cmd, i) => ({
    id: plan.rows[i].id,
    label: cmd.decline ? 'Nie rzucaj' : `Rzuć: Misja (stun: ${cmd.stunTargetId})`,
    cardId: cmd.cardId ?? null,
  }));
  const { host, completed, request } = renderWizard(plan, commands);
  const rows = host.all((el) => el.tagName === 'label');
  assert.equal(rows.length, 3, 'trzy wiersze: decline + 2 warianty stun');
  const stunB = rows.find((r) => r.textContent.includes('stun: cB'));
  const input = stunB.children.find((c) => c.tagName === 'input');
  input.checked = true; input.emit('change');
  host.byClass('multi-target-confirm')[0].click();
  assert.equal(completed[0], request.options[1], 'tożsamość komendy z legalCommands (stun cB = opcja 1)');
});

test('M300/6: klik w nazwę wiersza otwiera podgląd karty (cardId)', () => {
  const commands = haloWindowCommands();
  const plan = castWindowPlanOf(commands);
  plan.rows = commands.map((cmd, i) => ({
    id: plan.rows[i].id,
    label: cmd.decline ? 'Nie rzucaj' : 'Rzuć: Misja',
    cardId: cmd.cardId ?? null,
  }));
  const { host, previews } = renderWizard(plan, commands);
  const names = host.byClass('picker-name');
  const castName = names.find((n) => n.textContent.includes('Rzuć: Misja'));
  castName.click();
  assert.deepEqual(previews, ['misja-ratunkowa'], 'nazwa wiersza podgląda kartę rzutu');
});

test('M300/7: pusty wybór — Zatwierdź wyłączone; routing main.js przed multiTargetPlanOf', async () => {
  const commands = haloWindowCommands();
  const plan = castWindowPlanOf(commands);
  plan.rows = commands.map((cmd, i) => ({ id: plan.rows[i].id, label: `opcja ${i}`, cardId: null }));
  const { host, completed } = renderWizard(plan, commands);
  const confirm = host.byClass('multi-target-confirm')[0];
  assert.equal(confirm.disabled, true, 'bez zaznaczenia Zatwierdź gaśnie');
  confirm.click();
  assert.equal(completed.length, 0);
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
  const start = src.indexOf('function openChoiceRequest');
  const section = src.slice(start, src.indexOf('function artShowcaseOpen', start));
  assert.ok(section.includes('castWindowPlanOf('), 'openChoiceRequest kieruje okna rzutu do kreatora');
  assert.ok(section.indexOf('castWindowPlanOf(') < section.indexOf('multiTargetPlanOf('),
    'plan okien rzutu PRZED wielocelowym (opcje okien niosą targets)');
});
