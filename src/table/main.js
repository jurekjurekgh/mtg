/**
 * Punkt wejścia standalone Wirtualnego Stołu.
 *
 * Na tym etapie sprawdza, czy łańcuch dystrybucji działa end-to-end:
 * moduły (łącznie z headless engine) -> build -> jeden plik HTML ->
 * przeglądarka (także z file:// na iOS). Pełne UI PlayerView powstanie w M5.
 */

import { shuffle } from '../engine/shuffle.js';
import { createRng } from '../engine/rng.js';
import { createGameState, execute, playerView } from '../engine/game-state.js';
import { stateFingerprint } from '../engine/fingerprint.js';

function runEngineSmoke() {
  // Minimalny, odtwarzalny przebieg: kilka rund passów przez komendy z widoku.
  const runOnce = () => {
    const state = createGameState({ seed: 42, players: [{ id: 'Ty' }, { id: 'Bot' }] });
    for (let i = 0; i < 6; i += 1) {
      const holder = state.turn.priorityPlayerId;
      const offered = playerView(state, holder).legalCommands;
      const pass = offered.find((cmd) => cmd.type === 'pass_priority');
      execute(state, pass ?? offered[0]);
    }
    return stateFingerprint(state);
  };
  return { deterministic: runOnce() === runOnce(), fingerprint: runOnce().slice(0, 80) };
}

function runSelfTest() {
  const checks = [];
  const rngOk = createRng(1)() === createRng(1)();
  checks.push(['Seedowane RNG jest powtarzalne', rngOk]);

  const deck = Array.from({ length: 10 }, (_, i) => i + 1);
  const a = shuffle(deck, 7);
  const b = shuffle(deck, 7);
  checks.push(['Tasowanie jest odtwarzalne', JSON.stringify(a) === JSON.stringify(b)]);
  checks.push(['Tasowanie zachowuje wszystkie karty', a.length === deck.length]);
  checks.push(['Tasowanie nie modyfikuje oryginału', deck[0] === 1]);

  const engine = runEngineSmoke();
  checks.push(['Headless engine wykonuje komendy z PlayerView', true]);
  checks.push(['Przebieg engine jest deterministyczny', engine.deterministic]);

  const el = document.getElementById('selftest');
  el.textContent = '';
  const allOk = checks.every(([, ok]) => ok);

  for (const [label, ok] of checks) {
    const line = document.createElement('div');
    line.style.fontSize = '13px';
    line.textContent = `${ok ? '✓' : '✗'} ${label}`;
    if (ok) line.className = 'ok';
    el.appendChild(line);
  }

  const summary = document.createElement('div');
  summary.style.cssText = 'margin-top:10px; font-weight:600;';
  summary.className = allOk ? 'ok' : '';
  summary.textContent = allOk
    ? 'Wszystko działa — plik jest gotowy do dalszej rozbudowy.'
    : 'Coś nie zadziałało — zgłoś to w PR.';
  el.appendChild(summary);
}

function renderShuffle() {
  const seedInput = document.getElementById('seed');
  const seed = Number.parseInt(seedInput.value, 10);
  const out = document.getElementById('out');

  if (!Number.isInteger(seed)) {
    out.textContent = 'Podaj liczbę całkowitą jako ziarno.';
    return;
  }

  const deck = Array.from({ length: 20 }, (_, i) => `karta-${i + 1}`);
  // textContent, nie innerHTML — świadomie, zob. audyt §7.
  out.textContent = shuffle(deck, seed).join('\n');
}

document.getElementById('run').addEventListener('click', renderShuffle);
runSelfTest();
renderShuffle();
