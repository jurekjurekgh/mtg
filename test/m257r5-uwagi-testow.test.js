import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBotMoves, createScryfallHover } from '../src/table/render.js';
import { renderMultiTargetWizard } from '../src/table/choice-request.js';
import { sacrificeCastPlanOf, commandForSacrificeSelection } from '../src/table/multi-target.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createGameState, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';

/**
 * M257 r5 (uwagi z testów, runda 5) — trzy znaleziska właściciela:
 *
 * A — hover (powiększona karta ze Scryfall, bez trybów FOT/KON) na
 *     miniaturkach w warstwie „Rozgrywka”, analogicznie jak na stole;
 * B — bot nie blokował 3/3 kreaturą 2/2 przy 5 życiach (wycena bloku
 *     nie znała presji życia);
 * C — Bone Splinters: modal pokazywał WSEYSTKIE kombinacje (cel ×
 *     poświęcenie) zamiast osobnych wyborów „ptaszkiem” (cel czaru +
 *     stwór do poświęcenia).
 *
 * Plan: docs/plans/PLAN_2026-08-30-m257r5-uwagi-testow.md.
 */

// ---------------------------------------------------------------------------
// Minimalny DOM (wzorzec z m195/m172) — render jest czysty, bez jsdom.
// ---------------------------------------------------------------------------
function withMiniDom(run) {
  class MiniEl {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.listeners = {};
      this.className = ''; this.text = ''; this.dataset = {}; this.disabled = false;
      this.style = {}; this.type = ''; this.checked = false;
      this.classList = { toggle: () => {}, add: () => {}, remove: () => {} };
    }
    set textContent(v) { this.text = String(v); this.children = []; }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
    appendChild(c) { this.children.push(c); return c; }
    replaceChildren(...n) { this.children = n.flat(); }
    addEventListener(t, l) { (this.listeners[t] ??= []).push(l); }
    /**
     * Klik z natywną AKTYWACJĄ (jak w jsdomie Żywego Testera): klik w
     * `<input type=checkbox|radio>` przełącza zaznaczenie i ogłasza `change`;
     * klik w `<label>` trafia w jego ptaszek. M288/A — kreator wielocelowy
     * używa ptaszków `<input>` (takich samych jak wizard walki), więc klik
     * w wiersz MUSI coś znaczyć, inaczej test mierzy pustkę.
     */
    click() {
      const input = this.tagName === 'input' ? this
        : (this.children ?? []).find((c) => c.tagName === 'input') ?? null;
      if (input && (input.type === 'checkbox' || input.type === 'radio')) {
        if (input.disabled) return;
        input.checked = input.type === 'radio' ? true : !input.checked;
        for (const l of input.listeners.change ?? []) l({});
        return;
      }
      for (const l of this.listeners.click ?? []) l({});
    }
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

const DETAILS = {
  id: 'basic-island', name: 'Island', colors: ['U'], types: ['Basic Land', 'Island'],
  subtypes: ['Island'], keywords: [], manaCost: 0, power: null, toughness: null,
  imageUri: 'https://cards.scryfall.io/large/front/x.jpg?1', artId: 42,
};
const SESSION = {
  nameOf: (id) => id ?? '?',
  nameOfObject: (id) => id ?? '?',
  cardDetails: (cardId) => (cardId === 'basic-island' ? DETAILS : null),
};

// ---------------------------------------------------------------------------
// A — hover na miniaturkach w „Rozgrywce”
// ---------------------------------------------------------------------------

test('r5/A: createScryfallHover daje hover ze stałym torem (start/end), null bez warstwy', () => {
  const hover = createScryfallHover({ hoverPreview: { className: 'hover-preview' } });
  assert.ok(hover, 'na desktopie hover istnieje');
  assert.equal(typeof hover.start, 'function');
  assert.equal(typeof hover.end, 'function');
  assert.equal(hover.cycle, undefined, 'bez cyklowania trybów (FOT/KON poza zakresem)');
  assert.equal(createScryfallHover({}), null, 'bez warstwy preview — null');
});

test('r5/A: najechanie na miniaturkę w „Rozgrywce” uruchamia hover z danymi karty', () => {
  withMiniDom((host) => {
    const calls = [];
    const hover = {
      start: (info, e) => calls.push(['start', info?.cardId ?? info?.id ?? info?.name, e]),
      end: () => calls.push(['end']),
    };
    renderBotMoves(host, [{ cardId: 'basic-island', text: 'Nieprzyjaciel zagrywa Island' }], SESSION, { hover });
    const art = host.find((n) => String(n.className).includes('bot-move-card'));
    assert.ok(art, 'miniaturka (bot-move-card) wyrenderowana');
    assert.ok(art.findAll((n) => String(n.className).includes('cardvis')).length > 0,
      'w środku wizual karty (cardvis)');
    art.fire('mouseenter', { clientX: 10, clientY: 20 });
    art.fire('mouseleave');
    assert.deepEqual(calls.map((c) => c[0]), ['start', 'end'], 'mouseenter → start, mouseleave → end');
    const startedInfo = calls[0][1];
    assert.ok(startedInfo === 'basic-island' || startedInfo === 'Island',
      `hover start dostał dane karty: ${JSON.stringify(startedInfo)}`);
  });
});

test('r5/A: bez hovera miniaturka nie dostaje listenerów (dotyk — tap otwiera pełny ekran)', () => {
  withMiniDom((host) => {
    renderBotMoves(host, [{ cardId: 'basic-island', text: 'Nieprzyjaciel zagrywa Island' }], SESSION, {});
    const art = host.find((n) => String(n.className).includes('cardvis'));
    assert.ok(art);
    assert.equal(art.listeners.mouseenter, undefined, 'brak mouseenter bez hovera');
    assert.equal(art.listeners.mouseleave, undefined, 'brak mouseleave bez hovera');
  });
});

// ---------------------------------------------------------------------------
// B — blok pod presją życia (scenariusz właściciela: 5 życia, 2/2 vs 3/3)
// ---------------------------------------------------------------------------

/**
 * Plansza z uwagi: bot (p2) z jednym stworem `blockerPower/blockerTough`,
 * przeciwnik (p1, aktywny) atakuje stworem 3/3. Krok `declare_blockers`,
 * priorytet bota.
 */
function blockScenario(botLife, blockerPower = 2, blockerTough = 2) {
  const state = createGameState({ seed: 3002, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.players.find((p) => p.id === 'p2').life = botLife;
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p2');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  const put = (id, controller, power, toughness) => {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: 'x-test', controllerId: controller,
      ownerId: controller, zone: 'battlefield', kind: 'creature',
      power, toughness, manaCost: 0, abilities: [], keywords: [],
      subtypes: [], types: ['Creature'], colors: [],
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  };
  put('blk', 'p2', blockerPower, blockerTough);
  put('atk1', 'p1', 3, 3);
  state.combat = {
    attackingPlayerId: 'p1', attackers: ['atk1'],
    blockers: new Map(), blockedAttackers: new Set(),
  };
  return state;
}

function blockScores(state) {
  const view = playerView(state, 'p2');
  const bot = createHeuristicBot({ seed: 3002 });
  bot.chooseCommand(view, {});
  const entry = bot.trace().at(-1);
  const opts = entry.options ?? [];
  const pass = opts.find((o) => o.cmd.startsWith('pass'))?.score ?? 0;
  const block = opts.find((o) => o.cmd.startsWith('block[') && o.cmd.includes('blk'))?.score ?? null;
  return { pass, block, choice: bot.lastChoice ?? null, view, bot };
}

test('r5/B: 5 życia — bot BLOKUJE 3/3 stworem 2/2 (scenariusz właściciela)', () => {
  const { pass, block } = blockScores(blockScenario(5));
  assert.ok(block != null, 'oferta bloku 2/2 istnieje');
  assert.ok(block > pass, `blok (${block}) musi wygrywać z passem (${pass}) przy 5 życiach — atak zostawia 2 życia`);
});

test('r5/B: 30 życia — blok 2/2 vs 3/3 NIE wygrywa z passem (anti-overfix: bez presji wycena jak dotąd)', () => {
  const { pass, block } = blockScores(blockScenario(30));
  assert.ok(block != null, 'oferta bloku istnieje (legalna)');
  assert.ok(block < pass, `blok (${block}) poniżej passu (${pass}) przy 30 życiach — wymiana 2/2 za 3 obrażenia bez presji nie ma sensu`);
});

test('r5/B: 5 życia — komenda bota to deklaracja bloku (end-to-end)', () => {
  const state = blockScenario(5);
  const view = playerView(state, 'p2');
  const bot = createHeuristicBot({ seed: 3002 });
  const choice = bot.chooseCommand(view, {});
  assert.equal(choice.type, 'declare_blockers',
    `bot przy 5 życiach ma blokować, wybrał: ${choice.type}`);
  assert.deepEqual((choice.assignments ?? {}).atk1, ['blk'], 'bloker 2/2 przy atakującym 3/3');
});

// ---------------------------------------------------------------------------
// C — Bone Splinters: osobne wybory (cel czaru + poświęcenie), nie iloczyn
// ---------------------------------------------------------------------------

/**
 * Grupa wariantów Bone Splinters w kształcie realnych legalCommands
 * (spells.js: iloczyn celów × ofiary; fizzle cel=ofiara na końcu):
 * cele: foe0 (wrogi), cre0/cre1 (własne); ofiary: cre0/cre1.
 */
function splintersCommands() {
  const mk = (targets, sac) => ({ type: 'cast_spell', objectId: 'spl', targets, sacrificeTargetId: sac });
  return [
    mk(['foe0'], 'cre0'), mk(['foe0'], 'cre1'),
    mk(['cre0'], 'cre1'), mk(['cre1'], 'cre0'),
    mk(['cre0'], 'cre0'), mk(['cre1'], 'cre1'),
  ];
}

test('r5/C: plan „cel + poświęcenie” dla grupy Bone Splinters', () => {
  const plan = sacrificeCastPlanOf(splintersCommands());
  assert.ok(plan, 'grupa pasuje do kreatora');
  assert.equal(plan.sacrificeMode, true);
  assert.deepEqual(plan.targets, ['foe0', 'cre0', 'cre1'], 'pula celów = suma wariantów');
  assert.deepEqual(plan.sacrifices, ['cre0', 'cre1'], 'pula ofiar');
  assert.equal(plan.minTargets, 1);
  assert.equal(plan.maxTargets, 1);
});

test('r5/C: mieszana grupa payAltCost (Lash of the Balrog) ZOSTAJE listą', () => {
  const lash = [
    { type: 'cast_spell', objectId: 'lash', targets: ['foe0'], sacrificeTargetId: 'cre0' },
    { type: 'cast_spell', objectId: 'lash', targets: ['foe0'], sacrificeTargetId: 'cre1' },
    { type: 'cast_spell', objectId: 'lash', targets: ['foe0'], payAltCost: true },
  ];
  assert.equal(sacrificeCastPlanOf(lash), null,
    'wariant „OR pay {4}" bez sacrificeTargetId nie może zostać ukryty w kreatorze');
});

test('r5/C: czar bez celu (Village Rites) i pojedyncza ofiara ZOSTAJĄ listą', () => {
  assert.equal(sacrificeCastPlanOf([
    { type: 'cast_spell', objectId: 'v', targets: [], sacrificeTargetId: 'cre0' },
    { type: 'cast_spell', objectId: 'v', targets: [], sacrificeTargetId: 'cre1' },
  ]), null, 'brak celu = zwykła lista ofiar (i tak czytelna)');
  assert.equal(sacrificeCastPlanOf([
    { type: 'cast_spell', objectId: 's', targets: ['foe0'], sacrificeTargetId: 'cre0' },
    { type: 'cast_spell', objectId: 's', targets: ['foe1'], sacrificeTargetId: 'cre0' },
  ]), null, 'jedna ofiara = jeden wymiar, kreator zbędny');
});

test('r5/C: commandForSacrificeSelection znajduje parę; fizzle cel=ofiara osiągalny', () => {
  const cmds = splintersCommands();
  const clean = commandForSacrificeSelection(cmds, { targets: ['foe0'], sacrifice: 'cre0' });
  assert.ok(clean && clean.targets[0] === 'foe0' && clean.sacrificeTargetId === 'cre0');
  const fizzle = commandForSacrificeSelection(cmds, { targets: ['cre0'], sacrifice: 'cre0' });
  assert.ok(fizzle, 'fizzle (cel = ofiara) musi zostać osiągalny (CR 601.2c/608.2b)');
  assert.equal(commandForSacrificeSelection(cmds, { targets: ['foe0'], sacrifice: 'cre9' }), null,
    'nieistniejąca ofiara = brak komendy (L48)');
  assert.equal(commandForSacrificeSelection(cmds, { targets: ['foe0'], sacrifice: null }), null,
    'brak ofiary = brak komendy (koszt obowiązkowy)');
});

const SAC_VIEW = {
  playerId: 'p2',
  players: [{ id: 'p1', name: 'Nieprzyjaciel' }, { id: 'p2', name: 'Ty' }],
  zones: {
    battlefield: [
      { id: 'cre0', cardId: 'hill-giant' }, { id: 'cre1', cardId: 'hill-giant' },
      { id: 'foe0', cardId: 'hill-giant' },
    ],
    hand: [{ id: 'spl', cardId: 'bone-splinters' }], stack: [], graveyard: [], library: [],
  },
};
const SAC_SESSION = {
  nameOf: (cardId) => ({ 'hill-giant': 'Gigant', 'bone-splinters': 'Bone Splinters' }[cardId] ?? cardId),
  nameOfObject: (id) => id,
};

function sacWizard(host, plan, commands, onDone) {
  return renderMultiTargetWizard(host, {
    view: SAC_VIEW, session: SAC_SESSION, plan, commands,
    sourceName: 'Bone Splinters',
    slotLabels: ['stwór', 'Poświęcenie (koszt)'],
    onComplete: (cmd) => onDone?.(cmd),
  });
}

test('r5/C: kreator ma DWA osobne wybory ptaszkiem i oddaje komendę z legalCommands', () => {
  withMiniDom((host) => {
    const cmds = splintersCommands();
    const plan = sacrificeCastPlanOf(cmds);
    let done = null;
    sacWizard(host, plan, cmds, (cmd) => { done = cmd; });
    const labels = host.findAll((n) => String(n.className).includes('multi-target-slot-label'))
      .map((n) => n.textContent);
    assert.ok(labels.some((l) => l.includes('stwór')), `sekcja celu (${JSON.stringify(labels)})`);
    assert.ok(labels.some((l) => l.includes('Poświęcenie')), 'sekcja poświęcenia');
    const rows = host.findAll((n) => String(n.className).includes('multi-target-toggle'));
    assert.equal(rows.length, 5, '3 cele + 2 ofiary = 5 wierszy (nie 6 kombinacji!)');
    // M288/A: stan siedzi w ptaszku (`checked`), a nazwa w wierszu — dawny
    // filtr po przedrostku „[ ]” nie ma czego szukać.
    const toggle = (text) => host.findAll((n) => String(n.className).includes('multi-target-row'))
      .filter((row) => row.textContent.includes(text))
      .map((row) => (row.children ?? []).find((c) => String(c.tagName).toLowerCase() === 'input' && !c.checked))
      .find(Boolean);
    const confirmBtn = host.find((n) => String(n.className).includes('multi-target-confirm'));
    assert.ok(confirmBtn.disabled, 'zatwierdź wyłączone bez wyborów');
    toggle('Gigant').click();            // cel = pierwszy Gigant (foe0 w puli)
    assert.ok(confirmBtn.disabled, 'brak poświęcenia = dalej wyłączone');
    const sac = host.findAll((n) => String(n.className).includes('multi-target-slot-label'))
      .find((n) => n.textContent.includes('Poświęcenie'));
    // po sekcji Poświęcenie idą wiersze ofiar
    const all = host.all();
    const sacIdx = all.indexOf(sac);
    const sacRows = all.slice(sacIdx + 1).filter((n) => n && String(n.className).includes('multi-target-toggle'));
    assert.equal(sacRows.length, 2, 'dwie ofiary');
    sacRows[0].click();                  // ofiara = cre0
    assert.ok(!confirmBtn.disabled, 'cel + ofiara = zatwierdź aktywne');
    assert.match(host.find((n) => String(n.className).includes('multi-target-status')).textContent, /Wybrano/, 'status potwierdza wybór');
    confirmBtn.click();
    assert.ok(done, 'onComplete otrzymał komendę');
    assert.equal(done.targets[0], 'foe0');
    assert.equal(done.sacrificeTargetId, 'cre0');
    assert.ok(cmds.includes(done), 'komenda to WŁAŚNIE komenda z legalCommands (L48)');
  });
});

test('r5/C: nakładające się pule — własny stwór jako cel I ofiara; fizzle cel=ofiara', () => {
  withMiniDom((host) => {
    const cmds = splintersCommands();
    const plan = sacrificeCastPlanOf(cmds);
    let done = null;
    sacWizard(host, plan, cmds, (cmd) => { done = cmd; });
    const all = host.all();
    const isToggle = (n) => n && String(n.className).includes('multi-target-toggle');
    const firstToggleIdx = all.findIndex(isToggle);
    const sacLabelIdx = all.findIndex((n) => n && String(n.className).includes('multi-target-slot-label')
      && n.textContent.includes('Poświęcenie'));
    const targetRows = all.slice(firstToggleIdx, sacLabelIdx).filter(isToggle);
    const sacRows = all.slice(sacLabelIdx + 1).filter(isToggle);
    assert.equal(targetRows.length, 3, 'pula celów');
    assert.equal(sacRows.length, 2, 'pula ofiar');
    targetRows[1].click();                 // cel = własny cre0 (drugi w puli)
    const sameIdInSac = sacRows[0];        // ofiara cre0 — ten sam obiekt co cel
    sameIdInSac.click();                   // fizzle: cel = ofiara
    const confirmBtn = host.find((n) => String(n.className).includes('multi-target-confirm'));
    assert.ok(!confirmBtn.disabled, 'fizzle cel=ofiara jest DOZWOLONY i osiągalny');
    confirmBtn.click();
    assert.ok(done && done.targets[0] === 'cre0' && done.sacrificeTargetId === 'cre0',
      `fizzle oddany jako legalna komenda: ${JSON.stringify(done)}`);
  });
});
