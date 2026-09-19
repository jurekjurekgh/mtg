// =============================================================================
// P5 (paka uwag właściciela 2026-09-19b) — punkty F, I i J: mana i auto-pass.
//
// F — „Karta Marut. Bot do jej rzucenia zużył 1 Treasure. Wedle opisu tej karty
//   (…) nic takiego się nie stało, Treasure zostało zużyte, a żaden nowy
//   Treasure Token nie powstał” + korekta właściciela: „BOT rzucał ten czar,
//   nie gracz. BOT poświęcił Treasure. Nie było żadnego mana wizarda”.
//   POMIAR (2026-09-19b, ten sam dzień): pełny przepływ BOTA jest poprawny —
//   aktywacja zdolności many Skarba (`activate_ability`) → `cast_permanent`
//   Maruta → stempel `manaFromTreasureSpent` → ETB tworzy token za każdą
//   wydaną sztukę (test F/1; 300 gier mirror: 64 aktywacje Skarbów, 0 rozjazdów).
//   Zmierzony defekt leżał OBOK, w tej samej rodzinie: bot poświęcał Skarb
//   „na” kartę, której sam nie chciał rzucić — próg KOSZTU (M128
//   `unlocksSomething`) nie jest tym samym co wycena KASTRU, więc mana
//   wyparowywała w cleanupie (CR 500.4), a gracz widział „Skarb zużyty,
//   nic się nie stało”. Pomiar na harnessie eventowym (400 gier, ta sama
//   talia po obu stronach): PRZED fixem 4/556 aktywacji bez zużycia many
//   (seedy 21, 22, 122), PO fixie 0/556. Bramka: źródło JEDNORAZOWE
//   (`cost.sacrificeSelf`) musi mieć pokrycie w wycenie kastru — tee samej,
//   którą bot stosuje do ofert (L41).
//
// I — „Seer's Lantern: właściciel widział koszt 2, karta to {3}”. POMIAR:
//   rzut kosztuje 3 ({3} w katalogu i w mana-costs — zgodnie ze Scryfallem),
//   a „2” z uwagi to DRUGA zdolność karty: „{2}, {T}: Scry 1”. Etykiety
//   panelu pokazują oba koszty rozłącznie (pin dokumentacyjny, nie fix).
//
// J — „auto-pass zatrzymuje się na KAŻDEJ fazie”; winowajcą są zdolności many
//   („{T}: Add…”) — nie ma ich w panelu (M369/G filtruje je w render.js), ale
//   auto-pass liczył je jako realną decyzję. Fix: JEDNO źródło predykatu dla
//   panelu i sesji (L41) — `isPureManaAbilityCommand` w silniku
//   (mana-sources.js) + eksport reguły auto-passu `hasMeaningfulDecisionOf`
//   (ADR 0011 — testowalna bez budowania sesji).
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { isActivatedManaAbility, isPureManaAbilityCommand } from '../src/engine/mana-sources.js';
import { createBattlefieldToken } from '../src/engine/tokens.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { commandLabel, isManaAbilityCommand } from '../src/table/render.js';
import { hasMeaningfulDecisionOf } from '../src/table/session.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

function treasureToken(state, controllerId) {
  return createBattlefieldToken(state, controllerId, {
    cardId: 'token_treasure', name: 'Treasure', kind: 'artifact', colors: [],
    types: ['Artifact'], subtypes: ['Treasure'],
    abilities: [{
      type: 'activated', cost: { tap: true, sacrificeSelf: true },
      effect: { type: 'add_mana', amount: 1, colors: ['W', 'U', 'B', 'R', 'G'], fromTreasure: true },
    }],
  });
}

