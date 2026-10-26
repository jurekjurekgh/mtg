// =============================================================================
// Zgłoszenie R (log właściciela 2026-10-26) — bot poświęca Eldrazi Sciona,
// choć *Kozilek's Predator* jest płatny z samych lądów.
//
// Scena z logu: bot ma 4 nietapnięte lądy (Mountain ×2, Swamp, Forest),
// *Scion Summoner* i Sciona. Zagrywa *Fertile Thicket* (piąty ląd, wchodzi
// tapnięty) i — jeszcze przy triggerze Thicket na stosie — poświęca Sciona,
// po czym rzuca Predatora za {3}{G} z trzech lądów + pływającej {C}.
//
// Przyczyna (sonda na żywym silniku): bramka `castScoreForUnlock`
// (PMSSB-32/F6) wyceniała czary z celem komendami syntetycznymi dla KAŻDEGO
// obiektu pola bitwy i KAŻDEGO gracza, bez sprawdzenia specu celu. W ręce
// bota leżał *Boulder Salvo* ({4}{R}, „deals 4 damage to target creature”);
// syntetyk „w przeciwnika” wyceniał się dodatnio jak burn w twarz, choć taki
// cel jest nielegalny, a na stole nie było żadnego stwora przeciwnika.
// Jednorazowe źródło many dostawało więc premię +6 za FIKCYJNE odblokowanie
// i wygrywało z passem przy oknie triggera.
//
// Naprawa u źródła (ADR 0002 — po deskryptorze, bez nazw kart):
// `syntheticTargetCandidatesOf` buduje cele wyłącznie z kategorii specu
// czaru, a wariant bez celu nie uczestniczy w wycenie czaru z celem.
// Anty-over-fix: legalny, wart rzutu cel nadal finansuje aktywację
// (PMSSB-32/F6), a Predator przy realnym braku many nadal odblokowuje się
// Scionem (poprawione zgłoszenie N).
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, zone, playerId = 'p2') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} istnieje w rejestrze`);
  addObject(state, {
    ...gameObjectDataOf(def), id, instanceId: `i-${id}`, cardId,
    controllerId: playerId, ownerId: playerId, zone,
    types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [], spell: def.spell,
  });
}

/** Stół z logu: tura bota (p2), main1, priorytet bota. */
function scena() {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  state.pendingMulligans = [];
  put(state, 'mtn1', 'basic-mountain', 'battlefield');
  put(state, 'mtn2', 'basic-mountain', 'battlefield');
  put(state, 'swamp', 'basic-swamp', 'battlefield');
  put(state, 'forest', 'basic-forest', 'battlefield');
  put(state, 'summoner', 'scion-summoner', 'battlefield');
  put(state, 'scion', 'token_eldrazi_scion', 'battlefield');
  return state;
}

const wynikAktywacjiSciona = (bot) => bot.trace().at(-1)?.options
  .find((o) => o.cmd.startsWith('activate_ability(scion#0)'))?.score;

test('R/1: sekwencja z logu — pass przy triggerze Thicket, Predator płatny z samych lądów', () => {
  const state = scena();
  put(state, 'thicket', 'fertile-thicket', 'hand');
  put(state, 'pred', 'kozileks-predator', 'hand');
  put(state, 'salvo', 'boulder-salvo', 'hand');
  for (let i = 0; i < 8; i += 1) put(state, `lib${i}`, i === 0 ? 'basic-forest' : 'basic-mountain', 'library');

  const bot = createHeuristicBot({ seed: 5 });
  const komendyBota = [];
  let rzuconoPredatora = false;
  for (let krok = 0; krok < 12 && !rzuconoPredatora; krok += 1) {
    const pid = state.turn.priorityPlayerId;
    const view = playerView(state, pid);
    const cmd = pid === 'p2'
      ? bot.chooseCommand(view, {})
      : view.legalCommands.find((c) => c.type === 'pass_priority') ?? view.legalCommands[0];
    if (pid === 'p2') komendyBota.push(cmd);
    const wynik = execute(state, cmd);
    assert.equal(wynik.ok, true, `krok ${krok}: ${cmd.type} musi się wykonać`);
    rzuconoPredatora = cmd.type === 'cast_permanent' && cmd.objectId === 'pred';
  }

  assert.equal(rzuconoPredatora, true, 'bot finalnie rzuca Predatora');
  assert.equal(komendyBota[0]?.type, 'play_land', 'najpierw ląd (Fertile Thicket), jak w logu');
  assert.ok(
    !komendyBota.some((c) => c.type === 'activate_ability' && c.objectId === 'scion'),
    'Scion NIE jest poświęcany — ani przy triggerze, ani przed rzutem',
  );
  const obiekty = [...state.objects.values()];
  assert.equal(obiekty.find((o) => o.id === 'scion')?.zone, 'battlefield', 'Scion żyje po rzucie');
  for (const id of ['mtn1', 'mtn2', 'swamp', 'forest']) {
    assert.equal(obiekty.find((o) => o.id === id)?.tapped, true, `${id} płaci za Predatora`);
  }
});

test('R/2: sam Boulder Salvo bez stwora przeciwnika nie odblokowuje Sciona (też przy pustym stosie)', () => {
  // Defekt nie był kwestią timingu triggera: fałszywa wycena „burnu w gracza”
  // wygrywała także przy pustym stosie. Cel „target creature” nie może być
  // wyceniany na graczu — aktywacja spada pod pass.
  const state = scena();
  put(state, 'salvo', 'boulder-salvo', 'hand');
  const bot = createHeuristicBot({ seed: 5 });
  const cmd = bot.chooseCommand(playerView(state, 'p2'), {});
  assert.equal(cmd.type, 'pass_priority', 'bez legalnego wartościowego celu bot czeka');
  assert.ok(wynikAktywacjiSciona(bot) < 0, 'aktywacja Sciona jest ujemna (brak fikcyjnego odblokowania)');
});

test('R/3 (anty-over-fix, PMSSB-32/F6): legalny cel wroga nadal finansuje aktywację Sciona', () => {
  const state = scena();
  put(state, 'salvo', 'boulder-salvo', 'hand');
  put(state, 'foe', 'hill-giant', 'battlefield', 'p1');
  const bot = createHeuristicBot({ seed: 5 });
  const cmd = bot.chooseCommand(playerView(state, 'p2'), {});
  assert.equal(cmd.type, 'activate_ability', 'Boulder Salvo z celem 3/3 warto odblokować');
  assert.equal(cmd.objectId, 'scion', 'finansuje go Scion (sacrifice-self mana)');
  assert.ok(wynikAktywacjiSciona(bot) > 0, 'premia za realne odblokowanie zostaje');
});

test('R/4 (anty-over-fix, zgłoszenie N): realny brak many na Predatora nadal aktywuje Sciona', () => {
  // Tylko 3 lądy: Predator {3}{G} nie jest płatny automatem, więc sekwencja
  // „aktywuj Sciona → rzuć” pozostaje legalną i chcianą ścieżką bota.
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  state.pendingMulligans = [];
  put(state, 'mtn1', 'basic-mountain', 'battlefield');
  put(state, 'swamp', 'basic-swamp', 'battlefield');
  put(state, 'forest', 'basic-forest', 'battlefield');
  put(state, 'summoner', 'scion-summoner', 'battlefield');
  put(state, 'scion', 'token_eldrazi_scion', 'battlefield');
  put(state, 'pred', 'kozileks-predator', 'hand');
  const bot = createHeuristicBot({ seed: 5 });
  const cmd = bot.chooseCommand(playerView(state, 'p2'), {});
  assert.equal(cmd.type, 'activate_ability', 'przy 3 lądach Scion realnie odblokowuje Predatora');
  assert.equal(cmd.objectId, 'scion');
});
