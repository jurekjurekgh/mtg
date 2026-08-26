// M201 — polowanie na błędy (odznaka), znalezisko #3:
// TOKEN POWERSTONE (Static Net) NIE PRODUKUJE ŻADNEJ MANY.
//
// Druk tokenu (Wizards, token „Powerstone”): „Artifact — Powerstone.
// {T}: Add {C}. This mana can't be spent to cast a nonartifact spell.”
// Deskryptor tokenu w danych nie miał ŻADNEJ zdolności, więc:
//  • kamień nigdy nie dawał many (druga połowa Static Net była martwa),
//  • wpis w MANA_SOURCE_MAP był nieosiągalny (od M193 kolory czyta się
//    z deskryptora zdolności, a tego nie było).
// Przy okazji reguła, której silnik nie znał wcale: mana OGRANICZONA
// („spend only to cast artifact spells”) — bez niej naprawa samego
// „{T}: Add {C}” złamałaby druk w drugą stronę.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { applyEffect } from '../src/engine/effects.js';
import { addMana, producibleMana, spellManaPurpose } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

function stateWithPowerstone({ untapped = true } = {}) {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[3], stepIndex: 3, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  addObject(state, {
    id: 'src', instanceId: 'i-src', cardId: 'static-net', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'enchantment', types: ['Enchantment'], abilities: [],
  });
  const netTokenEffect = (REGISTRY.get('static-net').abilities ?? [])
    .flatMap((a) => (Array.isArray(a.effect) ? a.effect : [a.effect]))
    .find((e) => e?.type === 'create_token' && e.cardId === 'token_powerstone');
  assert.ok(netTokenEffect, 'Static Net tworzy token Powerstone');
  applyEffect(state, netTokenEffect, state.objects.get('src'), []);
  const token = [...state.objects.values()].find((o) => o.cardId === 'token_powerstone');
  assert.ok(token, 'token powstał');
  if (untapped) state.objects.set(token.id, Object.freeze({ ...token, tapped: false }));
  return { state, tokenId: token.id };
}

test('BUG3: Powerstone ma wydrukowaną zdolność many „{T}: Add {C}”', () => {
  const { state, tokenId } = stateWithPowerstone();
  const token = state.objects.get(tokenId);
  const manaAbility = (token.abilities ?? []).find((a) => {
    const effects = Array.isArray(a.effect) ? a.effect : [a.effect];
    return a.type === 'activated' && a.cost?.tap === true && effects.some((e) => e?.type === 'add_mana');
  });
  assert.ok(manaAbility, `token bez zdolności many: ${JSON.stringify(token.abilities ?? [])}`);
});

test('BUG3: Powerstone PŁACI za czar-artefakt', () => {
  const { state } = stateWithPowerstone();
  const artifact = REGISTRY.all().find((c) => (c.types ?? []).includes('Artifact') && !c.spell && (c.manaCost ?? 0) === 1);
  assert.ok(artifact, 'w katalogu jest artefakt za {1}');
  put(state, 'art', artifact.id, 'p1', 'hand');
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'art');
  assert.ok(cast, 'artefakt za {1} rzucalny z samego Powerstone');
  assert.equal(execute(state, cast).ok, true);
});

test('BUG3: mana z Powerstone NIE opłaca czaru nie-artefaktowego (druk tokenu)', () => {
  const { state } = stateWithPowerstone();
  const creature = REGISTRY.all().find((c) => (c.types ?? []).includes('Creature')
    && !(c.types ?? []).includes('Artifact') && (c.manaCost ?? 0) === 1 && (c.colors ?? []).length === 0);
  const spell = creature ?? REGISTRY.all().find((c) => (c.types ?? []).includes('Creature')
    && !(c.types ?? []).includes('Artifact') && (c.manaCost ?? 0) === 1);
  assert.ok(spell, 'w katalogu jest nie-artefaktowy czar za {1}');
  put(state, 'cre', spell.id, 'p1', 'hand');
  const casts = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'cast_permanent' && c.objectId === 'cre');
  assert.deepEqual(casts, [],
    'druk tokenu: „This mana can\'t be spent to cast a nonartifact spell”');
});

test('BUG3: liczenie many rozróżnia cel wydania (oferta = płatność, L48)', () => {
  const { state } = stateWithPowerstone();
  // M202/N1 (audyt PR #73): ograniczenie druku dotyczy WYŁĄCZNIE rzutu czaru
  // nie-artefaktowego. Płatność, która nie jest rzutem czaru (domyślny
  // `purpose`) — zdolność aktywowana, plot, suspend — płaci tą maną normalnie;
  // wcześniej odejmowaliśmy ją zawsze i odbieraliśmy graczowi legalne aktywacje.
  assert.equal(producibleMana(state, 'p1'), 1, 'poza rzutem czaru mana ograniczona jest dostępna');
  assert.equal(producibleMana(state, 'p1', null, spellManaPurpose({ types: ['Artifact'] })), 1,
    'dla czaru-artefaktu liczy się');
  assert.equal(producibleMana(state, 'p1', null, spellManaPurpose({ types: ['Creature'] })), 0,
    'dla czaru nie-artefaktowego — niedostępna (druk tokenu)');
});