function game(step = 'main1', activeId = 'p1') {
  const state = createGameState({ seed: 91, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, activeId);
  state.turn.activePlayerId = activeId;
  state.turn.priorityPlayerId = activeId;
  return state;
}

const gameBot = () => createHeuristicBot({ seed: 7, randomness: 0, registry: REGISTRY });

/** Kształt sesji, jakiego oczekują render.commandLabel / render.isManaAbilityCommand. */
function sessionFor(state) {
  return {
    state,
    nameOf: (id) => REGISTRY.get(id)?.name ?? id,
    nameOfObject: (id) => id,
    cardDetails: (id) => REGISTRY.get(id),
    abilitiesOf: (id) => gameObjectDataOf(REGISTRY.get(id)).abilities ?? [],
  };
}

const treasuresOnBattlefield = (state) => [...state.objects.values()]
  .filter((o) => o.zone === 'battlefield' && o.cardId === 'token_treasure').length;

/** Karta ze słownika zdolności silnika (widok nie niesie deskryptorów). */
const abilitiesOf = (cardId) => REGISTRY.get(cardId)?.abilities ?? [];

const isManaOnlyFor = (state) => (cmd) => {
  const object = state.objects.get(cmd.objectId);
  return isPureManaAbilityCommand(cmd, object, object?.cardId ? abilitiesOf(object.cardId) : null);
};

// ---------------------------------------------------------------------------
// F — Marut: Skarb wydany na rzut = token (przepływ BOTA, nie gracza)
// ---------------------------------------------------------------------------

test('F/1: bot rzuca Maruta za manę ze Skarba — ETB tworzy 1 token (scenariusz właściciela)', () => {
  const state = game();
  put(state, 'marut', 'marut', 'p1', 'hand');
  for (let i = 0; i < 7; i += 1) put(state, `land${i}`, 'basic-plains', 'p1');
  treasureToken(state, 'p1');
  put(state, 'foe-land', 'basic-island', 'p2');

  const bot = gameBot();
  const marutOnBattlefield = () => [...state.objects.values()]
    .some((o) => o.zone === 'battlefield' && o.cardId === 'marut');
  let activatedTreasure = false;
  let castMarut = false;
  for (let i = 0; i < 40 && state.status === 'active'; i += 1) {
    // Marut rozstrzygnięty i stos pusty = ETB („token za każdą manę ze Skarba”)
    // też już rozstrzygnięte; dopiero wtedy wynik jest kompletny.
    if (castMarut && marutOnBattlefield() && state.zones.stack.length === 0) break;
    if (state.zones.stack.length > 0) {
      const resolveView = playerView(state, state.turn.priorityPlayerId);
      const resolve = resolveView.legalCommands.find((c) => c.type.startsWith('resolve_'))
        ?? resolveView.legalCommands.find((c) => c.type === 'pass_priority');
      if (!resolve) break;
      assert.ok(execute(state, resolve).ok, 'rozstrzygnięcie na stosie');
      continue;
    }
    const view = playerView(state, 'p1');
    const cmd = bot.chooseCommand(view);
    assert.ok(cmd, 'bot ma komendę w scenariuszu F');
    const object = cmd.objectId ? state.objects.get(cmd.objectId) : null;
    if (cmd.type === 'activate_ability' && object?.cardId === 'token_treasure') activatedTreasure = true;
    if (cmd.type === 'cast_permanent' && object?.cardId === 'marut') castMarut = true;
    const result = execute(state, cmd);
    assert.ok(result.ok, `komenda ${cmd.type} legalna`);
    if (cmd.type === 'pass_priority' && marutOnBattlefield()) break;
    if (cmd.type === 'pass_priority' && !castMarut) break;
  }
  assert.ok(activatedTreasure, 'bot aktywował zdolność many Skarba (BOT poświęcił Treasure)');
  assert.ok(castMarut, 'bot rzucił Maruta');
  const cast = state.events.find((e) => e.type === 'permanent_cast' && e.object?.cardId === 'marut');
  assert.ok(cast, 'zdarzenie permanent_cast Maruta');
  assert.equal(cast.manaFromTreasureSpent, 1, 'stempel: 1 mana ze Skarba wydana na rzut (LKI dla ETB)');
  // Rozstrzygnięcie czaru (stos pusty po pętli) — Marut na polu i 1 nowy Skarb.
  const marut = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.cardId === 'marut');
  assert.ok(marut, 'Marut wszedł na pole bitwy');
  assert.equal(marut.manaFromTreasureSpent, 1, 'permanent niesie LKI rzutu');
  assert.equal(treasuresOnBattlefield(state), 1, 'ETB utworzył 1 Skarb (wydano 1 manę ze Skarba)');
});

