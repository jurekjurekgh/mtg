// M195/C + C1 — wielocelowość jako LISTA WYBORU, nie eksplozja kombinacji.
//
// Zgłoszenie właściciela:
//  C  — „Fireball (i inne tego typu) — mam 95 kombinacji obrażeń. To powinno
//        być zrobione na zasadzie listy legalnych celów do wyboru (ptaszek)
//        i osobnego licznika +- do określenia obrażeń (X) i kosztu czaru.
//        Po zatwierdzeniu silnik sprawdza czy wybór jest legalny."
//  C1 — „Wrap in Flames — zamiast 50 kombinacji powinna być lista legalnych
//        celów z możliwością dodania ptaszka i potem sprawdzeniem legalności."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { multiTargetPlanOf, commandForSelection } from '../src/table/multi-target.js';
import { targetTypeLabel } from '../src/table/render.js';

/** Warianty Fireball: 3 cele × X 1..3 (kartezjański iloczyn jak w silniku). */
function fireballCommands() {
  const out = [];
  for (const targets of [['c0'], ['c1'], ['p2'], ['c0', 'c1'], ['c0', 'p2'], ['c1', 'p2'], ['c0', 'c1', 'p2']]) {
    for (const xValue of [1, 2, 3]) {
      out.push({ type: 'cast_spell', playerId: 'p1', objectId: 'fb', targets, xValue });
    }
  }
  return out;
}

/** Warianty Wrap in Flames: podzbiory do 3 celów, bez X. */
function wrapCommands() {
  const out = [];
  for (const targets of [[], ['c0'], ['c1'], ['c2'], ['c0', 'c1'], ['c0', 'c2'], ['c1', 'c2'], ['c0', 'c1', 'c2']]) {
    out.push({ type: 'cast_spell', playerId: 'p1', objectId: 'wf', targets, modeIndex: 0 });
  }
  return out;
}

test('M195/C: plan zwraca LISTĘ CELÓW, nie listę kombinacji', () => {
  const plan = multiTargetPlanOf(fireballCommands());
  assert.ok(plan, 'warianty wielocelowe mają dać plan wyboru');
  assert.deepEqual(plan.targets.slice().sort(), ['c0', 'c1', 'p2'],
    `21 kombinacji → 3 cele do zaznaczenia: ${JSON.stringify(plan.targets)}`);
});

test('M195/C: plan zna zakres X (licznik +/-)', () => {
  const plan = multiTargetPlanOf(fireballCommands());
  assert.deepEqual([plan.xMin, plan.xMax], [1, 3], 'licznik X od 1 do 3');
  assert.equal(plan.hasX, true);
});

test('M195/C: wybór celów + X składa się na JEDNĄ legalną komendę', () => {
  const commands = fireballCommands();
  const cmd = commandForSelection(commands, { targets: ['c0', 'p2'], xValue: 2 });
  assert.ok(cmd, 'zaznaczenie musi dać komendę');
  assert.deepEqual(cmd.targets.slice().sort(), ['c0', 'p2']);
  assert.equal(cmd.xValue, 2);
  assert.ok(commands.includes(cmd), 'komenda pochodzi z legalCommands — silnik ją zna');
});

test('M195/C: NIELEGALNY wybór nie daje komendy (silnik sprawdza legalność)', () => {
  const commands = fireballCommands();
  assert.equal(commandForSelection(commands, { targets: ['c0', 'c1', 'p2'], xValue: 9 }), null,
    'X poza zakresem');
  assert.equal(commandForSelection(commands, { targets: ['nieistniejacy'], xValue: 1 }), null,
    'cel spoza listy');
});

test('M195/C1: Wrap in Flames — lista celów bez licznika X', () => {
  const plan = multiTargetPlanOf(wrapCommands());
  assert.ok(plan, 'plan wyboru istnieje');
  assert.deepEqual(plan.targets.slice().sort(), ['c0', 'c1', 'c2']);
  assert.equal(plan.hasX, false, 'ta karta nie ma X — bez licznika');
  assert.equal(plan.minTargets, 0, '„up to three" — zero celów też jest legalne');
  assert.equal(plan.maxTargets, 3);
});

