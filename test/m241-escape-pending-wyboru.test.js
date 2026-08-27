// M241 — zgłoszenia J2/L (+ J/K mechanika): Escape jako decyzja PENDING.
//
// Problem (właściciel): rzut przez Escape dawał modal „Ucieczka (Escape) —
// karty do wygnania (80+ opcji)” — enumerację podzbiorów × cele, a cel
// czaru z celem (Sleep of the Dead — tap, Sweet Oblivion — mill 4) był
// WSZYTY w enumerowanej komendzie (pierwsza z brzegu kombinacja) —
// gracz nigdy nie wybrał celu, a Sweet Oblivion millował gracza (self).
//
// Docelowo (jak „dobrze zakodowane czary tego typu”, wg właściciela):
// 1) cast_escape(objectId, targets) — deklaracja + JAWNY cel (jak zwykłe czary);
// 2) silnik kolejkuje pendingEscapeExile z LISTĄ KANDYDATÓW (bez pendingu
//    nic nielegalne — inne komendy odrzucane);
// 3) resolve_escape_exile { exileIds } zamyka koszt — wała kartę na stos.
// Dowolnego, legalnego podzbioru N z własnego grobu, NIE z listy jail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { addObject } from '../src/engine/game-state.js';

const REGISTRY = createCardRegistry();

function game({ escapeCard = 'sleep-of-the-dead', graveSize = 9, withCreature = true } = {}) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 20);
  for (const pid of ['p1', 'p2']) addMana(state, pid, 20, { U: 4, G: 4, B: 4, R: 4, W: 4 });
  addMana(state, 'p1', 20 - 0); // wystarczająco
  const spellDef = REGISTRY.get(escapeCard);
  addObject(state, {
    id: 'esc', instanceId: 'i-esc', cardId: escapeCard, controllerId: 'p1', ownerId: 'p1',
    zone: 'graveyard', kind: 'spell', types: ['Sorcery'], colors: spellDef.colors, manaCost: spellDef.manaCost,
    spell: spellDef.spell,
  });
  for (let i = 0; i < graveSize; i += 1) {
    addObject(state, {
      id: `g${i}`, instanceId: `i-g${i}`, cardId: 'goblin-piker', controllerId: 'p1', ownerId: 'p1',
      zone: 'graveyard', kind: 'creature', types: ['Creature'], colors: ['R'], power: 2, toughness: 1,
    });
  }
  if (withCreature) {
    addObject(state, {
      id: 'victim', instanceId: 'i-victim', cardId: 'goblin-piker', controllerId: 'p2', ownerId: 'p2',
      zone: 'battlefield', kind: 'creature', power: 2, toughness: 1, abilities: [], subtypes: [],
      types: ['Creature'], colors: ['R'],
    });
  }
  return state;
}

test('M241/1: cast_escape NIE mnoży opcji (jedna na kombinację celów), bez escapeExileIds', () => {
  const state = game({ escapeCard: 'sleep-of-the-dead' });
  const casts = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'cast_escape');
  const targets = playerView(state, 'p1').zones.battlefield.filter((o) => o.controllerId === 'p2' && o.kind === 'creature');
  assert.ok(targets.length >= 1, 'istnieje cel stwora');
  assert.equal(casts.length, targets.length, `oferty 1:1 z celami (nie z podzbiorami): ${casts.length}`);
  assert.ok(casts.every((c) => c.escapeExileIds === undefined || c.escapeExileIds.length === 0), 'bez podzbiorów w komendzie rzutu');
  assert.ok(casts.every((c) => (c.targets ?? []).length === 1), 'cel JAWNY w komendzie (J2/L)');
});

test('M241/2: bez celu czarniejszy self-mill był domyślny — teraz gracz MUSI wskazać cel (J2/L)', () => {
  const state = game({ escapeCard: 'sweet-oblivion', withCreature: false });
  const casts = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'cast_escape');
  assert.ok(casts.length >= 2, 'obaj gracze legalnymi celami mill');
  const selfFirst = casts[0];
  assert.ok(casts.some((c) => c.targets?.[0] === 'p1') && casts.some((c) => c.targets?.[0] === 'p2'),
    `dostępne oba cele do wyboru, nie „pierwsza z brzegu”: ${JSON.stringify(casts.map((c) => c.targets))}`);
  assert.ok(selfFirst.escapeExileIds === undefined || selfFirst.escapeExileIds.length === 0, 'bez pre-baked zakresu wygnania');
});

