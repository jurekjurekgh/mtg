// A4-3 (handoff 2026-09-08k, kolejność ryzyka #3): drugi atakujący przy PW
// (protection/planeswalker — rozdział atakujących).
//
// Kontekst: audyt PR #106 §3 notował: „drugi atakujący PW (brak kart PW —
// tylko składnia player_or_planeswalker otestowana)". Sonda 2026-09-09:
//
// WYNIK: silnik WOLNIE nie wspiera atakowania planeswalkerów — model walki
// jest TYLKO na gracza-obroncę: state.combat nie trzyma celu PER ATAKUJĄCEGO
// (brak 508.1b w tym silniku: „announces which player, planeswalker, or
// battle each of the chosen creatures is attacking"), resolveCombatDamage
// bierze JEDEN defendingPlayerId, a obrażenia nieblokujących idą do GRACZA.
// Maszyna obrażeń PW ISTNIEJE i działa poza walką (CR 120.3c —
// removeLoyaltyForDamage; CR 306.9 — zero loyalty to SBA-put; zweryfikowane
// w audycie PR #106 §1 na pobranych CR). Katalog NIE MA kart PW (ADR 0029
// — brak nowych kart), więc ścieżka nie jest osiągalna w żadnej grze.
//
// Zamknięcie UZASADNIONE (nie jest bugiem): implementacja celu PW w walce
// to dodanie architektoniczne (cel per atakujący + rozdział obrażeń 510.1c
// per cel + ogłoszenia) — decyzja właściciela, nie petla jakości. Testy
// poniżej PINUJĄ obecny model (atakujący biją gracza, nie PW na stole) i
// SYGNALIZUJĄ (strażnik katalogu, wzorzec M161/S9): pierwsza karta PW w
// katalogu CZERWIEŃI ten test — wtedy decyzja o celu PW w walce staje się
// wymuszona.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry, REAL_CARDS } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { addCounter } from '../src/engine/counters.js';

const registry = createCardRegistry();

function put(s, id, cardId, owner = 'p1', zone = 'battlefield') {
  const d = registry.get(cardId);
  assert.ok(d, cardId);
  addObject(s, { ...gameObjectDataOf(d), types: d.types, keywords: d.keywords, subtypes: d.subtypes ?? [], id,
    instanceId: `i-${id}`, cardId, ownerId: owner, controllerId: owner, zone });
  return s.objects.get(id);
}

/** Syntetyczny planeswalker (katalogu nie ma — sonda mechaniki, nie karty). */
function putPlaneswalker(s, id, ownerId = 'p2', loyalty = 7) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: 'synthetic-pw', ownerId, controllerId: ownerId, zone: 'battlefield',
    kind: 'planeswalker', types: ['Planeswalker'], subtypes: ['Synthetic'],
    power: 0, toughness: 0, manaCost: 0,
  });
  addCounter(s, id, 'loyalty', loyalty);
  return s.objects.get(id);
}

/** Pełna runda passów NIEZALEŻNIE od stosu (okna priorytetu D i M172/C
 * wymagają passów także przy pustym stosie). Stoi, gdy krok się zmieni. */
function passRound(s, maxPasses = 10) {
  const before = `${s.turn.step}|${s.turn.number}`;
  for (let i = 0; i < maxPasses && `${s.turn.step}|${s.turn.number}` === before; i++) {
    const v = playerView(s, s.turn.priorityPlayerId);
    const p = v.legalCommands.find((c) => c.type === 'pass_priority');
    if (!p) return; // np. M255/F: pass domykający rundę w combat_damage — zamknięcie okna
    assert.ok(execute(s, p).ok);
  }
}

function resolveWindow(s, limit = 30) {
  for (let i = 0; i < limit && s.zones.stack.length; i++) {
    const v = playerView(s, s.turn.priorityPlayerId);
    const c = v.legalCommands.find((c) => c.type === 'pass_priority');
    if (c) {
      assert.ok(execute(s, c).ok);
      continue;
    }
    // Decyzja w środku resolva (np. search Exploding Borders) — weźpierwszą
    // ofertę (test nie zależny od wyboru: asserty o lojalności/życiu).
    const d = v.legalCommands.find((c) => c.type === 'resolve_search_choice');
    assert.ok(d, `okno zablokowane bez decyzji i passu (${s.turn.step})`);
    assert.ok(execute(s, d).ok);
  }
}