test('M195/C1: zaznaczenie dwóch celów wybiera właściwą komendę', () => {
  const commands = wrapCommands();
  const cmd = commandForSelection(commands, { targets: ['c1', 'c2'] });
  assert.ok(cmd);
  assert.deepEqual(cmd.targets.slice().sort(), ['c1', 'c2']);
});

test('M195/C1: kolejność zaznaczenia nie ma znaczenia', () => {
  const commands = wrapCommands();
  const a = commandForSelection(commands, { targets: ['c0', 'c2'] });
  const b = commandForSelection(commands, { targets: ['c2', 'c0'] });
  assert.equal(a, b, 'ten sam zbiór celów = ta sama komenda');
});

test('M195/C: pojedynczy cel bez X NIE tworzy planu (anty-over-fix)', () => {
  // Zwykły czar celowany (Shock) ma po jednej komendzie na cel — panel radzi
  // sobie z tym od dawna, nie ma po co pokazywać ekranu zaznaczania.
  const single = [
    { type: 'cast_spell', playerId: 'p1', objectId: 's', targets: ['c0'] },
    { type: 'cast_spell', playerId: 'p1', objectId: 's', targets: ['c1'] },
  ];
  assert.equal(multiTargetPlanOf(single), null,
    'jeden cel na komendę = zwykła lista celów, bez ekranu wyboru');
});

test('M195/C: sam licznik X bez wielu celów TWORZY plan (Fireball w 1 cel)', () => {
  // „i inne tego typu" — czar z X i jednym celem też zasługuje na licznik
  // zamiast N przycisków „X=1, X=2, X=3…".
  const xOnly = [1, 2, 3, 4].map((xValue) => ({
    type: 'cast_spell', playerId: 'p1', objectId: 'fb', targets: ['c0'], xValue,
  }));
  const plan = multiTargetPlanOf(xOnly);
  assert.ok(plan, 'sam wybór X to też licznik, nie lista przycisków');
  assert.deepEqual([plan.xMin, plan.xMax], [1, 4]);
});

// ---- Realne karty z katalogu (nie tylko komendy syntetyczne) -------------

