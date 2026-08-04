import {
  addCardToDeck,
  deckBuilderCards,
  deckBuilderErrorText,
  deckBuilderSnapshot,
  deckDownloadFilename,
  removeCardFromDeck,
} from '../cards/deck-builder.js';

function clearBuilderElement(element) {
  if (element) element.textContent = '';
}

function node(parent, tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  parent?.appendChild(element);
  return element;
}

function option(select, value, label) {
  const item = document.createElement('option');
  item.value = value;
  item.textContent = label;
  select.appendChild(item);
}

function sortedValues(cards, field) {
  return [...new Set(cards.map((card) => card[field]).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), 'pl'));
}

function formatSummary(summary) {
  const colors = [...summary.colors.entries()].map(([color, count]) => `${color} (${count})`).join(', ') || 'brak';
  return `${summary.total} kart · lądów: ${summary.lands} · pozostałych: ${summary.spells} · kolory: ${colors}`;
}

function cardMeta(card) {
  return [card.set, card.plan].filter(Boolean).join(' · ') || 'bez metadanych';
}

/**
 * Montuje kreator talii ADR 0012. Nie zapisuje niczego w localStorage — stan
 * żyje tylko w tej stronie, a trwałym wynikiem jest tekst do skopiowania lub
 * pobrania jako `decks/*.txt`.
 */
export function mountDeckBuilder({ registry }) {
  const root = document.getElementById('deck-builder');
  if (!root) return null;
  const refs = {
    name: document.getElementById('deck-builder-name'),
    plan: document.getElementById('deck-builder-plan'),
    set: document.getElementById('deck-builder-set'),
    color: document.getElementById('deck-builder-color'),
    filter: document.getElementById('deck-builder-filter'),
    cards: document.getElementById('deck-builder-card-list'),
    summary: document.getElementById('deck-builder-summary'),
    errors: document.getElementById('deck-builder-errors'),
    output: document.getElementById('deck-builder-output'),
    copy: document.getElementById('deck-builder-copy'),
    download: document.getElementById('deck-builder-download'),
    status: document.getElementById('deck-builder-status'),
  };
  if (Object.values(refs).some((element) => !element)) return null;

  const allCards = deckBuilderCards(registry);
  const state = { name: refs.name.value || 'Moja talia', cardIds: [], lastError: null };
  refs.name.value = state.name;

  clearBuilderElement(refs.plan);
  clearBuilderElement(refs.set);
  clearBuilderElement(refs.color);
  option(refs.plan, '', 'Wszystkie plany');
  option(refs.set, '', 'Wszystkie sety');
  option(refs.color, '', 'Wszystkie kolory');
  option(refs.color, 'W', 'Biały (W)');
  option(refs.color, 'U', 'Niebieski (U)');
  option(refs.color, 'B', 'Czarny (B)');
  option(refs.color, 'R', 'Czerwony (R)');
  option(refs.color, 'G', 'Zielony (G)');
  option(refs.color, 'colorless', 'Bezkolorowe');
  for (const value of sortedValues(allCards, 'plan')) option(refs.plan, value, value);
  for (const value of sortedValues(allCards, 'set')) option(refs.set, value, value);

  function filters() {
    return {
      plan: refs.plan.value,
      set: refs.set.value,
      name: refs.filter.value,
      color: refs.color.value,
    };
  }

  function currentSnapshot() {
    return deckBuilderSnapshot({ name: state.name, cardIds: state.cardIds }, registry);
  }

  function renderErrors(snapshot) {
    clearBuilderElement(refs.errors);
    const messages = [];
    if (state.lastError) messages.push(deckBuilderErrorText(state.lastError, registry));
    for (const error of snapshot.validation.errors) {
      const message = deckBuilderErrorText(error, registry);
      if (message && !messages.includes(message)) messages.push(message);
    }
    for (const message of messages) node(refs.errors, 'div', 'deck-builder-error', message);
  }

  function renderCards() {
    clearBuilderElement(refs.cards);
    const visible = deckBuilderCards(registry, filters());
    if (visible.length === 0) {
      node(refs.cards, 'div', 'zone-empty', 'Brak kart spełniających filtry.');
      return;
    }
    const snapshot = currentSnapshot();
    for (const card of visible) {
      const row = node(refs.cards, 'div', 'deck-card-row');
      const details = node(row, 'div', 'deck-card-details');
      node(details, 'div', 'deck-card-name', card.name);
      node(details, 'div', 'deck-card-meta', cardMeta(card));

      const controls = node(row, 'div', 'deck-card-controls');
      const minus = node(controls, 'button', 'ghost-btn deck-card-minus', '−');
      minus.type = 'button';
      minus.disabled = !snapshot.counts.get(card.id);
      minus.setAttribute?.('aria-label', `Usuń ${card.name}`);
      minus.addEventListener('click', () => {
        const result = removeCardFromDeck(state.cardIds, card.id, registry);
        state.cardIds = result.cardIds;
        state.lastError = result.ok ? null : result.error;
        render();
      });
      node(controls, 'span', 'deck-card-count', String(snapshot.counts.get(card.id) ?? 0));
      const plus = node(controls, 'button', 'ghost-btn deck-card-plus', '+');
      plus.type = 'button';
      plus.setAttribute?.('aria-label', `Dodaj ${card.name}`);
      plus.addEventListener('click', () => {
        const result = addCardToDeck(state.cardIds, card.id, registry);
        if (result.ok) {
          state.cardIds = result.cardIds;
          state.lastError = null;
        } else {
          state.lastError = result.error;
        }
        render();
      });
    }
  }

  function render() {
    const snapshot = currentSnapshot();
    refs.summary.textContent = formatSummary(snapshot.summary);
    refs.output.value = snapshot.text;
    refs.copy.disabled = !snapshot.text;
    refs.download.disabled = !snapshot.text;
    renderErrors(snapshot);
    renderCards();
  }

  async function copyDeck() {
    const snapshot = currentSnapshot();
    if (!snapshot.text) {
      state.lastError = snapshot.validation.errors[0] ?? 'deck_cards:brak tekstu';
      render();
      return;
    }
    let copied = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(snapshot.text);
        copied = true;
      } else if (refs.output.select && document.execCommand) {
        refs.output.select();
        copied = document.execCommand('copy');
      }
    } catch {
      copied = false;
    }
    refs.status.textContent = copied
      ? 'Skopiowano tekst talii do schowka.'
      : 'Nie udało się skopiować automatycznie — zaznacz tekst ręcznie.';
  }

  function downloadDeck() {
    const snapshot = currentSnapshot();
    if (!snapshot.text || typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
      state.lastError = snapshot.validation.errors[0] ?? 'deck_cards:brak eksportu';
      render();
      return;
    }
    const url = URL.createObjectURL(new Blob([snapshot.text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = deckDownloadFilename(snapshot.name);
    link.textContent = 'Pobierz talię';
    link.style.display = 'none';
    document.body?.appendChild(link);
    link.click();
    link.remove?.();
    URL.revokeObjectURL(url);
    refs.status.textContent = `Przygotowano plik ${link.download}.`;
  }

  refs.name.addEventListener('input', () => {
    state.name = refs.name.value;
    state.lastError = null;
    render();
  });
  refs.filter.addEventListener('input', render);
  refs.plan.addEventListener('change', render);
  refs.set.addEventListener('change', render);
  refs.color.addEventListener('change', render);
  refs.copy.addEventListener('click', () => { void copyDeck(); });
  refs.download.addEventListener('click', downloadDeck);
  render();

  return Object.freeze({
    snapshot: currentSnapshot,
    render,
  });
}
