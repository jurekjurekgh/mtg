// Audyt PR #185, F-6 (Etap E2.6) — Bladewheel Chariot: warstwa UI kosztu
// „Tap two other untapped artifacts you control".
//
// Pomiar audytu (stan 5df0e96): wpis tyłu TDFC miał `abilities: []`, więc po
// poprawnie rozliczonym craft obiekt tyłu niósł zero zdolności i zero ofert —
// Vehicle 5/5 nigdy nie stawał się stworem (CR 702.122a). Przy okazji wyszła
// MARTWA etykieta keywordu `crew` dodana w tym samym PR (L29: `MAPA[key] ?? key`
// jest cichą dziurą, nie fallbackiem) — pomiar 2026-11-15: 39 kluczy
// `KEYWORD_LABELS`, 5 bez desygnatu w katalogu (`intimidate`, `fabricate`,
// `megamorph`, `disguise`, `crew`), z czego `crew` był jedynym dodanym w PR #185.
//
// Kardynalna zasada właściciela (uwaga C1, 2026-09-19): ŻADNEJ enumeracji
// wariantów — jeden przycisk „Aktywuj", po kliknięciu uniwersalny modal wyboru.
// Dla STAŁEJ liczby artefaktów (Bladewheel) modal nie ma steppera X: gracz
// zaznacza dokładnie N wierszy. Kontrakt jak `crewMode`/`tapXMode`: warstwa
// czysta buduje plan i komendę, silnik re-waliduje przy aktywacji (L48).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tapOtherArtifactsPlanFor, commandForTapXSelection } from '../src/table/multi-target.js';
import { renderMultiTargetWizard } from '../src/table/choice-request.js';
import { commandLabel, KEYWORD_LABELS, activationAlreadyAppliedWarning } from '../src/table/render.js';
import { createCardRegistry } from '../src/cards/card-data.js';

const REGISTRY = createCardRegistry();

// --- harness DOM (wzór: uwagi-z-testow-c1-dockhand-kreator-x) -----------------

class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {};
    this.className = ''; this.text = ''; this.type = ''; this.checked = false;
    this.disabled = false; this.name = ''; this.dataset = {};
  }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...nodes) { this.children = nodes.flat(); }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  click() { for (const l of this.listeners.click ?? []) l({ preventDefault() {}, stopPropagation() {} }); }
  emit(type) { for (const l of this.listeners[type] ?? []) l({}); }
  all(pred, out = []) { if (pred(this)) out.push(this); for (const c of this.children) c.all(pred, out); return out; }
  byClass(cls) { return this.all((el) => String(el.className).split(/\s+/).includes(cls)); }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };

// Pole bitwy: tył TDFC po craft + dwa inne własne artefakty + artefakt
// przeciwnika i tapnięty własny (oba poza pulą kosztu).
const BATTLEFIELD = [
  { id: 'chariot', cardId: 'bladewheel-chariot', controllerId: 'p1', kind: 'artifact', tapped: false },
  { id: 'a0', cardId: 'angels-feather', controllerId: 'p1', kind: 'artifact', tapped: false },
  { id: 'a1', cardId: 'angels-feather', controllerId: 'p1', kind: 'artifact', tapped: false },
  { id: 'a2', cardId: 'angels-feather', controllerId: 'p1', kind: 'artifact', tapped: true },
  { id: 'foe', cardId: 'angels-feather', controllerId: 'p2', kind: 'artifact', tapped: false },
  { id: 'guide', cardId: 'river-herald-guide', controllerId: 'p1', kind: 'creature', tapped: false },
];
const VIEW = {
  playerId: 'p1',
  players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
  zones: { battlefield: BATTLEFIELD, hand: [], graveyard: [], exile: [], stack: [] },
};
const SESSION = {
  nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
  nameOfObject: (o) => REGISTRY.get(o?.cardId)?.name ?? o?.id ?? '?',
  cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
  abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? [],
};

/** Oferta silnika: JEDEN wariant z domyślnym podzbiorem (wzór crew, A2/A3). */
const OFERTA = {
  type: 'activate_ability', playerId: 'p1', objectId: 'chariot', abilityIndex: 0,
  tapArtifactIds: ['a0', 'a1'],
};

function planOf(cmd = OFERTA, { needed = 2, playerId = 'p1', battlefield = BATTLEFIELD } = {}) {
  return tapOtherArtifactsPlanFor({ cmd, playerId, needed, battlefield });
}

// --- plan kreatora -----------------------------------------------------------

