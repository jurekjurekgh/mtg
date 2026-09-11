// Wyzwanie 2/5 (2026-09-11, „brązowa odznaka wyłapywacza błędów”) —
// Changeling: zdolność definiująca cechę „ten obiekt jest każdym typem stworów”.
//
// Źródło prawdy (ADR 0030 — pobrane online 2026-09-11, nie z pamięci):
//   • CR 702.73a (mtg.wiki/page/Changeling, CR z 7.08.2026): „Changeling is a
//     characteristic-defining ability. 'Changeling' means 'This object is every
//     creature type.' This ability works everywhere, even outside the game.
//     See rule 604.3."
//   • Lorwyn Rules Primer (2007-08-23), tamże: „Because a card with changeling
//     is every creature type, it will be affected by any spell or ability that
//     affects any creature type, regardless of what that creature type is. And
//     because changeling is a characteristic-defining ability, this is true in
//     all zones. For example, if a card tells you to reveal a Merfolk card from
//     your hand, return a Goblin card from your graveyard to your hand, or gain
//     control of a Goat, you can perform these actions on a card with changeling."
//
// Stan przed naprawą: silnik trzymał changeling wyłącznie jako keyword, a
// porównania podtypów czytały surowe `object.subtypes`. Nota katalogowa
// barkform-harvester twierdziła, że „żadna mechanika katalogu nie pyta o typy
// stwora” — to nieprawda: pyta co najmniej kilkanaście (cel „non-Mount”,
// statyka plemienna, „can't be blocked by Vampires or Zombies”, rabat
// „następny czar Olbrzyma”, ujawnienie Olbrzyma z ręki).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords } from '../src/engine/permanents.js';
import { attachEquipmentToCreature } from '../src/engine/attachments.js';
import { declareAttackers, declareBlockers } from '../src/engine/combat.js';
import { applyEffect } from '../src/engine/effects.js';

const REGISTRY = createCardRegistry();
const CHANGELING = 'barkform-harvester'; // 2/3 Shapeshifter, reach + changeling

function game() {
  const state = createGameState({ seed: 5252, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], equipment: data.equipment ?? null,
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], ...patch,
  });
  return state.objects.get(id);
}

test('W2/1: changeling JEST Mountem ⇒ „Tap target non-Mount creature” nie może go celować (CR 702.73a)', () => {
  const state = game();
  putCard(state, 'keeper', 'sterling-keykeeper', 'p1');
  putCard(state, 'har', CHANGELING, 'p2');
  addMana(state, 'p1', 2, { colors: ['W'] });

  const r = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'keeper', abilityIndex: 0, targets: ['har'],
  });
  assert.equal(r.ok, false,
    'changeling jest każdym typem stworów — także Mountem, więc cel „non-Mount” jest nielegalny');
  assert.equal(state.objects.get('har').tapped ?? false, false, 'changeling nietapnięty — zdolność nie zadziałała');
});

test('W2/2: statyka plemienna obejmuje changelinga („Lhurgoyf creatures you control have trample”)', () => {
  const state = game();
  putCard(state, 'altar', 'altar-of-the-goyf', 'p1');
  const har = putCard(state, 'har', CHANGELING, 'p1');

  assert.ok(effectiveKeywords(har, state).includes('trample'),
    'changeling jest Lhurgoyfem ⇒ dostaje trample z Altar of the Goyf (CR 702.73a)');
});

test('W2/3: changeling JEST Wampirem i Zombiem ⇒ nie blokuje nosiciela Blazing Torch', () => {
  const state = game();
  // Restrykcja „can't be blocked by Vampires or Zombies" dotyczy BLOKERÓW, więc
  // changeling musi stać po stronie broniącej (atakujący = zwykły stwór z Torch).
  const attacker = putCard(state, 'atk', 'armored-skaab', 'p1');
  putCard(state, 'torch', 'blazing-torch', 'p1');
  attachEquipmentToCreature(state, 'torch', 'atk');
  putCard(state, 'har', CHANGELING, 'p2');

  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  declareAttackers(state, 'p1', ['atk']);
  // Priorytet musi dojść do obrońcy, żeby krok przeszedł na declare_blockers.
  for (let i = 0; i < 4 && state.turn.step !== 'declare_blockers'; i += 1) {
    const holder = state.turn.priorityPlayerId;
    const rp = execute(state, { type: 'pass_priority', playerId: holder });
    assert.ok(rp.ok, `pass: ${rp.events[0]?.reason}`);
  }
  assert.equal(state.turn.step, 'declare_blockers', 'setup: krok deklaracji blokujących');

  assert.throws(
    () => declareBlockers(state, 'p2', { atk: ['har'] }),
    /podtyp/i,
    'changeling jest Wampirem i Zombiem, więc nie może blokować nosiciela Blazing Torch (CR 702.73a)',
  );
  assert.ok(attacker.zone === 'battlefield', 'sanity: atakujący na polu bitwy');
});

test('W2/4: changeling działa POZA polem bitwy — „reveal a Giant card from your hand” (Lorwyn Primer)', () => {
  const state = game();
  putCard(state, 'har', CHANGELING, 'p1', 'hand');
  const saga = putCard(state, 'saga', 'invasion-of-the-giants', 'p1');

  applyEffect(state, { type: 'reveal_subtype_deal_damage', subtype: 'Giant', amount: 2 }, saga, []);

  assert.ok(state.pendingRevealChoice, 'decyzja ujawnienia Olbrzyma została zakolejkowana');
  assert.ok(state.pendingRevealChoice.cardIds.includes('har'),
    'changeling w RĘCE jest Olbrzymem — CDA działa w każdej strefie (CR 702.73a: „works everywhere”)');
});

test('W2/5 (straż over-fix): zwykły stwór bez changelinga NIE jest Mountem — cel „non-Mount” legalny', () => {
  const state = game();
  putCard(state, 'keeper', 'sterling-keykeeper', 'p1');
  putCard(state, 'skaab', 'armored-skaab', 'p2'); // Zombie Warrior — żadnego changelinga
  addMana(state, 'p1', 2, { colors: ['W'] });

  const r = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'keeper', abilityIndex: 0, targets: ['skaab'],
  });
  assert.ok(r.ok, `zwykły stwór pozostaje legalnym celem „non-Mount”: ${r.events[0]?.reason ?? ''}`);
});
