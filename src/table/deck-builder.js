import {
  addCardToDeck,
  addFilteredToDeck,
  clearDeck,
  deckBuilderCards,
  deckBuilderErrorText,
  deckBuilderSnapshot,
  deckDownloadFilename,
  deckStatistics,
  removeCardFromDeck,
  sortBuilderCards,
} from '../cards/deck-builder.js';
import { parseDeckText } from '../cards/deck-text.js';
import {
  deckStoreAvailable,
  deleteDeck,
  listDecks,
  loadDeck,
  saveDeck,
} from './deck-store.js';

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

const COLOR_LABELS = { W: 'Biały', U: 'Niebieski', B: 'Czarny', R: 'Czerwony', G: 'Zielony' };

function formatStatistics(stats) {
  const t = stats.typeCounts;
  const colorPart = [...stats.colors.entries()]
    .map(([color, count]) => `${COLOR_LABELS[color] ?? color} ${count}`).join(', ') || 'brak';
  const curvePart = ['0', '1', '2', '3', '4', '5', '6', '7+']
    .filter((bucket) => stats.curve.get(bucket))
    .map((bucket) => `${bucket}:${stats.curve.get(bucket)}`).join('  ');
  return [
    `${stats.total} kart · lądów ${stats.lands} · nielandowych ${stats.nonlands} · śr. mana ${stats.avgCmc}`,
    `stwory ${t.creatures} · instants ${t.instants} · sorcery ${t.sorceries} · artefakty ${t.artifacts} · enchantments ${t.enchantments}${t.other ? ` · inne ${t.other}` : ''}`,
    `kolory: ${colorPart}${curvePart ? ` · krzywa: ${curvePart}` : ''}`,
  ].join('\n');
}

function cardMeta(card) {
  return [card.set, card.plan].filter(Boolean).join(' · ') || 'bez metadanych';
}

/**
 * Montuje kreator talii ADR 0011/0012. Biblioteka nazwanych talii żyje w
 * IndexedDB (decyzja właściciela 2026-08-04); decki z decks/ są dostępne
 * do wczytania przez wstrzyknięty REPO_DECKS. Trwałym wynikiem pozostaje
 * tekst do skopiowania/pobrania jako decks/*.txt.
 */
