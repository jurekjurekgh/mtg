# PLAN 2026-09-13 — audyt PR #115 (Crew/Shaman/runda 2/transpozycja/mana) + pętla jakości

Zlecenie: „Kontynuujemy projekt" — prompt **nie nazywa tematu**, więc obowiązuje
pętla domyślna z [ADR 0021](../../docs/decisions/0021-default-session-work-no-queue-question.md):
PR na starcie (0020 A) → audyt poprzedniego scalonego PR (0020 B / 0016) →
niedokończony plan z `main` → pętla jakości. Sesja `arena/01a09c9e-mtg`.

## 0. Stan wejściowy (zmierzony, nie przepisany)

- `main` = `8300db6` („Sesja arena/01a096f0: znaleziska Crew (A1-A4) + Shaman (B) (#115)"),
  PR #115 scalony 2026-09-12 18:54 UTC; `main` na originie = ten sam SHA.
- Gałąź sesji `arena/01a09c9e-mtg` **nie istnieje na originie** (świeży branch od `main`).
- `npm test` (szybki rdzeń, pomiar tej sesji): **5396/5396, 0 fail, ~161 s**.
- Rozmiar audytowanego PR: `gh pr diff 115` = **59 plików, +5159/−359**, 505 kB;
  w tym 18 plików `src/` (`resources.js` +640/−41, `multi-target.js` +205,
  `heuristic-bot.js` +160/−5, `main.js` +136, `choice-request.js` +122,
  `mana-wizard.js` +101/−52, `abilities.js` +82/−66, `game-state.js` +67/−42,
  `render.js` +65/−19, `spells.js` +57/−35, `effect-intent.js` +42, `mana-icons.js` +28/−13,
  `permanents.js` +11, `card-data.js` +6/−6, `triggers.js`, `index.html`, `effects.js`,
  `objects.js`, `session.js`, `state-based.js`), 28 plików testów, generator talii,
  słownik kolekcji i README.
- **Brak niedokończonego planu na `main`:** osiem najnowszych `docs/plans/PLAN_*.md`
  (…`PLAN_2026-09-12f-znaleziska-crew-shaman.md` włącznie) ma **zero** nieodhaczonych
  kryteriów ukończenia → punkt 3 pętli ADR 0021 nie ma czego podjąć, wchodzi punkt 4.
- Lektura startowa wykonana w całości: `AGENTS.md`, wszystkie ADR-y
  (`docs/decisions/`, 0001–0030 + archiwum 0008 + README), `docs/LESSONS.md`
  (2333 linie, wszystkie lekcje L1–L141), `docs/setup/ENVIRONMENT.md`,
  handoff `HANDOFF_2026-09-12.md` (583 linie), PR #115 (opis, lista plików, commity).

## 1. Zakres audytu PR #115 (ADR 0020 B) — kolejność wg blast radius

Audyt obejmuje **każdy zmieniony plik**; kolejność wynika z ryzyka regułowego:

1. **`src/engine/resources.js` (+640/−41)** — największa zmiana regułowa: źródła
   kosztowe (`untappedCostedManaSources`, `fundableCostedSources`,
   `fundableCostedPlan` jako symulacja), `tapCostedManaSource`, `spendMana`
   (kolejność „pipy pierwsze / pula pierwsza”, rezerwa, łańcuchy B→A), threading
   `reqs` przez walidatory i oferty, Jeskai Devotee (`oncePerTurn` bez `{T}`),
   M201 (anty-korupcja), netto dokładne.
2. **`src/engine/abilities.js` (+82/−66)** — jedna oferta Crew/Saddle z podzbiorem
   domyślnym, walidacja dowolnego legalnego podzbioru (L48: oferta == walidacja),
   znacznik `crewed` (CR 702.122e) i jego czyszczenie.
3. **`src/engine/spells.js`, `game-state.js`, `effect-intent.js`, `triggers.js`,
   `permanents.js`, `objects.js`, `state-based.js`, `effects.js`** — threading
   `reqs`, nowe pola stanu/zdarzeń, kontrakt widoku (ADR 0017), FoW (ADR 0003).
4. **`src/table/*`** — picker załogi (`crewWizardPlanFor`, `renderCrewWizard`),
   wsadowe szukanie (`searchBatchPlanOf`/`searchBatchStepOf`, `renderSearchBatchWizard`),
   etykiety (`commandLabel`, `manaSymbolsHtml`), kreator many (zunifikowany solver),
   `render.js` (badge „obsadzony”, dostępność).
5. **`src/controllers/heuristic-bot.js` (+160/−5)** — wyceny: kara za crew
   zatapowanego pojazdu, `libraryLossPenalty`/`libraryDrainTax` (podatek
   biblioteczny), pump w triggerze (Shaman), `removesTarget` (aury).
6. **`src/cards/card-data.js` (+6/−6) + `tools/collection-art-ids.csv` +
   `tools/generate-plan-decks.mjs` + `decks/*.txt`** — transpozycje planów
   (Vow→Eldraine, Tiller→Mirrodin, Bond→Ixalan), druki, regeneracja talii
   (ADR 0023/0024/0029 — katalog rośnie tylko z kolekcji właściciela).
7. **28 plików testów** — czy mierzą to, co deklarują (RED→GREEN, L13/L61),
   wyrywkowa weryfikacja mutacyjna kluczowych pinów; piny utrwalające stare
   zachowanie (etykiety Crew/Saddle, M101/B7, M337, M348) — czy mają uzasadnienie.
8. **Dokumenty i liczby** — README (tabela talii, liczby testów/artefaktu),
   `docs/PROJECT_HISTORY.md`, opisy commitów (klasa F8: liczby z pomiaru).

Metody: czytanie diffu plik po pliku w całości; testy celowane na HEAD `main`;
weryfikacja twierdzeń regułowych wobec Oracle/CR ze źródeł online (**ADR 0030** —
pamięć nie jest źródłem) tam, gdzie zmiana dotyka reguł; sprawdzenie par
„oferta == walidacja” (L48), FoW (ADR 0003/0017), determinizmu (ADR 0005),
braku wyjątków po nazwie karty (ADR 0002).

## 2. Etapy i kryteria ukończenia

- [ ] **E0. Plan + PR sesji** (ADR 0020 A). Ten plik wypchnięty osobnym commitem
      PRZED kodowaniem; PR otwarty na GitHubie (choćby z samym planem).
- [ ] **E1. Audyt PR #115** — raport `docs/audits/AUDYT_PR115_2026-09-13.md`
      z werdyktem, tabelą znalezisk (ID, miejsce, treść, werdykt) i sekcją
      odtwarzalności; znaleziska blokujące naprawione u root cause osobnymi
      commitami (test RED→GREEN + weryfikacja mutacyjna).
- [ ] **E2. Pętla jakości — Żywy Tester** na świeżym `dist/` (L76), partie
      taliami z obszaru zmian (pojazdy/Shaman/many), ręczna lektura transkryptów
      po trzech osiach (`TESTER_STOLU.md`), naprawy u root cause + detektory.
- [ ] **E3. Polowanie na niezgodności z CR** inną ścieżką niż poprzednie sesje
      (obszar wskazany przez E1) — z cytatem reguły w komentarzu strażnika (ADR 0030).
- [ ] **E4. Bramki**: `npm test` po każdym commicie; na koniec `npm run test:all`,
      `npm run build`, quick benchmark (`node tools/benchmark.mjs`) i golden master
      bota — churn tylko świadomy, z tabelą atrybucji (L124).
- [ ] **E5. Domknięcie**: `docs/setup/HANDOFF_2026-09-13.md`, wpis w
      `docs/PROJECT_HISTORY.md`, README (liczby z pomiaru, L92), opis PR
      aktualizowany kumulacyjnie. Pełne B0 wyłącznie na komendę właściciela (ADR 0018).

## 3. Kolejność commitów (każdy samodzielnie zielony: `npm test` + `npm run build`)

1. ten plan; 2. raport audytu PR #115 (z werdyktem); 3…N naprawy/znaleziska
osobno per finding; N+1 pętla jakości (tester + detektory); N+2… dokumenty
zamknięcia. Każdy commit wypchnięty od razu (ADR 0020 C/D, L136).

## 4. Ryzyka i pułapki

- **Sandbox potrafi zresetować workspace w środku tury** (ENVIRONMENT §2, L136):
  po każdym commicie `git log --oneline -1` + push; przed każdym `git checkout
  <plik>` sprawdzić `git diff --stat -- <plik>`.
- Audyt dużego PR (505 kB) nie mieści się w jednej turze — czytać plikami,
  wnioski zapisywać na bieżąco w raporcie audytu (nie w czacie).
- `resources.js` + threading `reqs` dotyka gorącej pętli ofert: każda zmiana
  wymaga pomiaru quick benchmark + golden master (ryzyko churnu bez uzasadnienia).
- Nie odpalać pełnego B0 (ADR 0018); benchmark szybki bez `| tail` (ENVIRONMENT §5).
- Katalog kart rośnie wyłącznie z kolekcji właściciela (ADR 0029) — brak nośnika
  mechaniki rozwiązuje karta syntetyczna w teście.
- Zmiany regułowe wymagają cytatu CR/Oracle ze źródła online (ADR 0030);
  przy braku sieci znalezisko zostaje „do weryfikacji u źródła", nie wdrożone.
