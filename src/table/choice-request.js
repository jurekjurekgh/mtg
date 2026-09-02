import { choiceResponse } from '../protocol/types.js';
import { renderPickerRow, renderPickerSection } from './picker.js';
import { OPTION_IGNORABLE_TYPES, polishPluralCount } from './render.js';
import { commandOptionKey, FACE_DOWN_LABEL } from './session.js';
import { commandForSelection, commandForMulliganSelection, commandForSacrificeSelection } from './multi-target.js';

function clearChoiceElement(element) {
  if (element) element.textContent = '';
}

function choiceNode(parent, tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  parent?.appendChild(element);
  return element;
}

/**
 * Renderuje protokołowy ChoiceRequest w modalnym panelu UI.
 * `labelForOption` pozostaje po stronie stołu, bo tylko sesja zna nazwy kart
 * i polskie etykiety komend. Odpowiedź jest walidowana przez protocol/types.js.
 */
/** Polskie nazwy typów wyboru w nagłówku modala. */
const CHOICE_TYPE_LABELS = Object.freeze({
  scry: 'Scry',
  surveil: 'Surveil — karty do grobu i kolejność na wierzchu',
  clash: 'Clash — wierzch albo spód biblioteki',
  'room-target': 'Cel pokoju lochu Undercity',
  sacrifice: 'Poświęć stwora (własnego wyboru)',
  phyrexian: 'Płatność phyrexian many ({W/P}: mana albo 2 życia)',
  target: 'Cel',
  value: 'Wartość X',
  command: 'Działanie',
});

/**
 * M201/C2 (zgłoszenie właściciela, Dreams of Steel and Oil): „karty możliwe
 * do wybrania w modalu powinny być klikalne (img na całą stronę), bo mogę ich
 * nie znać”. Opcja, która wskazuje KARTĘ, dostaje przycisk lupy otwierający
 * pełny ekran — dokładnie ten sam, co przy scry/surveil. Rozpoznanie karty
 * jest generyczne (`cardIdOfOption` dostarcza wywołujący, bo tylko on ma
 * pełny stan sesji), więc działa dla każdej rodziny decyzji.
 */
/**
 * M202/B (uwaga właściciela 2026-08-24): karta, którą podgląda lupa przy opcji
 * decyzji.
 *
 * Zgłoszenie: „Przycisk «Podejrzyj kartę» podgląda kartę używającą zdolności,
 * a nie kartę celu zdolności — przy Ghost Warden i 4 celach mogę 4 razy
 * podejrzeć Ghost Warden”. Opcja wyboru CELU dotyczy celu, a karta używająca
 * zdolności jest i tak widoczna (ręka/stół). Dlatego identyfikatory CELU idą
 * przed `cardId`/`objectId` komendy; opcja bez celu (rzut czaru, rezygnacja)
 * nadal podgląda kartę, której dotyczy.
 *
 * `resolveCardId(id)` tłumaczy identyfikator (cardId albo objectId) na cardId
 * znany katalogowi i zwraca `null`, gdy to nie karta (np. cel-gracz) — dzięki
 * temu funkcja jest czysta i testowalna bez sesji (wstrzyknięcie, nie import).
 */
export function previewCardIdOfOption(option, resolveCardId) {
  if (!option || typeof option !== 'object' || typeof resolveCardId !== 'function') return null;
  const ordered = [
    // cele (zdolności, czary, decyzje wyboru celu)
    ...(Array.isArray(option.targets) ? option.targets : []),
    ...(Array.isArray(option.targetIds) ? option.targetIds : []),
    option.targetId, option.keepId, option.sacrificeTargetId, option.chosenCardId,
    option.exileTargetId, option.tapCreatureId,
    ...(Array.isArray(option.cardIds) ? option.cardIds : []),
    // dopiero potem karta, której dotyczy sama komenda
    option.cardId, option.objectId,
  ];
  for (const id of ordered) {
    if (typeof id !== 'string') continue;
    const cardId = resolveCardId(id);
    if (cardId) return cardId;
  }
  return null;
}

export function renderChoiceRequest(host, request, { labelForOption, onResponse, introLabel, ignoredOptionKeys = null, onToggleIgnoredOption = null, onOpenCard = null, cardIdOfOption = null }) {
  clearChoiceElement(host);
  // introLabel (choiceGroupTitle) — opis wyboru jak w panelu akcji (uwaga A);
  // bez niego fallback na mapę typów.
  // M86: textContent body skleja bloki bez separatora („MulliganMulligan:").
  // Kończymy intro nową linią; każda opcja też zaczyna się od \n.
  choiceNode(host, 'div', 'choice-request-intro', `${introLabel ?? `Wybierz: ${CHOICE_TYPE_LABELS[request.type] ?? request.type}`}\n`);
  const options = choiceNode(host, 'div', 'choice-request-options');
  // Feature 2026-08-11 + M89 cd.: opcje z OPTION_IGNORABLE_TYPES dostają
  // ptaszek wyciszenia (nie przerywaj auto-passu). Dotychczas ptaszek
  // rysowany był wyłącznie w panelu akcji dla pojedynczych komend — dla
  // opcji wewnątrz wizarda wyboru (np. cast_spell z targets w modalnym
  // wyborze celu) ptaszek się nie pojawiał. Bez ptaszka Fake Your Own
  // Death (instant z wyborem celu) nie mógł być wyciszony i auto-pass
  // zatrzymywał się na nim, mimo że właściciel chciał go pominąć.
  // M180/Z4: JEDNA lista typów wyciszalnych (render.OPTION_IGNORABLE_TYPES)
  // dla panelu akcji I modala wyboru — w tym grupa Halo Foragera.
  const IGNORABLE_IN_CHOICE = new Set(OPTION_IGNORABLE_TYPES);
  for (const option of request.options) {
    const button = choiceNode(options, 'button', 'action choice-request-option');
    button.type = 'button';
    // M104 (oś 4 detektorów): klucz opcji dla sondy „oferta bez skutku\"
    // Żywego Testera — dokładnie tak jak przyciski panelu „Twoje działania\"
    // (render.js). Opcje modala to KOMENDY z legalCommands, więc mostek
    // window.__mtgDebug znajduje je po tym samym `commandOptionKey`. Bez
    // tego sonda widziała wyłącznie WARIANT PIERWSZY grupy (klucz z panelu),
    // a to w modalu zapadają decyzje o celu, trybie i wariancie kosztu.
    if (option && typeof option === 'object' && button.dataset) {
      button.dataset.optionKey = commandOptionKey(option);
    }
    // Etykiety opcji pochodzą z commandLabel i zawierają HTML (ikony many z
    // manaCostHtml; nazwy kart już escape'owane) — przez innerHTML, tak jak
    // przyciski panelu „Twoje działania". textContent pokazywał surowy
    // „<span class=\"ms-group\">…" (uwaga właściciela A2, 2026-08-10).
    if (labelForOption) button.innerHTML = `<span class="action-label">\n${labelForOption(option)}</span>`;
    else button.textContent = `\n${option}`;
    // Ptaszek wyciszenia (label z paddingiem) dla opcji ignorowalnych.
    // Identyczny kontrakt jak w render.js panelu akcji: klik w label
    // przełącza checkbox natywnie; stopPropagation chroni przycisk.
    if (onToggleIgnoredOption && IGNORABLE_IN_CHOICE.has(option.type)) {
      const key = commandOptionKey(option);
      const label = document.createElement('label');
      label.className = 'action-ignore';
      label.title = 'Zaznacz: ta opcja nie przerywa auto-passu';
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.className = 'action-ignore-input';
      toggle.checked = Boolean(ignoredOptionKeys && ignoredOptionKeys.has(key));
      label.appendChild(toggle);
      label.addEventListener('click', (e) => e?.stopPropagation?.());
      toggle.addEventListener('change', () => onToggleIgnoredOption(key));
      button.appendChild(label);
    }
    button.addEventListener('click', () => {
      const response = choiceResponse(request, option);
      onResponse?.(response);
    });
    // M201/C2: podgląd karty przy opcji (osobny przycisk — klik w samą opcję
    // ma nadal ZATWIERDZAĆ wybór, a nie otwierać obrazek).
    const previewCardId = onOpenCard && cardIdOfOption ? cardIdOfOption(option) : null;
    if (previewCardId) {
      const peek = choiceNode(options, 'button', 'ghost-btn choice-request-peek', '🔍 Podgląd karty');
      peek.type = 'button';
      if (peek.dataset) peek.dataset.previewCardId = previewCardId;
      peek.addEventListener('click', (event) => {
        event?.stopPropagation?.();
        onOpenCard(previewCardId);
      });
    }
  }
  if (request.options.length === 0) {
    choiceNode(host, 'div', 'zone-empty', 'Brak dostępnych wariantów.');
  }
  return host;
}
// =============================================================================
// Sekwencyjny wizard scry/surveil (zgłoszenie właściciela 2026-08-06, pkt 4)
// =============================================================================

/**
 * Czy żądanie wyboru to komplet wariantów scry/surveil dla TEGO gracza — wtedy
 * zamiast listy wszystkich kombinacji pokazujemy wizard krok po kroku.
 * Zwraca 'scry' | 'surveil' | null. Bez zmiany protokołu: warstwa UI i tak
 * wysyła jedną pełną komendę resolve_* — składa ją dopiero na końcu kroków.
 */
