// =============================================================================
// K (zgłoszenie właściciela 2026-09-19b) — Crumb and Get It:
//
//   „Można ją rzucić z obiecaniem giftu albo bez. Ale opcje pokazują mi się
//    od razu w »Twoje działania« zamiast dopiero po rzuceniu karty w modalu
//    wyboru. Tak to nie powinno wyglądać. Wszystkie czary, które wymagają
//    jakiejś decyzji podczas rzucania, powinny mieć najpierw ofertę rzucenia
//    w »Twoje działania«, a dopiero potem modal wyboru sposobu rzucenia.”
//
// Kontrakt (CR 702.174a — dar to decyzja „as you cast this spell”, więc obie
// obietnice należą do JEDNEGO rzutu, nie do dwóch rzutów):
//   1. panel „Twoje działania” ma JEDEN wpis na czar (bez wariantów daru);
//   2. modal pokazuje cele i obietnicę daru jako osobne kontrolki, nie wiersze
//      na każdą permutację target×gift;
//   3. „Zatwierdź” działa tylko dla kombinacji obecnej w legalCommands.
//
// Reguła jest generyczna (ADR 0002 — po KSZTAŁCIE komendy, nie po karcie):
// decyzja gift i klucz grupowania są testowane dla syntetycznych komend
// rzutu celowanego i płatności phyrexian, nie dla nazwy Crumb and Get It.
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { buildActionEntries, choiceRequestGroupKey, commandLabel, choiceGroupTitle } from '../src/table/render.js';
import { multiTargetPlanOf } from '../src/table/multi-target.js';
import { renderMultiTargetWizard } from '../src/table/choice-request.js';

const REGISTRY = createCardRegistry();
const SESSION = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? id,
  nameOfObject: (id) => REGISTRY.get(String(id).split('#')[0])?.name ?? id,
  cardDetails: (id) => REGISTRY.get(id),
  abilitiesOf: (id) => gameObjectDataOf(REGISTRY.get(id)).abilities ?? [],
  colorsOf: () => [],
};

let counter = 0;

/** Stół: Crumb and Get It w ręce, własny stwór na polu, mana {W}. */
function giftBoard() {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  const put = (cardId, zone, controllerId = 'p1') => {
    const def = REGISTRY.get(cardId);
    assert.ok(def, `karta ${cardId} istnieje`);
    const data = gameObjectDataOf(def);
    const id = `${cardId}#${counter += 1}`;
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
      kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
      abilities: data.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
      types: def.types ?? [], colors: data.colors ?? [], cardName: def.name, spell: def.spell,
      // Dar żyje na OBIEKCIE karty (kontrakt addObject), nie w danych materiału.
      gift: def.gift ?? null,
    });
    return id;
  };
  put('basic-plains', 'battlefield');
  put('basic-plains', 'battlefield');
  const nabywca = put('dawntreader-elk', 'battlefield');
  put('kin-tree-nurturer', 'battlefield');
  const spellId = put('crumb-and-get-it', 'hand');
  addMana(state, 'p1', 1, { colors: ['W'] });
  return { state, spellId, nabywca };
}

function withMiniDom(run) {
  class MiniEl {
    constructor(tag) {
      this.tagName = tag;
      this.children = [];
      this.listeners = {};
      this.className = '';
      this.text = '';
      this.dataset = {};
      this.disabled = false;
      this.type = '';
      this.name = '';
      this.checked = false;
      this.classList = { toggle() {}, add() {}, remove() {} };
    }
    set textContent(value) { this.text = String(value); this.children = []; }
    get textContent() { return this.text + this.children.map((child) => child.textContent).join(''); }
    set innerHTML(value) { this.text = String(value).replace(/<[^>]*>/g, ''); this.children = []; }
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren(...children) { this.children = children.flat(); }
    addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
    click() {
      const input = this.tagName === 'input' ? this
        : this.children.find((child) => child.tagName === 'input') ?? null;
      if (input && (input.type === 'checkbox' || input.type === 'radio')) {
        if (input.disabled) return;
        input.checked = input.type === 'radio' ? true : !input.checked;
        for (const listener of input.listeners.change ?? []) listener({});
        return;
      }
      for (const listener of this.listeners.click ?? []) listener({});
    }
    all() { return [this, ...this.children.flatMap((child) => child.all?.() ?? [child])]; }
    find(predicate) { return this.all().find(predicate); }
    findAll(predicate) { return this.all().filter(predicate); }
  }
  globalThis.document = globalThis.document ?? {};
  const oldCreateElement = globalThis.document.createElement;
  globalThis.document.createElement = (tag) => new MiniEl(tag);
  try { return run(new MiniEl('div')); } finally {
    if (oldCreateElement) globalThis.document.createElement = oldCreateElement;
    else delete globalThis.document.createElement;
  }
}

