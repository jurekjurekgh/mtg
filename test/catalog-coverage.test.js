// ADR 0019 — generyczne pokrycie katalogu: KAŻDA karta rejestru jest
// weryfikowana strukturalnie w jednym teście iterującym katalog. Dzięki
// temu nowe karty są pokryte AUTOMATYCZNIE — wzrost katalogu nie wymaga
// nowych plików testowych. Testy ręczne dotyczą wyłącznie nowych MECHANIK
// (ADR 0002), nie pojedynczych kart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { parseManaCost } from '../src/engine/mana-cost.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';

const REGISTRY = createCardRegistry();

/** Wszystkie karty z rejestru: realne (supported+limited) + wirtualne landy. */
const allCards = REGISTRY.all();
const supported = REGISTRY.supported();

test('katalog ma zdrowy rozmiar (supported rośnie z batchami)', () => {
  assert.ok(supported.length >= 70, `supported: ${supported.length}`);
});

test('KAŻDA karta katalogu przechodzi walidację danych i materializację (ADR 0019)', () => {
  const failures = [];
  for (const card of allCards) {
    try {
      const data = gameObjectDataOf(card);
      // Tożsamość i podstawy.
      assert.ok(card.id, 'id');
      assert.ok(card.name, `nazwa dla ${card.id}`);
      assert.ok(Number.isInteger(card.manaCost ?? data.manaCost) && (card.manaCost ?? data.manaCost) >= 0,
        `manaCost całkowite >= 0 (${card.id})`);
      assert.ok(Array.isArray(card.types ?? data.types), `types (${card.id})`);
      // Kolor: stringi z puli MtG.
      for (const color of data.colors ?? []) {
        assert.ok(['W', 'U', 'B', 'R', 'G', 'C'].includes(color), `kolor ${color} (${card.id})`);
      }
      // Spójność kind↔types↔statystyki. Tokeny materializują się parametrami
      // z efektu create_token — deskryptor P/T w definicji jest informacyjny.
      const types = (card.types ?? []).map((t) => String(t).toLowerCase());
      if ((data.kind === 'creature' || types.includes('creature')) && !types.includes('token')) {
        assert.ok(Number.isInteger(data.power) && Number.isInteger(data.toughness),
          `stwór musi mieć P/T (${card.id})`);
      }
      if (data.kind === 'land' || types.includes('land')) {
        assert.ok(data.spell == null, `land nie może mieć deskryptora czaru (${card.id})`);
      }
      // Koszt many: deskryptor musi się parsować, gdy istnieje.
      const costStr = MANA_COSTS[card.id] ?? (card.manaCost != null ? String(card.manaCost) : null);
      if (costStr != null && !/^\d+$/.test(costStr)) {
        assert.ok(parseManaCost(costStr) != null, `koszt many nieparsowalny (${card.id}): ${costStr}`);
      }
      // Sprzęt i aury mają kompletne deskryptory załączników.
      if (card.equipment) {
        assert.ok(Number.isInteger(card.equipment.equip) && card.equipment.equip >= 0,
          `equip >= 0 (${card.id})`);
      }
      if (card.aura) {
        assert.ok(card.aura.keywords || card.aura.pump || card.aura.losesKeywords,
          `aura ma opis wpływu na gospodarza (${card.id})`);
      }
    } catch (err) {
      failures.push(`${card.id}: ${err.message}`);
    }
  }
  assert.deepEqual(failures, [], `karty z błędami danych: ${failures.length}`);
});

test('KAŻDY czar z deskryptorem ma legalny typ (Instant/Sorcery)', () => {
  const bad = [];
  for (const card of allCards) {
    if (!card.spell) continue;
    const types = (card.types ?? []).map((t) => String(t).toLowerCase());
    if (!types.includes('instant') && !types.includes('sorcery')) {
      bad.push(`${card.id}: ${types.join('/')}`);
    }
  }
  assert.deepEqual(bad, [], 'czary bez typu Instant/Sorcery');
});

test('KAŻDA zdolność karty ma typ z ABILITY_TYPE (activated/triggered/static)', () => {
  const bad = [];
  for (const card of allCards) {
    for (const ability of card.abilities ?? []) {
      if (!['activated', 'triggered', 'static'].includes(ability.type)) {
        bad.push(`${card.id}: ${ability.type}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
