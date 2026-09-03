/**
 * Skarb bez ID karty w rdzeniu — audyt PR #93 (tura 3), decyzja właściciela.
 *
 * Stan przed: prawda o Skarbie leżała w silniku w trzech kopiach, a każda
 * inaczej:
 *  1. `mana-sources.js` — wpis `'token_treasure': { colors: [WUBRG], amount: 1 }`
 *     w MANA_SOURCE_MAP, czyli **recznej mapie**, którą komentarz w tym samym
 *     pliku (M193/A) zabrania używać dla kart z darmową zdolnością many
 *     („mapa nie może stać się cieniem danych karty\");
 *  2. `resources.js:623` (`treasureManaAvailable`) i `:847` (blokada płatności
 *     `treasureAltCost`) — porównania `object.cardId !== 'token_treasure'`, więc
 *     silnik rozstrzygał mechanikę po NAZWIE KARTY (klasa ADR 0002);
 *  3. `resources.js:839,850` — lista pięciu kolorów wpisana literalem.
 *
 * Po: zdolność many z kosztem poświęcenia jest czytana z DESKRYPTORA obiektu
 * (`abilities[].cost == {tap, sacrificeSelf}` + `effect.add_mana` z
 * `fromTreasure`), kolory jednostki pochodzą z `effect.colors`, a licznik
 * „mana skarbowa w puli" niesie też swoje kolory (`player.treasureManaColors`),
 * więc `treasureAltCost` nie potrzebuje już ani ID karty, ani litery kolorów.
 *
 * Testy idą syntetycznym „skarbowikiem" z INNYM cardId — to jedyny dowód, że
 * predykat jest zdolnościowy, a nie nazwowy (L52: pin na obiekcie, nie na opisie).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana, treasureManaAvailable } from '../src/engine/resources.js';
import { getManaSourceInfo, getSourceForObject, treasureManaAbilityOf } from '../src/engine/mana-sources.js';

const REGISTRY = createCardRegistry();

/** Skarb z katalogu (prawdziwa definicja tokenu). */
function putTreasure(state, id, controllerId = 'p1', cardId = 'token_treasure') {
  const def = REGISTRY.get('token_treasure');
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId,
    zone: 'battlefield', ...gameObjectDataOf(def), types: def.types ?? ['Artifact'],
    subtypes: def.subtypes ?? ['Treasure'],
  });
  return state.objects.get(id);
}

function table({ seed = 7 } = {}) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

test('1) MANA_SOURCE_MAP nie jest cieniem danych karty: Skarb znika z mapy, a źródło nadal widzi 5 kolorów', () => {
  assert.equal(getManaSourceInfo('token_treasure'), null,
    'Skarb ma DARMĄ zdolność many w deskryptora — nie wolno go trzymać w MANA_SOURCE_MAP '
    + '(komentarz w mana-sources.js:46 i strażnik M193/A); fakt czyta się z definicji tokena');
  const state = table();
  const treasure = putTreasure(state, 'tr1');
  const src = getSourceForObject(treasure, state);
  assert.deepEqual([...(src?.colors ?? [])].sort(), ['B', 'G', 'R', 'U', 'W'],
    'kolory producowane przez Skarb pochodzą z deskryptora zdolności (effect.colors)');
  assert.equal(src?.amount, 1, 'jednostka many ze Skarbu: 1');
});

test('2) żaden plik src/engine poza tokens.js nie wymienia Skarba po ID', () => {
  const dir = new URL('../src/engine/', import.meta.url);
  const files = fs.readdirSync(dir).filter((n) => n.endsWith('.js'));
  const Trafienia = [];
  for (const name of files) {
    if (name === 'tokens.js') continue; // wspólne deskryptory tokenów — tam ID jest DANYMI
    const src = fs.readFileSync(new URL(name, dir), 'utf8');
    for (const [i, line] of src.split('\n').entries()) {
      if (line.includes("'token_treasure'") || line.includes('"token_treasure"')) {
        Trafienia.push(`${name}:${i + 1}: ${line.trim().slice(0, 90)}`);
      }
    }
  }
  assert.deepEqual(Trafienia, [],
    'porównania po ID karty w rdzeniu to klasa ADR 0002 — predykat ma czytać deskryptor zdolności');
});

