// Zgłoszenie V (właściciel, 2026-11-09, z gry): Weftblade Enhancer — „When this
// creature enters, put a +1/+1 counter on each of up to two target creatures".
// Modal otwiera się, ale DWÓCH celów nie da się zatwierdzić. „To wygląda jak
// powrót błędu z enumeracją... O CO CHODZI???? REGRESJA?????"
//
// POMIAR (sonda .arena/probe-weftblade.mjs, 7 kandydatów):
//   warianty silnika: 9 = [para zachłanna], 7 singletonów, [pusto]  (ziarna)
//   plan kreatora:    targets 7, min 0, max 2   — poprawny
//   par do wyboru:    21, z komendą: 1         — 20/21 gaśnie „Zatwierdź"
//   execute pary [mine0,mine2]: OK — silnik WALIDUJE dowolny podzbiór,
//   tylko go nie publikuje.
//
// Przyczyna: PR #179 (7a18659, „G, etap 2") zamienił pełną enumerację podzbiorów
// na ZIARNA, żeby nie liczyć C(n,k). Kreator oddaje wyłącznie komendę
// znalezioną w legalCommands (L48), więc dla każdej pary poza pierwszą
// zachłanną nie było czego oddać. Silnik ma pełną walidację w execute —
// brakowało tylko JEDNEJ reguły: „kreator może zbudować dowolny legalny
// podzbiór z szablonu, a execute go przyjmie, bo sam go sprawdza".
//
// Kontrakt po:
//  - oferta silnika zostaje na ZIARNACH (bez enumeracji — PR #179 zostaje),
//  - kreator buduje z szablonu grupy komendę dla DOWOLNEGO zbioru, który
//    gracz wskaże (jedna reguła: `builtTargetSetCommand`),
//  - execute przyjmuje każdy LEGALNY podzbiór (rozmiar ≤ count, zero tylko
//    przy upTo, kandydaci z listy) — bez żadnych znaczników, bo taki jest
//    kontrakt silnika (pin E/4 `zgloszenie-e-inferno-podzial`); próba
//    bramkowania znacznikiem `constructedTargetSet` łamała E/4 i została
//    zmierzona jako regresja,
//  - nielegalny rozmiar/cudzy kandydat nadal odrzucane (CR 601.2c/608.2b).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { renderMultiTargetWizard } from '../src/table/choice-request.js';
import { upToTargetsPlanOf, commandForTargetIdsSelection, proliferatePlanOf } from '../src/table/multi-target.js';

// Moduł budowy komendy dla zbiorów zbudowanych jest CZĘŚCIĄ naprawy — pin
// czerwienieje na OBJAWIE (brak komendy do oddania), nie na braku importu.
async function api() {
  try { return await import('../src/table/target-set-commands.js'); } catch { return null; }
}

/**
 * Komenda dla dokładnie tego zbioru — tą samą drogą, którą idzie kreator:
 * najpierw oferta silnika (L48), potem build ze znacznikiem (nowa ścieżka).
 * `null` = „Zatwierdź" nie ma czego oddać (objaw zgłoszenia V).
 */
function commandForSet(options, ids, type, mod) {
  const offered = commandForTargetIdsSelection(options, ids, { type });
  if (offered) return offered;
  return mod?.builtTargetSetCommand ? mod.builtTargetSetCommand(options, ids, { type }) : null;
}

const REGISTRY = createCardRegistry();

function stol({ stwory = 6, karta = 'weftblade-enhancer' } = {}) {
  const state = createGameState({ seed: 909, players: [{ id: 'p1' }, { id: 'p2' }] });
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
  for (let i = 0; i < 7; i += 1) put(`plains${i}`, 'basic-plains', 'battlefield');
  for (let i = 0; i < stwory; i += 1) put(`mine${i}`, 'goblin-piker', 'battlefield');
  for (let i = 0; i < 8; i += 1) put(`lib${i}`, 'basic-swamp', 'library');
  put('weft', karta, 'hand');
  return { state, put };
}

/** Rzuca Weftblade i doprowadza do decyzji triggera. */
function decyzjaTriggera({ stwory = 6 } = {}) {
  const s = stol({ stwory });
  addMana(s.state, 'p1', 6, { colors: ['W'] });
  const cast = playerView(s.state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'weft');
  assert.ok(cast, 'setup: oferta rzutu Weftblade Enhancer');
  execute(s.state, cast);
  for (let i = 0; i < 12 && !s.state.pendingTriggerTargets?.length
    && s.state.zones.stack.length > 0; i += 1) {
    execute(s.state, { type: 'pass_priority', playerId: s.state.turn.priorityPlayerId });
  }
  const view = playerView(s.state, 'p1');
  const session = {
    nameOf: (id) => REGISTRY.get(id)?.name ?? id,
    cardDetails: (id) => REGISTRY.get(id) ?? null,
    state: s.state,
  };
  const options = view.legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  return { ...s, view, session, options };
}

