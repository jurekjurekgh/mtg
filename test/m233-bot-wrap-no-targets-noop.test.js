// M233 — audyt Żywym Testerem (2026-08-27), partia tarkir-wur (gracz) vs
// warhammer-ubr (bot), seed 11: w turze 12 bot rzucił Wrap in Flames
// (Sorcery 4 many: „1 obrażenie każdemu z max 3 celów + nie może blokować")
// mimo że gracz NIE kontrolował żadnego stwora. Czar poszedł BEZ CELÓW —
// 4 many i cała karta wyrzucone za zero efektu.
//
// Oś 1 audytu (bezsensowne działania bota — technicznie legalne, marnują
// czar/manę/potencjał). Root cause: `effectIsInertNow` nie miał przypadku dla
// wrappera `apply_to_each_target`. Gdy jedyny legalny wariant to rzut BEZ
// celów (variableTargets min:0, brak celów na stole), wrapper aplikuje efekty
// wewnętrzne do KAŻDEGO celu — a zero celów = zero efektu. Wycena zostawała na
// bazie spellBase (50) > pass (0), więc bot rzucał. Naprawa: wrapper bez celów
// jest jałowy (ADR 0002 — generycznie po typie efektu, nie po nazwie karty).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function putCard(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function botTurn() {
  const state = createGameState({ seed: 233, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  return state;
}

function wrapScores(state) {
  const bot = createHeuristicBot({ seed: 233 });
  bot.chooseCommand(playerView(state, 'p2'), {});
  const trace = bot.trace()[0];
  const pass = trace.options.find((o) => o.cmd === 'pass_priority')?.score ?? 0;
  const wrap = trace.options.filter((o) => o.cmd.startsWith('cast_spell(w')).map((o) => o.score);
  return { pass, wrap };
}

test('M233: bot NIE rzuca Wrap in Flames bez celów (brak stworów wroga)', () => {
  const state = botTurn();
  putCard(state, 'w', 'wrap-in-flames', 'p2', 'hand');
  // Brak jakichkolwiek stworów na stole → jedyny legalny wariant to 0 celów.
  const choice = createHeuristicBot({ seed: 233 }).chooseCommand(playerView(state, 'p2'), {});
  assert.notEqual(
    choice.type === 'cast_spell' && choice.objectId === 'w' ? 'cast-wrap-empty' : 'inne',
    'cast-wrap-empty',
    `bot nie powinien rzucać Wrap in Flames bez celów: ${JSON.stringify(choice)}`,
  );
});

test('M233: wycena Wrap in Flames bez celów < pass', () => {
  const state = botTurn();
  putCard(state, 'w', 'wrap-in-flames', 'p2', 'hand');
  const { pass, wrap } = wrapScores(state);
  assert.ok(wrap.length > 0, 'wariant bez celów powinien istnieć w śladzie');
  for (const s of wrap) assert.ok(s < pass, `Wrap bez celów (${s}) musi być poniżej passu (${pass})`);
});

// I (zgłoszenie właściciela 2026-10-08): pin powyżej („Wrap NADAL premiowany na
// stworze wroga") opisuje STARE zachowanie, które właściciel zgłosił jako
// marnotrawstwo: „dwie kreatury miały >1 toughness i nic im się nie stało, a
// bot nie atakował w ogóle". Nowa reguła (Oracle: „1 damage to each of up to
// three target creatures. Those creatures can't block this turn.") — czar ma
// sens tylko gdy (a) 1 obrażenia ZABIJAJĄ któregoś stwora wroga (CR 704.5g)
// ALBO (b) bot realnie atakuje w tej turze i „can't block" usuwa blokera
// (CR 509.1b). Premia jest więc WARUNKOWA, a baza czaru (spellBase 50) jej
// nie niesie — stąd poniższe trzy piny zamiast jednego.
test('M233/I: Wrap na NIEŚMIERTELNE ciało bez zamiaru ataku schodzi poniżej passu', () => {
  const state = botTurn();
  putCard(state, 'w', 'wrap-in-flames', 'p2', 'hand');
  // Thornhide Wolves 4/5: 1 obrażenia go nie zabija, a bot nie ma żadnego
  // stworu zdolnego atakować — „can't block" nie kupuje nic (jego tura, ale
  // brak atakujących = brak okna ataku).
  putCard(state, 'foe', 'thornhide-wolves', 'p1', 'battlefield');
  const { pass, wrap } = wrapScores(state);
  assert.ok(wrap.length > 0, 'warianty z celem istnieją w śladzie');
  for (const s of wrap) assert.ok(s < pass,
    `Wrap na ciało, które 1 obrażenia nie zabijają (${s}) musi być poniżej passu (${pass})`);
});

test('M233/I: Wrap na ciało, które 1 obrażenia ZABIJAJĄ — nadal premiowany (regresja M158)', () => {
  const state = botTurn();
  putCard(state, 'w', 'wrap-in-flames', 'p2', 'hand');
  putCard(state, 'foe', 'soulmender', 'p1', 'battlefield'); // 1/1 — lethal dla 1 dmg
  const { pass, wrap } = wrapScores(state);
  assert.ok(wrap.some((s) => s > pass),
    `Wrap na cel, który zabija (${JSON.stringify(wrap)}), powinien przebić pass (${pass})`);
});

test('M233/I: Wrap w precombat z WŁASNYM atakującym — premiowany (wyłącza blokera)', () => {
  const state = botTurn();
  putCard(state, 'w', 'wrap-in-flames', 'p2', 'hand');
  putCard(state, 'mine', 'thornhide-wolves', 'p2', 'battlefield'); // 4/5, bez choroby
  putCard(state, 'foe', 'thornhide-wolves', 'p1', 'battlefield');  // 4/5 bloker wroga
  const { pass, wrap } = wrapScores(state);
  assert.ok(wrap.some((s) => s > pass),
    `Wrap w oknie ataku wyłącza blokera (${JSON.stringify(wrap)} vs pass ${pass})`);
});
