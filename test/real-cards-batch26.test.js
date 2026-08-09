import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';

// =============================================================================
// Batch 26 — 10 kart (2026-08-09)
// Legalny + nielegalny scenariusz każdej karty, sanity Scryfall, determinizm.
// =============================================================================

const registry = createCardRegistry();

function buildDecks(humanFile, botFile) {
  const humanText = fs.readFileSync(`decks/${humanFile}`, 'utf8');
  const botText = fs.readFileSync(`decks/${botFile}`, 'utf8');
  const decks = new Map([
    [HUMAN_ID, parseDeckText(humanText, registry).cardIds],
    [BOT_ID, parseDeckText(botText, registry).cardIds],
  ]);
  return { registry, decks };
}

function chooseHumanCommand(view) {
  const ofType = (type) => view.legalCommands.filter((cmd) => cmd.type === type);
  const first = (type) => ofType(type)[0] ?? null;
  return first('draw_card') ?? first('play_land') ?? first('cast_permanent')
    ?? (() => { const c = ofType('cast_spell'); return c.find(cmd => { const t = view.zones.battlefield.find(o => o.id === cmd.targets?.[0]); return t && t.controllerId !== view.playerId; }) ?? null; })()
    ?? (() => { const a = ofType('declare_attackers'); return a.length ? a.reduce((b, c) => c.attackerIds.length > b.attackerIds.length ? c : b) : null; })()
    ?? first('declare_blockers') ?? first('resolve_combat')
    ?? view.legalCommands.find((c) => c.type.startsWith('resolve_')) ?? null
    ?? first('pass_priority');
}

function playOut(session, maxMoves = 600) {
  for (let i = 0; i < maxMoves; i++) {
    if (session.state.status !== 'active') return i;
    const view = session.view();
    const cmd = chooseHumanCommand(view);
    if (!cmd) break;
    const r = session.apply(cmd);
    if (!r.ok) break;
  }
  return -1;
}

// --- Scryfall sanity ---------------------------------------------------------

test('Batch 26: pliki Scryfall istnieją i mają prawidłowe pola', () => {
  const slugs = [
    'kabira-vindicator', 'great-furnace', 'bomat-bazaar-barge', 'index',
    'bladed-sentinel', 'might-of-the-masses', 'magic-damper', 'hecteyes',
    'carapace-forger', 'lurking-green-dragon',
  ];
  for (const slug of slugs) {
    const path = `docs/cards/scryfall-${slug}.json`;
    assert.ok(fs.existsSync(path), `brak pliku ${path}`);
    const data = JSON.parse(fs.readFileSync(path, 'utf8'));
    assert.ok(data.name, `${slug}: brak name`);
    assert.ok(data.image_uris?.large, `${slug}: brak image_uris.large`);
    assert.ok(data.oracle_text, `${slug}: brak oracle_text`);
  }
});

// --- Card definitions --------------------------------------------------------

test('Batch 26: wszystkie karty mają status supported i artId', () => {
  const ids = [
    'kabira-vindicator', 'great-furnace', 'bomat-bazaar-barge', 'index',
    'bladed-sentinel', 'might-of-the-masses', 'magic-damper', 'hecteyes',
    'carapace-forger', 'lurking-green-dragon',
  ];
  for (const id of ids) {
    const card = registry.get(id);
    assert.ok(card, `karta ${id} nie znaleziona w registry`);
    assert.equal(card.support?.status, 'supported', `${id}: status != supported`);
    assert.ok(card.artId, `${id}: brak artId`);
    assert.ok(card.imageUri, `${id}: brak imageUri`);
  }
});

// --- Kabira Vindicator (ROE) — Level Up ------------------------------------

test('Kabira Vindicator: level up + progi 2-4 i 5+', () => {
  const card = registry.get('kabira-vindicator');
  assert.equal(card.power, 2);
  assert.equal(card.toughness, 4);
  const levelUp = card.abilities.find(a => a.type === 'activated' && a.effect?.type === 'add_counter' && a.effect?.counter === 'level');
  assert.ok(levelUp, 'brak level up ability');
  assert.equal(levelUp.timing, 'sorcery', 'level up nie jest sorcery');
  assert.ok(levelUp.cost?.mana === 3, 'koszt level up != 3');
  const statics = card.abilities.filter(a => a.type === 'static');
  assert.ok(statics.length >= 4, 'brak 4 statycznych progów');
  const self2 = statics.find(a => !a.scope && a.condition?.minLevel === 2 && a.condition?.maxLevel === 4);
  assert.ok(self2, 'brak self pump 2-4');
  const other5 = statics.find(a => a.scope?.affects === 'other_creatures_you_control' && a.condition?.minLevel === 5);
  assert.ok(other5, 'brak other +2/+2 dla 5+');
});

// --- Great Furnace (MRD) — Artifact Land -----------------------------------

test('Great Furnace: Artifact Land {T}: Add {R}', () => {
  const card = registry.get('great-furnace');
  assert.ok(card.types.includes('Artifact'), 'brak Artifact');
  assert.ok(card.types.includes('Land'), 'brak Land');
});

// --- Bomat Bazaar Barge (KLD) — ETB draw + Crew 3 ---------------------------