function pary(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) out.push([ids[i], ids[j]]);
  return out;
}

function liczbaZwrotow(s) {
  return s.state.objects.get('weft')?.counters?.['+1/+1'] ?? null;
}

test('V/1: każda para celów ma komendę do oddania (7 kandydatów = 21 par)', async () => {
  const mod = await api();
  const s = decyzjaTriggera();
  const kandydaci = s.view.pendingTriggerTarget.candidateIds;
  assert.equal(kandydaci.length, 7, 'siedem stworów na polu (6 istniejących + Weftblade)');
  const wszystkie = pary(kandydaci);
  assert.equal(wszystkie.length, 21);
  const bezKomendy = wszystkie.filter((p) => !commandForSet(s.options, p, 'resolve_trigger_target', mod));
  assert.deepEqual(bezKomendy, [],
    `każda para ma komendę (Zatwierdź aktywny); bez komendy: ${bezKomendy.length}/21`);
});

test('V/2: komenda zbudowana dla pary jest przyjmowana przez silnik i kładzie dwa liczniki', async () => {
  const mod = await api();
  const s = decyzjaTriggera();
  const kandydaci = s.view.pendingTriggerTarget.candidateIds;
  // Para SPOZA ziarna silnika (zachłanne to pierwsze dwa w kolejności polityki).
  const para = [kandydaci[0], kandydaci[3]];
  assert.ok(!s.options.some((c) => Array.isArray(c.targetIds)
    && [...c.targetIds].sort().join('|') === [...para].sort().join('|')),
    'setup: ta para nie jest publikowanym ziarnem');
  const cmd = commandForSet(s.options, para, 'resolve_trigger_target', mod);
  assert.ok(cmd, 'kreator ma komendę dla pary');
  // Dowód, że kreator ZBUDOWAŁ komendę, a nie znalazł jej w ofercie: nie ma
  // jej wśród wariantów silnika, a mimo to jest oddawana i przechodzi execute.
  assert.ok(!s.options.includes(cmd), 'komenda nie pochodzi wprost z oferty (jest zbudowana)');
  const res = execute(s.state, cmd);
  assert.equal(res.ok, true, `silnik przyjmuje zbudowany zbiór: ${JSON.stringify(res.events?.[0] ?? {})}`);
  // Wybór celów kładzie zdolność na STOS (CR 603.3) — liczniki pojawiają się
  // dopiero po rozstrzygnięciu; przechodzimy przez priorytety jak w grze.
  for (let i = 0; i < 20 && s.state.zones.stack.length > 0; i += 1) {
    execute(s.state, { type: 'pass_priority', playerId: s.state.turn.priorityPlayerId });
  }
  const cel = (id) => s.state.objects.get(id)?.counters?.['+1/+1'] ?? 0;
  assert.equal(cel(para[0]), 1, 'pierwszy cel dostał licznik');
  assert.equal(cel(para[1]), 1, 'drugi cel dostał licznik');
});

test('V/3: silnik przyjmuje DOWOLNY legalny podzbiór — bez znacznika (kontrakt CR 601.2c)', () => {
  // Pierwotna wersja tego pinu wymagała znacznika `constructedTargetSet` dla
  // zbiorów spoza oferty. Sąsiad `zgloszenie-e-inferno-podzial` E/4 pokazał,
  // że to ZAWĘŻENIE istniejącego kontraktu: silnik od zawsze przyjmuje każdy
  // legalny podzbiór, bo sam sprawdza rozmiar i kandydatów — i właśnie tego
  // oczekuje właściciel („silnik miał sprawdzać legalność wybranej
  // kombinacji, tej jednej wybranej"). Pin pilnuje więc kontraktu wprost.
  const s = decyzjaTriggera();
  const kandydaci = s.view.pendingTriggerTarget.candidateIds;
  const para = [kandydaci[0], kandydaci[4]];
  const template = s.options.find((c) => Array.isArray(c.targetIds));
  const bezZnacznika = { ...template, targetIds: [...para] };
  delete bezZnacznika.constructedTargetSet;
  delete bezZnacznika.syntheticTargetSet;
  const res = execute(s.state, bezZnacznika);
  assert.equal(res.ok, true, `legalny podzbiór bez znaczników przechodzi: ${JSON.stringify(res.events?.[0] ?? {})}`);
});

