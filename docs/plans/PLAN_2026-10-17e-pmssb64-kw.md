# PLAN 2026-10-17e — PMSSB-64: słowa kluczowe ciała w wycenie rzutu stworzenia

Zatwierdzenie właściciela (2026-10-17): „kontynuuj z 64 i 65”. Rodzina: słowa kluczowe ciała
stworzenia rzucanego z ręki (L41: rzut, warp, adventure, szacunki planowania).

> Uwaga o kolejności: plan powstał PO pomiarze PRZED (krok 1 procedury) i PO pierwszej
> implementacji, bo pomiar wykrył dublowanie i inwersję, które zmieniły projekt. Kroki poniżej
> opisują to, co faktycznie zrobiono, w kolejności wykonania.

## Krok 1 — POMIAR PRZED
- Sonda: `tools/pmssb64-keywords-sonda.mjs` (8 scenariuszy). Wynik na HEAD `5e224a2`:
  `pmssb64-PRZED.txt` (w backupie). Lifelink, haste, deathtouch Δ = 0; latanie Δ = 2.7 (płaski +3)
  niezależnie od blokerów.
- Sonda używa rejestru z syntetyczną kartą (`bodyRegistry`), bo bot czyta słowa z DEFINICJI karty,
  a widok ręki nie niesie pola `keywords`. Pierwsza wersja sondy mutowała `state.objects` i nie
  dotykała ręki (wynik zerowy) — odrzucona.

## Krok 2 — AUDYT
- L41: ścieżki liczące ciało: rzut główny (`cast_permanent`), warp (~9690), adventure (~9507),
  szacunki planowania (~3074, ~3119). Jedna funkcja `creatureKeywordValue` dla wszystkich.
- Podwójne liczenie: płaski +3 za latanie w ścieżce rzutu (~10131) dublował nową wartość → usunięty.
- Inwersja (wykryta przez test „bramka”): latający 1/2 bez blokera (71.7) wychodził NIŻEJ niż ten
  sam stwór z latającym blokerem (71.1). Poprawka: ewazja = `max(dolna granica 3, 8·moc/3)`.
- Skala mocą (wykryta przez test „większy korpus”): Krotiq 6/5 (72.01) przegrywał z Impem 2/1
  latającym (72.00). Ewazja to zadane obrażenia = moc × tury → skala `moc / creatureKwRefPower(3)`.
- Anty-over-fix (M429 c): najsłabszy realny wariant (latający moc ≤1) zostaje na dawnej wartości.
- Morph: rzut zakryty pomija słowa (CR 708.2a). Potwierdzone sondą (KW7).
- Błąd z PMSSB-63 znaleziony przy okazji: `MASS_EVASION_KEYWORDS` miało `'first strike'` (spacja)
  zamiast `'first_strike'` (silnik). Naprawione.

## Krok 3 — IMPLEMENTACJA
- `src/controllers/heuristic-params.js`: 14 kluczy `creatureKw*` (lista + defaults z uzasadnieniem).
- `src/controllers/heuristic-bot.js`: `creatureKeywordValue` (przy `gainLifeValue`), 4 wywołania.

## Krok 4 — TESTY
- `test/audyt-pmssb64-keywords.test.js`: 20 testów — 8 scenariuszy (KW1–KW8), pokrycie 9 słów
  płaskich (Δ = pokrętło × 0.9), pokrętła sterują (zero → Δ 0), anty-over-fix (brak inwersji).
- Przepięte piny istniejących testów: 23 asercje w 13 plikach, każda z przyczyną (Δ słowa).
  Relacje (np. „większy korpus”) zachowane przez poprawną skalę, a nie przez zmianę asercji.
  Jedna asercja relacyjna (CR1, bliźniak bez słów) przepisana na jawną przyczynę: Δ = deathtouch.

## Krok 5 — EWALUACJA
- Golden master: 11 z 1221 decyzji zmienia wynik opcji, 0 zmienia wybór. Fixture regenerowany
  świadomie (`overallHash` 3065f914… → 90aa7806…).
- Lustro: `tools/pmssb64-mirror.mjs` — finalny model vs baseline bez wag słów: 271:209 (seedBase
  3000) i 272:208 (seedBase 5000). Łącznie 543:417 (56.6 %, n = 960). Replikacja na dwóch zbiorach.

## Krok 6 — DOKUMENTACJA
- Raport: `docs/audits/PMSSB64_BATCH68_2026-10-17.md`; wpis w `docs/PMSSB.md` (rejestr: DONE).

## Krok 7 — BRAMKI (kod w `e4ce466`)
- `npm test` 8420/8420 exit 0 (przed poprawką komentarzy params); `npm run build` exit 0; `cr-numery` OK; `npm run test:all` 8687/8687 exit 0 (po commicie).