test('K/1: dar nie rozbija rzutu na dwa wpisy panelu (klucz grupowania)', () => {
  const bazowy = { type: 'cast_spell', objectId: 'obj', targets: ['cel'] };
  const zDarem = { ...bazowy, gifted: true, giftRecipientId: 'p2' };
  assert.equal(choiceRequestGroupKey(zDarem), choiceRequestGroupKey(bazowy),
    'wariant daru należy do TEJ SAMEJ grupy co rzut bazowy (CR 702.174a)');
  const phyrexian = { type: 'cast_spell', objectId: 'obj', phyrexianPayWithLife: 1 };
  assert.equal(choiceRequestGroupKey({ ...phyrexian, gifted: true, giftRecipientId: 'p2' }),
    choiceRequestGroupKey(phyrexian),
    'ta sama reguła dla wariantu płatności phyrexian');
});

test('K/2: panel pokazuje JEDEN wpis czaru, a dar jest wariantem w modalu', () => {
  const { state } = giftBoard();
  const view = playerView(state, 'p1');
  const czary = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.gifted);
  assert.ok(czary.length >= 1, 'silnik oferuje wariant z darem (CR 702.174a)');
  const wpisy = buildActionEntries(view.legalCommands, SESSION, view)
    .filter((e) => e.request?.options?.some((c) => c.type === 'cast_spell')
      || e.command?.type === 'cast_spell');
  assert.equal(wpisy.length, 1,
    `jeden wpis na czar w panelu, nie osobne przyciski wariantów: ${JSON.stringify(wpisy.map((w) => w.request ? 'modal' : w.command))}`);
  const modal = wpisy[0].request;
  assert.ok(modal, 'wpis czaru otwiera modal wyboru sposobu rzucenia (K)');
  const warianty = modal.options.filter((c) => c.type === 'cast_spell');
  assert.ok(warianty.some((c) => c.gifted), 'modal niesie wariant z darem');
  assert.ok(warianty.some((c) => !c.gifted), 'modal niesie wariant bez daru');
});

test('K/3: warianty w modalu są rozróżnialne — dar jest nazwany', () => {
  const { state } = giftBoard();
  const view = playerView(state, 'p1');
  const modal = buildActionEntries(view.legalCommands, SESSION, view)
    .find((e) => e.request?.options?.some((c) => c.type === 'cast_spell'))?.request;
  const etykiety = modal.options
    .filter((c) => c.type === 'cast_spell')
    .map((c) => commandLabel(c, SESSION, view).replace(/<[^>]*>/g, ''));
  const zDarem = etykiety.find((l) => /dar/i.test(l));
  assert.ok(zDarem, `etykieta wariantu z darem mówi o darze: ${JSON.stringify(etykiety)}`);
  assert.equal(new Set(etykiety).size, etykiety.length,
    `warianty o RÓŻNYM skutku nie mogą mieć identycznych etykiet: ${JSON.stringify(etykiety)}`);
});

test('K/4 (anty-over-fix): wybór daru nadal dociera do silnika jako wariant komendy', () => {
  const { state } = giftBoard();
  const view = playerView(state, 'p1');
  const zDarem = view.legalCommands.find((c) => c.type === 'cast_spell' && c.gifted);
  assert.equal(zDarem.gifted, true, 'komenda niesie obietnicę daru');
  assert.ok(zDarem.giftRecipientId, 'komenda wskazuje odbiorcę daru (CR 702.174a)');
});

