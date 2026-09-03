# Handoff — audyt PR #93 + rzut kartą spoza ręki (M294), 2026-09-03

Gałąź sesji: `arena/01a066d9-mtg` · PR: **https://github.com/jurekjurekgh/mtg/pull/94**
(open, NIE scalony — scalenie to decyzja właściciela, preferowane „Squash and merge”).
Baza sesji: `83a9043` (= squash PR #93, `main`).

## Stan na koniec sesji

- **Audyt PR #93 zamknięty:** 89 plików diffu, raport
  `docs/audits/AUDYT_PR93_2026-09-03.md`. Werdykt: PR dobry; jedna decyzja
  (unifikacja filtru „prostego zakresu”) zostawiła trzy odchylki od Oracle —
  wszystkie trzy naprawione w tej sesji.
- **Bramy na HEAD gałęzi:** `npm test` **4295/4295** (baza 4276),
  `npm run test:all` **4305/4305**, `npm run build` **59 modułów / 3172,3 kB**
  (baza 3167,0 kB). Benchmark (profil szybki, 672 mecze) bez wyjątków:
  heuristic 83,9%, aggro 28,0%, random 4,2%.
- **Zero nowych kart w katalogu** (ADR 0021 §4c) i zero zmian w wycenach bota.
- Plan: `docs/plans/PLAN_2026-09-03-audyt-pr93-rzut-modalny-z-exile.md`.

## Co zrobiono (commity, każdy osobno zielony)

| commit | treść |
|---|---|
| `a38ac6d` | plan sesji + raport audytu (PR otwarty PRZED pierwszą zmianą w kodzie, ADR 0020 A) |
| `5e1ec49` | **A** — czar modalny w oknie zdolności Vaana jest rzucalny (`allowModes` + `abilityWindowCast` w `castModalSpell` + wspólny `legalModeCasts`) |
| `f7d0aac` | **B** — darmowy rzut Discover nie gubi czarów modalnych (tryb w ofercie, `chosenMode` na stosie, etykieta z nazwą trybu) |
| `e19b8e0` | **C** — koszt dodatkowy nie wyłącza rzutu z exile (ofiara / dopłata {N}; Discover płaci przez `payFreeCastAdditionalCost`) |
| `fc37fda` | **D** — czar z kosztem X w oknie zdolności: X wybiera gracz (CR 107.3a); Discover dla kart X zamknięte świadomie (CR 107.3b ⇒ no-op) |
| *(dokumentacja)* | raport (§4, §4b), M294, L127, historia, backlog (wpis X zamknięty), liczby README |

Każdy commit testowy przeszedł weryfikację mutacyjną (L13): 9 mutacji, tabela
w §7 raportu. Dodatkowo odwrócono test odziedziczony po PR #93, który
piętnował brak oferty jako zamierzony i zakładał stempel `playableUntilTurn`,
którego silnik już nie stawia (L5/L44 — przechodziłby bez naprawy).

## Gdzie szukać dalej

1. **ZAMKNIĘTE w tej sesji (`fc37fda`): X-cost i Fireball w oknie zdolności.**
   Zostaje jedno „gdyby”: pierwsza karta X sensowna przy X = 0 (np.
   `engineered-explosives` za 0) — wtedy decyzję o zamknięciu Discover trzeba
   podnieść osobno; predykat ma już parametr `allowX`, brakuje tylko zgody na
   ofertę no-opu w tej jednej ścieżce. Zobacz wpis w `docs/backlog.md` §2.
2. **Kicker na czarach bez pokrycia katalogowego** — silnik obsługuje (PR #93),
   ale w `card-data.js` nie ma ani jednego instantu/sorcery z `kicker`
   (drugi wpis w `docs/backlog.md` §2). Wniosek do właściciela: pierwsza taka
   karta domknie rodzinę testami na żywym stole.
3. **Cztery parametry predykatu** (`allowTargets`, `allowModes`,
   `allowAdditionalCost`, `allowX`) — nowa ścieżka „you may cast it” powinna
   odpowiedzieć na każde z nich pytaniem „czy potrafię to rozliczyć”,
   zamiast dopisywać kolejną kopię filtra (L48/L74).

4. **Ścieżki, których ta sesja nie ruszała, a mają ten sam kształt predykatu:**
   darmowy rzut z grobu (`resolve_grave_free_cast`) i madness odrzucają tryby
   z celami zmiennymi JAWNIE w wykonaniu — jeśli kiedyś dostaną enumerację
   celów, `epicCastOffers` ma już opcję `variableTargets`, wystarczy ją włączyć
   i przenieść `stunTargetId` do komendy (patrz komentarz przy opcji).
5. **Budżet lektury startowej:** ~95,5k / 100k tokenów po dopisaniu L127 (X). Wolne
   ~4,7k. Kolejna lekcja wymaga kondensacji istniejącego wpisu (Przypadek +
   Reguła + Strażnik, proza do `docs/LESSONS_PRZYPADKI.md`) — progu nie podnosić.
6. **Dług `pendingFertileThicket`** (63 wystąpienia) i `resolve_springbloom`
   (86) — bez zmian, liczby przypięte w M293/M294.

## Pokrycie Żywym Testerem (uczciwie)

Sześć partii na artefakcie (`final-fantasy`, `tarkir-wur`, `worek-dziki`;
profile `greedy`/`explorer`/`random`; 400–600 kroków): **0 zgłoszeń detektorów**.
Same okna z napraw (Vaan, Discover) nie wystąpiły ani razu — tester nie gra
scenariuszem, a Vaan jest jedną kartą w talii singleton i wymaga obrażeń
bojowych. Etykiety są udowodnione testami `commandLabel` + mutacją. Jeśli
następna sesja chce je zobaczyć na żywo: `run-game.mjs` nie ma `--fixture`
(patrz ENVIRONMENT), więc pozostaje grać wiele seedów albo dodać taki przełącznik.

## Pułapki napotkane w tej sesji

- Test odziedziczony po poprzedniej sesji potrafi być vacuous: `exileState`
  w `test/audyt-pr92-darmowy-rzut-zakres.test.js` zakładał stempel
  `playableUntilTurn`, który uprawniał rzut niezależnie od naprawy. Przed
  każdym „zielonym” testem z poprzedniej sesji: sprawdź, czy stan
  przygotowawczy odtwarza to, co silnik robi DZIŚ.
- Mutacja nakładana na plik, w którym został już inny eksperyment, daje mylący
  wynik (C2 + C3 w jednym biegu). Jedna mutacja = jeden bieg, `cp` do /tmp.
- `moveObjectDirectly` tworzy NOWY identyfikator obiektu: po poświęceniu stwora
  `state.objects.get('mine')` jest `undefined`. Testy sprawdzają przynależność
  do strefy (`state.zones.battlefield.includes(id)`), nie pole `.zone`.
- Test „doboru kart” musi mieć bibliotekę: pusta biblioteka kończy partię
  (CR 704.5a) i asercja mierzy przegraną zamiast efektu czaru.
