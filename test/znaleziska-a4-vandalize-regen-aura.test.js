// A4-2 (handoff 2026-09-08k, kolejność ryzyka #2): Vandalize vs aura-regen
// (obrona przed zniszczeniem).
//
// Kontekst: PR #106 przepisał Vandalize „Zniszcz oba" na WSPÓLNY helper
// destroyPermanents z `targetIndices` (jednoczesność — warunek ochrony
// umbra w grupie), ale ścieżka ZNISZCZENIA Z ODROBIONĄ OBRONĄ (regeneracja
// + aura na hosta) przez ten nowy API nigdy nie została otestowana:
//  1. tryb pojedynczy: artefakt-stwór z tarczą regen + aura na nim —
//     regen zastępuje destroy, stwór ZOSTAJE na polu, aura NADAL dołączona,
//     stwór tapnięty (CR 614.8/701.19a), tarcza zużyta (jednorazowość 614.5/614.6);
//  2. tryb „Zniszcz oba" (targetIndices): cel chroniony (regen+aura) + land
//     — jedno rozstrzygnięcie, ochrona jednego celu NIE gniecie drugiego;
//  3. tryb „Zniszcz oba" z WYBOREM (regen + umbra na hostach): pełne okno
//     replacement_choice w środku sekwencji dwucelowej — obie ścieżki
//     wyboru (regenerate / umbra) kończą spójnie z landem.
//
// Źródły (pobrane 2026-09-09, CR 2026-08-07):
//  - CR 614.8/701.19 (regeneration — pobrane 2026-09-09, CR 2026-08-07; starsze komentarze repo cytują 701.12/701.15),
//  - CR 702.89a (umbra armor — mtg.wiki/page/Umbra_armor, AUDYT_PR106 §1).

// WYNIK SONDY (2026-09-09): ŚCIEŻKI POPRAWNE — regen przez targetIndices
// ratuje stwora (tapnięty, obrażenia 0, tarcza zużyta), aura NADAL dołączona
// (regen nie zmienia strefy), drugi cel (land) ginie w tym samym
// rozstrzygnięciu, okno wyboru (regen+umbra) otwiera się i domyka spójnie
// w sekwencji dwucelowej. Zamknięcie uzasadnione: piny powyżej strzegą
// wspólnego helpera destroyPermanents przed przyszłymi regresjami.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { replaceObject } from '../src/engine/permanents.js';
import { addRegenerationShield } from '../src/engine/state-based.js';

const registry = createCardRegistry();

function put(s, id, cardId, owner = 'p1', zone = 'battlefield') {
  const d = registry.get(cardId);
  assert.ok(d, cardId);
  addObject(s, { ...gameObjectDataOf(d), types: d.types, keywords: d.keywords, id,
    instanceId: `i-${id}`, cardId, ownerId: owner, controllerId: owner, zone });
  return s.objects.get(id);
}

