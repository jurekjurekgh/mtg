# PLAN 2026-10-03l — PMSSB-49: `warp_card` widzi DRUGI ETB z recastu (rzut z wygnania za koszt many)

Zlecenie: pozycja 2 kolejki z `docs/setup/HANDOFF_2026-10-03g.md` („`warp_card`
vs rzut w następnej turze — opóźdzony zysk vs stracona tura"), czyli domknięcie
granicy (2) z sekcji PMSSB-41 (`docs/PMSSB.md`, akapit „Granice").

## Problem (zmierzony, nie przeczuty)

`warp_card` porównywał się wyłącznie z **ofertą rzutu TERAZ** (`castOfferedNow`,
L48). Gdy rzut nie był oferowany, bot nie odróżniał „rzutu nie ma i nie będzie"
od „rzut jest za turę" — oba stany dawały **ten sam** wynik:

```
S1: 3 lądy / rzut za 6 NIEmożliwy (jedyna droga do ETB)   → warp 85,000
S3: 6 lądów, 4 nietapnięte / rzut ZA TURĘ (untap+drop)    → warp 85,000   ← identycznie
S5: 5 lądów nietapniętych / brak land dropu               → warp 85,000   ← identycznie
```

Tymczasem karta po warp-caście nie przepada: w kroku końcowym idzie do wygnania
i **wraca z niego ZA KOSZT MANY** (CR 702.185a — „then you may cast it from
exile on a later turn"), a tam ETB odpala **drugi raz**. Sonda
`tools/probe-pmssb49-double-etb.mjs` (usunięta po naprawie — liczby niżej):

```
1) rzut z exile oferowany (6 nietapniętych lądów jako `cast_permanent`): true
2) po zatapnięciu 3 lądów (3 many) recast NIEjest oferowany ← koszt = koszt many (6), nie warp (3)
3) po recaście liczniki gospodarza: {"+1/+1":1}, weftblade na polu: true
4) pending: [{"src":"permanent-1","cands":null}], oferta celu: ["host","permanent-1"]
```

Czyli warp = ETB **teraz** + ETB **przy recaście** (za pełną manę), a zwykły
rzut za turę = jeden ETB i karta zostaje na polu. Dotychczasowy model widział
pierwszą połowę i porównywał ją z ofertą dnia dzisiejszego.

## Zakres (generycznie, bez nazw kart — ADR 0002)

1. `src/controllers/heuristic-params.js` — pokrętło `warpRecastEtbWeight: 0.5`
   (dyskont czasu: trigger przyjdzie turę później i po zapłaceniu many).
   `×0` = zachowanie sprzed PMSSB-49 (M429 anty-over-fix).
2. `src/controllers/heuristic-bot.js` — helper
   `warpRecastReachableNextTurn(view, card)`:
   - `false`, gdy rzut normalny jest oferowany TERAZ (to gałąź redundancji
     `warpRedundantPenalty`, nie porównanie z przyszłą turą),
   - inaczej: suma `manaSource` własnych lądów (untap w następnej turze)
     **+ 1 za ląd z ręki** (land drop) ≥ `card.manaCost` **oraz** każdy kolor
     kosztu pokryty co najmniej jednym źródłem (CR 601.2f/g),
   - źródła nielandowe świadomie poza proxy (wymagają aktywacji — jak
     w `manaAvailableNow`), bot nie zgaduje przyszłych dobranych kart.
3. Gałąź `warp_card` dolicza `warpRecastEtbWeight × secondEtbPayoff`, gdzie
   `secondEtbPayoff = etbNeedsHost ? etbPayoff : (etbTriggers.length > 0 ? 5 : 0)`
   — czyli dokładnie ta sama wypłata, którą bot już liczy dla wejścia teraz.
4. Nowy plik pinów `test/pmssb49-warp-vs-nastepna-tura.test.js` (W1–W9).

## Pomiary PRZED → PO (te same scenariusze, ta sama sonda)

| Scenariusz | PRZED | PO | Zmiana |
|---|---|---|---|
| S1: 3 lądy (rzut nieosiągalny) | 85,000 | **85,000** | bez zmian (kotwica) |
| S1b: 5 lądów, brak lądu w ręce | 85,000 | **85,000** | bez zmian |
| S1c: 5 lądów + ląd w ręce | 85,000 | **97,000** | +12 (druga wypłata) |
| S2: 6 lądów nietapniętych (rzut teraz) | cast 71,103 / warp 25,000 | bez zmian | gałąź redundancji |
| S3: 6 lądów, 4 nietapnięte (rzut za turę) | 85,000 | **97,000** | +12 = S1c |
| S4: 4 lądy, brak celu ETB | −29,000 (pass) | **−29,000** | bez zmian (jałowy warp) |
| S5: 5 lądów nietapniętych, bez land dropu | 85,000 | **85,000** | bez zmian (proxy wymaga 6 many) |

S1 i S3 przestają być nierozróżnialne, a różnica wynosi dokładnie
`0,5 × 24 (counterHostValue 3/3)` = **12**. S5 zostaje na 85 **celowo**: 5 lądów
bez lądu w ręce nie pokrywa {5}{W} za turę (potrzeba 6 źródeł, w tym drop) —
to nie bug, to ta sama bramka kosztu, tylko scenariusz bez land dropu.

## Kryteria ukończenia

- [x] `npm test` zielone (fast) i `npm run build` zielone.
- [x] Każdy pin czerwienieje po cofnięciu naprawy (m1–m4 udokumentowane).
- [x] Anty-over-fix: S1/S1b/S5 bez zmian, jałowy warp (−29) i redundancja
      (cast 71,103) bez zmian — `warpRecastEtbWeight ×0` odtwarza stan sprzed.
- [x] Zero nazw kart w kodzie silnika/bota (ADR 0002); karty w testach
      z katalogu właściciela (ADR 0029 — nic nie dodano).
- [x] Piny PMSSB-41 (A1–A8) i PMSSB-35 §3 (warp: −15/+5, wymiar kosztu) zielone.
- [x] Sondy usunięte z drzewa po naprawie (L173/F6); liczby w tym planie.
- [x] Wpis w `docs/PROJECT_HISTORY.md`, sekcja `## PMSSB-49` w `docs/PMSSB.md`
      (granica (2) oznaczona jako częściowo domknięta) + handoff.

## Wykonanie (2026-10-03l)

- Commit `cfd4de2` — naprawa + piny; `npm test` **7522/7522** EXIT 0 (116,1 s),
  build **70 modułów / 4806,9 kB**, `bot-scoring-snapshot` 4/4 bez dryfu,
  `event-contract-audit` 0 naruszeń, regresja skoncentrowana PMSSB-41 +
  PMSSB-35 **50/50**.
- Mutacje (oczekiwane RED → po przywróceniu zielone):
  m1 (brak dopłaty drugiego ETB) → W2, W4, W6, W9; m2 (bramka bez land dropu) →
  W2, W6; m3 (bramka bez kolorów) → W5; m4 (dopłata bezwarunkowa) → W1, W3,
  W4, W5.
- Dokumentacja: ten plan, `## PMSSB-49` w `docs/PMSSB.md`, `docs/PROJECT_HISTORY.md`
  `2026-10-03l`, handoff `docs/setup/HANDOFF_2026-10-03h.md`.
