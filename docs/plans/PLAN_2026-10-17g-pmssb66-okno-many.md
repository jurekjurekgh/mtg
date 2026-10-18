# PLAN 2026-10-17g — PMSSB-66: okno many (end step przeciwnika)

> Uwaga o kolejności: procedura PMSSB każe zapisać plan PRZED pomiarem (krok 0). Ten plan
> spisano PO pomiarze PRZED i po wdrożeniu pierwszej wersji (`07a2228`), bo zasada właściciela
> przyszła w trakcie pracy. Kolejność wykonanych kroków jest opisana w raporcie.

## Cel (zasada właściciela, 2026-10-17)

Zdolność płacona MANĄ o trwałym skutku (token, licznik) powinna być zapłacona w oknie, w którym ta
mana i tak się zmarnuje: w end step PRZECIWNIKA nasze lądy odtapowują się w naszym kroku odnowienia.
Reguła ma być generyczna (nie tylko Halo Scarab): `create_token`, `add_counter` (+1/+1, −1/−1,
stun, oil). Przykład właściciela: stwór, który dokłada sobie oil, by wydać go na tapnięcie cudzego
stwora — to samo okno.

## Zakres

- Rodzina: zdolności aktywowane z kosztem `mana` (bez `tap`), bez `timing: 'sorcery'`, których
  wszystkie efekty to `create_token` lub `add_counter`.
- Poza zakresem: producenci many z tapnięciem (Rustvine Cultivator — `{T}: oil`, pin D1–D3 z
  `m173`), zdolności `add_mana`, sorcery-speed.

## Procedura 0–7

0. Plan: ten dokument (spisany po wdrożeniu pierwszej wersji — patrz uwaga wyżej).
1. Pomiar PRZED: `tools/pmssb66-okno-many-sonda.mjs` przed zmianą w `heuristic-bot.js`:
   W1 Halo end-opp −11 pass; W2 Halo nasza główna −11 pass; W3 Halo + Shock 3 lądy −10 pass;
   W4 Halo + Shock 4 lądy −10 pass; W5 +1/+1 end-opp +25 activate; W6 +1/+1 nasza główna +25
   activate (BŁĄD: powinno być pass); W7 oil end-opp −8 pass (BŁĄD: powinno aktywować); W8 oil
   nasza główna −8 pass. Inwentarz okien: Halo Scarab (`{2}, exile z grobu: Treasure`, instant
   speed), producenci +1/+1 i oil w syntetycznym rejestrze, Rustvine (tap, poza zakresem).
2. Audyt (macierz kierunek × cel × timing × stan):
   - L41: `cast_spell` / `activate_ability` liczą to samo — zmiana w gałęzi `activate_ability`,
     wycena licznika (`counterEffectValue`) wspólna dla czaru i zdolności.
   - (b) wymiar kosztu: koszt many zdolności odpada w oknie, a poza nim jest odroczony o
     `abilityManaCostPenalty · koszt` (ta sama skala co reszta kosztów).
   - (c) anty-over-fix: najsłabszy realny wariant (ta sama mana w innej turze) musi nadal przegrywać;
     walka przeciwnika (`declare_blockers`) NIE odracza (licznik może zmienić blok).
   - Ustalenia: F1 licznik-producent wyceniany płasko (+6/−8) — zastąpione wartością konsumenta;
     F2 odroczenie brakowało; F3 rezerwa pod instant liczona najtańszym instantem (poprawka w
     `dd89af1`: najdroższy, który mieści się w dostępnej manie).
3. Implementacja: `LASTING_MANA_EFFECTS`, `COMBAT_STEPS`, `isLastingManaAbility`,
   `reservedInstantMana`, `freeManaWindowNow` (`heuristic-bot.js`); pokrętło
   `lastingManaWindowOn` (1 = reguła, 0 = dawne zachowanie; `heuristic-params.js`).
4. Testy: `test/audyt-pmssb66-okno.test.js` (15): W1–W12 + asercje liczbowe + pokrętło ×0.
5. Ewaluacja: golden master, lustro (okno vs off), sonda PO — patrz raport.
6. Dokumentacja: `docs/audits/PMSSB66_BATCH68_2026-10-17.md`, rejestr i sekcja w `docs/PMSSB.md`,
   wpis w `docs/PROJECT_HISTORY.md`.
