// Audyt PR #148 (sesja 2026-10-01b), obserwacja O-a — domknięcie:
// `attackerNeutralizedByProtection` (bot) liczyła „lethal" blokera z GOŁEJ
// wytrzymałości, bez odejmowania już oznaczonych obrażeń. Dla trample'a
// (CR 702.19b) to zaniża nadmiar: bloker chroniony z 1 obrażeniem na sobie
// ma wytrzymałość efektywną 1 (CR 510.1c), więc nawet 2/2 z trample przebija
// ochronę i wpuszcza 1 obrażenie w gracza — a bot uznawał atak za jałowy.
//
// Miara jest ta sama co w `blockAbsorbedDamageOf` (L41: jedno miejsce prawdy
// dla „lethal", deathtouch = 1): `max(0, toughness − damage)`, z deathtouch
// `min(1, …)`. Kotwice: bloker BEZ obrażeń nadal neutralizuje atak (ochrona
// zapobiega wszystkim obrażeniom od atakującego), a przy deathtouch nadmiar
// pojawia się dopiero, gdy moc przekracza 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackerNeutralizedByProtection } from '../src/controllers/heuristic-bot.js';

/** Kształt z PlayerView: kolory atakującego + `protection` (qualities) blokera. */
const atakujacy = (power, keywords = []) => ({ power, toughness: power, colors: ['Black'], keywords });
const bloker = (toughness, damage = 0) => ({
  toughness, damage, power: 2, tapped: false, cantBlock: false, protection: ['Black'], keywords: [],
});

test('O-a/1: trample 2/2 vs chroniony 2/2 z 1 obrażeniem — atak NIE jest jałowy (przebija 1)', () => {
  assert.equal(
    attackerNeutralizedByProtection(atakujacy(2, ['trample']), [bloker(2, 1)]),
    false,
    'wytrzymałość efektywna 1 < moc 2 → nadmiar wchodzi w gracza (CR 702.19b + 510.1c)',
  );
});

test('O-a/2 (kotwica): ten sam bloker BEZ obrażeń neutralizuje atak', () => {
  assert.equal(
    attackerNeutralizedByProtection(atakujacy(2, ['trample']), [bloker(2, 0)]),
    true,
    'ochrona zapobiega całym 2 obrażeniom — atak jałowy (CR 702.16e)',
  );
});

test('O-a/3: bez trample ochrona neutralizuje niezależnie od obrażeń na blokerze', () => {
  assert.equal(
    attackerNeutralizedByProtection(atakujacy(5), [bloker(2, 1)]),
    true,
    'bez trample nadmiar nie idzie w gracza (CR 509.1h)',
  );
});

test('O-a/4: deathtouch liczy się tą samą miarą (min(1, wytrzymałość efektywna))', () => {
  // Bloker 3/3 z 2 obrażeniami: wytrzymałość efektywna 1.
  assert.equal(attackerNeutralizedByProtection(atakujacy(1, ['trample', 'deathtouch']), [bloker(3, 2)]), true,
    'moc 1 = lethal (1) → całość zapobiegana przez ochronę');
  assert.equal(attackerNeutralizedByProtection(atakujacy(2, ['trample', 'deathtouch']), [bloker(3, 2)]), false,
    'moc 2 > lethal 1 → 1 obrażenie przebija ochronę');
});
