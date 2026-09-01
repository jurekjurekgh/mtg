import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { removeIllegalAttachments, detachAttachmentsFromHost } from '../src/engine/attachments.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { addCounter } from '../src/engine/counters.js';

/**
 * M271 (błędy #11 i #12) — aura, która straciła legalnego gospodarza
 * (CR 704.5m), opuszczała pole bitwy RĘCZNĄ kopią kodu przenoszenia zamiast
 * przez jedyny choke point `moveObjectDirectly`. Kopia gubiła dwie korekty:
 *   #11 CR 400.3 + 110.2a — poza polem bitwy obiekt należy do WŁAŚCICIELA,
 *       więc ukradziona aura lądowała w grobie ZŁODZIEJA;
 *   #12 CR 122.1e — `deathZoneFor` (finality) był ignorowany.
 *
 * Strażnik jest KLASOWY: sprawdza RÓWNOWAŻNOŚĆ ścieżki aury ze ścieżką
 * zwykłego permanentu, a nie zachowanie konkretnej karty.
 */
function stan({ ownerId = 'p1', controllerId = 'p1' } = {}) {
  const registry = createCardRegistry();
  const descriptor = registry.get('hobble');
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'a', instanceId: 'ia', cardId: 'hobble', controllerId, ownerId,
    zone: 'battlefield', ...gameObjectDataOf(descriptor),
    types: descriptor.types, subtypes: descriptor.subtypes,
  });
  // Gospodarz nie istnieje — SBA usuwa aurę z pola bitwy.
  state.objects.set('a', Object.freeze({ ...state.objects.get('a'), attachedTo: 'brak' }));
  return state;
}

const aura = (state) => [...state.objects.values()].find((o) => o.cardId === 'hobble');

test('#11 CR 400.3: ukradziona aura trafia do grobu WŁAŚCICIELA', () => {
  const state = stan({ ownerId: 'p2', controllerId: 'p1' });
  removeIllegalAttachments(state);
  const moved = aura(state);
  assert.equal(moved.zone, 'graveyard');
  assert.equal(moved.ownerId, 'p2');
  assert.equal(moved.controllerId, 'p2', 'poza polem bitwy kontroluje WŁAŚCICIEL, nie złodziej');
});

test('#12 CR 122.1e: aura z licznikiem finality idzie na wygnanie', () => {
  const state = stan();
  addCounter(state, 'a', 'finality', 1);
  removeIllegalAttachments(state);
  assert.equal(aura(state).zone, 'exile');
});

test('#12 kontrola negatywna: bez finality aura idzie do grobu', () => {
  const state = stan();
  removeIllegalAttachments(state);
  assert.equal(aura(state).zone, 'graveyard');
});

test('CR 400.7: aura porzuca stan permanentu przy zmianie strefy', () => {
  const state = stan();
  addCounter(state, 'a', 'shield', 2);
  state.objects.set('a', Object.freeze({
    ...state.objects.get('a'), damage: 3, powerModifier: 5, toughnessModifier: 5, tapped: true,
  }));
  removeIllegalAttachments(state);
  const moved = aura(state);
  assert.equal(moved.damage, 0);
  assert.equal(moved.powerModifier, 0);
  assert.equal(moved.toughnessModifier, 0);
  assert.equal(Object.keys(moved.counters ?? {}).length, 0, 'liczniki znikają (CR 122.2)');
  assert.equal(moved.attachedTo, null);
  assert.equal(moved.kind, 'enchantment', 'czysta aura zostaje enchantmentem');
});

test('zdarzenie niesie strefę docelową, a obiekt jest w niej faktycznie', () => {
  for (const [nazwa, finality] of [['grób', 0], ['wygnanie', 1]]) {
    const state = stan();
    if (finality) addCounter(state, 'a', 'finality', 1);
    state.events.length = 0;
    removeIllegalAttachments(state);
    const zdarzenie = state.events.find((e) => e.type === 'permanent_put_into_graveyard');
    const moved = aura(state);
    assert.ok(zdarzenie, `${nazwa}: zdarzenie wyemitowane`);
    assert.equal(zdarzenie.toZone, moved.zone, `${nazwa}: log zgodny ze stanem`);
    assert.equal(zdarzenie.toId, moved.id, `${nazwa}: log wskazuje właściwy obiekt`);
    assert.ok(state.zones[moved.zone].includes(moved.id), `${nazwa}: obiekt wpisany do strefy`);
    assert.ok(!state.zones.battlefield.includes('a'), `${nazwa}: zdjęty z pola bitwy`);
  }
});

/**
 * M271 (błąd #16) — znaleziony jako regresja własnej naprawy #11/#12, ale
 * błąd JEST samoistny: polityka czystej aury przenosi ją do grobu, a każde
 * przeniesienie kończy się sprawdzeniem inwariantów. Przy DWÓCH załącznikach
 * na jednym gospodarzu sprawdzenie wypadało w ŚRODKU pętli odczepiania, gdy
 * drugi załącznik wciąż wskazywał skasowanego gospodarza — partia wywracała
 * się wyjątkiem. Wykryte przez benchmark botów (seed 2028).
 */
function gospodarzZAurami(ile) {
  const registry = createCardRegistry();
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  const stwor = registry.get('highland-game');
  addObject(state, {
    id: 'host', instanceId: 'ih', cardId: 'highland-game', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(stwor), types: stwor.types,
  });
  for (let i = 0; i < ile; i += 1) {
    const descriptor = registry.get('hobble');
    addObject(state, {
      id: `a${i}`, instanceId: `ia${i}`, cardId: 'hobble', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', ...gameObjectDataOf(descriptor),
      types: descriptor.types, subtypes: descriptor.subtypes,
    });
    state.objects.set(`a${i}`, Object.freeze({
      ...state.objects.get(`a${i}`), attachedTo: 'host', kind: 'aura', baseKind: 'enchantment',
    }));
  }
  return state;
}

test('#16: gospodarz z KILKOMA aurami odchodzi bez łamania inwariantów', () => {
  for (const ile of [1, 2, 3]) {
    const state = gospodarzZAurami(ile);
    assert.doesNotThrow(
      () => moveObjectDirectly(state, 'host', 'graveyard', 'grave-host'),
      `${ile} aur: przeniesienie gospodarza nie może wywrócić partii`,
    );
    const wGrobie = [...state.objects.values()].filter((o) => o.cardId === 'hobble' && o.zone === 'graveyard');
    assert.equal(wGrobie.length, ile, `${ile} aur: wszystkie trafiły do grobu (CR 704.5m)`);
  }
});

test('#16: po odczepieniu żaden załącznik nie wskazuje znikniętego gospodarza', () => {
  const state = gospodarzZAurami(3);
  detachAttachmentsFromHost(state, 'host');
  for (const object of state.objects.values()) {
    if (object.attachedTo == null) continue;
    assert.ok(state.objects.has(object.attachedTo), `${object.id} wskazuje żywego gospodarza`);
  }
});