export function lookWizardKindOf(request, view) {
  const options = request?.options ?? [];
  if (options.length === 0) return null;
  const type = options[0]?.type;
  if (!options.every((cmd) => cmd.type === type)) return null;
  // Index (APC): pojedyncza komenda resolve_index_choice (engine nie
  // enumeruje 5! permutacji) — wizard układa karty od góry (M65).
  if (type === 'resolve_index_choice') {
    const pending = view?.pendingIndex;
    if (!pending || pending.playerId !== view?.playerId || !Array.isArray(pending.cards) || pending.cards.length === 0) {
      return null;
    }
    return 'index';
  }
  // M260/A: Fertile Thicket — decyzja „zaglądnąć?” musi zapaść PRZED
  // pokazaniem kart, więc zwykła lista opcji (z nazwami landów w etykietach)
  // psuje „you may look”. Wizard dostaje karty z pendingFertileThicket.
  if (type === 'resolve_fertile_thicket') {
    const pending = view?.pendingFertileThicket;
    if (!pending || pending.playerId !== view?.playerId || !Array.isArray(pending.cards) || pending.cards.length === 0) {
      return null;
    }
    return 'fertile';
  }
  if (type !== 'resolve_surveil' && type !== 'resolve_scry') return null;
  const pending = type === 'resolve_surveil' ? view?.pendingSurveil : view?.pendingScry;
  if (!pending || pending.playerId !== view?.playerId || !Array.isArray(pending.cards) || pending.cards.length === 0) {
    return null;
  }
  return type === 'resolve_surveil' ? 'surveil' : 'scry';
}

/**
 * Wizard decyzji scry/surveil: najpierw PEŁNA LISTA przeglądniętych kart
 * (zgłoszenie: „piszesz jakie karty wyciągnęło Surveil"), potem JEDNA decyzja
 * na kartę po kolei (grób/wierzch albo spód/wierzch) — NIE lista wszystkich
 * kombinacji. Surveil z ≥2 kartami zostającymi na wierzchu ma jeszcze krok
 * kolejności (klikane od góry). Po ostatnim kroku wywołuje onComplete:
 * surveil → { millIds, topOrder }, scry → { bottomIds }.
 */
export function renderLookWizard(host, { kind, cards, onComplete, onCancel, probeKeyFor = null, onOpenCard = null }) {
  const list = Array.isArray(cards) ? cards.slice() : [];
  const labels = kind === 'surveil'
    ? { intro: `Surveil ${list.length} — obejrzane karty:`, toBad: 'Na cmentarz', toGood: 'Na wierzch biblioteki', badMark: '→ cmentarz', goodMark: '→ wierzch' }
    : kind === 'index'
      ? { intro: `Wierzch biblioteki — ${list.length} ${polishPluralCount(list.length, 'karta', 'karty', 'kart')} (ułóż w dowolnej kolejności):`, toBad: '', toGood: '', badMark: '', goodMark: '' }
      : { intro: `Scry ${list.length} — obejrzane karty:`, toBad: 'Na spód biblioteki', toGood: 'Zostaw na wierzchu', badMark: '→ spód', goodMark: '→ wierzch' };
  const badIds = []; // surveil: millIds · scry: bottomIds
  const keptIds = kind === 'index' ? list.map((card) => card.id) : []; // index: wszystkie zostają, liczy się kolejność
  const orderIds = []; // surveil/index: docelowa kolejność wierzchu (od góry)
  const decisions = new Map(); // id → 'bad' | 'top'

  const renderIntro = () => {
    // M87: textContent body skleja inline span-y („1. Curate2. Woolly").
    // Intro i każda karta dostają \n — jak renderChoiceRequest (M86).
    choiceNode(host, 'div', 'choice-request-intro', `${labels.intro}\n`);
    const looked = choiceNode(host, 'div', 'look-wizard-cards');
    list.forEach((card, index) => {
      const mark = decisions.get(card.id);
      const suffix = mark === 'bad' ? ` ${labels.badMark}` : mark === 'top' ? ` ${labels.goodMark}` : '';
      // M167/C: nazwa karty w liście jest KLIKALNA (pełnoekranowa ilustracja)
      // — gracz nie pamięta z nazwy, co karta robi.
      const row = choiceNode(looked, 'div', 'look-wizard-card', `\n${index + 1}. `);
      if (onOpenCard && card.cardId) {
        const nameSpan = choiceNode(row, 'span', 'look-wizard-card-name log-card', card.name);
        nameSpan.dataset.cardId = card.cardId;
        nameSpan.addEventListener('click', () => onOpenCard(card.cardId));
      } else {
        // Bez handleru pełnoekranu (np. stare wywołania/testy): nazwa jako
        // zwykły span tekstowy — bez createTextNode (mini-harnesy UI).
        choiceNode(row, 'span', '', card.name ?? '');
      }
      if (suffix) choiceNode(row, 'span', '', suffix);
    });
  };
  const renderCancel = () => {
    const cancel = choiceNode(host, 'button', 'ghost-btn look-wizard-cancel', 'Zamknij (dokończysz później)');
    cancel.type = 'button';
    cancel.addEventListener('click', () => onCancel?.());
  };
  const finish = () => {
    // topOrder musi być permutacją kart zostających na wierzchu — przy 0/1
    // karcie krok kolejności jest zbędny i trywialna permutacja wystarczy.
    // M148: scry jak surveil — gracz wybiera KOLEJNOŚĆ reszty na wierzchu.
    const topOrder = orderIds.length > 0 ? [...orderIds] : [...keptIds];
    if (kind === 'index') onComplete?.({ order: topOrder });
    else if (kind === 'surveil') onComplete?.({ millIds: [...badIds], topOrder });
    else onComplete?.({ bottomIds: [...badIds], topOrder });
  };
  const stepOrder = () => {
    clearChoiceElement(host);
    renderIntro();
    choiceNode(host, 'div', 'choice-request-intro', kind === 'index'
      ? 'Ustaw nową kolejność od góry — wybieraj karty po kolei:'
      : 'Wybierz w kolejności od najwyższej do najniższej na szczycie biblioteki:');
    const options = choiceNode(host, 'div', 'choice-request-options');
    const remaining = keptIds.filter((kept) => !orderIds.includes(kept));
    for (const id of remaining) {
      const card = list.find((c) => c.id === id);
      // M149 (uwaga B właściciela): komunikat nie brzmi już generycznie
      // „Kolejna karta na wierzchu", tylko enumeruje KONKRETNĄ kartę i jej
      // pozycję od góry — gracz widzi, którą układa.
      const pos = orderIds.length + 1;
      const button = choiceNode(options, 'button', 'action choice-request-option',
        `${pos}. na wierzchu: ${card?.name ?? id}`);
      button.type = 'button';
      // M136 (backlog: „sonda surveil — decyzja pośrednia nie ma klucza"):
      // krok kolejności był ostatnim miejscem wizarda scry/surveil poza
      // pomiarem Żywego Testera. Klucz da się policzyć wtedy, gdy TO
      // kliknięcie domyka wizard — czyli przy OSTATNIEJ nieuporządkowanej
      // karcie (albo gdy została już tylko jedna). Wcześniej komenda nie jest
      // jeszcze znana i klucza świadomie nie ma (uczciwiej niż zgadywać).
      const finishesNow = orderIds.length + 1 === keptIds.length;
      if (probeKeyFor && finishesNow && button.dataset) {
        const finalOrder = [...orderIds, id];
        const key = kind === 'index'
          ? probeKeyFor({ order: [...finalOrder] })
          : kind === 'surveil'
            ? probeKeyFor({ millIds: [...badIds], topOrder: [...finalOrder] })
            : probeKeyFor({ bottomIds: [...badIds], topOrder: [...finalOrder] });
        if (key) button.dataset.optionKey = key;
      }
      button.addEventListener('click', () => {
        orderIds.push(id);
        if (orderIds.length === keptIds.length) finish();
        else stepOrder();
      });
    }
    renderCancel();
  };
  const stepCard = (index) => {
    clearChoiceElement(host);
    renderIntro();
    const card = list[index];
    choiceNode(host, 'div', 'look-wizard-current', `Karta ${index + 1} z ${list.length}: ${card.name}`);
    const options = choiceNode(host, 'div', 'choice-request-options');
    // M112 (oś „noop"): jeżeli TO kliknięcie kończy wizard, znamy już komendę,
    // którą wyśle — dopinamy klucz sondy, żeby Żywy Tester mógł zmierzyć
    // scry/surveil tak samo jak zwykłe oferty. Gdy po decyzji nastąpi jeszcze
    // krok kolejności (surveil z ≥2 kartami na wierzchu), komendy jeszcze nie
    // znamy i klucza nie ma — to uczciwsze niż zgadywanie.
    const finishingKey = (nextBad, nextKept) => {
      if (!probeKeyFor) return null;
      if (index + 1 < list.length) return null;
      // Surveil/scry: gdy ≥2 karty zostają na wierzchu, po decyzjach następuje
      // jeszcze krok KOLEJNOŚCI — komenda nie jest jeszcze znana, klucza brak.
      if ((kind === 'surveil' || kind === 'scry') && nextKept.length >= 2) return null;
      if (kind === 'surveil') return probeKeyFor({ millIds: [...nextBad], topOrder: [...nextKept] });
      if (kind === 'scry') return probeKeyFor({ bottomIds: [...nextBad], topOrder: [...nextKept] });
      return probeKeyFor({ order: [...nextKept] });
    };
    const bad = choiceNode(options, 'button', 'action choice-request-option', labels.toBad);
    bad.type = 'button';
    const badKey = finishingKey([...badIds, card.id], [...keptIds]);
    if (badKey && bad.dataset) bad.dataset.optionKey = badKey;
    bad.addEventListener('click', () => {
      decisions.set(card.id, 'bad');
      badIds.push(card.id);
      next(index);
    });
    const good = choiceNode(options, 'button', 'action choice-request-option', labels.toGood);
    good.type = 'button';
    const goodKey = finishingKey([...badIds], [...keptIds, card.id]);
    if (goodKey && good.dataset) good.dataset.optionKey = goodKey;
    good.addEventListener('click', () => {
      decisions.set(card.id, 'top');
      keptIds.push(card.id);
      next(index);
    });
    renderCancel();
  };
  const next = (index) => {
    if (index + 1 < list.length) { stepCard(index + 1); return; }
    // Surveil/scry: reszta na wierzchu „in any order" (CR 701.18/701.41) —
    // przy ≥2 pytamy o kolejność (M148, zgłoszenie właściciela).
    if ((kind === 'surveil' || kind === 'scry') && keptIds.length >= 2) stepOrder();
    else finish();
  };

  clearChoiceElement(host);
  if (kind === 'index') {
    renderIntro();
    stepOrder();
    return;
  }
  if (list.length === 0) {
    choiceNode(host, 'div', 'zone-empty', 'Brak kart do decyzji.');
    return host;
  }
  stepCard(0);
  return host;
}