export function mountDeckBuilder({ registry, repoDecks = {} }) {
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
    addFiltered: document.getElementById('deck-builder-add-filtered'),
    clear: document.getElementById('deck-builder-clear'),
    library: document.getElementById('deck-builder-library-select'),
    load: document.getElementById('deck-builder-load'),
    save: document.getElementById('deck-builder-save'),
    saveAs: document.getElementById('deck-builder-save-as'),
    deleteBtn: document.getElementById('deck-builder-delete'),
  };
  if (Object.values(refs).some((element) => !element)) return null;

  const allCards = deckBuilderCards(registry);
  const repoDeckNames = Object.keys(repoDecks).sort((a, b) => a.localeCompare(b, 'pl'));
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

  function setStatus(text) {
    refs.status.textContent = text ?? '';
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
    const visible = sortBuilderCards(deckBuilderCards(registry, filters()));
    if (visible.length === 0) {
      node(refs.cards, 'div', 'zone-empty', 'Brak kart spełniających filtry.');
      return;
    }
    const snapshot = currentSnapshot();
    for (const card of visible) {
      const isBasicLand = card.types?.includes('Basic') && card.types?.includes('Land');
      const row = node(refs.cards, 'div', isBasicLand ? 'deck-card-row deck-card-basic-land' : 'deck-card-row');
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
    const stats = deckStatistics(state.cardIds, registry);
    refs.summary.textContent = formatStatistics(stats);
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
    setStatus(copied
      ? 'Skopiowano tekst talii do schowka.'
      : 'Nie udało się skopiować automatycznie — zaznacz tekst ręcznie.');
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
    setStatus(`Przygotowano plik ${link.download}.`);
  }

  // --- Biblioteka talii (IndexedDB + decki z decks/) ----------------------
  function populateLibrary(libDecks) {
    clearBuilderElement(refs.library);
    if (repoDeckNames.length > 0) {
      const repo = document.createElement('optgroup');
      repo.label = 'Z repozytorium (decks/)';
      for (const name of repoDeckNames) {
        const item = document.createElement('option');
        item.value = `repo:${name}`;
        item.textContent = name;
        repo.appendChild(item);
      }
      refs.library.appendChild(repo);
    }
    const lib = document.createElement('optgroup');
    lib.label = deckStoreAvailable() ? 'Moja biblioteka (IndexedDB)' : 'Biblioteka niedostępna';
    for (const entry of libDecks) {
      const item = document.createElement('option');
      item.value = `lib:${entry.name}`;
      item.textContent = entry.name;
      lib.appendChild(item);
    }
    if (lib.children.length > 0 || repoDeckNames.length === 0) refs.library.appendChild(lib);
  }

  async function refreshLibrary() {
    try {
      const libDecks = await listDecks();
      // W testach headless document bywa rozebrany zanim skończy się asynchroniczne
      // listDecks — wtedy rezygnujemy z renderu listy (bezpieczne).
      if (typeof document === 'undefined' || !refs.library) return libDecks;
      populateLibrary(libDecks);
      refs.save.disabled = !deckStoreAvailable();
      refs.saveAs.disabled = !deckStoreAvailable();
      refs.deleteBtn.disabled = !deckStoreAvailable();
      return libDecks;
    } catch {
      return [];
    }
  }

  async function loadSelectedDeck() {
    const value = refs.library.value;
    if (!value) return;
    const [scope, ...rest] = value.split(':');
    const name = rest.join(':');
    if (scope === 'repo') {
      const text = repoDecks[name];
      if (!text) { setStatus(`Brak talii „${name}" w repozytorium.`); return; }
      const parsed = parseDeckText(text, registry);
      state.name = name;
      refs.name.value = name;
      state.cardIds = parsed.cardIds;
      state.lastError = null;
      setStatus(`Wczytano z repozytorium: ${name}.`);
      render();
      return;
    }
    if (scope === 'lib') {
      const entry = await loadDeck(name);
      if (!entry) { setStatus(`Brak talii „${name}" w bibliotece.`); return; }
      state.name = entry.name;
      refs.name.value = entry.name;
      state.cardIds = entry.cardIds;
      state.lastError = null;
      setStatus(`Wczytano z biblioteki: ${name}.`);
      render();
    }
  }

  async function saveCurrentDeck() {
    const snapshot = currentSnapshot();
    const ok = await saveDeck(state.name, state.cardIds, snapshot.text);
    setStatus(ok ? `Zapisano w bibliotece: ${state.name}.` : 'Zapis się nie udał (IndexedDB).');
    await refreshLibrary();
  }

  async function saveCurrentDeckAs() {
    const newName = (typeof prompt === 'function' ? prompt('Nazwa nowej talii:', state.name) : state.name);
    if (!newName || !newName.trim()) return;
    state.name = newName.trim();
    refs.name.value = state.name;
    await saveCurrentDeck();
  }

  async function deleteSelectedDeck() {
    const value = refs.library.value;
    if (!value) return;
    const [scope, ...rest] = value.split(':');
    const name = rest.join(':');
    if (scope !== 'lib') { setStatus('Usuwać można tylko talie z biblioteki (nie z repozytorium).'); return; }
    const ok = await deleteDeck(name);
    setStatus(ok ? `Usunięto z biblioteki: ${name}.` : 'Usuwanie się nie udało.');
    await refreshLibrary();
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
  refs.addFiltered.addEventListener('click', () => {
    const visible = deckBuilderCards(registry, filters());
    const result = addFilteredToDeck(state.cardIds, visible, registry);
    state.cardIds = result.cardIds;
    state.lastError = null;
    setStatus(`Dodano ${result.added} kart z filtrów.`);
    render();
  });
  refs.clear.addEventListener('click', () => {
    state.cardIds = clearDeck(state.cardIds);
    state.lastError = null;
    setStatus('Wyczyszczono talię.');
    render();
  });
  refs.copy.addEventListener('click', () => { void copyDeck(); });
  refs.download.addEventListener('click', downloadDeck);
  refs.load.addEventListener('click', () => { void loadSelectedDeck(); });
  refs.save.addEventListener('click', () => { void saveCurrentDeck(); });
  refs.saveAs.addEventListener('click', () => { void saveCurrentDeckAs(); });
  refs.deleteBtn.addEventListener('click', () => { void deleteSelectedDeck(); });

  void refreshLibrary();
  render();

  return Object.freeze({
    snapshot: currentSnapshot,
    render,
    refreshLibrary,
  });
}
