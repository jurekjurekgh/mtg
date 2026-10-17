# PLAN 2026-10-17f — PMSSB-65: prowess Bloodfire Experta w rzucie stworzenia

Zatwierdzenie właściciela (2026-10-17): „kontynuuj z 64 i 65”. Rodzina: wyzwalacz rzutu czaru
nie-stworzenia na samym ciele (prowess), cast path (L41).

> Uwaga o kolejności: plan powstał PO pomiarze PRZED (krok 1). Pomiar obalił moją wcześniejszą
> notatkę „67.05 z i bez zdolności” — prawidłowo: 67.05 z, 65.70 bez (Δ 1.35, płaska stała).

## Krok 1 — POMIAR PRZED
- Sonda: `tools/pmssb65-prowess-sonda.mjs`. Bloodfire Expert (3/1, {2}{R}): wyzwalacz
  `you_cast_noncreature_spell` → pump +1/+1 do końca tury.
- PR2 (dwa Shocki w ręce) = PR3 (brak czarów) = 67.05 → wycena NIE zależy od stanu ręki.
- Przyczyna: `anticipatedTailValue` dla tego triggera bierze `like` 0.5 × `ETB_EFFECT_BONUS.pump`
  (p·2+t = 3) → płaskie 1.5 × 0.9 = 1.35.

## Krok 2 — AUDYT
- Stół już liczy ten sam efekt dla prowess STOŁU (pętla payoffów rzutu czaru ~8175–8247:
  `temporaryPumpPayoff` × `boardPayoffWeight`). Cast-owe ciało nie. Niespójność L41.
- Nosiciel z rzutu nie może atakować w tej turze (summoning sickness), więc okno walki
  przesuwa się na następną turę. `temporaryPumpPayoff` zwraca 0 bez gotowego nosiciela.
- Podwójne liczenie (sprawdzone w kodzie): `equipValuation` i `auraKeywordValue` nie czytają
  wyzwalaczy i nie wołają `anticipatedTailValue`. Ta funkcja jest wołana wyłącznie dla definicji
  RZUCANEJ karty (cztery miejsca w ścieżce rzutu). Jeden człon, bez dublowania.

## Krok 3 — IMPLEMENTACJA
- `src/controllers/heuristic-bot.js`: `selfTempPumpLegs` (wyzwalacz bez celu/many/warunku, same
  pumpy bez `targetIndex`), `prowessCastValue` (budżet many = lądy pod kontrolą; najtańsze
  czary pierwsze; nosiciel gotowy do ataku; `boardPayoffWeight` jak na stole). Hak w
  `anticipatedTailValue` tylko dla `you_cast_noncreature_spell`. Reszta triggerów bez zmian.

## Krok 4 — TESTY
- `test/audyt-pmssb65-prowess.test.js` (6): PR1 1 czar Δ 1.8, PR2 2 czary Δ 3.6, PR3 brak czarów 0,
  PR4 anty-over-fix, PR5 zero lądów 0, PR6 blokujący wróg 0.9 < 1.8 (ten sam stół dla obu wariantów).
- Pin: `pmssb10-ogon-wave-a` Windscout 70.1 → 68.7 (pusta ręka, płaska 1.35 usunięta).

## Krok 5 — EWALUACJA
- Golden master (6 partii): 0 zmian — porównanie JSON HEAD vs bieżące: identyczne. UWAGA: żadna
  z 6 par nie zawiera Bloodfire ani Windscouta, więc to nie jest dowód na poprawkę (zasięg).
- Lustro: NIE uruchomione dla tej poprawki. Żadna talia benchmarku nie zawiera karty
  (Bloodfire jest w `decks/tarkir-wur.txt`). Brak pomiaru gry — patrz raport, ograniczenia.

## Krok 6 — DOKUMENTACJA
- Raport: `docs/audits/PMSSB65_BATCH68_2026-10-17.md`; rejestr `docs/PMSSB.md` (sekcja PMSSB-65).

## Krok 7 — BRAMKI (kod w `00b620e`)
- `npm test` 8426/8426 exit 0; build 0; `cr-numery` 0; `npm run test:all` 8693/8693 exit 0.
