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
- [x] każde znalezisko naprawione u root cause z testem RED→GREEN (osobny
      commit) — zrobione: `fb92c01` (1+2), `094a8c0` (3), `0b409fd` (4),
      `10f7a39` (5); szczegóły i werdykt w `docs/audits/AUDYT_PR92_2026-09-02.md`.

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
- [x] 2.2 **strażnik klasowy dla Findingu 3/4** — zrobione w dwóch
      mechanizmach: rodzina pól `draws` w `tools/family-audit.mjs` (każdy zapis
      `cardsDrawnThisTurn` poza `players.js` = naruszenie) oraz
      `CONTRACT_REQUIRED_FIELDS` w `tools/event-contract-audit.mjs` (KAŻDY
      emiter `card_drawn` musi nieść `drawNumberThisTurn`). Przy okazji wyszło,
      że reguła większościowa `CONTRACT_RATIO = 0.6` milczy dla rodzin
      dwuemiterowych (1/2 = 50%) — stąd wymóg deklaratywny. Dedup grupowych
      triggerów pozostaje pilnowany testem behawioralnym
      (`test/audyt-pr92-grupowe-trygery.test.js`, oba kierunki), bo strukturalny
      skan klucza grupowania byłby zgadywanką; siostrzana grupa
      `leftBattlefield` zapisana w `docs/backlog.md`.
      Piny anty-vacuous: `test/family-audit.test.js` (próbki bypass/legal per
      rodzina) i `test/m273-kontrakty-zdarzen.test.js` (mechanizm na syntetycznych
      emiterach + brak jednoczesnego wyjątku).
- [x] 2.3 polowanie na niezgodności z CR ścieżką NIEWYKORZYSTANĄ w M269–M277:
      porównanie „ostatnia mila” między deskryptorem karty a realnym zachowaniem
      enumeracji (oferta = walidacja) dla decyzji blokujących. Start: pełny
      przegląd pól `pending*` → oferta → walidacja → fingerprint (mechanicznie,
      nie wzrokiem). **Wynik (raport, §5):** 68 nazw `pending*` w `src/engine/`,
      64 blokują priorytet, 68 w projekcji odcisku (100% po `fb92c01`);
      4 pozablokadowe to księgowość przejściowa (`pendingAbilityActivation`,
      `pendingDevourEtbs`, `pendingSpellDiscounts`, `pendingSpellReturnToHand`)
      — każda sprawdzona ręcznie pod kątem „czy gracz musi na nią czekać”.
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


## Dodatek (tura 2, 2026-09-02): rozstrzygnięcia właściciela i ich status

Pytania z §7 raportu doczekały się odpowiedzi właściciela; wszystkie cztery
wdrożono w turze 2 (osobne commity, każdy zielony):

| pytanie | odpowiedź właściciela | status |
|---|---|---|
| (a) zachowanie per karta w rdzeniu vs tag w danych | „Engine jest headless, name-agnostic" | ✅ `trigger.groupPer`, `start_engines` jako `static` + `effect`; zero nazw kart w warunkach |
| (b) kicker na instant/sorcery | „OCZYWIŚCIE OBSŁUŻYĆ" (nie `limitations`) | ✅ `castSpell(..., kicked)` + oferta + UI (`3d07dc0`) |
| (c) czy da się zweryfikować rulingi | „narzędzie fetch działa i możesz wszystko ściągać z netu" | ✅ `tools/fetch-card-rulings.mjs`, 9 snapshotów z rulingami, odchylenia naprawione |
| (d) Skarb Vaana składany ręcznie | „w katalogu tokenów od dawna jest Treasure Token" | ✅ `TREASURE_TOKEN_EFFECT` + zdolność w `token_treasure` + test antydryfowy |

Punkty planu z tury 1 (2.1–2.3) pozostają bez zmian; §6 raportu (odrzucone
podejrzenia) nie wymagał wznowienia. Kolejne polowanie: cienie danych karty w
`mana-sources.js`/`resources.js` (Skarb) — patrz §9 raportu.


