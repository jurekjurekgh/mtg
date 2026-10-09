# Sesja 2026-10-08c — audyt PR #158 + pętla jakości

Gałąź `arena/563e279e-mtg`. Tryb **ADR 0020**: PR otwarty przed kodowaniem →
audyt poprzedniego scalonego PR → inkrementalne commity (każdy zielony krok
osobno, pushowany natychmiast). Bez merge przez agenta, bez force push, bez
pełnego B0 (ADR 0018), bez nowych kart (ADR 0029).

Prompt startowy nie nazwał tematu, więc sesja działa pętlą domyślną
(**ADR 0021**).

## Zakres

1. **Audyt PR #158** (ADR 0020 B / ADR 0016) — 121 plików, +7890/−488:
   audyt PR #157 i cenzus cytatów CR, zgłoszenie E (regeneracja
   jednorazowo), zgłoszenia F–K (sześć napraw wyceny bota), batch 64
   (10 kart kolekcji właściciela + migracja talii Dominaria), PMSSB-59
   (pętla jakości mechanik batcha 64). Raport:
   `docs/audits/AUDYT_PR158_2026-10-08.md`.
2. **Naprawy znalezisk** u root cause, każda z pinem RED→GREEN i dowodem
   mutacyjnym (L13).
3. **Pętla jakości** (ADR 0021 pkt 4): Żywy Tester z perspektywy gracza +
   nowe detektory (L27) oraz łowy na niezgodności z CR inną ścieżką niż
   poprzednia sesja.

Roadmapa: `docs/plans/PLAN_2026-10-08c-audyt-pr158-petla-jakosci.md`.

## Bramki (mierzone, nie przepisywane; L92)

| Brama | Przed zmianami (`f836c90`) | Po zmianach (HEAD) |
|---|---|---|
| `npm test` (fast) | 7900/7900, EXIT 0 | **7918/7918**, EXIT 0 |
| `node tools/run-tests.mjs all` | 8164/8164, 352,6 s | **8179/8179**, 346,5 s, EXIT 0 |
| `npm run build` | 73 moduły / 4959,4 kB | 73 moduły / **4961,5 kB** |
| `node tools/cr-numery.mjs` | OK, 515 numerów / 5575 cytatów | OK, **516 / 5600** (+707.2a) |
| Żywy Tester (3 partie audytowe + 1 przeglądowa) | — | **0 detektorów, 0 niewycenionych ruchów** |

## Znaleziska i naprawy

| # | Treść | Naprawa |
|---|---|---|
| **F-1** | Kopiowalny zakaz blokowania (CR 707.2/707.2a) ginął w **sześciu** ścieżkach kopiowania: enter as copy, `copy_creature`, offspring (702.175a), embalm (702.128a), token-kopia Moonlit, `create_copy_token` | `cantBlockPrinted` w kopiach w miejscu + `cantBlock:` w tokenach; 15 testów (8 pinów ścieżek + 7 straży katalogowych/źródłowych); protokół mutacyjny mF1–mF6 + anty-over-fix |
| **F-2** | Sierocy JSDoc PMSSB-41/B nad `endureBodyValue` (podwójny `/**`) opisywał `untapTargetValue` | przeniesiony na właściciela |
| **F-3** | `lifePayThreshold` zadeklarowany PO konsumencie (TDZ; wywrotki nie było, bo wycena jest leniwa) | przeniesiony przed `endureBodyValue` |
| **F-4** | Literówki w komentarzach (8 miejsc) | poprawione |
| **F-5** | 18 spełnionych kryteriów w dwóch planach zostało nieodhaczonych | odhaczone z adnotacją dowodu |
| **F-6** | `copy_creature` nie ma wytwórcy (martwa gałąź) | obserwacja + pin F-1/7, decyzja właściciela |
| **F-7** | `.gitignore` wykluczał fixture'y Żywego Testera, które README opisuje jako rejestr | negacja `!tools/table-tester/fixtures/*.txt` + fixture w repo |
| **F-8** | Błąd samego audytu (poprawiony po uwadze właściciela): spis nośników „can't block" brał jedno pole, więc raport twierdził „jedyny nośnik". Nośników jest **7** w trzech kształtach: druk karty (Bog Hoodlums), stała cecha tokenu (Goblin Construct z Relic Robber, Phyrexian Mite z Crawling Chorus), zakaz z załącznika (Clawing Torment, Hobble, Bonds of Faith) | straż S7–S9; korekta §2 raportu. Tokeny to artefakty, a Moonlit czepia „artifact or creature" — więc dla token-kopii luka była **osiągalna już dziś**, nie utajona |

Nowe detektory (L27): straż katalogowa (pętla po każdej karcie z drukowanym
`cantBlock` **i po każdym tokenie z takim drukiem** przez wszystkie ścieżki
kopiowania, plus pin „efekt załącznika nie jest kopiowalny") i straż źródłowa
(każde `createBattlefieldToken` kopiujące musi nieść KLUCZ `cantBlock:`) —
sprawdzone mutacją (mF1–mF6 + anty-over-fix; usunięcie linii naprawy w
token-kopii Moonlit daje `# fail 4`).

## Pętla jakości — Żywy Tester

Powtórka audytu zgłoszenia E z kolejki `HANDOFF_2026-10-08` (klasy L14/L50/L131)
na `dist/mtg-table.html` w jsdom: fixture `regen-audyt`, seedy 77/808/31337,
profil `greedy`, przeciwnik `the-edge`. **Po stronie bota 0 aktywacji
regeneracji** we wszystkich trzech partiach (tester greedy: 4/0/5), detektory 0,
ruchy niewycenione: brak, wszystkie partie zakończone naturalnie — fix E
(CR 701.19a) się utrzymuje. Partie przeglądowe `dominaria-wu` vs `dominaria-brg`
(seed 42, 120 kroków): 21 tur, 0 zgłoszeń, pokrycie UI 23/23.
