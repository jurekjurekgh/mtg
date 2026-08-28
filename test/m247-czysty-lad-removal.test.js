// M247 (audyt Żywym Testerem, 2026-08-28) — z rodziny „częste ∧ nieoptymalne"
// (metoda M236). Odtworzone z partii mirrodin-brg vs mirrodin-wu, seed 11,
// tura 16: przeciwnik miał na stole WYŁĄCZNIE lądy (Swampy, Mountain,
// artefaktowy Great Furnace) i bot rzucił Banishment Decree za {3}{W}{W}
// „od tali" — odesłanie czystego LĄDU na wierzch biblioteki właściciela.
//
// Root cause (heurystyka, nie engine — silnik słusznie uznaje ląd
// artefaktowy za legalny cel „artifact, creature or enchantment", CR 109.2):
// gałąź wyceny removalu zakładała premie PREMIĄ `P.removalEnemyBase` (22)
// + `P.spellBase` (50) dla KAŻDEGO permanentu wroga, bez pytania, czy
// usunięcie ma jakąkolwiek wartość bojową. Ląd bez zdolności bojowych nic
// nie dostawia — odesłany odtworzy się za darmo (z wierzchu biblioteki
// wręcz wraca przy następnym doborze), zniszczony-zagubiony trafia do
// strefy właściciela i niczego nie blokuje ani nie atakuje. Karta nakładana
// była wydawana tylko dlatego, że „istnieje dowolny legalny cel".
//
// Naprawa (generycznie po typach z widoku, ADR 0002/0017): cele czysto-lądowe
// (`types` zawiera 'Land' i NIE zawiera 'Creature' — Dryad Arbor i animowane
// lądy atakują/bronią, więc giną „naprawdę") nie dostają premii removalu,
// a właściciel-biz hopłakuje kartę karą przebijającą bazę czaru + bazę
// removalu (wzorzec M237/2 przy trywialnych kontrach: wariant ma zjechać
// PONIŻEJ passu). Anti-overfix: efekty PROJEKTOWANE pod niszczenie lądów
// (spec celu 'land' — Vandalize, tryb „Zniszcz ląd") kary nie dostają.
//
// Pokryte miejsca wyceny: pojedynczy REMOVAL (destroy/exile/bounce…) oraz
// modalny `bounce_permanent`. Dwie pozostałe ścieżki zostaly świadomie
// NIETKNIĘTE bo niedosągalne (ADR 0016 — minimalny patch, L39):
//  - wrapper „each of up to N targets" (Sea God's Scorn…) — specu tego
//    wrappera w rejestrze tylko creature_or_enchantment, więc ląd tam nie
//    trafi z konstrukcji,
//  - modalny `bounce_permanent` (Steel Sabotage — tryb „Zwrot do ręki").
//    Gałąź `return_to_hand` celowo NIE została zmieniona: żaden producent
//    tego typu efektu nie istnieje w src/ (martwa ścieżka, wykryta przy tej
//    okazji; minimalny patch ADR 0016 — notka w kodzie przy helperze).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, playerView, addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game(handCardIds, enemyCardIds, { botLands = ['basic-plains', 'basic-plains', 'basic-plains', 'basic-plains', 'basic-plains'], step = 'main1' } = {}) {
  const state = createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  const put = (id, cardId, ctrl, zone) => {
    const def = REGISTRY.get(cardId);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: ctrl, ownerId: ctrl, zone,
      kind: (def.types ?? []).includes('Land') ? 'land' : ((def.types ?? []).includes('Creature') ? 'creature' : 'spell'),
      ...gameObjectDataOf(def),
      types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
      abilities: def.abilities ?? [], power: def.power, toughness: def.toughness,
      manaCost: def.manaCost, colors: def.colors ?? [], spell: def.spell,
    });
    if (zone === 'battlefield') state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, tapped: false }));
  };
  botLands.forEach((cid, i) => put(`l${i}`, cid, 'p2', 'battlefield'));
  handCardIds.forEach((cid, i) => put(`h${i}`, cid, 'p2', 'hand'));
  enemyCardIds.forEach((cid, i) => put(`e${i}`, cid, 'p1', 'battlefield'));
  return state;
}

function optsFor(state) {
  const bot = createHeuristicBot({ seed: 2026 });
  bot.chooseCommand(playerView(state, 'p2'), {});
  return { pick: bot.trace()[0].chosen, options: bot.trace()[0].options };
}

test('M247/1: Banishment Decree NIE wpada w czysty artefaktowy ląd przeciwnika (zgłoszenie z rozgrywki)', () => {
  // Plansza wroga: 3 lądy podstawowe + Great Furnace (Artifact Land) —
  // odtworzenie stanu tury 16 partii mirrodin-brg × mirrodin-wu seed 11.
  const state = game(['banishment-decree'], ['basic-swamp', 'basic-swamp', 'basic-mountain', 'great-furnace']);
  const { pick, options } = optsFor(state);
  const atLand = options.find((o) => o.cmd.startsWith('cast_spell(h0->e3'));
  assert.ok(atLand, 'oferta istnieje (cel z CR perspektywy legalny — engine bez zmian)');
  assert.ok(atLand.score < 0, `removal w czysty ląd schodzi poniżej passu: score=${atLand.score}`);
  assert.equal(pick, 'pass_priority', 'bot trzyma Banishment Decree na realny cel');
});

test('M247/2: ten sam czar na realne zagrożenie (4/4) jest dalej grany — anti-overfix', () => {
  const state = game(['banishment-decree'], ['basic-swamp', 'cacophodon']); // 2/5
  const { pick, options } = optsFor(state);
  const atCreature = options.find((o) => o.cmd.startsWith('cast_spell(h0->e1'));
  assert.ok(atCreature && atCreature.score > 0, `removal twarga 2/5 grany: score=${atCreature?.score}`);
  assert.equal(pick, atCreature.cmd);
});

test('M247/3 (anti-overfix): Vandalize w trybie „Zniszcz ląd" NIE jest karany — projekt land-hate', () => {
  const state = game(['vandalize'], ['basic-mountain'],
    { botLands: ['basic-mountain', 'basic-mountain', 'basic-mountain', 'basic-mountain', 'basic-mountain'] });
  const { pick } = optsFor(state);
  assert.equal(pick, 'cast_spell(h0->e0)', 'tryb zaprojektowany pod lądy dostaje normalną wycenę (+72)');
});

test('M247/4: modalny bounce_permanent (Steel Sabotage „Zwrot do ręki") w czysty ląd schodzi poniżej passu', () => {
  // Steel Sabotage, tryb 2: „Return target artifact to its owner's hand" —
  // ląd artefaktowy JEST artefaktem (legalny cel), ale odbicie go znaczy:
  // „jednostronny faithless looting przeciwnika za darmo". Gałąź wycieki w
  // trybie modalnym (cmd.modeIndex=1 → efekty trybu) — ta sama reguła M247.
  const state = game(['steel-sabotage'], ['basic-swamp', 'great-furnace'],
    { botLands: ['basic-island', 'basic-island'] });
  const { pick, options } = optsFor(state);
  const atLand = options.find((o) => o.cmd.startsWith('cast_spell(h0->e1'));
  assert.ok(atLand, 'oferta odbicia lądu istnieje (cel legalny, jak dawniej)');
  assert.ok(atLand.score < 0, `bounce_permanent czystego lądu poniżej passu: score=${atLand.score}`);
  assert.equal(pick, 'pass_priority');
});
