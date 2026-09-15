// AUDYT ŻYWYM TESTEREM (PR #121, 2026-09-15) — partie dominaria-wu (seedy 921+):
// Static Net/Koilos Roc tworzą tokeny Powerstone, ale panel pokazywał
// „Aktywuj: Powerstone (Ty) — " — bez kosztu i bez opisu zdolności, a kafel
// tokenu nie miał ŻADNEGO tekstu reguł. Gracz nie widział ani tego, co klik,
// ani (kluczowe dla F2) restrykcji „mana tylko na rzut czaru artefaktu" —
// czyli nie mógł zrozumieć, czemu kreator many odmawia tej many przy czarze
// nieartefaktowym.
//
// Root cause (klasa L31/L41): `commandLabel` czyta zdolności z REJESTRU
// (`session.abilitiesOf(cardId)`), a konwencją katalogu jest duplikowanie
// `abilities` tokenu we wpisie (8 z 11 tokenów z deskryptorowymi zdolnościami
// je ma). token_powerstone / token_wizard / token_bird_chocobo wpisy miały
// puste `abilities` — etykieta spadała do gołego „Aktywuj: <nazwa> — ".
// Dodatkowo `manaEffectLabel` pomijało `spendOnly` — restrykcja CR 106.3
// była niewidoczna w każdym opisie zdolności manowej.
//
// Strażnik (jak M202/K): każdy `create_token` niosący `abilities` musi mieć
// IDENTYCZNE zdolności we wpisie katalogu — dryf jednego miejsca czerwieni
// od razu (L41: dwie kopie jednej reguły wymagają testu spójności).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { manaEffectLabel } from '../src/table/session.js';
import { createAbility } from '../src/engine/abilities.js';

const REGISTRY = createCardRegistry();

/** Kanoniczny zapis obiektu (posortowane klucze) — do porównania zdolności. */
function canon(value) {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => [k, canon(v)]));
  }
  return value;
}

/** Wszystkie efekty `create_token` z zagnieżdżonych struktur katalogu. */
function collectCreateTokens(node, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) { for (const e of node) collectCreateTokens(e, found); return found; }
  if (node.type === 'create_token' && typeof node.cardId === 'string') found.push(node);
  for (const v of Object.values(node)) if (v && typeof v === 'object') collectCreateTokens(v, found);
  return found;
}

test('TOKENY (strażnik): `create_token` z abilities == abilities wpisu w katalogu', () => {
  const drift = [];
  for (const card of REGISTRY.all()) {
    for (const eff of collectCreateTokens(card)) {
      if (!eff.abilities?.length) continue; // tokeny bez zdolności w deskryptorze — M202/K i tak pilnuje wpisu
      const entry = REGISTRY.get(eff.cardId);
      const entryAbilities = entry?.abilities ?? [];
      assert.ok(entry,
        `token ${eff.cardId} (twórca: ${card.name}) bez wpisu w katalogu`);
      // Obie strony normalizowane przez createAbility — wpisy katalogu bywają
      // pisane minimalnie ({type, trigger, effect}), a createAbility uzupełnia
      // domyślne pola; porównujemy SEMANTYKĘ, nie styl zapisu.
      assert.equal(
        JSON.stringify(eff.abilities.map((a) => canon(createAbility(a)))),
        JSON.stringify(entryAbilities.map((a) => canon(createAbility(a)))),
        `token ${eff.cardId} (twórca: ${card.name}): zdolności w deskryptorze i we wpisie `
        + 'katalogu się różnią — etykieta panelu/kafla czytają REJESTR (session.abilitiesOf), '
        + 'więc rozjazd = pusty opis zdolności na stole',
      );
    }
  }
  assert.deepEqual(drift, []);
});

test('TOKENY: wpis token_powerstone ma zdolność manową z restrykcją spendOnly (F2)', () => {
  const entry = REGISTRY.get('token_powerstone');
  assert.ok(entry, 'token_powerstone w katalogu');
  const activated = (entry.abilities ?? []).find((a) => a?.type === 'activated');
  assert.ok(activated, 'zdolność aktywowana we wpisie token_powerstone');
  assert.deepEqual(activated.cost, { tap: true });
  assert.equal(activated.effect?.type, 'add_mana');
  assert.equal(activated.effect?.spendOnly, 'artifact', 'restrykcja CR 106.3 w danych zdolności');
});

test('ETYKIETA MANY: spendOnly=artifact dopowiada restrykcję (CR 106.3)', () => {
  assert.equal(
    manaEffectLabel({ type: 'add_mana', amount: 1, colors: [], spendOnly: 'artifact' }),
    'dodaj 1 manę bezbarwną (tylko na rzut czaru artefaktu)',
  );
  assert.equal(
    manaEffectLabel({ type: 'add_mana', amount: 2, colors: [], spendOnly: 'artifact' }),
    'dodaj 2 many bezbarwne (tylko na rzut czaru artefaktu)',
  );
  // Bez restrykcji — etykiety bez zmian (anty-over-fix, pin B5/M193).
  assert.equal(manaEffectLabel({ amount: 1, colors: [] }), 'dodaj 1 manę bezbarwną');
  assert.equal(manaEffectLabel({ amount: 1, colors: ['U', 'B'] }), 'dodaj 1 manę niebieską lub czarną');
  assert.equal(manaEffectLabel({ amount: 1, colors: ['W', 'U', 'B', 'R', 'G'] }), 'dodaj 1 manę dowolnego koloru');
});