// =============================================================================
// M260/A (uwaga właściciela z testów PR #89): Fertile Thicket — wizard
// „zaglądnij → wybierz basic land → ułóż resztę na spodzie”.
// =============================================================================

/**
 * Wizard decyzji Fertile Thicket (BFZ). Oracle: „you may LOOK AT the top five
 * cards of your library. If you do, reveal up to one BASIC LAND card from
 * among them, then put that card on top of your library and the rest on the
 * bottom in any order.”
 *
 * Trzy kroki (zgłoszenie A1/A2/A3):
 *  1. „Zaglądnij?” — decyduje O PATRZENIU, zanim UI pokaże JAKĄKOLIWIEK
 *     nazwę karty (inaczej rezygnacja jest pozorna: gracz i tak widział
 *     Mountain/Island w etykietach opcji).
 *  2. Po zajrzeniu — pełna lista obejrzanych kart (klikalne nazwy) +
 *     przycisk „<basic land> na wierzch biblioteki” dla KAŻDEGO basic landa
 *     (nie-basic landy i nie-landy nie są do wzięcia — A2) + „Bez basic
 *     landa” (cała piątka na spód).
 *  3. Sorter kolejności spodu — klikana od najbliższej wierzchu, dokładnie
 *     jak kolejność wierzchu w wizardzie scry/surveil (A3; engine waliduje
 *     permutację `bottomOrder`).
 *
 * Kończy się onComplete: { skip: true } | { chosenCardId, bottomOrder }.
 * chosenCardId może być null („bez landa”) — wtedy bottomOrder to cała piątka.
 */
export function renderFertileThicketWizard(host, { cards, basicLandIds = [], sourceName = null, onComplete, onCancel, onOpenCard = null, probeKeyFor = null }) {
  const list = Array.isArray(cards) ? cards.slice() : [];
  const basic = new Set(basicLandIds);
  const bottomOrder = [];
  let chosenCardId = null;

  // M212/ADR 0002: nazwa karty przychodzi z DANYCH (sourceName ←
  // pendingFertileThicket.sourceCardId); fallback opisuje mechanikę, nie kartę.
  const title = sourceName ?? 'Zajrzenie w wierzch biblioteki';

  const renderLookedCards = (mark) => {
    const looked = choiceNode(host, 'div', 'look-wizard-cards');
    list.forEach((card, index) => {
      const row = choiceNode(looked, 'div', 'look-wizard-card', `\n${index + 1}. `);
      if (onOpenCard && card.cardId) {
        const nameSpan = choiceNode(row, 'span', 'look-wizard-card-name log-card', card.name);
        nameSpan.dataset.cardId = card.cardId;
        nameSpan.addEventListener('click', () => onOpenCard(card.cardId));
      } else {
        choiceNode(row, 'span', '', card.name ?? '');
      }
      // A2: basic landy oznaczone — gracz widzi, które może położyć na wierzch.
      if (basic.has(card.id)) choiceNode(row, 'span', '', ' · basic land');
      const suffix = mark === card.id ? ' → wierzch' : bottomOrder.includes(card.id)
        ? ` → spód (${bottomOrder.indexOf(card.id) + 1}.)`
        : '';
      if (suffix) choiceNode(row, 'span', '', suffix);
    });
  };

  const renderCancel = () => {
    const cancel = choiceNode(host, 'button', 'ghost-btn look-wizard-cancel', 'Zamknij (dokończysz później)');
    cancel.type = 'button';
    cancel.addEventListener('click', () => onCancel?.());
  };

  /** Ostatni krok sortera: przycisk zna już CAŁĄ komendę (jak M136). */
  const finish = () => {
    onComplete?.({ chosenCardId, bottomOrder: [...bottomOrder] });
  };
  const probeKeyOfFinish = () => (probeKeyFor
    ? probeKeyFor({ chosenCardId, bottomOrder: [...bottomOrder] })
    : null);

  // Krok 1 — decyzja o ZAGLĄDNIĘCIU (bez zdradzania kart).
  const stepLook = () => {
    clearChoiceElement(host);
    choiceNode(host, 'div', 'choice-request-intro',
      `${title} — możesz zajrzeć w ${list.length} ${polishPluralCount(list.length, 'kartę', 'karty', 'kart')} z wierzchu biblioteki.\n`);
    const options = choiceNode(host, 'div', 'choice-request-options');
    const look = choiceNode(options, 'button', 'action choice-request-option', 'Zaglądnij (obejrzyj karty)');
    look.type = 'button';
    look.addEventListener('click', () => stepChooseLand());
    const decline = choiceNode(options, 'button', 'action choice-request-option', 'Zrezygnuj — nie zaglądam');
    decline.type = 'button';
    // „Zrezygnuj” domyka decyzję od razu — klucz sondy znany (M112).
    const declineKey = probeKeyFor ? probeKeyFor({ skip: true }) : null;
    if (declineKey && decline.dataset) decline.dataset.optionKey = declineKey;
    decline.addEventListener('click', () => onComplete?.({ skip: true }));
    renderCancel();
  };

  // Krok 2 — wybór basic landa na wierzch (albo nic).
  const stepChooseLand = () => {
    clearChoiceElement(host);
    choiceNode(host, 'div', 'choice-request-intro', `Obejrzane karty (wybierz basic land na wierzch):\n`);
    renderLookedCards(null);
    const options = choiceNode(host, 'div', 'choice-request-options');
    for (const card of list) {
      if (!basic.has(card.id)) continue;
      const button = choiceNode(options, 'button', 'action choice-request-option',
        `${card.name} na wierzch biblioteki`);
      button.type = 'button';
      button.addEventListener('click', () => {
        chosenCardId = card.id;
        bottomOrder.length = 0;
        stepBottomOrder();
      });
    }
    const none = choiceNode(options, 'button', 'action choice-request-option',
      'Bez basic landa — wszystko na spód');
    none.type = 'button';
    none.addEventListener('click', () => {
      chosenCardId = null;
      bottomOrder.length = 0;
      stepBottomOrder();
    });
    renderCancel();
  };

  // Krok 3 — kolejność reszty na spodzie („in any order”, A3).
  const stepBottomOrder = () => {
    const remaining = list.map((c) => c.id).filter((id) => id !== chosenCardId);
    if (remaining.length <= 1) {
      // 0/1 karta — permutacja trywialna, pytanie nic nie wnosi.
      bottomOrder.push(...remaining);
      finish();
      return;
    }
    clearChoiceElement(host);
    choiceNode(host, 'div', 'choice-request-intro',
      chosenCardId != null
        ? `${list.find((c) => c.id === chosenCardId)?.name ?? 'Wybrany land'} na wierzch biblioteki. Odłóż pozostałe na spód — wybieraj po kolei (pierwsza wybrana będzie najbliżej wierzchu):\n`
        : 'Odłóż obejrzane karty na spód — wybieraj po kolei (pierwsza wybrana będzie najbliżej wierzchu):\n');
    renderLookedCards(chosenCardId);
    const options = choiceNode(host, 'div', 'choice-request-options');
    for (const id of remaining) {
      if (bottomOrder.includes(id)) continue;
      const card = list.find((c) => c.id === id);
      const pos = bottomOrder.length + 1;
      const button = choiceNode(options, 'button', 'action choice-request-option',
        `${pos}. na spód: ${card?.name ?? id}`);
      button.type = 'button';
      const finishesNow = bottomOrder.length + 1 === remaining.length;
      if (finishesNow) {
        const key = probeKeyOfFinish();
        if (key && button.dataset) button.dataset.optionKey = key;
        button.addEventListener('click', () => { bottomOrder.push(id); finish(); });
      } else {
        button.addEventListener('click', () => { bottomOrder.push(id); stepBottomOrder(); });
      }
    }
    renderCancel();
  };

  clearChoiceElement(host);
  if (list.length === 0) {
    choiceNode(host, 'div', 'zone-empty', 'Brak kart do decyzji.');
    return host;
  }
  stepLook();
  return host;
}