test('F/2: źródło JEDNORAZOWE nie jest poświęcane „na” kartę, której bot nie rzuci', () => {
  const state = game();
  // Karta, której bot nie chce rzucać (samotny Equipment bez stwora), koszt {2},
  // przy jednym lądzie: próg M128 uznaje ją za „odblokowaną” przez Skarb.
  put(state, 'cloak', 'cloak-of-the-bat', 'p1', 'hand');
  put(state, 'land0', 'basic-forest', 'p1');
  treasureToken(state, 'p1');
  const view = playerView(state, 'p1');
  const offered = view.legalCommands.find((c) => c.type === 'activate_ability');
  assert.ok(offered, 'silnik oferuje aktywację zdolności many Skarba');
  const chosen = gameBot().chooseCommand(view);
  assert.notEqual(chosen?.type, 'activate_ability',
    'bot NIE poświęca Skarba, gdy karta „odblokowana” progiem kosztu jest dla niego wyceniona ≤ 0');
  assert.equal(chosen.type, 'pass_priority');
});

test('F/3: kontrola — gdy karta jest realnie chciana, bot nadal używa Skarba (brak over-fixu)', () => {
  const state = game();
  put(state, 'marut', 'marut', 'p1', 'hand');
  for (let i = 0; i < 7; i += 1) put(state, `land${i}`, 'basic-plains', 'p1');
  treasureToken(state, 'p1');
  const view = playerView(state, 'p1');
  const chosen = gameBot().chooseCommand(view);
  assert.equal(chosen?.type, 'activate_ability',
    'Marut {8} przy 7 lądach + Skarb = realne odblokowanie → aktywacja zostaje');
  assert.equal(state.objects.get(chosen.objectId)?.cardId, 'token_treasure');
});

test('F/5: dwie sztuki many ze Skarbów na rzut Marutem → 2 nowe Skarby („for each”)', () => {
  // Auto-płatność świadomie NIE poświęca permanentów (resources.js —
  // „poświęcenie Skarbu” poza whitelistą kosztowych źródeł): drogą do rzutu
  // z dwóch Skarbów jest JAWNA aktywacja, dokładnie ta, którą wybiera bot
  // (F/1). Ten pin domyka „for each mana from a Treasure spent” dla 2 sztuk.
  const state = game();
  put(state, 'marut', 'marut', 'p1', 'hand');
  for (let i = 0; i < 6; i += 1) put(state, `land${i}`, 'basic-plains', 'p1');
  const t1 = treasureToken(state, 'p1');
  const t2 = treasureToken(state, 'p1');
  const onField = (cardId) => [...state.objects.values()]
    .filter((o) => o.zone === 'battlefield' && o.cardId === cardId).length;

  const run = (predicate) => {
    const rv = playerView(state, 'p1');
    const cmd = rv.legalCommands.find(predicate);
    assert.ok(cmd, 'oczekiwana oferta w widoku');
    assert.ok(execute(state, cmd).ok, `komenda ${cmd.type} legalna`);
  };
  // Widok nie enumeruje tapowania lądów jako akcji (baza wchodzi do płatności
  // auto-tapem), więc 6 many z lądów wkładamy wprost do puli.
  addMana(state, 'p1', 6, { colors: [] });
  run((c) => c.type === 'activate_ability' && c.objectId === t1.id);
  run((c) => c.type === 'activate_ability' && c.objectId === t2.id);
  assert.equal(state.players[0].treasureMana, 2, 'pula niesie 2 many ze Skarbów');
  run((c) => c.type === 'cast_permanent' && c.objectId === 'marut');
  for (let i = 0; i < 10 && state.zones.stack.length > 0; i += 1) {
    const rv = playerView(state, state.turn.priorityPlayerId);
    const resolve = rv.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? rv.legalCommands.find((c) => c.type === 'pass_priority');
    if (!resolve) break;
    assert.ok(execute(state, resolve).ok);
  }
  const cast = state.events.find((e) => e.type === 'permanent_cast' && e.object?.cardId === 'marut');
  assert.ok(cast, 'Marut rzucony');
  assert.equal(cast.manaFromTreasureSpent, 2, 'stempel: 2 many ze Skarbów');
  assert.equal(onField('marut'), 1, 'Marut na polu bitwy');
  assert.equal(onField('token_treasure'), 2, 'ETB tworzy DOKŁADNIE 2 Skarby (po jednym za sztukę)');
});

