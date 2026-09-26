/**
 * AI-OpenRouter (Etap-1): sub-panel AI w szufladzie „Twoje działania".
 *
 * Moduł DOM-owy, ale CZYSTY w sensie ADR 0011: `document` i elementy
 * wstrzykiwane (testy na MiniEl/stubach). Jeden slot = jeden wpis;
 * kolejność wpisów = kolejność zapytań (kolejka woła hooki FIFO).
 *
 * BEZPIECZEŃSTWO: treść od modelu trafia do DOM-u WYŁĄCZNIE przez
 * textContent — nigdy innerHTML (model mógłby zwrócić znaczniki).
 */
export function createAiPanel({ document, wrapEl, logEl, onRetry } = {}) {
  if (!document || !wrapEl || !logEl) throw new TypeError('ai-panel wymaga document + wrapEl + logEl');
  const retryHook = typeof onRetry === 'function' ? onRetry : () => {};
  // slotId -> { entry, body } (wpisy żyją do clear()).
  const nodes = new Map();

  const scrollDown = () => {
    try {
      logEl.scrollTop = logEl.scrollHeight;
    } catch {
      /* stub bez geometrii — nic do roboty */
    }
  };

  const headText = (slot) => {
    const meta = slot.meta ?? {};
    const turn = meta.turn != null ? `Tura ${meta.turn}` : 'AI';
    const model = meta.modelLabel || slot.modelId || '';
    const retryMark = slot.attempt > 1 ? ` (próba ${slot.attempt})` : '';
    let time = '';
    try {
      time = ` · ${new Date().toLocaleTimeString()}`;
    } catch {
      /* bez zegara też żyjemy */
    }
    return `${turn} · ${model}${retryMark}${time}`;
  };

  const ensureNode = (slot) => {
    let node = nodes.get(slot.id);
    if (node) return node;
    const entry = document.createElement('div');
    entry.className = 'ai-entry';
    const head = document.createElement('div');
    head.className = 'ai-head';
    head.textContent = headText(slot);
    const body = document.createElement('div');
    body.className = 'ai-body';
    entry.appendChild(head);
    entry.appendChild(body);
    logEl.appendChild(entry);
    node = { entry, body };
    nodes.set(slot.id, node);
    return node;
  };

  const clearBody = (body) => {
    // replaceChildren, ze spadkiem na innerHTML dla starszych stubów.
    if (typeof body.replaceChildren === 'function') body.replaceChildren();
    else body.innerHTML = '';
  };

  return {
    /** Widoczność całości (toggle w belce). */
    setVisible(on) {
      wrapEl.hidden = !on;
    },
    isVisible() {
      return wrapEl.hidden !== true;
    },
    /** Slot oczekujący: pulsujące „Czekam…" (też po retry). */
    slotPending(slot) {
      const { body } = ensureNode(slot);
      clearBody(body);
      const wait = document.createElement('div');
      wait.className = 'ai-pending';
      wait.textContent = 'Czekam na odpowiedź modelu…';
      body.appendChild(wait);
      scrollDown();
    },
    /** Slot rozstrzygnięty: odpowiedź albo błąd z przyciskiem ponowienia. */
    slotResolved(slot) {
      const { body } = ensureNode(slot);
      clearBody(body);
      const result = slot.result ?? { ok: false, error: '(brak wyniku)' };
      if (result.ok) {
        const text = document.createElement('div');
        text.className = 'ai-text';
        text.textContent = result.text || '(pusta odpowiedź)';
        body.appendChild(text);
      } else {
        const err = document.createElement('div');
        err.className = 'ai-error';
        err.textContent = `Błąd AI: ${result.error || 'nieznany'}`;
        body.appendChild(err);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ai-retry ghost-btn';
        btn.textContent = 'Ponów odpytanie AI';
        btn.addEventListener('click', () => retryHook(slot.id));
        body.appendChild(btn);
      }
      scrollDown();
    },
    /** Nowa partia: wpisy znikają (historia zostaje w arkuszu). */
    clear() {
      nodes.clear();
      clearBody(logEl);
    },
    entryCount() {
      return nodes.size;
    },
  };
}