test('V/4: nielegalny rozmiar i cudzy kandydat nadal odrzucane (także ze znacznikiem)', async () => {
  const mod = await api();
  const s = decyzjaTriggera();
  const kandydaci = s.view.pendingTriggerTarget.candidateIds;
  const trzy = [kandydaci[0], kandydaci[1], kandydaci[2]];
  const cmdTrzy = commandForSet(s.options, trzy, 'resolve_trigger_target', mod);
  assert.ok(cmdTrzy, 'kreator buduje komendę dla trzech (bo plan dopuszcza 0–2 — walidacja w silniku)');
  assert.equal(execute(s.state, cmdTrzy).events?.[0]?.reason, 'illegal_trigger_target', 'trzy cele > count 2');
  const obcy = commandForSet(s.options, [kandydaci[0], 'nie-ma-takiego'], 'resolve_trigger_target', mod);
  assert.ok(obcy, 'nieznany id nie jest filtrowany po stronie kreatora');
  assert.equal(execute(s.state, obcy).events?.[0]?.reason, 'illegal_trigger_target', 'kandydat spoza listy');
});

test('V/5: widełki planu liczą się z limitu i liczby kandydatów, nie z ziaren', () => {
  const s = decyzjaTriggera();
  const plan = upToTargetsPlanOf(s.options);
  assert.ok(plan);
  assert.equal(plan.minTargets, 0, '„up to” pozwala na zero celów');
  assert.equal(plan.maxTargets, 2, 'górny limit = count z Oracle');
  assert.equal(plan.targets.length, 7, 'wiersz na kandydata');
  // Świadomie BEZ `maxAllowedTargets`: poszerzanie widełek (limit
  // z deskryptora) przeszło GREEN w mutacjach — nie było potrzebne do
  // naprawy, więc tej zmiany nie ma. Ziarno zachłanne niesie pełne `count`,
  // a limit liczby celów trzyma bramka w kreatorze (mutant → pin V/9).
});

test('V/6: kreator zatwierdza dowolną parę — nie tylko zachłanną', async () => {
  const mod = await api();
  const s = decyzjaTriggera();
  const poprzedni = globalThis.document;
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
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  const host = new MiniEl('div');
  const wynik = { cmd: null };
  const walk = (el) => [el, ...el.children.flatMap(walk)];
  try {
    const plan = upToTargetsPlanOf(s.options);
    renderMultiTargetWizard(host, {
      view: s.view, session: s.session, plan, commands: s.options,
      sourceName: 'Weftblade Enhancer',
      onComplete: (cmd) => { wynik.cmd = cmd; }, onCancel: () => {},
    });
    const zatwierdz = walk(host).find((el) => String(el.className).includes('multi-target-confirm'));
    // Wybieramy DRUGI i CZWARTY wiersz — para, której silnik nie publikuje.
    const toggles = walk(host).filter((el) => String(el.className).includes('multi-target-toggle'));
    assert.equal(toggles.length, 7, 'wiersz na kandydata');
    toggles[1].checked = true; toggles[1].emit('change');
    toggles[3].checked = true; toggles[3].emit('change');
    assert.equal(zatwierdz.disabled, false, 'dwa cele — „Zatwierdź” aktywny (to był objaw zgłoszenia)');
    zatwierdz.click();
    assert.ok(wynik.cmd, 'kreator oddał komendę');
    assert.equal(wynik.cmd.targetIds.length, 2, 'komenda niesie dwa cele');
    // Dowód zbudowania: tej pary NIE ma w ofercie, a mimo to kreator ją oddał.
    assert.ok(!s.options.some((c) => c.type === 'resolve_trigger_target'
      && Array.isArray(c.targetIds)
      && [...c.targetIds].sort().join('|') === [...wynik.cmd.targetIds].sort().join('|')),
      'komenda jest zbudowana, nie znaleziona w ofercie');
    const res = execute(s.state, wynik.cmd);
    assert.equal(res.ok, true, `silnik przyjmuje wybór gracza z kreatora: ${JSON.stringify(res.events?.[0] ?? {})}`);
  } finally {
    if (poprzedni === undefined) delete globalThis.document; else globalThis.document = poprzedni;
  }
});