test('F-6/U1: plan stałej liczby — tryb tapX bez steppera X, dokładnie N wierszy', () => {
  const plan = planOf();
  assert.ok(plan?.tapXMode, 'ten sam tryb kreatora co „Tap X artefaktów"');
  assert.equal(plan.hasX, false, 'stała liczba z deskryptora: gracz nie wybiera X');
  assert.equal(plan.tapFixedCount, 2, 'N = 2 (Oracle: „Tap two other untapped artifacts")');
  assert.equal(plan.minTargets, 2, 'bramka dolna = N');
  assert.equal(plan.maxTargets, 2, 'bramka górna = N (nie „do X")');
  assert.deepEqual(plan.targets, ['a0', 'a1'],
    'pula = inne własne nietapnięte artefakty (bez źródła, bez tapniętego, bez cudzego, bez stwora)');
  assert.equal(plan.objectId, 'chariot');
  assert.equal(plan.abilityIndex, 0);
  assert.equal(plan.playerId, 'p1');
  assert.equal(plan.itemLabel, 'artefakty');
});

test('F-6/U2: plan odrzuca obce kształty (nic nie podszywa się pod kreator)', () => {
  assert.equal(planOf({ type: 'cast_spell', objectId: 'chariot', abilityIndex: 0, tapArtifactIds: ['a0', 'a1'] }), null,
    'nie activate_ability');
  assert.equal(planOf({ type: 'activate_ability', playerId: 'p1', objectId: 'chariot', abilityIndex: 0 }), null,
    'komenda bez tapArtifactIds (np. crew) nie jest tym kreatorem');
  assert.equal(planOf({ ...OFERTA, crewCreatureIds: ['guide'] }), null, 'crew ma własny kreator');
  assert.equal(planOf(OFERTA, { playerId: 'p2' }), null, 'obcy gracz');
  assert.equal(planOf(OFERTA, { needed: 3 }), null, 'pula mniejsza niż N — koszt niezapłacalny (CR 118.3)');
  assert.equal(planOf(OFERTA, { needed: 0 }), null, 'N musi być dodatnie');
  assert.equal(planOf(OFERTA, { needed: null }), null, 'brak progu z deskryptora');
  assert.equal(planOf(OFERTA, { battlefield: [] }), null, 'puste pole bitwy');
});

// --- komenda z zaznaczenia ---------------------------------------------------

test('F-6/U3: komenda z zaznaczenia — dokładnie N artefaktów, bez xValue', () => {
  const plan = planOf();
  assert.deepEqual(commandForTapXSelection(plan, ['a0', 'a1'], null), {
    type: 'activate_ability', playerId: 'p1', objectId: 'chariot', abilityIndex: 0,
    tapArtifactIds: ['a0', 'a1'],
  }, 'kształt identyczny z ofertą silnika (silnik i tak re-waliduje, L48)');
  assert.deepEqual(commandForTapXSelection(plan, ['a1', 'a0'], null).tapArtifactIds, ['a1', 'a0'],
    'kolejność zaznaczenia zachowana');
});

test('F-6/U4: bramka stałej liczby — za mało, za dużo, dublet, obcy id, pusty wybór', () => {
  const plan = planOf();
  assert.equal(commandForTapXSelection(plan, ['a0'], null), null, 'za mało zaznaczeń');
  assert.equal(commandForTapXSelection(plan, [], null), null, 'pusty wybór (stała liczba ≥ 1)');
  assert.equal(commandForTapXSelection(plan, ['a0', 'a0'], null), null, 'dublet');
  assert.equal(commandForTapXSelection(plan, ['a0', 'a2'], null), null, 'artefakt spoza puli (tapnięty)');
  assert.equal(commandForTapXSelection(plan, ['a0', 'foe'], null), null, 'artefakt spoza puli (przeciwnika)');
  assert.equal(commandForTapXSelection(plan, ['a0', 'chariot'], null), null, 'źródło nie jest „other"');
  assert.equal(commandForTapXSelection(plan, ['a0', 'guide'], null), null, 'stwór nie jest artefaktem');
  assert.equal(commandForTapXSelection(plan, 'a0', null), null, 'nie-lista');
  assert.equal(commandForTapXSelection(null, ['a0', 'a1'], null), null, 'brak planu');
});

// --- DOM kreatora ------------------------------------------------------------

function renderWizard({ onComplete = () => {}, onCancel = () => {} } = {}) {
  const plan = planOf();
  assert.ok(plan, 'plan kreatora');
  const host = new MiniEl('div');
  renderMultiTargetWizard(host, {
    view: VIEW, session: SESSION, plan, commands: [OFERTA],
    intro: 'Aktywuj: Bladewheel Chariot — zaznacz dwa artefakty do tapnięcia:',
    onOpenCard: () => {}, onComplete, onCancel,
  });
  return host;
}

