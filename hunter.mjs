import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '/home/user/mtg/src/table/session.js';
import { createCardRegistry } from '/home/user/mtg/src/cards/card-data.js';
import { parseDeckText } from '/home/user/mtg/src/cards/deck-text.js';
const registry = createCardRegistry();
function buildDecks(humanFile = 'green.txt', botFile = 'red.txt') {
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync(`/home/user/mtg/decks/${humanFile}`, 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync(`/home/user/mtg/decks/${botFile}`, 'utf8'), registry).cardIds],
  ]);
  return { registry, decks };
}
function logEventTexts(session) { return session.log.filter((e) => e.kind === 'event').map((e) => e.text); }
// --- abilities policy (session-abilities-integration) ---
function chooseSimple(view) {
  const ofType = (t) => view.legalCommands.filter((c) => c.type === t);
  const first = (t) => ofType(t)[0] ?? null;
  return first('draw_card') ?? first('play_land') ?? first('tap_for_mana')
    ?? first('cast_permanent') ?? ofType('activate_ability')[0] ?? first('cast_spell')
    ?? first('declare_attackers') ?? first('declare_blockers') ?? first('resolve_combat')
    ?? view.legalCommands.find((c) => c.type.startsWith('resolve_')) ?? null ?? first('pass_priority');
}
function playSimple(session) {
  for (let i = 0; i < 600; i++) {
    if (session.state.status !== 'active') return true;
    if (session.view().turn.priorityPlayerId !== HUMAN_ID) return false;
    const cmd = chooseSimple(session.view());
    if (!cmd) return false;
    if (!session.apply(cmd).ok) return false;
  }
  return false;
}
// --- table-session policy ---
function chooseTable(view) {
  const ofType = (t) => view.legalCommands.filter((c) => c.type === t);
  const first = (t) => ofType(t)[0] ?? null;
  return first('draw_card') ?? first('play_land') ?? first('tap_for_mana')
    ?? first('cast_permanent')
    ?? (() => { const casts = ofType('cast_spell');
      const hostile = casts.find((cmd) => { const t = view.zones.battlefield.find((o) => o.id === cmd.targets?.[0]); return t && t.controllerId !== view.playerId; });
      return hostile ?? null; })()
    ?? (() => { const at = ofType('declare_attackers'); if (!at.length) return null; return at.reduce((b, c) => (c.attackerIds.length > b.attackerIds.length ? c : b)); })()
    ?? first('declare_blockers') ?? first('resolve_combat')
    ?? view.legalCommands.find((c) => c.type.startsWith('resolve_')) ?? null ?? first('pass_priority');
}
function playTable(session) {
  for (let i = 0; i < 600; i++) {
    if (session.state.status !== 'active') return true;
    const v = session.view();
    if (v.turn.priorityPlayerId !== HUMAN_ID) return false;
    const cmd = chooseTable(v);
    if (!cmd) return false;
    if (!session.apply(cmd).ok) return false;
  }
  return false;
}
const results = {};
function hunt(name, fn, max) { for (let s = 1; s <= max; s++) { if (fn(s)) { results[name] = s; console.log(`${name}: FOUND ${s}`); return; } } console.log(`${name}: NOT FOUND`); }
// abilities (green vs red)
hunt('abilities', (s) => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: s, registry, decks });
  if (!playSimple(session)) return false;
  const ev = session.state.events;
  if (!ev.some((e) => e.type === 'ability_activated')) return false;
  if (!ev.some((e) => e.type === 'token_created')) return false;
  const texts = logEventTexts(session);
  if (!texts.some((t) => t.includes('aktywuje zdolność'))) return false;
  if (!texts.some((t) => /tworzy(sz)? token/.test(t))) return false;
  return true;
});
// endure (green vs black)
hunt('endure', (s) => {
  const { registry, decks } = buildDecks('green.txt', 'black.txt');
  const session = createSession({ seed: s, registry, decks });
  if (!playTable(session)) return false;
  const texts = logEventTexts(session);
  if (!texts.some((t) => /^Endure \(Kin-Tree Nurturer\): Nieprzyjaciel wybiera — 1× licznik \+1\/\+1 albo token Spirit 1\/1$/.test(t))) return false;
  return texts.some((t) => /^Endure \(Kin-Tree Nurturer\): Nieprzyjaciel wybiera (token Spirit 1\/1|1× licznik \+1\/\+1 na źródle)$/.test(t));
}, 400);
// delirium (green vs red)
hunt('delirium', (s) => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: s, registry, decks });
  if (!playTable(session)) return false;
  const texts = logEventTexts(session);
  return texts.some((t) => /^Delirium \(Fear of Burning Alive\):.+otrzymuje 4 obrażenia$/.test(t));
}, 800);
console.log(JSON.stringify(results, null, 2));