test('F/6: rzut zapłacony samymi lądami nie tworzy Skarbów („inną drogą” → 0)', () => {
  const state = game();
  put(state, 'marut', 'marut', 'p1', 'hand');
  for (let i = 0; i < 8; i += 1) put(state, `land${i}`, 'basic-plains', 'p1');
  treasureToken(state, 'p1'); // leży nietknięty — LKI rzutu nie może go policzyć
  const bot = gameBot();
  const onField = (cardId) => [...state.objects.values()]
    .filter((o) => o.zone === 'battlefield' && o.cardId === cardId).length;
  let castMarut = false;
  for (let i = 0; i < 40 && state.status === 'active'; i += 1) {
    if (castMarut && onField('marut') > 0 && state.zones.stack.length === 0) break;
    if (state.zones.stack.length > 0) {
      const rv = playerView(state, state.turn.priorityPlayerId);
      const resolve = rv.legalCommands.find((c) => c.type.startsWith('resolve_'))
        ?? rv.legalCommands.find((c) => c.type === 'pass_priority');
      if (!resolve) break;
      assert.ok(execute(state, resolve).ok);
      continue;
    }
    const view = playerView(state, 'p1');
    const cmd = bot.chooseCommand(view);
    assert.ok(cmd, 'bot ma komendę (same lądy)');
    if (cmd.type === 'cast_permanent' && state.objects.get(cmd.objectId)?.cardId === 'marut') castMarut = true;
    assert.ok(execute(state, cmd).ok, `komenda ${cmd.type} legalna`);
    if (cmd.type === 'pass_priority' && !castMarut) break;
  }
  const cast = state.events.find((e) => e.type === 'permanent_cast' && e.object?.cardId === 'marut');
  assert.ok(cast, 'Marut rzucony z samych lądów');
  assert.equal(cast.manaFromTreasureSpent ?? 0, 0, 'stempel: 0 many ze Skarbów');
  assert.equal(onField('token_treasure'), 1, 'Skarb nietknięty i żaden nowy nie powstał');
});

// ---------------------------------------------------------------------------
// I — Seer's Lantern: koszt rzutu to 3; „2” z uwagi to zdolność scry
// ---------------------------------------------------------------------------

test('I/1: rzut Seer’s Lantern kosztuje 3 many (katalog = mana-costs = Oracle)', () => {
  const card = REGISTRY.get('seers-lantern');
  assert.ok(card, 'karta w rejestrze');
  assert.equal(card.manaCost, 3, 'katalog: {3}');
  assert.equal(MANA_COSTS['seers-lantern'], '{3}', 'tabela kosztów: {3}');
  const state = game();
  put(state, 'lan', 'seers-lantern', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: [] });
  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'lan');
  assert.ok(offer, 'oferta rzutu przy 4 many na puli');
  assert.ok(execute(state, offer).ok);
  assert.equal(state.players[0].mana, 1, 'zapłacono 3 z 4 (nie 2)');
});

