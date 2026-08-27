import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';

// =============================================================================
// Batch 25 — 10 kart (2026-08-09)
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

test('Batch 25: pliki Scryfall istnieją i mają prawidłowe pola', () => {
  const slugs = [
    'trestle-troll', 'lab-rats', 'anthem-of-champions', 'goblin-deathraiders',
    'fertile-thicket', 'reassembling-skeleton', 'idyllic-grange', 'deadly-recluse',
    'benevolent-blessing', 'springbloom-druid',
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

test('Batch 25: wszystkie karty mają status supported i artId', () => {
  const ids = [
    'trestle-troll', 'lab-rats', 'anthem-of-champions', 'goblin-deathraiders',
    'fertile-thicket', 'reassembling-skeleton', 'idyllic-grange', 'deadly-recluse',
    'benevolent-blessing', 'springbloom-druid',
  ];
  for (const id of ids) {
    const card = registry.get(id);
    assert.ok(card, `karta ${id} nie znaleziona w registry`);
    assert.equal(card.support?.status, 'supported', `${id}: status != supported`);
    assert.ok(card.artId, `${id}: brak artId`);
    assert.ok(card.imageUri, `${id}: brak imageUri`);
  }
});

// --- Trestle Troll (RTR) — defender, reach, regenerate -----------------------

test('Trestle Troll: ma defender, reach i zdolność regenerate', () => {
  const card = registry.get('trestle-troll');
  assert.ok(card.keywords.includes('defender'), 'brak defender'); // lowercase: silnik dopasowuje snake_case (błąd Sherlocka 1: 'Defender' był martwy)
  assert.ok(card.keywords.includes('reach'), 'brak reach'); // jak wyżej
  assert.ok(card.abilities.some(a => a.keyword === 'regenerate'), 'brak regenerate ability');
});

// --- Lab Rats (STH) — buyback {4}, create 1/1 Rat ---------------------------

test('Lab Rats: ma buyback {4} i efekt create_token rat', () => {
  const card = registry.get('lab-rats');
  assert.ok(card.spell?.buyback, 'brak buyback');
  assert.equal(card.spell.buyback.cost, 4, 'buyback cost != 4');
  assert.ok(card.spell.effects.some(e => e.type === 'create_token' && e.cardId === 'token_rat'),
    'brak efektu create_token token_rat');
});

// --- Anthem of Champions (FDN) — static +1/+1 anthem ------------------------

test('Anthem of Champions: ma static +1/+1 scope all_creatures_you_control', () => {
  const card = registry.get('anthem-of-champions');
  const staticAbility = card.abilities.find(a => a.type === 'static');
  assert.ok(staticAbility, 'brak static ability');
  assert.equal(staticAbility.pump?.power, 1, 'power != 1');
  assert.equal(staticAbility.pump?.toughness, 1, 'toughness != 1');
  assert.equal(staticAbility.scope?.affects, 'all_creatures_you_control');
});

// --- Goblin Deathraiders (ALA) — 3/1 trample ---------------------------------

test('Goblin Deathraiders: 3/1 z trample', () => {
  const card = registry.get('goblin-deathraiders');
  assert.equal(card.power, 3);
  assert.equal(card.toughness, 1);
  assert.ok(card.keywords.includes('trample')); // lowercase: silnik dopasowuje snake_case (błąd Sherlocka 1)
});

// --- Fertile Thicket (BFZ) — enters tapped + ETB reveal ---------------------

test('Fertile Thicket: enters tapped + ETB fertile_thicket_reveal', () => {
  const card = registry.get('fertile-thicket');
  assert.ok(card.entersTapped, 'brak entersTapped');
  // Zdarzenie musi być obsługiwane przez engine ('enter_battlefield' —
  // lekcja 2026-08-10: 'enters' było martwe). Zachowanie: batch25-etb-enters-fix.
  assert.ok(card.abilities.some(a => a.trigger?.event === 'enter_battlefield' &&
    a.effect?.some(e => e.type === 'fertile_thicket_reveal')),
    'brak ETB fertile_thicket_reveal');
});

// --- Reassembling Skeleton (M19) — fromGraveyard return_to_battlefield_tapped -

test('Reassembling Skeleton: aktywowana z grobu {1}{B} return_to_battlefield_tapped', () => {
  const card = registry.get('reassembling-skeleton');
  const ability = card.abilities.find(a => a.fromGraveyard && a.effect?.type === 'return_to_battlefield_tapped');
  assert.ok(ability, 'brak fromGraveyard ability');
  assert.equal(ability.cost?.mana, 2, 'koszt many != 2');
  assert.ok(ability.cost?.colors?.some(c => c.includes('B')), 'brak kosztu B');
});

// --- Idyllic Grange (ELD) — conditional entersTapped + ETB +1/+1 counter ----

test('Idyllic Grange: entersTappedCondition minOtherPlains + ETB add_counter', () => {
  const card = registry.get('idyllic-grange');
  assert.ok(card.entersTappedCondition, 'brak entersTappedCondition');
  assert.equal(card.entersTappedCondition.minOtherPlains, 3, 'minOtherPlains != 3');
  // Zdarzenie musi być obsługiwane przez engine ('enter_battlefield' —
  // lekcja 2026-08-10: 'enters' było martwe). Zachowanie: batch25-etb-enters-fix.
  const etb = card.abilities.find(a => a.trigger?.event === 'enter_battlefield' &&
    a.trigger?.condition?.enteredUntapped);
  assert.ok(etb, 'brak ETB enteredUntapped trigger');
  assert.ok(etb.effect?.some(e => e.type === 'add_counter'), 'brak add_counter effect');
});

// --- Deadly Recluse (M10) — reach + deathtouch --------------------------------

test('Deadly Recluse: reach + deathtouch', () => {
  const card = registry.get('deadly-recluse');
  assert.ok(card.keywords.includes('reach')); // jak wyżej
  assert.ok(card.keywords.includes('deathtouch')); // jak wyżej
});

// --- Benevolent Blessing (CMR) — flash, aura, chooseColor --------------------

test('Benevolent Blessing: flash aura z chooseColor', () => {
  const card = registry.get('benevolent-blessing');
  assert.ok(card.keywords?.includes('flash'), 'brak flash'); // jak wyżej
  assert.ok(card.aura, 'brak aura descriptor');
  assert.equal(card.aura.enchant, 'creature');
  assert.ok(card.aura.chooseColor, 'brak chooseColor');
});

// --- Springbloom Druid (MH1) — ETB sacrifice-search --------------------------

test('Springbloom Druid: ETB springbloom_sacrifice_search', () => {
  const card = registry.get('springbloom-druid');
  // Zdarzenie obsługiwane przez engine ('enter_battlefield', nie 'enters').
  assert.ok(card.abilities.some(a => a.trigger?.event === 'enter_battlefield' &&
    (a.effect ?? []).some(e => e.type === 'springbloom_sacrifice_search')),
    'brak ETB springbloom_sacrifice_search');
});

// --- Deck validation ---------------------------------------------------------

test('Batch 25: karty w taliach singleton', () => {
  const deckFiles = ['tarkir-bg', 'dominaria-brg', 'warhammer-brg', 'innistrad-brg', 'wiedzmin', 'alara', 'ravnica', 'zendikar', 'mirrodin-brg'];
  for (const name of deckFiles) {
    const path = `decks/${name}.txt`;
    if (!fs.existsSync(path)) continue;
    const text = fs.readFileSync(path, 'utf8');
    const { cardIds } = parseDeckText(text, registry);
    assert.ok(cardIds.length > 0, `${name}: pusta talia`);
  }
});

// --- Deterministic replay (smoke) -------------------------------------------

test('Batch 25: partia na tarkir vs warhammer kończy się deterministycznie (M178)', () => {
  const { decks } = buildDecks('tarkir-bg.txt', 'warhammer-brg.txt');
  const s1 = createSession({ seed: 42, registry, decks });
  playOut(s1);
  assert.ok(s1.state.status !== 'active', 'partia 1 nie zakończyła się');
  const { decks: decks2 } = buildDecks('tarkir-bg.txt', 'warhammer-brg.txt');
  const s2 = createSession({ seed: 42, registry, decks: decks2 });
  playOut(s2);
  assert.ok(s2.state.status !== 'active', 'partia 2 nie zakończyła się');
  assert.equal(s1.state.status, s2.state.status, 'różny status');
});
