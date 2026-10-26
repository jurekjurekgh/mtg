import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  commandOptionKey,
  hasMeaningfulDecisionOf,
  interruptMutesOnNewTargetCombination,
  muteGroupKeyOf,
  muteTargetCombinationOf,
} from '../src/table/session.js';

/**
 * M2 (zgłoszenie właściciela 2026-10-25, ślad „Revealing Wind"): klucze
 * wyciszenia (`commandOptionKey`) zawierają dokładny zestaw celów, więc
 * wyciszenie WZNOSIŁO SIĘ samo, gdy plansza wróciła do dawnego układu:
 * ja mam stwora X, przeciwnik Y — ptaszek; wchodzi Z (nowa kombinacja —
 * czar znów przerywa auto-pass, zamierzone); Z ginie — kombinacje X/Y
 * wracają i wyciszenie wznawia się bez decyzji gracza („czar nagle przestał
 * być oferowany"). Decyzja właściciela: nowa kombinacja celów TRWALE
 * przerywa wyciszenie tej akcji — sesja kasuje jej klucze, więc powrót do
 * dawnego układu NIE przywraca auto-passu.
 */

const castOn = (targetId, extra = {}) => ({
  type: 'cast_spell', objectId: 'revealing-wind-instance', targets: [targetId], ...extra,
});

const viewOf = (commands) => ({ status: 'active', legalCommands: commands });

const decisionWithMutes = (view, ignored) => hasMeaningfulDecisionOf(view, {
  isIgnored: (cmd) => ignored.has(commandOptionKey(cmd)),
});

test('M2: scenariusz właściciela X/Y → +Z → Z ginie — wyciszenie NIE wraca', () => {
  const ignored = new Set();
  const seen = new Map();

  // Okno 1: X vs Y. Sesja zapamiętuje migawkę; gracz wycisza grupę (wszystkie
  // warianty, jak przełącznik grupy w panelu).
  const firstWindow = viewOf([castOn('x'), castOn('y')]);
  interruptMutesOnNewTargetCombination(firstWindow, ignored, seen);
  for (const cmd of firstWindow.legalCommands) ignored.add(commandOptionKey(cmd));
  assert.equal(decisionWithMutes(firstWindow, ignored), false, 'wyciszone okno nie zatrzymuje auto-passu');

  // Okno 2: nowe stworzenie Z na stole. Nowa kombinacja TRWALE przerywa
  // wyciszenie (nie tylko chwilowo nie pasuje).
  const withZ = viewOf([castOn('x'), castOn('y'), castOn('z')]);
  interruptMutesOnNewTargetCombination(withZ, ignored, seen);
  assert.equal(ignored.size, 0, 'klucze grupy skasowane na trwale');
  assert.equal(decisionWithMutes(withZ, ignored), true, 'czar przerywa auto-pass przy nowych celach');

  // Okno 3: Z ginie — plansza wraca do X/Y. Dawne klucze NIE mogą znów pasować.
  const backToXY = viewOf([castOn('x'), castOn('y')]);
  interruptMutesOnNewTargetCombination(backToXY, ignored, seen);
  assert.equal(ignored.size, 0, 'powrót układu nie wskrzesza kluczy');
  assert.equal(decisionWithMutes(backToXY, ignored), true, 'auto-pass znów przestaje omijać czar');
});

test('M2: ta sama plansza wiele okien — wyciszenie trwa (brak nowej kombinacji)', () => {
  const ignored = new Set();
  const seen = new Map();
  const window_ = viewOf([castOn('x'), castOn('y')]);
  interruptMutesOnNewTargetCombination(window_, ignored, seen);
  for (const cmd of window_.legalCommands) ignored.add(commandOptionKey(cmd));
  for (let i = 0; i < 5; i += 1) interruptMutesOnNewTargetCombination(window_, ignored, seen);
  assert.equal(ignored.size, 2, 'stabilne kombinacje nie ruszają kluczy');
  assert.equal(decisionWithMutes(window_, ignored), false);
});

