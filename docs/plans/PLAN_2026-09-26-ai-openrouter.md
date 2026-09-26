# PLAN: AI przez OpenRouter + zapis do Google Drive (2026-09-26)

Zlecenie właściciela: pełna nowa funkcjonalność — odpytywanie AI (OpenRouter)
przez samą aplikację + zapis odpowiedzi do dedykowanego arkusza przez AppScript.
Ten dokument = architektura + podział na etapy + instrukcja konfiguracji
po stronie właściciela (Drive/AppScript).

## 0. Rozpoznanie (co już istnieje — nie wyważamy drzwi)

- **Pełny zapis dla AI GOTOWY:** `session.turnHistoryTextAll()` (M197/A1,
  `src/table/session.js:2829`) — wszystkie tury od początku partii, format
  `**Tura N — Imię**` + linie `• …`; narracja w 3. osobie, Fog of War
  (karty gracza ukryte jak bota). Panel „Przebieg tur (dla AI)" to pokazuje.
- **Imiona:** `TURN_NAMES = { p1: 'Czarodziejka', p2: 'Nieprzyjaciel' }`
  (`session.js:206`) — bot w logu = Nieprzyjaciel, zgodnie z wymaganiem.
- **Wzorzec obserwatorów sesji:** `createSession({ onCast, onTransform })`
  — trigger końca tury (`onTurnCompleted`) wpasuje się w ten sam kontrakt.
  Granica tury = `recordTurnEvent` na `turn_started` (push rekordu do
  `turnHistory`, `session.js:2785`) + `flushFinishedTurn` po końcu partii.