test('M241/3: cast_escape stawia pendingEscapeExile, inne komendy odrzucane, resolve zamyka rzut na stos', () => {
  const state = game({ escapeCard: 'sleep-of-the-dead' });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_escape' && c.targets?.[0] === 'victim');
  assert.ok(cast, 'deklaracja z celem');
  const r1 = execute(state, cast);
  assert.ok(r1.ok, JSON.stringify(r1.events));
  assert.ok(state.pendingEscapeExile, 'kolejkuje decyzję wygnania');
  assert.ok(!state.zones.stack.length, 'czar NIE jest jeszcze na stosie (koszt niedokończony — CR 601.2h)');
  const bad = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(bad.ok, false, 'pass w trakcie zaległego wyboru wygnania zabroniony');
  const exileCmd = { type: 'resolve_escape_exile', playerId: 'p1', exileIds: ['g0', 'g1', 'g2'] };
  const offered = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_escape_exile');
  assert.ok(offered.length > 0, 'oferta resolve_escape_exile');
  const r2 = execute(state, exileCmd);
  assert.ok(r2.ok, JSON.stringify(r2.events));
  assert.equal(state.pendingEscapeExile, null, 'pending wyczyszczony po decyzji');
  assert.ok(state.zones.stack.length >= 1, 'czar wszedł na stos dopiero po zapłacie kosztu');
  const exileCount = state.zones.exile.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(exileCount, 3, 'dokładnie 3 karty p1 w exile (skutek)');
  assert.ok(!['g0', 'g1', 'g2'].some((id) => state.zones.graveyard.includes(id) || state.zones.hand.includes(id)),
    'wybrane karty zniknęły z grobu');
});

