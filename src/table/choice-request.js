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
