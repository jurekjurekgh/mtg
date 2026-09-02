# PLAN 2026-09-02 — audyt PR #92 + pętla jakości (kontynuacja 2.3)

**Sesja:** `arena/01a06193-mtg` (PR sesji otwierany na starcie, ADR 0020 A).
**Baza:** `main` @ `db0c493` (squash PR #92, merged 2026-09-02T10:03Z).
**Prompt:** „kontynuujemy projekt” — brak nazwanego tematu → **ADR 0021**
(PR na starcie → audyt poprzedniego scalonego PR → niedokończony plan → pętla
jakości). Zasady: ADR 0020 (PR / audyt / inkrementalne commity / bez force
push), ADR 0016 (chirurgiczne patchowanie), ADR 0002 (brak przypadków po
nazwie karty), ADR 0022 (pełny Oracle albo `unsupported`), ADR 0027 (klasę
tępi narzędzie), ADR 0018/0025 (pełne B0 tylko na komendę właściciela).

## Pomiar startowy (wykonany przed kodowaniem)

- [x] `npm test` (szybki rdzeń): **4131/4131 pass**, 0 fail (~109 s).
- [x] `npm run build`: OK (57 modułów).
- [x] `git log --oneline -1` = `db0c493`; drzewo czyste; gałąź sesji
      `arena/01a06193-mtg`.
- [x] Lektura obowiązkowa (AGENTS.md §0): AGENTS.md w całości, rejestr ADR +
      ADR 0002/0005/0007/0013/0016/0017/0018/0019/0020/0021/0022/0025/0026/0027,
      `docs/LESSONS.md` (wpisy zbiorcze + L104–L113 + reguła konsolidacji),
      `docs/setup/ENVIRONMENT.md`, `docs/setup/HANDOFF_2026-09-01-m277.md`,
      opisy i diff PR #92.

## Etap 1 — audyt PR #92 (ADR 0020 B / 0016)

Zakres PR #92: audyt PR #91, pętla jakości (16 partii Żywego Testera,
`tools/family-audit.mjs`, tytuły grup decyzji), faza B (inteligencja bota,
klasa L102/1), **batch 52** (9 kart 580–588 + nowe mechaniki w silniku),
audyt wycen bota po batchu, uwagi właściciela A–F (M280) + 18 partii
Żywego Testera. Diff: 61 plików / 4851 linii (`gh pr diff 92`).

Kryteria ukończenia:

- [x] przeczytany CAŁY diff (src, tools, testy; docs punktowo);
- [x] każda zmiana silnika sprawdzona z CR/Oracle i ADR 0002; kod 9 kart
      porównany z `docs/cards/scryfall-*.json` (Oracle, P/T, kolory, koszt);
- [x] weryfikacja mutacyjna nowych testów (L13/L34 — baza z `git show`);
- [x] kontrakty: widok (ADR 0017), fingerprint (ADR 0005 / L16), ładunki
      zdarzeń (ADR 0027 / L112);
- [x] raport `docs/audits/AUDYT_PR92_2026-09-02.md` + wynik w opisie PR;
- [ ] każde znalezisko naprawione u root cause z testem RED→GREEN (osobny
      commit) — patrz sekcja poniżej.

### Znaleziska (potwierdzone repro, przed naprawą)

1. **Ślepy strażnik klasy L16** — `test/fingerprint-pending-decisions.test.js`
   bierze zbiór decyzji blokujących z ciała `firstPendingDecisionPlayerId`.
   Funkcja jest od M258 cienkim delegatem (`return firstPendingDecision(state)?.playerId`),
   więc regex zwraca **zero pól** i strażnik przechodzi vacuous. Dowód:
   `blockingPendingFieldsFromSource()` → `[]`.