7. Bramki: `npm test`, `npm run build`, `npm run test:all`, `cr-numery`; push po każdym kroku.

## Kryteria akceptacji

- W1 (Halo, end-opp, 2 lądy, bez instantu): aktywacja (wynik dodatni).
- W2 (to samo w naszej głównej): pass; wynik ≤ −koszt.
- W3 (2 lądy, Shock w ręce): pass — Halo nie darmowe, Shock zostaje.
- W4 (4 lądy, Shock w ręce): aktywacja — nadwyżka 3 ≥ 2.
- W5/W6/W7/W8 analogicznie dla countera i oil.
- W9: producent +1/+1 w walce przeciwnika — bez odroczenia.
- W10: zdolność sorcery w end step przeciwnika — nie oferowana.
- W11: 4 lądy + Shock + Expunge (3) w ręce → Halo −10 (nie darmowe).
- W12: 2 lądy + sam Expunge (3) → Halo darmowe (instant nie do zapłacenia nie blokuje).
- Pokrętło ×0 przywraca dawne wyniki.
- Golden master: brak zmian poza zakresem (sprawdzone: 0 z 1221).

## Ryzyka (z pomiaru)

- Lustro na taliach z mechaniką: wynik neutralny. Luka planera płatności (crash seed 3035) — ZAMKNIĘTA
  (sekcja „Dopisek 2” niżej).

## Dopisek 1 (2026-10-17): crash `Brak kolorowej many` — usunięty

Zlecenie właściciela: usunąć w 100%. Procedura: pomiar (odtworzenie seeda 3035, ślad `spendMana`) → przyczyna
(dwie: purpose nie płynął do planu kolorów; `firstUncoveredPipColor` liczył per kolor) → poprawka
(`resources.js`, `spells.js`, `game-state.js`) → test (`test/audyt-pmssb66-brak-kolorowej-many.test.js`, 2;
oba padały przed poprawką) → bramki → commit `d4241da`.
Odrzucony wariant: bramka kosztu i koloru w ofercie plota (plot = rzut bez kosztu i bez kolorów).

## Dopisek 2 (2026-10-17): Ad 2 — skutki licznikowe śmiertelne ASAP

Zasada właściciela: licznik ze skutkiem śmiertelnym TERAZ nie jest odraczany (zabójcze −1/−1 wroga; +1/+1
ratujące nasz stwór przed śmiertelnym uszkodzeniem). Generycznie po deltach licznika.

0. Plan: ten dopisek — spisany PO pomiarze PRZED (punkt 1 zmierzony przed zmianą kodu). Kolejność kroku 0 złamana, przyznane.
1. Pomiar PRZED: `tools/pmssb66-smiertelne-countery-sonda.mjs` (K1–K7), na kodzie sprzed zmiany:
   K1 −1,00 (pass), K3 −19,00 (pass), K6 +27,00, reszta kontrol bez zmian.
2. Audyt: przyczyna dwuczęściowa — (a) odroczenie nie znało skutku śmiertelnego; (b) `counterHostValue`
   zerował licznik na stworze „skazanym" przez śmiertelny Shock na stosie (`permanentDoomedThisTurn`), nawet gdy
   ten licznik go ratuje.
3. Implementacja (`heuristic-bot.js`): `counterSavesHost` (walka przez `combatOutcome` z deltą + stos),
   `lethalCounterNow` (zabójcze −1/−1 wroga, ratunek), wspólna `REMOVE_ON_STACK_EFFECTS`; wycena
   `counterHostValue` nie zeruje licznika ratującego; `lethalNow` znosi odroczenie.
4. Testy: `test/audyt-pmssb66-smiertelne-countery.test.js` (7 scenariuszy + dodatni wynik K1).
5. Ewaluacja: golden master (`npm test`), lustro 3000/5000/9000, `test:all`, build, `cr-numery`.
6. Dokumentacja: raport (sekcja „Ad 2"), `docs/PMSSB.md`, `docs/PROJECT_HISTORY.md`.
7. Bramki przed commitem; commit i push po fragmencie.
