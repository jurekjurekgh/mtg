/**
 * Dyrektywa właściciela N (2026-10-24, następstwo zgłoszenia M): instant
 * osiągalny wyłącznie przez czystą zdolność many o koszcie ręcznym
 * (poświęcenie Eldrazi Sciona: „Sacrifice this token: Add {C}.”) nie dawał
 * się rzucić w turze przeciwnika — auto-pass (decyzja J: czysta zdolność
 * many nie przerywa przebiegu) przejeżdżał takie okno bez stopu, choć
 * zagranie jest w pełni legalne: CR 605.3a „A player may activate an
 * activated mana ability whenever they have priority…” (cytat verbatim
 * z przypiętego lustra CR, ADR 0030). Właściciel: „posiadanie takiej
 * opcji powinno aktywować ofertę (z możliwością zaptaszkowania dla
 * auto-passu)”.
 *
 * Implementacja (`manualManaUnlocksPlayOf` w session.js): gdy szybka
 * ścieżka decyzji (`hasMeaningfulDecisionOf`) jest pusta, sesja pyta
 * silnik symulacyjnie — aktywacja na klonie stanu (`makeSimulate`) i
 * porównanie ofert cast/aktywacji. Stop powstaje TYLKO, gdy ręczna mana
 * realnie odblokowuje zagranie (ilość i kolory liczy silnik, nie sesja),
 * a ptaszek wyciszenia aktywacji ten stop wyłącza. Sam Scion bez
 * osiągalnego zagrania nadal nie stopuje (J zachowane).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { isPureManaAbilityCommand, manaAbilityHasManualCost } from '../src/engine/mana-sources.js';
import { activatableAbilities } from '../src/engine/permanents.js';
import {
  createSession, HUMAN_ID, BOT_ID, commandOptionKey,
  hasMeaningfulDecisionOf, manualManaUnlocksPlayOf,
} from '../src/table/session.js';
import { parseDeckText } from '../src/cards/deck-text.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, zone, playerId, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    ...gameObjectDataOf(def), id, instanceId: `i-${id}`, cardId,
    controllerId: playerId, ownerId: playerId, zone,
    types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
    spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

/** Scena: tura p2, priorytet p1. Lądy/Scion/RW parametryzowane. */
function scena(lądy, { scion = true, wind = true, krok = 'upkeep' } = {}) {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, krok, 'p1');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  lądy.forEach((c, i) => put(state, `land${i}`, c, 'battlefield', 'p1'));
  if (scion) put(state, 'scion', 'token_eldrazi_scion', 'battlefield', 'p1', { token: true });
  if (wind) put(state, 'wind', 'revealing-wind', 'hand', 'p1');
  return state;
}

/** Predykaty jak w sesyjnym wrapperze `hasMeaningfulDecision`. */
function hooki(state, ignorowane = new Set()) {
  const zdolnośćOf = (cmd) => {
    const object = state.objects.get(cmd.objectId);
    if (!object) return null;
    return activatableAbilities(state, object)?.[cmd.abilityIndex]
      ?? object.abilities?.[cmd.abilityIndex]
      ?? (object.cardId ? REGISTRY.get(object.cardId)?.abilities?.[cmd.abilityIndex] : null);
  };
  return {
    isIgnored: (cmd) => ignorowane.has(commandOptionKey(cmd)),
    isManaOnly: (cmd) => {
      const object = state.objects.get(cmd.objectId);
      const fallback = object?.cardId ? REGISTRY.get(object.cardId)?.abilities ?? null : null;
      return isPureManaAbilityCommand(cmd, object, fallback, state);
    },
    isManualMana: (cmd) => manaAbilityHasManualCost(zdolnośćOf(cmd)),
  };
}

const aktywacjaSciona = (view) => view.legalCommands
  .find((c) => c.type === 'activate_ability' && c.objectId === 'scion');
const ofertaWind = (view) => view.legalCommands
  .find((c) => c.type.startsWith('cast') && c.objectId === 'wind');

test('N/1: 2 lasy + Scion + Revealing Wind — bez szybkiej decyzji, ale osiągalność stopuje', () => {
  const state = scena(['basic-forest', 'basic-forest']);
  const view = playerView(state, 'p1');
  const h = hooki(state);
  assert.ok(aktywacjaSciona(view), 'silnik oferuje aktywację Sciona');
  assert.equal(ofertaWind(view), undefined, 'bez poświęcenia oferty rzutu nie ma (2 < 3 many)');
  assert.equal(hasMeaningfulDecisionOf(view, h), false, 'szybka ścieżka: brak realnej decyzji (J)');
  assert.equal(manualManaUnlocksPlayOf(state, view, h), true,
    'poświęcenie Sciona odblokowuje {2}{G} — sesja ma się zatrzymać (CR 605.3a)');
});

