// Bug B z playtestu (Vaan, Street Thief — `resolve_exile_cast`):
//
//   Gdy gracz wybiera rzut wygnanej karty przeciwnika z okna Vaana
//   (`resolve_exile_cast` z `cast: true`) i ma niejednoznaczną płatność many
//   (np. kilka różnych źródeł / kolorów / Skarb / dork), kreator many
//   (`Mana Wizard`) NIE otwierał się — `paymentDescriptorOf` odrzucał typ
//   `resolve_exile_cast`, więc `play()` wysyłało `playDirect(cmd)` i silnik
//   auto-tapował pierwsze lepsze lądy (CR 601.2g: wybór źródeł należy do
//   gracza). Ponadto bramka `state.pendingExileCast` w `execute` nie miała
//   wyjątku `!manaGeneratingCommandFor`, więc nawet po otwarciu kreatora
//   komendy `tap_for_mana` / manowe `activate_ability` byłyby odrzucane
//   z `exile_cast_unresolved`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import * as manaWizard from '../src/table/mana-wizard.js';
import { buildActionEntries } from '../src/table/render.js';
import { expandManaPool, producibleMana, canPayColoredCost } from '../src/engine/resources.js';
import { getSourceForObject, manaAbilityProductionOf, isSingleManualTapColorAbility } from '../src/engine/mana-sources.js';
import { activatableAbilities } from '../src/engine/permanents.js';
import { effectiveSpellManaCost } from '../src/engine/spells.js';
import { parseManaCost, reduceAlternativeCost } from '../src/engine/mana-cost.js';
import { attachAuraToCreature, bestowedSpellCharacteristics } from '../src/engine/attachments.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';

const {
  finishWizardPayment, paymentDescriptorOf, shouldOpenManaWizard, manaSourcesOf,
  wizardProgress, WIZARD_PAYMENT_COMMAND_TYPES,
} = manaWizard;

const mainSource = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
function localFunction(name) {
  const from = mainSource.indexOf(`  function ${name}(`);
  const end = mainSource.indexOf('\n  }', from);
  assert.ok(from >= 0 && end > from, `main.js musi mieć funkcję ${name}`);
  return mainSource.slice(from, end + 4);
}

function attachAura(state, auraId, hostId) {
  const aura = state.objects.get(auraId);
  const host = state.objects.get(hostId);
  state.objects.set(auraId, Object.freeze({ ...aura, attachedTo: hostId }));
  state.objects.set(hostId, Object.freeze({
    ...host,
    attachments: [...(host.attachments ?? []), auraId],
  }));
}