function game() {
  const s = createGameState({ seed: 442, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.priorityPlayerId = s.turn.activePlayerId = 'p1';
  return s;
}

/** Vandalize w ręce p1 + mana; zwraca komendę rzutu dla wskazanego trybu. */
function castVandalize(s, modeIndex, targets) {
  put(s, 'vandalize', 'vandalize', 'p1', 'hand');
  addMana(s, 'p1', 5, { colors: ['R'] });
  const cmd = playerView(s, 'p1').legalCommands.find(
    (c) => c.type === 'cast_spell' && c.objectId === 'vandalize' && c.modeIndex === modeIndex);
  assert.ok(cmd, `oferta trybu ${modeIndex}`);
  const cast = { ...cmd, targets: [...targets] };
  assert.ok(execute(s, cast).ok, 'rzut Vandalize');
  return s;
}

function resolveStack(s) {
  for (let i = 0; i < 30 && s.zones.stack.length && !s.pendingReplacementChoice; i++) {
    const v = playerView(s, s.turn.priorityPlayerId);
    const c = v.legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(c, 'oferta pass');
    assert.ok(execute(s, c).ok);
  }
}

function pick(s, choice) {
  const p = s.pendingReplacementChoice;
  assert.ok(p, 'pendingReplacementChoice otwarte');
  const cmd = playerView(s, p.playerId).legalCommands.find(
    (c) => c.type === 'resolve_replacement_choice' && c.choice === choice);
  assert.ok(cmd, `oferta ${choice}`);
  const r = execute(s, cmd);
  assert.ok(r.ok, JSON.stringify(r));
  return r;
}


/** Po zmianie strefy id obiektu się zmienia (grave-N) — szukaj po cardId. */
const byCard = (s, cardId) => [...s.objects.values()].filter((o) => o.cardId === cardId);

// Host: Scorpion Sentinel (artefakt-stwór 1/4, FIN) + aura Hobble (−2/−2).
function hostWithAura(s) {
  put(s, 'art1', 'scorpion-sentinel');
  const a = put(s, 'aura1', 'hobble');
  replaceObject(s, a, { kind: 'aura', attachedTo: 'art1' });
  return s;
}

test('A4-2/1: tryb „Zniszcz artefakt” — regen ratuje stwora, aura zostaje dołączona', () => {
  const s = game();
  hostWithAura(s);
  addRegenerationShield(s, 'art1');
  castVandalize(s, 0, ['art1']);
  resolveStack(s);

  const host = s.objects.get('art1');
  assert.equal(host.zone, 'battlefield', 'regen zastąpił destroy (614.8/701.19a)');
  assert.equal(host.damage, 0);
  assert.equal(host.tapped, true, 'regen tapuje (701.19a)');
  assert.equal(s.objects.get('aura1')?.zone, 'battlefield', 'aura NIE odłączona (stwór nie zmienił strefy)');
  assert.equal(s.objects.get('aura1')?.attachedTo, 'art1', 'aura nadal na hoście');
  assert.ok(!(s.regenerationShields ?? []).includes('art1'), 'tarcza zużyta (701.19a+614.5)');
  assert.equal(s.pendingReplacementChoice, null, 'bez okna wyboru (jedyna opcja)');
});

test('A4-2/2: tryb „Zniszcz oba” — regen na artefakcie + land ginie w tym samym efekcie', () => {
  const s = game();
  hostWithAura(s);
  put(s, 'land1', 'basic-swamp', 'p2');
  addRegenerationShield(s, 'art1');
  castVandalize(s, 2, ['art1', 'land1']);
  resolveStack(s);

  assert.equal(s.objects.get('art1').zone, 'battlefield', 'stwór ocalały');
  assert.equal(s.objects.get('art1').tapped, true);
  assert.equal(s.objects.get('aura1')?.attachedTo, 'art1', 'aura nienaruszona');
  assert.equal(byCard(s, 'basic-swamp')[0].zone, 'graveyard', 'drugi cel (land) zniszczony w tym samym rozstrzygnięciu');
  assert.equal(s.zones.stack.length, 0);
  assert.equal(s.pendingReplacementChoice, null);
});

test('A4-2/3a: „Zniszcz oba” z wyborem — regen+umbra: wybór REGENERACJI, aura zostaje', () => {
  const s = game();
  put(s, 'art1', 'scorpion-sentinel');
  const u = put(s, 'umbra1', 'treefolk-umbra');
  replaceObject(s, u, { kind: 'aura', attachedTo: 'art1' });
  put(s, 'land1', 'basic-swamp', 'p2');
  addRegenerationShield(s, 'art1');
  castVandalize(s, 2, ['art1', 'land1']);
  resolveStack(s);

  assert.ok(s.pendingReplacementChoice, 'okno wyboru otwarte w środku sekwencji');
  assert.deepEqual([...s.pendingReplacementChoice.options].sort(), ['regenerate', 'umbra:umbra1']);
  pick(s, 'regenerate');

  assert.equal(s.objects.get('art1').zone, 'battlefield');
  assert.equal(s.objects.get('art1').tapped, true);
  assert.equal(s.objects.get('umbra1')?.zone, 'battlefield', 'wybrana regen → umbra NIE zużyta');
  assert.equal(s.objects.get('umbra1')?.attachedTo, 'art1');
  assert.equal(byCard(s, 'basic-swamp')[0].zone, 'graveyard', 'land zniszczony niezależnie od wyboru');
  assert.equal(s.pendingReplacementChoice, null, 'sekwencja zamknięta');
});

test('A4-2/3b: „Zniszcz oba” z wyborem — regen+umbra: wybór UMBRY, aura ginie ze stworem ocalałym', () => {
  const s = game();
  put(s, 'art1', 'scorpion-sentinel');
  const u = put(s, 'umbra1', 'treefolk-umbra');
  replaceObject(s, u, { kind: 'aura', attachedTo: 'art1' });
  put(s, 'land1', 'basic-swamp', 'p2');
  replaceObject(s, s.objects.get('art1'), { damage: 1 });
  addRegenerationShield(s, 'art1');
  castVandalize(s, 2, ['art1', 'land1']);
  resolveStack(s);

  assert.ok(s.pendingReplacementChoice);
  pick(s, 'umbra:umbra1');

  assert.equal(s.objects.get('art1').zone, 'battlefield', 'stwór ocalały (umbra)');
  assert.equal(s.objects.get('art1').damage, 0, '702.89a: obrażenia wyciągnięte');
  assert.equal(byCard(s, 'treefolk-umbra')[0].zone, 'graveyard', 'aura umbra zniszczona (702.89a)');
  assert.ok((s.regenerationShields ?? []).includes('art1'), 'tarcza regen NIE zużyta (wybrana umbra)');
  assert.equal(byCard(s, 'basic-swamp')[0].zone, 'graveyard');
  assert.equal(s.pendingReplacementChoice, null);
});

test('A4-2/4: kontrola — bez regen stwór ginie z aurą (orphan cleanup)', () => {
  const s = game();
  hostWithAura(s);
  castVandalize(s, 0, ['art1']);
  resolveStack(s);
  assert.equal(byCard(s, 'scorpion-sentinel')[0].zone, 'graveyard', 'bez tarczy → zniszczony');
  assert.equal(byCard(s, 'hobble')[0].zone, 'graveyard', 'aura ginie z hostem');
  assert.equal(s.pendingReplacementChoice, null);
});