test('N/2: ptaszek wyciszenia aktywacji Sciona wyłącza ten stop', () => {
  const state = scena(['basic-forest', 'basic-forest']);
  const view = playerView(state, 'p1');
  const cmd = aktywacjaSciona(view);
  assert.ok(cmd, 'aktywacja Sciona w ofertach');
  const h = hooki(state, new Set([commandOptionKey(cmd)]));
  assert.equal(manualManaUnlocksPlayOf(state, view, h), false,
    'wyciszona aktywacja nie odblokowuje stopu (feature 2026-08-11)');
});

test('N/3: sam Scion bez osiągalnego zagrania nie stopuje (decyzja J zachowana)', () => {
  const state = scena(['basic-forest', 'basic-forest'], { wind: false });
  const view = playerView(state, 'p1');
  assert.equal(manualManaUnlocksPlayOf(state, view, hooki(state)), false,
    'bez czaru w ręce poświęcenie niczego nie odblokowuje');
  // I odwrotnie: manę dalej nie wystarcza też po poświęceniu (1 las + Scion = 2 < 3).
  const state2 = scena(['basic-forest']);
  const view2 = playerView(state2, 'p1');
  assert.equal(manualManaUnlocksPlayOf(state2, view2, hooki(state2)), false,
    'po poświęceniu nadal za mało many — brak stopu');
});

test('N/4: rachunek robi silnik — bez zielonego pipu osiągalności nie ma', () => {
  const state = scena(['basic-mountain', 'basic-mountain']);
  const view = playerView(state, 'p1');
  assert.equal(manualManaUnlocksPlayOf(state, view, hooki(state)), false,
    'Scion daje {C}, a {G} z gór nie powstanie — symulacja odrzuca osiągalność');
});

test('N/5: sesja — przy Summonerze/Scionie stop w turze bota powstaje z samej osiągalności', () => {
  const talie = new Map([
    [HUMAN_ID, parseDeckText('# A\n20x Forest\n8x Revealing Wind\n12x Scion Summoner', REGISTRY).cardIds],
    [BOT_ID, parseDeckText('# B\n20x Mountain\n20x Goblin Piker', REGISTRY).cardIds],
  ]);
  const sesja = createSession({ seed: 21, registry: REGISTRY, decks: talie, pauseOnBotMoves: true });
  const state = sesja.state;
  let znalazłem = false;
  for (let i = 0; i < 2500 && state.status === 'active' && state.turn.number <= 22 && !znalazłem; i++) {
    if (sesja.botPausePending) { sesja.clearBotMoves(); sesja.continueBotPlay(); continue; }
    const view = sesja.view();
    const reka = view.zones.hand ?? [];
    const stol = view.zones.battlefield ?? [];
    const wind = reka.find((o) => o.cardId === 'revealing-wind');
    const maSciona = stol.some((o) => o.controllerId === HUMAN_ID && o.cardId === 'token_eldrazi_scion');
    const wolneLądy = stol.filter((o) => o.controllerId === HUMAN_ID && !o.tapped
      && (o.types ?? []).includes('Land')).length;
    // Kształt dyrektywy: tura bota, RW w ręce, Scion na stole, dokładnie 2
    // wolne lądy (za mało na auto-tap) i BRAK bezpośredniej oferty rzutu —
    // a mimo to stoimy na stopie (sesja nie przejechała auto-passem).
    // Warunek `!hasMeaningfulDecisionOf` wyklucza stopy z innych powodów
    // (deklaracja bloków, triggery) — jedyną przyczyną stopu o tym
    // kształcie jest osiągalność przez Sciona (po wyłączeniu osiągalności
    // ten pin pada, potwierdzone mutacyjnie).
    if (state.turn.activePlayerId === BOT_ID && state.turn.priorityPlayerId === HUMAN_ID
      && wind && maSciona && wolneLądy === 2
      && !view.legalCommands.some((c) => c.type.startsWith('cast') && c.objectId === wind.id)
      && !hasMeaningfulDecisionOf(view, hooki(state))) {
      znalazłem = true;
      break;
    }
    // Polityka człowieka: trzymaj rękę, graj lądy i Summonerów, nie rzucaj RW.
    const keep = view.legalCommands.find((c) => c.type === 'resolve_mulligan_choice' && c.keep);
    const land = view.legalCommands.find((c) => c.type === 'play_land');
    const summoner = view.legalCommands.find((c) => c.type.startsWith('cast')
      && reka.find((o) => o.id === c.objectId)?.cardId === 'scion-summoner');
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    const inny = view.legalCommands.find((c) => c.type !== 'concede' && !c.type.startsWith('cast'));
    const cmd = keep ?? land ?? summoner ?? pass ?? inny ?? view.legalCommands[0];
    assert.ok(cmd, 'zawsze jest komenda');
    sesja.apply(cmd);
  }
  assert.ok(znalazłem, 'sesja zatrzymała się w turze bota na samej osiągalności Scion→{2}{G}');
});
