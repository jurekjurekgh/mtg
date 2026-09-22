// Uwaga z gry właściciela, 2026-09-22 (F) — Pristine Talisman
// („{T}: Add {C}. You gain 1 life.”), M409.
//
// Zgłoszenie 1: „Ten artefakt produkuje manę, ale także dodaje 1 life. Nie
// powinien być traktowany jak zwykły permanent do produkcji many, czyli cały
// czas wyciszony. Tylko takie które nie robią nic innego tylko produkują manę
// za tapnięcie powinny być wyciszone w auto-pasie.”
//
// Zgłoszenie 2 (poważniejsze): „Ten Pristine Talisman w ogóle nie działa…
// Moja tura, faza Główna 1. Mam artefakt za 5 many colorless. Mam 4 lądy
// i nietapnięty Pristine Talisman. Nie mam oferty rzutu tego artefaktu. Nie
// mam też oferty tapnięcia Pristine Talisman choćby po to, żeby zyskać życie.”
//
// Root cause (dwie osobne warstwy, jedna karta):
//  (1) `untappedFreeManaSources` wymagało DOKŁADNIE jednego efektu
//      (`effects.length !== 1`), więc źródło z riderem zysku życia nie
//      wchodziło do `producibleMana` ani do auto-tapu — silnik liczył
//      4 many zamiast 5 i nie oferował rzutu za 5 (klasa L48: oferta =
//      płatność, tu obie strony ślepe na to samo źródło);
//  (2) wyciszanie panelu/auto-passu szło przez `isActivatedManaAbility`
//      (CR 605.1a — „czy omija stos”), a to inne pytanie niż „czy gracz ma
//      tu decyzję”. Rider zysku życia jest skutkiem samym w sobie, więc
//      aktywacja musi zostać widoczna.
//
// Naprawa klasą (ADR 0002 — deskryptor, nie nazwa karty):
//  • `BENEFICIAL_MANA_RIDERS` (zamknięta lista korzystnych riderów) —
//    źródło z add_mana + takim riderem liczy się do many i jest
//    auto-tapowane, a `tapFreeManaSource` WYKONUJE rider (auto-płatność
//    daje dokładnie to samo co ręczna aktywacja);
//  • `isSilentManaAbility` — wyciszamy wyłącznie zdolności, których jedynym
//    efektem jest `add_mana`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { producibleMana, untappedFreeManaSources } from '../src/engine/resources.js';
import {
  isActivatedManaAbility, isSilentManaAbility, isPureManaAbilityCommand,
} from '../src/engine/mana-sources.js';

const REGISTRY = createCardRegistry();
const TALISMAN = 'pristine-talisman';
const LANTERN = 'seers-lantern';        // „{T}: Add {C}” — czysta zdolność many
const ARTEFAKT_5 = 'altar-of-the-goyf'; // artefakt za {5} (scenariusz właściciela)

function put(state, id, cardId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone,
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes ?? [],
  });
  return state.objects.get(id);
}

/** Scenariusz właściciela: Główna 1, 4 lądy + nietapnięty Talisman, artefakt za 5 w ręce. */
function scena({ lands = 4, talisman = true, artefakt = true } = {}) {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  for (let i = 0; i < lands; i += 1) put(state, `mt${i}`, 'basic-mountain', 'battlefield');
  if (talisman) put(state, 'tal', TALISMAN, 'battlefield');
  if (artefakt) put(state, 'art', ARTEFAKT_5, 'hand');
  return state;
}

test('F/0: Talisman liczy się do many dostępnej (4 lądy + Talisman = 5, nie 4)', () => {
  const state = scena();
  assert.equal(producibleMana(state, 'p1', null, {}, []), 5,
    'nietapnięty Talisman to piąte źródło many — bez niego oferta rzutu za 5 nie powstaje');
  const wolne = untappedFreeManaSources(state, 'p1').map((e) => e.object.id);
  assert.deepEqual(wolne, ['tal'], `Talisman musi być źródłem wolnym: ${JSON.stringify(wolne)}`);
});

test('F/1: jest oferta rzutu artefaktu za {5} (zgłoszenie właściciela)', () => {
  const view = playerView(scena(), 'p1');
  const oferta = view.legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'art');
  assert.ok(oferta, `brak oferty rzutu: ${JSON.stringify(view.legalCommands.map((c) => c.type + ':' + (c.objectId ?? '')))}`);
});

test('F/2: płatność faktycznie tapuje Talisman I daje 1 życia (oferta = płatność, L48)', () => {
  const state = scena();
  const zycie = state.players.find((p) => p.id === 'p1').life;
  const cmd = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'art');
  assert.ok(cmd, 'oferta rzutu musi istnieć');
  const res = execute(state, cmd);
  assert.ok(res.ok !== false, `rzut musi przejść: ${JSON.stringify(res).slice(0, 160)}`);
  assert.equal(state.objects.get('tal').tapped, true, 'Talisman tapnięty na poczet płatności');
  assert.equal(state.players.find((p) => p.id === 'p1').life, zycie + 1,
    'rider „You gain 1 life” wykonuje się także przy auto-tapie — inaczej auto-płatność '
    + 'dawałaby mniej niż ręczna aktywacja tej samej zdolności');
});

test('F/3: bez Talismana tej oferty nie ma (anty-over-fix: 4 lądy < {5})', () => {
  const view = playerView(scena({ talisman: false }), 'p1');
  const oferta = view.legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'art');
  assert.equal(oferta, undefined, 'przy 4 lądach artefakt za 5 nie może być oferowany');
});

test('F/4: jest oferta aktywacji Talismana choćby po samo życie', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  put(state, 'tal', TALISMAN, 'battlefield');
  const oferta = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'tal');
  assert.ok(oferta, 'gracz musi móc tapnąć Talisman dla samego zysku życia');
});

test('F/5: Talisman NIE jest wyciszany (panel + auto-pass), Lantern nadal jest', () => {
  const talDef = REGISTRY.get(TALISMAN);
  const lanternDef = REGISTRY.get(LANTERN);
  const talAbility = gameObjectDataOf(talDef).abilities[0];
  const lanternAbility = gameObjectDataOf(lanternDef).abilities
    .find((a) => (Array.isArray(a.effect) ? a.effect : [a.effect]).some((e) => e?.type === 'add_mana'));

  // CR 605.1a bez zmian: obie to zdolności many (omijają stos, M154).
  assert.ok(isActivatedManaAbility(talAbility), 'Talisman: nadal zdolność many (CR 605.1a)');
  assert.ok(isActivatedManaAbility(lanternAbility), 'Lantern: zdolność many');

  // Wyciszanie to inne pytanie — decyzja gracza.
  assert.equal(isSilentManaAbility(talAbility), false,
    'rider „You gain 1 life” = skutek sam w sobie, więc zdolności nie wyciszamy');
  assert.equal(isSilentManaAbility(lanternAbility), true,
    '„{T}: Add {C}” bez riderów zostaje wyciszone (anty-over-fix)');

  const cmdFor = (objectId, def) => isPureManaAbilityCommand(
    { type: 'activate_ability', playerId: 'p1', objectId, abilityIndex: 0 },
    null, gameObjectDataOf(def).abilities,
  );
  assert.equal(cmdFor('tal', talDef), false, 'panel/auto-pass: Talisman zostaje widoczny');
  assert.equal(cmdFor('lan', lanternDef), true, 'panel/auto-pass: Lantern nadal wyciszony');
});