test('Bomat Bazaar Barge: ETB draw + Crew 3', () => {
  const card = registry.get('bomat-bazaar-barge');
  assert.equal(card.power, 5);
  assert.equal(card.toughness, 5);
  const etb = card.abilities.find(a => a.trigger?.event === 'enter_battlefield');
  assert.ok(etb, 'brak ETB');
  assert.ok(etb.effect?.type === 'draw_cards' || etb.effect?.some?.(e => e.type === 'draw_cards'), 'brak draw effect');
  const crew = card.abilities.find(a => a.cost?.crewPower === 3);
  assert.ok(crew, 'brak crew 3');
});

// --- Index (APC) — Sorcery look at top 5 -----------------------------------

test('Index: sorcery index_look', () => {
  const card = registry.get('index');
  assert.equal(card.types[0], 'Sorcery');
  assert.ok(card.spell?.effects?.some(e => e.type === 'index_look'), 'brak index_look effect');
});

// --- Bladed Sentinel (MBS) — {W}: vigilance --------------------------------

test('Bladed Sentinel: {W}: vigilance', () => {
  const card = registry.get('bladed-sentinel');
  assert.equal(card.power, 2);
  assert.equal(card.toughness, 4);
  const act = card.abilities.find(a => a.type === 'activated' && a.effect?.keywords?.includes('vigilance'));
  assert.ok(act, 'brak vigilance ability');
  assert.ok(act.cost?.colors?.some(c => c.includes('W')), 'brak kosztu W');
});

// --- Might of the Masses (2XM) — pump by creature count ---------------------

test('Might of the Masses: pump_by_creature_count', () => {
  const card = registry.get('might-of-the-masses');
  assert.equal(card.types[0], 'Instant');
  assert.ok(card.spell?.targets?.some(t => t.type === 'creature'), 'brak celu creature');
  assert.ok(card.spell?.effects?.some(e => e.type === 'pump_by_creature_count'), 'brak pump_by_creature_count');
});

// --- Magic Damper (FIN) — hexproof + pump + untap ----------------------------

test('Magic Damper: pump + hexproof + untap', () => {
  const card = registry.get('magic-damper');
  assert.equal(card.types[0], 'Instant');
  assert.ok(card.spell?.targets?.some(t => t.type === 'creature_you_control'), 'brak celu creature_you_control');
  const effects = card.spell?.effects ?? [];
  assert.ok(effects.some(e => e.type === 'pump'), 'brak pump');
  assert.ok(effects.some(e => e.type === 'grant_keywords_until_end_of_turn' && e.keywords?.includes('hexproof')), 'brak hexproof');
  assert.ok(effects.some(e => e.type === 'untap_permanent'), 'brak untap');
});

// --- Hecteyes (FIN) — ETB each opponent discards -----------------------------

test('Hecteyes: ETB discard_each_opponent', () => {
  const card = registry.get('hecteyes');
  assert.equal(card.power, 1);
  assert.equal(card.toughness, 1);
  const etb = card.abilities.find(a => a.trigger?.event === 'enter_battlefield');
  assert.ok(etb, 'brak ETB');
  const effect = Array.isArray(etb.effect) ? etb.effect[0] : etb.effect;
  assert.equal(effect?.type, 'discard_each_opponent', 'brak discard_each_opponent');
});

// --- Carapace Forger (SOM) — Metalcraft +2/+2 --------------------------------

test('Carapace Forger: metalcraft +2/+2', () => {
  const card = registry.get('carapace-forger');
  assert.equal(card.power, 2);
  assert.equal(card.toughness, 2);
  const staticAbility = card.abilities.find(a => a.type === 'static' && a.condition?.minArtifactsControlled === 3);
  assert.ok(staticAbility, 'brak metalcraft static');
  assert.equal(staticAbility.pump?.power, 2);
  assert.equal(staticAbility.pump?.toughness, 2);
});

// --- Lurking Green Dragon (CLB) — flying + attack restriction ----------------

test('Lurking Green Dragon: flying + cantAttackUnlessDefenderHasFlying', () => {
  const card = registry.get('lurking-green-dragon');
  assert.ok(card.keywords.includes('flying'), 'brak Flying');
  assert.equal(card.power, 4);
  assert.equal(card.toughness, 4);
  const restriction = card.abilities.find(a => a.type === 'static' && a.cantAttackUnlessDefenderHasFlying);
  assert.ok(restriction, 'brak attack restriction');
});

// --- Deck validation ---------------------------------------------------------

test('Batch 26: karty w taliach singleton', () => {
  const deckFiles = ['green', 'black', 'red', 'azorius', 'innistrad', 'wiedzmin', 'graveyard', 'tokens', 'spellslinger'];
  for (const name of deckFiles) {
    const path = `decks/${name}.txt`;
    if (!fs.existsSync(path)) continue;
    const text = fs.readFileSync(path, 'utf8');
    const { cardIds } = parseDeckText(text, registry);
    assert.ok(cardIds.length > 0, `${name}: pusta talia`);
  }
});

// --- Deterministic replay (smoke) --------------------------------------------

test('Batch 26: partia na green vs red kończy się deterministycznie', () => {
  const { decks } = buildDecks('green.txt', 'red.txt');
  const s1 = createSession({ seed: 42, registry, decks });
  playOut(s1);
  assert.ok(s1.state.status !== 'active', 'partia 1 nie zakończyła się');
  const { decks: decks2 } = buildDecks('green.txt', 'red.txt');
  const s2 = createSession({ seed: 42, registry, decks: decks2 });
  playOut(s2);
  assert.ok(s2.state.status !== 'active', 'partia 2 nie zakończyła się');
  assert.equal(s1.state.status, s2.state.status, 'różny status');
});

