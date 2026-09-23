// Uwagi C i H z gry (właściciel, 2026-09-23c):
//   C — „oferta Forecast w upkeep = »Piercing Rays: Forecast (2W)«; klik →
//       modal celu; NIE »Cel zdolności: …«" (nazwa mechaniki + KOSZT w tytule);
//   H — „każda oferta (instant/sorcery/aura/zdolność aktywowana) pokazuje
//       koszt; bez kosztu tylko darmowe" — przegląd całej warstwy etykiet.
//
// Wada była klasowa: pojedyncze oferty (`commandLabel`) niosły koszt, ale
// TYTUŁY GRUP decyzji (`choiceSourceTitle` — „Cel czaru: <karta>",
// „Cel zdolności: <karta>") nie — a to one są jedynym tekstem widocznym
// w panelu, gdy oferta grupuje kilka celów.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { buildActionEntries, commandLabel, choiceGroupTitle } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, zone, playerId = 'p1') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [],
  });
}

function stol({ step = 'main1', lands = ['basic-mountain', 'basic-mountain', 'basic-mountain'], hand = [], foeCreatures = 0 } = {}) {
  const state = createGameState({ seed: 2309, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  lands.forEach((cardId, i) => put(state, `land-${i}`, cardId, 'battlefield'));
  hand.forEach((cardId, i) => put(state, `hand-${i}`, cardId, 'hand'));
  for (let i = 0; i < foeCreatures; i += 1) put(state, `foe-${i}`, 'goblin-piker', 'battlefield', 'p2');
  for (let i = 0; i < 5; i += 1) put(state, `lib-${i}`, 'basic-swamp', 'library');
  const view = playerView(state, 'p1');
  const session = {
    nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
    nameOfObject: () => 'obiekt',
    cardDetails: (id) => REGISTRY.get(id) ?? null,
    state,
    abilitiesOf: (id) => REGISTRY.get(id)?.abilities ?? [],
  };
  return { state, view, session };
}

function wpisy({ state, view, session }) {
  void state;
  return buildActionEntries(view.legalCommands.filter((c) => c.type !== 'concede'), session, view);
}

const labelOf = (entry, session, view) => (entry.request
  ? choiceGroupTitle(entry.request, session, view)
  : (entry.label ?? commandLabel(entry.command, session, view)));

test('C: oferta Forecast niesie NAZWĘ MECHANIKI i KOSZT (nie „Cel zdolności")', () => {
  const s = stol({
    step: 'upkeep',
    lands: ['basic-plains', 'basic-plains', 'basic-plains'],
    hand: ['piercing-rays'],
    foeCreatures: 2,
  });
  // Forecast jest ofertą tylko w swoim upkeepie i przy pokryciu {2}{W}.
  const entry = wpisy(s).find((e) => e.request?.type === 'target'
    && (e.request.options ?? []).some((c) => c.type === 'activate_ability'));
  assert.ok(entry, 'forecast otwiera modal celu (klik → wybór celu)');
  const title = labelOf(entry, s.session, s.view);
  assert.match(title, /Piercing Rays: Forecast/, `tytuł nazywa kartę i mechanikę: ${title}`);
  assert.doesNotMatch(title, /^Cel zdolności/, `nie może być gołe „Cel zdolności": ${title}`);
  assert.match(title, /koszt/, `tytuł musi nieść koszt: ${title}`);
  assert.match(title, /ms-w/, 'koszt pokazany ikoną many {W}');
  assert.match(title, /ms-c">2</, 'koszt pokazany ikoną {2}');
});

test('C/2: pojedyncza oferta Forecast (jeden legalny cel) też niesie koszt', () => {
  const s = stol({
    step: 'upkeep',
    lands: ['basic-plains', 'basic-plains', 'basic-plains'],
    hand: ['piercing-rays'],
    foeCreatures: 1,
  });
  const entry = wpisy(s).find((e) => e.command?.type === 'activate_ability');
  assert.ok(entry, 'oferta zdolności jest w panelu');
  const label = labelOf(entry, s.session, s.view);
  assert.match(label, /koszt/, `etykieta oferty niesie koszt: ${label}`);
  assert.match(label, /ms-w/, 'ikona {W} w koszcie');
});

test('H/1: tytuł grupy celów czaru (instanta) niesie koszt karty', () => {
  const s = stol({ lands: ['basic-mountain'], hand: ['shock'], foeCreatures: 3 });
  const entry = wpisy(s).find((e) => e.request && (e.request.options ?? []).some((c) => c.type === 'cast_spell'));
  assert.ok(entry, 'instant z celami grupuje się w modal');
  const title = labelOf(entry, s.session, s.view);
  assert.match(title, /^Cel czaru: Shock/, `tytuł nazywa kartę: ${title}`);
  assert.match(title, /koszt/, `tytuł musi nieść koszt: ${title}`);
  assert.match(title, /ms-r/, 'ikona {R} w koszcie');
});

test('H/2: oferta aury niesie koszt zaczarowania', () => {
  const s = stol({ lands: ['basic-plains'], hand: ['guildscorn-ward'], foeCreatures: 1 });
  const cmd = s.view.legalCommands.find((c) => c.type === 'cast_permanent');
  assert.ok(cmd, 'setup: aura z celem na stole przeciwnika');
  const label = commandLabel(cmd, s.session, s.view);
  assert.match(label, /Zagraj aurę: Guildscorn Ward/, `etykieta aury: ${label}`);
  assert.match(label, /koszt/, 'aura musi pokazać koszt');
  assert.match(label, /ms-w/, 'ikona {W} w koszcie');
});

test('H/3: oferta stworu niesie koszt', () => {
  const s = stol({ lands: ['basic-forest', 'basic-forest'], hand: ['highland-game'] });
  const cmd = s.view.legalCommands.find((c) => c.type === 'cast_permanent');
  assert.ok(cmd, 'setup: stwor w ręce i lasy');
  const label = commandLabel(cmd, s.session, s.view);
  assert.match(label, /koszt/, `oferta stworu musi nieść koszt: ${label}`);
  assert.match(label, /ms-g/, 'ikona {G} w koszcie');
});

test('H/4: grupa zdolności aktywowanej z celem niesie koszt (nie gołe „Cel zdolności")', () => {
  // Ghost Warden: „{T}: Target creature gets +1/+1" — celów jest kilka, więc
  // oferta grupuje się w modal; tytuł musi nieść koszt {T} (H).
  const s = stol({ lands: ['basic-plains'], foeCreatures: 2 });
  put(s.state, 'warden', 'ghost-warden', 'battlefield');
  const view = playerView(s.state, 'p1');
  const session = { ...s.session };
  const entry = buildActionEntries(view.legalCommands.filter((c) => c.type !== 'concede'), session, view)
    .find((e) => e.request && (e.request.options ?? []).some((c) => c.type === 'activate_ability'));
  assert.ok(entry, 'zdolność z wieloma celami grupuje się w modal');
  const title = labelOf(entry, session, view);
  assert.match(title, /Ghost Warden/, `tytuł nazywa kartę: ${title}`);
  assert.match(title, /koszt/, `tytuł niesie koszt: ${title}`);
  assert.match(title, /ms-t|T/, 'koszt tapnięcia widoczny');
});

test('H/5 (klasa): żadna oferta z kosztem many nie jest bez kosztu', () => {
  // Przegląd całej warstwy ofert na jednym stole: każdy wpis panelu, którego
  // komenda realnie płaci manę (rzut/aura/zdolność z kosztem many), MUSI
  // zawierać słowo „koszt" — inaczej oferta wygląda jak darmowa (uwaga H).
  const s = stol({
    lands: ['basic-mountain', 'basic-plains', 'basic-plains', 'basic-forest'],
    hand: ['shock', 'guildscorn-ward', 'highland-game', 'piercing-rays'],
    foeCreatures: 3,
  });
  put(s.state, 'warden', 'ghost-warden', 'battlefield');
  const view = playerView(s.state, 'p1');
  const session = { ...s.session };
  const entries = buildActionEntries(view.legalCommands.filter((c) => c.type !== 'concede'), session, view);
  const zKosztem = entries.filter((e) => {
    const cmd = e.command ?? e.first ?? e.request?.options?.[0];
    if (!cmd) return false;
    if (cmd.type === 'pass_priority' || cmd.type === 'concede') return false;
    // Komendy niosą ID OBIEKTU, nie cardId — kartę rozwiązujemy przez strefy
    // widoku (jak `cardInfo`), a zdolność przez pełny stan sesji.
    const object = Object.values(view.zones).flat().find((o) => o.id === (cmd.objectId ?? cmd.cardId));
    const card = object?.cardId ? session.cardDetails(object.cardId) : session.cardDetails(cmd.cardId);
    const ability = cmd.abilityIndex != null
      ? session.state.objects.get(cmd.objectId)?.abilities?.[cmd.abilityIndex] : null;
    return Boolean(card?.manaCost != null || ability?.cost?.mana != null || ability?.cost?.tap);
  });
  assert.ok(zKosztem.length >= 4, `setup: kilka ofert z kosztem (jest ${zKosztem.length})`);
  for (const entry of zKosztem) {
    const label = labelOf(entry, session, view);
    assert.match(label, /koszt/i, `oferta bez kosztu: ${label}`);
  }
});
