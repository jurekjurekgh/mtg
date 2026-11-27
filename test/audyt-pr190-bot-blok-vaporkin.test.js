import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stan, decyzja } from '../tools/pmssb92-batch75-sonda.mjs';
import { declareAttackers, blockerDeclarationViolation } from '../src/engine/combat.js';
import { attackerCanBeBlocked } from '../src/controllers/heuristic-bot.js';

function scene(attacker, blocker) {
  return stan({ krok: 'declare_attackers', pole: [
    { id: 'attacker', karta: attacker, gracz: 'p1' },
    { id: 'blocker', karta: blocker, gracz: 'p2' },
  ] });
}
function facts(s) {
  const d = decyzja(s);
  const attacker = d.view.zones.battlefield.find(o => o.id === 'attacker');
  const blocker = d.view.zones.battlefield.find(o => o.id === 'blocker');
  declareAttackers(s, 'p1', ['attacker']);
  return { ...d, botCanBlock: attackerCanBeBlocked(attacker, [blocker]),
    engineCanBlock: blockerDeclarationViolation(s, 'p2', { attacker: ['blocker'] }) === null };
}

test('Vaporkin nie blokuje naziemnego Soulmendera — bot i silnik zgodni', () => {
  const m = facts(scene('soulmender', 'vaporkin'));
  assert.equal(m.engineCanBlock, false);
  assert.equal(m.botCanBlock, false, 'bot nie może liczyć Vaporkina jak zwykłego blokera');
});

test('Kontrole: Vaporkin blokuje lotnika, a zwykły bloker blokuje Soulmendera', () => {
  const flyer = facts(scene('nefarious-imp', 'vaporkin'));
  assert.equal(flyer.engineCanBlock, true);
  assert.equal(flyer.botCanBlock, true);
  const ground = facts(scene('soulmender', 'highland-game'));
  assert.equal(ground.engineCanBlock, true);
  assert.equal(ground.botCanBlock, true);
});

test('Decyzja ataku: Soulmender atakuje, gdy jedyny bloker to Vaporkin', () => {
  const m = decyzja(scene('soulmender', 'vaporkin'));
  const attack = m.opcje.find(o => o.cmd === 'attack[attacker]');
  const wait = m.opcje.find(o => o.cmd === 'attack[]');
  assert.ok(attack && wait && attack.score > wait.score, `ataki: ${JSON.stringify(m.opcje)}`);
  assert.deepEqual(m.cmd.attackerIds, ['attacker']);
});

test('Mieszana obrona: Vaporkin nie dokłada obrażeń do bloku naziemnego Soulmendera przez ścianę', () => {
  const state = stan({ krok: 'declare_attackers', pole: [
    { id: 'attacker', karta: 'soulmender', gracz: 'p1' },
    { id: 'wall', karta: 'mnemonic-wall', gracz: 'p2' },
    { id: 'vap', karta: 'vaporkin', gracz: 'p2' },
  ] });
  const m = decyzja(state);
  declareAttackers(state, 'p1', ['attacker']);
  assert.equal(blockerDeclarationViolation(state, 'p2', { attacker: ['wall'] }), null);
  assert.notEqual(blockerDeclarationViolation(state, 'p2', { attacker: ['vap'] }), null);
  const attack = m.opcje.find(o => o.cmd === 'attack[attacker]');
  assert.equal(attack?.score, -2, '0/4 zatrzymuje bez zabicia 1/1; Vaporkin nie może pomóc w bloku');
});

test('Dwa ataki naziemne: Vaporkin nie jest drugim slotem blokowania obok ściany', () => {
  function measure(secondBlocker) {
    const s = stan({ krok: 'declare_attackers', pole: [
      { id: 'a1', karta: 'highland-game', gracz: 'p1' },
      { id: 'a2', karta: 'soulmender', gracz: 'p1' },
      { id: 'wall', karta: 'mnemonic-wall', gracz: 'p2' },
      ...(secondBlocker ? [{ id: 'b2', karta: secondBlocker, gracz: 'p2' }] : []),
    ] });
    const m = decyzja(s);
    return m.opcje.find(o => o.cmd === 'attack[a1,a2]')?.score;
  }
  assert.equal(measure(null), 2, 'jedna ściana zatrzyma tylko jednego atakującego');
  assert.equal(measure('vaporkin'), 2, 'Vaporkin nie blokuje żadnego z naziemnych atakujących');
  assert.ok(measure('highland-game') < 2, 'drugi zwykły bloker może zatrzymać drugiego atakującego');
});

test('Dopasowanie bloków: ściana musi ustąpić naziemnemu, a Vaporkin lotnikowi', () => {
  for (const reverse of [false, true]) {
    const blockers = [
      { id: 'wall', karta: 'mnemonic-wall', gracz: 'p2' },
      { id: 'vap', karta: 'vaporkin', gracz: 'p2' },
    ];
    if (reverse) blockers.reverse();
    const m = decyzja(stan({ krok: 'declare_attackers', pole: [
      { id: 'f', karta: 'dementia-bat', gracz: 'p1' },
      { id: 'g', karta: 'soulmender', gracz: 'p1' },
      ...blockers,
    ] }));
    assert.equal(m.opcje.find(o => o.cmd === 'attack[f,g]')?.score, -12,
      'oba ataki mają blokera niezależnie od kolejności na stole');
  }
});