test('M195/C: REALNY Fireball — 232 kombinacje stają się 6 celów + licznik X', async () => {
  const { createGameState, addObject, playerView } = await import('../src/engine/game-state.js');
  const { createCardRegistry } = await import('../src/cards/card-data.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const { jumpToStep } = await import('../src/engine/turn.js');
  const REGISTRY = createCardRegistry();
  const state = createGameState({ seed: 195, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const fireball = REGISTRY.get('fireball');
  addObject(state, {
    id: 'spell', instanceId: 'i-spell', cardId: 'fireball', controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', ...gameObjectDataOf(fireball), types: fireball.types, spell: fireball.spell,
  });
  const giant = REGISTRY.get('hill-giant');
  for (let i = 0; i < 4; i += 1) {
    const owner = i % 2 === 0 ? 'p1' : 'p2';
    addObject(state, {
      id: `c${i}`, instanceId: `i-c${i}`, cardId: 'hill-giant', controllerId: owner,
      ownerId: owner, zone: 'battlefield', ...gameObjectDataOf(giant), types: giant.types,
    });
  }
  for (let i = 0; i < 8; i += 1) {
    addObject(state, {
      id: `m${i}`, instanceId: `i-m${i}`, cardId: 'basic-mountain', controllerId: 'p1',
      ownerId: 'p1', zone: 'battlefield', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Mountain'],
    });
  }
  const commands = playerView(state, 'p1').legalCommands.filter((c) => c.objectId === 'spell');
  assert.ok(commands.length > 50,
    `to jest właśnie problem ze zgłoszenia — ${commands.length} kombinacji`);
  const plan = multiTargetPlanOf(commands);
  assert.ok(plan, 'Fireball dostaje ekran wyboru');
  assert.ok(plan.targets.length <= 8,
    `zamiast ${commands.length} przycisków — ${plan.targets.length} celów do zaznaczenia`);
  assert.equal(plan.hasX, true, 'i licznik X zamiast osobnego przycisku na każdą wartość');
  // Każdy wybór z ekranu musi wracać do komendy, którą silnik uznał za legalną.
  const chosen = commandForSelection(commands, { targets: [plan.targets[0]], xValue: plan.xMax });
  assert.ok(chosen && commands.includes(chosen), 'zatwierdzenie daje legalną komendę silnika');
});

test('M195/C1: REALNY Wrap in Flames — podzbiory celów zamiast kombinacji', async () => {
  const { createGameState, addObject, playerView } = await import('../src/engine/game-state.js');
  const { createCardRegistry } = await import('../src/cards/card-data.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const { jumpToStep } = await import('../src/engine/turn.js');
  const REGISTRY = createCardRegistry();
  const state = createGameState({ seed: 195, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const wrap = REGISTRY.get('wrap-in-flames');
  addObject(state, {
    id: 'spell', instanceId: 'i-spell', cardId: 'wrap-in-flames', controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', ...gameObjectDataOf(wrap), types: wrap.types, spell: wrap.spell,
  });
  const giant = REGISTRY.get('hill-giant');
  for (let i = 0; i < 4; i += 1) {
    const owner = i % 2 === 0 ? 'p1' : 'p2';
    addObject(state, {
      id: `c${i}`, instanceId: `i-c${i}`, cardId: 'hill-giant', controllerId: owner,
      ownerId: owner, zone: 'battlefield', ...gameObjectDataOf(giant), types: giant.types,
    });
  }
  for (let i = 0; i < 6; i += 1) {
    addObject(state, {
      id: `m${i}`, instanceId: `i-m${i}`, cardId: 'basic-mountain', controllerId: 'p1',
      ownerId: 'p1', zone: 'battlefield', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Mountain'],
    });
  }
  const commands = playerView(state, 'p1').legalCommands.filter((c) => c.objectId === 'spell');
  const plan = multiTargetPlanOf(commands);
  assert.ok(plan, 'Wrap in Flames też dostaje ekran wyboru');
  assert.equal(plan.hasX, false, 'ta karta nie ma X — sam ptaszek przy celach');
  assert.equal(plan.maxTargets, 3, 'Oracle: „up to three target creatures"');
  const chosen = commandForSelection(commands, { targets: plan.targets.slice(0, 2) });
  assert.ok(chosen && commands.includes(chosen), 'zatwierdzenie daje legalną komendę silnika');
});

// ---- Warstwa UI: ekran zaznaczania celów + licznik X ---------------------

/** Minimalny DOM (wzorzec z m172) — render jest czysty, bez prawdziwego DOM. */
function withMiniDom(run) {
  class MiniEl {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.listeners = {};
      this.className = ''; this.text = ''; this.dataset = {}; this.disabled = false;
      this.classList = { toggle: () => {}, add: () => {}, remove: () => {} };
    }
    set textContent(v) { this.text = String(v); this.children = []; }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
    appendChild(c) { this.children.push(c); return c; }
    replaceChildren(...n) { this.children = n.flat(); }
    addEventListener(t, l) { (this.listeners[t] ??= []).push(l); }
    click() { for (const l of this.listeners.click ?? []) l({}); }
    /** Wszystkie węzły drzewa (do wyszukiwania przycisków w teście). */
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

const VIEW = {
  playerId: 'p1',
  players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
  zones: { battlefield: [
    { id: 'c0', cardId: 'hill-giant', controllerId: 'p1' },
    { id: 'c1', cardId: 'hill-giant', controllerId: 'p2' },
  ] },
};
const SESSION = { nameOf: (id) => id ?? '?', nameOfObject: (id) => id ?? '?', faceDownName: () => 'morph' };

test('M195/C: ekran wyboru rysuje JEDEN wiersz na cel, nie na kombinację', async () => {
  const { renderMultiTargetWizard } = await import('../src/table/choice-request.js');
  const commands = fireballCommands();
  const plan = multiTargetPlanOf(commands);
  withMiniDom((host) => {
    renderMultiTargetWizard(host, {
      view: VIEW, session: SESSION, plan, commands, sourceName: 'Fireball',
      onComplete: () => {}, onCancel: () => {},
    });
    const rows = host.findAll((n) => String(n.className).includes('multi-target-row'));
    assert.equal(rows.length, plan.targets.length,
      `${commands.length} kombinacji → ${plan.targets.length} wierszy do zaznaczenia`);
  });
});

test('M195/C: licznik X ma przyciski +/- i pokazuje wartość', async () => {
  const { renderMultiTargetWizard } = await import('../src/table/choice-request.js');
  const commands = fireballCommands();
  withMiniDom((host) => {
    renderMultiTargetWizard(host, {
      view: VIEW, session: SESSION, plan: multiTargetPlanOf(commands), commands,
      sourceName: 'Fireball', onComplete: () => {}, onCancel: () => {},
    });
    assert.ok(host.find((n) => String(n.className).includes('multi-target-x-plus')), 'przycisk +1 dla X');
    assert.ok(host.find((n) => String(n.className).includes('multi-target-x-minus')), 'przycisk −1 dla X');
  });
});

test('M195/C: zatwierdzenie oddaje legalną komendę z wybranymi celami i X', async () => {
  const { renderMultiTargetWizard } = await import('../src/table/choice-request.js');
  const commands = fireballCommands();
  let submitted = null;
  withMiniDom((host) => {
    renderMultiTargetWizard(host, {
      view: VIEW, session: SESSION, plan: multiTargetPlanOf(commands), commands,
      sourceName: 'Fireball', onComplete: (cmd) => { submitted = cmd; }, onCancel: () => {},
    });
    // zaznacz pierwszy cel i podbij X o 1
    host.find((n) => String(n.className).includes('multi-target-toggle'))?.click();
    host.find((n) => String(n.className).includes('multi-target-x-plus'))?.click();
    host.find((n) => String(n.className).includes('multi-target-confirm'))?.click();
  });
  assert.ok(submitted, 'zatwierdzenie musi oddać komendę');
  assert.ok(commands.includes(submitted), 'i to komendę z legalCommands (silnik ją zna)');
  assert.equal(submitted.targets.length, 1);
  assert.equal(submitted.xValue, 2, 'X podbite z 1 na 2');
});

test('M195/C: zatwierdzenie jest ZABLOKOWANE, gdy wybór nielegalny', async () => {
  const { renderMultiTargetWizard } = await import('../src/table/choice-request.js');
  const commands = fireballCommands(); // wymaga min. 1 celu
  withMiniDom((host) => {
    renderMultiTargetWizard(host, {
      view: VIEW, session: SESSION, plan: multiTargetPlanOf(commands), commands,
      sourceName: 'Fireball', onComplete: () => {}, onCancel: () => {},
    });
    const confirm = host.find((n) => String(n.className).includes('multi-target-confirm'));
    assert.equal(confirm.disabled, true, 'bez zaznaczonego celu nie da się zatwierdzić');
  });
});

// ---------------------------------------------------------------------------
// M206 (audyt Żywym Testerem, zlecenie właściciela): kontrakt DOM kreatora.
//
// Objaw: sterownik testera szukał zaznaczeń jako
// `.choice-request-option input[type="checkbox"]`, a kreator rysuje PRZYCISKI
// `.multi-target-toggle` ze stanem w tekście („[ ] Mountain" / „[x] Mountain").
// Selektor nie pasował do niczego, więc lista zaznaczeń była zawsze pusta:
// „Zatwierdź" zostawał wyłączony, „Anuluj" otwierał ten sam modal od nowa
// i tester kręcił się w kółko (zmierzone: 300 identycznych linii
// „opcji 0, potrzeba 1", partia bez ani jednego kroku).
//
// Konsekwencja była poważniejsza niż zawieszony przebieg: ŻADEN czar
// wielocelowy (Fireball, Wrap in Flames, Grave Exchange) ani mulligan
// z odłożeniem kart nie był nigdy przeklikany przez audyt — klasa modali
// wprowadzona w M195/C i M200/C pozostawała poza zasięgiem narzędzia.
//
// Te testy pinują KONTRAKT, na którym opiera się sterownik: wiersz wyboru
// jest klikalny, niesie stan w tekście i reaguje na kliknięcie.
test('M206: wiersz wyboru to klikalny przycisk .multi-target-toggle (kontrakt testera)', async () => {
  const { renderMultiTargetWizard } = await import('../src/table/choice-request.js');
  const commands = wrapCommands();
  const plan = multiTargetPlanOf(commands);
  withMiniDom((host) => {
    renderMultiTargetWizard(host, {
      view: VIEW, session: SESSION, plan, commands, sourceName: 'Wrap in Flames',
      onComplete: () => {}, onCancel: () => {},
    });
    const toggles = host.findAll((n) => String(n.className).includes('multi-target-toggle'));
    assert.equal(toggles.length, plan.targets.length,
      'każdy cel ma własny przycisk zaznaczenia');
    for (const toggle of toggles) {
      assert.equal(typeof toggle.click, 'function', 'wiersz musi być klikalny');
    }
    // Kreator NIE używa <input type=checkbox> — sterownik testera nie może
    // ich szukać (to była przyczyna zawieszania się przebiegów).
    const inputs = host.findAll((n) => String(n.tagName).toLowerCase() === 'input');
    assert.equal(inputs.length, 0,
      'zaznaczenia w kreatorze to przyciski ze stanem w tekście, nie <input type=checkbox>');
  });
});

test('M206: stan zaznaczenia jest widoczny w TEKŚCIE wiersza ([ ] / [x])', async () => {
  const { renderMultiTargetWizard } = await import('../src/table/choice-request.js');
  const commands = wrapCommands();
  withMiniDom((host) => {
    renderMultiTargetWizard(host, {
      view: VIEW, session: SESSION, plan: multiTargetPlanOf(commands), commands,
      sourceName: 'Wrap in Flames', onComplete: () => {}, onCancel: () => {},
    });
    const toggle = host.find((n) => String(n.className).includes('multi-target-toggle'));
    assert.match(toggle.textContent, /^\[ \]/, 'niezaznaczony wiersz zaczyna się od „[ ]”');
    toggle.click();
    assert.match(toggle.textContent, /^\[x\]/, 'po kliknięciu wiersz pokazuje „[x]”');
    toggle.click();
    assert.match(toggle.textContent, /^\[ \]/, 'ponowne kliknięcie odznacza');
  });
});

test('M206: wiersz celu mówi, CZYJ jest permanent (lustrzana plansza)', async () => {
  const { renderMultiTargetWizard } = await import('../src/table/choice-request.js');
  // Obie strony mają stwora o tej samej nazwie — bez znacznika kontrolera
  // wiersze różnią się tylko ukrytym id obiektu.
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    zones: { battlefield: [
      { id: 'c0', cardId: 'hill-giant', controllerId: 'p1', zone: 'battlefield' },
      { id: 'c1', cardId: 'hill-giant', controllerId: 'p2', zone: 'battlefield' },
      { id: 'c2', cardId: 'hill-giant', controllerId: 'p2', zone: 'battlefield' },
    ] },
  };
  const session = { nameOf: () => 'Hill Giant', nameOfObject: (id) => id, faceDownName: () => 'morph' };
  const commands = wrapCommands();
  withMiniDom((host) => {
    renderMultiTargetWizard(host, {
      view, session, plan: multiTargetPlanOf(commands), commands,
      sourceName: 'Wrap in Flames', onComplete: () => {}, onCancel: () => {},
    });
    const labels = host.findAll((n) => String(n.className).includes('multi-target-toggle'))
      .map((n) => n.textContent);
    assert.equal(labels[0], '[ ] Hill Giant (Ty)', `mój stwór oznaczony: ${labels[0]}`);
    assert.equal(labels[1], '[ ] Hill Giant (Nieprzyjaciel)', `wrogi stwór oznaczony: ${labels[1]}`);
    // Etykiety wrogich stworów są identyczne (to ta sama karta u tego samego
    // gracza) — rozróżnia je pozycja, tak jak w zwykłych listach celów.
    assert.equal(labels[1], labels[2]);
  });
});

test('M206: gracz jako cel zostaje bez znacznika kontrolera', async () => {
  const { renderMultiTargetWizard } = await import('../src/table/choice-request.js');
  const commands = fireballCommands(); // cele: c0, c1, p2 (gracz)
  withMiniDom((host) => {
    renderMultiTargetWizard(host, {
      view: VIEW, session: SESSION, plan: multiTargetPlanOf(commands), commands,
      sourceName: 'Fireball', onComplete: () => {}, onCancel: () => {},
    });
    const labels = host.findAll((n) => String(n.className).includes('multi-target-toggle'))
      .map((n) => n.textContent);
    // VIEW.players: p2 → „Nieprzyjaciel"; gracz nie jest permanentem na polu
    // bitwy, więc nie dostaje nawiasu z kontrolerem.
    // Gracz nie jest permanentem na polu bitwy, więc nie dostaje nawiasu
    // z kontrolerem — inaczej niż stwór wroga („hill-giant (Nieprzyjaciel)").
    assert.deepEqual(labels, ['[ ] hill-giant (Ty)', '[ ] hill-giant (Nieprzyjaciel)', '[ ] Nieprzyjaciel'],
      `stwory ze znacznikiem, gracz bez: ${JSON.stringify(labels)}`);
  });
});

// ===========================================================================
// M207 — audyt rozgrywek, oś (b)/(c): CZARY O KILKU RÓŻNYCH POZYCJACH CELU.
//
// Zgłoszenie właściciela dotyczyło formy modala przy wielu celach. M195/C
// rozwiązało przypadek JEDNORODNY („dowolna liczba celów” — Fireball, Wrap in
// Flames): lista celów z ptaszkiem zamiast iloczynu kombinacji. Ale czar
// o kilku RÓŻNYCH pozycjach celu trafiał do tej samej płaskiej listy:
//
//   Grave Exchange — zaznacz cele (2):
//     [ ] Hill Giant        <- karta z MOJEGO grobu
//     [ ] Ty                <- gracz
//     [ ] Nieprzyjaciel     <- gracz
//     [ ] Goblin Piker      <- karta z grobu (kolejność z odkrywania!)
//
// Oracle: „Return target creature card from your graveyard to your hand.
// Target player sacrifices a creature of their choice.” To DWIE niezależne
// pozycje, a nie „dwa cele z jednego worka”. Gracz mógł zaznaczyć dwie karty
// z grobu albo dwóch graczy — wybór był wtedy nielegalny
// (`commandForSelection` → null), a jedyną informacją zwrotną pozostawało
// wyszarzone „Zatwierdź”, bez słowa CZEGO brakuje.
//
// W bazie kart ten kształt ma 7 kart (m.in. Knockout Maneuver, Ivy Lane
// Denizen, Assert Perfection — „target creature you control … target creature
// an opponent controls”).

const spellCmds = (list) => list.map((targets) => ({
  type: 'cast_spell', playerId: 'p1', objectId: 'sp', targets,
}));

test('M207/B1: czar o różnych pozycjach celu dostaje ROZBICIE NA POZYCJE', () => {
  const plan = multiTargetPlanOf(spellCmds([['gy1', 'p1'], ['gy1', 'p2'], ['gy2', 'p1'], ['gy2', 'p2']]));
  assert.deepEqual(plan.slots, [['gy1', 'gy2'], ['p1', 'p2']],
    'pozycja 0 = karty z grobu, pozycja 1 = gracze');
});

test('M207/B2: czar o JEDNORODNEJ liście celów zostaje płaską listą', () => {
  // Kontrola: Fireball / Wrap in Flames („any number of targets”, „up to
  // three”) mają cele wymienne — tam wór z ptaszkami jest formą POPRAWNĄ
  // i rozbijanie go na pozycje byłoby regresją M195/C.
  const upToThree = multiTargetPlanOf(spellCmds([[], ['a'], ['b'], ['c'], ['a', 'b'], ['a', 'c'], ['b', 'c'], ['a', 'b', 'c']]));
  assert.equal(upToThree.slots, null, '„up to N” — pozycje wymienne');
  const anyNumber = multiTargetPlanOf(spellCmds([['a'], ['b'], ['a', 'b']]));
  assert.equal(anyNumber.slots, null, '„any number of targets” — lista jednorodna');

  // Przypadek, w którym bramka JEDNORODNOŚCI jest jedyną obroną: czar
  // o STAŁYCH dwóch celach z jednej puli („two target creatures” — każdy
  // z każdym). Sama arność (2) niczego tu nie wyklucza, a rozbicie na
  // pozycje pokazałoby te same stwory dwa razy, w dwóch sekcjach.
  const twoFromOnePool = multiTargetPlanOf(spellCmds([
    ['a', 'b'], ['a', 'c'], ['b', 'c'], ['b', 'a'], ['c', 'a'], ['c', 'b'],
  ]));
  assert.equal(twoFromOnePool.slots, null,
    'wspólna pula kandydatów na obu pozycjach = lista, nie sekcje');
});

test('M207/B3: kreator rysuje SEKCJĘ NA POZYCJĘ z nazwą z Oracle', async () => {
  const { renderMultiTargetWizard } = await import('../src/table/choice-request.js');
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    zones: {
      battlefield: [],
      graveyard: [
        { id: 'gy1', cardId: 'hill-giant', controllerId: 'p1', zone: 'graveyard' },
        { id: 'gy2', cardId: 'goblin-piker', controllerId: 'p1', zone: 'graveyard' },
      ],
    },
  };
  const session = { nameOf: (id) => id, nameOfObject: (id) => id, faceDownName: () => 'morph' };
  const commands = spellCmds([['gy1', 'p1'], ['gy1', 'p2'], ['gy2', 'p1'], ['gy2', 'p2']]);
  // Etykiety pozycji pochodzą z deskryptora Oracle karty (ADR 0002).
  const labels = [targetTypeLabel({ type: 'creature_card_in_graveyard' }), targetTypeLabel({ type: 'player' })];
  withMiniDom((host) => {
    renderMultiTargetWizard(host, {
      view, session, plan: multiTargetPlanOf(commands), commands, sourceName: 'Grave Exchange',
      slotLabels: labels, onComplete: () => {}, onCancel: () => {},
    });
    const heads = host.findAll((n) => String(n.className).includes('multi-target-slot-label'))
      .map((n) => n.textContent);
    assert.deepEqual(heads, ['1. karta-stwór w grobie:', '2. gracz:'],
      `nagłówki pozycji z Oracle: ${JSON.stringify(heads)}`);
  });
});

test('M207/B4: w obrębie pozycji wybór jest JEDNOKROTNY, a status mówi czego brakuje', async () => {
  const { renderMultiTargetWizard } = await import('../src/table/choice-request.js');
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    zones: {
      battlefield: [],
      graveyard: [
        { id: 'gy1', cardId: 'hill-giant', controllerId: 'p1', zone: 'graveyard' },
        { id: 'gy2', cardId: 'goblin-piker', controllerId: 'p1', zone: 'graveyard' },
      ],
    },
  };
  const session = { nameOf: (id) => id, nameOfObject: (id) => id, faceDownName: () => 'morph' };
  const commands = spellCmds([['gy1', 'p1'], ['gy1', 'p2'], ['gy2', 'p1'], ['gy2', 'p2']]);
  let submitted = null;
  withMiniDom((host) => {
    renderMultiTargetWizard(host, {
      view, session, plan: multiTargetPlanOf(commands), commands, sourceName: 'Grave Exchange',
      slotLabels: ['karta-stwór w grobie', 'gracz'],
      onComplete: (cmd) => { submitted = cmd; }, onCancel: () => {},
    });
    const status = () => host.find((n) => String(n.className).includes('multi-target-status')).textContent;
    const confirm = host.find((n) => String(n.className).includes('multi-target-confirm'));
    const toggles = host.findAll((n) => String(n.className).includes('multi-target-toggle'));

    assert.match(status(), /Brakuje: karta-stwór w grobie, gracz/,
      'na starcie status WYMIENIA brakujące pozycje, nie milczy');
    assert.equal(confirm.disabled, true);

    toggles[0].click();                       // gy1 (pozycja 0)
    assert.match(status(), /^Brakuje: gracz$/, `po wyborze karty: ${status()}`);
    toggles[1].click();                       // gy2 — TA SAMA pozycja
    assert.match(status(), /^Brakuje: gracz$/, 'druga karta zastępuje pierwszą, nie dokłada się');
    assert.equal(toggles[0].textContent.startsWith('[ ]'), true, 'poprzedni wybór pozycji odznaczony');
    assert.equal(toggles[1].textContent.startsWith('[x]'), true, 'nowy wybór pozycji zaznaczony');

    toggles[3].click();                       // gracz p2 (pozycja 1)
    assert.equal(confirm.disabled, false, 'komplet pozycji odblokowuje zatwierdzenie');
    confirm.click();
  });
  assert.ok(submitted, 'zatwierdzenie musi oddać komendę');
  assert.ok(commands.includes(submitted), 'i to komendę z legalCommands (L48)');
  assert.deepEqual(submitted.targets, ['gy2', 'p2'],
    'cele w KOLEJNOŚCI POZYCJI — pozycja 0 to karta, pozycja 1 to gracz');
});
