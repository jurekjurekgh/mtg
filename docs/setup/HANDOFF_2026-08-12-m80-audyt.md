# Handoff 2026-08-12 — M80: audyt rozgrywki żywym testerem + Jill/Shiva

## START TUTAJ

1. Przeczytaj `AGENTS.md`, `docs/PROJECT_STATE.md` (M80), ten plik,
   `docs/plans/PLAN_2026-08-12-audyt-zywy-tester.md`.
2. `npm test` — oczekuj **1421** zielonych.
3. `npm run build` — 50 modułów / ~1535 kB.
4. Sesja = gałąź `arena/019ff818-mtg` = PR (otwarty z tej sesji).

## Stan po sesji

- **Kod:** naprawy z audytu żywym testerem (16 pozycji) + poprawka Jill/Shiva
  (Mesmerize → `cantBeBlocked`, ETB celuje w obu graczy).
- **Bot bez zmian** — pełne B0 niewymagane (progi 0.78/0.57, pomiar #44).

## Co naprawiono (audyt M80)

- **session.js:** „Brak ataku” nie tworzy modala „Ruch przeciwnika” (pusta
  lista atakujących = szum).
- **render.js commandLabel:** szukanie w bibliotece rozróżnia karty
  („Szukanie: <nazwa>” / „nie znajduj karty”); mulligan pokazuje finalną rękę
  7−N.
- **render.js describeEffect:** Reclusive Artificer „zada tyle obrażeń, ile
  artefaktów kontrolujesz”; dynamiczne P/T bez surowego slug
  (`greatest_power_you_control` → „X (największa twoja moc)”).
- **render.js describeTriggered:** czytelne opisy zamiast „Trigger <event>”
  dla 10 typów triggerów (Landfall, land przeciwnika, krok końca, exploit,
  aura-host-celem-czaru, drugi czar, czar niebędący stworem, odwrócenie twarzy,
  niebojowe obrażenia przeciwnikowi, celowany ETB z obrażeniami).
- **choice-request.js:** wizard obrażeń „śmiertelne N” (nie „lethal”).

## Narzędzie (tester) rozszerzone

- `tools/table-tester/run-game.mjs`:
  - loguje treść modala „Ruch przeciwnika” (`[RUCH PRZECIWNIKA] ...`);
  - deklaruje BLOKI w wizardzie (wcześniej nigdy nie blokował).
- Transkrypt: `tools/table-tester/audyt-m80-green-vs-red.txt`.

## Testy

- `test/audit-m80-tester.test.js` — nowe regresje (opisy triggerów/efektów,
  etykiety szukania/mulliganu, „śmiertelne”, dynamiczne P/T).
- `test/session-bot-pausa.test.js` — „Brak ataku” nie trafia do modala.
- `test/choice-request-ui.test.js` — zaktualizowana asercja „lethal”→„śmiertelne”.
- `npm test`: **1421 pass / 0 fail**. `npm run build`: 50 modułów / ~1535 kB.

## Kolejka (po M80)

- Phone verify (Pages, po merge): czytelne opisy triggerów na kaflach, brak
  „Brak ataku” w modalach, szukanie z nazwami kart, mulligan 7−N, „śmiertelne”.
- Batch 31 — czeka na listę właściciela (ADR 0010: Scryfall z `set=`,
  `fetch_page`).
- Phone verify / platinum hunt / B2-w2 lookahead OFF / tester roadmap.

## Pułapki

- `edit_file` psuje polskie znaki → **python3** Path.read_text/write_text.
- Sandbox potrafi cofnąć HEAD do main — `git fetch && git rebase FETCH_HEAD`.
- Nie commituj bez `npm test`. Nie odpalaj testera bez `npm run build`.
- `PlayerView.pendingClash.cards` = **cardId**. Escape cost z **registry**.
- `jsdom` nie renderuje obrazów → w transkryptach P/T/„choroba” czasem
  się dublują (syntetyczna twarz + nakładka); to artefakt testera, nie błąd.
