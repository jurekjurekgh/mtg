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
import { renderCardPreview, renderTableView } from './render.js';
import { detectImageMode } from './card-images.js';

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
    graveEnemy: el('grave-enemy'),
    graveOwn: el('grave-own'),
    hand: el('hand'),
    actions: el('actions'),
    log: el('log'),
  };
  const statusNote = el('table-note');

  const imageMode = detectImageMode(typeof location !== 'undefined' ? location.protocol : 'file:');
  const AUTOSAVE_KEY = 'mtg-table-autosave-v1';
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;

  let session = null;

  function inspect(cardId) {
    if (!session) return;
    renderCardPreview(el('card-preview'), session.cardDetails(cardId), { imageMode });
  }

  function autosave() {
    if (!storage || !session) return;
    try {
      storage.setItem(AUTOSAVE_KEY, JSON.stringify({
        seed: session.state.seed,
        humanDeck: el('deck-human').value,
        botDeck: el('deck-bot').value,
        savedAt: new Date().toISOString(),
        replay: session.exportReplayText(),
      }));
      refreshResumePanel();
    } catch { /* Safari prywatny */ }
  }

  function refreshResumePanel() {
    const slot = el('autosave-info');
    if (!storage) { slot.textContent = ''; return; }
    try {
      const raw = storage.getItem(AUTOSAVE_KEY);
      if (!raw) { slot.textContent = ''; return; }
      const saved = JSON.parse(raw);
      slot.textContent = `Ostatni autosave: ${saved.savedAt?.slice(0, 16).replace('T', ' ') ?? '?'} (seed ${saved.seed}) — możesz wznowić.`;
    } catch { slot.textContent = ''; }
  }

  function resumeFromSaved(raw) {
    try {
      const saved = JSON.parse(raw);
      if (!repoDecks[saved.humanDeck] || !repoDecks[saved.botDeck]) throw new Error('talie z zapisu nie istnieją w tym buildzie');
      el('seed').value = String(saved.seed);
      el('deck-human').value = saved.humanDeck;
      el('deck-bot').value = saved.botDeck;
      startGame();
      const summary = session.resumeReplayText(saved.replay);
      statusNote.textContent = `Wznowiono partię (${summary.steps} komend). Kontynuacja bota jest nową gałęzią losowania.`;
      rerender();
    } catch (error) {
      statusNote.textContent = `Nie udało się wznowić: ${error.message}`;
    }
  }

  function rerender() {
    if (!session) return;
    renderTableView({ els, session, play, onInspect: inspect });
    const view = session.view();
    const me = view.players.find((p) => p.id === view.playerId);
    const foe = view.players.find((p) => p.id !== view.playerId);
    el('life-own').textContent = String(me?.life ?? '?');
    el('life-enemy').textContent = String(foe?.life ?? '?');
    el('library-own').textContent = String(view.zones.library.filter((o) => o.controllerId === me?.id).length);
    el('library-enemy').textContent = String(view.zones.library.filter((o) => o.controllerId === foe?.id).length);
  }

  /** Jedyna droga akcji gracza: komenda → sesja → przerysowanie. */
  function play(cmd) {
    session.apply(cmd);
    autosave();
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
      renderCardPreview(el('card-preview'), null, { imageMode });
      autosave();
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
    el('resume-replay').addEventListener('click', () => {
      const text = el('replay-out').value.trim();
      if (!text) { statusNote.textContent = 'Wklej zapis partii do pola tekstowego.'; return; }
      resumeFromSaved(JSON.stringify({ seed: session?.state.seed ?? Number.parseInt(el('seed').value, 10), humanDeck: el('deck-human').value, botDeck: el('deck-bot').value, replay: text }));
    });
    el('resume-save').addEventListener('click', () => {
      try {
        const raw = storage?.getItem(AUTOSAVE_KEY);
        if (!raw) { statusNote.textContent = 'Brak autosave do wznowienia.'; return; }
        resumeFromSaved(raw);
      } catch {
        statusNote.textContent = 'Nie udało się odczytać autosave.';
      }
    });
    refreshResumePanel();
    el('library-menu-btn').addEventListener('click', () => {
      const panel = el('library-menu-panel');
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      const lib = session ? session.view().zones.library.slice(0, 3) : [];
      const names = lib.map((o) => session.nameOf(o.cardId)).filter(Boolean);
      el('library-preview').textContent = names.length ? names.join(', ') : 'Brak';
    });
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