test('G/1: modal rozdziela cele i Gift na osobne radio-kontrolki, a tytuł nie wycieka HTML-em', () => {
  const { state } = giftBoard();
  const view = playerView(state, 'p1');
  const request = buildActionEntries(view.legalCommands, SESSION, view)
    .find((entry) => entry.request?.options?.some((cmd) => cmd.type === 'cast_spell'))?.request;
  const commands = request.options.filter((cmd) => cmd.type === 'cast_spell');
  const plan = multiTargetPlanOf(commands);
  assert.ok(plan, 'czar z celami i Gift idzie przez wspólny picker');
  assert.equal(plan.targets.length, 2, 'w planie są wszystkie dwa legalne cele');
  assert.equal(plan.giftMode, true, 'obietnica daru jest osobną decyzją tak/nie');
  assert.equal(commands.length, plan.targets.length * 2,
    'silnik zachowuje legalne warianty dla bota; człowiek dostaje wymiary, nie ich iloczyn');

  const title = choiceGroupTitle(request, SESSION, view);
  assert.doesNotMatch(title, /<span\s+class="ms-group"/, 'tytuł modala nie zawiera surowego HTML many');
  assert.match(title, /\{W\}/, 'tytuł pokazuje koszt w czytelnym zapisie tekstowym');

  let submitted = null;
  withMiniDom((host) => {
    renderMultiTargetWizard(host, {
      view,
      session: SESSION,
      plan,
      commands,
      intro: `${title} — wybierz cel i zdecyduj, czy obiecać dar:`,
      onComplete: (cmd) => { submitted = cmd; },
      onCancel: () => {},
    });
    const intro = host.find((node) => String(node.className).includes('choice-request-intro'));
    assert.ok(intro);
    assert.doesNotMatch(intro.textContent, /<span\s+class="ms-group"/, 'nagłówek jest zwykłym tekstem, bez surowych tagów');

    const targetInputs = host.findAll((node) => node.tagName === 'input' && node.name === 'multi-target-single');
    const giftInputs = host.findAll((node) => node.tagName === 'input' && node.name === 'multi-target-gift');
    assert.equal(targetInputs.length, 2, 'po jednym wierszu na legalny cel, nie na target×gift');
    assert.equal(giftInputs.length, 2, 'dwa wiersze decyzji: obiecać / nie obiecywać');
    assert.ok(targetInputs.every((input) => input.type === 'radio'), 'dokładnie jeden cel można wskazać');
    assert.ok(giftInputs.every((input) => input.type === 'radio'), 'tak/nie to osobna grupa radio');

    const confirm = host.find((node) => String(node.className).includes('multi-target-confirm'));
    assert.equal(confirm.disabled, true, 'nie można zatwierdzić bez obu wyborów');
    targetInputs[0].click();
    assert.equal(confirm.disabled, true, 'sam cel nie stanowi kompletnej decyzji');
    const yesInput = giftInputs.find((input) => {
      const row = host.find((node) => node.tagName === 'label' && node.children.includes(input));
      return row?.textContent.includes('Tak');
    });
    yesInput.click();
    assert.equal(confirm.disabled, false, 'legalne target+Gift odblokowuje zatwierdzenie');
    confirm.click();
  });

  assert.ok(commands.includes(submitted), 'zatwierdzenie oddaje dokładną komendę z legalCommands');
  assert.equal(submitted.targets[0], plan.targets[0]);
  assert.equal(submitted.gifted, true);
  assert.equal(submitted.giftRecipientId, 'p2');
});