test('A4-3/1: model walki — atakujący biją GRACZA-obroncę, PW na stole nietknięty', () => {
  const s = createGameState({ seed: 443, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p1');
  put(s, 'atk1', 'scorpion-sentinel');
  put(s, 'atk2', 'tenth-district-veteran');
  const pw = putPlaneswalker(s, 'pw1', 'p2', 7);

  // Dwa atakujący w jednym combacie — legalna deklaracja (CR 508.1).
  const declare = playerView(s, 'p1').legalCommands.find((c) => c.type === 'declare_attackers');
  assert.ok(declare, 'oferta deklaracji');
  assert.ok(execute(s, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk1', 'atk2'] }).ok);

  // Okno po deklaracji (CR 508.2): aktywny → obrońca → bloki.
  passRound(s);
  assert.equal(s.turn.step, 'declare_blockers');
  assert.equal(s.turn.priorityPlayerId, 'p2');
  // p2 bez kreatur — pusta deklaracja bloków (jedyna opcja).
  const blockers = playerView(s, 'p2').legalCommands.find((c) => c.type === 'declare_blockers');
  assert.ok(blockers, 'oferta pustej deklaracji bloków');
  assert.ok(execute(s, { type: 'declare_blockers', playerId: 'p2', assignments: {} }).ok);
  // Okno po blokach (M172/C: najpierw obrońca) + pełna runda passów w
  // combat_damage (M255/F) — priorytet wraca do aktywnego z zamkniętym
  // licznikiem: jedyna komenda to resolve_combat.
  passRound(s);
  assert.equal(s.turn.step, 'combat_damage');
  assert.equal(s.turn.priorityPlayerId, 'p1');
  const passP1 = playerView(s, 'p1').legalCommands.find((c) => c.type === 'pass_priority');
  assert.equal(passP1, undefined, 'pass aktywnego w combat_damage domyka rundę — odrzucany (M255/F)');
  const resolve = playerView(s, 'p1').legalCommands.find((c) => c.type === 'resolve_combat');
  assert.ok(resolve, 'oferta resolve_combat');
  const r = execute(s, resolve);
  assert.ok(r.ok, JSON.stringify(r));

  const lifeP2 = s.players.find((p) => p.id === 'p2').life;
  assert.equal(lifeP2, 20 - 3, 'oba atakujący zadali obrażenia GRACZU (1+2=3)');
  assert.equal(s.objects.get('pw1')?.counters?.loyalty ?? pw.counters?.loyalty, 7,
    'PW na stole NIE jest celem ataku (model: cel = gracz-obronca)');
});

test('A4-3/2: kontrola — ścieżka CZARU obraża PW (removeLoyaltyForDamage, CR 120.3c)', () => {
  const s = createGameState({ seed: 444, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  put(s, 'land1', 'basic-forest');
  put(s, 'land2', 'basic-island');
  put(s, 'lib0', 'basic-forest', 'p1', 'library');
  const pw = putPlaneswalker(s, 'pw1', 'p2', 7);
  put(s, 'eb', 'exploding-borders', 'p1', 'hand');
  addMana(s, 'p1', 2, { colors: ['G'] });
  addMana(s, 'p1', 2, { colors: ['R'] });

  const cast = playerView(s, 'p1').legalCommands.find(
    (c) => c.type === 'cast_spell' && c.objectId === 'eb' && c.targets?.[0] === 'pw1');
  assert.ok(cast, 'Exploding Borders może celować w PW (player_or_planeswalker)');
  assert.ok(execute(s, { ...cast, targets: ['pw1'] }).ok);
  resolveWindow(s);

  assert.equal(s.objects.get('pw1')?.counters?.loyalty, 5, 'obrażenia X=2 ściągnęły 2 lojalności (120.3c)');
  assert.equal(s.players.find((p) => p.id === 'p2').life, 20, 'gracz nietknięty');
});

test('A4-3/3: strażnik katalogu — pierwsza karta PW sygnalizuje decyzję o celu w walce', () => {
  // Wzorzec M161/S9: ścieżka walki przeciw PW jest NIEZAIMPLEMENTOWANA
  // (cel per atakujący, 508.1b/510.1c). Dopóki katalogu nie ma PW,
  // ograniczenie jest nieosiągalne w grze — test zielony. Pierwsza karta
  // PW (ADR 0029: tylko decyzja właściciela) CZERWIEŃI test: wtedy albo
  // implementujemy cel PW w walce, albo card nie atakuje/nie jest celem.
  const pwCards = REAL_CARDS.filter((c) => (c.types ?? []).includes('Planeswalker'));
  assert.equal(pwCards.length, 0,
    `katalog dostał PW (${pwCards.map((c) => c.id).join(', ')}) — decyzja właściciela: cel PW w walce (508.1b/510.1c) albo wsparcie limitowane`);
});
