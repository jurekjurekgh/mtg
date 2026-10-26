/**
 * Uwaga X z gry (2026-10-26) — Holdout Settlement + Warden of Geometries.
 *
 * Zgłoszenie właściciela: „Mam na stole nietapnięty Island, Holdout Settlement
 * i Warden of Geometries, reszta lądów tapnięta. Czyli mogę stworzyć 3 many.
 * Mimo to mam w Twoje działania ofertę na Mysteries of the Deep. Klikanie w tę
 * ofertę nic nie powoduje, nie znika, ale też nic się nie dzieje. Ale jak
 * tapnąłem Holdout Settlement to oferta na Mysteries of the Deep zniknęła.”
 *
 * Zmierzona przyczyna (nie w Holdout, tylko w MIERZE oferty — L48 „oferta =
 * płatność”): `manualManaOfferUnits` liczyła KAŻDY wpis `legalManaAbilities`
 * jako osobną manę. Holdout #1 („{T}, Tap an untapped creature you control:
 * Add one mana of any color”) ma wpis na KAŻDEGO kandydata do tapnięcia, a do
 * tego nie odejmowała produkcji tapowanego stwora — dwóch kandydatów
 * (Warden 1 many + drugi stwór) dawało 2 phantom-jednostki, więc 3 many
 * realne + 2 fantomy = 5 ≥ koszt Mysteries of the Deep. Wykonawca płatności
 * (spendMana) fantomów nie znał → `illegal_spell: Niewystarczająca mana`,
 * czyli martwy przycisk. Po tapnięciu Holdoutu zdolność znikała, więc i oferta.
 *
 * Piny:
 *   X/1 — dokładna sytuacja ze zgłoszenia: BEZ oferty rzutu (RED przed fixem);
 *   X/2 — jednostki netto per klasa źródła (Warden = 0, vanilla = 0 jako
 *         różnica względem lądu, Eldrazi Scion = 1);
 *   X/3 — anty-over-fix: gdy many realnie wystarcza, oferta JEST i rzut
 *         się UDAJE (oferta = płatność w drugą stronę);
 *   X/4 — brak zwielokrotnienia przez liczbę kandydatów do tapnięcia.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { manualManaOfferUnits, ownManaProductionOf } from '../src/engine/abilities.js';
import { producibleMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, zone, { tapped = false } = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: HUMAN_ID, ownerId: HUMAN_ID, zone,
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  if (tapped) state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped: true }));
}

/** Sesja człowiek–bot; rękę i stół budujemy wprost (człowiek nie ma jeszcze tur). */
function session() {
  const decks = new Map([
    [HUMAN_ID, [...Array(20).fill('basic-island')]],
    [BOT_ID, Array(40).fill('basic-swamp')],
  ]);
  const s = createSession({ seed: 7, registry: REGISTRY, decks });
  const keep = s.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice');
  if (keep) assert.ok(s.apply(keep).ok, 'keep ręki startowej');
  return s;
}

/** Stół ze zgłoszenia: 1 Island + Holdout + Warden + drugi stwór, 2 lądy tapnięte. */
function boardFromReport(extra = {}) {
  const s = session();
  put(s.state, 'isl', 'basic-island', 'battlefield');
  put(s.state, 'hold', 'holdout-settlement', 'battlefield');
  put(s.state, 'ward', 'warden-of-geometries', 'battlefield');
  put(s.state, 'piker', 'goblin-piker', 'battlefield');
  put(s.state, 'tap1', 'basic-island', 'battlefield', { tapped: true });
  put(s.state, 'tap2', 'basic-island', 'battlefield', { tapped: true });
  for (const id of extra.islands ?? []) put(s.state, id, 'basic-island', 'battlefield');
  put(s.state, 'spell', 'mysteries-of-the-deep', 'hand');
  return s;
}

const castOffers = (s) => s.view().legalCommands.filter((c) => c.objectId === 'spell');

