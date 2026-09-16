// Sonda Srebra v11: S9 first-strike okno, S7 unless-pay wybór, S5 fight-death, S3 token-dies.
import { createGameState, addObject, execute, playerView } from './src/engine/game-state.js';
import { createCardRegistry } from './src/cards/card-data.js';
import { gameObjectDataOf } from './src/cards/materialize.js';
import { addMana } from './src/engine/resources.js';
import { jumpToStep } from './src/engine/turn.js';

const REGISTRY = createCardRegistry();
function game(pid = 'p1') {
  const state = createGameState({ seed: 99, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', pid);
  state.turn.activePlayerId = pid; state.turn.priorityPlayerId = pid;
  return state;
}
function putCard(state, id, cardId, controllerId, zone, over = {}) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, aura: def.aura ?? null, ...over,
  });
  const o = state.objects.get(id);
  if (zone === 'battlefield') state.objects.set(id, Object.freeze({ ...o, summoningSickness: false }));
  return state.objects.get(id);
}
function libs(state, n = 10) {
  for (let i = 0; i < n; i++) { putCard(state, `l1-${i}-${Math.random()}`, 'basic-forest', 'p1', 'library'); putCard(state, `l2-${i}-${Math.random()}`, 'basic-forest', 'p2', 'library'); }
}

// S9: sierżant 2/2 FS + renown vs bloker 3/3. IRL: FS(2) → priorytet → Shock → bloker ginie → sierżant żyje Z licznikiem.
{
  const state = game();
  libs(state);
  putCard(state, 'sarge', 'akroan-sergeant', 'p1', 'battlefield');
  putCard(state, 'blk', 'etherium-abomination', 'p2', 'battlefield'); // 4/3
  putCard(state, 'shock', 'shock', 'p1', 'hand');
  addMana(state, 'p1', 8, { colors: ['R'] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1'); state.turn.activePlayerId = 'p1';
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['sarge'] });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  console.log('S9 step:', state.turn.step);
  execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { sarge: ['blk'] } });
  execute(state, { type: 'pass_priority', playerId: 'p2' }); // okno po blokach — NIE szokujemy (czekamy na okno FS)
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  console.log('S9 step before damage:', state.turn.step);
  const offers = playerView(state, 'p1').legalCommands.map((c) => c.type);
  console.log('S9 offers (czy jest resolve_combat + czy shock nadal grywalny?):', [...new Set(offers)].join(','));
  const rc = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_combat') ?? playerView(state, 'p2').legalCommands.find((c) => c.type === 'resolve_combat');
  console.log('S9 resolve_combat:', rc ? execute(state, rc).ok : '(brak oferty)');
  console.log('S9 after: sarge=', state.objects.get('sarge')?.zone, '| blk=', [...state.objects.values()].filter((o) => o.cardId === 'etherium-abomination').map((o) => o.zone), '| sarge counters:', JSON.stringify(state.objects.get('sarge')?.counters ?? null));
}

// S7: Frightful Delusion przy dostępnej manie — WYBÓR (zapłać / nie) czy auto-pay?
{
  const state = game();
  putCard(state, 'beast', 'akroan-sergeant', 'p1', 'hand');
  putCard(state, 'fright', 'frightful-delusion', 'p2', 'hand');
  addMana(state, 'p1', 10, { colors: ['R'] });
  addMana(state, 'p2', 10, { colors: ['U'] });
  console.log('S7 cast:', execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'beast' }).ok);
  console.log('S7 counter:', execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'fright', targets: ['permanent-1'] }).ok);
  let g = 0;
  while (state.zones.stack.length > 0 && g++ < 10) {
    const me = state.turn.priorityPlayerId;
    const cmds = playerView(state, me).legalCommands.map((c) => c.type);
    const uniq = [...new Set(cmds)];
    if (!uniq.every((t) => t === 'pass_priority')) { console.log(`S7 decision for ${me}:`, uniq.join(',')); break; }
    execute(state, { type: 'pass_priority', playerId: me });
  }
}

// S5: walka deathtouch 1/1 vs 5/5 — oba giną? (karta fight?)
{
  const state = game();
  console.log('S5 fight cards:', [...REGISTRY.all()].filter((c) => /fight/i.test(c.oracleText ?? '') && c.support?.status === 'supported').map((c) => c.id).slice(0, 5));
}

// S3: token ginie → trigger „dies” odpala? (Blood Artist analog?)
{
  const dies = [...REGISTRY.all()].filter((c) => (c.abilities ?? []).some((a) => /died|dies/.test(a.trigger?.event ?? '')) && c.support?.status === 'supported').map((c) => c.id);
  console.log('S3 dies-trigger cards:', dies.slice(0, 8));
}