- **Talia i świat bota:** select `#deck-bot` (klucz + tytuł z `# …`,
  np. „Wiedźmin (BG)"); świat-lore = tytuł talii, a docelowo dominujący
  `plan` kart talii bota (`Wiedźmin`, `Forgotten Realms`, `Mirrodin`… —
  pole istnieje w `card-data.js`), co działa też dla talii własnych.
- **Precedens localStorage:** `mtg-table-prefs-v1` (dźwięki/hi-gfx,
  `topbar-toggles.js`) + `mtg-table-autosave-v1`. ADR 0012 zakazuje
  localStorage tylko dla STANU kreatora talii — konfiguracja AI to inna
  kategoria (jawnie ulotna, odtwarzalna). Caveat Safari/ITP (czyszczenie
  po ~7 dniach) — akceptowalny: klucz i modele wpisuje się ponownie.
- **Audyt legacy** (`docs/AUDIT_LEGACY_APP.md:61,155,265): klucz OpenRouter
  w kodzie klienta był wytkniętą wadą; „nowa aplikacja nie woła LLM".
  Projekt poniżej spełnia audyt: **zero sekretów w repo/bundle** —
  klucz wyłącznie w localStorage, wpisywany po starcie.
- **Apka referencyjna** (`card_viewer_12_10_for_Github.html`, commit 5e557dd
  — SKASOWANA z gałęzi po spisaniu wzorców): działający POST
  `https://openrouter.ai/api/v1/chat/completions`
  (`Authorization: Bearer`, body `{model, messages:[{role:'user',…}]}`,
  timeout przez `AbortController`) + głębokie parsowanie błędów
  (`error.metadata.raw`). Zapisu przez AppScript w niej NIE MA (tylko
  odczyt CSV z opublikowanych arkuszy) — ścieżkę append projektujemy sami
  (standardowy Web App, niżej). Bonus do forwardu: model `external`
  (ręczne wklejanie odpowiedzi) — tani fallback bez klucza.

## 1. Architektura (kandydat na ADR-0031 przy implementacji)

Zasady twarde:
1. **Silnik (`src/engine/`, `src/cards/`, `src/controllers/`) NIETKNIĘTY**
   — całe AI mieszka w warstwie stołu (`src/table/`). Gra nigdy nie czeka
   na AI (fire-and-forget; brak `await` na torze rozgrywki).
2. **Zero sekretów w kodzie:** klucz API, URL AppScriptu i modele lokalne
   żyją TYLKO w localStorage. W repo: silnik + lista predefiniowana.
3. **Moduły czyste (ADR 0011):** DOM i `fetch` wstrzykiwane (jak
   `topbar-toggles.js`) — testowalność bez sieci i przeglądarki;
   unikalne nazwy top-level (bramka kolizji builda).
4. **Działa z `file://` i z Pages:** tylko HTTPS-fetch'e cross-origin
   (OpenRouter toleruje wywołania z przeglądarki — tak robi apka
   referencyjna; AppScript przez `no-cors`, fire-and-forget).

Nowe moduły (`src/table/`):
- `ai-config.js` — `AI_MODELS` (predefiniowane, id-only), load/save
  `mtg-table-ai-v1` `{ apiKey, modelId, customModels[], mode, appScriptUrl }`;
  default modelu = ostatnio wybrany, inaczej pierwszy z listy.
- `ai-client.js` — POST do OpenRouter (fetch wstrzyknięty), timeout 60 s,
  głęboki parse błędów (wzorzec z referencji). Zwraca `{ ok, text }`.
- `ai-modes.js` — rejestr trybów: `{ id, sheetName, trigger, buildPrompt(ctx) }`.
  Tryb I: `lore-bot` (karta `lore-bot`). Nowe tryby = nowy wpis, zero zmian
  w szkielecie.
- `ai-queue.js` — kolejka FIFO (patrz §4).
- `ai-panel.js` — kontroler sub-panelu w szufladzie (sloty, pulsowanie,
  błąd + „ponów", autoscroll jak w Logu).
- `ai-drive.js` — append do AppScriptu (fetch wstrzyknięty, `no-cors`,
  nigdy nie blokuje UI; loguje TYLKO sukcesy, nigdy błędy).

Zmiany w istniejących:
- `session.js`: obserwator `onTurnCompleted(record, textAll)` — odpalany
  przy domknięciu rekordu tury (`turn_started` + `flushFinishedTurn`).
  Samo wywołanie synchroniczne, lekkie (AI robi resztę asynchronicznie).
- `main.js`: wiring (toggle, panel konfiguracji, sub-panel, podpięcie
  obserwatora do kolejki; budowa `ctx` promptu: talia bota, świat, zapis).
- `index.html`: przycisk `#ai-toggle` w belce, `<details>` „Konfiguracja AI"
  pod replayem (domyślnie zwinięty), kontener `#ai-log` w `.drawer-body`
  pod `#actions`, CSS (pulsowanie, style jak `.log-wrap`).
- `topbar-toggles.js`: rozszerzenie o trzeci toggle (ten sam wzorzec
  `paint`/prefs; default `ai: false`).

Przepływ (tryb I): koniec tury → `onTurnCompleted` → budowa promptu →
wpis do kolejki (slot „Czekam…") → `ai-client` POST → slot: odpowiedź
LUB błąd+ponów → przy sukcesie `ai-drive` append (równolegle, bez czekania).

## 2. Lista modeli (start)

`name` niepotrzebne (decyzja właściciela) — trzymamy same `id`, etykieta
do wyświetlenia = `id` po `/`, bez sufiksu `:…`. Duplikat
`google/gemini-3-flash-preview:floor` (2× na liście) — usuwamy, zostaje 15:

free: `stealth/space-bunny-alpha`, `nvidia/nemotron-3-ultra-550b-a55b:free`,
`inclusionai/ling-3.0-flash-fin:free`, `poolside/laguna-s-2.1:free`,
`dots-studio/dots-3-note-preview:free`, `thinkingmachines/inkling:free`;
floor-flash: `google/gemini-3.8-flash:floor`, `google/gemini-3.7-flash:floor`,
`google/gemini-3.6-flash:floor`, `google/gemini-3.5-flash:floor`,
`google/gemini-3-flash-preview:floor`, `google/gemini-2.5-flash:floor`;
floor-lite: `google/gemini-3.5-flash-lite:floor`,
`google/gemini-3.1-flash-lite:floor`, `google/gemini-2.5-flash-lite:floor`.

„Dodaj nowy model": input na id (np. `google/gemini-3.5-flash-lite:floor`)
→ dopis do `customModels[]` w localStorage + od razu selected.
Walidacja klucza: miękka (niepusty + zaczyna się od `sk-or-`, inaczej
ostrzeżenie, nie blokada).

## 3. UI (spec)

1. **Toggle `#ai-toggle`** w górnej belce, obok dźwięków/hi-gfx (SVG jak
   sąsiedzi, `aria-pressed`); domyślnie OFF; stan w prefs (pamięta sesje).
2. **Panel „Konfiguracja AI"** — `<details class="panel">` POD „Zapis partii
   (replay)", NAD stopką (`build-stamp`); domyślnie zwinięty. Pola:
   API Key (password), Model (select: predefiniowane + lokalne),
   „+ Dodaj model" (input + przycisk), Tryb AI (select, na start 1 tryb),
   AppScript URL (input, puste = bez zapisu do Drive), przycisk
   „Sprawdź połączenie" (tani ping: krótki prompt, wynik inline).
   Zapis przy każdej zmianie (localStorage, bez przycisku „zapisz").
3. **Sub-panel AI w „Twoje działania"** — dolna część `.drawer-body`
   (od ~połowy w dół), widoczny TYLKO gdy toggle ON. `#ai-log` jak
   `.log-wrap` (scroll, autoscroll na dół przy dopisaniu). Wpisy rosną
   w dół jak w Logu partii.

## 4. Kolejka i stany (spec)

- Każde zapytanie dostaje slot w kolejności chronologicznej. Szybsza
  późniejsza odpowiedź CZEKA (buforowana) — render ściśle FIFO, z
  uwzględnieniem ścieżki błędu (błąd wcześniejszego nie blokuje:
  slot błędu renderuje się w swojej kolejności z przyciskiem ponowienia).
- Slot oczekujący: pulsujący „Czekam na odpowiedź modelu…" (CSS animation).
- Sukces: pulsowanie znika, w slocie odpowiedź (czas + model w nagłówku).
- Błąd: komunikat + przycisk „Ponów odpytanie AI" → slot wraca do
  „Czekam…", ponowienie idzie z AKTUALNYM setupem (model/klucz z chwili
  kliku), w tym samym slocie (porządek chronologii zachowany).
- Gra nie czeka: zapytania nie wstrzymują rozgrywki ani siebie nawzajem
  (limit współbieżności: brak na start; forward, gdyby było trzeba).
- Nowa partia: log AI czyści się (jak Log partii); historia w arkuszu
  zostaje (identyfikator partii = `gameId`, patrz §6).

## 5. Tryb I — lore komentarzy Bota

- **Trigger:** domknięcie każdej tury (`onTurnCompleted`) — komentarz do
  tury, która właśnie się skończyła. (Tura N kompletna jest w chwili
  `turn_started` N+1 — to jest nasz „koniec tury".)
- **Prompt:** (a) rola: „w logu występujesz jako Nieprzyjaciel
  (przeciwnik Czarodziejki)"; (b) talia: dokładny tytuł + klucz talii
  bota (+ docelowo skład — karty talii, tanio i precyzyjnie) oraz świat:
  tytuł talii / dominujący `plan`; (c) pełny `turnHistoryTextAll()`
  od początku partii do końca aktualnej tury.
- **Oczekiwanie:** komentarz do OSTATNIEJ tury, w 100% w lore świata
  talii (Wiedźmin, Forgotten Realms, Mirrodin…), starcie opowiedziane
  jako historia z Czarodziejką, BEZ nazw kart MtG wprost, BEZ meta-nazw
  mechanik/zdolności. Limit długości w prompcie (np. ~600 znaków —
  do kalibracji po pierwszych odpowiedziach).
- **Strażnik rozmiaru (forward):** zapis rośnie z turami; gdyby prompt
  puchł (długie partie), Etap-4 doda obcinanie (ostatnie N tur + streszczenie
  — osobna decyzja, nie blokuje startu).

## 6. Zapis do Drive (spec + INSTRUKCJA DLA WŁAŚCICIELA)

Kontrakt: aplikacja robi `POST` (JSON, `no-cors`, fire-and-forget) na URL
Web Appu; AppScript dopisuje wiersz do karty trybu. Odczytu nie ma.
Body: `{ mode, gameId, turn, model, chars, response, tsClient }`.
Kolumny: `ts | game_id | turn | model | chars | response`. Karta = nazwa
trybu (`lore-bot`, …), tworzona sama z nagłówkiem gdy brak. `gameId` =
`${seed}-${startISO}` z sesji stołu. Błędy NIE są wysyłane.

**Co robisz Ty (raz, ~10 minut, ze swojego konta Google):**
1. Utwórz nowy Arkusz Google (np. „MTG AI log") i skopiuj ID z adresu URL
   (fragment między `/d/` a `/edit`).
2. W arkuszu: Rozszerzenia → Aplikacje Apps Script → wklej poniższy
   `Code.gs` (dostaniesz go ode mnie w Etapie-3 jako gotowy plik
   `docs/ai-appscript/Code.gs` — nic nie dopisujesz, tylko wklejasz).
3. W edytorze skryptu: Wdróż → Nowe wdrożenie → typ „Aplikacja internetowa":
   „Uruchom jako: Ja", „Dostęp: Każdy" (wymagane — statyczna strona nie
   zrobi logowania Google; URL wdrożenia jest niezgadywalny i acts as
   capability — trzymasz go jak pół-sekret w localStorage).
4. Skopiuj URL aplikacji (`https://script.google.com/macros/s/…/exec`)
   i wklej go w aplikacji w „Konfiguracja AI" → „AppScript URL".
5. Test: włącz AI, dograj turę — wiersz ma pojawić się w karcie `lore-bot`.
   Puste pole URL = zapis do Drive wyłączony (aplikacja działa bez niego).

Szkic `Code.gs` (finalny w Etapie-3):
`doPost(e)` → `JSON.parse(e.postData.contents)` → `SpreadsheetApp.openById(ID)`
→ `getSheetByName(mode) ?? insertSheet + nagłówek` → `LockService` →
`appendRow([new Date(), gameId, turn, model, chars, response])` →
`ContentService.createTextOutput('ok')`. Lock chroni przed gubieniem
wierszy przy współbieżnych dopisaniach.

## 7. Etapy (każdy = implementacja + testy + zielony suit + commit + push)

- **Etap-0 (ten dokument):** architektura + instrukcja. Bez kodu. ✅
- **Etap-1 (szkielet UI):** toggle w belce + panel konfiguracji
  (localStorage działa) + sub-panel w szufladzie + kolejka FIFO na
  transporcie-wstrzykniętym. Weryfikacja UX bez klucza: flaga `?ai-mock=1`
  (fałszywy responder z opóźnieniem — tylko do testów, zero śladów w UI).
  Testy node: kolejka (kolejność, buforowanie, retry), config (load/save/
  defaulty), budowa promptu; UI-testy na istniejących stubach.
- **Etap-2 (OpenRouter + tryb I):** `ai-client` (timeout, deep-errors),
  tryb `lore-bot` end-to-end: `onTurnCompleted` → prompt → kolejka →
  render/błąd/ponów. Testy node (parse błędów, timeout-y na wstrzykniętym
  fetchu). Weryfikacja na żywo wymaga Twojego klucza (nie znamy go —
  testujesz u siebie).
- **Etap-3 (Drive):** `ai-drive` + gotowy `docs/ai-appscript/Code.gs` +
  pole URL + ping. Wdrożenie AppScriptu — po Twojej stronie (§6).
- **Etap-4 (forward, po ograniu):** strażnik rozmiaru promptu, tryb II…,
  model `external` (wklejanie ręczne), limit współbieżności, kalibracja
  długości komentarzy, ewentualny ADR-0031 formalny (jeśli architektura
  się ustabilizuje inaczej niż w §1).

## 8. Ryzyka i uwagi

- **Koszty:** modele `:free` darmowe; `:floor` płatne groszowo, ale klucz
  z limitami — model wybierasz Ty; apka nie pilnuje budżetu (forward).
- **Prywatność:** prompt (zapis partii) idzie do OpenRouter; klucz i URL
  tylko w localStorage TEJ przeglądarki (ITP może wyczyścić po ~7 dniach
  na Safari — wtedy wpisujesz ponownie).
- **CORS/file://:** wzorzec jak w apce referencyjnej (działa z pliku);
  AppScript `no-cors` = odpowiedź nieprzeczytywalna (opaque) — akceptowalne,
  bo tylko dopisujemy; niepowodzenie zapisu do Drive jest ciche (log do
  konsoli) i NIGDY nie psuje gry ani okna AI.
- **Kolejność vs retry:** ponowienie nie przeskakuje kolejki (ten sam slot).
- **Testy sieci:** zero prawdziwych wywołań w suicie (fetch wstrzykiwany,
  mocki). E2E na żywo — tylko ręcznie, Twoim kluczem.

## Aneks A — decyzje do potwierdzenia przez właściciela

1. Dedupe `gemini-3-flash-preview` (2×) → 15 modeli. OK?
2. `gameId = seed + timestamp startu` — wystarczy do rozróżniania partii?
3. Limit komentarza w prompcie (~600 znaków) — kalibrujemy po pierwszych
   odpowiedziach, czy wolisz inną długość na start?
4. Etykiety modeli = samo id (bez `name`) — OK?
5. Puste AppScript-URL = brak zapisu (apka działa) — OK?
