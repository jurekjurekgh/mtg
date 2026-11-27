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