// =============================================================================
// M66 (B/R): wizardy walki — atakujący/blokujący (przełączniki, NIE kombinacje)
// oraz rozdzielanie obrażeń (steppery przy blokerach).
// =============================================================================

/** Pomocnik: nazwa obiektu z widoku (battlefield/hand) albo id. */
function objectName(view, session, id) {
  const zones = [view.zones.battlefield, view.zones.hand, view.zones.stack, view.zones.graveyard, view.zones.library];
  for (const zone of zones) {
    const object = (zone ?? []).find((o) => o.id === id);
    if (object) {
      // Face-down (morph/megamorph, CR 708.2): tożsamość ukryta — „Morph"
      // zamiast „?" (audyt żywym testerem M73c; pisownia M127 z jednego źródła).
      if (object.faceDown) return FACE_DOWN_LABEL;
      return session.nameOf(object.cardId);
    }
  }
  return session.nameOfObject ? session.nameOfObject(id) : String(id);
}

/** Uwaga C (2026-08-11): „(atak, obrona)" stwora w wizardzie walki — żywe
 * P/T z widoku (jak na kaflu). Puste, gdy brak P/T (nie-stwór). */
function creaturePT(view, id) {
  for (const zone of [view.zones.battlefield, view.zones.hand, view.zones.stack, view.zones.graveyard, view.zones.library]) {
    const object = (zone ?? []).find((o) => o.id === id);
    if (object && object.power != null && object.toughness != null) {
      return ` (${object.power}/${object.toughness})`;
    }
  }
  return '';
}

/** Czy stwór ma statyczną zdolność (np. cantAttackAlone) wg widoku. */
function viewCreatureHasStatic(view, id, field) {
  const object = (view.zones.battlefield ?? []).find((o) => o.id === id);
  // M186/Z1: widok niesie flagę JAWNIE (entry.cantAttackAlone/cantBlockAlone)
  // — wcześniej czytaliśmy entry.abilities, których playerView nie wysyła
  // (martwa walidacja); fallback po abilities zostaje dla starych widoków.
  return Boolean(object && (object[field] === true
    || (object.abilities ?? []).some((a) => a.type === 'static' && a[field] === true)));
}

/**
 * Wizard deklaracji ataku/bloków: zamiast listy WSZYSTKICH kombinacji
 * (2^n atakujących, iloczyn przy blokach) — przełącznik tak/nie przy każdym
 * zdolnym stworze + „Zatwierdź". Finalną komendę buduje się z zaznaczonych.
 */
export function renderCombatWizard(host, { kind, view, session, options, onComplete, onCancel, onOpenCard }) {
  clearChoiceElement(host);
  const isAttackers = kind === 'attackers';
  // Unikalni kandydaci: suma id ze wszystkich oferowanych wariantów.
  const candidateIds = [];
  const seenIds = new Set();
  const pushId = (id) => { if (!seenIds.has(id)) { seenIds.add(id); candidateIds.push(id); } };
  if (isAttackers) {
    for (const cmd of options) for (const id of cmd.attackerIds ?? []) pushId(id);
  } else {
    for (const cmd of options) {
      for (const [attackerId, blockerIds] of Object.entries(cmd.assignments ?? {})) {
        pushId(attackerId);
        for (const id of blockerIds) pushId(id);
      }
    }
  }
  // Obowiązkowi (goad / must-attack): obecni w KAŻDYM wariancie.
  const inEvery = (id) => options.every((cmd) => (isAttackers
    ? (cmd.attackerIds ?? []).includes(id)
    : Object.keys(cmd.assignments ?? {}).includes(id)));
  const mandatory = new Set(candidateIds.filter(inEvery));

  const selected = new Set(mandatory);
  const blockedBy = new Map(); // atakujący → wybrani blokerzy (dla bloków)
  if (!isAttackers) {
    // Domyślnie zaznaczamy „bez bloków".
    for (const [attackerId] of Object.entries(options[0]?.assignments ?? {})) blockedBy.set(attackerId, []);
  }

  const intro = isAttackers
    ? 'Wybierz atakujących (zaznacz stwory, które mają atakować):'
    : 'Wybierz blokujących (przełączniki przy każdym atakującym):';
  choiceNode(host, 'div', 'choice-request-intro', intro);
  const list = choiceNode(host, 'div', 'combat-wizard-list');

  // M288/A: wiersz buduje WSPÓLNY picker (picker.js) — ten sam co kreator
  // wielocelowy i kreator kosztu escape. Klasy `combat-wizard-*` zostają, więc
  // CSS z M129/C i testy dotyku (m129-*) nie widzą różnicy; zmieniło się tylko
  // to, że markup przestał być kopiowany w trzech miejscach.
  const renderRow = (id, checked, disabled, label, onChange) => renderPickerRow(list, {
    id,
    label,
    checked,
    disabled,
    rowClassName: 'combat-wizard-row',
    toggleClassName: 'combat-wizard-toggle',
    nameClassName: 'combat-wizard-name',
    onToggle: (on) => {
      onChange(on);
      // M112: po zmianie zaznaczenia klucz sondy musi opisywać NOWY wybór.
      if (typeof host.__refreshCombatProbeKey === 'function') host.__refreshCombatProbeKey();
    },
    // Uwaga C: nazwa stwora klikalna (fullscreen karty) + P/T w nawiasie.
    onOpenCard: onOpenCard ?? undefined,
  }).row;

  const renderAttackerBlockers = (attackerId) => {
    const attackerLabel = objectName(view, session, attackerId) + creaturePT(view, attackerId);
    const wrapper = choiceNode(list, 'div', 'combat-wizard-attacker');
    choiceNode(wrapper, 'div', 'combat-wizard-sub', `${attackerLabel} — blokujący:`);
    const cand = [];
    const seen = new Set();
    for (const cmd of options) {
      for (const id of cmd.assignments?.[attackerId] ?? []) {
        if (!seen.has(id)) { seen.add(id); cand.push(id); }
      }
    }
    const current = blockedBy.get(attackerId) ?? [];
    for (const blockerId of cand) {
      const label = objectName(view, session, blockerId) + creaturePT(view, blockerId);
      renderRow(blockerId, current.includes(blockerId), false, label, (checked) => {
        const listIds = (blockedBy.get(attackerId) ?? []).filter((id) => id !== blockerId);
        if (checked) listIds.push(blockerId);
        blockedBy.set(attackerId, listIds);
      });
    }
    return wrapper;
  };

  if (isAttackers) {
    for (const id of candidateIds) {
      const label = objectName(view, session, id) + creaturePT(view, id);
      renderRow(id, mandatory.has(id), mandatory.has(id), label, (checked) => {
        if (checked) selected.add(id); else selected.delete(id);
      });
    }
  } else {
    const attackerIds = [];
    const seen = new Set();
    for (const cmd of options) for (const id of Object.keys(cmd.assignments ?? {})) {
      if (!seen.has(id)) { seen.add(id); attackerIds.push(id); }
    }
    for (const attackerId of attackerIds) renderAttackerBlockers(attackerId);
  }

  const actions = choiceNode(host, 'div', 'choice-request-options');
  const confirm = choiceNode(actions, 'button', 'action choice-request-option combat-wizard-confirm',
    isAttackers ? 'Zatwierdź atak' : 'Zatwierdź bloki');
  confirm.type = 'button';
  // M112 (oś „noop" Żywego Testera): wizard walki BUDUJE komendę z zaznaczeń,
  // więc przycisk zatwierdzenia nie miał `data-option-key` i sonda „oferta bez
  // skutku" w ogóle go nie widziała — cała walka była poza pomiarem. Klucz
  // liczymy z BIEŻĄCEGO wyboru i odświeżamy po każdym przełączniku, żeby
  // tester mógł zmierzyć dokładnie tę komendę, którą za chwilę wyśle.
  const pendingCombatCommand = () => (isAttackers
    ? { type: 'declare_attackers', playerId: view.playerId, attackerIds: candidateIds.filter((id) => selected.has(id)) }
    : {
      type: 'declare_blockers',
      playerId: view.playerId,
      assignments: Object.fromEntries([...blockedBy].map(([attackerId, ids]) => [attackerId, [...ids]])),
    });
  const refreshProbeKey = () => {
    if (!confirm.dataset) return;
    confirm.dataset.optionKey = commandOptionKey(pendingCombatCommand());
  };
  host.__refreshCombatProbeKey = refreshProbeKey;
  refreshProbeKey();
  confirm.addEventListener('click', () => {
    if (isAttackers) {
      const ids = candidateIds.filter((id) => selected.has(id));
      // „Can't attack alone" (Ember Beast): pojedynczy taki atakujący jest
      // nielegalny — nie wysyłamy, tylko podpowiadamy.
      const alone = ids.length === 1 && viewCreatureHasStatic(view, ids[0], 'cantAttackAlone');
      if (alone) {
        const hint = choiceNode(host, 'div', 'zone-empty', 'Ten stwór nie może atakować sam (can’t attack alone).');
        hint.className = 'zone-empty combat-wizard-error';
        return;
      }
      onComplete?.(pendingCombatCommand());
    } else {
      // Walidacja w wizardzie: menace 0 albo >= 2; cantBlockAlone z partnerem.
      const assignments = {};
      for (const [attackerId, blockerIds] of blockedBy) {
        const attacker = (view.zones.battlefield ?? []).find((o) => o.id === attackerId);
        const menace = Boolean(attacker && (attacker.keywords ?? []).includes('menace'));
        if (menace && blockerIds.length === 1) {
          const hint = choiceNode(host, 'div', 'zone-empty', 'Atakujący z menace wymaga 0 albo co najmniej 2 blokujących.');
          hint.className = 'zone-empty combat-wizard-error';
          return;
        }
        const aloneBlock = blockerIds.length === 1 && viewCreatureHasStatic(view, blockerIds[0], 'cantBlockAlone');
        if (aloneBlock) {
          const hint = choiceNode(host, 'div', 'zone-empty', 'Ten stwór nie może blokować sam (can’t block alone).');
          hint.className = 'zone-empty combat-wizard-error';
          return;
        }
        assignments[attackerId] = blockerIds;
      }
      onComplete?.({ type: 'declare_blockers', playerId: view.playerId, assignments });

    }
  });
  const clear = choiceNode(actions, 'button', 'ghost-btn combat-wizard-clear', isAttackers ? 'Bez ataku' : 'Bez bloków');
  clear.type = 'button';
  clear.addEventListener('click', () => {
    // M124 (zgłoszenie właściciela: „przycisk Bez bloków jest nieaktywny").
    // Przycisk nigdy nie był `disabled` — po prostu WYGLĄDAŁ na martwy, bo
    // jedyne, co robił, to czyszczenie zaznaczeń i przerysowanie wizarda.
    // Przy pustym wyborze (typowy przypadek: gracz od razu nie chce blokować)
    // nie zmieniał NICZEGO na ekranie, więc klik sprawiał wrażenie ignorowanego.
    //
    // Naprawa zgodna z nazwą: „Bez bloków"/„Bez ataku" to DEKLARACJA, a nie
    // reset formularza — wysyłamy pustą deklarację i zamykamy wizard. Gdy
    // istnieją stwory z przymusem ataku (`mandatory`), pusta deklaracja byłaby
    // nielegalna, więc zachowujemy stare zachowanie (czyszczenie opcjonalnych)
    // i mówimy wprost dlaczego.
    if (isAttackers) {
      for (const id of candidateIds) if (!mandatory.has(id)) selected.delete(id);
      if (mandatory.size > 0) {
        const hint = choiceNode(host, 'div', 'zone-empty', 'Stwory z przymusem ataku muszą atakować — odznaczono pozostałe.');
        hint.className = 'zone-empty combat-wizard-error';
        renderCombatWizard(host, { kind, view, session, options, onComplete, onCancel });
        return;
      }
      const wanted = [...mandatory];
      const attackOffer = (options ?? []).find((cmd) => {
        const ids = [...(cmd.attackerIds ?? [])].sort();
        return ids.length === wanted.length && ids.every((id, i) => id === [...wanted].sort()[i]);
      });
      onComplete?.(attackOffer ?? { type: 'declare_attackers', playerId: view.playerId, attackerIds: wanted });
      return;
    }
    for (const key of blockedBy.keys()) blockedBy.set(key, []);
    // Engine oferuje „brak bloków" jako PUSTĄ mapę przypisań (`{}`), a nie
    // jako `{atakujący: []}` — wysłanie tej drugiej formy nie odpowiada żadnej
    // legalnej komendzie. Bierzemy wprost ofertę z widoku, jeśli istnieje.
    const emptyOffer = (options ?? []).find((cmd) => Object.values(cmd.assignments ?? {})
      .every((ids) => (ids ?? []).length === 0));
    onComplete?.(emptyOffer ?? { type: 'declare_blockers', playerId: view.playerId, assignments: {} });
  });
  if (onCancel) {
    const cancel = choiceNode(host, 'button', 'ghost-btn look-wizard-cancel', 'Zamknij (dokończysz później)');
    cancel.type = 'button';
    cancel.addEventListener('click', () => onCancel());
  }
  return host;
}

