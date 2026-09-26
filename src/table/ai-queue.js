/**
 * AI-OpenRouter (Etap-1): kolejka zapytań ze ŚCIŚLE chronologicznym renderem.
 *
 * Moduł CZYSTY (zero DOM-u): transport wstrzyknięty, render przez hooki.
 * Problem (zlecenie właściciela): późniejsze zapytanie może wrócić SZYBCIEJ
 * niż wcześniejsze — odpowiedzi pokazujemy w kolejności zapytań. Późniejsze
 * wyniki są BUFOROWANE, aż wcześniejsze sloty się rozstrzygną (sukcesem
 * albo błędem — błąd też zwalnia kolejkę).
 *
 * Kontrakt transportu:
 *   transport({ prompt, modelId, meta, signal }) -> Promise<{ ok, text?, error? }>
 * Wyjątek z transportu = { ok: false, error } (normalizacja tutaj).
 *
 * Hooki: onPending(slot) — nowy slot do narysowania jako „Czekam…";
 *         onResolved(slot) — slot ma .result, rysuj odpowiedź albo błąd.
 * Slot: { id, attempt, prompt, modelId, meta, result? }.
 * `reset()` (nowa partia): spóźnione odpowiedzi starej generacji giną.
 */
export function createAiQueue({ transport, onPending, onResolved } = {}) {
  if (typeof transport !== 'function') throw new TypeError('ai-queue wymaga transportu');
  const pendingHook = typeof onPending === 'function' ? onPending : () => {};
  const resolvedHook = typeof onResolved === 'function' ? onResolved : () => {};
  let seq = 0;
  let generation = 0;
  // Sloty w kolejności zapytań; render idzie od głowy, bufor za głową czeka.
  const slots = [];
  // Wszystkie sloty bieżącej generacji (też wyrenderowane — retry szuka
  // slotu-błędu PO jego wyrenderowaniu; reset czyści mapę co partię).
  const byId = new Map();

  const fire = (slot, request) => {
    const gen = slot.generation;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    Promise.resolve()
      .then(() => transport({ ...request, signal: controller?.signal ?? null }))
      .then(
        (res) => ({ ok: res?.ok === true, text: res?.text ?? '', error: res?.error ?? '' }),
        (err) => ({ ok: false, text: '', error: err instanceof Error ? err.message : String(err) }),
      )
      .then((result) => {
        // Spóźniony (stara partia) albo już obsłużony — nie renderujemy.
        if (gen !== generation || slot.result) return;
        slot.result = result;
        drain();
      });
  };

  const drain = () => {
    while (slots.length > 0 && slots[0].result) {
      const ready = slots.shift();
      resolvedHook(ready);
    }
  };

  return {
    /** Nowe zapytanie na końcu kolejki; zwraca id slotu. */
    enqueue({ prompt, modelId, meta } = {}) {
      seq += 1;
      const slot = {
        id: seq, attempt: 1, generation,
        prompt: prompt ?? '', modelId: modelId ?? '', meta: meta ?? null,
        result: null,
      };
      slots.push(slot);
      byId.set(slot.id, slot);
      pendingHook(slot);
      fire(slot, { prompt: slot.prompt, modelId: slot.modelId, meta: slot.meta });
      return slot.id;
    },
    /**
     * Ponowienie slotu-błędu w TYM SAMYM miejscu kolejki (porządek
     * chronologiczny zachowany). Setup brany z chwili kliku (argumenty).
     * Zwraca false, gdy slotu nie ma / nie jest błędem / jest nieaktualny.
     */
    retry(slotId, { prompt, modelId } = {}) {
      const slot = byId.get(slotId) ?? null;
      if (!slot || slot.generation !== generation || !slot.result || slot.result.ok) return false;
      if (slots.includes(slot)) return false; // już w locie — nie dublujemy
      slot.result = null;
      slot.attempt += 1;
      if (prompt !== undefined) slot.prompt = prompt;
      if (modelId !== undefined) slot.modelId = modelId;
      // Wyrenderowany ⇒ wszystko wcześniejsze wyrenderowane — slot jest
      // najwcześniejszym nierozstrzygniętym, więc wraca NA GŁOWĘ.
      slots.unshift(slot);
      pendingHook(slot);
      fire(slot, { prompt: slot.prompt, modelId: slot.modelId, meta: slot.meta });
      return true;
    },
    /** Nowa partia: czyści kolejkę, spóźnione odpowiedzi giną. */
    reset() {
      generation += 1;
      slots.length = 0;
      byId.clear();
    },
    pendingCount() {
      return slots.filter((s) => !s.result).length;
    },
  };
}
