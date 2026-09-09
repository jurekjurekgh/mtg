# PLAN 2026-09-09c — sesja arena/01a0873b: audyt PR #109 + pętla jakości

Sesja: `arena/01a0873b-mtg` (1 sesja = 1 gałąź = 1 PR, ADR 0013/0020).
PR bieżącej sesji: #110. Prompt „kontynuujemy projekt" nie wskazuje tematu,
więc obowiązuje pętla domyślna ADR 0021: audyt poprzedniego scalonego PR,
reconciliacja niedomkniętego planu i pętla jakości. Nie dodaję kart bez listy
właściciela (ADR 0029) ani nie uruchamiam pełnego B0 (ADR 0018).

## Rozpoznanie i punkt zaczepienia

- `HEAD` i `origin/main`: `f66bccd` — scalony PR #109, „audyt PR #108 +
  pętla jakości".
- PR #109 zmienił 35 plików: fixy engine/UI/bota, testy A4/B5/B7, narzędzie
  detekcji kafli oraz dokumentację. Pełny diff został odczytany z `gh pr diff
  109`; poprzedni handoff: `docs/setup/HANDOFF_2026-09-09.md`.
- Najnowszy plan na `main` to `PLAN_2026-09-09b-audyt-pr108-petla-jakosci.md`.
  Jego checkboxy B3/B5/B6 są historycznie niedomknięte mimo artefaktów w PR
  #109 (A4, B5, B7, brama i handoff). Nie powtarzam wykonanych partii; zamykam
  rozbieżność przez niezależny audyt i dokumentuję stan w tym planie.
- Branch był czysty i został wypchnięty przed utworzeniem PR #110; ten plan
  jest pierwszym commitem zadania, przed zmianami funkcjonalnymi.

## Etapy i kryteria

### C1. PR, plan i baseline — [x]

PR #110 istnieje przed kodowaniem, plan jest wypchnięty osobnym commitem.
Kryterium: `npm test` i `npm run build` na bazie #109; wynik wpisany do
sekcji wykonania i opisu PR. Komit: plan.

### C2. Audyt PR #109 — [ ]

Przejrzeć każdy zmieniony plik i sprawdzić:

- **reguły / engine:** madness priority, LKI `faceDownCause`, źródło
  `manifest_dread_required`, kolor ochrony i zachowanie artefaktów na stosie;
  zweryfikować odpowiednie Oracle/CR z dosłownych źródeł online przed zmianą
  regułową (ADR 0030);
- **bot:** czy `DECK_ARRANGING_EFFECTS`, `isDrawOnly` i odbiorca `draw_cards`
  są generyczne, zgodne z widokiem i nie tłumią poprawnych ofert;
- **UI / FoW / język:** perspektywa buffów, hidden/LKI, źródło nazw, etykiety
  aur, liczników i runtime'owych deskryptorów;
- **testy i detektory:** czy testy przechodzą realną ścieżkę, mają właściwe
  asercje negatywne i mutacyjne; czy `detectTileRawSlug` nie generuje ciszy
  ani fałszywych alarmów;
- **proces:** zgodność liczb, handoff, opis PR i stale checkboxy poprzedniego
  planu.

Kryterium: `docs/audits/AUDYT_PR109_2026-09-09.md` z tabelą plik → werdykt,
znalezisko → repro → root cause → test/mutacja albo uzasadnione zamknięcie.
Najpierw audyt, potem ewentualne fixy; bez pełnego B0.

### C3. Naprawy znalezionych błędów — [ ]

Każdy rzeczywisty finding: RED reproducer → minimalna naprawa u root cause
(ADR 0002) → test regresyjny i weryfikacja mutacyjna (L13) → osobny zielony
commit. Testy i build po każdym kroku, push fast-forward po każdym commicie.
Nie naprawiam poprawnego kodu tylko dlatego, że komentarz/test jest
nieprecyzyjny; zgodność regułową rozstrzygam Oracle/CR.

### C4. Pętla jakości ADR 0021 — [ ]

Po audycie poprzedniego PR uruchomić pętlę bez nowych kart:

1. Żywy Tester na zbudowanym `dist/`, z perspektywą gracza i trzema osiami
   audytu; istniejące artefakty G1–G4 są dowodem tylko dla ich przypadków.
2. Ukierunkowane polowanie na niezgodność CR inną ścieżką niż A4/B5/B7,
   wyłącznie po pobraniu źródeł.
3. Jeśli narzędzie zgłasza nową klasę, naprawić tester/detektor razem z
   produkcją, nie maskować alarmu.

Kryterium: kilka świeżych partii lub uzasadnione znaleziska z detektorami,
`npm test` zielone.

### C5. Domknięcie — [ ]

- `npm run test:all` i `npm run build` jako końcowa brama;
- profil szybki benchmarku (`node tools/benchmark.mjs`, bez `--full`), bez
  podnoszenia progów;
- aktualizacja tego planu, `docs/audits/`, `docs/PROJECT_HISTORY.md`,
  `docs/setup/HANDOFF_2026-09-09c.md`, README i opisu PR dopiero po ostatnim
  funkcjonalnym commicie (L92);
- drzewo czyste, wszystkie commity wypchnięte, agent nie scala PR.

## Ryzyka i pułapki

- Najpierw `git status`, `git log`, `git fetch origin arena/01a0873b-mtg` i
  porównanie `HEAD..FETCH_HEAD` / `FETCH_HEAD..HEAD`; wyłącznie fast-forward,
  nigdy force push (ADR 0020 D).
- Żywy Tester ładuje `dist/`, więc po każdej zmianie `src/` uruchomić build
  przed pomiarem (L76). Nie edytować równolegle tego samego pliku.
- Nie ufać samym zielonym testom: przy fixie zachowania użyć RED→GREEN i
  mutacji gałęzi (L13); nie przywracać pliku przez `git checkout`, gdy ma
  niezatwierdzoną pracę (L136).
- Nie odczytywać kart/CR z pamięci. Egress `bash` jest ograniczony; użyć
  `fetch_page`, a brak źródła oznacza odłożenie findingu (ADR 0030).
- Nie uruchamiać `--full`; szybki benchmark jest dopuszczalny.

## Planowane commity

1. plan sesji (ten plik, przed kodem) — [x]
2. audyt PR #109 + baseline — [ ]
3. ewentualne fixy, po jednym na samodzielnie zielony finding — [ ]
4. ewentualna pętla jakości / detektor — [ ]
5. domknięcie: plan, HISTORY, handoff, README i opis PR — [ ]

## Podsumowanie wykonania

_(uzupełnię na końcu sesji; rozbieżność historycznego planu #109 zostanie
rozliczona w audycie, bez przepisywania historii poprzedniej sesji.)_
