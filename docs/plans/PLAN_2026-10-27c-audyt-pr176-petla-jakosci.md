# PLAN 2026-10-27c — audyt PR #176 (batch 70) i pętla jakości

> Sesja: gałąź `arena/d5e963c4-mtg`, PR tej sesji (ADR 0020 A).
> Wejście: prompt właściciela „Kontynuujemy projekt." (temat nienazwany →
> ADR 0021: PR → audyt poprzedniego PR → niedokończony plan → pętla jakości).
> Poprzedni scalony PR: **#176** (`59815d5`, sesja 2026-10-26c/27 — audyt PR
> #175, pętla jakości, batch 70 = 10 kart).

## Rozpoznanie (zmierzone, nie z handoffu)

| Pozycja | Wartość |
|---|---|
| `npm test` (szybki rdzeń) na bazie `59815d5` | **8972/8972**, exit 0, ~162 s |
| `npm run build` | **76 modułów / 5512,3 kB**, exit 0 |
| Handoff 2026-10-27 deklaruje | 8948/8948, 76 / 5502,4 kB |
| Rozjazd | +24 piny i +9,9 kB po pomiarze w handoffie → liczby handoffu są sprzed ostatnich commitów (L92) — bez znaczenia dla bram, do odświeżenia w handoffie tej sesji |

Zakres PR #176 do audytu: **95 plików**, w tym 43 w `src/` i `docs/`
(+3291/−95 linii). Kluczowe pliki silnika: `resources.js` (Improvise, Converge),
`permanents.js` (X w koszcie permanentu), `effects.js` (prewencja zdejmująca
liczniki, licznik z cmentarza), `combat.js` (ewazja po typie blokera),
`abilities.js` (cel `onlyIfKicked` / `anotherTarget`, prewencja licznikowa),
`triggers.js` (`manifest_dread_resolved`, `counter_removed`),
`heuristic-bot.js` + `heuristic-params.js` (wyceny nowych rodzin).
Nowe karty batcha 70: Arlinn's Wolf, Fen Hauler, Jilt, Kaleidoscorch,
Magma Pummeler, Moldgraf Millipede, Orazca Puzzle-Door, Paranormal Analyst,
Trigon of Rage, Vault of Whispers.

## Etapy

- [x] **A0** Plan + PR sesji (ten plik) — commit przed kodowaniem.
- [x] **A1** Audyt PR #176 wg ADR 0020 B / ADR 0016 — każdy zmieniony plik
      `src/` pod kątem: zgodności z CR (cytat dosłowny, ADR 0030) i z Oracle
      kart, generyczności (ADR 0002 — zero przypadków po nazwie/ID karty),
      FoW/PlayerView (ADR 0003/0017), determinizmu (ADR 0005), oferta =
      walidacja (L48). Sprawdzenie testów RED→GREEN (L13) i tego, czy pin
      mierzy regułę (L5). Raport: `docs/audits/AUDYT_PR176_2026-10-27.md`.
- [x] **A2** Naprawy findingów u root cause, każdy z pinem i mutacją RED,
      osobnym commitem (ADR 0020 C) — zrobione: F-1 (`721aec2`) oraz na polecenie
właściciela z 2026-10-27c O-1 (`a023d35`) i O-2 (`bca14ac`). O-3/O-5 zostają
otwarte świadomie (opisał je raport audytu).
- [x] **A3** Higiena planów: `PLAN_2026-10-27b` ma status „WYKONANY", ale
      niezaznaczone etapy P0–P7 (dryf dokumentacji) — odhaczyć z odsyłaczem do
      commitów, bez zmiany treści kryteriów.
- [x] **A4** Pętla jakości (ADR 0021 pkt 4): (a) Żywy Tester z perspektywy
      gracza — partie po `npm run build`, ręczna lektura transkryptów wg osi
      `docs/setup/TESTER_STOLU.md` (L27: zero zgłoszeń ≠ brak błędów);
      (b) polowanie CR inną ścieżką niż poprzednia sesja (poprzednio
      614/616/106 + 601.2); (c) analizatory: `event-contract-audit`,
      `family-audit`, `bot-tie-audit`, `scoring-mulligan-audit`,
      `scoring-unvalued-audit`.
- [x] **A5** Bramy i domknięcie: `npm test`, `npm run test:slow`,
      `npm run build`, benchmark quick (ADR 0018 — pełna macierz tylko na
      polecenie), `PROJECT_HISTORY.md`, `ENGINE_MILESTONES.md`, handoff
      `HANDOFF_2026-10-27c.md`, opis PR kumulatywnie, blok przekazania
      w czacie (ADR 0013 §2).

## Kryteria ukończenia

1. Każdy plik `src/` zmieniony w PR #176 ma werdykt w raporcie audytu
   (OK / finding z numerem).
2. Każdy finding: naprawa u root cause + pin czerwieniejący bez naprawy.
3. Pętla jakości ma zmierzony wynik (partie, zgłoszenia detektorów, analizatory).
4. Bramy zielone; liczby w README/handoffie zmierzone na końcowym drzewie (L92).

## Ryzyka / pułapki

- **Squash bez historii lokalnej**: `git log` na klonie ma 1 commit; diff PR
  #176 wymaga `git fetch --deepen` (zrobione) — porównuj z `HEAD^`, nie z
  `origin/main` (ten sam commit).
- **Golden-master** (`test/bot-scoring-snapshot.test.js`) czerwienieje od
  każdej zmiany wyceny — regeneracja tylko po przeglądzie różnic (L124/L176).
- **Testy pełnych partii na zamrożonych seedach** (L53) — przy zmianie talii
  przelosowanie hunterem; nie luzować asercji.
- **Przed każdym commitem** cały `npm test`, nie tylko dopisany plik.
- **Nie scalać PR** (ADR 0007/0020) — scalenie to decyzja właściciela.