function vaanScene({
  exiledCardId = 'highland-game',
  lands = ['basic-forest', 'basic-mountain', 'basic-swamp'],
  extraBattlefield = [],
  aurasOnFirstLand = [],
  pool = null,
} = {}) {
  const registry = createCardRegistry();
  const session = createSession({
    seed: 348,
    registry,
    decks: new Map([
      [HUMAN_ID, Array(20).fill('basic-forest')],
      [BOT_ID, Array(20).fill('basic-forest')],
    ]),
  });
  session.apply(session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice' && c.keep));
  const state = session.state;
  state.turn = jumpToStep(state.turn, 'combat_damage', HUMAN_ID);
  state.turn.activePlayerId = HUMAN_ID;
  state.turn.priorityPlayerId = HUMAN_ID;

  function put(id, cardId, zone, ownerId = HUMAN_ID, controllerId = ownerId) {
    const card = registry.get(cardId);
    addObject(state, {
      id,
      instanceId: `i-${id}`,
      cardId,
      zone,
      controllerId,
      ownerId,
      ...gameObjectDataOf(card),
      types: card.types,
      subtypes: card.subtypes,
      keywords: card.keywords,
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  }

  put('vaan-hero', 'vaan-street-thief', 'battlefield', HUMAN_ID);
  lands.forEach((cardId, i) => put(`vaan-land-${i}`, cardId, 'battlefield', HUMAN_ID));
  extraBattlefield.forEach((spec, i) => {
    const item = typeof spec === 'string' ? { id: `vaan-extra-${i}`, cardId: spec, ownerId: HUMAN_ID } : spec;
    put(item.id ?? `vaan-extra-${i}`, item.cardId, 'battlefield', item.ownerId ?? HUMAN_ID);
  });
  aurasOnFirstLand.forEach((cardId, i) => {
    put(`vaan-aura-${i}`, cardId, 'battlefield', BOT_ID);
    attachAuraToCreature(state, `vaan-aura-${i}`, 'vaan-land-0');
  });
  put('vaan-stolen', exiledCardId, 'exile', BOT_ID, BOT_ID);
  if (pool) {
    const p1 = state.players.find((p) => p.id === HUMAN_ID);
    Object.assign(p1, pool);
  }
  state.pendingExileCast = {
    playerId: HUMAN_ID,
    objectId: 'vaan-stolen',
    cardId: exiledCardId,
    sourceId: 'vaan-hero',
    restorePriorityTo: HUMAN_ID,
  };
  return { session, state, registry };
}

function buildRouter(session, registry) {
  let rendered = null;
  let handlers = null;
  const notices = [];
  const ctx = createContext({
    session,
    HUMAN_ID,
    manaWizardParents: [],
    manaWizardDescriptor: null,
    els: { manaWizardBody: {} },
    registry,
    MANA_COSTS,
    parseManaCost,
    reduceAlternativeCost,
    bestowedSpellCharacteristics,
    effectiveSpellManaCost,
    paymentDescriptorOf,
    shouldOpenManaWizard,
    manaSourcesOf,
    wizardProgress,
    getSourceForObject,
    manaAbilityProductionOf,
    isSingleManualTapColorAbility,
    activatableAbilities,
    expandManaPool,
    producibleMana,
    canPayColoredCost,
    renderManaWizard: (_host, model, h) => {
      rendered = model;
      handlers = h;
    },
    wizardSourceName: (s) => s.id,
    finishWizardPayment,
    autosave: () => {},
    rerender: () => {},
    showBotMoves: () => {},
    showNotice: (msg) => notices.push(msg),
    showModal: () => {},
    hideModal: () => {},
  });
  runInContext([
    'restrictedSpellBlockedFor',
    'selfTapExclusionFor',
    'manaSourcesForPlayer',
    'manaWizardFor',
    'refreshManaWizard',
    'playDirect',
    'manaSourceTapPlan',
    'openNestedManaWizard',
    'returnToParentManaWizard',
    'closeManaWizard',
  ].map(localFunction).join('\n'), ctx);
  return { ctx, rendered: () => rendered, handlers: () => handlers, notices };
}

test('Vaan/1: rzut z okna Vaana przy niejednoznacznych lądach otwiera Mana Wizard i pozwala wybrać które źródła tapnąć', () => {
  const { session, state, registry } = vaanScene({
    exiledCardId: 'highland-game', // {1}{G}
    lands: ['basic-forest', 'basic-mountain', 'basic-swamp'],
  });
  assert.ok(WIZARD_PAYMENT_COMMAND_TYPES.has('resolve_exile_cast'),
    'resolve_exile_cast należy do rodziny komend płatności kreatora');

  const castCmd = session.view().legalCommands.find((c) => c.type === 'resolve_exile_cast' && c.cast === true);
  assert.ok(castCmd, 'silnik oferuje rzut wygnanej karty');

  const { ctx, rendered, handlers } = buildRouter(session, registry);
  const descriptor = ctx.manaWizardFor(castCmd);
  assert.ok(descriptor, 'niejednoznaczna płatność {1}{G} z Forest/Mountain/Swamp otwiera Mana Wizard');
  assert.equal(descriptor.totalNeeded, 2);
  assert.deepEqual(descriptor.requirements, [['G']]);

  ctx.manaWizardDescriptor = descriptor;
  ctx.refreshManaWizard();
  assert.equal(rendered().untappedSources.length, 3);

  // Gracz świadomie wybiera Forest + Swamp, zostawiając Mountain nietapnięty.
  handlers().onTapSource('vaan-land-0'); // Forest
  assert.ok(state.pendingExileCast, 'po tapnięciu pierwszego źródła decyzja Vaana nadal czeka');
  assert.equal(state.objects.get('vaan-land-0').tapped, true);

  handlers().onTapSource('vaan-land-2'); // Swamp (Mountain vaan-land-1 nietapnięty!)
  assert.equal(state.pendingExileCast, null, 'po zebraniu kosztu rzut automatycznie domknął decyzję');
  assert.equal(state.objects.get('vaan-land-1').tapped, false, 'niewybrany Mountain pozostał nietapnięty');
  assert.equal(state.objects.get('vaan-land-2').tapped, true, 'wybrany Swamp został tapnięty');

  // Rozstrzygamy trigger Vaana (+1/+1 na Scouty) oraz Highland Game na stosie.
  for (let i = 0; i < 6 && state.zones.stack.length > 0; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    assert.ok(execute(state, pass).ok);
  }
  const castCreature = [...state.objects.values()].find((o) => o.cardId === 'highland-game' && o.zone === 'battlefield');
  assert.ok(castCreature, 'rzucony stwór wszedł na pole bitwy');
  assert.equal(castCreature.controllerId, HUMAN_ID);
  assert.equal(castCreature.ownerId, BOT_ID);
});

test('Vaan/2: rezygnacja (cast: false) oraz jednoznaczna płatność NIE otwierają Mana Wizarda', () => {
  const { session, registry } = vaanScene({
    exiledCardId: 'highland-game', // {1}{G}
    lands: ['basic-forest', 'basic-mountain'], // dokładnie jeden wariant źródeł
  });
  const declineCmd = session.view().legalCommands.find((c) => c.type === 'resolve_exile_cast' && c.cast === false);
  const castCmd = session.view().legalCommands.find((c) => c.type === 'resolve_exile_cast' && c.cast === true);
  assert.ok(declineCmd && castCmd);

  const { ctx } = buildRouter(session, registry);
  assert.equal(paymentDescriptorOf(declineCmd, session.view()), null, 'odmowa nie ma kosztu many');
  assert.equal(ctx.manaWizardFor(declineCmd), null, 'odmowa nie otwiera kreatora');
  assert.equal(ctx.manaWizardFor(castCmd), null, 'jeden wariant płatności zostaje na auto-tapie (M202/O)');
});

test('Vaan/3: nie-lądowe źródło many (Skarb) pojawia się w Mana Wizardzie obok lądu i jest ukryte w panelu akcji', () => {
  const { session, state, registry } = vaanScene({
    exiledCardId: 'highland-game', // {1}{G}
    lands: ['basic-forest', 'basic-mountain'],
    extraBattlefield: ['token_treasure'],
  });
  const view = session.view();
  const treasureManaCmd = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'vaan-extra-0');
  assert.ok(treasureManaCmd, 'silnik oferuje zdolność many Skarba w trakcie pendingExileCast');

  // Panel „Twoje działania” nie zaśmieca się zdolnością many (filtr isManaAbilityCommand).
  const actionEntries = buildActionEntries(view.legalCommands, session, view);
  assert.equal(actionEntries.some((e) => e.command?.type === 'activate_ability'), false,
    'zdolność many Skarba nie trafia jako przycisk do panelu akcji');

  const castCmd = view.legalCommands.find((c) => c.type === 'resolve_exile_cast' && c.cast === true);
  const { ctx, rendered, handlers } = buildRouter(session, registry);
  const descriptor = ctx.manaWizardFor(castCmd);
  assert.ok(descriptor, 'Forest + Mountain vs Forest + Skarb daje >=2 warianty i otwiera Mana Wizard');
  ctx.manaWizardDescriptor = descriptor;
  ctx.refreshManaWizard();
  assert.ok(rendered().untappedSources.some((s) => s.id === 'vaan-extra-0'), 'Skarb widoczny jako źródło w kreatorze');

  handlers().onTapSource('vaan-land-0'); // Forest
  handlers().onTapSource('vaan-extra-0'); // poświęcenie Skarba
  assert.equal(state.pendingExileCast, null, 'decyzja domknięta po użyciu Foresta i Skarba');
  assert.equal(state.objects.get('vaan-land-1').tapped, false, 'Mountain pozostał nietapnięty');
});

test('Vaan/4: Powerstone zablokowany dla nie-artefaktu i dostępny dla artefaktu; bestow, xBlack i obniżka kosztu dla nowego kontrolera', () => {
  // (a) Powerstone vs nie-artefakt + artefakt
  {
    const nonArt = vaanScene({
      exiledCardId: 'highland-game', // non-artifact
      lands: ['basic-forest', 'basic-mountain', 'basic-swamp'],
      extraBattlefield: ['token_powerstone'],
    });
    const r1 = buildRouter(nonArt.session, nonArt.registry);
    const cast1 = nonArt.session.view().legalCommands.find((c) => c.type === 'resolve_exile_cast' && c.cast === true);
    const d1 = r1.ctx.manaWizardFor(cast1);
    assert.ok(d1);
    assert.equal(r1.ctx.restrictedSpellBlockedFor(cast1, d1), true, 'Powerstone zablokowany dla nie-artefaktu');
    r1.ctx.manaWizardDescriptor = d1;
    r1.ctx.refreshManaWizard();
    assert.equal(r1.rendered().untappedSources.some((s) => s.id === 'vaan-extra-0'), false,
      'Powerstone ukryty w kreatorze dla nie-artefaktu');

    const art = vaanScene({
      exiledCardId: 'myr-scrapling', // {1} Artifact Creature
      lands: ['basic-forest', 'basic-mountain'],
      extraBattlefield: ['token_powerstone'],
    });
    const r2 = buildRouter(art.session, art.registry);
    const cast2 = art.session.view().legalCommands.find((c) => c.type === 'resolve_exile_cast' && c.cast === true);
    const d2 = r2.ctx.manaWizardFor(cast2);
    assert.ok(d2);
    assert.equal(r2.ctx.restrictedSpellBlockedFor(cast2, d2), false, 'Powerstone dozwolony dla artefaktu z exile');
    r2.ctx.manaWizardDescriptor = d2;
    r2.ctx.refreshManaWizard();
    assert.equal(r2.rendered().untappedSources.some((s) => s.id === 'vaan-extra-0'), true,
      'Powerstone widoczny w kreatorze dla artefaktu z exile');
  }

  // (b) Consume Spirit (xCost.black === true)
  {
    const { session, registry } = vaanScene({
      exiledCardId: 'consume-spirit', // {X}{1}{B}
      lands: ['basic-swamp', 'basic-swamp', 'basic-mountain', 'basic-forest'],
    });
    const castX1 = session.view().legalCommands.find(
      (c) => c.type === 'resolve_exile_cast' && c.cast === true && c.xValue === 1,
    );
    assert.ok(castX1, 'oferta z xValue=1');
    const { ctx } = buildRouter(session, registry);
    const d = ctx.manaWizardFor(castX1);
    assert.ok(d);
    assert.equal(d.totalNeeded, 3);
    assert.deepEqual(d.requirements, [['B'], ['B']], 'X w Consume Spirit wymaga czarnej many także z okna Vaana');
  }

  // (c) Bestow z exile (Leafcrown Dryad: creature {1}{G}, bestow {3}{G})
  {
    const { session, registry } = vaanScene({
      exiledCardId: 'leafcrown-dryad',
      lands: ['basic-forest', 'basic-mountain', 'basic-swamp', 'basic-island', 'basic-plains'],
    });
    const bestowCmd = session.view().legalCommands.find(
      (c) => c.type === 'resolve_exile_cast' && c.cast === true && c.bestow === true,
    );
    assert.ok(bestowCmd, 'oferta bestow dla wygnanej karty z bestow');
    const { ctx } = buildRouter(session, registry);
    const d = ctx.manaWizardFor(bestowCmd);
    assert.ok(d, 'kreator rozpoznaje koszt bestow w resolve_exile_cast');
    assert.equal(d.totalNeeded, 4);
    assert.deepEqual(d.requirements, [['G']]);
  }

  // (d) Obniżka kosztu dla KONTROLERA rzutu (Etherium Sculptor u HUMAN_ID, karta przeciwnika w exile)
  {
    const { session, registry } = vaanScene({
      exiledCardId: 'etherium-sculptor', // {1}{U} Artifact Creature
      lands: ['basic-island', 'basic-mountain', 'basic-forest'],
      extraBattlefield: ['etherium-sculptor'], // obniża artefakty kontrolera o {1}
    });
    const castArt = session.view().legalCommands.find((c) => c.type === 'resolve_exile_cast' && c.cast === true);
    assert.ok(castArt);
    const { ctx } = buildRouter(session, registry);
    const d = paymentDescriptorOf(castArt, session.view(), { effectiveGeneric: 0 });
    assert.equal(d.totalNeeded, 1);
    // W realnym manaWizardFor obniżka kontrolera HUMAN_ID redukuje {1}{U} -> {U},
    // więc z 1 Islandem płatność jest jednoznaczna (0 innych wariantów) albo ma totalNeeded=1.
    assert.equal(ctx.manaWizardFor(castArt), null, 'po obniżce Etherium Sculptora kosztuje {U} → jedyna Island = auto-tap');
  }
});

test('Vaan/5: trigger z tapnięcia lądu (Chronic Flooding) podczas pendingExileCast nie blokuje kolejnych źródeł ani domknięcia', () => {
  const { session, state, registry } = vaanScene({
    exiledCardId: 'highland-game', // {1}{G}
    lands: ['basic-forest', 'basic-mountain', 'basic-swamp'],
    aurasOnFirstLand: ['chronic-flooding'],
  });
  const castCmd = session.view().legalCommands.find((c) => c.type === 'resolve_exile_cast' && c.cast === true);
  const { ctx, handlers, notices } = buildRouter(session, registry);
  ctx.manaWizardDescriptor = ctx.manaWizardFor(castCmd);
  assert.ok(ctx.manaWizardDescriptor);
  ctx.refreshManaWizard();

  // Pierwszy ląd wrzuca trigger Chronic Flooding na stos.
  handlers().onTapSource('vaan-land-0');
  assert.equal(state.zones.stack.length, 1, 'trigger Chronic Flooding wszedł na stos');
  assert.ok(state.pendingExileCast, 'decyzja Vaana nadal otwarta');

  // Drugi ląd (Swamp) nadal działa, a finishWizardPayment domyka resolve_exile_cast mimo triggera na stosie.
  handlers().onTapSource('vaan-land-2');
  assert.equal(notices.length, 0, 'brak fałszywego błędu o niedostępności komendy');
  assert.equal(state.pendingExileCast, null, 'resolve_exile_cast domknięty mimo triggera na stosie');
});

test('Vaan/6: heuristic-bot w trakcie pendingExileCast wybiera decyzję exile, a nie zdolność many', () => {
  const { session } = vaanScene({
    exiledCardId: 'consume-spirit', // za drogie lub zły koszt przy 2 manach → brak cast:true albo cast:false
    lands: ['basic-forest'],
    extraBattlefield: ['pristine-talisman'],
  });
  // Obniżamy życie bota, żeby Pristine Talisman (add_mana + gain_life) miał dodatni wynik gain_life.
  const p1 = session.state.players.find((p) => p.id === HUMAN_ID);
  p1.life = 4;
  const bot = createHeuristicBot({ seed: 111 });
  const chosen = bot.chooseCommand(session.view());
  assert.equal(chosen.type, 'resolve_exile_cast', `bot rozstrzyga okno Vaana zamiast aktywować manę (${chosen.type})`);
});
