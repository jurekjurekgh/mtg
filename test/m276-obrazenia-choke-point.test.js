import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { applyEffect } from '../src/engine/effects.js';
import { addCounter } from '../src/engine/counters.js';

/**
 * M276 (błąd #28) — `damage_to_controller` miało WŁASNĄ kopię logiki obrażeń.
 *
 * Choke point `dealNonCombatDamage` niesie cały kontrakt obrażeń: fizzle celu
 * (CR 608.2b), protection (CR 702.16), filtr „prevent all damage this turn",
 * tarcze prewencji, infect (CR 702.90b), deathtouch (CR 702.4b) i lifelink
 * (CR 702.15). Kopia w `damage_to_controller` (Forge Devil: „deals 1 damage
 * to target creature and 1 damage to you") znała wyłącznie tarcze i zmianę
 * życia.
 *
 * Skutek: Forge Devil z licznikiem lifelink (CR 122.1b — Unbreakable Bond)
 * NIE dawał życia za obrażenia zadane własnemu kontrolerowi, choć te same
 * obrażenia zadane przeciwnikowi życie dawały. Ta sama karta, dwie ścieżki,
 * dwa różne wyniki — klasa L107.
 *
 * Znalezione analizatorem rodzin (handoff M274, kierunek „rodzina damage").
 */
const registry = createCardRegistry();

function stanZForgeDevil() {
  const karta = registry.get('forge-devil');
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'fd', instanceId: 'ifd', cardId: 'forge-devil', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(karta), types: karta.types,
  });
  state.events.length = 0;
  return state;
}

const zycie = (state, id) => state.players.find((p) => p.id === id).life;

test('lifelink działa dla obrażeń zadanych WŁASNEMU kontrolerowi (CR 702.15)', () => {
  const state = stanZForgeDevil();
  addCounter(state, 'fd', 'lifelink', 1); // CR 122.1b — licznik nadaje keyword
  const przed = zycie(state, 'p1');
  applyEffect(state, { type: 'damage_to_controller', amount: 1 }, state.objects.get('fd'), []);
  assert.equal(
    zycie(state, 'p1'), przed,
    'lifelink zwraca życie stracone na własnych obrażeniach (−1 obrażenie, +1 życie)',
  );
});

test('bez lifelink obrażenia w kontrolera nadal bolą', () => {
  // Kontrola negatywna: naprawa nie może „wyłączyć" obrażeń.
  const state = stanZForgeDevil();
  const przed = zycie(state, 'p1');
  applyEffect(state, { type: 'damage_to_controller', amount: 1 }, state.objects.get('fd'), []);
  assert.equal(zycie(state, 'p1'), przed - 1, 'kontroler traci życie');
});

test('obie ścieżki obrażeń dają ten sam wynik dla tego samego źródła', () => {
  // Sedno klasy: ta sama karta z tym samym keywordem nie może zachowywać się
  // różnie zależnie od tego, KTO jest celem.
  const wlasny = stanZForgeDevil();
  addCounter(wlasny, 'fd', 'lifelink', 1);
  const przedW = zycie(wlasny, 'p1');
  applyEffect(wlasny, { type: 'damage_to_controller', amount: 1 }, wlasny.objects.get('fd'), []);
  const zyskWlasny = zycie(wlasny, 'p1') - (przedW - 1); // ile oddał lifelink

  const obcy = stanZForgeDevil();
  addCounter(obcy, 'fd', 'lifelink', 1);
  const przedO = zycie(obcy, 'p1');
  applyEffect(obcy, { type: 'damage', amount: 1 }, obcy.objects.get('fd'), ['p2']);
  const zyskObcy = zycie(obcy, 'p1') - przedO;

  assert.equal(zyskWlasny, zyskObcy, 'lifelink daje tyle samo życia na obu ścieżkach');
});

test('infect zamienia obrażenia w kontrolera na liczniki trucizny (CR 702.90b)', () => {
  const state = stanZForgeDevil();
  const zrodlo = state.objects.get('fd');
  state.objects.set('fd', Object.freeze({ ...zrodlo, keywords: ['infect'] }));
  const przed = zycie(state, 'p1');
  applyEffect(state, { type: 'damage_to_controller', amount: 2 }, state.objects.get('fd'), []);
  assert.equal(zycie(state, 'p1'), przed, 'infect nie odbiera życia');
  assert.equal(
    state.players.find((p) => p.id === 'p1').poison ?? 0, 2,
    'infect daje liczniki trucizny zamiast utraty życia',
  );
});

test('zdarzenie damage_dealt niesie kwotę FAKTYCZNIE zadaną (CR 119.3)', () => {
  const state = stanZForgeDevil();
  applyEffect(state, { type: 'damage_to_controller', amount: 3 }, state.objects.get('fd'), []);
  const zdarzenie = state.events.find((e) => e.type === 'damage_dealt');
  assert.ok(zdarzenie, 'zdarzenie obrażeń zostało wyemitowane');
  assert.equal(zdarzenie.amount, 3, 'kwota zgodna z zadanymi obrażeniami');
  assert.equal(zdarzenie.combat, false, 'to nie są obrażenia bojowe');
  assert.equal(zdarzenie.sourceCardId, 'forge-devil', 'LKI źródła dla logu (L29)');
});

test('SKAN ŹRÓDEŁ: efekt zadający obrażenia przechodzi przez choke point', () => {
  // Strażnik klasowy: nowa ścieżka obrażeń nie może odtwarzać kontraktu
  // własnym `changeLife`/`markDamage` — musi wołać dealNonCombatDamage
  // (albo delegować do innego typu efektu, który to robi).
  const zrodlo = fs.readFileSync('src/engine/effects.js', 'utf8');
  const re = /if \(effect\.type === '([a-z_0-9]+)'\) \{/g;
  let m;
  while ((m = re.exec(zrodlo)) !== null) {
    const typ = m[1];
    let depth = 1;
    let i = re.lastIndex;
    while (i < zrodlo.length && depth > 0) {
      const ch = zrodlo[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      i += 1;
    }
    const cialo = zrodlo.slice(re.lastIndex, i - 1);
    // Interesują nas wyłącznie efekty, które SAME zmniejszają życie jako
    // obrażenia (nie „lose life", nie koszt życia, nie prewencja).
    if (!/damage/.test(typ)) continue;
    if (/prevent/.test(typ)) continue;
    if (!/changeLife\(state, [^,]+, -/.test(cialo)) continue;
    assert.ok(
      /dealNonCombatDamage\(/.test(cialo) || /applyEffect\(state, \{ type: '[a-z_]*damage/.test(cialo),
      `effect.type === '${typ}' odejmuje życie własnym changeLife zamiast `
      + 'przejść przez dealNonCombatDamage — zgubi lifelink (CR 702.15), '
      + 'infect (CR 702.90b) i filtry prewencji.',
    );
  }
});