test('M2: ponowne wyciszenie po przerwaniu działa, czwarty cel przerywa znów', () => {
  const ignored = new Set();
  const seen = new Map();
  const w1 = viewOf([castOn('x'), castOn('y')]);
  interruptMutesOnNewTargetCombination(w1, ignored, seen);
  for (const cmd of w1.legalCommands) ignored.add(commandOptionKey(cmd));

  const w2 = viewOf([castOn('x'), castOn('y'), castOn('z')]);
  interruptMutesOnNewTargetCombination(w2, ignored, seen);
  assert.equal(ignored.size, 0);
  // Gracz świadomie wycisza w układzie z Z.
  for (const cmd of w2.legalCommands) ignored.add(commandOptionKey(cmd));
  interruptMutesOnNewTargetCombination(w2, ignored, seen);
  assert.equal(ignored.size, 3, 'świeże wyciszenie nie kasuje samego siebie');
  assert.equal(decisionWithMutes(w2, ignored), false);

  // Z ginie: wyciszenie układane w układzie z Z obowiązuje dalej (kombinacje
  // X/Y są podzbiorem tego, co gracz widział przy wyciszaniu).
  const w3 = viewOf([castOn('x'), castOn('y')]);
  interruptMutesOnNewTargetCombination(w3, ignored, seen);
  assert.equal(decisionWithMutes(w3, ignored), false, 'świeże wyciszenie przeżywa śmierć Z');

  // Ale CZWARTY, nowy stwór to kolejna nowa kombinacja → znów przerwanie.
  const w4 = viewOf([castOn('x'), castOn('y'), castOn('w')]);
  interruptMutesOnNewTargetCombination(w4, ignored, seen);
  assert.equal(ignored.size, 0, 'nowa kombinacja (W) kasuje klucze');
  assert.equal(decisionWithMutes(w4, ignored), true);
});

test('M2: przerwanie dotyczy tylko TEJ akcji — inne karty zostają wyciszone', () => {
  const ignored = new Set();
  const seen = new Map();
  const other = { type: 'cast_spell', objectId: 'inne-zaklecie', targets: ['x'] };
  const w1 = viewOf([castOn('x'), castOn('y'), other]);
  interruptMutesOnNewTargetCombination(w1, ignored, seen);
  for (const cmd of w1.legalCommands) ignored.add(commandOptionKey(cmd));

  const w2 = viewOf([castOn('x'), castOn('y'), castOn('z'), other]);
  interruptMutesOnNewTargetCombination(w2, ignored, seen);
  assert.ok(ignored.has(commandOptionKey(other)), 'obca grupa nietknięta');
  assert.equal([...ignored].some((k) => k.includes('revealing-wind-instance')), false);
});

test('M2: zmiana NIE-celowego wymiaru wariantu (X) nie przerywa', () => {
  const ignored = new Set();
  const seen = new Map();
  const w1 = viewOf([castOn('x', { xValue: 1 })]);
  interruptMutesOnNewTargetCombination(w1, ignored, seen);
  ignored.add(commandOptionKey(w1.legalCommands[0]));
  const w2 = viewOf([castOn('x', { xValue: 3 })]);
  interruptMutesOnNewTargetCombination(w2, ignored, seen);
  assert.equal(ignored.size, 1, 'grupa nie przerwana przez samo X');
  assert.equal(muteTargetCombinationOf(w1.legalCommands[0]), muteTargetCombinationOf(w2.legalCommands[0]));
});

test('M2: oferty bez objectId nie tworzą grupy (reguła ich nie rusza)', () => {
  const orphan = { type: 'declare_attackers', attackerIds: ['x'] };
  assert.equal(muteGroupKeyOf(orphan), null);
  const ignored = new Set([commandOptionKey(orphan)]);
  const seen = new Map();
  interruptMutesOnNewTargetCombination(viewOf([orphan]), ignored, seen);
  interruptMutesOnNewTargetCombination(viewOf([{ type: 'declare_attackers', attackerIds: ['x', 'z'] }]), ignored, seen);
  assert.equal(ignored.size, 1);
});

test('M2: grupa rozróżnia akcje po typ + objectId + abilityIndex', () => {
  assert.equal(muteGroupKeyOf({ type: 'cast_spell', objectId: 'a' }), 'cast_spell:a:');
  assert.equal(
    muteGroupKeyOf({ type: 'activate_ability', objectId: 'a', abilityIndex: 2 }),
    'activate_ability:a:2',
  );
  assert.notEqual(
    muteGroupKeyOf({ type: 'activate_ability', objectId: 'a', abilityIndex: 0 }),
    muteGroupKeyOf({ type: 'activate_ability', objectId: 'a', abilityIndex: 1 }),
  );
});