test('V/9: kreator NIE pozwala zatwierdzić trzech celów przy „up to two" (bramka widełek)', async () => {
  // Kontrapunkt dla V/6: pełna budowa komendy nie może zamienić kreatora
  // w „wyślij cokolwiek". Liczba celów to jedyna rzecz, którą kreator zna
  // z planu (Oracle); przekroczenie limitu = brak komendy = „Zatwierdź"
  // nieaktywny (ten sam objaw co B1/3, ale pinowany tutaj, bo mieszka
  // w kreatorze, a nie w silniku).
  const mod = await api();
  const s = decyzjaTriggera();
  const poprzedni = globalThis.document;
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
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  const host = new MiniEl('div');
  const walk = (el) => [el, ...el.children.flatMap(walk)];
  try {
    const plan = upToTargetsPlanOf(s.options);
    assert.equal(plan.maxTargets, 2, 'setup: limit z Oracle/deskryptora');
    renderMultiTargetWizard(host, {
      view: s.view, session: s.session, plan, commands: s.options,
      sourceName: 'Weftblade Enhancer', onComplete: () => {}, onCancel: () => {},
    });
    const zatwierdz = walk(host).find((el) => String(el.className).includes('multi-target-confirm'));
    const toggles = walk(host).filter((el) => String(el.className).includes('multi-target-toggle'));
    for (const i of [0, 2, 5]) { toggles[i].checked = true; toggles[i].emit('change'); }
    assert.equal(zatwierdz.disabled, true, 'trzy cele przy „up to two" — brak komendy');
    toggles[5].checked = false; toggles[5].emit('change');
    assert.equal(zatwierdz.disabled, false, 'dwa cele — komenda jest');
    // Pusty wybór jest legalny („up to"), a silnik publikuje wariant pusty.
    toggles[0].checked = false; toggles[0].emit('change');
    toggles[2].checked = false; toggles[2].emit('change');
    assert.equal(zatwierdz.disabled, false, 'zero celów — legalne przy „up to"');
    assert.ok(mod, 'moduł budowy komendy obecny');
  } finally {
    if (poprzedni === undefined) delete globalThis.document; else globalThis.document = poprzedni;
  }
});

test('V/7: zbudowana komenda zachowuje semantykę oferty (friendly/removesTarget/playerId)', async () => {
  // Regresja polegała na tym, że KREATOR nie miał pełnego wyboru, a bot
  // dokładał sobie syntetyczne zestawy. Po naprawie jedno źródło budowy
  // komendy wystarcza obu: komenda musi nieść te same znaczniki intencji,
  // co oferta, bo wycena bota czyta je pod tymi samymi nazwami.
  const mod = await api();
  const s = decyzjaTriggera();
  const kandydaci = s.view.pendingTriggerTarget.candidateIds;
  const cmd = commandForSet(s.options, [kandydaci[2], kandydaci[5]], 'resolve_trigger_target', mod);
  assert.ok(cmd, 'komenda istnieje');
  assert.equal(cmd.type, 'resolve_trigger_target');
  const szablon = s.options.find((c) => Array.isArray(c.targetIds));
  assert.equal(cmd.friendly, szablon.friendly, 'zachowana semantyka intencji oferty');
  assert.equal(cmd.removesTarget, szablon.removesTarget);
  assert.equal(cmd.playerId, szablon.playerId, 'właściciel decyzji z szablonu');
});

test('V/8: proliferate — dowolny podzbiór 7 kandydatów jest wybieralny (CR 701.34)', async () => {
  const mod = await api();
  // Ta sama klasa błędu w drugiej rodzinie: plan liczył rozpiętość ziaren
  // (pełny + singletony + pusty = 0..1), a proliferate pozwala na DOWOLNĄ
  // liczbę celów (CR 701.34). Wybór „3 z 7" był niezatwierdzalny.
  const state = createGameState({ seed: 12, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  const def = REGISTRY.get('goblin-piker');
  for (let i = 0; i < 7; i += 1) {
    addObject(state, {
      id: `art${i}`, instanceId: `i-art${i}`, cardId: 'goblin-piker',
      controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
      ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
      keywords: def.keywords ?? [], spell: def.spell,
    });
  }
  state.pendingProliferate = {
    playerId: 'p1', sourceId: 'art0',
    candidateIds: ['art0', 'art1', 'art2', 'art3', 'art4', 'art5', 'art6'],
  };
  const view = playerView(state, 'p1');
  const options = view.legalCommands.filter((c) => c.type === 'resolve_proliferate');
  const plan = proliferatePlanOf(options);
  assert.ok(plan, 'plan proliferate');
  assert.equal(plan.minTargets, 0, 'zero celów legalne');
  assert.equal(plan.maxTargets, 7, `widełki z liczby kandydatów (jest ${plan.maxTargets})`);
  const trzy = commandForSet(options, ['art1', 'art4', 'art6'], 'resolve_proliferate', mod);
  assert.ok(trzy, 'wybór 3 z 7 ma komendę');
  const res = execute(state, trzy);
  assert.equal(res.ok, true, `silnik przyjmuje zbudowany wybór: ${JSON.stringify(res.events?.[0] ?? {})}`);
});
