// E8/B2 (wyzwanie wyłapywacza błędów): FLAGA „NIE ODKRĘCA SIĘ" (klasa
// Wavecrash Triton / Chill of the Grave — „doesn't untap during its
// controller's next untap step") nie jest zużywana, gdy cel jest w chwili
// untap stepu odkręcony, oraz porównuje zapisany controllerId z aktywnym
// graczem, co gubi skip po zmianie kontrolera.
//
// CR: to JEDNORAZOWY efekt zastępujący odkręcenie w NAJBLIŻSZYM untap stepie
// KONTROLERA celu (kontrolera w chwili tego stepu). Dotąd `untapControlled`
// wchodziło wyłącznie do obiektów `tapped || summoningSickness` i zjadało
// flagę tylko gdy `tapped` — odkręcony w międzyczasie cel nosił flagę
// wiecznie i pomijał PÓŹNIEJSZY untap step (stawór „mroził się" na zapas).
// Po zmianie kontrolera flaga (controllerId z momentu efektu) nie zgadzała
// się z aktywnym graczem: skip wypadał w cudzym untap stepie albo wcale.
//
// Pin: flaga zużywa się na untap stepie obecnego kontrolera niezależnie od
// stanu tapped; tapped → ten step bez odkręcenia; odkręcony → bez skutku,
// ale flaga znika i KOLEJNY untap odkręca normalnie.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { replaceObject, untapControlled } from '../src/engine/permanents.js';

function creature(state, id, controllerId) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'basic-husk', controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2,
    types: ['Creature'], colors: ['B'], abilities: [], keywords: [], subtypes: [],
  });
  return state.objects.get(id);
}

test('E8/B2: flaga zużyta na untap stepie mimo że cel odkręcony — kolejny untap odkręca normalnie', () => {
  const state = createGameState({ seed: 8, players: [{ id: 'p1' }, { id: 'p2' }] });
  const obj = creature(state, 'husk', 'p1');
  // Cel odkręcony, flaga aktywna (np. efektem Chilla na wierzonym, potem
  // odkręconym punktowo stworze — utworzona tura temu samemu kontrolerowi).
  replaceObject(state, obj, { dontUntapNextUntapStep: 'p1', tapped: false });
  untapControlled(state, 'p1');
  assert.equal(state.objects.get('husk').dontUntapNextUntapStep ?? null, null,
    'flaga ZUŻYTA na najbliższym untap stepie kontrolera (była: noszona wiecznie)');
  // Stwór został zatapnięty normalną grą — kolejny untap MUSI odkręcić.
  replaceObject(state, state.objects.get('husk'), { tapped: true });
  untapControlled(state, 'p1');
  assert.equal(state.objects.get('husk').tapped, false,
    'kolejny untap odkręca normalnie (było: drugi raz pomijał odkręcenie)');
});

test('E8/B2: zmiana kontrolera — skip wypada w untap stepie OBECNEGO kontrolera', () => {
  const state = createGameState({ seed: 8, players: [{ id: 'p1' }, { id: 'p2' }] });
  const obj = creature(state, 'husk', 'p1');
  replaceObject(state, obj, { dontUntapNextUntapStep: 'p1', tapped: true });
  // Przejęcie kontroli (np. sorcery-steal przed untapem przeciwnika — tu
  // modelowane wprost flagą kontrolera p2).
  replaceObject(state, state.objects.get('husk'), { controllerId: 'p2' });
  untapControlled(state, 'p1'); // stwór nie należy już do p1 — bez zmian
  assert.equal(state.objects.get('husk').tapped, true, 'p1 nie odkręca cudzego stwora');
  untapControlled(state, 'p2'); // untap step OBECNEGO kontrolera
  assert.equal(state.objects.get('husk').tapped, true,
    'nowy kontroler: stwór NIE odkręca się (efekt „next untap step" właśnie zszedł)');
  assert.equal(state.objects.get('husk').dontUntapNextUntapStep ?? null, null, 'flaga zużyta');
  // A kolejny untap już normalny:
  untapControlled(state, 'p2');
  assert.equal(state.objects.get('husk').tapped, false, 'potem odkręca normalnie');
});