/**
 * Wizard rozdzielania obrażeń combat (CR 510.1c/d): steppery +/− przy każdym
 * blokerze (kolejność deklaracji), reguła „>= lethal przed następnym" pilnowana
 * na żywo. Trample: niewykorzystana moc idzie na gracza (pokazana).
 */
/**
 * M172/E (uwaga właściciela, Inferno Titan): „deals N damage divided as you
 * choose among one, two, or three targets" — zamiast enumeracji kombinacji
 * celów (33 opcje) JEDEN wizard: wszyscy kandydaci z licznikiem obrażeń
 * i przyciskami +/− (wzorzec rozdzielania obrażeń po walce). Suma musi
 * wynosić dokładnie `total`; celami zostają kandydaci z kwotą > 0 (to
 * realizuje „among one, two, or three"), maksymalnie `maxTargets`.
 * onComplete dostaje { targetIds, amounts } w kolejności kandydatów.
 */
export function renderDamageDivisionWizard(host, { view, session, candidateIds, total, maxTargets = 3, sourceName = null, onComplete, onCancel, onOpenCard = null }) {
  clearChoiceElement(host);
  choiceNode(host, 'div', 'choice-request-intro',
    `${sourceName ? `${sourceName} — ` : ''}podziel ${total} obraż${total === 1 ? 'enie' : (total >= 2 && total <= 4 ? 'enia' : 'eń')} między maks. ${maxTargets} celów (suma musi wynosić ${total}):`);
  const list = choiceNode(host, 'div', 'damage-wizard-list');
  const amounts = candidateIds.map(() => 0);
  const counters = [];
  let confirm = null;
  let sumEl = null;
  const sum = () => amounts.reduce((a, b) => a + b, 0);
  const chosenCount = () => amounts.filter((n) => n > 0).length;
  const legal = () => sum() === total && chosenCount() >= 1 && chosenCount() <= maxTargets;
  const refresh = () => {
    candidateIds.forEach((id, idx) => { if (counters[idx]) counters[idx].textContent = String(amounts[idx]); });
    if (sumEl) sumEl.textContent = `Przydzielono: ${sum()} / ${total}${chosenCount() > maxTargets ? ` — za dużo celów (maks. ${maxTargets})` : ''}`;
    if (confirm) {
      const ok = legal();
      confirm.disabled = !ok;
      confirm.classList?.toggle?.('is-disabled', !ok);
    }
  };
  candidateIds.forEach((id, idx) => {
    const row = choiceNode(list, 'div', 'damage-wizard-row');
    const isPlayer = Boolean(view.players?.some((pl) => pl.id === id));
    const name = isPlayer
      ? (view.players.find((pl) => pl.id === id)?.name ?? id)
      : objectName(view, session, id);
    const nameEl = choiceNode(row, 'span', 'damage-wizard-name', name);
    if (!isPlayer && onOpenCard) {
      nameEl.dataset.objectId = id;
      nameEl.addEventListener('click', () => onOpenCard(id));
    }
    const minus = choiceNode(row, 'button', 'ghost-btn damage-wizard-minus', '−1');
    const counter = choiceNode(row, 'span', 'damage-wizard-count', '0');
    const plus = choiceNode(row, 'button', 'ghost-btn damage-wizard-plus', '+1');
    counters[idx] = counter;
    minus.addEventListener('click', () => {
      if (amounts[idx] > 0) { amounts[idx] -= 1; refresh(); }
    });
    plus.addEventListener('click', () => {
      // Nowy cel dopiero, gdy jest wolny slot (maxTargets) i wolna suma.
      if (sum() >= total) return;
      if (amounts[idx] === 0 && chosenCount() >= maxTargets) return;
      amounts[idx] += 1; refresh();
    });
  });
  sumEl = choiceNode(host, 'div', 'damage-wizard-remaining', `Przydzielono: 0 / ${total}`);
  const buttons = choiceNode(host, 'div', 'choice-request-actions');
  confirm = choiceNode(buttons, 'button', 'primary-btn damage-division-confirm', 'Zatwierdź podział');
  confirm.disabled = true;
  confirm.addEventListener('click', () => {
    if (!legal()) return;
    const targetIds = [];
    const chosenAmounts = [];
    candidateIds.forEach((id, idx) => {
      if (amounts[idx] > 0) { targetIds.push(id); chosenAmounts.push(amounts[idx]); }
    });
    onComplete({ targetIds, amounts: chosenAmounts });
  });
  const cancel = choiceNode(buttons, 'button', 'ghost-btn', 'Anuluj');
  cancel.addEventListener('click', () => onCancel?.());
  refresh();
}

/**
 * M195/C + C1 (uwagi właściciela): EKRAN WYBORU CELÓW zamiast setek przycisków.
 *
 * „Fireball — mam 95 kombinacji obrażeń. Powinna być lista legalnych celów do
 * wyboru (ptaszek) i osobny licznik +- do określenia obrażeń (X) i kosztu."
 * „Wrap in Flames — zamiast 50 kombinacji lista legalnych celów z ptaszkiem."
 *
 * Wiersz na CEL (nie na kombinację) + opcjonalny licznik X. Zatwierdzenie
 * mapuje wybór z powrotem na komendę z `legalCommands` (multi-target.js), więc
 * legalność rozstrzyga silnik — UI nie wymyśla ruchów (L48). Przycisk
 * „Zatwierdź" jest wyłączony, dopóki wybór nie odpowiada żadnej komendzie.
 */
