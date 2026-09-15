// =============================================================================
// Audyt PR #120 (2026-09-15, sesja arena/01a0a505-mtg) — F2: kreator many
// odcinał manę ograniczoną (Powerstone, `spendOnly:'artifact'`) od WSZYSTKICH
// komend spoza rzutu czaru artefaktu — także od `activate_ability`.
//
// Reguła (ADR 0030, weryfikacja 2026-09-15): Oracle tokena Powerstone (BRO T7,
// api.scryfall.com): „{T}: Add {C}. This mana can't be spent to cast a
// nonartifact spell." — ograniczenie dotyczy WYŁĄCZNIE rzutu czaru
// nie-artefaktowego. Silnik koduje to w `restrictedManaBlocked(purpose)` =
// `castingSpell && artifactSpell !== true` (resources.js) — płatność za
// zdolność MOŻE zużyć manę ograniczoną. Kreator musi czytać ten sam kontrakt
// (L48: oferta/walidacja/podpowiedź — jeden filtr), inaczej odmawia opcji,
// którą silnik przyjmie (F2).
//
// Test wyjmuje `manaWizardFor` z main.js przez vm (konwencja M348) i pinuje
// WIDOCZNOŚĆ źródła spendOnly oraz skład puli per cel płatności.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { expandManaPool } from '../src/engine/resources.js';

const source = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
function localFunction(name) {
  const from = source.indexOf(`  function ${name}(`);
  assert.notEqual(from, -1, `${name} w main.js`);
  const end = source.indexOf('\n  }', from);
  assert.ok(end > from);
  return source.slice(from, end + '\n  }'.length);
}

/** Uruchamia manaWizardFor w vm z pełnym zestawem stubów (patrz nagłówek). */
function manaWizardForZwykany({ cmd, cardTypes, restrictedPoolUnits }) {
  const captured = {};
  const session = {
    view: () => ({ legalCommands: [] }),
    state: {
      objects: new Map([['karta', { cardId: 'karta' }]]),
      players: [{
        id: 'p1', mana: 4,
        manaPool: { '': 2 },
        restrictedPool: restrictedPoolUnits ?? { '': 2 },
      }],
    },
  };
  const ctx = createContext({
    session,
    HUMAN_ID: 'p1',
    MANA_COSTS: {},
    parseManaCost: () => null,
    effectiveSpellManaCost: () => { throw new Error('nie powinno być wołane'); },
    reduceAlternativeCost: () => { throw new Error('nie powinno być wołane'); },
    paymentDescriptorOf: () => ({ cardId: 'karta', totalNeeded: 4, requirements: [] }),
    expandManaPool,
    manaSourcesForPlayer: () => ([
      { id: 'pw', cardId: 'token_powerstone', spendOnly: 'artifact' },
      { id: 'wyspa', cardId: 'basic-island' },
    ]),
    selfTapExclusionFor: () => null,
    shouldOpenManaWizard: (args) => { captured.args = args; return true; },
    registry: { get: () => ({ types: cardTypes }) },
  });
  const fn = runInContext(`${localFunction('restrictedSpellBlockedFor')}\n${localFunction('manaWizardFor')}\nmanaWizardFor;`, ctx);
  const result = fn(cmd);
  return { result, captured };
}

test('F2 (kontrakt silnika): rzut czaru NIE-artefaktowego — Powerstone niewidoczny, pula bez restricted', () => {
  const { captured } = manaWizardForZwykany({ cmd: { type: 'cast_spell', objectId: 'karta', playerId: 'p1' }, cardTypes: ['Creature'] });
  assert.ok(captured.args, 'shouldOpenManaWizard wywołany');
  assert.equal(captured.args.sources.some((s) => s.id === 'pw'), false, 'mana ograniczona nie podpada pod rzut nie-artefaktu');
  assert.equal(captured.args.sources.some((s) => s.id === 'wyspa'), true, 'zwykłe źródła zostają');
  assert.equal(captured.args.poolUnits.length, 2, 'pula bez jednostek restricted');
  assert.equal(captured.args.poolMana, 2);
});

test('F2: rzut czaru ARTEFAKTU — Powerstone widoczny, pula z restricted (D z PR #120 zostaje)', () => {
  const { captured } = manaWizardForZwykany({ cmd: { type: 'cast_permanent', objectId: 'karta', playerId: 'p1' }, cardTypes: ['Artifact'] });
  assert.ok(captured.args, 'shouldOpenManaWizard wywołany');
  assert.equal(captured.args.sources.some((s) => s.id === 'pw'), true, 'ograniczenie pozwala na rzut artefaktu');
  assert.equal(captured.args.poolUnits.length, 4, 'pula wolna + restricted');
  assert.equal(captured.args.poolMana, 4);
});

test('F2 (naprawa): płatność za AKTYWACJĘ ZDOLNOŚCI — Powerstone widoczny (Oracle: ograniczenie dotyczy tylko rzutu czaru)', () => {
  const { captured } = manaWizardForZwykany({ cmd: { type: 'activate_ability', objectId: 'karta', playerId: 'p1' }, cardTypes: ['Creature'] });
  assert.ok(captured.args, 'shouldOpenManaWizard wywołany');
  assert.equal(captured.args.sources.some((s) => s.id === 'pw'), true, 'silnik (restrictedManaBlocked) pozwala opłacić zdolność maną Powerstone — kreator nie może jej ukrywać (L48)');
  assert.equal(captured.args.poolUnits.length, 4, 'pula z jednostkami restricted');
});