test('G/2: nielegalne target+Gift pozostaje niezatwierdzalne', () => {
  const commands = [
    { type: 'cast_spell', objectId: 'spell', targets: ['a'], gifted: false },
    { type: 'cast_spell', objectId: 'spell', targets: ['b'], gifted: false },
    { type: 'cast_spell', objectId: 'spell', targets: ['a'], gifted: true, giftRecipientId: 'p2' },
  ];
  const plan = multiTargetPlanOf(commands);
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    zones: { battlefield: [
      { id: 'a', cardId: 'hill-giant', controllerId: 'p1' },
      { id: 'b', cardId: 'goblin-piker', controllerId: 'p1' },
    ] },
  };
  let submitted = null;
  withMiniDom((host) => {
    renderMultiTargetWizard(host, {
      view, session: SESSION, plan, commands, intro: 'Wybierz cel i obietnicę daru:',
      onComplete: (cmd) => { submitted = cmd; }, onCancel: () => {},
    });
    const targetInputs = host.findAll((node) => node.tagName === 'input' && node.name === 'multi-target-single');
    const giftInputs = host.findAll((node) => node.tagName === 'input' && node.name === 'multi-target-gift');
    const confirm = host.find((node) => String(node.className).includes('multi-target-confirm'));
    const noInput = giftInputs.find((input) => {
      const row = host.find((node) => node.tagName === 'label' && node.children.includes(input));
      return row?.textContent.includes('Nie');
    });
    const yesInput = giftInputs.find((input) => {
      const row = host.find((node) => node.tagName === 'label' && node.children.includes(input));
      return row?.textContent.includes('Tak');
    });

    targetInputs[1].click(); // b + Gift jest nieobecne z legalCommands.
    yesInput.click();
    assert.equal(confirm.disabled, true, 'nielegalna para target=b + Gift=yes nie może być zatwierdzona');
    noInput.click();
    assert.equal(confirm.disabled, false, 'legalna para target=b + Gift=no jest zatwierdzalna');
    confirm.click();
  });
  assert.equal(submitted, commands[1], 'wybrano dokładną legalną komendę dla target=b bez daru');
});

test('G/3: w grze wieloosobowej odbiorca Gift jest osobny i wymagany przy „tak”', () => {
  const commands = [];
  for (const target of ['a', 'b']) {
    commands.push({ type: 'cast_spell', objectId: 'spell', targets: [target], gifted: false });
    for (const giftRecipientId of ['p2', 'p3']) {
      commands.push({ type: 'cast_spell', objectId: 'spell', targets: [target], gifted: true, giftRecipientId });
    }
  }
  const plan = multiTargetPlanOf(commands);
  assert.ok(plan);
  assert.deepEqual(plan.giftRecipientIds, ['p2', 'p3']);
  const view = {
    playerId: 'p1',
    players: [
      { id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Przeciwnik 1' }, { id: 'p3', name: 'Przeciwnik 2' },
    ],
    zones: { battlefield: [
      { id: 'a', cardId: 'hill-giant', controllerId: 'p1' },
      { id: 'b', cardId: 'goblin-piker', controllerId: 'p1' },
    ] },
  };
  let submitted = null;
  withMiniDom((host) => {
    renderMultiTargetWizard(host, {
      view, session: SESSION, plan, commands, intro: 'Wybierz cel, obietnicę i odbiorcę daru:',
      onComplete: (cmd) => { submitted = cmd; }, onCancel: () => {},
    });
    const targetInputs = host.findAll((node) => node.tagName === 'input' && node.name === 'multi-target-single');
    const giftInputs = host.findAll((node) => node.tagName === 'input' && node.name === 'multi-target-gift');
    const recipientInputs = host.findAll((node) => node.tagName === 'input' && node.name === 'multi-target-gift-recipient');
    const confirm = host.find((node) => String(node.className).includes('multi-target-confirm'));
    assert.equal(targetInputs.length, 2);
    assert.equal(giftInputs.length, 2);
    assert.equal(recipientInputs.length, 2, 'odbiorcy są osobną listą, nie kombinacjami z celem');
    assert.ok(recipientInputs.every((input) => input.disabled), 'odbiorca jest nieaktywny, dopóki daru nie obiecano');

    targetInputs[0].click();
    giftInputs.find((input) => {
      const row = host.find((node) => node.tagName === 'label' && node.children.includes(input));
      return row?.textContent.includes('Tak');
    }).click();
    assert.ok(recipientInputs.every((input) => !input.disabled), 'wybór „tak” udostępnia odbiorcę');
    assert.equal(confirm.disabled, true, 'bez odbiorcy nie da się zatwierdzić Gift w grze wieloosobowej');
    recipientInputs[1].click();
    assert.equal(confirm.disabled, false, 'cel+gift+odbiorca z legalCommands jest zatwierdzalny');
    confirm.click();
  });
  assert.ok(commands.includes(submitted));
  assert.equal(submitted.targets[0], 'a');
  assert.equal(submitted.gifted, true);
  assert.equal(submitted.giftRecipientId, 'p3');
});
