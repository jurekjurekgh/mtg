/**
 * Punkt wejścia standalone Wirtualnego Stołu (M5–M7).
 *
 * Łańcuch dystrybucji: moduły (łącznie z headless engine) -> build ->
 * jeden plik HTML -> przeglądarka (także z file:// na iOS, ADR 0011).
 * Talie z decks/*.txt build wstrzykuje jako globalną REPO_DECKS — przeglądarka
 * otwarta z file:// nie może ich pobrać przez fetch (origin `null`).
 *
 * Granica odpowiedzialności: ten moduł wyłącznie składa elementy DOM,
 * tłumaczy kliknięcia na komendy protokołu i prosi sesję o przerysowanie.
 * M7 dodaje warstwy (inspektor stref, podgląd karty) i hover — sterowane
 * wyłącznie przełączaniem klas, bez dotykania stanu gry.
 * Cała logika gry jest poza warstwą UI.
 */

import { shuffle } from '../engine/shuffle.js';
import { createRng } from '../engine/rng.js';
import { createGameState, execute, playerView } from '../engine/game-state.js';
import { stateFingerprint } from '../engine/fingerprint.js';
import { createCardRegistry } from '../cards/card-data.js';
import { parseDeckText } from '../cards/deck-text.js';
import { BOT_ID, HUMAN_ID, createSession } from './session.js';
import { renderBotMoves, renderCardFullscreen, renderCardPreview, renderTableView, commandLabel, renderMiniFace } from './render.js';
import { installSwipeGesture, installTapGesture } from './gestures.js';
import { detectImageMode } from './card-images.js';
import { mountDeckBuilder } from './deck-builder.js';
import { renderChoiceRequest } from './choice-request.js';

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
  mountDeckBuilder({ registry, repoDecks });

  const el = (id) => document.getElementById(id);
  const els = {
    banner: el('banner'),
    status: el('status'),
    stackZone: el('stack-zone'),
    bfEnemy: el('bf-enemy'),
    bfOwn: el('bf-own'),
    graveEnemy: el('grave-enemy'),
    graveOwn: el('grave-own'),
    exileZone: el('exile-zone'),
    hand: el('hand'),
    actions: el('actions'),
    actionsCount: el('actions-count'),
    log: el('log'),
    botReasoning: el('bot-reasoning'),
    botReasoningCount: el('bot-reasoning-count'),
    turnHistory: el('turn-history'),
    turnHistoryCount: el('turn-history-count'),
    turnHistoryCopy: el('turn-history-copy'),
    turnHistory1: el('turn-history-1'),
    turnHistory2: el('turn-history-2'),
    undercity: el('undercity'),
    hoverPreview: el('hover-preview'),
    contextMenu: el('context-menu'),
    contextMenuBody: el('context-menu-body'),
    choiceRequest: el('choice-request'),
    choiceRequestBody: el('choice-request-body'),
    actionsDrawer: el('actions-drawer'),
    actionsFab: el('actions-fab'),
    actionsFabCount: el('actions-fab-count'),
    actionsDrawerClose: el('actions-drawer-close'),
    cardFullscreen: el('card-fullscreen'),
    cardFullscreenBody: el('card-fullscreen-body'),
    botMove: el('bot-move'),
    botMoveBody: el('bot-move-body'),
  };
  const statusNote = el('table-note');

  // Sekcja „Przebieg tur (dla AI)" (M25): przełącznik 1/2 ostatnich tur
  // odświeża panel, a guzik kopiuje gotowy blok do schowka.
  for (const radio of [els.turnHistory1, els.turnHistory2]) {
    radio?.addEventListener('change', () => rerender());
  }
  els.turnHistoryCopy?.addEventListener('click', () => {
    if (!session) return;
    const count = els.turnHistory2?.checked ? 2 : 1;
    const text = typeof session.turnHistoryText === 'function' ? session.turnHistoryText(count) : '';
    if (!text) return;
    copyTextToClipboard(text, els.turnHistoryCopy);
  });

  /** Kopiuje tekst do schowka: Clipboard API, a przy file:// fallback textarea. */
  function copyTextToClipboard(text, button) {
    const done = () => {
      if (!button) return;
      const original = button.textContent;
      button.textContent = 'Skopiowano ✓';
      setTimeout(() => { button.textContent = original; }, 1500);
    };
    const fallback = () => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try { document.execCommand('copy'); } catch { /* brak wsparcia — ignorujemy */ }
      document.body.removeChild(textarea);
      done();
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  let currentImageMode = detectImageMode(typeof location !== 'undefined' ? location.protocol : 'file:');
  const imageModeSelect = el('image-mode');
  if (imageModeSelect) {
    imageModeSelect.addEventListener('change', () => {
      const val = imageModeSelect.value;
      if (val === 'auto') currentImageMode = detectImageMode(typeof location !== 'undefined' ? location.protocol : 'file:');
      else if (val === 'scryfall') currentImageMode = 'scryfall';
      else if (val === 'local') currentImageMode = 'local';
    });
  }

  // Tor podglądu hover (scryfall → FOT → KON) przełączany scrollem nad kartą,
  // jak w legacy HTML. Trzymany w pamięci sesji strony — bez localStorage.
  let currentHoverMode = 'scryfall';

  const AUTOSAVE_KEY = 'mtg-table-autosave-v1';
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;

  let session = null;
  // Sygnatura ostatniego okna decyzyjnego — szuflada akcji otwiera się sama
  // przy NOWYM oknie, ale nie walczy z ręcznym zamknięciem w tym samym oknie.
  let lastActionsSignature = '';
  // Czas otwarcia pełnego ekranu karty (patrz openCardFullscreen).
  let fullscreenOpenedAt = 0;
  // Czas ostatniego swipe'a po pełnym ekranie — syntetyczny `click` po
  // touchend nie może zamknąć warstwy ani być mylony z gestem przewinięcia.
  let fullscreenSwipedAt = 0;
  // Kontekst karuzeli pełnego ekranu: { objectId, zoneKey } — swipe w lewo /
  // w prawo pokazuje kolejną/poprzednią kartę TEJ SAMEJ strefy (np. ręki).
  let fullscreenContext = null;

  // Czas otwarcia każdego modala — klik w tło tuż po otwarciu to „odprysk”
  // gestu otwierającego, a nie intencja zamknięcia (iOS: powolny double-tap
  // otwiera menu timerem pojedynczego tapa, a syntetyczny click drugiego
  // tapnięcia ląduje już na tle świeżego modala i zamykał go w ułamku
  // sekundy — zgłoszone „mrugnięcie"). Taki klik ignorujemy przez krótkie
  // okno; celowe zamknięcie klikiem w tło działa po jego upływie.
  const MODAL_OPEN_GUARD_MS = 450;
  const modalOpenedAt = {};
  function showModal(id) { modalOpenedAt[id] = Date.now(); el(id).className = 'modal active'; }
  function hideModal(id) { el(id).className = 'modal'; }

  /** UI adapter ChoiceRequest: warianty pochodzą wyłącznie z PlayerView. */
  function openChoiceRequest(request) {
    if (!session || !els.choiceRequestBody) return;
    const choiceView = session.view();
    renderChoiceRequest(els.choiceRequestBody, request, {
      labelForOption: (option) => commandLabel(option, session, choiceView),
      onResponse: (response) => {
        hideModal('choice-request');
        play(response.value);
      },
    });
    showModal('choice-request');
  }

  /**
   * Karta na pełnym ekranie (M18): dwuklik/double-tap na dowolnym kaflu oraz
   * pojedyncze tapnięcie karty, która nie ma teraz żadnych akcji (karta
   * przeciwnika, grób) — wtedy menu kontekstowe byłoby pustym oknem.
   * Warstwa pamięta strefę karty — swipe karuzeluje po niej (patrz niżej).
   */
  function openCardFullscreen(objectId) {
    if (!session || !els.cardFullscreenBody) return;
    hideModal('context-menu');
    hideModal('choice-request');
    const view = session.view();
    let found = null;
    let zoneKey = null;
    for (const [key, list] of Object.entries(view.zones)) {
      const match = (list ?? []).find((o) => o.id === objectId);
      if (match) { found = match; zoneKey = key; break; }
    }
    if (!found || found.hidden) return;
    fullscreenContext = { objectId, zoneKey };
    renderFullscreenFor(found, zoneKey);
    els.cardFullscreen.className = 'fullscreen active';
    fullscreenOpenedAt = Date.now();
  }

  /** Rysuje kartę na pełnym ekranie z pozycją karuzeli strefy („2 / 7"). */
  function renderFullscreenFor(object, zoneKey) {
    const list = (session.view().zones[zoneKey] ?? []).filter((o) => !o.hidden);
    const index = list.findIndex((o) => o.id === object.id);
    const positionText = list.length >= 2 && index >= 0 ? `${index + 1} / ${list.length}` : null;
    renderCardFullscreen(els.cardFullscreenBody, cardInfoForFullscreen(object), { positionText });
  }

  /**
   * Karuzela pełnego ekranu (decyzja właściciela 2026-08-05): swipe w lewo
   * to KOLEJNA karta tej samej strefy (np. ręki), w prawo — POPRZEDNIA;
   * zapętlenie na końcach listy. Zakryte karty (ręka/stos przeciwnika)
   * pomijamy. Karuzela czyta bieżący widok — pomiędzy otwarciem a swipem
   * strefa mogła się zmienić (Akcje w tle) i wtedy po prostu brakuje indeksu.
   */
  function cycleFullscreenCard(direction) {
    if (!session || !els.cardFullscreenBody || !fullscreenContext?.zoneKey) return;
    const list = (session.view().zones[fullscreenContext.zoneKey] ?? []).filter((o) => !o.hidden);
    if (list.length < 2) return;
    const index = list.findIndex((o) => o.id === fullscreenContext.objectId);
    if (index < 0) return;
    const next = list[(index + direction + list.length) % list.length];
    fullscreenContext.objectId = next.id;
    renderFullscreenFor(next, fullscreenContext.zoneKey);
    // Swipe = „ponowne otwarcie": syntetyczny click po touchend nie może
    // zamknąć warstwy (okno w ignoreClick warstwy tapów).
    fullscreenSwipedAt = Date.now();
  }

  function closeCardFullscreen() {
    if (els.cardFullscreen) els.cardFullscreen.className = 'fullscreen';
    fullscreenContext = null;
  }

  /** Kształt danych karty, jakiego oczekuje renderCardFullscreen. */
  function cardInfoForFullscreen(object) {
    const details = object.faceDown ? null : session.cardDetails(object.cardId);
    return {
      name: object.faceDown ? 'Karta zakryta' : (details?.name ?? session.nameOf(object.cardId)),
      colors: details?.colors ?? [],
      kind: object.kind ?? 'creature',
      types: details?.types ?? [],
      subtypes: details?.subtypes ?? [],
      keywords: details?.keywords ?? [],
      manaCost: details?.manaCost ?? null,
      power: details?.power, toughness: details?.toughness,
      livePower: object.power ?? details?.power,
      liveToughness: object.toughness ?? details?.toughness,
      spell: details?.spell ?? null,
      abilities: details?.abilities ?? [],
      morph: details?.morph ?? null,
      set: details?.set ?? null,
      imageUri: object.faceDown ? null : (details?.imageUri ?? null),
      artId: object.faceDown ? null : (details?.artId ?? null),
      faceDown: Boolean(object.faceDown),
    };
  }

  function onCardClick(objectId, cardId) {
    if (!session) return;
    const view = session.view();
    const legalCommands = view.legalCommands || [];
    
    // Filtrowanie akcji dla tej karty (także ataki/bloki)
    const actions = legalCommands.filter((cmd) => {
      if (cmd.objectId === objectId) return true;
      if (cmd.attackerIds?.includes(objectId)) return true;
      if (Object.keys(cmd.assignments || {}).includes(objectId)) return true;
      return false;
    });

    if (actions.length === 0) {
      openCardFullscreen(objectId);
      return;
    }

    const body = el('context-menu-body');
    body.textContent = '';

    const headerWrap = document.createElement('div');
    headerWrap.className = 'context-menu-header';
    renderMiniFace(headerWrap, session, objectId);
    body.appendChild(headerWrap);

    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'context-menu-actions';

    // Grupowanie wariantów (cel, X, phyrexian) tak samo jak w panelu akcji,
    // żeby nie było niespójności „Twoje działania vs klik na kartę" (bug D).
    // Klucz grupowania – uproszczony odpowiednik choiceRequestGroupKey z render.js
    const groupKey = (cmd) => {
      if (cmd.type === 'cast_spell' && cmd.targets?.length) return `spell:${cmd.objectId}`;
      if (cmd.type === 'cast_cleave' && cmd.targets?.length) return `cleave:${cmd.objectId}`;
      if (cmd.type === 'cast_permanent' && cmd.targets?.length) return `perm:${cmd.objectId}:${Boolean(cmd.bestow)}`;
      if (cmd.type === 'cast_permanent' && cmd.phyrexianPayWithLife != null) return `perm-x:${cmd.objectId}`;
      if (cmd.type === 'activate_ability' && (cmd.targets?.length || cmd.xValue != null || cmd.attackerId != null)) return `ability:${cmd.objectId}:${cmd.abilityIndex}`;
      if (cmd.type === 'resolve_scry') return 'resolve_scry';
      if (cmd.type === 'resolve_surveil') return 'resolve_surveil';
      if (cmd.type === 'resolve_backup') return 'resolve_backup';
      if (cmd.type === 'resolve_sacrifice_choice') return 'resolve_sacrifice';
      return cmd.type + ':' + cmd.objectId;
    };
    const groups = new Map();
    for (const cmd of actions) {
      const key = groupKey(cmd);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(cmd);
    }

    for (const [key, cmds] of groups) {
      if (cmds.length > 1) {
        // Wiele celów/wariantów – otwieramy modal wyboru (jak w panelu akcji)
        const btn = document.createElement('button');
        btn.className = 'action choice-request-trigger';
        // Pokaż pierwszy wariant w etykiecie + informację o liczbie
        const firstLabel = commandLabel(cmds[0], session, view);
        btn.textContent = `Wybierz wariant (${cmds.length}): ${firstLabel}`;
        btn.addEventListener('click', () => {
          hideModal('context-menu');
          const request = { id: `ctx-${Date.now()}-${key}`, type: cmds[0].targets?.length ? 'target' : 'command', options: cmds };
          openChoiceRequest(request);
        });
        actionsWrap.appendChild(btn);
      } else {
        const cmd = cmds[0];
        const button = document.createElement('button');
        button.className = 'action';
        if (cmd.type === 'pass_priority') button.className += ' primary';
        if (cmd.type === 'concede') button.className += ' danger';
        button.textContent = commandLabel(cmd, session, view);
        button.addEventListener('click', () => {
          hideModal('context-menu');
          play(cmd);
        });
        actionsWrap.appendChild(button);
      }
    }
    
    const previewBtn = document.createElement('button');
    previewBtn.className = 'ghost-btn';
    previewBtn.textContent = 'Pełny podgląd karty';
    previewBtn.addEventListener('click', () => {
      hideModal('context-menu');
      openCardFullscreen(objectId);
    });
    actionsWrap.appendChild(previewBtn);

    body.appendChild(actionsWrap);
    showModal('context-menu');
  }

  function inspect(cardId) {
    if (!session) return;
    renderCardPreview(el('card-preview-body'), session.cardDetails(cardId), { imageMode: currentImageMode });
    showModal('card-preview');
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
      showBotMoves();
    } catch (error) {
      statusNote.textContent = `Nie udało się wznowić: ${error.message}`;
    }
  }

  function rerender() {
    if (!session) return;
    renderTableView({
      els, session, play, onCardClick, onChoiceRequest: openChoiceRequest,
      onCardDoubleClick: (objectId) => openCardFullscreen(objectId),
      // Bug C: tapnięcie nazwy karty na stosie — pełny ekran z jej tekstem.
      onStackClick: (objectId) => openCardFullscreen(objectId),
      hoverMode: currentHoverMode,
      onHoverModeChange: (mode) => { currentHoverMode = mode; },
    });
    const view = session.view();
    const me = view.players.find((p) => p.id === view.playerId);
    const foe = view.players.find((p) => p.id !== view.playerId);
    el('life-own').textContent = String(me?.life ?? '?');
    el('life-enemy').textContent = String(foe?.life ?? '?');
    el('library-own').textContent = String(view.zones.library.filter((o) => o.controllerId === me?.id).length);
    el('library-enemy').textContent = String(view.zones.library.filter((o) => o.controllerId === foe?.id).length);

    // Wysuwany panel akcji: licznik w FAB; automatyczne otwarcie przy nowym
    // oknie decyzji (auto-pass w sesji zostawia tu tylko realne wybory).
    const count = view.legalCommands.filter((cmd) => cmd.type !== 'concede').length;
    if (els.actionsFabCount) els.actionsFabCount.textContent = count > 0 ? String(count) : '';
    if (view.status !== 'active') {
      if (els.actionsDrawer) els.actionsDrawer.className = 'drawer';
      lastActionsSignature = '';
      return;
    }
    const signature = `${view.turn.number}:${view.turn.phase}:${view.turn.step}`;
    if (signature !== lastActionsSignature) {
      lastActionsSignature = signature;
      if (els.actionsDrawer && count > 0) els.actionsDrawer.className = 'drawer open';
    }
  }

  /**
   * Modal „Ruch przeciwnika" (M18): bot gra w tle, a jego czary i zdolności
   * nie zostawiają śladu na stole — bez tego okna gracz musiałby wyławiać je
   * z logu. Modal jest blokujący i zamykany przyciskiem (decyzja właściciela).
   *
   * Pauza po każdym istotnym zagraniu bota (decyzja właściciela 2026-08-05):
   * sesja zatrzymuje się po rzucie czaru, wystawieniu lądu, użyciu zdolności
   * i zmianie strefy karty — modal pokazuje JEDNO takie zagranie, a klik
   * wznawia grę do następnej pauzy albo okna decyzyjnego gracza.
   */
  function showBotMoves() {
    if (!session || !els.botMoveBody) return;
    const moves = session.botMoves ?? [];
    if (moves.length > 0) {
      renderBotMoves(els.botMoveBody, moves, session);
      session.clearBotMoves();
      showModal('bot-move');
      return;
    }
    // Bezpiecznik: pauza z pustym buforem nie może zablokować partii.
    if (session.botPausePending) continueAfterBotPause();
  }

  /** Klik „Rozumiem"/✕/tło w modalu ruchu bota: wznowienie gry do następnej pauzy. */
  function continueAfterBotPause() {
    if (!session) return;
    session.continueBotPlay();
    autosave();
    rerender();
    showBotMoves();
  }

  function closeBotMoveModal() {
    hideModal('bot-move');
    if (session?.botPausePending) continueAfterBotPause();
  }

  /** Jedyna droga akcji gracza: komenda → sesja → przerysowanie. */
  function play(cmd) {
    const result = session.apply(cmd);
    autosave();
    rerender();
    if (result?.ok !== false) showBotMoves();
  }

  function startGame() {
    const seed = Number.parseInt(el('seed').value, 10);
    const humanKey = el('deck-human').value;
    const botKey = el('deck-bot').value;
    try {
      if (!Number.isInteger(seed)) throw new Error('Ziarno musi być liczbą całkowitą');
      // Ta sama talia dla gracza i bota jest dozwolona (mirror match) —
      // egzemplarze obiektów mają prefiksy graczy, kolizji nie ma.
      const decks = new Map([
        [HUMAN_ID, parseDeckText(repoDecks[humanKey], registry).cardIds],
        [BOT_ID, parseDeckText(repoDecks[botKey], registry).cardIds],
      ]);
      session = createSession({ seed, registry, decks, pauseOnBotMoves: true });
      statusNote.textContent = '';
      renderCardPreview(el('card-preview-body'), null, { imageMode: currentImageMode });
      autosave();
      rerender();
      // Bot mógł zacząć partię — pokaż jego pierwsze istotne zagranie (pauza).
      showBotMoves();
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
    function refreshLibraryPreview() {
      const lib = session ? session.view().zones.library.slice(0, 3) : [];
      const names = lib.map((o) => session.nameOf(o.cardId)).filter(Boolean);
      el('library-preview').textContent = names.length ? names.join(', ') : 'Brak';
    }
    el('library-menu-btn').addEventListener('click', () => {
      refreshLibraryPreview();
      showModal('library-menu-panel');
    });
    el('zone-inspector-close').addEventListener('click', () => hideModal('library-menu-panel'));
    el('card-preview-close').addEventListener('click', () => hideModal('card-preview'));
    el('context-menu-close').addEventListener('click', () => hideModal('context-menu'));
    el('choice-request-close').addEventListener('click', () => hideModal('choice-request'));
    // Pełny ekran karty (M18 + poprawka dotyku 2026-08-03): zamyka ten sam
    // gest, który otworzył — tapnięcie/dwuklik w DOWOLNYM miejscu warstwy
    // (także na samej karcie), nie tylko ✕ czy tło. Dotyk przechodzi przez
    // okno double-tapa (gestures.js), a kliknięcie tuż po otwarciu („odprysk"
    // gestu otwierającego) jest ignorowane.
    const fullscreenClose = el('card-fullscreen-close');
    if (fullscreenClose) fullscreenClose.addEventListener('click', closeCardFullscreen);
    if (els.cardFullscreen) {
      // Karuzela kart strefy: swipe w lewo = kolejna, w prawo = poprzednia.
      // Rejestrowana PRZED warstwą tapów — jej timestamp (fullscreenSwipedAt)
      // jest już świeży, gdy warstwa tapów obrabia ten sam touchend, więc
      // szybkie kolejne swipe'y nie są mylone z double-tapem (nie zamykają).
      installSwipeGesture(els.cardFullscreen, {
        onSwipeLeft: () => cycleFullscreenCard(1),
        onSwipeRight: () => cycleFullscreenCard(-1),
      });
      installTapGesture(els.cardFullscreen, {
        onTap: closeCardFullscreen,
        onDoubleTap: closeCardFullscreen,
        // „Odprysk" gestu otwierającego (350 ms) oraz syntetyczny click po
        // swipe'u (800 ms) nie zamykają pełnego ekranu.
        ignoreClick: () => (Date.now() - fullscreenOpenedAt < 350)
          || (Date.now() - fullscreenSwipedAt < 800),
        // iOS: touchend powolnego DRUGIEGO tapnięcia (tuż po auto-otwarciu
        // warstwy przez pierwsze) bez tej bramki uzbrajał timer zamykania —
        // pełny ekran „mrugał" (otwierał się i zamykał po ~0,5 s).
        ignoreTouch: () => Date.now() - fullscreenSwipedAt < 150
          || Date.now() - fullscreenOpenedAt < 350,
      });
      // Desktop: strzałki w karuzeli (→ kolejna, ← poprzednia), Esc zamyka.
      if (typeof document.addEventListener === 'function') {
        document.addEventListener('keydown', (e) => {
          if (!els.cardFullscreen || els.cardFullscreen.className !== 'fullscreen active') return;
          if (e.key === 'ArrowRight') cycleFullscreenCard(1);
          else if (e.key === 'ArrowLeft') cycleFullscreenCard(-1);
          else if (e.key === 'Escape') closeCardFullscreen();
        });
      }
    }
    // Modal ruchu bota: „Rozumiem" i ✕ zamykają tak samo — a przy oczekującej
    // pauzy jednocześnie wznawiają grę (łańcuch kolejnych istotnych zagrań).
    const botMoveOk = el('bot-move-ok');
    if (botMoveOk) botMoveOk.addEventListener('click', closeBotMoveModal);
    const botMoveClose = el('bot-move-close');
    if (botMoveClose) botMoveClose.addEventListener('click', closeBotMoveModal);
    // Wysuwany panel akcji: FAB otwiera, ✕ zamyka (auto-otwarcie w rerender).
    if (els.actionsFab) els.actionsFab.addEventListener('click', () => {
      if (els.actionsDrawer) els.actionsDrawer.className = 'drawer open';
    });
    if (els.actionsDrawerClose) els.actionsDrawerClose.addEventListener('click', () => {
      if (els.actionsDrawer) els.actionsDrawer.className = 'drawer';
    });
    // Klik w tło warstwy (poza kartą modalu) zamyka ją; modal ruchu bota
    // dodatkowo wznawia grę po pauzie (closeBotMoveModal).
    for (const modalId of ['library-menu-panel', 'card-preview', 'context-menu', 'choice-request', 'bot-move']) {
      const modal = el(modalId);
      modal.addEventListener('click', (event) => {
        if (event.target !== modal) return;
        // Odprysk gestu otwierającego (iOS double-tap) — patrz showModal.
        if (Date.now() - (modalOpenedAt[modalId] ?? 0) < MODAL_OPEN_GUARD_MS) return;
        if (modalId === 'bot-move') closeBotMoveModal();
        else hideModal(modalId);
      });
    }
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