test('I/2: etykiety rozdzielają koszt karty ({3}) od zdolności scry ({2}, {T})', () => {
  const state = game();
  put(state, 'lan', 'seers-lantern', 'p1');
  put(state, 'hand-lan', 'seers-lantern', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: [] });
  const view = playerView(state, 'p1');
  const session = sessionFor(state);
  const cast = view.legalCommands.find((c) => c.type === 'cast_permanent');
  const scry = view.legalCommands.find((c) => c.type === 'activate_ability' && c.abilityIndex === 1);
  assert.ok(cast && scry, 'oferty rzutu i scry');
  const castLabel = commandLabel(cast, session, view);
  const scryLabel = commandLabel(scry, session, view);
  assert.match(castLabel, /koszt <span class="ms-group"><span class="ms ms-c">3<\/span><\/span>/,
    'rzut: koszt {3}');
  assert.match(scryLabel, /scry 1/);
  assert.match(scryLabel, /ms-c">2<[\s\S]*ms-c">T</, 'scry: koszt {2}, {T} — to jego właściciel widział jako „2”');
});

// ---------------------------------------------------------------------------
// J — auto-pass nie zatrzymuje się na czystych zdolnościach many
// ---------------------------------------------------------------------------

test('J/1: silnik rozstrzyga „czysta zdolność many” (bez wyboru) vs wariant z payloadem', () => {
  const state = game();
  put(state, 'lan', 'seers-lantern', 'p1');
  const lantern = state.objects.get('lan');
  assert.ok(isActivatedManaAbility(lantern.abilities[0]), '{T}: Add {C} to zdolność many (CR 605.1a)');
  assert.ok(!isActivatedManaAbility(lantern.abilities[1]), 'scry 1 to NIE zdolność many');
  assert.equal(isPureManaAbilityCommand({ type: 'activate_ability', objectId: 'lan', abilityIndex: 0 }, lantern, abilitiesOf('seers-lantern')), true);
  assert.equal(isPureManaAbilityCommand({ type: 'activate_ability', objectId: 'lan', abilityIndex: 1 }, lantern, abilitiesOf('seers-lantern')), false);
  // Wariant z wyborem (X/koszt/cel) zostaje decyzją gracza.
  assert.equal(isPureManaAbilityCommand({ type: 'activate_ability', objectId: 'lan', abilityIndex: 0, xValue: 2 }, lantern, null), false);
  assert.equal(isPureManaAbilityCommand({ type: 'activate_ability', objectId: 'lan', abilityIndex: 0, targets: ['t1'] }, lantern, null), false);
  assert.equal(isPureManaAbilityCommand({ type: 'cast_permanent', objectId: 'lan' }, lantern, null), false);
  // Fallback deskryptorów z rejestru (obiekt bez abilities w stanie).
  assert.equal(isPureManaAbilityCommand({ type: 'activate_ability', objectId: 'x', abilityIndex: 0 }, { cardId: 'seers-lantern' }, abilitiesOf('seers-lantern')), true);
});

test('J/2: panel i auto-pass dzielą JEDEN predykat (parity + brak drugiej listy pól)', () => {
  const state = game();
  put(state, 'lan', 'seers-lantern', 'p1');
  treasureToken(state, 'p1');
  addMana(state, 'p1', 3, { colors: [] }); // dla oferty scry {2} (druga zdolność latarni)
  const view = playerView(state, 'p1');
  const session = sessionFor(state);
  const activations = view.legalCommands.filter((c) => c.type === 'activate_ability');
  assert.ok(activations.length >= 3, 'oferty: {T} latarni, scry, Skarb');
  for (const cmd of activations) {
    assert.equal(isManaAbilityCommand(cmd, session), isManaOnlyFor(state)(cmd),
      `zgodność panelu i silnika dla abilityIndex=${cmd.abilityIndex}`);
  }
  const renderSource = fs.readFileSync(new URL('../src/table/render.js', import.meta.url), 'utf8');
  const engineSource = fs.readFileSync(new URL('../src/engine/mana-sources.js', import.meta.url), 'utf8');
  assert.ok(!renderSource.includes("'tapPermanentCostId'"),
    'render.js nie może trzymać własnej listy pól payloadu (L41 — jedno źródło)');
  assert.ok(engineSource.includes("'tapPermanentCostId'"), 'lista pól mieszka w silniku');
  assert.ok(renderSource.includes('isPureManaAbilityCommand'), 'panel woła predykat silnika');
});

