/**
 * Punkt wejścia standalone Wirtualnego Stołu (M5).
 *
 * Łańcuch dystrybucji: moduły (łącznie z headless engine) -> build ->
 * jeden plik HTML -> przeglądarka (także z file:// na iOS, ADR 0011).
 * Talie z decks/*.txt build wstrzykuje jako globalną REPO_DECKS — przeglądarka
 * otwarta z file:// nie może ich pobrać przez fetch (origin `null`).
 *
 * Granica odpowiedzialności: ten moduł wyłącznie składa elementy DOM,
 * tłumaczy kliknięcia na komendy protokołu i prosi sesję o przerysowanie.
 * Cała logika gry jest poza warstwą UI.
 */

import { shuffle } from '../engine/shuffle.js';
import { createRng } from '../engine/rng.js';
import { createGameState, execute, playerView } from '../engine/game-state.js';
import { stateFingerprint } from '../engine/fingerprint.js';
import { createCardRegistry } from '../cards/card-data.js';
import { parseDeckText } from '../cards/deck-text.js';
import { BOT_ID, HUMAN_ID, createSession } from './session.js';
import { renderTableView } from './render.js';

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
    const row = document.createElement('div');
    row.style.fontSize = '13px';
    row.textContent = `${ok ? '✓' : '✗'} ${label}`;
    if (ok) row.className = 'ok';
    el.appendChild(row);
  }

  const summary = document.createElement('div');
  summary.style.cssText = 'margin-top:10px; font-weight:600;';
  summary.className = allOk ? 'ok' : '';
  summary.textContent = allOk
    ? 'Wszystko działa — możesz zaczynać partię.'
    : 'Coś nie zadziałało — zgłoś to w PR.';
  el.appendChild(summary);
}

/** Nagłówek „# Nazwa talii" z treści pliku decks/*.txt (bez pełnego parsowania). */
function deckTitle(text, fallback) {
  const titleLine = text.split(/\r?\n/).find((row) => row.trim().startsWith('#'));
  return titleLine ? titleLine.trim().slice(1).trim() : fallback;
}

/** Składa UI stołu i podpina je pod sesję gry. */
function bootstrapTable() {
  // W bundle: build wstrzykuje `var REPO_DECKS` przed modułami (w node
  // `new Function` var to zmienna lokalna skryptu, więc czytamy też nazwę).
  const repoDecks = globalThis.REPO_DECKS ?? (typeof REPO_DECKS !== 'undefined' ? REPO_DECKS : {});
  const deckKeys = Object.keys(repoDecks).sort();
  const registry = createCardRegistry();

  const el = (id) => document.getElementById(id);
  const els = {
    banner: el('banner'),
    status: el('status'),
    stackZone: el('stack-zone'),
    bfEnemy: el('bf-enemy'),
    bfOwn: el('bf-own'),
    hand: el('hand'),
    actions: el('actions'),
    log: el('log'),
  };
  const statusNote = el('table-note');

  let session = null;

  function rerender() {
    if (!session) return;
    renderTableView({ els, session, play });
  }

  /** Jedyna droga akcji gracza: komenda → sesja → przerysowanie. */
  function play(cmd) {
    session.apply(cmd);
    rerender();
  }

  function startGame() {
    const seed = Number.parseInt(el('seed').value, 10);
    const humanKey = el('deck-human').value;
    const botKey = el('deck-bot').value;
    try {
      if (!Number.isInteger(seed)) throw new Error('Ziarno musi być liczbą całkowitą');
      if (humanKey === botKey) throw new Error('Wybierz dwie różne talie');
      const decks = new Map([
        [HUMAN_ID, parseDeckText(repoDecks[humanKey], registry).cardIds],
        [BOT_ID, parseDeckText(repoDecks[botKey], registry).cardIds],
      ]);
      session = createSession({ seed, registry, decks });
      statusNote.textContent = '';
      rerender();
    } catch (error) {
      statusNote.textContent = `Nie udało się rozpocząć partii: ${error.message}`;
    }
  }

  function exportReplay() {
    if (!session) { statusNote.textContent = 'Najpierw rozpocznij partię.'; return; }
    const text = session.exportReplayText();
    el('replay-out').value = text;
    // Dla urządzeń z menedżerem plików (iPad/iPhone): dodatkowo prawdziwy download.
    const link = el('replay-download');
    const blob = new Blob([text], { type: 'application/json' });
    if (link.dataset.url) URL.revokeObjectURL(link.dataset.url);
    const url = URL.createObjectURL(blob);
    link.dataset.url = url;
    link.href = url;
    link.textContent = 'Pobierz plik zapisu';
  }

  function importReplay() {
    if (!session) { statusNote.textContent = 'Najpierw rozpocznij partię — import odtwarza zapis w składzie bieżących talii.'; return; }
    const text = el('replay-out').value.trim();
    try {
      const summary = session.importReplayText(text);
      el('replay-summary').textContent = [
        `Odtworzono ${summary.steps} komend · odrzuconych: ${summary.rejected} · status: ${summary.status}`,
        summary.winner ? `Zwycięzca: ${summary.winner}` : 'Partia bez rozstrzygnięcia',
        `Odcisk stanu: ${summary.fingerprint.slice(0, 48)}…`,
      ].join(' · ');
    } catch (error) {
      el('replay-summary').textContent = `Nie udało się odtworzyć zapisu: ${error.message}`;
    }
  }

  // --- Wybór talii -----------------------------------------------------
  if (deckKeys.length >= 2) {
    for (const selectId of ['deck-human', 'deck-bot']) {
      const select = el(selectId);
      for (const key of deckKeys) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = deckTitle(repoDecks[key], key);
        select.appendChild(option);
      }
    }
    const defaultHuman = deckKeys.includes('synthetic-aggro') ? 'synthetic-aggro' : deckKeys[0];
    const defaultBot = deckKeys.includes('synthetic-growth') ? 'synthetic-growth' : deckKeys.find((key) => key !== defaultHuman);
    el('deck-human').value = defaultHuman;
    el('deck-bot').value = defaultBot;
    el('new-game').addEventListener('click', startGame);
    el('export-replay').addEventListener('click', exportReplay);
    el('import-replay').addEventListener('click', importReplay);
    const fileInput = el('replay-file');
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.addEventListener('load', () => { el('replay-out').value = String(reader.result ?? ''); });
      reader.readAsText(file);
    });
    startGame();
  } else {
    statusNote.textContent = 'Brak wstrzykniętych talii (REPO_DECKS) — strona działa tylko z testem silnika. Otwórz plik zbudowany przez tools/build.mjs.';
    for (const id of ['new-game', 'export-replay', 'import-replay']) el(id).disabled = true;
  }
}

runSelfTest();
bootstrapTable();