2. **Realny ubytek w odcisku stanu** — `pendingWardPay` (od starszego PR) i
   `pendingExileCast` (dodany w PR #92) blokują grę w `firstPendingDecision`,
   ale nie ma ich w `PENDING_DECISION_FIELDS` ani w projekcji
   `stateFingerprint`. Dwa stany różniące się tylko tą decyzją mają identyczny
   odcisk → sonda „oferta bez skutku” i weryfikacja replayów są na nie ślepe
   (L16, ADR 0005). Po naprawie strażnika: 64 pola blokujące, 2 brakujące.
3. **Jolrael, Mwonvuli Recluse — `you_draw_second_card_each_turn` liczy z STANU,
   nie ze zdarzenia.** Warunek `state.cardsDrawnThisTurn[player] === 2` jest
   sprawdzany po całej komendzie, a licznik podnoszą TRZY miejsca
   (draw step, `drawPlayerCards`, cycling — L107: brak choke pointu).
   Repro: (A) „draw two” jako pierwsze dobranie w turze → **2** wyzwalacze
   (ma być 1); (B) dobranie w kroku + „draw two” → licznik 3 → **0**
   wyzwalaczy (ma być 1). Reguła CR: „whenever you draw your second card”
   odpala się RAZ, przy drugim dobraniu, niezależnie od tego, czy oba
   dobrania zaszły w jednej komendzie.
4. **Vaan (i każda karta z `any_combat_damage_to_player`) — dedup po
   KONTROLERZE kasuje wiele instancji zdolności.** Klucz `kontroler|podtypy`
   (wprowadzony w PR #92) nadal grupuje per gracz, więc przy DWÓCH
   instancjach zdolności odpala się tylko pierwsza napotkana. CR 603.2 +
   603.3: każda instancja wyzwalacza odpala się osobno. Repro: 1 kopia Vaana →
   1 trigger; 2 kopie → nadal 1 trigger.
5. **Discover (fix F z M280) — naprawiona OFFERTA, nie naprawiona WALIDACJA.**
   `resolve_discover_choice` w `execute()` przyjmuje `castFree: true` dla
   każdego `kind === 'spell'` (bez filtra celów/trybów/X/kosztów dodatkowych)
   i kładzie czar na stos z `targets: []` → fizzle (CR 608.2b) dla komendy
   spoza zakresu oferty (np. z odtwarzania, z klienta). Dodatkowo ten sam
   „prostokątny zakres” jest wpisany trzeci raz w bramce Vaana
   (`resolve_exile_cast`) — trzy kopie jednego filtra (L41/L48).

Obserwacje bez naprawy (udokumentowane, nie na zapas):

- Kicker żyje dziś wyłącznie na permanentach (`cast_permanent`);
  `spell_cast` nie niesie `kicked`. Dla Falconera w obecnym katalogu to bez
  znaczenia (jedyna karta z kickeriem: Kor Sanctifiers), a L52 każe
  zasygnalizować, nie budować wariantu na zapas → notatka w raporcie audytu.
  Ścieżka jest gotowa po stronie trygera (czyta i `ev.kicked`, i
  `object.wasKicked`).
- `library.find(controllerId === …)` jako wybór wierzchu biblioteki POSZKODOWANEGO
  — wzorzec zgodny z ~10 sąsiednimi ścieżkami w `effects.js` (spójność, nie
  nowa luka).

## Etap 2 — pętla jakości (ADR 0021 §4) + domknięcie planu 2.3 z M277

- [x] 2.1 naprawy znalezisk 1–5 (po jednym commicie, każde z testem RED→GREEN
      i weryfikacją mutacyjną).
- [ ] 2.2 **strażnik klasowy dla Findingu 3/4**: licznik „druga karta w turze”
      i dedup wyzwalaczy grupowych muszą być JEDNYM źródłem — skan źródeł
      (każdy `card_drawn` niesie `drawNumberThisTurn`; każda rodzina triggerów
      grupowych dedupuje po obiekcie-żywicielu zdolności).
- [ ] 2.3 polowanie na niezgodności z CR ścieżką NIEWYKORZYSTANĄ w M269–M277:
      porównanie „ostatnia mila” między deskryptorem karty a realnym zachowaniem
      enumeracji (oferta = walidacja) dla decyzji blokujących. Start: pełny
      przegląd pól `pending*` → oferta → walidacja → fingerprint (mechanicznie,
      nie wzrokiem).
- [x] NIE dotykać: `tapObject` dla cudzych permanentów (dług udokumentowany w
      M277, nie naprawiać na zapas).

## Ryzyka i pułapki (z LESSONS/ENVIRONMENT)

- Żywy Tester mierzy `dist/`, nie `src/` → `npm run build` przed pomiarem.
- Transkrypty poza repo; `edit_file` psuje polskie znaki → zapis przez `python3`.
- Mutacje: baza z `git show HEAD:<plik>` (L34); naprawa RED→GREEN per ścieżka (L13).
- Skan po ŹRÓDLE regexem kłamie przy spreadach (L5) — oczekiwania budować
  z prawdziwych obiektów/funkcji.
- Przed każdym pushem: `git log --oneline -3`, `git fetch origin <gałąź>` +
  `HEAD..FETCH_HEAD` / `FETCH_HEAD..HEAD`; force push zakazany (ADR 0020 D).
- Budżet lektury startowej na styk (~100k): nowe wnioski wyłącznie jako
  kotwice/do istniejących klas (L112/L113).

## Kolejność commitów

1. Ten plan (przed kodowaniem) → otwarcie PR.
2. Strażnik L16: przywrócenie zęba (ground truth = `firstPendingDecision`)
   + `pendingWardPay`/`pendingExileCast` w odcisku.
3. Jolrael: ordinal dobrania w zdarzeniu + choke point licznika.
4. Wyzwalacze grupowe: dedup po instancji zdolności (Vaan).
5. Discover/Vaan: jeden wspólny filtr zakresu darmowego rzutu w ofercie
   i w walidacji.
6. Raport audytu + `docs/PROJECT_HISTORY.md` + `docs/ENGINE_MILESTONES.md`,
   kumulatywny opis PR, numbers w README na koniec.
