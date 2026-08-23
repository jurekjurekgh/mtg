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
import { populateDeckSelects, combineDeckSources } from './deck-selects.js';
import { createRng } from '../engine/rng.js';
import { createGameState, execute, playerView } from '../engine/game-state.js';
import { stateFingerprint } from '../engine/fingerprint.js';
import { createCardRegistry, UNDERCITY_DUNGEON, DAY_NIGHT_TOKEN } from '../cards/card-data.js';
import { parseDeckText } from '../cards/deck-text.js';
import { BOT_ID, HUMAN_ID, createSession, commandOptionKey, FACE_DOWN_LABEL } from './session.js';
import { renderBotMoves, renderCardFullscreen, renderCardPreview, renderTableView, commandLabel, labelChoiceOptions, renderMiniFace, selectedTurnHistory, renderPlayerMeta } from './render.js';
import { installSwipeGesture, installTapGesture } from './gestures.js';
import { paymentDescriptorOf, countPaymentVariants, wizardProgress, renderManaWizard, manaSourcesOf } from './mana-wizard.js';
import { effectiveSpellManaCost } from '../engine/spells.js';
import { expandManaPool } from '../engine/resources.js';
import { getSourceForObject } from '../engine/mana-sources.js';
import { parseManaCost } from '../engine/mana-cost.js';
import { MANA_COSTS } from '../cards/mana-costs-data.js';
import { detectImageMode } from './card-images.js';
import { mountDeckBuilder } from './deck-builder.js';
import { lookWizardKindOf, renderChoiceRequest, renderLookWizard, renderCombatWizard, renderDamageWizard, renderDamageDivisionWizard, renderMultiTargetWizard } from './choice-request.js';
import { multiTargetPlanOf } from './multi-target.js';
import { choiceGroupLabel, choiceGroupTitle, groupCombatDecisions } from './render.js';

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

