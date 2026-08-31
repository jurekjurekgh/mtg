import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { renderHoverPreview, createScryfallHover } from '../src/table/render.js';
import { createGameState, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

/**
 * M258/A1 (audyt PR #88) — piny SYMETRYCZNEJ gałęzi `cant_be_blocked`
 * (r5b/D „Symetrycznie…" — celowany „can't be blocked" na własnym stworze,
 * np. Enter the Enigma). Gałąź dostała pełną logikę okna ataku
 * (attackingWindow + canAttack + blokerzy + lethal), ale ŻADEN test jej nie
 * pilnował: mutacja M9 (okno zawsze otwarte) przechodziła CAŁY szybki rdzeń
 * 3801/3801 (L61: „zielony" nie znaczy „pilnuje"). Istniejący pin z
 * 2026-08-16 (bot-owner-reports B) testuje wyłącznie OKNO OTWARTE.
 *
 * Piny: (1) main2 — okno zamknięte, NIE rzuca; (2) main1, stwór tapnięty —
 * atak niemożliwy, NIE rzuca; (3) main1, stwór gotowy — OKNO OTWARTE,
 * rzuca (kontrola pozytywna, żeby piny (1)/(2) nie były zielone przez
 * „nic się nie dzieje" — klasa M255/G2).
 *
 * Weryfikacja mutacyjna (L61): cofnięcie okna (M9: attackingWindow = true,
 * canAttack = true) czyni (1) i (2) CZERWONYMI.
 */

function setup({ step = 'main1', myTapped = false, enemyBlockers = 1 }) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  // Enter the Enigma w ręce ({U}, instant: cel nie może być blokowany + dobierz).
  addObject(state, {
    id: 'h0', instanceId: 'i-h0', cardId: 'enter-the-enigma', controllerId: 'p2',
    ownerId: 'p2', zone: 'hand', kind: 'spell', manaCost: 1,
    spell: {
      timing: 'instant', targets: [{ type: 'creature' }],
      effects: [{ type: 'cant_be_blocked' }, { type: 'draw_cards', amount: 1 }],
    },
    abilities: [], keywords: [], subtypes: [], types: ['Instant'], colors: ['U'],
  });
  // Własny stwór bota 3/3 (gotowy do ataku, chyba że tapnięty).
  addObject(state, {
    id: 'mine', instanceId: 'i-mine', cardId: 'x-test', controllerId: 'p2',
    ownerId: 'p2', zone: 'battlefield', kind: 'creature', power: 3, toughness: 3,
    manaCost: 0, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['U'],
  });
  state.objects.set('mine', Object.freeze({
    ...state.objects.get('mine'), tapped: myTapped, summoningSickness: false,
  }));
  // Blokerzy przeciwnika (2/2) — bez nich ewazja niczego nie odblokowuje,
  // a pin „rzucania" musiałby liczyć na samą wartość doboru karty.
  for (let i = 0; i < enemyBlockers; i += 1) {
    const id = `foe-${i}`;
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: 'x-test', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'creature', power: 2, toughness: 2,
      manaCost: 0, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['R'],
    });
    state.objects.set(id, Object.freeze({
      ...state.objects.get(id), tapped: false, summoningSickness: false,
    }));
  }
  addMana(state, 'p2', 2, { colors: ['U', 'U'] });
  return state;
}

function botCasts(state) {
  const view = playerView(state, 'p2');
  const choice = createHeuristicBot({ seed: 7 }).chooseCommand(view, {});
  return choice.type === 'cast_spell' && choice.objectId === 'h0';
}

test('A1a: main2 (po combacie) — ewazja „this turn" nic nie zmieni, bot NIE rzuca', () => {
  assert.equal(botCasts(setup({ step: 'main2' })), false,
    'cant_be_blocked w main2 to czyste marnotrawstwo (okno zamknięte, symetrycznie do D2d Ruthless Invasion)');
});

test('A1b: main1, stwór TAPNIĘTY (atak niemożliwy) — bot NIE rzuca', () => {
  assert.equal(botCasts(setup({ myTapped: true })), false,
    'ewazja stwora, który nie zaatakuje, to czyste marnotrawstwo (symetrycznie do D2c Ruthless Invasion)');
});