test('M241/4: walidacja kosztu wygnania Escape', () => {
  const state = game({ escapeCard: 'sleep-of-the-dead' });
  execute(state, playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_escape' && c.targets?.[0] === 'victim'));
  const tries = [
    { exileIds: ['g0', 'g1'], note: 'za mało' },
    { exileIds: ['g0', 'g0', 'g1'], note: 'duplikat' },
    { exileIds: ['esc', 'g0', 'g1'], note: 'sam czar („other cards”, CR 702.138a)' },
  ];
  for (const attempt of tries) {
    const r = execute(state, { type: 'resolve_escape_exile', playerId: 'p1', ...attempt });
    assert.equal(r.ok, false, `${attempt.note}: ${JSON.stringify(r.events)}`);
  }
  const r = execute(state, { type: 'resolve_escape_exile', playerId: 'p1', exileIds: ['g0', 'g1', 'g2'] });
  assert.ok(r.ok);
});

// =============================================================================
// M241 — warstwa UI: grupowanie ofert, widok pendingu, wizard multiselect.
// =============================================================================
import { choiceRequestGroupKey, commandLabel } from '../src/table/render.js';

test('M241/5: warianty CELU jednej karty Escape → JEDNA grupa (jedna linia w panelu)', () => {
  const spell = { type: 'cast_escape', playerId: 'p1', objectId: 'esc', targets: ['t1'] };
  const other = { type: 'cast_escape', playerId: 'p1', objectId: 'esc', targets: ['t2'] };
  assert.equal(choiceRequestGroupKey(spell), choiceRequestGroupKey(other),
    'cele tego samego czaru = jedna linia (nazwana po KARCIE), a nie podwójny panel');
});

test('M241/6: dwie różne karty Escape → DWIE grupy (każda nazwana kartą)', () => {
  const a = { type: 'cast_escape', playerId: 'p1', objectId: 'escA', targets: [] };
  const b = { type: 'cast_escape', playerId: 'p1', objectId: 'escB', targets: [] };
  assert.notEqual(choiceRequestGroupKey(a), choiceRequestGroupKey(b));
});

test('M241/7: widok niesie pendingEscapeExile z kandydatami (do wizarda multiselect)', () => {
  const state = game({ escapeCard: 'sleep-of-the-dead' });
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_escape' && c.targets?.[0] === 'victim'));
  const view = playerView(state, 'p1');
  assert.ok(view.pendingEscapeExile, 'widok decydenta niesie pending Escape');
  assert.equal(view.pendingEscapeExile.sourceCardId, 'sleep-of-the-dead', 'nazwa źródła w widoku');
  assert.equal(view.pendingEscapeExile.exileCount, 3, 'liczba z Oracle');
  assert.ok(Array.isArray(view.pendingEscapeExile.candidateIds) && view.pendingEscapeExile.candidateIds.length === 9,
    'pełna lista kandydatów do wygnania (9 kart w tym potrzebie)');
  // A przeciwnik nie widzi listy (foW):
  const other = playerView(state, 'p2');
  assert.ok(other.pendingEscapeExile === null || other.pendingEscapeExile?.candidateIds == null,
    'przeciwnik nie podgląda ręki-grobu: pending bez listy kandydatów');
});

test('M241/8: log/„Rozgrywka” opisują koszt Escape z nazwą czaru', () => {
  const { describeGameEvent } = globalThis.__m241 ?? {};
  return import('../src/table/session.js').then(({ describeGameEvent: d }) => {
    const HELPERS = {
      nameOf: (id) => id === 'sleep-of-the-dead' ? 'Sleep of the Dead' : id,
      nameOfObject: () => '?',
      cardIdByName: () => null,
      effectiveKeywordsOf: () => [],
      isPlayer: () => false,
      controllerOf: () => null,
    };
    const req = d({ type: 'escape_exile_required', playerId: 'p1', cardId: 'sleep-of-the-dead', exileCount: 3, candidateIds: ['g0'] }, HELPERS);
    assert.ok(req, 'opis chokegu');
    assert.match(req, /Sleep of the Dead/, `nazwa czaru: ${req}`);
    assert.match(req, /3/, `liczba: ${req}`);
    const res = d({ type: 'escape_exile_resolved', playerId: 'p1', cardId: 'sleep-of-the-dead', exileIds: ['g0', 'g1', 'g2'] }, HELPERS);
    // Uwaga D: object_moved (escape) już nazywał przeniesione karty — resolved
    // nie może wypaść drugą linią o tym samym (świadome pominięcie).
    assert.equal(res, null, 'resolved jest dubletem przeniesień (Uwaga D)');
  });
});

// =============================================================================
// M241 — wizard „wygnij N kart z własnego grobu” (multiselect + Zatwierdź).
// =============================================================================
import { renderEscapeExileWizard } from '../src/table/choice-request.js';

class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {};
    this.className = ''; this.text = ''; this.html = ''; this.type = '';
    this.checked = false; this.disabled = false; this.dataset = {};
  }
  set textContent(v) { this.text = String(v); this.html = ''; this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.html = String(v); this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
  get innerHTML() { return (this.html ? this.html : this.text) + this.children.map((c) => c.innerHTML).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren(...n) { this.children = n.flat(); }
  addEventListener(type, l) { (this.listeners[type] ??= []).push(l); }
  click() { for (const l of this.listeners.click ?? []) l({}); }
}
globalThis.document = { createElement: (t2) => new MiniEl(t2) };

const CANDS = Array.from({ length: 6 }, (_, i) => ({ id: `g${i}`, cardId: `c${i}`, name: `Karta ${i}` }));

function *walk(host) {
  yield host;
  for (const c of host.children ?? []) yield *walk(c);
}

function findBtn(host, prefix) {
  for (const el of walk(host)) {
    if (el.tagName === 'button' && (el.textContent ?? '').includes(prefix)) return el;
  }
  return null;
}

/** Znajdź checkbox kandydata i przełącz go (jest jak intencja kliku w wiersz). */
function toggleCandidate(host, name) {
  for (const el of walk(host)) {
    if (el.tagName === 'label' && (el.textContent ?? '').includes(name)) {
      const input = (el.children ?? []).find((c) => c.tagName === 'input');
      if (!input) return false;
      input.checked = !input.checked;
      for (const l of input.listeners.change ?? []) l({});
      return true;
    }
  }
  return false;
}

test('M241/9: wizard ucieczki — „Zatwierdź” zamknięte dopóki nie wybrano DOKŁADNIE N kart', () => {
  const host = new MiniEl('div');
  const got = [];
  renderEscapeExileWizard(host, {
    candidates: CANDS, exileCount: 3, sourceName: 'Sleep of the Dead', manaCost: 3,
    onComplete: (exileIds) => got.push(exileIds),
  });
  assert.match(host.textContent, /Sleep of the Dead/, `nagłówek nazywa czar: ${host.textContent}`);
  assert.match(host.textContent, /3/, `licznik N w treści: ${host.textContent}`);
  const ok = findBtn(host, 'Zatwierdź');
  assert.ok(ok, 'jest przycisk Zatwierdź');
  assert.equal(ok.disabled, true, '0/3 wybranych → zatwierdzenie zablokowane');
  // ptaszkujemy 2 karty — nadal zablokowane
  for (const i of [1, 2]) assert.ok(toggleCandidate(host, `Karta ${i}`), `wiersz kandydata ${i}`);
  const ok2 = findBtn(host, 'Zatwierdź') ?? ok;
  assert.equal(findBtn(host, 'Zatwierdź').disabled, true, '2/3 → zatwierdzenie nadal zablokowane');
  void ok2;
  // dobiega trzecia → odblokowane
  assert.ok(toggleCandidate(host, 'Karta 3'));
  assert.equal(findBtn(host, 'Zatwierdź').disabled, false, '3/3 → zatwierdzenie wolne');
  findBtn(host, 'Zatwierdź').click();
  assert.deepEqual([...got[0]].sort(), ['g1', 'g2', 'g3'], `komenda skomponowana z ticków, nie z enumeracji: ${JSON.stringify(got)}`);
});

test('M241/9b: wizard ucieczki — od-tickowanie zdejmuje kartę (błąd wyboru odwracalny)', () => {
  const host = new MiniEl('div');
  const got = [];
  renderEscapeExileWizard(host, {
    candidates: CANDS, exileCount: 2, sourceName: 'Sweet Oblivion', manaCost: 4,
    onComplete: (exileIds) => got.push(exileIds),
  });
  assert.ok(toggleCandidate(host, 'Karta 0'));
  assert.ok(toggleCandidate(host, 'Karta 1'));
  assert.ok(toggleCandidate(host, 'Karta 1')); // od-tick
  assert.equal(findBtn(host, 'Zatwierdź').disabled, true, 'po od-ticku z powrotem 1/2 → blokuje');
  assert.ok(toggleCandidate(host, 'Karta 5'));
  findBtn(host, 'Zatwierdź').click();
  assert.deepEqual([...got[0]].sort(), ['g0', 'g5']);
});
