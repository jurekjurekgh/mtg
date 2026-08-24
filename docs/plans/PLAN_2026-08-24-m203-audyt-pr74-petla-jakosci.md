# PLAN M203 — audyt PR #74 + pętla jakości (2026-08-24)

Sesja: `arena/01a03566-mtg` · PR: **#75**
Tryb: **ADR 0020** (PR → audyt poprzedniego PR → inkrementalne commity)
+ **ADR 0021** (prompt „kontynuujemy" = pętla domyślna, nie pytanie o kolejkę).

## 0. Rozpoznanie (wykonane PRZED spisaniem planu — wszystkie liczby zmierzone)

| Pomiar | Wynik | Uwaga |
|---|---|---|
| `git log --oneline -1` | `7bdef17 M202: audyt PR #73 + pętla jakości (#74)` | klon Areny spłaszczony do 1 commita |
| `npm test` (szybki rdzeń) | **3181/3181 pass, 0 fail** (~117 s) | `PROJECT_STATE.md` podaje 3096 dla BAZY PR #74 — 3181 to stan PO nim |
| `npm run build` | **53 moduły / 2626.0 kB** | `PROJECT_STATE.md`: 2592.4 kB dla bazy |
| egress HTTPS | **ZABLOKOWANY** | `curl https://api.scryfall.com/...` → `000`; `fetch` w Node → `fetch failed`; `https://registry.npmjs.org/jsdom` → `200` |
| diff PR #74 | `gh pr diff 74` → 57 plików, 4987 linii diffu | PR #74 scalony 2026-08-24 (M202) |

**Sprzeczność w dokumentacji (rozstrzygnięta pomiarem):** `PROJECT_STATE.md`
(M202, §„Środowisko") twierdzi, że „egress HTTPS NIE jest zablokowany, wbrew
`docs/setup/ENVIRONMENT.md` §4 (do korekty)". Pomiar z tej sesji: egress JEST
zablokowany, a `ENVIRONMENT.md` §4 jest poprawny. Korekta `PROJECT_STATE.md`
wchodzi w Etapie 1.

## 1. Audyt PR #74 (ADR 0020 B / ADR 0016) — etap bieżący

Przegląd każdego zmienionego pliku pod kątem: zgodności z CR, ADR 0002 (brak
przypadków po nazwie/ID karty w core), ADR 0003/0017 (FoW i kompletność
widoku), ADR 0022 (pełny Oracle albo brak wsparcia), L48 (oferta = walidacja),
L21/L31 (martwe pola deskryptorów), L41 (jedno źródło reguły), L58 (kod stołu
= kod przeglądarkowy), L59 (ograniczenie zasobu przez ZAKAZ + strażnik każdej
ścieżki).

Obszary najwyższego ryzyka (nowa logika reguł w PR #74):

1. **N1 — mana ograniczona drukiem** (`spellManaPurpose` /
   `restrictedManaBlocked` w `resources.js` + jawny cel w ~25 ścieżkach):
   czy ZAKAZ działa we WSZYSTKICH ścieżkach płatności (L59), czy celem jest
   „rzucanie czaru" (CR 118.4/601.2f), a nie „płacenie kosztu", i czy żadna
   ścieżka nie została pominięta.
2. **Brąz 1 — CR 704.5m / 104.4b** (`state.emptyLibraryDraw`, rozstrzygane
   razem z życiem i trucizną): czy WSZYSTKIE ścieżki dobrania ustawiają
   znacznik (draw step, efekt, `drawPlayerCards`), i czy remis nie zamienia
   się w zwycięstwo przy jednym graczu z pustą biblioteką.
3. **Brąz 3 — CR 616.1** (`resolve_replacement_choice`): pełne okablowanie
   (stan, fingerprint, protokół, oba boty, etykiety, log), przypadek, gdy
   wybór staje się bezprzedmiotowy, oraz CR 704.3 („then the process
   repeats") — po tarczy dobija regeneracja.
4. **Brąz 2 — CR 702.170d** (`plottedCastAllowed` w walidacji i ofercie):
   zgodność oferta = walidacja (L48).
5. **N4 — wspólny `exileAdditionalCostCandidates`**: czy trzy gałęzie oferty
   (z ręki, z flash, z impulsu) naprawdę liczą ten sam koszt.
6. **A/B/C/D właściciela** — rewers karty (FoW: jeden wspólny adres, CR 402.2),
   `previewCardIdOfOption` (cele przed źródłem), etykiety triggerów, oraz
   **nierozwiązane D** (konwencja `unshift` w `playerView` vs `push` dla
   triggerów — decyzja właściciela, w tej sesji: pomiar i propozycja, NIE
   samodzielna zmiana konwencji).

Kryterium ukończenia: raport `docs/audits/AUDYT_PR74_2026-08-24.md` (znaleziska
N*, obserwacje O*, lista „zweryfikowane jako poprawne") + commit + push.

## 2. Naprawa znalezisk audytu (osobny commit na każdy fix)

Każdy fix: test RED (z weryfikacją mutacyjną — odwrócenie fixa musi dać FAIL)
→ naprawa u ROOT CAUSE (zakaz masek) → `npm test` + `npm run build` →
commit + push. Bez pełnego B0 (ADR 0018); do opisu PR wystarcza profil szybki.

## 3. Porządki rozstrzygnięte w tej sesji (nie wymagają decyzji właściciela)

- [ ] **Korekta `PROJECT_STATE.md`** — wpis M202 o egress jest sprzeczny
      z pomiarem i z `ENVIRONMENT.md` §4; `ENVIRONMENT.md` jest dokumentem
      trwałym dla ograniczeń środowiska (`AGENTS.md` §„Gdzie zapisać regułę").
- [ ] **Usunięcie `commit-msg.txt`** z katalogu głównego — plik śledzony,
      jedyny commit, który go dotyka, to squash PR #74 (czyli wszedł
      przypadkiem przy squashu); reguła `ENVIRONMENT.md` §3 mówi wprost:
      komunikaty commitów pisz POZA repo. Znalezisko O3 z audytu PR #73.

## 4. Pętla jakości projektu (ADR 0021 pkt 4) — po domknięciu audytu

- (a) **Żywy Tester** (`tools/table-tester`, `npm i` w katalogu narzędzia —
      rejestr npm działa) — trzy osie z `TESTER_STOLU.md`; braki testera
      naprawiam w testerze, nie pomijam fragmentu partii.
- (b) **Polowanie na niezgodności z CR** innymi ścieżkami niż M202 (które
      obszary są już zweryfikowane jako POPRAWNE — patrz `PROJECT_STATE.md`
      §M202 „nie badać drugi raz").
- (c) **BEZ nowego batcha kart** — karty tylko z listy właściciela w czacie
      albo z niedokończonego planu, który już tę listę zawiera (ADR 0021).

## 5. Zamknięcie sesji

- [ ] `npm test` + `npm run build` zielone; `git status` czysty;
      `git log origin/arena/01a03566-mtg..HEAD` puste.
- [ ] `docs/PROJECT_STATE.md` (nowy wpis M203 + korekta egress).
- [ ] `docs/setup/HANDOFF_2026-08-24-m203.md`.
- [ ] Nowe lekcje w `docs/LESSONS.md` (format pilnowany przez
      `test/docs-decisions.test.js`).
- [ ] Opis PR #75 zaktualizowany kumulacyjnie; blok przekazania w czacie.

## Ryzyka i pułapki

- **Reset workspace w trakcie sesji** (`ENVIRONMENT.md` §2) — push po każdym
  zielonym kroku; przed pushem `git fetch` + porównanie `HEAD..FETCH_HEAD`;
  **force push zakazany** (ADR 0020 D).
- **Polskie znaki** — edycje plików z polskim tekstem przez `python3`
  + `pathlib` (`edit_file` potrafi je uszkodzić, `ENVIRONMENT.md` §4).
- **Egress zablokowany** — danych kart NIE pobieram z sieci w sandboxie;
  `fetch_page` + zapis do repo (ADR 0010).
- **Tematy do decyzji właściciela** (nie blokują pracy, nie rozstrzygam sam):
  D — jedna zmiana konwencji `unshift`/`push` w `playerView` + pomiar
  benchmarku zamiast trzech łatek; N3 z M202 — strażnik już stoi, zmiana
  potrzebna dopiero przy pierwszej karcie z kosztem dodatkowym na obiekcie
  + suspend/rebound/madness.