export function renderMultiTargetWizard(host, { view, session, plan, commands, sourceName = null, intro = null, slotLabels: slotLabels_ = null, onComplete, onCancel, onOpenCard = null }) {
  clearChoiceElement(host);
  // M257-r5/C: druga sekcja kreatora — stwór do poświęcenia (koszt dodatkowy).
  // Wybór JEDNOKROTNY (jeden stwór = jedna płatność), niezależny od celu czaru.
  const sacMode = Boolean(plan.sacrificeMode);
  const xLabel = plan.hasX ? ` oraz wartość X (${plan.xMin}–${plan.xMax})` : '';
  const range = plan.minTargets === plan.maxTargets
    ? `${plan.maxTargets}`
    : `${plan.minTargets}–${plan.maxTargets}`;
  // M200/C: mulligan (odłożenie N kart na spód) używa tegoż ekranu — wiersz
  // na KARTĘ (nie kombinację), zatwierdzenie = komenda z legalCommands.
  const itemWord = plan.itemLabel ?? 'cele';
  // M207: czar o RÓŻNYCH pozycjach celu dostaje sekcję na każdą pozycję,
  // a nie jeden wór („zaznacz cele (2)"). Etykiety pozycji przekazuje
  // wywołujący z Oracle (`spell.targets`); bez nich zostaje numeracja.
  const slots = plan.slots ?? null;
  // M257-r5/C: w trybie poświęcenia etykiety = nazwy SEKCJI („stwor" +
  // „Poświęcenie (koszt)"), nie pozycji celu.
  const slotLabels = slots || sacMode ? (slotLabels_ ?? []) : [];
  choiceNode(host, 'div', 'choice-request-intro',
    intro ?? (slots
      ? `${sourceName ? `${sourceName} — ` : ''}wskaż po jednym celu dla każdej pozycji:\n`
      : sacMode
        ? `${sourceName ? `${sourceName} — ` : ''}wskaż cel czaru oraz stwora do poświęcenia (koszt):\n`
        : `${sourceName ? `${sourceName} — ` : ''}zaznacz ${itemWord} (${range})${xLabel}:\n`));

  // =====================================================================
  // M288/A (uwaga właściciela z żywej gry): wiersze wyboru NIE są już własną
  // konstrukcją tego kreatora (button z marką `[ ]`/`[x]` w tekście + osobny
  // przycisk „Podgląd", bez ani jednej reguły CSS), tylko wspólnym pickerem
  // z `src/table/picker.js` — tym samym, na którym stoi wybór atakujących,
  // bloków i kosztu escape. Logika wyboru (które wiersze, kiedy „Zatwierdź"
  // gaśnie) zostaje per efekt, bo taką ustala silnik przez `legalCommands`.
  // =====================================================================
  const chosen = new Set();
  let xValue = plan.hasX ? plan.xMin : null;
  let sacrificeChoice = null;
  // M257-r5/C: klucze toggles są ZAKRESOWE (`slot` = 'sac' | numer pozycji | null).
  // W trybie poświęcenia pule CELU i OFIARY się nakładają (własny stwór jest
  // i celem czaru, i kosztem), więc nie mogą współdzielić zbioru `chosen`.
  const rows = [];
  const list = choiceNode(host, 'div', 'multi-target-list picker-list');
  let confirm = null;
  let statusEl = null;
  let xCounter = null;

  const isPlayer = (id) => (view?.players ?? []).some((pl) => pl.id === id);

  // M207: w trybie pozycyjnym kolejność celów NIESIE ZNACZENIE (pozycja 0 to
  // inny slot niż pozycja 1), więc komendę składamy z wyborów per-pozycja,
  // a nie ze zbioru `chosen`. `commandForSelection` porównuje zbiory
  // (targetKey sortuje), więc dla pozycji używamy dopasowania po kolejności.
  const slotChoice = slots ? slots.map(() => null) : null;
  const commandForSlots = () => {
    if (slotChoice.some((id) => id == null)) return null;
    return (commands ?? []).find((cmd) => Array.isArray(cmd.targets)
      && cmd.targets.length === slotChoice.length
      && cmd.targets.every((id, i) => id === slotChoice[i])) ?? null;
  };
  const currentCommand = () => (plan.cardIdsMode
    ? commandForMulliganSelection(commands, [...chosen])
    : sacMode
      ? commandForSacrificeSelection(commands, { targets: [...chosen], sacrifice: sacrificeChoice })
      : slots
        ? commandForSlots()
        : commandForSelection(commands, { targets: [...chosen], xValue: plan.hasX ? xValue : null }));

  const pickOf = ({ id, slot }) => (slot == null
    ? chosen.has(id)
    : slot === 'sac'
      ? id === sacrificeChoice
      : slotChoice[slot] === id);

  const syncRows = () => {
    for (const row of rows) row.handle.setChecked(pickOf(row));
  };

  const addRow = (id, slot) => {
    const handle = renderPickerRow(list, {
      id,
      label: objectOrPlayerName(view, session, id),
      // Pozycja celu i poświęcenie (koszt) są JEDNOWYBOROWE — radio w grupie
      // daje wzajemne wykluczenie natywnie, bez ręcznego odznaczania sióstr.
      kind: (typeof slot === 'number' || slot === 'sac') ? 'radio' : 'checkbox',
      group: typeof slot === 'number' ? `multi-target-slot-${slot}` : (slot === 'sac' ? 'multi-target-sac' : null),
      rowClassName: slot == null ? 'multi-target-row' : 'multi-target-row multi-target-slot-row',
      toggleClassName: 'multi-target-toggle',
      nameClassName: 'multi-target-name',
      onToggle: (on) => {
        if (slot == null) {
          if (on) chosen.add(id); else chosen.delete(id);
        } else if (slot === 'sac') {
          if (on) sacrificeChoice = id;
          else if (sacrificeChoice === id) sacrificeChoice = null;
        } else {
          if (on) slotChoice[slot] = id;
          else if (slotChoice[slot] === id) slotChoice[slot] = null;
        }
        refresh();
      },
      // Gracz nie ma karty do pokazania — dawny `addPeek` pomijał go w ten sam
      // sposób (M206); nazwa zostaje wtedy zwykłym tekstem.
      onOpenCard: isPlayer(id) ? null : onOpenCard,
    });
    rows.push({ id, slot, handle });
  };

  const setStatus = (text, problem) => {
    if (!statusEl) return;
    statusEl.textContent = String(text);
    statusEl.className = problem
      ? 'picker-status multi-target-status is-problem'
      : 'picker-status multi-target-status';
  };

  const refresh = () => {
    syncRows();
    if (xCounter) xCounter.textContent = String(xValue ?? '');
    const cmd = currentCommand();
    if (slots) {
      // Pozycje bez wyboru trzeba WYMIENIĆ — samo wyszarzone „Zatwierdź"
      // nie mówi graczowi, czego brakuje (to było sedno zgłoszenia).
      const missing = slotChoice
        .map((id, i) => (id == null ? (slotLabels[i] ?? `cel ${i + 1}`) : null))
        .filter(Boolean);
      if (missing.length > 0) setStatus(`Brakuje: ${missing.join(', ')}`, true);
      else setStatus(cmd ? 'Wybrano komplet celów' : 'Wybór niedozwolony', !cmd);
    } else if (sacMode) {
      // M257-r5/C: status wymienia brakujące SEKCJE, nie tylko licznik.
      const sacLabel = slotLabels[1] ?? 'Poświęcenie (koszt)';
      const missing = [
        chosen.size === 0 ? (slotLabels[0] ?? 'cel') : null,
        sacrificeChoice == null ? sacLabel : null,
      ].filter(Boolean);
      if (missing.length > 0) setStatus(`Brakuje: ${missing.join(', ')}`, true);
      else setStatus(cmd ? `Wybrano: ${slotLabels[0] ?? 'cel'} + ${sacLabel}` : 'Wybór niedozwolony', !cmd);
    } else if (cmd) {
      setStatus(`Wybrano ${itemWord}: ${chosen.size}${plan.hasX ? ` · X = ${xValue}` : ''}`, false);
    } else {
      setStatus(`Wybór niedozwolony (${itemWord}: ${chosen.size}${plan.hasX ? `, X = ${xValue}` : ''})`, true);
    }
    if (confirm) {
      confirm.disabled = !cmd;
      confirm.classList?.toggle?.('is-disabled', !cmd);
    }
  };

  if (slots) {
    // Sekcja na KAŻDĄ pozycję celu, z nagłówkiem z Oracle („twój stwór",
    // „stwór przeciwnika", „karta-stwór w grobie", „gracz"). W obrębie
    // pozycji wybór jest JEDNOKROTNY — kliknięcie zastępuje poprzedni.
    slots.forEach((ids, slotIndex) => {
      const label = slotLabels[slotIndex] ?? `cel ${slotIndex + 1}`;
      renderPickerSection(list, `${slotIndex + 1}. ${label}:`, { className: 'multi-target-slot-label' });
      for (const id of ids) addRow(id, slotIndex);
    });
  } else {
    // M257-r5/C: tryb poświęcenia dostaje NAGŁÓWKI sekcji (cele / ofiara).
    if (sacMode) renderPickerSection(list, `${slotLabels[0] ?? 'Cel'}:`, { className: 'multi-target-slot-label' });
    for (const id of plan.targets) addRow(id, null);
  }

  // M257-r5/C: DRUGA sekcja — ofiara kosztu dodatkowego. Pule celów i ofiar
  // się nakładają (własny stwór bywa celem i kosztem), stąd wybór jedyny,
  // zakresowy (radio w grupie), a nie współdzielony z celami zbiór `chosen`.
  if (sacMode) {
    renderPickerSection(list, `${slotLabels[1] ?? 'Poświęcenie (koszt)'}:`, { className: 'multi-target-slot-label' });
    for (const id of plan.sacrifices) addRow(id, 'sac');
  }

  if (plan.hasX) {
    const xRow = choiceNode(host, 'div', 'multi-target-x');
    choiceNode(xRow, 'span', 'multi-target-x-label', 'X:');
    const minus = choiceNode(xRow, 'button', 'ghost-btn multi-target-x-minus', '−1');
    xCounter = choiceNode(xRow, 'span', 'multi-target-x-count', String(xValue));
    const plus = choiceNode(xRow, 'button', 'ghost-btn multi-target-x-plus', '+1');
    minus.addEventListener('click', () => { if (xValue > plan.xMin) { xValue -= 1; refresh(); } });
    plus.addEventListener('click', () => { if (xValue < plan.xMax) { xValue += 1; refresh(); } });
  }

  statusEl = choiceNode(host, 'div', 'picker-status multi-target-status', '');
  const buttons = choiceNode(host, 'div', 'choice-request-actions');
  confirm = choiceNode(buttons, 'button', 'primary-btn multi-target-confirm', 'Zatwierdź wybór');
  confirm.type = 'button';
  confirm.disabled = true;
  confirm.addEventListener('click', () => {
    const cmd = currentCommand();
    if (cmd) onComplete(cmd);
  });
  const cancel = choiceNode(buttons, 'button', 'ghost-btn multi-target-cancel', 'Anuluj');
  cancel.type = 'button';
  cancel.addEventListener('click', () => onCancel?.());
  refresh();
}