test('BUG3 (anty-over-fix): zwykły ląd płaci za wszystko', () => {
  const { state } = stateWithPowerstone({ untapped: false });
  put(state, 'forest', 'basic-forest', 'p1');
  assert.equal(producibleMana(state, 'p1'), 1, 'ląd bez ograniczeń');
  const creature = REGISTRY.all().find((c) => (c.types ?? []).includes('Creature')
    && !(c.types ?? []).includes('Artifact') && (c.manaCost ?? 0) === 1 && (c.colors ?? []).includes('G'));
  if (creature) {
    put(state, 'cre', creature.id, 'p1', 'hand');
    const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'cre');
    assert.ok(cast, 'zielony stwór za {G} rzucalny z lasu');
  }
});

test('BUG3: ograniczenie działa też po RĘCZNYM tapnięciu (mana w puli)', () => {
  // Kreator many pozwala tapnąć źródło przed wyborem czaru — restrykcja
  // musi przeżyć drogę „źródło → pula”, inaczej gracz obchodzi druk tokenu.
  const { state, tokenId } = stateWithPowerstone();
  const activate = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === tokenId);
  assert.ok(activate, 'kamień da się tapnąć ręcznie');
  assert.equal(execute(state, activate).ok, true);
  const player = state.players.find((p) => p.id === 'p1');
  assert.equal(player.mana, 1, 'mana trafiła do puli');
  assert.equal(producibleMana(state, 'p1', null, spellManaPurpose({ types: ['Creature'] })), 0,
    'ale dla czaru nie-artefaktowego jest niedostępna (druk tokenu)');
  assert.equal(producibleMana(state, 'p1', null, spellManaPurpose({ types: ['Artifact'] })), 1,
    'dla czaru-artefaktu — dostępna');
  assert.equal(producibleMana(state, 'p1'), 1,
    'M202/N1: dla zdolności aktywowanej (nie rzut czaru) — dostępna');
});

// M215 — CI czerwone na M214 (seed 2032): cast_permanent stwora {2} z WOLNĄ
// jednostką many w puli + nietapniętym landem, przy JEDNOCZEŚNIE manie
// Powerstone w puli. Oferta mówi TAK (produkujemy lądem), a płatność:
//  • pętla auto-tapu porównywała `player.mana` (z maną ograniczoną) zamiast
//    `player.mana − restrictedInPool` — land NIE był tapnięty, choć był
//    potrzebny; konsumpcja zjadała mniej jednostek niż kwota, a
//    `player.mana -= amount` rozjeżdżało księgowanie (pula + res ≠ mana);
//  • w efekcie kolejna płatność (academy-journeymage w biegu 2032) liczyła
//    producible z przekłamanej sumy i PADAŁA „Niewystarczająca mana” mimo
//    oferty — łamanie L48 (oferta = walidacja) i CR 601.2h.
test('BUG3/M215: auto-tap do-tapuje ląd, gdy w puli jest też mana Powerstone', () => {
  const { state, tokenId } = stateWithPowerstone();
  // Mana Powerstone do puli (kreator many).
  const activate = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === tokenId);
  assert.equal(execute(state, activate).ok, true);
  // Jedna WOLNA jednostka many + nietapnięty ląd: bez ograniczenia razem {2}.
  addMana(state, 'p1', 1, { colors: [] });
  put(state, 'forest', 'basic-forest', 'p1');
  // Stwór {2} bez pipów (welder-automaton) jako CZYSTY Creature — cel bez
  // dozwolonej many ograniczonej (druk Powerstone).
  put(state, 'cre', 'welder-automaton', 'p1', 'hand', { types: ['Creature'], kind: 'creature', manaCost: 2 });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'cre');
  assert.ok(cast, 'oferta: 1 wolna z puli + 1 ląd = {2} (mana Powerstone wykluczona)');
  const result = execute(state, cast);
  assert.equal(result.ok, true, `płatność nie może paść — oferta = walidacja (L48), reason=${result.events[0]?.reason}`);
  const p1 = state.players.find((p) => p.id === 'p1');
  assert.equal(state.objects.get('forest').tapped, true,
    'auto-tap musi dobrać ląd pomimo many Powerstone w puli (CR 601.2h)');
  assert.equal(p1.mana, 1, 'w puli zostaje wyłącznie niedostępna mana Powerstone');
  assert.deepEqual(p1.restrictedPool, { '': 1 }, 'mana ograniczona nietknięta');
});
