// =============================================================================
// Zgłoszenie I (2026-11-07): „Undercity — najechanie (hover) na nazwę ścieżki
// w wyborze (np. «Podziemia — idź do: Forge») ma ZAWSZE pokazywać kartę
// Undercity — tę samą, którą pokazuje hover panelu Undercity."
//
// Rozpoznanie: panel Undercity ma hover przez attachSpecialCardHover (info
// {name, imageUri} z UNDERCITY_DUNGEON), ale opcje wyboru trasy
// (`resolve_undercity_route` — modal przez buttonsPlanOf/renderMultiTargetWizard)
// dostają podgląd WYŁĄCZNIE wtedy, gdy `previewCardIdOfOption` wskaże kartę —
// a komenda trasy ({type, room, roomName}) nie niesie żadnego identyfikatora,
// więc nazwa ścieżki była martwym tekstem.
//
// Fix: trasa wskazuje KARTĘ LOCHU — kartę specjalną spoza rejestru. Opcja
// zwraca pseudo-id 'undercity', a warstwa stołu (main.js) rozpoznaje je
// w `modalHoverInfoByCardId` (hover → ten sam druk co panel) i
// `openCardFullscreenByCardId` (tap → pełny ekran lochu).
//
// Piny w trzech warstwach (jak uwagi-tura8, L16: pilnuj drutu, nie żarówki):
//  I/1 czysta funkcja — opcja trasy → 'undercity';
//  I/2 instalacja — wiersz buttonsMode z cardId 'undercity' daje hover nazwy
//     wiersza wołający onHoverCardByCardId('undercity');
//  I/3 drut — main.js tłumaczy 'undercity' na info/pełny ekran lochu.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { previewCardIdOfOption, renderMultiTargetWizard } from '../src/table/choice-request.js';
import { buttonsPlanOf } from '../src/table/multi-target.js';

class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {};
    this.className = ''; this.text = ''; this.type = ''; this.checked = false;
    this.disabled = false; this.name = ''; this.dataset = {};
  }
  set textContent(value) { this.text = String(value); }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(value) { this.text = String(value).replace(/<[^>]*>/g, ''); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...nodes) { this.children = nodes.flat(); }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  click() { for (const l of this.listeners.click ?? []) l({ preventDefault() {}, stopPropagation() {} }); }
  emit(type, payload = {}) { for (const l of this.listeners[type] ?? []) l(payload); }
  all(pred, out = []) { if (pred(this)) out.push(this); for (const c of this.children) c.all(pred, out); return out; }
  byClass(cls) { return this.all((el) => String(el.className).split(/\s+/).includes(cls)); }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };

const VIEW = { playerId: 'p1', players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }], zones: { battlefield: [] } };
const SESSION = { nameOf: (cardId) => `Karta:${cardId}`, nameOfObject: (id) => `Obiekt:${id}` };

/** Opcje wyboru trasy — kształt z protokołu silnika (patrz M302/2). */
const TRASY = Object.freeze([
  Object.freeze({ type: 'resolve_undercity_route', playerId: 'p1', room: 1, roomName: 'Kuźnia' }),
  Object.freeze({ type: 'resolve_undercity_route', playerId: 'p1', room: 2, roomName: 'Kanały' }),
]);

test('I/1: opcja trasy Undercity wskazuje kartę lochu — pseudo-id „undercity”', () => {
  // Rejestr NIE zna 'undercity' (karta specjalna spoza katalogu) — dlatego
  // resolver zwraca null dla wszystkiego, a funkcja MUSI odpowiedzieć sama.
  const nigdy = () => null;
  for (const option of TRASY) {
    assert.equal(previewCardIdOfOption(option, nigdy, null), 'undercity',
      `trasa „${option.roomName}” podgląda kartę lochu, nie cel komendy`);
  }
  // Kierunek nie kłamie dla innych rodzin: zwykła komenda bez karty → null.
  assert.equal(previewCardIdOfOption({ type: 'resolve_color_choice', color: 'W' }, nigdy, null), null);
});

test('I/2: wiersz trasy w modalu — hover NAZWY wiersza woła podgląd „undercity” (jak main.js)', () => {
  // Dokładnie ta budowa wierszy co openChoiceRequest (main.js): plan
  // przyciskowy + etykieta + cardId z previewCardIdOfOption.
  const plan = buttonsPlanOf(TRASY);
  assert.ok(plan, 'grupa tras jedzie przez wspólny helper modala (M302)');
  const resolver = (id) => (/^undercity$/.test(String(id)) ? null : null); // rejestr nie zna lochu
  plan.rows = TRASY.map((option, i) => ({
    id: plan.rows[i].id,
    label: `Podziemia — idź do: ${option.roomName}`,
    cardId: previewCardIdOfOption(option, resolver, VIEW),
  }));
  assert.deepEqual(plan.rows.map((r) => r.cardId), ['undercity', 'undercity'],
    'każda trasa prowadzi do tej samej karty lochu');

  const host = new MiniEl('div');
  const hovered = [];
  renderMultiTargetWizard(host, {
    view: VIEW, session: SESSION, plan, commands: TRASY,
    intro: 'Ścieżka w Podziemiach — wybierz pokój:',
    onHoverCardByCardId: (cardId) => hovered.push(cardId),
    onComplete: () => {},
    onCancel: () => {},
  });
  const names = host.byClass('multi-target-name');
  assert.equal(names.length, 2, 'wiersz na każdą trasę');
  for (const name of names) {
    assert.ok(String(name.className).includes('is-openable'),
      'nazwa trasy jest podglądalna (hover), nie martwym tekstem');
    name.emit('mouseenter');
  }
  assert.deepEqual(hovered, ['undercity', 'undercity'],
    'hover na nazwie ścieżki woła podgląd karty Undercity (ta sama, co panel)');
});

// --- I/3: drut w main.js (skan źródła, wzorzec audyt-pr177) ------------------

const SOURCE = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
function localFunction(name) {
  const from = SOURCE.indexOf(`  function ${name}(`);
  const end = SOURCE.indexOf('\n  }', from);
  assert.ok(from >= 0 && end > from, `main.js ma funkcję ${name}()`);
  return SOURCE.slice(from, end + 4);
}

test('I/3a: modalHoverInfoByCardId tłumaczy „undercity” na druk lochu', () => {
  const body = localFunction('modalHoverInfoByCardId');
  assert.match(body, /'undercity'/, 'gałąź pseudo-id lochu');
  assert.match(body, /UNDERCITY_DUNGEON/, 'info z karty specjalnej (jak panel renderUndercity)');
});

test('I/3b: openCardFullscreenByCardId otwiera pełny ekran lochu dla „undercity”', () => {
  const body = localFunction('openCardFullscreenByCardId');
  assert.match(body, /'undercity'/, 'gałąź pseudo-id lochu');
  assert.match(body, /openUndercityFullscreen/, 'tap w nazwę trasy = pełny ekran Undercity (ścieżka dotykowa)');
});
