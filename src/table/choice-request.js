import { choiceResponse } from '../protocol/types.js';

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

export function renderChoiceRequest(host, request, { labelForOption, onResponse }) {
  clearChoiceElement(host);
  choiceNode(host, 'div', 'choice-request-intro', `Wybierz: ${CHOICE_TYPE_LABELS[request.type] ?? request.type}`);
  const options = choiceNode(host, 'div', 'choice-request-options');
  for (const option of request.options) {
    const button = choiceNode(options, 'button', 'action choice-request-option',
      labelForOption ? labelForOption(option) : String(option));
    button.type = 'button';
    button.addEventListener('click', () => {
      const response = choiceResponse(request, option);
      onResponse?.(response);
    });
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
  if (type !== 'resolve_surveil' && type !== 'resolve_scry') return null;
  if (!options.every((cmd) => cmd.type === type)) return null;
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
export function renderLookWizard(host, { kind, cards, onComplete, onCancel }) {
  const list = Array.isArray(cards) ? cards.slice() : [];
  const labels = kind === 'surveil'
    ? { intro: `Surveil ${list.length} — przeglądnięte karty:`, toBad: 'Na cmentarz', toGood: 'Na wierzch biblioteki', badMark: '→ cmentarz', goodMark: '→ wierzch' }
    : { intro: `Scry ${list.length} — przeglądnięte karty:`, toBad: 'Na spód biblioteki', toGood: 'Zostaw na wierzchu', badMark: '→ spód', goodMark: '→ wierzch' };
  const badIds = []; // surveil: millIds · scry: bottomIds
  const keptIds = []; // pozostające na wierzchu, w kolejności przeglądu
  const orderIds = []; // surveil: docelowa kolejność wierzchu (od góry)
  const decisions = new Map(); // id → 'bad' | 'top'

  const renderIntro = () => {
    choiceNode(host, 'div', 'choice-request-intro', labels.intro);
    const looked = choiceNode(host, 'div', 'look-wizard-cards');
    list.forEach((card, index) => {
      const mark = decisions.get(card.id);
      const suffix = mark === 'bad' ? ` ${labels.badMark}` : mark === 'top' ? ` ${labels.goodMark}` : '';
      choiceNode(looked, 'span', 'look-wizard-card', `${index + 1}. ${card.name}${suffix}`);
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
    if (kind === 'surveil') onComplete?.({ millIds: [...badIds], topOrder: orderIds.length > 0 ? [...orderIds] : [...keptIds] });
    else onComplete?.({ bottomIds: [...badIds] });
  };
  const stepOrder = () => {
    clearChoiceElement(host);
    renderIntro();
    choiceNode(host, 'div', 'choice-request-intro', 'Ułóż karty na wierzchu biblioteki (od góry) — wybieraj po kolei:');
    const options = choiceNode(host, 'div', 'choice-request-options');
    for (const id of keptIds.filter((kept) => !orderIds.includes(kept))) {
      const card = list.find((c) => c.id === id);
      const button = choiceNode(options, 'button', 'action choice-request-option', `Kolejna na wierzchu: ${card?.name ?? id}`);
      button.type = 'button';
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
    const bad = choiceNode(options, 'button', 'action choice-request-option', labels.toBad);
    bad.type = 'button';
    bad.addEventListener('click', () => {
      decisions.set(card.id, 'bad');
      badIds.push(card.id);
      next(index);
    });
    const good = choiceNode(options, 'button', 'action choice-request-option', labels.toGood);
    good.type = 'button';
    good.addEventListener('click', () => {
      decisions.set(card.id, 'top');
      keptIds.push(card.id);
      next(index);
    });
    renderCancel();
  };
  const next = (index) => {
    if (index + 1 < list.length) { stepCard(index + 1); return; }
    // Surveil: reszta na wierzchu „in any order" — przy ≥2 pytamy o kolejność.
    if (kind === 'surveil' && keptIds.length >= 2) stepOrder();
    else finish();
  };

  clearChoiceElement(host);
  if (list.length === 0) {
    choiceNode(host, 'div', 'zone-empty', 'Brak kart do decyzji.');
    return host;
  }
  stepCard(0);
  return host;
}
