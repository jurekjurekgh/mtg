# Plan sesji 2026-09-28b — audyt scalonego PR #142 (F1–F9 + A/B) i pętla jakości

## Zlecenie i stan początkowy

- Prompt właściciela: „Kontynuujemy projekt.” — brak nazwanego tematu ⇒ ADR 0021
  (pętla domyślna). Krok 1 i 2 pętli: PR na starcie (ADR 0020 A) i **audyt
  poprzedniego scalonego PR** (ADR 0020 B / ADR 0016).
- Poprzedni PR: **[#142](https://github.com/jurekjrekgh/mtg/pull/142)** „Audyt PR
  #140 + A/B: nagłówki AI i dźwięki MP3”, scalony 2026-09-28T12:49:30Z jako
  `332a7fd`. To ostatni commit `main` i baza tej gałęzi.
- Zakres #142 (58 plików, +6 786 linii diffu): 9 napraw z audytu #140 (F1–F9)
  + dwie transze zlecenia właściciela (A: nagłówki Dokumentu AI; B: lokalne
  MP3 `snd/<artId>.mp3` z fallbackiem syntezy).
- Baza sesji: `arena/01a0e812-mtg` = `main` = `332a7fd`; gałąź **nie istniała**
  na origin przed tą sesją (potwierdzone `git ls-remote --heads origin`).
- Środowisko: 2 vCPU, `npm test` (szybki rdzeń) trwa kilkanaście minut;
  cięższe warstwy (`test:slow`) tylko punktowo.

## Roadmapa: etapy, kryteria ukończenia, kolejność commitów

### 0. PR na starcie (ADR 0020 A)

- [x] Plan (ten plik) jako pierwszy commit gałęzi → push → PR do `main`.
- [x] PR zawiera na starcie plan audytu i listę znanych punktów kontrolnych.

### 1. Baseline i rozpoznanie

- [x] `npm test` (szybki rdzeń) + `npm run build` na `332a7fd` — porównanie
  liczby testów i rozmiaru artefaktu z handoffem 2026-09-28
  (fast **6934/6934**, build **70 / 4536,3 kB**).
- [x] Inwentaryzacja diffu #142 per plik (podział na źródła silnika, UI, AI,
  Apps Script, testy) — zrobione lokalnie w `.arena/pr142/`.

### 2. Audyt PR #142 (ADR 0020 B, bez pełnego B0 — ADR 0018)

Kryteria: każdy zmieniony plik źródłowy przeczytany; zgodność z CR
weryfikowana **u źródła** (ADR 0030: CR 2026-09-25 + rulingi Scryfall);
zero przypadków specjalnych po nazwie/ID karty (ADR 0002); testy potwierdzone
mutacyjnie (L13), nie tylko „zielone”.

- [ ] F1 (`game-state.js`, look-top): walidacja `bottomOrder` **przed** pierwszą
  mutacją. Mutacja: przenieść bramkę za mutację → `test/audyt-pr140-look-top-atomic.test.js` RED.
- [ ] F5 (`permanents.js` + czytniki many/statyk): `abilitiesStripped` tłumi
  wydruk, nie granty; znaczniki czasu (`abilitiesStrippedAt`, `grantedAt`,
  `abilityTimestampOf`) w warstwie 6 CR 613. Sprawdzić CR 613.7a i CR 611.2.
  Mutacja: cofnąć bramkę w `mana-sources.js` → RED.
- [ ] F6 (`combat.js`, `choice-request.js`): maksimum spełnionych wymogów
  „blocks if able” (solver `maximalRequiredBlocks`, `completeBlockingAssignment`)
  i „can’t block alone” w całej deklaracji. Weryfikacja cytatów **CR 509.1c /
  506.5 / 509.1a** u źródła; sprawdzenie, że oferta i walidacja wołają ten sam
  predykat (L48). Mutacja: `maximalRequiredBlocks` → fałszywe zero → RED.
- [ ] F7 (`card-data.js`, `spells.js`, `effect-intent.js`, UI): Twiddle
  niemodalny, decyzja tap/untap przy rozstrzyganiu (ruling 2004-10-04),
  `optionalEffectVariants`, wspólny odczyt dla oferty i walidacji.
  Sprawdzić: kryterium CR 608.2d, brak drugiej kopii listy wariantów (L41),
  zgodność etykiet i logu. Mutacja: dopuścić wariant niemożliwy → RED.
- [ ] F8 (`combat.js`, `game-state.js`): deklaracja walki wymaga pustego stosu
  w ofercie **i** w obu walidatorach; sprawdzić u źródła CR 508.1 oraz to, czy
  to naprawa u root cause (skąd stan z niepustym stosem w kroku deklaracji).
