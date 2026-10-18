# PLAN 2026-10-17d — PMSSB-63: pełna pętla M429 dla batcha 68

Status: **W TOKU**. Batch 68 NIE jest „zrobiony”: silnik gotowy (G0–G7, `docs/plans/PLAN_2026-10-17c-batch68-kart.md`),
wycena bota była płaska i właściciel ją odrzucił (2026-10-17). Ten plan prowadzi wycenę przez procedurę
0–7 z `docs/PMSSB.md`.

## Krok 0 — plan (ten dokument)

Zakres: 10 kart batcha 68. Rodziny (wg mechaniki, nie nazwy karty):

| Rodzina | Karty | Decyzja bota | Status |
|---|---|---|---|
| Masowe zniszczenie (`destroy_all`, tryb pary) | Austere Command | model stołu `massDestroyValue` | ZAMKNIĘTE z poprawką (`e48caff`) |
| Zniszczenie + dobranie gdy MV ≤ N | Raze to the Ground | dobranie = `draw_cards` z karą deck-outu | ZAMKNIĘTE z poprawką (`95fc359`) |
| Wymiana ciał (wygnanie + token dla kontrolera) | Secure the Scene | `exileSwap`: karta + ciało − token − koszt | ZAMKNIĘTE z poprawką (`9ba8f8e`) |
| Kontra „unless pays” + scry | Stymied Hopes | `counterUnlessPaidOff`, M237/2 | ZAMKNIĘTE bez zmiany (piny) |
| ETB wyciągnij-zagraj + basic landcycling | Kulrath Zealot | landcykling = `landKeepValue` − `cardKeepValue` | ZAMKNIĘTE z poprawką (`9ba8f8e`) |
| Prowess (zdolność wyzwalana) | Bloodfire Expert | — | OTWARTE: zdolność wyzwalana nie jest wyceniana (PMSSB-65) |
| Obrażenia ETB + kamień many | Meteorite | `damage` + mana rock | ZAMKNIĘTE bez zmiany (akceptacja: 2 w twarz ≈ 0) |
| Lifelink (słowo kluczowe) | Child of Night | — | OTWARTE: słowa kluczowe w rzucie stworzenia nie są wyceniane (PMSSB-64) |
| „can't be blocked” ETB | Neurok Invisimancer | `cant_be_blocked`, `Math.max(0, …)` | ZAMKNIĘTE bez zmiany (piny) |
| Zdolność z grobu (Skarb) | Halo Scarab | M243/C bank many | ZAMKNIĘTE (reguła właściciela, do potwierdzenia) |

Kryterium zamknięcia: każda rodzina ma pomiar PRZED/PO (sonda), pin decyzji, pin liczbowy składowych
albo kontrolę dodatnią, i pokrętło ×0 sterujące wynikiem. Brak zgodności = status OTWARTE z liczbami.

## Krok 1 — pomiar PRZED
- Austere: `tools/pmssb63-batch68-sonda.mjs` (9 scenariuszy), PRZED na HEAD przed zmianą modelu: 6/9.
- Karty: `tools/pmssb63-batch68-karty-sonda.mjs`, PRZED na HEAD przed poprawką Raze: R2 = cast 80 (błąd), S2 = cast 67.95.

## Krok 2 — audyt (macierz kierunek × cel × timing × stan)
Austere (kierunek: swój/wroga; cel: art./ench./stwory MV≤3/≥4; timing: main; stan: liczba, siła, blok, TMC, ręka, życie).
Raze (cel: artefakt; MV ≤1 → dobranie; biblioteka 0/1–3/≥4). Secure (cel: wróg/swój; stwór/nie-stwór; token kontrolera).
Stymied (cel: wrogi czar; wrogi otwarta mana ≥1 vs 0). Kulrath (ETB exile top; landcycling; ziemia w fazie).

## Krok 3–4 — wdrożenie i testy
Jedna rodzina = jeden commit. RED→GREEN. Piny: `test/audyt-pmssb63-batch68.test.js` (Austere),
`test/audyt-pmssb63-karty.test.js` (Raze). Wyniki OTWARTE nie są pinowane jako zielone.

## Krok 5 — ewaluacja
Golden-master: regeneracja tylko świadomie z `--dump` (atrybucja). Dotąd: bez dryfu (żaden ślad nie zawiera Austere/Raze).

## Krok 6–7 — dokumentacja i bramki
Raport `docs/audits/PMSSB63_BATCH68_2026-10-17.md`, wpis w `docs/PMSSB.md` (status W TOKU), PROJECT_HISTORY.
Bramki: `npm test`, `npm run build`, `npm run test:all` — przed każdym „zrobione”.
