# PLAN 2026-08-10 — UX wyborów i etykiet (A/B/D) + Idyllic Grange (C)

Data: 2026-08-10. Sesja: `arena/019febbd-mtg` (nowa sesja po scaleniu PR #39 / M65–M69).
Zlecenie właściciela po testach na iPhonie (screenshoty): 4 uwagi A/B/C/D.

## Rozpoznanie (wykonane przed planem)

- `npm test` 1236/1236, `npm run build` 50 modułów / 1375.7 kB — zgodne z handoffem.
- Brak otwartych PR; main = `d32d1de`.

### A. „Wybierz: wybierz (2 opcji)” — etykiety grup nic nie mówią + zła odmiana
- `render.js`: przycisk grupy to `Wybierz: ${choiceGroupLabel(...)}`; etykiety są
  generyczne: `wybierz cel (N opcji)`, `wybierz (N opcji)`, `wybierz wariant (N opcji)`.
- Dotyczy m.in.: mulliganu (type 'command' → „wybierz (2 opcji)”), deklaracji
  atakujących ('declare_attackers' → fallback „wybierz wariant”), celów rzutów
  (aura → „wybierz cel (3 opcji)”).
- Odmiana: „2 opcji” → poprawnie „2 opcje” (potrzebna polska pluralizacja:
  1 opcja, 2–4 opcje, 5+ opcji, wyjątek 12–14 → opcji).
- DODATKOWO w modalu celu aury: etykiety opcji pokazują SUROWY HTML many
  (`<span class="ms-group">…`) — `renderChoiceRequest`/`choiceNode` ustawia
  `textContent`, a `commandLabel` zwraca HTML (`manaCostHtml`, nazwy są już
  escape'owane). Naprawa: opcje modala przez `innerHTML` + `innerHTML` w
  harnessie testowym (`ChoiceMiniEl` go nie ma — table-ui MiniEl już ma).

### B. Wizard Surveil: ciemne napisy na ciemnym tle
- `.look-wizard-card` (index.html:626) ma `background: #27272a` bez `color` —
  dziedziczy ciemny tekst jasnego motywu → „Monastery Flock” ledwo czytelne.
  Naprawa: jasny chip spójny z białym modalem.

### C. Idyllic Grange wchodzi nietapnięta przy <3 innych Plains (reguła MtG)
- ROOT CAUSE: definicja (card-data.js:4091) ma `entersTappedCondition
  { minOtherPlains: 3 }`, ale NIE ma `entersTapped: true` — jedyna z trzech
  warunkowych kart (Raucous Carnival i Mystic Sanctuary mają oba pola).
  `playLand` (resources.js) czyta `shouldEnterTapped = moved.entersTapped`
  (false) → cały blok warunkowy pomijany → land wchodzi nietapnięty.
- Inkonsekwencja: trigger ETB „enters untapped → counter” poprawnie NIE odpala
  (czyta `enteredTapped` zdarzenia), więc licznik nie wszedł — zgodnie z
  obserwacją właściciela.
- Test Batch 25 dla Grange jest DEFINICYJNY (asercje pól) — przepuścił błąd;
  naprawa + testy BEHAWIORALNE (zasada z AGENTS.md / handoffu).
- Strażnik regresji: każda karta z `entersTappedCondition` musi mieć
  `entersTapped: true` (test po rejestrze).

### D. Etykieta akcji łamie się na „3 kolumny”
- `.action` to `display:flex` z wieloma dziećmi (tekst + `.ms-group` spans) —
  każdy fragment osobnym flex-itemem; przy zawinięciu powstają kolumnowe
  zlepy („Zagraj aurę … (koszt” | „1 W)” | „→ zaczaruj Goldmeadow Nomad”).
- Naprawa: etykieta w JEDNYM elemencie `span.action-label` (flex ma wtedy
  2 dzieci: diament ::before + etykietę), treść w środku płynie inline.
- Dotyczy panelu „Twoje działania” ORAZ opcji modala (`.choice-request-option`
  też dziedziczy `.action` flex — po A2 tam też będą ikony w tych przyciskach).

## Etapy (commity w PR sesji — każdy zielony: npm test + npm run build)

1. **Plan** — ten plik (pierwszy commit PR).
2. **C: Idyllic Grange** — `entersTapped: true` + testy behawioralne
   (2 inne Plains → tapped, brak triggera; 3 inne Plains → untapped, trigger
   target → licznik +1/+1 na wybranym stworze) + strażnik entersTappedCondition
   w card-data/card-data-shape test.
3. **A2: surowy HTML w modalu** — opcje przez `innerHTML` w renderChoiceRequest;
   `innerHTML` w ChoiceMiniEl (choice-request-ui.test.js); test: opcja z
   kosztem many renderuje `.ms-group`, nie pokazuje `<span`.
4. **A: opisowe etykiety grup** — `pluralOptions(n)`, przepisany
   `choiceGroupLabel` (mulligan, atakujący/blokujący, rozdziel obrażeń,
   cel rzutu/zdolności z NAZWĄ karty: „Zagraj aurę: Benevolent Blessing —
   wybierz cel (3 opcje)”); render bez sztywnego „Wybierz:”; nagłówek modala
   opisowy (introLabel z main.js); fallback commandLabel przez
   REASONING_ACTION_LABELS zamiast surowego `cmd.type`.
5. **D: jeden element etykiety** — `span.action-label` w panelu akcji, modalu
   wyboru i menu kontekstowym; CSS `.action-label { display:inline; min-width:0 }`.
6. **B: jasne chips w wizardzie** — `.look-wizard-card` jasne tło + dziedziczony
   kolor tekstu.
7. **Benchmark + docs** — quick B0 (1080; zmiana wejścia Grange na tapped
   zmienia rozgrywkę w talii z nią), potem pełne B0 13500 (zgodnie z zasadą
   po zmianie przestrzeni komend/stanu bota); ENGINE_MILESTONES (M70),
   PROJECT_STATE, ROADMAP jeśli trzeba, HANDOFF_2026-08-10c, opis PR.

## Pułapki

- `edit_file` psuje PL → python3 Path.read_text/write_text; dłuższe skrypty
  przez /tmp; commit msg przez /tmp.
- Sandbox cofa HEAD do main → push po KAŻDYM commicie.
- Test-контракт: prefiksy etykiet („Rzuć:”, „Zagraj:”…) są asercjami testów UI —
  sprawdzić testy po zmianach; MiniEl textContent musi dalej pokrywać treść.
- `renderChoiceRequest` jest też używany dla czysto-tekstowych opcji — innerHTML
  z zachowaniem escape (commandLabel escape'uje nazwy przez escapeHtml).
- Grange jest w talii `azorius` (1x) — po naprawie może wchodzić tapped
  częściej niż dotąd (tam, gdzie bug ją wchodził untapped) → quick B0 (1080),
  potem pełne B0 (13500).
- Hunter seeds: bez zmian talii → bez przelosowania.
- Nie ruszać engine poza definicją karty (C to błąd danych, nie logiki).

## Podsumowanie wykonania (2026-08-10)

- **C (engine, commit 3fc9b2d):** wdrożone JAK W PLANIE, ale sonda Batchu 25
  poszerzyła zakres — obok brakującego `entersTapped: true` Grange wykryła
  klasę błędu: martwy event `'enters'` w 3 kartach (Grange, Fertile Thicket,
  Springbloom Druid), `requiresTarget` dropowane z top-level `createAbility`,
  Fertile czytające WSPÓLNĄ listę bibliotek (CR 401.4 — filtr kontrolera) i
  deterministyczny chain Springblooma (kradzież landów przeciwnika, brak wyboru
  0/1/2). Wszystko naprawione u root cause; `queueSearchChoice` wydzielone na
  top-level effects.js z parametrem `chain`; boty aggro/heuristic nauczone nowych
  komend (inaczej synthetic-game/bot-benchmark padały). Testy behawioralne w
  `test/batch25-etb-enters-fix.test.js` (10) + 2 strażniki registry
  (entersTappedCondition ⇒ entersTapped; 26 obsługiwanych zdarzeń triggerów).
- **A2 (commit df477f8):** opcje modala przez innerHTML; ChoiceMiniEl z semantyką
  przeglądarki; test braku surowych `<span`.
- **A (commit 9985617):** choiceGroupLabel/choiceGroupTitle — deskryptory typów
  i komend, tytuły rzeczowe („Aura: Benevolent Blessing (3 opcje)"), odmiana
  opcja/opcje/opcji (w tym 12–14 opcji), introLabel w modalu, fallback
  commandLabel → REASONING_ACTION_LABELS.
- **D (commit f046a9a):** etykieta akcji w jednym `span.action-label` (panel,
  opcje modala, menu kontekstowe) + CSS; MiniEl w table-ui symuluje
  innerHTML/textContent jak przeglądarka; menu kontekstowe używa wspólnej
  choiceGroupLabel.
- **B (commit df8c39b):** `.look-wizard-card` jasne (#f4f4f5/#e4e4e7/var(--text))
  + strażnik kontrastu (jasność tła > 0.7, jawny kolor tekstu).
- **Benchmark + docs:** quick B0 1080 — 0 crashy, heuristic 79.2% ogółem
  (61.4% vs aggro / 96.9% vs random); pełne B0 13 500 — 0 crashy, heuristic
  78.6% ogółem (63.4% vs aggro / 93.8% vs random) — jak przed zmianą (M69),
  progi 0.78/0.57 utrzymane. Hunter seeds nietknięte (talie bez zmian).
- **Exit:** `npm test` 1255/1255, `npm run build` 50 modułów / 1385.2 kB.