- [ ] F9 (`render.js`, `session.js`): pełne opisy płatnych triggerów
  (pipy, życie, warunek „jeśli tak”), brak dublowania kosztu, `cannot_pay`
  w logu, etykieta `dies` bez „stwora”. Sprawdzić inwentarz całego katalogu
  (7 triggerów) i brak specjalnych przypadków po nazwie karty.
- [ ] F2/F3 (`ai-drive.js`, `ai-client.js`, `Code.gs`): brak `newGame` to nie
  jawne „nie”; pierwszy wpis per (URL, tryb, gameId); rozróżnienie
  anulowania użytkownika od timeoutu (pierwsza przyczyna) z zachowaniem
  komunikatu błędu sieci.
- [ ] F4 (`heuristic-bot.js`): kolory lądów z **produkowanej many**
  (`manaSourceOfView`), nie z pola `colors` karty; sprawdzić rodzinę
  pozostałych czytań kolorów lądu w bocie.
- [ ] A/B (`card-sound-player.js`, `spell-sounds.js`, `main.js`,
  `art-showcase.js`, `Code.gs`): brak Node-globali w kodzie artefaktu,
  poprawne ścieżki `snd/<artId>.mp3` (Pages/dist/file), jedno źródło prawdy
  ścieżek, brak sekretów i ciężkich plików w repo; `snd/` ignorowany.
- [ ] Zapis raportu: `docs/audits/AUDYT_PR142_2026-09-28.md` (per plik,
  dowody mutacyjne, wnioski APPROVE/APPROVE z zastrzeżeniami) + wpis w opisie PR.

### 3. Naprawy znalezisk z audytu (jeśli wystąpią)

- [ ] Każde znalezisko: RED→GREEN, naprawa u root cause (ADR 0002, L57),
  anty-over-fix, niezależna mutacja, `npm test` + `npm run build`,
  osobny commit i push (ADR 0020 C).
- [ ] Reguła trwała z wniosku (jeśli nowa) → ADR / `docs/LESSONS.md` /
  `AGENTS.md`; nie do handoffu (decyzja właściciela 2026-08-14).

### 4. Pętla jakości (ADR 0021) — po domknięciu audytu

- [ ] Najnowszy `docs/plans/PLAN_*.md` z nieodhaczonymi kryteriami — podjąć
  w miejscu urwania (przegląd listy planów pod kątem otwartych etapów).
- [ ] Żywy Tester (ADR 0012/L12): partie na taliach z mechanikami z #142
  (blok „if able”, Twiddle, płatne triggery, Xu-Ifit) + ręczna lektura
  transkryptu wzdłuż trzech osi z `TESTER_STOLU.md`; każda klasa znaleziona
  ręcznie kończy się detektorem (L27).
- [ ] Polowanie na niezgodności z CR inną ścieżką niż poprzednia sesja
  (kolejny obszar numerów/mechanik po 701/702 z L164/L165).
- [ ] Bez nowego batcha kart (ADR 0029 — katalog rośnie tylko z kolekcji).

### 5. Domknięcie sesji

- [ ] `npm run test:all` (brama PR) + `npm run build`; wynik do opisu PR
  i handoffu (liczby mierzone, nie przepisywane — L92).
- [ ] `docs/PROJECT_HISTORY.md`, `docs/setup/HANDOFF_2026-09-28b.md`,
  aktualizacja opisu PR (kumulatywnie), blok przekazania w czacie (ADR 0013).
- [ ] Bez merge i bez force push (ADR 0020 D, ADR 0007).

## Ryzyka i pułapki (z lektury startowej)

- **Reset workspace w trakcie sesji** (ENVIRONMENT §2): push po każdym zielonym
  commicie; przed pushem `git fetch` + porównanie `HEAD..FETCH_HEAD`.
- **Mutacje tylko na kopiach** (`cp plik /tmp/plik.bak`), nigdy
  `git checkout <plik>` na pliku z pracą tej tury (L136); po mutacji `git diff`
  musi być pusty poza zamierzoną zmianą (L159).
- **Cytaty CR z bieżącego wydania** (L164): numer sekcji potwierdzać w CR
  2026-09-25, nie przenosić arytmetycznie.
- **Solver bloków to logika wykładnicza w najgorszym razie** — sprawdzić capy
  i determinizm (ADR 0005) oraz to, że `legalBlockerOptions` nie eksploduje
  przy wielu wymogach.
- **Brak egressu w bashu**: dane u źródła pobierać `fetch_page` (ENVIRONMENT §4).
- **Testy długie**: 2 vCPU — pełna brama `test:all` liczona w minutach
  (ostatnio ~6–9 min); nie mnożyć przebiegów pełnych.

## Kryterium ukończenia całości

Audyt #142 zakończony raportem i naprawami (jeśli znaleziska), wszystkie
commity wypchnięte, `npm test` + `npm run build` zielone, opis PR i handoff
zaktualizowane, PR otwarty do decyzji właściciela.