test('F-6/U5: kreator stałej liczby nie ma steppera X, ma wiersz na każdy artefakt puli', () => {
  const host = renderWizard();
  assert.equal(host.byClass('multi-target-x').length, 0, 'bez steppera X — liczba jest stała');
  assert.equal(host.byClass('multi-target-toggle').length, 2, 'wiersz na każdy artefakt puli (a0, a1)');
  assert.equal(host.byClass('multi-target-confirm')[0].disabled, true, 'start: nic nie zaznaczone — bramka N');
});

test('F-6/U6: pełny przepływ — dwa zaznaczenia odblokowują Zatwierdź i niosą komendę', () => {
  let completed = null;
  const host = renderWizard({ onComplete: (cmd) => { completed = cmd; } });
  const confirm = () => host.byClass('multi-target-confirm')[0];
  const status = () => host.byClass('multi-target-status')[0].textContent;
  const toggles = host.byClass('multi-target-toggle');
  toggles[0].checked = true; toggles[0].emit('change');
  assert.equal(confirm().disabled, true, 'jedno z dwóch — brak');
  assert.match(status(), /2/, 'status nazywa wymaganą liczbę');
  toggles[1].checked = true; toggles[1].emit('change');
  assert.equal(confirm().disabled, false, 'dokładnie dwa — gotowe');
  confirm().click();
  assert.deepEqual(completed, {
    type: 'activate_ability', playerId: 'p1', objectId: 'chariot', abilityIndex: 0,
    tapArtifactIds: ['a0', 'a1'],
  });
});

test('F-6/U7: odznaczenie po zatwierdzeniu bramki gasi przycisk (bramka liczy stan, nie historię)', () => {
  const host = renderWizard();
  const confirm = () => host.byClass('multi-target-confirm')[0];
  const toggles = host.byClass('multi-target-toggle');
  for (const toggle of toggles) { toggle.checked = true; toggle.emit('change'); }
  assert.equal(confirm().disabled, false);
  toggles[1].checked = false; toggles[1].emit('change');
  assert.equal(confirm().disabled, true, 'jedno zaznaczenie = wybór niekompletny');
});

// --- etykiety (L29: brak surowych slugów na ekranie) -------------------------

test('F-6/U8: etykieta akcji nazywa koszt po polsku i nie wycieka slugiem deskryptora', () => {
  const label = commandLabel(OFERTA, SESSION, VIEW);
  assert.match(label, /tapnij 2 inne swoje nietapnięte artefakty/, `etykieta: ${label}`);
  assert.doesNotMatch(label, /tapOtherArtifacts/, `slug w etykiecie: ${label}`);
  assert.doesNotMatch(label, /animate_permanent_until_end_of_turn/, `slug efektu w etykiecie: ${label}`);
});

test('F-6/U9: Crew 1 nadal czyta się z kosztu, a martwa etykieta keywordu `crew` zniknęła', () => {
  const crewCmd = { type: 'activate_ability', playerId: 'p1', objectId: 'chariot', abilityIndex: 1, crewCreatureIds: ['guide'] };
  const label = commandLabel(crewCmd, SESSION, VIEW);
  assert.match(label, /załoga 1|Obsadź/, `Crew z deskryptora kosztu: ${label}`);
  assert.doesNotMatch(label, /crewPower/, `slug kosztu w etykiecie: ${label}`);
  assert.equal(KEYWORD_LABELS.crew, undefined,
    'decyzja F-6: etykieta bez desygnatu usunięta (pomiar: żadna karta nie niesie keywordu `crew`)');
});

test('F-6/U10: ostrzeżenie o powtórzonej animacji działa też dla kosztu tapu artefaktów (wzór M230)', () => {
  const ability = REGISTRY.get('bladewheel-chariot').abilities[0];
  const viewWith = (subject) => ({ playerId: 'p1', zones: { battlefield: [{ id: 'chariot', cardId: 'bladewheel-chariot', controllerId: 'p1', ...subject }] } });
  const juz = activationAlreadyAppliedWarning(ability, viewWith({ animatedUntilEOT: true }), 'chariot');
  assert.match(juz, /już .*do końca tury/, `ostrzeżenie dla animowanego pojazdu: ${juz}`);
  assert.match(juz, /przepadnie/, 'ostrzeżenie mówi o przepadającym koszcie');
  assert.equal(activationAlreadyAppliedWarning(ability, viewWith({ animatedUntilEOT: false }), 'chariot'), '',
    'pojazd jeszcze nie animowany — bez ostrzeżenia');
  // Crew (druga zdolność tyłu) trzyma DOTYCHCZASOWE wymaganie `crewed`.
  const crew = REGISTRY.get('bladewheel-chariot').abilities[1];
  assert.match(activationAlreadyAppliedWarning(crew, viewWith({ crewed: true, animatedUntilEOT: true }), 'chariot'),
    /obsadzony/, 'ostrzeżenie crew bez zmian');
});