/** Nazwa celu: gracz („Nieprzyjaciel") albo karta na polu bitwy. */
function objectOrPlayerName(view, session, id) {
  const player = view.players?.find((pl) => pl.id === id);
  if (player) return player.name ?? id;
  return objectName(view, session, id) + controllerTag(view, id);
}

/**
 * M206 (audyt Zywym Testerem): znacznik kontrolera przy nazwie permanentu na
 * polu bitwy - " (Ty)" / " (Nieprzyjaciel)".
 *
 * Zwykle listy celow robia to od E (2026-08-11): "Rzuc: Brute Force -> cel:
 * Rat (Ty)", "-> cel: Ghost Warden (Nieprzyjaciel)" (nameOfObjectId
 * w render.js). Kreator wielocelowy tego nie dostal i przy lustrzanej planszy
 * pokazywal dwa nierozroznialne wiersze ("[ ] Squirrel", "[ ] Squirrel" -
 * jeden moj, jeden wroga). Przy Wrap in Flames ("1 obrazenie kazdemu z celow")
 * to roznica miedzy zabiciem swojego a cudzego stwora, a wiersze roznia sie
 * TYLKO ukrytym id obiektu.
 *
 * Pomijamy wlasny face-down: ma juz znacznik "(morph)", drugi nawias szumi
 * (ta sama zasada co w render.js).
 */
function controllerTag(view, id) {
  const object = (view?.zones?.battlefield ?? []).find((o) => o.id === id);
  if (!object || object.controllerId == null) return '';
  if (object.faceDown && object.cardId != null) return '';
  if (!(view.players?.length > 1)) return '';
  const controller = view.players.find((pl) => pl.id === object.controllerId);
  return ` (${controller?.name ?? object.controllerId})`;
}