---

## Dodatek (tura 8, 2026-09-02): uwagi właściciela z gry na żywym stole (A–D)

Właściciel przetestował stół i zgłosił cztery uwagi. Zakres tej tury = one, w tej
kolejności; każda jako osobny, zielony commit.

| # | zgłoszenie | rozpoznane sedno | próg akceptacji |
|---|---|---|---|
| A | „modal Knockout Maneuver jest dziwny — zaznaczanie nie w polach do zapunktowania; zróbcie jeden wspólny helper do efektów wielocelowych w stylu blokowania/Fireball" | kreator wielocelowy (`renderMultiTargetWizard`) rysuje wiersze jako `<button>` z tekstem `[ ] / [x]` i osobnym przyciskiem „Podgląd", a **nie ma ani jednej reguły CSS** (`.multi-target-*` nie istnieje w `index.html`); wizard walki ma natywne `<input type=checkbox>` w `<label>` i pełny styl dotykowy | wspólny helper wiersza wyboru (`src/table/picker.js`) używany przez oba kreatory; logika dalej per efekt; `tools/table-tester` nadal klika `.multi-target-toggle`; testy UI przerobione na nową strukturę |
| B | „karty specjalne (Undercity, Day/Night, Poison) mają powiększać się na hover jak zwykłe karty — teraz działa tylko klik" | `renderUndercity` **dostaje** opcję `hover`, ale `renderTableView` jej NIE przekazuje; `renderPoisonPanel` w ogóle nie przyjmuje hoveru; żadna z trzech kart nie ma reguły `:hover` na ilustracji (stół ma `.tile .cardvis .card-img:hover`) | hover podpięty we wszystkich trzech (wraz z wirowaniem torów), reguła `:hover` w CSS, test **sprawdzający przekazanie** (nie tylko sam komponent — to on puścił błąd) |
| C | „bot przełożył Thieves' Tools dwukrotnie w jednej turze — po co płacić equip na pierwszego, skoro zaraz na drugiego; ukrócić" | gałąź przeniesienia sprzętu między WŁASNYMI nosicielami liczy tylko `delta = power(cel) − power(nosiciel)` i **pomija badanie M244, czy sprzęt w ogóle coś celowi dodaje** (Thieves' Tools = warunkowa ewazja „cantBeBlockedMaxPower: 3" → na 7/7 Martucie martwa, pompa żadna). Zmierzony repro: `activate_ability(tools#0->marut) score=+11,00` przy `attachedTo=porter` | jedna wycena „payloadu" sprzętu dla obu gałęzi; przeniesienie na nosiciela, któremu sprzęt nic nie daje, schodzi poniżej passu; test anty-prze-fix (płaska pompa +2/+2 nadal może się przeprowadzać); benchmark `--seeds 24` przed/po — próg: brak regresji |
| D | „w nakładce końca gry dodaj życie końcowe obu graczy i — jeśli koniec gry to wyczerpanie biblioteki — u kogo" | `updateTurnIndicator` w gałęzi kończącej pisze samo `Koniec partii — wygrywa X` `textContent`, a przyczyna przegranej jest już w zdarzeniu `player_lost.reason` (`life_zero` / `poison_ten` / `empty_library`) i w `player_conceded` — tłumaczy ją tabela etykiet w `session.js` (ta sama powinna obsłużyć overlay) | overlay: zwycięzca + `Gracz N ż. — Bot M ż.` + przyczyna (pusta biblioteka/trucizna/poddanie), test jedn. na czystej funkcji + strażnik, że main.js jej używa |

**Bramy całej tury:** `npm test` na zero failów, `npm run test:all` (brama PR),
`npm run build` + partia Żywego Testera po zmianach UI (A, B) i po zmianie wag bota
(C) — detektory „brak zgłoszeń", benchmark A/B na tej samej próbie, dokumentacja ze
strażnikami doków. **Nie robimy:** nowych lekcji bez zwolnienia miejsca (budżet
lektury), podnoszenia progu, zmian w katalogu kart.
