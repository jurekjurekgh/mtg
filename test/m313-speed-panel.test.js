// M313 (zgłoszenie właściciela z testów żywej gry, tor C): Leonin Surveyor
// („Start your engines!") — prędkość gracza nie miała ŻADNEGO przedstawienia
// w UI: playerView nie projekcjonował pola `speed` graczy, a na stole nie
// było panelu specjalnego analogicznego do Poison/Undercity.
//
// Zgłoszenie: „wejście tej karty powinno aktywować strefę specjalną Start
// Your Engines/Speed z tokenem analogicznym do kart Undercity czy Poison i
// polem, w którym pokazana jest szybkość gracza. Jeśli tylko jeden gracz
// zapalił silnik, to pokazuje tylko jego prędkość; jeśli obu — dla każdego
// osobno".
//
// Silnik speed MA (DFT, Batch 24): `players.speed` 0..4, akcja stanowa
// „start your engines!" (choke point `startEnginesFor`), wzrost w triggers,
// zdarzenie `speed_changed`. Luka leży w warstwach WIDOKU i UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { applyEffect } from '../src/engine/effects.js';

const REGISTRY = createCardRegistry();

function putCard(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], abilities: def.abilities ?? [],
  });
  return state.objects.get(id);
}

test('M313/1 (widok): playerView projekcjonuje speed obu graczy (informacja publiczna)', () => {
  const state = createGameState({ seed: 313, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.players[0].speed = 3;
  state.players[1].speed = 1;
  const view = playerView(state, 'p1');
  assert.equal(view.players.find((p) => p.id === 'p1')?.speed, 3, 'własna prędkość w widoku');
  assert.equal(view.players.find((p) => p.id === 'p2')?.speed, 1,
    'prędkość przeciwnika jest jawna (licznik publiczny, CR: speed to atrybut gracza)');
});

test('M313/2 (silnik→widok, pin ścieżki): Enter Leonin Surveyor startuje prędkość i to widać w widoku', () => {
  const state = createGameState({ seed: 313, players: [{ id: 'p1' }, { id: 'p2' }] });
  putCard(state, 'surveyor', 'leonin-surveyor', 'p1');
  // Zdolność STATYCZNA „start your engines!" rozliczana jak akcja stanowa;
  // ścieżka efektowa (choke point startEnginesFor) — jak w effects.js.
  applyEffect(state, { type: 'start_engines' }, state.objects.get('surveyor'), []);
  const view = playerView(state, 'p1');
  assert.equal(view.players.find((p) => p.id === 'p1')?.speed, 1,
    'prędkość startuje na 1 i jest widoczna dla UI (uwaga właściciela)');
});

test('M313/3 (UI): panel speed pokazuje TYLKO gracza, który zapalił silnik', async () => {
  const { renderSpeedPanel } = await import('../src/table/render.js');
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', speed: 2 }, { id: 'p2', name: 'Bot', speed: 0 }],
  };
  const { els } = panelZPrzechwytem((els_) => {
    renderSpeedPanel(els_, view, {});
  });
  assert.equal(els.speed.hidden, false, 'panel widoczny (ktokolwiek ma speed)');
  const liczniki = els.speed.findAll((n) => String(n.className).includes('speed-count')).map((n) => n.textContent);
  assert.equal(liczniki.length, 1, 'jeden wiersz — tylko gracz z prędkością (zgłoszenie)');
  assert.match(liczniki[0], /Gracz/, 'wiersz właściciela prędkości (etykieta PLAYER_LABEL)');
  assert.match(liczniki[0], /2/, 'pokazuje JEGO prędkość');
  assert.doesNotMatch(liczniki.join(' '), /Bot/, 'gracz z speed 0 nie ma wiersza');
});

test('M313/4 (UI): obaj zapalili — wiersz dla każdego osobno; maks. prędkość odwraca obraz markera', async () => {
  const { renderSpeedPanel } = await import('../src/table/render.js');
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', speed: 1 }, { id: 'p2', name: 'Bot', speed: 4 }],
  };
  const { els } = panelZPrzechwytem((els_) => {
    renderSpeedPanel(els_, view, {});
  });
  assert.equal(els.speed.hidden, false);
  const liczniki = els.speed.findAll((n) => String(n.className).includes('speed-count')).map((n) => n.textContent);
  assert.equal(liczniki.length, 2, 'wiersz dla każdego gracza osobno (zgłoszenie)');
  assert.match(liczniki.join(' '), /1/, 'prędkość gracza');
  assert.match(liczniki.join(' '), /maks/, 'prędkość 4 = maks. (tył markera „Max Speed")');
});

test('M313/5 (UI): nikt nie zapalił — panel ukryty', async () => {
  const { renderSpeedPanel } = await import('../src/table/render.js');
  const { els } = panelZPrzechwytem((els_) => {
    renderSpeedPanel(els_, { playerId: 'p1', players: [{ id: 'p1', speed: 0 }, { id: 'p2', speed: 0 }] }, {});
  });
  assert.equal(els.speed.hidden, true, 'panel ukryty, dopóki nikt nie ma prędkości');
});

/** Mini-DOM (wzorzec m195) + mini-els jak dla paneli specjalnych. */
function panelZPrzechwytem(run) {
  class MiniEl {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.listeners = {};
      this.className = ''; this.text = ''; this.dataset = {}; this.disabled = false;
      this.type = ''; this.checked = false; this.hidden = false; this.src = ''; this.alt = '';
      this.loading = '';
      this.classList = { toggle: () => {}, add: () => {}, remove: () => {} };
    }
    set textContent(v) { this.text = String(v); this.children = []; }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
    set innerHTML(v) { this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
    appendChild(c) { this.children.push(c); return c; }
    replaceChildren(...n) { this.children = n.flat(); }
    addEventListener(t, l) { (this.listeners[t] ??= []).push(l); }
    click() { for (const l of this.listeners.click ?? []) l({ stopPropagation() {} }); }
    all() { return [this, ...this.children.flatMap((c) => (c.all ? c.all() : [c]))]; }
    find(pred) { return this.all().find(pred); }
    findAll(pred) { return this.all().filter(pred); }
  }
  globalThis.document = globalThis.document ?? {};
  const old = globalThis.document.createElement;
  globalThis.document.createElement = (tag) => new MiniEl(tag);
  try {
    const els = { speed: new MiniEl('div') };
    return run(els) ?? { els };
  } finally {
    if (old) globalThis.document.createElement = old; else delete globalThis.document.createElement;
  }
}