test('3) predykat jest zdolnościowy: syntetyczny „skarbek\" z innym cardId liczy się tak samo', () => {
  const state = table();
  putTreasure(state, 'faux', 'p1', 'faux-treasure-kopia');
  assert.equal(treasureManaAvailable(state, 'p1'), 1,
    'koszyk „mana ze Skarbów\" nie może pytać o cardId — inaczej kopia tej samej zdolności jest niewidzialna');
  const ability = treasureManaAbilityOf(state.objects.get('faux'));
  assert.ok(ability, 'deskryptor musi być czytany przez zdolność');
  assert.equal(ability.amount, 1);
  assert.equal(ability.fromTreasure, true);

  // Artefakt bez zdolności many NIE wchodzi do koszyka.
  const state2 = table();
  const plain = REGISTRY.get('contested-game-ball');
  addObject(state2, {
    id: 'art', instanceId: 'i-art', cardId: plain.id, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(plain), types: plain.types ?? ['Artifact'],
  });
  assert.equal(treasureManaAvailable(state2, 'p1'), 0,
    'sam artefakt to nie Skarb — bez zdolności z fromTreasure nie ma czego liczyć');
});

test('4) zapłata treasureAltCost idzie bez ID i bez litery kolorów (Security Rhox na „skarbankach\")', () => {
  const rhox = (state) => REGISTRY.get('security-rhox');
  const gra = (stan) => {
    const def = rhox(stan);
    addObject(stan, {
      id: 'rhox', instanceId: 'i-rhox', cardId: def.id, controllerId: 'p1', ownerId: 'p1',
      zone: 'hand', ...gameObjectDataOf(def), types: def.types ?? ['Creature'],
    });
    return execute(stan, { type: 'cast_permanent', playerId: 'p1', objectId: 'rhox', treasureAlt: true });
  };

  // Dwa syntetyczne Skarby o INNYM cardId — pokrywa dokładnie koszt {R}{G} (2 jednostki).
  const stan = table();
  putTreasure(stan, 'faux1', 'p1', 'faux-treasure-kopia');
  putTreasure(stan, 'faux2', 'p1', 'faux-treasure-kopia');
  assert.equal(treasureManaAvailable(stan, 'p1'), 2, 'koszyk liczy zdolność, nie nazwę karty');
  const r = gra(stan);
  assert.equal(r.ok, true, `rzut za Skarby musi przejść: ${JSON.stringify(r.events?.[0] ?? r)}`);
  // Poświęcenie przenosi permanent do cmentarza POD NOWYM id (moveObjectDirectly
  // z grave-N), więc o state.objects.get('faux1') nie pytamy — pytamy o strefy.
  assert.deepEqual([...stan.zones.battlefield], [],
    'oba Skarby muszą zniknąć z pola bitwy (CR 701.14a: poświęcenie jest kosztem zdolności, nie tapnięciem)');
  assert.equal(stan.zones.graveyard.length, 2,
    `oba Skarby trafiają na cmentarz, jest: ${JSON.stringify([...stan.zones.graveyard])}`);

  // Jeden Skarb = za mało na {R}{G}: odmowa musi być ta sama co przed refaktorem.
  const stan2 = table();
  putTreasure(stan2, 'faux3', 'p1', 'faux-treasure-kopia');
  const r2 = gra(stan2);
  assert.equal(r2.ok, false, 'jeden Skarb nie płaci dwóch jednostek');
  assert.match(JSON.stringify(r2.events ?? []), /Koszt alternatywny wymaga many ze Skarb/,
    'odmowa musi powiedzieć, że chodzi o manę ze Skarbów');
  assert.deepEqual([...stan2.zones.battlefield], ['faux3'],
    'przy odmowie żaden Skarb nie może zniknąć z pola bitwy (transakcja nie mutuje stanu)');
});

test('5) jednostki Skarbu w puli niosą swoje kolory (brak listy kolorów w silniku)', () => {
  const state = table();
  addMana(state, 'p1', 1, { colors: ['W', 'U', 'B', 'R', 'G'], fromTreasure: true });
  const p = state.players[0];
  assert.equal(p.treasureMana, 1);
  assert.deepEqual([...(p.treasureManaColors ?? [])].sort(), ['B', 'G', 'R', 'U', 'W'],
    'koszyk „spend only mana produced by Treasures\" nie może zakładać pięciu kolorów z litery — bierze je z tego, co faktycznie wyprodukowano');
  addMana(state, 'p1', 1, { colors: ['R'] }); // zwykła mana — nie dokłada kolorów do skarbowych
  assert.deepEqual([...(p.treasureManaColors ?? [])].sort(), ['B', 'G', 'R', 'U', 'W']);
});
