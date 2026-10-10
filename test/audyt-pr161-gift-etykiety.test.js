// Audyt PR #161 (sesja 2026-10-10), znalezisko F-2: wyróżnik obietnicy daru
// w etykietach istniał TYLKO dla `cast_spell` (wiersz: „· dar dla
// przeciwnika: …”, tytuł: „(dar)”). Tymczasem kontrakt K
// (choiceRequestGroupKey) celowo trzyma warianty daru w JEDNEJ grupie
// modalnej i uzasadnia to wprost: „etykieta mówi »dar dla przeciwnika: …«,
// więc warianty są rozróżnialne” — a N-owy fallback `buttonsPlanOf`
// (strażnik `uniformGiftOf` w 6 planach) właśnie NA ETYKIETACH polega.
// Grupa z niejednolitym darem dla `cast_permanent`/`cast_cleave`/
// `cast_flashback`/`cast_escape`/`cast_adventure` dawała wiersze
// nierozróżnialne (numerowanie „(1 z 2)” labelChoiceOptions nie mówi,
// KTÓRY wariant obiecuje dar) — klasa M101/B („dwa identyczne przyciski
// o różnym skutku”), wielokrotnie naprawiana dla kickera/surge/phyrexian
// (M223/M265). Ten sam defekt w tytułach grup („(dar)” gated na cast_spell).
//
// Fix u root cause (L41): JEDEN helper wyróżnika w dwóch lejkach etykiet —
// `commandLabel` (wiersze: każdy typ rzutu) i `choiceSourceTitle` (tytuły).
// ADR 0002 — po polu komendy `gifted`, nie po nazwie karty.
import test from 'node:test';
import assert from 'node:assert/strict';
import { commandLabel, choiceGroupTitle } from '../src/table/render.js';
import { createCardRegistry } from '../src/cards/card-data.js';

const REGISTRY = createCardRegistry();
const SESSION = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? id,
  nameOfObject: (id) => REGISTRY.get(String(id).split('#')[0])?.name ?? id,
  cardDetails: (id) => REGISTRY.get(id),
  abilitiesOf: () => [],
  colorsOf: () => [],
};

// Minimalny widok: karta w ręce niesie deskryptor `gift` (jak widok silnika
// — game-state wystawia `gift: object.gift ?? null` w kafelkach).
function widokZKarta(karta) {
  return {
    players: [{ id: 'p1', name: 'P1' }, { id: 'p2', name: 'P2' }],
    zones: {
      hand: [{
        id: 'karta#1', cardId: 'dawntreader-elk', controllerId: 'p1',
        kind: 'creature', manaCost: 3, name: 'Dawntreader Elk',
        gift: karta ?? null,
      }],
      battlefield: [], stack: [], graveyard: [], library: [], exile: [],
    },
    pendingScry: null, pendingLookTopN: null, pendingManifestDread: null,
  };
}

const DAR = { effect: { type: 'create_token', name: 'Food' } };

test('F-2/1: wiersz cast_permanent z darem niesie wyróżnik (M101/B)', () => {
  const widok = widokZKarta(DAR);
  const zDarem = { type: 'cast_permanent', objectId: 'karta#1', targets: ['t1'], gifted: true, giftRecipientId: 'p2' };
  const bezDaru = { type: 'cast_permanent', objectId: 'karta#1', targets: ['t1'], gifted: false, giftRecipientId: null };
  const etykietaDaru = commandLabel(zDarem, SESSION, widok);
  const etykietaBazy = commandLabel(bezDaru, SESSION, widok);
  assert.ok(etykietaDaru?.includes('dar dla przeciwnika: Food'),
    `wiersz z darem musi nazwać dar — jest: ${etykietaDaru}`);
  assert.ok(!etykietaBazy?.includes('dar'), 'wiersz bez daru milczy o darze');
  assert.notEqual(etykietaDaru, etykietaBazy, 'warianty muszą być rozróżnialne');
});

test('F-2/2: wiersz cast_cleave z darem niesie wyróżnik (rodzina L72)', () => {
  const widok = widokZKarta(DAR);
  const etykieta = commandLabel(
    { type: 'cast_cleave', objectId: 'karta#1', targets: ['t1'], gifted: true, giftRecipientId: 'p2' },
    SESSION, widok);
  assert.ok(etykieta?.includes('dar dla przeciwnika: Food'),
    `cleave to też rzut — wyróżnik jak wszędzie: ${etykieta}`);
});

test('F-2/3: wiersz cast_spell z darem niesie wyróżnik DOKŁADNIE raz (bez duplikacji po scaleniu lejków)', () => {
  const widok = widokZKarta(DAR);
  const etykieta = commandLabel(
    { type: 'cast_spell', objectId: 'karta#1', targets: ['t1'], gifted: true, giftRecipientId: 'p2' },
    SESSION, widok);
  const ile = (String(etykieta).match(/dar dla przeciwnika/g) ?? []).length;
  assert.equal(ile, 1, `dokładnie jeden wyróżnik — jest ${ile} w: ${etykieta}`);
});

test('F-2/4: tytuł grupy cast_permanent z darem niesie „(dar)” (bramka nie tylko cast_spell)', () => {
  const widok = widokZKarta(DAR);
  const zDarem = { type: 'cast_permanent', objectId: 'karta#1', targets: ['t1'], gifted: true, giftRecipientId: 'p2' };
  const bezDaru = { type: 'cast_permanent', objectId: 'karta#1', targets: ['t1'], gifted: false, giftRecipientId: null };
  const tytulDaru = choiceGroupTitle({ options: [zDarem, bezDaru] }, SESSION, widok);
  assert.ok(tytulDaru?.includes('(dar)'),
    `tytuł grupy musi zaznaczać wariant z darem — jest: ${tytulDaru}`);
});
