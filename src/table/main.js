/**
 * Punkt wejścia standalone Wirtualnego Stołu.
 *
 * Na tym etapie sprawdza wyłącznie, czy łańcuch dystrybucji działa end-to-end:
 * moduły -> build -> jeden plik HTML -> przeglądarka (także z file:// na iOS).
 * Logika gry pojawi się w Etapie 1.
 */

import { shuffle } from '../engine/shuffle.js';
import { createRng } from '../engine/rng.js';

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
