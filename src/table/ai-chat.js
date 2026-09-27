/**
 * AI-R7 (ciągłość czatu, zlecenie właściciela 2026-09-27): rejestr rozmowy
 * bieżącej partii — JEDEN wpis per tura: `{ turn, user, assistant }`.
 *
 * - `user` = wycinek „Przebieg Tur dla AI” tej tury (materiał do komentarza),
 * - `assistant` = najnowsza UDANA odpowiedź modelu z tej tury (do wstawek
 *   w `messages[]`; błędy i pustki NIE wchodzą do historii).
 *
 * Polityka (pinowana testami):
 * - ten sam numer tury = ten sam wpis (`recordTurn` nadpisuje materiał,
 *   retry NIE dubluje wpisu ani go nie czyści),
 * - retry nadpisuje `assistant` TEJ SAMEJ tury (model „zapomina” starą
 *   odpowiedź, nie widzi dwóch wersji naraz),
 * - `repliesBefore(n)` zwraca tylko odpowiedzi tur WCZEŚNIEJSZYCH niż n
 *   (bieżąca tura czeka na komentarz — nie ma swojej odpowiedzi).
 *
 * Moduł CZYSTY (zero DOM-u): instancję trzyma `main.js`, reset co partię.
 */
export function createAiChat() {
  const entries = [];
  const byTurn = new Map();
  return {
    /** Materiał tury (przy enqueurowaniu zapytania). */
    recordTurn(turn, user) {
      const t = Number(turn);
      if (!Number.isFinite(t)) return;
      const prev = byTurn.get(t);
      if (prev) prev.user = String(user ?? '');
      else {
        const e = { turn: t, user: String(user ?? ''), assistant: '' };
        entries.push(e);
        byTurn.set(t, e);
      }
    },
    /** Udana odpowiedź modelu z tury (sukces albo retry-sukces). */
    recordReply(turn, assistant) {
      const t = Number(turn);
      if (!Number.isFinite(t)) return;
      const text = String(assistant ?? '');
      if (!text.trim()) return;
      const prev = byTurn.get(t);
      if (prev) prev.assistant = text;
      else {
        const e = { turn: t, user: '', assistant: text };
        entries.push(e);
        byTurn.set(t, e);
      }
    },
    /** Odpowiedzi do wstawek assistant: `{ nrTury: tekst }`, tylko < n. */
    repliesBefore(turn) {
      const t = Number(turn);
      const out = {};
      for (const e of entries) {
        if (e.turn < t && e.assistant && e.assistant.trim()) out[e.turn] = e.assistant;
      }
      return out;
    },
    /** Nowa partia: zapomnij całą rozmowę. */
    reset() {
      entries.length = 0;
      byTurn.clear();
    },
    /** Kopia wpisów (testy / diagnostyka). */
    snapshot() {
      return entries.map((e) => ({ ...e }));
    },
  };
}