/** Składa UI stołu i podpina je pod sesję gry. */
function bootstrapTable() {
  // W bundle: build wstrzykuje `var REPO_DECKS` przed modułami (w node
  // `new Function` var to zmienna lokalna skryptu, więc czytamy też nazwę).
  const repoDecks = globalThis.REPO_DECKS ?? (typeof REPO_DECKS !== 'undefined' ? REPO_DECKS : {});
  const deckKeys = Object.keys(repoDecks).sort();
  const registry = createCardRegistry();
  // K1: rejestrujemy talie własne (import z pliku / biblioteka IndexedDB).
  const importedDecks = new Map();
  let windowAllDecks = { ...repoDecks };
  mountDeckBuilder({ registry, repoDecks, onDeckImported: (name, text) => { importedDecks.set(name, text); rebuildDeckSelects(); } });

  const el = (id) => document.getElementById(id);
  const els = {
    banner: el('banner'),
    stackZone: el('stack-zone'),
    bfEnemy: el('bf-enemy'),
    bfOwn: el('bf-own'),
    graveEnemy: el('grave-enemy'),
    graveOwn: el('grave-own'),
    exileZone: el('exile-zone'),
    hand: el('hand'),
    actions: el('actions'),
    log: el('log'),
    turnHistory: el('turn-history'),
    turnHistoryCount: el('turn-history-count'),
    turnHistoryCopy: el('turn-history-copy'),
    // M197/A1: kopiowanie CAŁEJ partii (wszystkie tury).
    turnHistoryCopyAll: el('turn-history-copy-all'),
    turnHistorySelect: el('turn-history-select'),
    // M198/C: boks danych per gracz (strefy + pula many razem).
    metaFoe: el('meta-foe'),
    metaOwn: el('meta-own'),
    // M198/B: warstwa komunikatów systemowych z guzikiem „Rozumiem".
    noticeBody: el('notice-body'),
    daynight: el('daynight'),
    poison: el('poison'),
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
    manaWizard: el('mana-wizard'),
    manaWizardBody: el('mana-wizard-body'),
    botMoveBody: el('bot-move-body'),
  };
  /**
   * M198/B (screenshot właściciela): komunikaty systemowe zamiast pasa
   * czerwonego tekstu w układzie pokazują się w warstwie z guzikiem
   * „Rozumiem". Pusty tekst = nie ma czego pokazywać (dawne czyszczenie
   * pasa), więc modal się nie otwiera.
   */
  function showNotice(text) {
    const message = String(text ?? '').trim();
    if (!message) return;
    if (els.noticeBody) els.noticeBody.textContent = message;
    showModal('notice');
  }

  // Sekcja „Przebieg tur (dla AI)" (M25; M188/K — zlecenie właściciela):
  // lista WSZYSTKICH ukończonych tur; wybór pokazuje turę, guzik kopiuje
  // dokładnie tę wybraną.
  els.turnHistorySelect?.addEventListener('change', () => rerender());
  els.turnHistoryCopy?.addEventListener('click', () => {
    if (!session) return;
    const turn = selectedTurnHistory(els);
    const text = turn != null && typeof session.turnHistoryTextFor === 'function'
      ? session.turnHistoryTextFor(turn)
      : '';
    if (!text) return;
    copyTextToClipboard(text, els.turnHistoryCopy);
  });

  // M197/A1 (zlecenie właściciela): „skopiuj całą partię do schowka" —
  // wszystkie tury od początku rozgrywki, nie tylko wybrana.
  els.turnHistoryCopyAll?.addEventListener('click', () => {
    if (!session) return;
    const text = typeof session.turnHistoryTextAll === 'function' ? session.turnHistoryTextAll() : '';
    if (!text) return;
    copyTextToClipboard(text, els.turnHistoryCopyAll);
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

  // M189/M (uwaga właściciela): panel „Ustawienia i pomoc" usunięty, więc
  // nie ma już ręcznego przełącznika źródła ilustracji. Zostaje zachowanie
  // domyślne, które i tak było jedynym używanym: AUTODETEKCJA po protokole
  // (adres http(s) → Scryfall, plik z dysku → lokalne ./img/ z fallbackiem).
  const currentImageMode = detectImageMode(typeof location !== 'undefined' ? location.protocol : 'file:');

  // Tor podglądu hover (scryfall → FOT → KON) przełączany scrollem nad kartą,
  // jak w legacy HTML. Trzymany w pamięci sesji strony — bez localStorage.
  let currentHoverMode = 'scryfall';

  const AUTOSAVE_KEY = 'mtg-table-autosave-v1';
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;

  let session = null;
  // M103 (L15): mostek diagnostyczny Żywego Testera (tools/table-tester) —
  // włączany wyłącznie, gdy artefakt otwarto z ?tester=1. W normalnej grze
  // stan silnika nie jest eksponowany. Sonda wykonuje komendy na KLONACH
  // stanu — prawdziwej partii nigdy nie dotyka. Mostek instalujemy OD RAZU
  // (przed utworzeniem sesji): tester przechwytuje go przy starcie strony,
  // a funkcje domykają zmienną `session` i czytają ją w chwili wywołania.
  let testerBridge = false;
  try {
    testerBridge = new URL(window.location?.href ?? '').searchParams.get('tester') === '1';
  } catch {
    testerBridge = false;
  }
  if (testerBridge) {
    window.__mtgDebug = {
      fingerprint: () => (session ? session.debugFingerprint() : null),
      probe: (optionKey) => (session ? session.probeCommandEffect(optionKey) : { ok: false, reason: 'no_session' }),
    };
  }
  // Feature 2026-08-11: wyciszone opcje akcji (ptaszek „nie przerywaj
  // auto-passu"). Zbiór kluczy commandOptionKey; sesja czyta go w
  // hasMeaningfulDecision, UI mutuje przez toggleIgnoredOption. Trwałość:
  // pamięć strony (jak inne preferencje UI), reset przy odświeżeniu.
  const ignoredOptionKeys = new Set();
  // Sygnatura ostatniego okna decyzyjnego — szuflada akcji otwiera się sama
  // przy NOWYM oknie, ale nie walczy z ręcznym zamknięciem w tym samym oknie.
  let lastActionsSignature = '';
  // Czas otwarcia pełnego ekranu karty (patrz openCardFullscreen).
  // M167/E2: klik w nazwę karty w logu otwiera pełnoekranową ilustrację
  // (span.log-card z data-card-id naszywają renderLog; jedna delegacja —
  // podpięta RAZ po utworzeniu els).
  if (els.log && !els.log.__logCardLinksWired) {
    els.log.__logCardLinksWired = true;
    els.log.addEventListener('click', (event) => {
      const span = event.target?.closest?.('.log-card');
      if (span?.dataset?.cardId) openCardFullscreenByCardId(span.dataset.cardId);
    });
  }

  // K1 (decyzja właściciela): talie WŁASNE — import z pliku + biblioteka
  // IndexedDB rejestrowane w selectach stołu jako „(własna)"; startGame
  // czyta z POŁĄCZONEGO źródła (repo + własne).
  function rebuildDeckSelects() {
    const { decks, labelOf } = combineDeckSources(repoDecks, importedDecks);
    windowAllDecks = decks;
    populateDeckSelects([el('deck-human'), el('deck-bot')], decks, { labelOf });
  }
  mountDeckBuilder({
    registry, repoDecks,
    onDeckImported: (name, text) => { importedDecks.set(name, text); rebuildDeckSelects(); },
  });
  // Bootstrap: biblioteka IndexedDB (przeżywa reload przeglądarki) — każda
  // zapisana talia od razu dostępna w grze, zanim właściciel ją opublikuje.
  void (async () => {
    try {
      const { listDecks, deckStoreAvailable } = await import('./deck-store.js');
      if (!deckStoreAvailable()) return;
      for (const entry of await listDecks()) {
        if (entry?.name && entry?.text) importedDecks.set(entry.name, entry.text);
      }
      if (importedDecks.size > 0) rebuildDeckSelects();
    } catch { /* brak IndexedDB — tylko talie z repo */ }
  })();
  rebuildDeckSelects();

  let fullscreenOpenedAt = 0;
  // Czas ostatniego swipe'a po pełnym ekranie — syntetyczny `click` po
  // touchend nie może zamknąć warstwy ani być mylony z gestem przewinięcia.
  let fullscreenSwipedAt = 0;
  // Kontekst karuzeli pełnego ekranu: { objectId, zoneKey } — swipe w lewo /
  // w prawo pokazuje kolejną/poprzednią kartę TEJ SAMEJ strefy (np. ręki).
  let fullscreenContext = null;
  // Czy fullscreen został otwarty z miniaturki w modalu „Rozgrywka"
  // (B23). Służy do przywrócenia modala po zamknięciu fullscreen (bug #2).
  let fullscreenOpenedFromBotMove = false;

  // Czas otwarcia każdego modala — klik w tło tuż po otwarciu to „odprysk”
  // gestu otwierającego, a nie intencja zamknięcia (iOS: powolny double-tap
  // otwiera menu timerem pojedynczego tapa, a syntetyczny click drugiego
  // tapnięcia ląduje już na tle świeżego modala i zamykał go w ułamku
  // sekundy — zgłoszone „mrugnięcie"). Taki klik ignorujemy przez krótkie
  // okno; celowe zamknięcie klikiem w tło działa po jego upływie.
  const MODAL_OPEN_GUARD_MS = 450;
  const modalOpenedAt = {};

  // Aktywny kreator płatności many (E.3a): deskryptor komendy rzutu
  // wstrzymanej do zebrania sumy; null = kreator zamknięty. Pokrycie kolorów
  // kreator liczy z KOLOROWEJ PULI many sesji (cz. 8) — nie śledzi committed.
  let manaWizardDescriptor = null;
  function showModal(id) { modalOpenedAt[id] = Date.now(); el(id).className = 'modal active'; }
  function hideModal(id) { el(id).className = 'modal'; }

  /** UI adapter ChoiceRequest: warianty pochodzą wyłącznie z PlayerView. */
  function openChoiceRequest(request) {
    if (!session || !els.choiceRequestBody) return;
    const choiceView = session.view();
    // Wizard scry/surveil (zgłoszenie 2026-08-06, pkt 4): zamiast listy
    // wszystkich kombinacji — najpierw lista przeglądniętych kart, potem
    // wybory PO KOLEI dla każdej karty osobno; komenda resolve_* składana
    // na końcu kroków (protokół bez zmian — patrz renderLookWizard).
    // M195/C + C1 (uwagi właściciela): czar wielocelowy / z {X} dostaje EKRAN
    // ZAZNACZANIA zamiast listy wszystkich kombinacji. Fireball dawał 232
    // przyciski („kompletnie bez sensu — mam 95 kombinacji obrażeń"), Wrap in
    // Flames 15. Plan liczymy z tych samych komend, które są w request.options,
    // więc zatwierdzenie oddaje komendę znaną silnikowi (L48).
    const multiPlan = multiTargetPlanOf(request.options ?? []);
    if (multiPlan) {
      const sourceObject = [...(choiceView.zones?.hand ?? []), ...(choiceView.zones?.battlefield ?? []),
        ...(choiceView.zones?.graveyard ?? []), ...(choiceView.zones?.exile ?? [])]
        .find((o) => o.id === multiPlan.objectId);
      renderMultiTargetWizard(els.choiceRequestBody, {
        view: choiceView,
        session,
        plan: multiPlan,
        commands: request.options,
        sourceName: sourceObject?.cardId ? session.nameOf(sourceObject.cardId) : null,
        onOpenCard: openCardFullscreen,
        onComplete: (cmd) => { hideModal('choice-request'); play(cmd); },
        onCancel: () => hideModal('choice-request'),
      });
      showModal('choice-request');
      return;
    }
    const lookKind = lookWizardKindOf(request, choiceView);
    if (lookKind) {
      const pending = lookKind === 'surveil' ? choiceView.pendingSurveil
        : lookKind === 'index' ? choiceView.pendingIndex
        : choiceView.pendingScry;
      renderLookWizard(els.choiceRequestBody, {
        kind: lookKind,
        // M167/C (uwaga właściciela): karty w wizardzie scry/surveil są
        // KLIKALNE — cardId + handler pełnoekranowej ilustracji (jak nazwy
        // stworów w wizardzie walki, M66/B/R).
        cards: pending.cards.map((card) => ({ id: card.id, cardId: card.cardId, name: session.nameOf(card.cardId) })),
        onOpenCard: (cardId) => openCardFullscreenByCardId(cardId),
        // M112: klucz sondy „oferta bez skutku" dla decyzji KOŃCZĄCEJ wizard
        // (wizard sam nie zna playerId ani typu komendy).
        // M136 (backlog): objęty także `index` — dotąd jedyny wizard tej
        // rodziny całkiem poza pomiarem Żywego Testera.
        probeKeyFor: (built) => {
          // Engine oferuje resolve_scry BEZ pola przy pustym wyborze — klucz
          // musi mieć ten sam kształt, inaczej sonda trafi w inny wariant.
          const payload = Object.fromEntries(Object.entries(built)
            .filter(([, value]) => !Array.isArray(value) || value.length > 0));
          const type = lookKind === 'surveil' ? 'resolve_surveil'
            : lookKind === 'index' ? 'resolve_index_choice'
            : 'resolve_scry';
          return commandOptionKey({ type, playerId: choiceView.playerId, ...payload });
        },
        onComplete: (built) => {
          hideModal('choice-request');
          if (lookKind === 'index') {
            play({ type: 'resolve_index_choice', playerId: choiceView.playerId, order: built.order });
          } else {
            play({ type: lookKind === 'surveil' ? 'resolve_surveil' : 'resolve_scry', playerId: choiceView.playerId, ...built });
          }
        },
        onCancel: () => hideModal('choice-request'),
      });
      showModal('choice-request');
      return;
    }
    // M66 (B/R): walka — zamiast list kombinacji wizard z przełącznikami
    // (atakujący/blokujący) i stepperami (rozdzielanie obrażeń).
    if (request.type === 'declare_attackers' || request.type === 'declare_blockers') {
      renderCombatWizard(els.choiceRequestBody, {
        kind: request.type === 'declare_attackers' ? 'attackers' : 'blockers',
        view: choiceView, session, options: request.options,
        // Uwaga C (2026-08-11): klik w nazwę stwora otwiera pełny ekran karty.
        onOpenCard: (objectId) => openCardFullscreen(objectId),
        onComplete: (built) => {
          hideModal('choice-request');
          play(built);
        },
        onCancel: () => hideModal('choice-request'),
      });
      showModal('choice-request');
      return;
    }
    // M172/E (uwaga właściciela): podział obrażeń między cele (Inferno
    // Titan) — jeden wizard z kwotami zamiast enumeracji kombinacji celów.
    // Zatwierdzenie skleja DWIE komendy silnika: wybór celów
    // (resolve_trigger_target) i kwoty (resolve_damage_division — announce
    // otwiera je natychmiast, CR 601.2d/603.3d); pojedynczy cel dostaje
    // całość bez drugiej komendy.
    if (request.type === 'damage_division') {
      const pt = choiceView.pendingTriggerTarget;
      if (!pt || pt.playerId !== choiceView.playerId || !(pt.divisionTotal > 0)) {
        hideModal('choice-request');
        play(request.options[0]);
        return;
      }
      renderDamageDivisionWizard(els.choiceRequestBody, {
        view: choiceView, session,
        candidateIds: pt.candidateIds, total: pt.divisionTotal,
        maxTargets: pt.maxTargets ?? 3,
        sourceName: pt.cardId ? session.nameOf(pt.cardId) : null,
        onOpenCard: (objectId) => openCardFullscreen(objectId),
        onComplete: ({ targetIds, amounts }) => {
          hideModal('choice-request');
          play({ type: 'resolve_trigger_target', playerId: pt.playerId, targetIds });
          if (targetIds.length >= 2 && session.view().pendingDamageDivision) {
            play({ type: 'resolve_damage_division', playerId: pt.playerId, amounts });
          }
        },
        onCancel: () => hideModal('choice-request'),
      });
      showModal('choice-request');
      return;
    }
    if (request.type === 'damage_assignment') {
      const pending = choiceView.pendingDamageAssignment;
      if (!pending || pending.playerId !== choiceView.playerId || pending.entries.length === 0) {
        // Brak danych (np. blokery zginęli) — domyślny wariant prosto.
        hideModal('choice-request');
        play(request.options[0]);
        return;
      }
      renderDamageWizard(els.choiceRequestBody, {
        view: choiceView, session, pending,
        defaultCommand: request.options[0],
        // M136 (backlog: „damage wizard poza osią noop"): klucz sondy dla
        // przycisku zatwierdzenia — wizard składa komendę ze stepperów, więc
        // sam liczy jej kształt, a tu dokładamy tożsamość komendy.
        probeKeyFor: (built) => commandOptionKey(built),
        onComplete: (cmd) => {
          hideModal('choice-request');
          play(cmd);
        },
        onCancel: () => hideModal('choice-request'),
      });
      showModal('choice-request');
      return;
    }
    // M102/U3: etykiety liczymy dla CAŁEJ listy naraz — labelChoiceOptions
    // dokleja numer „(2 z 17)" wyłącznie do faktycznych duplikatów, żeby
    // kilka egzemplarzy tej samej karty („Szukanie: Forest" ×17, cztery landy
    // do poświęcenia) dało się od siebie odróżnić.
    const optionLabels = new Map();
    {
      const opts = request.options ?? [];
      const labels = labelChoiceOptions(opts, session, choiceView);
      opts.forEach((option, i) => optionLabels.set(option, labels[i]));
    }
    renderChoiceRequest(els.choiceRequestBody, request, {
      // Nagłówek modala = ten sam opis co etykieta w „Twoje działania"
      // („Aura: Benevolent Blessing", „Wybierz: Mulligan" — uwaga A, 2026-08-10).
      introLabel: choiceGroupTitle(request, session, choiceView),
      labelForOption: (option) => optionLabels.get(option) ?? commandLabel(option, session, choiceView),
      // M89 cd. (bug D): ptaszek wyciszenia dla instant z wyborem celu
      // (Fake Your Own Death, Carrion Call, Negate). Dotychczas ptaszek
      // rysowany tylko w panelu akcji dla pojedynczych opcji; dla wariantów
      // wewnątrz wizarda (cast_spell z targets w entry.request) ptaszek
      // nie pojawiał się — auto-pass nie mógł pominąć takiego czaru.
      ignoredOptionKeys, onToggleIgnoredOption: toggleIgnoredOption,
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
    // B2 (2026-08-12): nie chowamy choice-request — fullscreen (z-index 2600)
    // przykrywa modal (1500). Zamknięcie odsłania wizard ataku/bloku.
    // hideModal('choice-request') wracało na stół (jak B23 przy bot-move).
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
    // Bug #2: fullscreen z miniaturki w modalu „Rozgrywka" chował
    // modal (hideModal('bot-move') w openCardFullscreenByCardId). Zamknięcie
    // fullscreen musi wrócić do modala, jeśli gra jest nadal wstrzymana
    // (awaitingBotAck). W B23 + fix nie chowamy już modala, więc to jest
    // bezpiecznik dla stanu sprzed fixa oraz dla ręcznego hide.
    if (fullscreenOpenedFromBotMove) {
      fullscreenOpenedFromBotMove = false;
      if (session?.botPausePending && els.botMove && els.botMoveBody) {
        // Treść modala już jest wyrenderowana (renderBotMoves + clearBotMoves),
        // więc wystarczy odkryć warstwę — nie wołamy showBotMoves (wyczyściłby
        // i zrobił continue).
        showModal('bot-move');
      }
    }
  }

  /**
   * Otwiera pełny ekran karty mając tylko `cardId` (gdy nie ma objectId,
   * np. miniaturka w modalu ruchu bota — `botMoves` przechowuje tylko
   * `cardId` z eventu). Dane karty czytamy z registry (analogicznie do
   * `cardInfoForFullscreen`, ale bez obiektu gry).
   */
  function openCardFullscreenByCardId(cardId) {
    if (!session || !els.cardFullscreenBody) return;
    const details = session.cardDetails(cardId);
    if (!details) return;
    hideModal('context-menu');
    // B2 (2026-08-12): nie chowamy choice-request — fullscreen przykrywa
    // wizard ataku/bloku (z-index 2600 > 1500); zamknięcie odsłania go.
    // B23 bug #2: nie chowamy modala „Rozgrywka" — fullscreen
    // (z-index 2600) przykrywa modal (z-index 1500), a zamknięcie fullscreen
    // naturalnie odsłania modal z powrotem. Poprzednie hideModal('bot-move')
    // gubiło pauzę (awaitingBotAck zostawał true, ale modal znikał bez
    // powrotu, a w panelu akcji brakowało pass).
    fullscreenOpenedFromBotMove = Boolean(els.botMove && els.botMove.className === 'modal active');
    const info = {
      name: details.name,
      colors: details.colors ?? [],
      kind: details.kind ?? inferKindForCard(details),
      types: details.types ?? [],
      subtypes: details.subtypes ?? [],
      keywords: details.keywords ?? [],
      manaCost: details.manaCost ?? null,
      power: details.power, toughness: details.toughness,
      livePower: details.power, liveToughness: details.toughness,
      spell: details.spell ?? null,
      abilities: details.abilities ?? [],
      morph: details.morph ?? null,
      set: details.set ?? null,
      imageUri: details.imageUri ?? null,
      artId: details.artId ?? null,
      faceDown: false,
    };
    fullscreenContext = null; // brak objectId → bez karuzeli strefy
    renderCardFullscreen(els.cardFullscreenBody, info, { positionText: null });
    els.cardFullscreen.className = 'fullscreen active';
    fullscreenOpenedAt = Date.now();
  }

  /**
   * Zgłoszenie właściciela A (2026-08-11): karta Undercity (inicjatywa) na stole
   * nie dawała się otworzyć na pełnym ekranie. Tapnięcie miniatury lochu
   * renderuje pełnoekranowy druk (renderCardFullscreen) — jak każdy inny kafl.
   */
  function openUndercityFullscreen() {
    if (!els.cardFullscreenBody) return;
    hideModal('context-menu');
    // B2: nie chowamy choice-request (fullscreen przykrywa modal).
    const info = {
      name: UNDERCITY_DUNGEON.name,
      colors: [],
      kind: 'card',
      types: ['Dungeon'],
      subtypes: [],
      keywords: [],
      manaCost: null,
      power: undefined, toughness: undefined,
      livePower: undefined, liveToughness: undefined,
      spell: null, abilities: [], morph: null,
      set: null,
      imageUri: UNDERCITY_DUNGEON.imageUri,
      artId: null,
      faceDown: false,
    };
    fullscreenContext = null; // brak objectId → bez karuzeli strefy
    renderCardFullscreen(els.cardFullscreenBody, info, { positionText: null });
    els.cardFullscreen.className = 'fullscreen active';
    fullscreenOpenedAt = Date.now();
  }

  /**
   * M153/C (uwaga właściciela): karta specjalna Day/Night na stole nie była
   * klikalna (brak pełnego ekranu) i nie miała hovera. Tapnięcie miniatury
   * otwiera pełnoekranowy druk wg bieżącej strony (Day/Night) — jak
   * openUndercityFullscreen dla lochu.
   */
  // M169/M: karta Poison Token (panel trucizny) — pełny ekran; karta
  // specjalna spoza rejestru (jak Day/Night i Undercity).
  function openSpecialCardFullscreen(card) {
    if (!els.cardFullscreenBody || !card) return;
    hideModal('context-menu');
    const info = {
      name: card.name,
      colors: [], kind: 'card', types: ['Card'], subtypes: [], keywords: [],
      manaCost: null, power: undefined, toughness: undefined,
      livePower: undefined, liveToughness: undefined,
      spell: null, abilities: [], morph: null, set: null,
      imageUri: card.imageUri, artId: null, faceDown: false,
    };
    fullscreenContext = null;
    renderCardFullscreen(els.cardFullscreenBody, info, { positionText: null });
    els.cardFullscreen.className = 'fullscreen active';
    fullscreenOpenedAt = Date.now();
  }

  function openDayNightFullscreen() {
    if (!els.cardFullscreenBody) return;
    hideModal('context-menu');
    const designation = session?.view?.().dayNight ?? null;
    const imageUri = designation === 'night' ? DAY_NIGHT_TOKEN.imageUriNight : DAY_NIGHT_TOKEN.imageUriDay;
    const info = {
      name: DAY_NIGHT_TOKEN.name,
      colors: [],
      kind: 'card',
      types: ['Card', 'Card'],
      subtypes: [],
      keywords: [],
      manaCost: null,
      power: undefined, toughness: undefined,
      livePower: undefined, liveToughness: undefined,
      spell: null, abilities: [], morph: null,
      set: null,
      imageUri,
      artId: null,
      faceDown: false,
    };
    fullscreenContext = null; // brak objectId → bez karuzeli strefy
    renderCardFullscreen(els.cardFullscreenBody, info, { positionText: null });
    els.cardFullscreen.className = 'fullscreen active';
    fullscreenOpenedAt = Date.now();
  }

  /** Pomocnik: rodzaj karty z samych typów (gdy `details.kind` nie jest ustawiony). */
  function inferKindForCard(details) {
    const types = details.types ?? [];
    if (types.some((t) => /land/i.test(t))) return 'land';
    if (types.some((t) => /creature/i.test(t))) return 'creature';
    return 'spell';
  }

  /** Kształt danych karty, jakiego oczekuje renderCardFullscreen. */
  function cardInfoForFullscreen(object) {
    // CR 708.2: kontroler może w każdej chwili podejrzeć SWOJE karty twarzą
    // w dół (morph) — pełny ekran odsłania je właścicielowi; cudze zostają
    // zakryte (widok gracza niesie cardId tylko dla własnych face-down).
    const isOwnFaceDown = object.faceDown && object.controllerId === HUMAN_ID;
    const details = object.faceDown && !isOwnFaceDown ? null : session.cardDetails(object.cardId);
    return {
      name: isOwnFaceDown ? (details?.name ?? session.nameOf(object.cardId)) : (object.faceDown ? 'Karta zakryta' : (details?.name ?? session.nameOf(object.cardId))),
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
      imageUri: object.faceDown && !isOwnFaceDown ? null : (details?.imageUri ?? null),
      artId: object.faceDown && !isOwnFaceDown ? null : (details?.artId ?? null),
      faceDown: Boolean(object.faceDown && !isOwnFaceDown),
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
    headerWrap.style.cursor = 'pointer';
    renderMiniFace(headerWrap, session, objectId);
    headerWrap.addEventListener('click', () => {
      hideModal('context-menu');
      openCardFullscreen(objectId);
    });
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
      if (cmd.type === 'cast_permanent' && cmd.kicked) return `perm-k:${cmd.objectId}`;
      if (cmd.type === 'cast_adventure') return `adv:${cmd.objectId}`;
      if (cmd.type === 'cast_adventure_creature') return `advc:${cmd.objectId}`;
      if (cmd.type === 'activate_ability' && (cmd.targets?.length || cmd.xValue != null || cmd.attackerId != null || cmd.crewCreatureIds?.length)) return `ability:${cmd.objectId}:${cmd.abilityIndex}`;
      if (cmd.type === 'resolve_scry') return 'resolve_scry';
      if (cmd.type === 'resolve_surveil') return 'resolve_surveil';
      if (cmd.type === 'resolve_backup') return 'resolve_backup';
      if (cmd.type === 'resolve_sacrifice_choice') return 'resolve_sacrifice';
      return cmd.type + ':' + cmd.objectId;
    };
    // M66 (B): walka w menu kontekstowym też bez list kombinacji.
    const combatEntries = groupCombatDecisions(actions, view);
    const groups = new Map();
    for (const entry of combatEntries) {
      const cmd = entry.command ?? entry.first;
      if (entry.request) {
        const btn = document.createElement('button');
        btn.className = 'action choice-request-trigger';
        btn.innerHTML = `<span class="action-label">${commandLabel(cmd, session, view)}</span>`;
        btn.addEventListener('click', () => {
          hideModal('context-menu');
          openChoiceRequest(entry.request);
        });
        actionsWrap.appendChild(btn);
        continue;
      }
      const key = groupKey(cmd);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(cmd);
    }

    for (const [key, cmds] of groups) {
      if (cmds.length > 1) {
        // Wiele celów/wariantów – otwieramy modal wyboru (jak w panelu akcji)
        const btn = document.createElement('button');
        btn.className = 'action choice-request-trigger';
        // Etykieta grupy JAK W PANELU AKCJI (uwaga A — „Wybierz wariant (N): …"
        // z pierwszym wariantem zamienione na opis CO wybieramy; 2026-08-10).
        const request = { id: `ctx-${Date.now()}-${key}`, type: cmds[0].targets?.length ? 'target' : 'command', options: cmds };
        btn.innerHTML = `<span class="action-label">${choiceGroupLabel(request, session, view)}</span>`;
        btn.addEventListener('click', () => {
          hideModal('context-menu');
          openChoiceRequest(request);
        });
        actionsWrap.appendChild(btn);
      } else {
        const cmd = cmds[0];
        const button = document.createElement('button');
        button.className = 'action';
        if (cmd.type === 'pass_priority') button.className += ' primary';
        if (cmd.type === 'concede') button.className += ' danger';
        button.innerHTML = `<span class="action-label">${commandLabel(cmd, session, view)}</span>`;
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
      // startGame() zapisał do autosave ŚWIEŻĄ grę (0 komend) — po
      // wznowieniu natychmiast nadpisujemy zapis stanem WZNOWIONYM, żeby
      // kolejne odświeżenie nie cofało partii do początku (root cause
      // zgłoszenia 2026-08-07: „odświeżenie przerywa partię").
      autosave();
      showNotice(`Wznowiono partię (${summary.steps} komend).`);
      rerender();
      showBotMoves();
      return true;
    } catch (error) {
      showNotice(`Nie udało się wznowić: ${error.message}`);
      return false;
    }
  }

  /** Start strony: autosave istnieje → wznowienie, inaczej nowa partia. */
  function resumeOrStart() {
    try {
      const raw = storage?.getItem(AUTOSAVE_KEY);
      if (raw && resumeFromSaved(raw)) return;
    } catch { /* uszkodzony zapis — startujemy nową grę */ }
    startGame();
  }

  /** Polskie nazwy faz/kroków tury dla wskaźnika (lewy górny róg). */
  const PHASE_LABELS = {
    // Fazy: „beginning"/„ending" pomijamy (widać sam krok — uwaga A, 2026-08-11).
    beginning: '', combat: 'Walka', ending: '',
    untap: 'Untap', upkeep: 'Upkeep', draw: 'Dobieranie',
    precombat_main: 'Główna 1', beginning_of_combat: 'Początek walki',
    declare_attackers: 'Atak', declare_blockers: 'Blok',
    combat_damage: 'Obrażenia', end_of_combat: 'Koniec walki',
    postcombat_main: 'Główna 2', end: 'Koniec', cleanup: 'Sprzątanie',
  };

  /** M172/A: nazwy graczy WYŁĄCZNIE dla panelu górnego (Gracz/Bot). */
  function panelPlayerName(name) {
    if (name === 'Ty') return 'Gracz';
    if (name === 'Nieprzyjaciel') return 'Bot';
    return name ?? null;
  }

  /** Aktualizuje stały wskaźnik „Tura N, <gracz>, <faza>" (lewy górny róg). */
  function updateTurnIndicator() {
    const el = document.getElementById('turn-indicator');
    if (!el) return;
    if (!session) { el.textContent = ''; return; }
    const view = session.view();
    if (view.status !== 'active') {
      el.className = 'turn-indicator finished';
      // M73c (audyt żywym testerem): po zakończeniu pokazujemy zwycięzcę —
      // samo „Koniec partii" zmuszało do czytania logu.
      const winner = (view.players ?? []).find((p) => p.id === view.winnerId);
      // M172/A (decyzja właściciela): w PANELU GÓRNYM gracze nazywają się
      // „Gracz" i „Bot" — 3. osoba bez problemów odmiany („wygrywa Ty").
      // Log i modale zachowują dotychczasowe nazwy (Ty/Nieprzyjaciel).
      const winnerName = panelPlayerName(winner?.name) ?? null;
      // CR 104.4b: remis (winnerId null + isDraw) — inaczej gracz widział samo
      // „Koniec partii" i nie wiedział, jak się skończyła.
      if (view.isDraw) el.textContent = 'Koniec partii — REMIS';
      else el.textContent = winnerName ? `Koniec partii — wygrywa ${winnerName}` : 'Koniec partii';
      return;
    }
    const who = (view.players ?? []).find((p) => p.id === view.turn.activePlayerId);
    // Uwaga A (2026-08-11): krótkie etykiety, żeby panel mieścił się na
    // telefonie — „T.", „ż."; M172/A: „Gracz"/„Bot" zamiast „Ty"/„On"
    // (odmiana 3. osoby). Przy braku miejsca CSS łamie wiersz.
    const phaseLabel = PHASE_LABELS[view.turn.phase] ?? view.turn.phase;
    const stepLabel = (view.turn.step && view.turn.step !== view.turn.phase && PHASE_LABELS[view.turn.step])
      ? PHASE_LABELS[view.turn.step] : '';
    const phaseText = [phaseLabel, stepLabel].filter(Boolean).join(' / ') || '—';
    const whoName = panelPlayerName(who?.name) ?? view.turn.activePlayerId;
    el.className = 'turn-indicator';
    el.textContent = '';
    const span = (cls, text) => {
      const s = document.createElement('span');
      s.className = cls;
      s.textContent = text;
      el.appendChild(s);
    };
    span('ti-turn', `T. ${view.turn.number}`);
    span('ti-player', whoName);
    // C2 (2026-08-11): życie swoje i przeciwnika w górnym panelu.
    const me = view.players.find((p) => p.id === view.playerId);
    const foe = view.players.find((p) => p.id !== view.playerId);
    if (me) span('ti-life', `Gracz: ${me.life} ż.`);
    if (foe) span('ti-life foe', `Bot: ${foe.life} ż.`);
    span('ti-phase', phaseText);
    // C (2026-08-11): gdy na stosie jest czar/zdolność (w tym rozstrzygana),
    // panel górny pokazuje „Stos — <nazwa wierzchniej karty>" — gracz wie,
    // że może odpowiedzieć instanitem/zdolnością (jest priorytet).
    if (view.zones.stack.length > 0) {
      // Bug wykryty żywym testerem stołu (M73b): view.zones.stack to tablica
      // OBIEKTÓW — `find((o) => o.id === topId)` porównywał id (string) z
      // całym obiektem i zawsze zwracał undefined, więc panel pokazywał
      // „Stos — ?" zamiast nazwy wierzchniej karty. Bierzemy ostatni obiekt.
      const topObj = view.zones.stack[view.zones.stack.length - 1];
      // Face-down czar (morph): tożsamość ukryta (CR 708.2) — pokazujemy
      // „Morph" zamiast „?" („?" sugerowało błąd; zgłoszenie właściciela).
      // M127: pisownia etykiety z jednego źródła (session.FACE_DOWN_LABEL).
      const topName = topObj
        ? (topObj.faceDown ? FACE_DOWN_LABEL : (session.nameOf(topObj.cardId) || topObj.cardId))
        : '?';
      const s = document.createElement('span');
      s.className = 'ti-stack';
      s.textContent = `Stos — ${topName}`;
      el.appendChild(s);
    }
  }

  /**
   * Feature 2026-08-11: przełącznik wyciszenia opcji (ptaszek w panelu akcji).
   * Po zmianie zbioru przewijamy grę, jeśli bieżące okno człowieka straciło
   * wszystkie nie-wyciszone decyzje (auto-pass do następnego realnego okna).
   *
   * M104 (znalezisko Żywego Testera): po `recheckAutoPass` BRAKOWAŁO drugiego
   * renderu. Pierwszy `rerender()` rysuje panel sprzed przewinięcia, a gra
   * zaraz potem przewija się (bot gra swoją turę), więc na ekranie zostawał
   * NIEAKTUALNY panel: kolejne tapnięcie wysyłało komendę z minionego okna
   * i gracz dostawał „Ruch odrzucony: illegal_cast / not_priority" (macierz
   * testera: 3 takie odrzucenia przy --tick-rate 0.2, zero przy 0). Przy
   * okazji gubiły się ruchy bota rozegrane w tym przewinięciu — modal
   * „Rozgrywka" nie otwierał się aż do następnej akcji gracza (oś 2).
   * Kolejność jak w playDirect: zapis → render → pokaż ruchy bota.
   */
  function toggleIgnoredOption(key) {
    if (ignoredOptionKeys.has(key)) ignoredOptionKeys.delete(key);
    else ignoredOptionKeys.add(key);
    rerender();
    if (!session?.recheckAutoPass) return;
    session.recheckAutoPass();
    autosave();
    rerender();
    showBotMoves();
  }

  function rerender() {
    if (!session) return;
    updateTurnIndicator();
    renderTableView({
      els, session, play, onCardClick, onChoiceRequest: openChoiceRequest,
      ignoredOptionKeys, onToggleIgnoredOption: toggleIgnoredOption,
      onCardDoubleClick: (objectId) => openCardFullscreen(objectId),
      // Bug C: tapnięcie nazwy karty na stosie — pełny ekran z jej tekstem.
      onStackClick: (objectId) => openCardFullscreen(objectId),
      onUndercityClick: () => openUndercityFullscreen(),
      onDayNightClick: () => openDayNightFullscreen(),
      // M169/M: Poison Token w panelu trucizny — pełny ekran (karta specjalna).
      onPoisonCardClick: (card) => openSpecialCardFullscreen(card),
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
    // M198/C: dane każdego gracza w JEGO boksie (strefy + pula many).
    if (foe) renderPlayerMeta(els.metaFoe, view, foe.id);
    if (me) renderPlayerMeta(els.metaOwn, view, me.id);

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
    // Bug #1: gdy gra jest wstrzymana na istotnym zagraniu bota
    // (awaitingBotAck), a modal został zamknięty krzyżykiem / tłem,
    // gracz zostaje na stole bez widocznego „Rozumiem". Prioritet często
    // nadal ma bot (np. po land_played), więc w legalCommands nie ma
    // pass — w panelu akcji zostaje tylko „Poddaj” i gra wygląda na
    // zawieszoną. Wstrzykujemy przycisk „Wznów grę bota" wywołujący
    // continueBotPlay (to samo co „Rozumiem"), żeby dać jawną drogę
    // wznowienia niezależną od priorytetu w grze.
    if (session.botPausePending) {
      const resumeBtn = document.createElement('button');
      resumeBtn.className = 'action primary';
      resumeBtn.textContent = '▶ Wznów grę bota';
      resumeBtn.addEventListener('click', () => closeBotMoveModalResume());
      if (els.actions) {
        if (els.actions.prepend) els.actions.prepend(resumeBtn);
        else els.actions.appendChild(resumeBtn);
        if (els.actionsDrawer) els.actionsDrawer.className = 'drawer open';
      }
      // Podbij licznik FAB (legalCommands bez wznowienia nie liczy pauzy)
      if (els.actionsFabCount) {
        const cur = parseInt(els.actionsFabCount.textContent || '0', 10);
        const curNum = Number.isFinite(cur) ? cur : 0;
        els.actionsFabCount.textContent = String(curNum + 1);
      }
    }
  }

  /**
   * Modal „Rozgrywka" (M18): bot gra w tle, a jego czary i zdolności
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
    // M98 (korekta właściciela): początek tury to ISTOTNA informacja — gracz
    // chce ją widzieć, nawet gdy nic więcej się nie wydarzyło. Modal z wpisem
    // „Tura 5 — Ty" jest więc poprawny i zostaje.
    //
    // Szumem jest wyłącznie sama nazwa FAZY bez żadnego zagrania („Faza:
    // Główna 1") — nagłówek fazy ma sens tylko jako kontekst dla akcji, którą
    // opisuje kolejna linia. Modal zawierający TYLKO takie nagłówki nie niesie
    // graczowi żadnej treści i niepotrzebnie wymusza kliknięcie „Rozumiem".
    const meaningful = moves.filter((m) => !/^Faza:/.test(m.text ?? ''));
    if (meaningful.length === 0 && moves.length > 0) {
      session.clearBotMoves();
      if (session.botPausePending) continueAfterBotPause();
      return;
    }
    if (moves.length > 0) {
      // Miniaturka w modalu otwiera pełny ekran tej samej karty (M18).
      // `onCardClick` dostaje `cardId`, nie `objectId` — modal nie ma objectId
      // (zdarzenia `noteBotMove` niosą tylko cardId). Pełny ekran
      // akceptuje oba: `openCardFullscreen` ma ścieżkę objectId, więc tu
      // otwieramy bezpośrednio `renderCardFullscreen` na podstawie cardId
      // (dane z registry, jak w hover-preview).
      renderBotMoves(els.botMoveBody, moves, session, {
        onCardClick: (cardId) => openCardFullscreenByCardId(cardId),
      });
      session.clearBotMoves();
      showModal('bot-move');
      return;
    }
    // Bezpiecznik: pauza z pustym buforem nie może zablokować partii.
    if (session.botPausePending) continueAfterBotPause();
  }

  /** Wznowienie gry po pauzie na istotnym zagraniu bota. Dwa wywołania:
   *  - klik w przycisk „Rozumiem" w modalu (stare zachowanie, zgłoszenie
   *    właściciela 2026-08-08: Rozumiem = kontynuuj, leć dalej);
   *  - bezpiecznik `showBotMoves` gdy botMoves jest puste.
   *  Nowa ścieżka zamknięcia modala (krzyżyk) NIE wywołuje tej funkcji —
   *  auto-pass zostaje wyłączony do jawnej komendy `pass_priority`. */
  function continueAfterBotPause() {
    if (!session) return;
    session.continueBotPlay();
    autosave();
    rerender();
    showBotMoves();
  }

  /**
   * Zamknięcie modala ruchu bota KRZYŻYKIEM (lub tłem). Ukrywa warstwę,
   * ale NIE wznawia gry — `awaitingBotAck` zostaje `true` i bot czeka
   * na jawną komendę gracza (`pass_priority` w panelu akcji lub
   * „Rozumiem" jeśli zdecyduje się wznowić auto-pass).
   *
   * Decyzja właściciela 2026-08-08: krzyżyk wyłącza auto-pass, gracz
   * przegląda karty we własnym tempie. Wznowienie przez `pass_priority`
   * albo klik „Rozumiem" w modalu (który zostaje na razie w HTML).
   */
  function closeBotMoveModalPause() {
    hideModal('bot-move');
    // Bug #1: po X auto-pass jest wstrzymany (awaitingBotAck = true), ale
    // w panelu akcji często nie ma pass (priorytet nadal ma bot, np. po
    // land_played). Gracz widzi tylko „Poddaj” i gra wygląda na zawieszoną.
    // Przerysuj stół, żeby wstrzyknąć przycisk „Wznów grę bota”.
    rerender();
  }
  /** Wznowienie gry i zamknięcie modala (klik w „Rozumiem"). Stare
   *  zachowanie, z którego korzysta jawna ścieżka „obejrzałem, jedź dalej". */
  function closeBotMoveModalResume() {
    hideModal('bot-move');
    if (!session) return;
    session.continueBotPlay();
    autosave();
    rerender();
    showBotMoves();
  }

  /** Jedyna droga akcji gracza: komenda → sesja → przerysowanie. */
  function playDirect(cmd) {
    const result = session.apply(cmd);
    autosave();
    rerender();
    if (result?.ok !== false) showBotMoves();
  }

  /**
   * Punkt wejścia akcji UI (panel akcji, menu kontekstowe, ChoiceRequest):
   * rzuty z NIEJEDNOZNACZNĄ płatnością many (kilka wariantów źródeł — np.
   * różne kombinacje kolorów / nonbasic landy, zgłoszenie E.3a 2026-08-06)
   * otwierają kreator „tapnij źródło po jednym"; gdy płatność jest
   * jednoznaczna (0 tapów albo jedyny wariant) zostaje auto-tap M34.
   */
  function play(cmd) {
    if (!session) { playDirect(cmd); return; }
    // M106/Z10 (audyt stołu): przy OTWARTYM kreatorze many klik w inną akcję
    // szedł prosto do playDirect — wstrzymany rzut przepadał bez śladu, nowa
    // karta była płacona auto-tapem z pominięciem kreatora, a modal zostawał
    // z nieaktualnym deskryptorem. Zamykamy kreator jawnie (z wpisem w logu,
    // żeby gracz wiedział, co się stało z poprzednim rzutem) i obsługujemy
    // nową komendę normalną ścieżką (może otworzyć własny kreator).
    if (manaWizardDescriptor) {
      const abandoned = manaWizardDescriptor.cmd;
      closeManaWizard();
      if (abandoned && session.log) {
        session.log('system', `Przerwano płatność many: ${describeAbandonedCast(abandoned)}. Mana w puli zostaje.`);
      }
    }
    const descriptor = manaWizardFor(cmd);
    if (!descriptor) { playDirect(cmd); return; }
    openManaWizard(descriptor);
  }

  /**
   * Połączona lista dostępnych źródeł many gracza (E.3a cz. A): nietapnięte
   * lądy (tap_for_mana) + nie-lądowe permanenty z aktywną zdolnością many
   * (activate_ability). Deskryptory zdolności czytamy z pełnego stanu — widok
   * pola bitwy ich nie niesie. Źródła nie-lądowe pochodzą z legalCommands
   * (gwarancja legalności/timingu/opłacalności w danej chwili).
   */
  function manaSourcesForPlayer(excludeSourceId = null) {
    const view = session.view();
    const abilityInfo = (objectId, abilityIndex) => {
      const obj = session.state?.objects?.get(objectId);
      if (!obj) return null;
      const ability = obj.abilities?.[abilityIndex];
      const effects = Array.isArray(ability?.effect) ? ability.effect : [ability?.effect];
      if (!effects.some((e) => e?.type === 'add_mana')) return null;
      const src = getSourceForObject(obj);
      return {
        cardId: obj.cardId,
        colors: src?.colors ?? [],
        amount: src?.amount ?? 0,
        manaCost: ability?.cost?.mana ?? 0,
        isLand: obj.kind === 'land' || (obj.types ?? []).includes('Land'),
      };
    };
    return manaSourcesOf(view, HUMAN_ID, abilityInfo, { excludeSourceId });
  }

  /**
   * Deskryptor kreatora dla komendy rzutu albo null (bez kreatora).
   * Kreator tylko dla człowieka przy realnym wyborze źródeł (≥2 warianty).
   */
  /**
   * M190/D (zgłoszenie właściciela, Basilisk Gate): id źródła, którego NIE
   * wolno użyć do zapłaty, bo aktywacja i tak je tapuje jako koszt
   * (CR 602.2a). Dotyczy wyłącznie zdolności z `cost.tap` — zdolność bez
   * tapnięcia (Heap Gate {1}: …) może być finansowana z własnej many.
   */
  function selfTapExclusionFor(cmd) {
    if (cmd?.type !== 'activate_ability' || !Number.isInteger(cmd.abilityIndex)) return null;
    const source = session.state?.objects?.get(cmd.objectId);
    const ability = source?.abilities?.[cmd.abilityIndex];
    return ability?.cost?.tap ? cmd.objectId : null;
  }

  function manaWizardFor(cmd) {
    const view = session.view();
    // Kreator płaci koszt EFEKTYWNY (CR 601.2f): obniżki z permanentów
    // (Etherium Sculptor) i warunkowe z karty (Metalcraft) liczy silnik na
    // pełnym stanie — widok nie niesie zdolności permanentów.
    const opts = {};
    // M168/C2: koszt activate_ability czytamy z deskryptora zdolności na
    // PEŁNYM stanie (widok nie niesie abilities obiektów) — jak
    // effectiveGeneric wyżej. Dalej wspólna ścieżka (warianty ≥2).
    if (cmd.type === 'activate_ability' && Number.isInteger(cmd.abilityIndex)) {
      const src = session.state?.objects?.get(cmd.objectId);
      const ability = src?.abilities?.[cmd.abilityIndex];
      if (ability?.cost && Number.isInteger(ability.cost.mana)) opts.ability = ability;
      else return null; // zdolność bez kosztu many — bez kreatora
    }
    const stateObject = session.state?.objects?.get(cmd.objectId);
    const parsed = stateObject ? parseManaCost(MANA_COSTS[stateObject.cardId] ?? null) : null;
    if (stateObject && parsed) {
      const nonGeneric = parsed.colored.length + parsed.hybrid.length + parsed.phyrexian.length;
      opts.effectiveGeneric = Math.max(0, effectiveSpellManaCost(session.state, stateObject) - nonGeneric);
    }
    // Escape (E.3a cz. B): widok GROBÓW nie niesie spell.escape, więc koszt
    // czytamy z pełnego stanu i podajemy deskryptorowi (jak effectiveGeneric).
    if (cmd.type === 'cast_escape' && Number.isInteger(stateObject?.spell?.escape?.cost)) {
      opts.escapeCost = stateObject.spell.escape.cost;
    }
    const descriptor = paymentDescriptorOf(cmd, view, opts);
    if (!descriptor) return null;
    const pool = (view.players ?? []).find((p) => p.id === HUMAN_ID)?.mana ?? 0;
    const sources = manaSourcesForPlayer(selfTapExclusionFor(cmd));
    const variants = countPaymentVariants(sources, pool, descriptor.totalNeeded, descriptor.requirements);
    if (variants < 2) return null;
    return { ...descriptor, cmd };
  }

  /** Otwiera modal kreatora many dla wstrzymanej komendy. */
  /** Krótki opis rzutu porzuconego przy zamknięciu kreatora many (M106/Z10). */
  function describeAbandonedCast(cmd) {
    const view = session?.view?.();
    const object = ['hand', 'battlefield', 'graveyard'].flatMap((z) => view?.zones?.[z] ?? [])
      .find((o) => o.id === cmd.objectId);
    return object?.cardId ? session.nameOf(object.cardId) : 'wstrzymana akcja';
  }

  function openManaWizard(descriptor) {
    if (!els.manaWizardBody) return;
    manaWizardDescriptor = descriptor;
    refreshManaWizard();
    showModal('mana-wizard');
  }

  /** Zamyka modal i zapomina wstrzymaną komendę (Anuluj / poza kontekstem). */
  function closeManaWizard() {
    manaWizardDescriptor = null;
    hideModal('mana-wizard');
  }

  /**
   * Odświeża postęp kreatora z bieżącego widoku; po zebraniu sumy (pula ≥
   * kosztu i kolory pokryte tapniętymi źródłami) odpala wstrzymaną komendę.
   * Gdyby komenda w międzyczasie wypadła z legalnych (nie powinno — priorytet
   * jest nasze), zamyka kreator bez akcji i zostawia manę w puli.
   */
  function refreshManaWizard() {
    if (!manaWizardDescriptor || !els.manaWizardBody || !session) return;
    const view = session.view();
    const sources = manaSourcesForPlayer(selfTapExclusionFor(manaWizardDescriptor.cmd));
    // Kolorowa pula (cz. 8): pokrycie kolorów z jednostek many W PULI gracza
    // (odzwierciedlają tapnięte źródła). main.js czyta pulę z pełnego stanu sesji.
    const humanPlayer = session.state?.players?.find((pl) => pl.id === HUMAN_ID);
    const poolUnits = expandManaPool(humanPlayer?.manaPool);
    const progress = wizardProgress(view, HUMAN_ID, manaWizardDescriptor, sources, poolUnits);
    if (progress.done) {
      const pending = manaWizardDescriptor;
      const stillLegal = (view.legalCommands ?? []).some((c) => c.type === pending.cmd.type
        && c.objectId === pending.cmd.objectId
        && JSON.stringify(c.targets ?? null) === JSON.stringify(pending.cmd.targets ?? null));
      closeManaWizard();
      if (stillLegal) playDirect(pending.cmd);
      else showNotice('Płatność zebrana, ale zagranie nie jest już dostępne — mana została w puli.');
      return;
    }
    renderManaWizard(els.manaWizardBody, {
      costStr: manaWizardDescriptor.costStr,
      remainingTotal: progress.remainingTotal,
      requirements: progress.requirements,
      untappedSources: progress.untappedSources.map((src) => ({ ...src, name: session.nameOf(src.cardId) })),
    }, {
      // Tapnięcie źródła: ląd → tap_for_mana, zdolność many → activate_ability
      // (E.3a cz. A). Po komendzie czytamy znowu pulę/widok (Skarb znika, dork
      // zatapnięty, pool wzrósł o net zysk).
      onTapSource: (objectId) => {
        const src = sources.find((s) => s.id === objectId);
        const command = src?.command ?? { type: 'tap_for_mana', playerId: HUMAN_ID, objectId };
        // Kolor tapniętego źródła trafia do KOLOROWEJ PULI (engine), więc pokrycie
        // kolorów liczy się samo z puli — bez śledzenia committed (cz. 8).
        playDirect(command);
        refreshManaWizard();
      },
      onCancel: () => closeManaWizard(),
    });
  }

  /** Losowe ziarno tasowania (przycisk „Tasuj talię", zgłoszenie 2026-08-07). */
  function randomSeed() {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return (buf[0] % 999999) + 1;
    }
    return Math.floor(Math.random() * 999999) + 1;
  }

  function startGame() {
    // M198/B: nowa partia zamyka wiszący komunikat. Dawniej pas tekstu był
    // czyszczony przez `statusNote.textContent = ''`; przy warstwie modala
    // odpowiednikiem jest jej zamknięcie — inaczej komunikat z poprzedniej
    // akcji (np. „Nowe ziarno…") zostawał na ekranie nad świeżą grą.
    hideModal('notice');
    const seed = Number.parseInt(el('seed').value, 10);
    const humanKey = el('deck-human').value;
    const botKey = el('deck-bot').value;
    try {
      if (!Number.isInteger(seed)) throw new Error('Ziarno musi być liczbą całkowitą');
      // Ta sama talia dla gracza i bota jest dozwolona (mirror match) —
      // egzemplarze obiektów mają prefiksy graczy, kolizji nie ma.
      // K1: talie własne (custom:*) żyją obok repozytorium — jedno źródło.
      const decks = new Map([
        [HUMAN_ID, parseDeckText(windowAllDecks[humanKey] ?? repoDecks[humanKey], registry).cardIds],
        [BOT_ID, parseDeckText(windowAllDecks[botKey] ?? repoDecks[botKey], registry).cardIds],
      ]);
      session = createSession({ seed, registry, decks, pauseOnBotMoves: true, ignoredOptionKeys });
      // Nowa gra unieważnia wstrzymany rzut kreatora many (E.3a): deskryptor
      // odnosił się do starej sesji, więc zamykamy modal i zapominamy komendę.
      closeManaWizard();
      renderCardPreview(el('card-preview-body'), null, { imageMode: currentImageMode });
      autosave();
      rerender();
      // Bot mógł zacząć partię — pokaż jego pierwsze istotne zagranie (pauza).
      showBotMoves();
    } catch (error) {
      showNotice(`Nie udało się rozpocząć partii: ${error.message}`);
    }
  }

  function exportReplay() {
    if (!session) { showNotice('Najpierw rozpocznij partię.'); return; }
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
    if (!session) { showNotice('Najpierw rozpocznij partię — import odtwarza zapis w składzie bieżących talii.'); return; }
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
    // M162/A (uwaga właściciela): plik zapisany przez „Zapisz jako..."
    // niesie opcje z poprzedniego uruchomienia w DOM — populacja jest
    // IDEMPOTENTNA (czyści select przed wypełnieniem), więc lokalna
    // kopia zapisana z przeglądarki nie dubluje talii.
    populateDeckSelects([el('deck-human'), el('deck-bot')], repoDecks);
    const defaultHuman = deckKeys.includes('synthetic-aggro') ? 'synthetic-aggro' : deckKeys[0];
    const defaultBot = deckKeys.includes('synthetic-growth') ? 'synthetic-growth' : deckKeys.find((key) => key !== defaultHuman);
    el('deck-human').value = defaultHuman;
    el('deck-bot').value = defaultBot;
    el('new-game').addEventListener('click', startGame);
    // „Tasuj talię" (2026-08-07): losowe ziarno — następne „Rozpocznij
    // partię" zagra z nowym tasowaniem. Bieżącej partii nie dotyka.
    el('shuffle-seed')?.addEventListener('click', () => {
      el('seed').value = String(randomSeed());
      showNotice(`Nowe ziarno: ${el('seed').value} — kliknij „Rozpocznij partię", żeby zagrać z tym tasowaniem.`);
    });
    el('export-replay').addEventListener('click', exportReplay);
    el('import-replay').addEventListener('click', importReplay);
    el('resume-replay').addEventListener('click', () => {
      const text = el('replay-out').value.trim();
      if (!text) { showNotice('Wklej zapis partii do pola tekstowego.'); return; }
      resumeFromSaved(JSON.stringify({ seed: session?.state.seed ?? Number.parseInt(el('seed').value, 10), humanDeck: el('deck-human').value, botDeck: el('deck-bot').value, replay: text }));
    });
    el('resume-save').addEventListener('click', () => {
      try {
        const raw = storage?.getItem(AUTOSAVE_KEY);
        if (!raw) { showNotice('Brak autosave do wznowienia.'); return; }
        resumeFromSaved(raw);
      } catch {
        showNotice('Nie udało się odczytać autosave.');
      }
    });
    refreshResumePanel();
    // M197/A5: sekcja „Biblioteka — podgląd topu (syntetyczny)" usunięta.
    // M198/D: inspektor otwiera osobny, wycentrowany przycisk pod boksami.
    el('zone-inspector-open')?.addEventListener('click', () => showModal('library-menu-panel'));
    // M198/B: zamknięcie komunikatu (guzik „Rozumiem" i ✕).
    el('notice-ok')?.addEventListener('click', () => hideModal('notice'));
    el('notice-close')?.addEventListener('click', () => hideModal('notice'));
    el('zone-inspector-close').addEventListener('click', () => hideModal('library-menu-panel'));
    el('card-preview-close').addEventListener('click', () => hideModal('card-preview'));
    el('context-menu-close').addEventListener('click', () => hideModal('context-menu'));
    el('choice-request-close').addEventListener('click', () => hideModal('choice-request'));
    el('mana-wizard-close').addEventListener('click', () => closeManaWizard());
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
    // Modal ruchu bota: dwie drogi zamkniecia (decyzja wlasciciela 2026-08-08):
    //   • Rozumiem → stare zachowanie: wznowienie gry (auto-pass jedzie
    //     dalej przez closeBotMoveModalResume).
    //   • X (krzyzyk) → pauzuje auto-pass: zamyka modal BEZ wznawiania
    //     gry, awaitingBotAck zostaje true, gracz musi jawnie kliknac
    //     pass_priority (albo Rozumiem), zeby bot jechal dalej.
    //   • Klik w tlo modala = jak krzyzyk (zamknij, pauzuj), zeby gest
    //     zamkniecia mial jedna konsekwencje bez wzgledu na to, czy gracz
    //     trafil w tlo czy w X.
    const botMoveOk = el('bot-move-ok');
    if (botMoveOk) botMoveOk.addEventListener('click', closeBotMoveModalResume);
    const botMoveClose = el('bot-move-close');
    if (botMoveClose) botMoveClose.addEventListener('click', closeBotMoveModalPause);
    // Wysuwany panel akcji: FAB otwiera, ✕ zamyka (auto-otwarcie w rerender).
    if (els.actionsFab) els.actionsFab.addEventListener('click', () => {
      if (els.actionsDrawer) els.actionsDrawer.className = 'drawer open';
    });
    if (els.actionsDrawerClose) els.actionsDrawerClose.addEventListener('click', () => {
      if (els.actionsDrawer) els.actionsDrawer.className = 'drawer';
    });
    // Klik w tlo warstwy (poza karta modala) zamyka ja; modal ruchu bota
    // PAUZUJE (closeBotMoveModalPause) — klik w tlo to gest „zamknij,
    // pauzuj", taki sam jak X. Wznowienie jest w „Rozumiem" (osobny handler).
    for (const modalId of ['library-menu-panel', 'card-preview', 'context-menu', 'choice-request', 'bot-move', 'mana-wizard']) {
      const modal = el(modalId);
      modal.addEventListener('click', (event) => {
        if (event.target !== modal) return;
        // Odprysk gestu otwierajacego (iOS double-tap) — patrz showModal.
        if (Date.now() - (modalOpenedAt[modalId] ?? 0) < MODAL_OPEN_GUARD_MS) return;
        if (modalId === 'bot-move') closeBotMoveModalPause();
        else if (modalId === 'mana-wizard') closeManaWizard();
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
    resumeOrStart();
  } else {
    showNotice('Brak wstrzykniętych talii (REPO_DECKS) — strona działa tylko z testem silnika. Otwórz plik zbudowany przez tools/build.mjs.');
    for (const id of ['new-game', 'export-replay', 'import-replay']) el(id).disabled = true;
  }
}

runSelfTest();
bootstrapTable();