test('X/1: 3 realne many nie dają oferty czaru za 5 (martwy przycisk ze zgłoszenia)', () => {
  const s = boardFromReport();
  // Realna mana: Island 1 + Holdout 1 (albo Holdout tapujący stwora — wciąż 1
  // z tego permanentu) + Warden 1 = 3. Mysteries of the Deep kosztuje 5.
  assert.equal(producibleMana(s.state, HUMAN_ID, null, {}, []), 3, 'baza producibleMana liczy 3 źródła');
  assert.equal(manualManaOfferUnits(s.state, HUMAN_ID).amount, 0,
    'Holdout nie dokłada manyponad własną produkcję (przed fixem: 2 fantomy — po jednym na kandydata)');
  assert.equal(castOffers(s).length, 0,
    'brak oferty rzutu: przed naprawą oferta była i kończyła się illegal_spell');
});

test('X/2: jednostki netto — tapowany stwór oddaje swoją produkcję', () => {
  const s = boardFromReport();
  // Warden sam daje {C}; Holdout tapujący Wardena nie produkuje NIC nowego.
  assert.equal(ownManaProductionOf(s.state, HUMAN_ID, 'ward'), 1, 'Warden sam = 1 mana');
  // Drugi stwór bez zdolności many — tapowanie go nie kosztuje many...
  assert.equal(ownManaProductionOf(s.state, HUMAN_ID, 'piker'), 0, 'vanilla stwór = 0 many');
  // ...ale Holdout JEST lądem, więc `producibleMana` już policzyło jego 1 —
  // ręczna zdolność to tylko różnica, nie druga jednostka.
  const units = manualManaOfferUnits(s.state, HUMAN_ID);
  assert.equal(units.amount, 0, 'żadnej nadwyżki ponad bazę producibleMana');
  // Klasa, która MUSI nadal działać (anty-over-fix): poświęcenie Eldrazi Sciona
  // daje manę, której `producibleMana` nie liczy (koszt = poświęcenie).
  put(s.state, 'scion', 'token_eldrazi_scion', 'battlefield');
  assert.equal(ownManaProductionOf(s.state, HUMAN_ID, 'scion'), 0, 'Scion nie jest źródłem czystej many');
  assert.equal(manualManaOfferUnits(s.state, HUMAN_ID).amount, 1, 'Scion dokłada 1 jednostkę netto');
});

test('X/3: gdy many realnie wystarcza, oferta jest i rzut się udaje (oferta = płatność)', () => {
  const s = boardFromReport({ islands: ['isl2', 'isl3', 'isl4'] });
  // 4 Islandy + Holdout + Warden = 6 źródeł; koszt 5 → rzut musi być oferowany
  // i wykonalny. To pin w DRUGĄ stronę: fix nie może wyciąć legalnych ofert.
  const offers = castOffers(s);
  assert.equal(offers.length, 1, `oferta rzutu jest (${offers.length})`);
  const result = s.apply(offers[0]);
  assert.equal(result.ok, true, `rzut przyjęty: ${result.reason ?? 'ok'}`);
});

test('X/5: źródło NIElandowe — tapowany stwór oddaje swoją produkcję', () => {
  // Ten sam błąd poza lądami: Dragonbroods' Relic („{T}, Tap an untapped
  // creature you control: Add one mana of any color”). Jedyny kandydat to
  // Warden, który sam daje {C} — para daje 1 manę, nie 2.
  const s = session();
  put(s.state, 'relic', 'dragonbroods-relic', 'battlefield');
  put(s.state, 'ward', 'warden-of-geometries', 'battlefield');
  assert.equal(producibleMana(s.state, HUMAN_ID, null, {}, []), 1, 'baza: Warden daje {C}');
  assert.equal(manualManaOfferUnits(s.state, HUMAN_ID).amount, 0,
    'Relic tapujący Wardena nie dokłada many (przed fixem: 1 fantom)');
  put(s.state, 'piker', 'goblin-piker', 'battlefield');
  assert.equal(manualManaOfferUnits(s.state, HUMAN_ID).amount, 1,
    'kandydat bez zdolności many → Relic daje realną jednostkę (anty-over-fix)');
});

test('X/4: liczba kandydatów do tapnięcia nie mnoży many', () => {
  const one = boardFromReport();
  const two = boardFromReport();
  put(two.state, 'piker2', 'goblin-piker', 'battlefield');
  put(two.state, 'piker3', 'goblin-piker', 'battlefield');
  assert.equal(manualManaOfferUnits(one.state, HUMAN_ID).amount, 0);
  assert.equal(manualManaOfferUnits(two.state, HUMAN_ID).amount, 0,
    'dwaj dodatkowi kandydaci nie tworzą fantomowej many (przed fixem: 1 za każdego)');
});