test('A1c (kontrola pozytywna): main1, stwór gotowy, bloker 2/2 — bot RZUCA', () => {
  assert.equal(botCasts(setup({ step: 'main1', myTapped: false, enemyBlockers: 1 })), true,
    'w otwartym oknie ewazja + dobranie na gotowym stworu to dobry ruch (anty-overfix dla A1a/A1b)');
});


// ---------------------------------------------------------------------------
// M258/A2 (audyt PR #88) — martwa opcja showCycleHint (L67/L5).
// renderHoverPreview dostał opcję „pokaż podpowiedź o scrollu" w r5/A po to,
// by hover o STAŁYM torze (miniaturki w „Rozgrywce") jej nie pokazywał — ale
// showHoverPreviewAt nie przekazywał opcji, a createScryfallHover nie podał
// `false`. Na karcie z artId podgląd obiecywał „scroll zmienia tor", którego
// nie było. Piny: domyślny hover (stół) HINT MA; stały tor (Rozgrywka)
// NIE MA — na poziomie renderHoverPreview ORAZ okablowania
// createScryfallHover (to drugie było RED przed fixem).
// ---------------------------------------------------------------------------

function withMiniDom(run) {
  class MiniEl {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.listeners = {};
      this.className = ''; this.text = ''; this.dataset = {}; this.disabled = false;
      this.style = {};
      this.classList = { toggle: () => {}, add: () => {}, remove: () => {} };
    }
    set textContent(v) { this.text = String(v); this.children = []; }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
    appendChild(c) { this.children.push(c); return c; }
    replaceChildren(...n) { this.children = n.flat(); }
    addEventListener(t, l) { (this.listeners[t] ??= []).push(l); }
    click() { for (const l of this.listeners.click ?? []) l({}); }
    fire(type, e = {}) { for (const l of this.listeners[type] ?? []) l(e); }
    all() { return [this, ...this.children.flatMap((c) => (c.all ? c.all() : [c]))]; }
    find(pred) { return this.all().find(pred); }
    findAll(pred) { return this.all().filter(pred); }
  }
  globalThis.document = globalThis.document ?? {};
  const old = globalThis.document.createElement;
  globalThis.document.createElement = (tag) => new MiniEl(tag);
  try { return run(new MiniEl('div')); } finally {
    if (old) globalThis.document.createElement = old; else delete globalThis.document.createElement;
  }
}

// Karta z lokalnym artId (FOT/KON istnieją) — TYLKO taka pokazuje hint.
const ART_INFO = {
  name: 'Island', artId: 42, imageUri: 'https://cards.scryfall.io/large/front/x.jpg?1',
  set: 'XYZ', colors: ['U'], types: ['Basic Land', 'Island'],
};

test('A2a: renderHoverPreview domyślnie (stół) pokazuje podpowiedź o scrollu (karta z artId)', () => {
  withMiniDom((host) => {
    renderHoverPreview(host, ART_INFO, 'scryfall');
    const modeLine = host.find((n) => String(n.className).includes('hover-mode'));
    assert.ok(modeLine, 'linia toru wyrenderowana');
    assert.match(modeLine.textContent, /scroll zmienia tor/,
      'domyślny hover (stół) cykluje scrollem — hint jest prawdziwy');
  });
});

test('A2b: renderHoverPreview z showCycleHint: false — tor stały bez podpowiedzi', () => {
  withMiniDom((host) => {
    renderHoverPreview(host, ART_INFO, 'scryfall', { showCycleHint: false });
    const modeLine = host.find((n) => String(n.className).includes('hover-mode'));
    assert.ok(modeLine, 'linia toru wyrenderowana');
    assert.doesNotMatch(modeLine.textContent, /scroll zmienia tor/,
      'tor stały nie cykluje — podpowiedź byłaby kłamliwa');
  });
});

test('A2c (okablowanie): createScryfallHover (miniaturki „Rozgrywka”) NIE pokazuje podpowiedzi', () => {
  withMiniDom((host) => {
    const hover = createScryfallHover({ hoverPreview: host });
    assert.ok(hover, 'na desktopie hover istnieje');
    hover.start(ART_INFO, { clientX: 10, clientY: 20 });
    const modeLine = host.find((n) => String(n.className).includes('hover-mode'));
    assert.ok(modeLine, 'podgląd wyrenderowany przez start()');
    assert.doesNotMatch(modeLine.textContent, /scroll zmienia tor/,
      'M258/A2: okablowanie stałego toru nie może obiecywać cyklowania scrollem');
  });
});
