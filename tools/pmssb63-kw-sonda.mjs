// PMSSB-63 (batch 68) — dowod OTWARTEGO ustalenia: slowa kluczowe i zdolnosci stworzenia rzucanego z reki
// nie wplywaja na wycene rzutu (Child of Night: lifelink = latanie = deathtouch). Pomiar PRZED naprawy (PMSSB-64).
// Uruchomienie: node tools/pmssb63-kw-sonda.mjs
import { addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { botTurn } from './pmssb63-batch68-sonda.mjs';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
const REG = createCardRegistry();
function run(keywords, cardId = 'child-of-night', mana = ['B', 2]) {
  const state = botTurn({ life: 20 });
  addMana(state, 'p2', mana[1], { colors: [mana[0]] });
  const def = REG.get(cardId); const data = gameObjectDataOf(def);
  addObject(state, { id: 'x', instanceId: 'i-x', cardId, controllerId: 'p2', ownerId: 'p2', zone: 'hand',
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost, spell: data.spell,
    abilities: data.abilities ?? [], keywords, subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [] });
  const bot = createHeuristicBot({ seed: 68 });
  bot.chooseCommand(playerView(state, 'p2'), {});
  const e = bot.trace().at(-1);
  return (e?.options ?? []).filter(o => o?.cmd?.startsWith('cast_permanent(x')).map(o => o.score)[0];
}
console.log('lifelink (def)', run(['lifelink']));
console.log('none', run([]));
console.log('flying (bear body)', run(['flying']));
console.log('deathtouch', run(['deathtouch']));
