// M117 (audyt PR #56) — polowanie na resztki klasy błędu z lekcji L24:
// „permanent zostaje zatapniętny, ale nikt nie emituje `object_tapped`”.
//
// M114 naprawił tę klasę na ścieżce tapnięcia landa za manę (bez zdarzenia
// żaden trigger „becomes tapped” — Chronic Flooding — nie mógł zadziałać).
// Ten plik sprawdza, czy w silniku nie zostały INNE ścieżki mutujące
// `tapped: true` po cichu, i pilnuje, żeby nowe nie powstały.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addRegenerationShield, runStateBasedActions } from '../src/engine/state-based.js';
import { processTriggers } from '../src/engine/triggers.js';

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 117, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], cardName: def.name, aura: data.aura ?? def.aura ?? null,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function putBlank(state, id, controllerId, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: extra.cardId ?? `x-${id}`, controllerId,
    zone: extra.zone ?? 'battlefield', kind: extra.kind ?? 'creature',
    power: extra.power ?? 2, toughness: extra.toughness ?? 2, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: extra.types ?? ['Creature'],
    colors: [], cardName: extra.cardName ?? id, ...(extra.damage ? { damage: extra.damage } : {}),
  });
  state.objects.set(state.objects.get(id).id, Object.freeze({
    ...state.objects.get(id), summoningSickness: false,
  }));
  return state.objects.get(id);
}

test('L24/A: regeneracja tapuje permanent i MÓWI o tym zdarzeniem', () => {
  // CR 701.15a: regeneracja to efekt zastępczy, który m.in. TAPUJE permanent.
  // Tapnięcie jest widoczną zmianą stanu, więc musi wygenerować zdarzenie —
  // inaczej trigger „becomes tapped” (Chronic Flooding) go nie zobaczy,
  // a gracz nie przeczyta w logu, dlaczego jego stwór jest zatapniętny.
  const state = newState();
  const creature = putBlank(state, 'regen', 'p1', { toughness: 2 });
  assert.equal(creature.tapped ?? false, false);
  addRegenerationShield(state, 'regen');
  // Śmiertelne obrażenia → SBA → tarcza regeneracji zamiast zniszczenia.
  state.objects.set('regen', Object.freeze({ ...state.objects.get('regen'), damage: 5 }));
  state.events.length = 0;
  runStateBasedActions(state);

  const regenerated = state.objects.get('regen');
  assert.equal(regenerated.zone, 'battlefield', 'tarcza uratowała stwora');
  assert.equal(regenerated.tapped, true, 'CR 701.15a: regeneracja TAPUJE');
  const tapEvents = state.events.filter((e) => e.type === 'object_tapped' && e.objectId === 'regen');
  assert.equal(tapEvents.length, 1,
    'tapnięcie przez regenerację musi emitować object_tapped (lekcja L24) — '
    + `zdarzenia: ${state.events.map((e) => e.type).join(', ')}`);
});

test('L24/B: zdarzenie z regeneracji trafia do listy, którą karmione są triggery', () => {
  // Sedno naprawy. `accepted()` w game-state.js robi:
  //
  //     const sbaEvents = runStateBasedActions(state);
  //     const triggerEvents = processTriggers(state, result.events);
  //
  // czyli triggery skanują listę ZWRACANĄ przez SBA (doklejoną do wyniku
  // komendy), a NIE całe `state.events`. `tryRegenerate` dopisywał zdarzenia
  // wyłącznie do `state.events`, więc nawet po dodaniu `object_tapped`
  // trigger „becomes tapped” nadal by go nie zobaczył.
  //
  // (Pełnego end-to-end z Chronic Flooding nie da się tu zbudować: ta aura
  // zaczarowuje LAND, a regeneracja tapuje stwory — SBA odłączyłoby ją jako
  // nielegalny załącznik. Kontraktem jest więc obecność zdarzenia w liście.)
  const state = newState();
  putBlank(state, 'regen', 'p1', { toughness: 2 });
  addRegenerationShield(state, 'regen');
  state.objects.set('regen', Object.freeze({ ...state.objects.get('regen'), damage: 5 }));

  const returned = runStateBasedActions(state);
  const types = returned.map((e) => e.type);
  assert.ok(types.includes('object_tapped'),
    `SBA musi ZWRÓCIĆ object_tapped (nie tylko dopisać do state.events) — zwrócone: ${types.join(', ')}`);
  assert.ok(types.includes('permanent_regenerated'),
    `SBA musi ZWRÓCIĆ permanent_regenerated — zwrócone: ${types.join(', ')}`);
  // Lista zwracana nie może też dublować zdarzeń względem state.events.
  const tappedInState = state.events.filter((e) => e.type === 'object_tapped' && e.objectId === 'regen');
  assert.equal(tappedInState.length, 1, 'dokładnie jedno object_tapped w strumieniu stanu');
});

test('L24/C: żadna ścieżka w silniku nie ustawia tapped:true po cichu', () => {
  // Strażnik statyczny: każda linia mutująca `tapped: true` musi mieć
  // w pobliżu emisję `object_tapped` albo jawny komentarz wyjaśniający,
  // dlaczego zdarzenia nie ma (np. permanent WCHODZI już zatapniętny —
  // to nie jest „becomes tapped”, CR 701.21a).
  const files = fs.readdirSync('src/engine').filter((f) => f.endsWith('.js')).map((f) => `src/engine/${f}`);
  const silent = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (!/tapped:\s*true/.test(line)) return;
      // M137: pomijamy wystąpienia wewnątrz LITERAŁU tekstowego — podpowiedzi
      // dla programisty (np. komunikat walidacji kontraktu addObject) cytują
      // `tapped: true` w treści stringa, a to nie jest mutacja stanu gry.
      const beforeMatch = line.slice(0, line.search(/tapped:\s*true/));
      const inStringLiteral = (beforeMatch.split("'").length - 1) % 2 === 1
        || (beforeMatch.split('`').length - 1) % 2 === 1
        || (beforeMatch.split('"').length - 1) % 2 === 1;
      if (inStringLiteral) return;
      const window = lines.slice(Math.max(0, index - 8), index + 22).join('\n');
      const emitsEvent = /object_tapped|entersTapped|shouldEnterTapped|enters_tapped/.test(window);
      // Permanent, który WCHODZI na pole bitwy zatapniętny (CR 701.21a), nie
      // „staje się” zatapniętny — nie ma tu zdarzenia object_tapped i nie
      // powinno być. Rozpoznajemy to po tym, że obiekt właśnie zmienił strefę.
      const entersTapped = /moveObjectDirectly|\.\.\.moved|permanent_entered_battlefield/.test(window);
      const explained = /L24|wchodzi zatapni|enters tapped|nie jest „becomes tapped/i.test(window);
      if (!emitsEvent && !entersTapped && !explained) silent.push(`${file}:${index + 1} → ${line.trim()}`);
    });
  }
  assert.deepEqual(silent, [],
    `ciche tapnięcia (lekcja L24 — efekt bez zdarzenia nie istnieje dla gracza):\n  ${silent.join('\n  ')}`);
});
