// Sonda Srebra E0: 4 hipotezy behawioralne (odrzucić/potwierdzić).
import { createGameState, addObject, execute } from './src/engine/game-state.js';
import { createCardRegistry } from './src/cards/card-data.js';
import { gameObjectDataOf } from './src/cards/materialize.js';
import { jumpToStep } from './src/engine/turn.js';
import { createBattlefieldToken } from './src/engine/tokens.js';
import { addMana } from './src/engine/resources.js';

const REGISTRY = createCardRegistry();
const game = () => createGameState({ seed: 99, players: [{ id: 'p1' }, { id: 'p2' }] });
function putCard(state, id, cardId, controllerId, zone, over = {}) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...over,
  });
  return state.objects.get(id);
}
function mainPhase(state, pid = 'p1') {
  state.turn.phase = 'precombat_main'; state.turn.activePlayerId = pid;
  state.turn.priorityPlayerId = pid; state.turn.step = 'precombat_main'; state.turn.passes = 0;
}

// H1 (S3): token ginie → Selhoff Occultist (any_creature_dies) mieli?
{
  const state = game(); mainPhase(state);
  putCard(state, 'occ', 'selhoff-occultist', 'p1', 'battlefield');
  const tok = createBattlefieldToken(state, 'p1', { cardId: 'token_soldier', name: 'Soldier', power: 1, toughness: 1 });
  putCard(state, 'lib1', 'basic-forest', 'p2', 'library');
  putCard(state, 'lib2', 'basic-forest', 'p2', 'library');
  // Zabij token Shockiem.
  putCard(state, 'shock', 'shock', 'p1', 'hand');
  addMana(state, 'p1', 1);
  console.log('H1 cast shock:', execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'shock', targets: [tok.id] }).ok);
  for (let i = 0; i < 4 && state.zones.stack.length > 0; i++) execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  const gyP2 = state.zones.graveyard.filter((id) => state.objects.get(id)?.controllerId === 'p2');
  console.log('H1 token zone:', state.objects.get(tok.id)?.zone ?? '(gone)', '| p2 gy size:', gyP2.length,
    '| mill trigger fired:', state.events.some((e) => e.type === 'ability_triggered' && String(e.cardId).includes('occultist')) || state.events.some((e) => e.type === 'player_milled'));
}

// H2 (S9): Scroll Thief z double strike niezablokowany → 2 triggery draw?
{
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  putCard(state, 'thief', 'scroll-thief', 'p1', 'battlefield', { keywords: ['double_strike'] });
  putCard(state, 'd1', 'basic-island', 'p1', 'library');
  putCard(state, 'd2', 'basic-island', 'p1', 'library');
  putCard(state, 'd3', 'basic-island', 'p1', 'library');
  console.log('H2 declare:', execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['thief'] }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  // declare_blockers: p2 passuje (brak blokerów) — obrońca deklaruje pusty zestaw?
  console.log('H2 step after passes:', state.turn.step);
  let r = execute(state, { type: 'declare_blockers', playerId: 'p2', blocks: [] });
  console.log('H2 blockers:', r.ok, r.events?.[0]?.reason ?? '');
  // combat damage
  for (let i = 0; i < 6; i++) {
    const holder = state.turn.priorityPlayerId;
    const rr = execute(state, { type: 'pass_priority', playerId: holder });
    if (!rr.ok) { console.log('H2 pass stop:', holder, rr.events?.[0]?.reason); break; }
  }
  const draws = state.events.filter((e) => e.type === 'card_drawn' && e.playerId === 'p1').length;
  const trigs = state.events.filter((e) => e.type === 'ability_triggered' && String(e.cardId).includes('scroll')).length;
  console.log('H2 draws:', draws, '| scroll triggers:', trigs, '| step:', state.turn.step);
}

// H3 (S8): świeży Vehicle + crew → może atakować?
{
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  putCard(state, 'veh', 'irontread-crusher', 'p1', 'battlefield', { summoningSickness: true });
  putCard(state, 'crew1', 'tenth-district-veteran', 'p1', 'battlefield', { summoningSickness: false });
  // crew 3: veteran 2/2 — sam nie wystarczy; dodaj drugiego
  putCard(state, 'crew2', 'tenth-district-veteran', 'p1', 'battlefield', { summoningSickness: false });
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'veh', abilityIndex: 0, crewIds: ['crew1', 'crew2'] });
  console.log('H3 crew:', r.ok, r.events?.[0]?.reason ?? JSON.stringify(r.events?.map((e) => e.type)));
  const atk = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['veh'] });
  console.log('H3 attack with sick crewed vehicle:', atk.ok, atk.events?.[0]?.reason ?? '');
}

// H4 (S7): Echo — wybór zapłać vs poświęć?
{
  const state = game();
  mainPhase(state, 'p1');
  putCard(state, 'shred', 'bone-shredder', 'p1', 'battlefield');
  // Symuluj upkeep następnej tury: echo trigger powinien zapytać.
  state.turn = jumpToStep(state.turn, 'upkeep', 'p1');
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 5);
  console.log('H4 pendingEcho/pendingPay:', JSON.stringify(state.pendingEcho ?? null), JSON.stringify(state.pendingPayOrSacrifice ?? state.pendingOptionalPay ?? null));
  const r1 = execute(state, { type: 'pass_priority', playerId: 'p1' });
  console.log('H4 pass1:', r1.ok, r1.events?.map((e) => e.type).join(',') ?? r1.events?.[0]?.reason);
  console.log('H4 shred zone:', state.objects.get('shred')?.zone, '| pending now:', JSON.stringify(state.pendingEcho ?? null));
}