export function renderDamageWizard(host, { view, session, pending, defaultCommand, onComplete, onCancel, probeKeyFor = null }) {
  clearChoiceElement(host);
  choiceNode(host, 'div', 'choice-request-intro', 'Rozdziel obrażenia bojowe — przydziel moc atakujących blokującym:');
  const list = choiceNode(host, 'div', 'damage-wizard-list');
  const state = { entries: [], amounts: new Map(), renders: [] }; // amounts: `${attackerId}:${blockerId}` → n
  let confirm = null;
  // CR 702.19b: przydział trample jest legalny, gdy albo cała moc poszła
  // w blokerów, albo każdy blokujący dostał co najmniej lethal.
  const trampleCovered = (entry, amounts) => entry.blockers
    .every((b, idx) => amounts[idx] >= b.lethal);
  const assignmentLegal = () => state.entries.every((e) => {
    if (!e.trample) return true;
    const total = e.amounts.reduce((a, b) => a + b, 0);
    return total >= e.power || trampleCovered(e, e.amounts);
  });
  const refreshConfirm = () => {
    if (!confirm) return;
    const legal = assignmentLegal();
    confirm.disabled = !legal;
    confirm.classList?.toggle?.('is-disabled', !legal);
  };

  for (const entry of pending.entries) {
    const wrapper = choiceNode(list, 'div', 'damage-wizard-attacker');
    const trample = entry.trample ? ', trample' : '';
    // M100 (BUG A): etykieta z ŻYWEGO obiektu widoku — face-down pokazuje
    // „morph" (P/T zostają — informacja publiczna); cardId używamy dopiero,
    // gdy obiekt zniknął z widoku (LKI) albo jest odkryty.
    const liveAttackerName = objectName(view, session, entry.attackerId);
    const attackerName = liveAttackerName !== '?'
      ? liveAttackerName
      : (entry.attackerCardId ? session.nameOf(entry.attackerCardId) : '?');
    choiceNode(wrapper, 'div', 'damage-wizard-head',
      `${attackerName} (moc ${entry.power}${trample})`);
    const rows = choiceNode(wrapper, 'div', 'damage-wizard-blockers');
    // M101/B6 (CR 702.19b): przy tramplu przydział 0 jest NIELEGALNY, dopóki
    // nadmiar ma płynąć na gracza. Startujemy więc od domyślnego lethal-first
    // (jak defaultDamageAssignment w silniku) — wizard od pierwszej chwili
    // pokazuje legalny stan, a gracz może go tylko świadomie zmienić.
    const amounts = entry.blockers.map(() => 0);
    if (entry.trample) {
      let left = entry.power;
      entry.blockers.forEach((b, idx) => {
        const give = Math.min(left, b.lethal);
        amounts[idx] = give;
        left -= give;
      });
    }
    const remainingEl = choiceNode(wrapper, 'div', 'damage-wizard-remaining',
      entry.trample ? `do gracza: ${entry.power}` : '');
    const key = entry.attackerId;

    const sum = () => amounts.reduce((a, b) => a + b, 0);
    const canIncrease = (idx) => sum() < entry.power
      && (idx === 0 || amounts[idx - 1] >= entry.blockers[idx - 1].lethal);
    const render = () => {
      // odśwież liczniki w wierszach
      for (let idx = 0; idx < entry.blockers.length; idx += 1) {
        const b = entry.blockers[idx];
        const el = state.amounts.get(`${key}:${b.id}`);
        if (el) el.textContent = String(amounts[idx]);
      }
      // M101/B6 (CR 702.19b): nadmiar trample idzie na gracza DOPIERO, gdy
      // każdy bloker ma lethal — inaczej silnik odrzuci przydział. Pokazujemy
      // to wprost, zamiast pozwolić graczowi zatwierdzić nielegalny wybór.
      if (entry.trample) {
        const toPlayer = entry.power - sum();
        remainingEl.textContent = toPlayer > 0 && !trampleCovered(entry, amounts)
          ? 'do gracza: 0 — najpierw przydziel śmiertelne obrażenia każdemu blokującemu'
          : `do gracza: ${toPlayer}`;
      } else {
        remainingEl.textContent = '';
      }
      refreshConfirm();
      // M136: po zmianie przydziału klucz sondy musi opisywać NOWY stan.
      if (typeof host.__refreshDamageProbeKey === 'function') host.__refreshDamageProbeKey();
    };
    // M150/B (CR 510.1c): atakujący wybiera KOLEJNOŚĆ przydziału obrażeń.
    // Wcześniej kolejność deklaracji bloków była sztywna i nie dało się
    // w ogóle przydzielić obrażeń późniejszemu blokerowi, dopóki wcześniejszy
    // nie dostał lethal (CR 510.1d) — np. 2/2 atakujący blokowany przez 2/2 i 4/4
    // mógł zabrać obrażenia tylko pierwszemu. Przyciski ↑/↓ zmieniają
    // kolejność, więc gracz może ustawić śmiertelny cel jako pierwszy.
    const swapBlockerOrder = (idx, targetIdx) => {
      const list = entry.blockers;
      const am = amounts;
      [list[idx], list[targetIdx]] = [list[targetIdx], list[idx]];
      [am[idx], am[targetIdx]] = [am[targetIdx], am[idx]];
      buildRows();
      render();
    };
    const buildRows = () => {
      // Wyczyść wiersze blokerów przed przebudową. `innerHTML = ''` działa
      // i w przeglądarce, i w stubach MiniEl testów (nie każda ma
      // replaceChildren).
      rows.innerHTML = '';
      entry.blockers.forEach((b, idx) => {
        const row = choiceNode(rows, 'div', 'damage-wizard-row');
        const liveBlockerName = objectName(view, session, b.id);
        const blockerName = liveBlockerName !== '?'
          ? liveBlockerName
          : (b.cardId ? session.nameOf(b.cardId) : '?');
        choiceNode(row, 'span', 'damage-wizard-name',
          `${blockerName} (wytrz. ${b.toughness}${b.damage ? `, obrażenia ${b.damage}` : ''}, śmiertelne ${b.lethal})`);
        const minus = choiceNode(row, 'button', 'ghost-btn damage-wizard-minus', '−1');
        minus.type = 'button';
        const amountEl = choiceNode(row, 'span', 'damage-wizard-amount', '0');
        state.amounts.set(`${key}:${b.id}`, amountEl);
        const plus = choiceNode(row, 'button', 'ghost-btn damage-wizard-plus', '+1');
        plus.type = 'button';
        minus.addEventListener('click', () => {
          if (amounts[idx] <= 0) return;
          amounts[idx] -= 1;
          // Jeśli ten bloker spadł poniżej lethal, późniejsi nie mogą mieć
          // obrażeń (reguła kolejności CR 510.1d).
          if (amounts[idx] < b.lethal) {
            for (let j = idx + 1; j < amounts.length; j += 1) amounts[j] = 0;
          }
          render();
        });
        plus.addEventListener('click', () => {
          if (!canIncrease(idx)) return;
          amounts[idx] += 1;
          render();
        });
        const up = choiceNode(row, 'button', 'ghost-btn damage-wizard-up', '↑');
        up.type = 'button';
        up.title = 'Przesuń wyżej w kolejności przydziału';
        up.addEventListener('click', () => { if (idx > 0) swapBlockerOrder(idx, idx - 1); });
        const down = choiceNode(row, 'button', 'ghost-btn damage-wizard-down', '↓');
        down.type = 'button';
        down.title = 'Przesuń niżej w kolejności przydziału';
        down.addEventListener('click', () => { if (idx < entry.blockers.length - 1) swapBlockerOrder(idx, idx + 1); });
      });
    };
    buildRows();
    state.entries.push({
      attackerId: key, blockers: entry.blockers, amounts,
      trample: Boolean(entry.trample), power: entry.power,
    });
    state.renders.push(render);
    render(); // stan początkowy (0 obrażeń) — także komunikat trample
  }

  const actions = choiceNode(host, 'div', 'choice-request-options');
  confirm = choiceNode(actions, 'button', 'action choice-request-option damage-wizard-confirm', 'Zatwierdź przydział');
  confirm.type = 'button';
  // M136 (backlog: „damage wizard poza osią noop"): wizard BUDUJE komendę ze
  // stepperów, więc — jak walka przed M112 — przycisk zatwierdzenia nie miał
  // `data-option-key` i sonda „oferta bez skutku" w ogóle go nie widziała.
  // Cały przydział obrażeń był poza pomiarem Żywego Testera. Klucz liczymy
  // z BIEŻĄCEGO stanu stepperów i odświeżamy po każdej zmianie, żeby tester
  // mierzył dokładnie tę komendę, którą za chwilę wyśle gracz.
  const pendingDamageCommand = () => {
    const assignments = {};
    for (const e of state.entries) {
      assignments[e.attackerId] = e.blockers.map((blocker, idx) => ({
        blockerId: blocker.id, amount: e.amounts[idx],
      }));
    }
    return { type: 'resolve_damage_assignment', playerId: view.playerId, assignments };
  };
  const refreshDamageProbeKey = () => {
    if (!probeKeyFor || !confirm.dataset) return;
    const key = probeKeyFor(pendingDamageCommand());
    if (key) confirm.dataset.optionKey = key;
  };
  host.__refreshDamageProbeKey = refreshDamageProbeKey;
  refreshDamageProbeKey();
  refreshConfirm();
  confirm.addEventListener('click', () => {
    if (!assignmentLegal()) return; // CR 702.19b — silnik i tak by odrzucił
    const assignments = {};
    for (const e of state.entries) {
      assignments[e.attackerId] = e.blockers.map((b, idx) => ({ blockerId: b.id, amount: e.amounts[idx] }));
    }
    onComplete?.({ type: 'resolve_damage_assignment', playerId: view.playerId, assignments });
  });
  if (defaultCommand) {
    // M251 (audyt Żywym Testerem, w8): etykieta mówiła „Domyślnie
    // (lethal-first)" — żargon implementacji na stole gracza (polski opis,
    // oś 2). Przycisk stosuje silnikowy przydział domyślny: każdy kolejny
    // bloker deklarowanej kolejności dostaje zabójcze obrażenia dopiero,
    // gdy poprzedni je ma (CR 510.1c/d).
    const def = choiceNode(actions, 'button', 'action choice-request-option damage-wizard-default', 'Użyj domyślnego przydziału (zabójcze obrażenia po kolei blokerów)');
    def.type = 'button';
    def.addEventListener('click', () => onComplete?.(defaultCommand));
  }
  if (onCancel) {
    const cancel = choiceNode(host, 'button', 'ghost-btn look-wizard-cancel', 'Zamknij (dokończysz później)');
    cancel.type = 'button';
    cancel.addEventListener('click', () => onCancel());
  }
  return host;
}

/**
 * M241 (zgłoszenie J/K/L): koszt Escape — „wygnij N innych kart z własnego
 * grobu”. Dawniej UI pokazywało enumerację podzbiorów C(n,k) × cele (Sleep
 * of the Dead przy 9 kartach w grobie → 80+ wierszy) z WPIEKANYM celem —
 * zgłaszane: „kombinacje dziesiątek kart” i „Sweet Oblivion millował
 * sam siebie” (pierwszy cel z enumeracji).
 *
 * Teraz (jak inne dobrze zakodowane decyzje tego typu): niestała lista
 * legalnych kandydatów jako ptaszki, „Zatwierdź” wolne dopiero przy
 * dokładnie N zaznaczonych. Komenda składana z wyboru gracza —
 * silnik waliduje niezależnie (L48: oferta i protokół zgodne).
 *
 * Ptaszek = „wygnij tę kartę” (koszt), odznaczenie cofa — wiersze
 * klikalne całą nazwą; lupa (onOpenCard) jak w innych wizardach.
 */
export function renderEscapeExileWizard(host, { candidates, exileCount, sourceName, manaCost, onComplete, onCancel, onOpenCard, playerId = null }) {
  clearChoiceElement(host);
  const picked = new Set();
  const intro = choiceNode(host, 'div', 'choice-request-intro');
  const countN = `${exileCount} ${polishPluralCount(exileCount, 'kartę', 'karty', 'kart')}`;
  intro.textContent = (sourceName ? `${sourceName} — ` : '')
    + `Ucieczka (Escape): zaznacz ${countN} do wygnania z własnego grobu`
    + (Number.isInteger(manaCost) ? ` (pozostały koszt: ${manaCost} many)` : '');
  const progress = choiceNode(host, 'div', 'escape-exile-progress', `Wybrano 0 z ${exileCount}`);
  const list = choiceNode(host, 'div', 'escape-exile-list');
  const buttons = choiceNode(host, 'div', 'choice-request-buttons');
  const confirm = choiceNode(buttons, 'button', 'primary-btn escape-exile-confirm', 'Zatwierdź');
  confirm.disabled = true;
  const cancel = choiceNode(buttons, 'button', 'secondary-btn', 'Anuluj');
  cancel.addEventListener('click', () => { if (onCancel) onCancel(); });

  const refresh = () => {
    progress.textContent = `Wybrano ${picked.size} z ${exileCount}`;
    confirm.disabled = picked.size !== exileCount;
    // Klucz sondy aktualizuje się po każdej zmianie — jak w M112.
    if (playerId) {
      const ids = [...picked].sort();
      confirm.dataset.optionKey = commandOptionKey({ type: 'resolve_escape_exile', playerId, exileIds: ids });
    }
  };
  confirm.addEventListener('click', () => {
    if (confirm.disabled) return;
    onComplete([...picked].sort());
  });

  for (const candidate of candidates) {
    // M288/A: te same wiersze co w wizardzie walki i kreatorze celów — przez
    // wspólny picker. Osobny przycisk „🔍 Podgląd karty" zniknął: nazwa karty
    // otwiera pełny ekran (jedna konwencja dla wszystkich kreatorów).
    renderPickerRow(list, {
      id: candidate.cardId ?? candidate.id,
      label: candidate.name ?? candidate.id,
      rowClassName: 'escape-exile-row',
      toggleClassName: 'escape-exile-toggle',
      nameClassName: 'escape-exile-name',
      onToggle: (on) => {
        if (on) picked.add(candidate.id); else picked.delete(candidate.id);
        refresh();
      },
      onOpenCard: typeof onOpenCard === 'function' ? (cardId) => onOpenCard(cardId) : undefined,
    });
  }
  refresh();
  return host;
}