test('J/3: okno z samą czystą zdolnością many nie jest decyzją (auto-pass przewija)', () => {
  const state = game();
  treasureToken(state, 'p1');
  const view = playerView(state, 'p1');
  assert.deepEqual([...new Set(view.legalCommands.map((c) => c.type))].sort(),
    ['activate_ability', 'concede', 'pass_priority'], 'w tym oknie nie ma nic poza zdolnością many');
  assert.equal(hasMeaningfulDecisionOf(view, { isManaOnly: isManaOnlyFor(state) }), false,
    'czysta zdolność many nie zatrzymuje auto-passu (objaw J: „stoi w każdej fazie”)');
  // Kontrola: ten sam widok bez haka (stan sprzed J) zatrzymywał auto-pass.
  assert.equal(hasMeaningfulDecisionOf(view), true);
  // Kontrola: realna akcja (rzucalny stwór) nadal zatrzymuje.
  put(state, 'game', 'highland-game', 'p1', 'hand');
  put(state, 'land0', 'basic-forest', 'p1');
  put(state, 'land1', 'basic-forest', 'p1');
  put(state, 'land2', 'basic-forest', 'p1');
  const withCast = playerView(state, 'p1');
  assert.ok(withCast.legalCommands.some((c) => c.type === 'cast_permanent'), 'jest oferta rzutu');
  assert.equal(hasMeaningfulDecisionOf(withCast, { isManaOnly: isManaOnlyFor(state) }), true);

  // Zdolność z WYBOREM (Seer's Lantern „{2}, {T}: Scry 1”) nadal zatrzymuje:
  // do zdolności many wystarczy pula na {2}, a scry 1 to decyzja gracza.
  const scryState = game();
  put(scryState, 'lan', 'seers-lantern', 'p1');
  addMana(scryState, 'p1', 3, { colors: [] });
  const scryView = playerView(scryState, 'p1');
  assert.ok(scryView.legalCommands.some((c) => c.type === 'activate_ability' && c.abilityIndex === 1),
    'oferta scry 1 (zdolność z wyborem)');
  assert.equal(hasMeaningfulDecisionOf(scryView, { isManaOnly: isManaOnlyFor(scryState) }), true,
    'zdolność z wyborem NIE jest wycinana z auto-passu razem ze zdolnościami many');
});

test('J/4: sesja wpięta w predykat silnika (wiring, nie kopia reguły)', () => {
  const sessionSource = fs.readFileSync(new URL('../src/table/session.js', import.meta.url), 'utf8');
  assert.ok(sessionSource.includes("import { isPureManaAbilityCommand } from '../engine/mana-sources.js';"),
    'sesja importuje predykat silnika');
  assert.match(sessionSource, /isManaOnly: \(cmd\) => \{[\s\S]*?isPureManaAbilityCommand\(cmd, object, fallback\)/,
    'auto-pass karmi regułę predykatem silnika (jedno źródło z panelem)');
  assert.match(sessionSource, /hasMeaningfulDecisionOf\(view, \{\s*isIgnored:/,
    'reguła jest modułową funkcją (ADR 0011 — testowalna bez sesji)');
});

// ---------------------------------------------------------------------------
// F — pomiar harnessem: brak aktywacji bez zużycia many (regresja klasy „Skarb
// zużyty, nic się nie stało”); lądy kontrolne pokrywają obie strony talii.
// ---------------------------------------------------------------------------

test('F/4: Skarb na polu + brak chcianej karty = brak poświęcenia (pomiar decyzji)', () => {
  for (const handCards of [['cloak-of-the-bat'], ['greatsword-of-tyr']]) {
    const state = game();
    handCards.forEach((cardId, i) => put(state, `hand${i}`, cardId, 'p1', 'hand'));
    put(state, 'land0', 'basic-forest', 'p1');
    treasureToken(state, 'p1');
    const chosen = gameBot().chooseCommand(playerView(state, 'p1'));
    assert.notEqual(chosen?.type, 'activate_ability',
      `brak aktywacji Skarba przy ręce: ${handCards.join(', ')}`);
  }
});
