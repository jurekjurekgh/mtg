# Plan PMSSB-37 — trzy granice po PMSSB-36 (2026-10-02)

Zadanie właściciela: „Zajmij się teraz tymi trzema wykrytymi sytuacjami”.

## Kroki

1. **A — bite bez zabicia.** `fightExchangeValue` (gałąź jednostronna) daje dodatnią „chip” (`fightBiteChipBase`, PMSSB-16) także wtedy, gdy cios nie zabija. Chocobo Kick na cel o wytrzymałości 9 ma 64 > pass. `damageTargetValue` ma dla nieletalnego draśnięcia poza oknem walki −80. Zmiana: nowe pokrętło `fightBiteMissPenalty` 80, odejmowane przy braku zabicia i `!combatTrickWindow` (to samo okno co `damageTargetValue`). Rider z licznikiem (Knockout Maneuver) zostaje wyceniony osobno i nadal wygrywa z pasem.
2. **B — payoffy inne niż licznik.** `boardCastPayoffValue` rozszerzone o nogi z tabeli `ETB_EFFECT_BONUS` (dobranie, token, drain, scry, zysk życia), warunki many (`manaSpentAtLeast/Below`), poświęcenie nosiciela jako koszt (Tellah ≥ 8 many) oraz zdarzenia `you_cast_noncreature_spell` (czar i nie-stworzenie jako permanent, zgodnie z silnikiem). Pomijane: efekty tymczasowe, trigger z celem/własnym `condition`, „drugi czar w turze” (brak licznika w widoku bota).
3. **C — Pangolin / zapłata opcjonalna.** `resolve_optional_pay_choice` płaci zawsze. Nowa reguła `payBlocksBetterCast`: rezygnuj z zapłaty {N}, gdy karta z ręki o koszcie mieszczącym się w otwartej manie, ale nie w mnie pomniejszonej o {N}, ma wynik ≥ `optionalPayBlockedCastMin` (40) i zysk triggera < `optionalPayCastScoreWeight` (0,5) × ten wynik. Ta sama bramka w antycypacji `boardCastPayoffValue`; reentrancy guard (`payoffProbeDepth`), bo wycena zablokowanego rzutu woła `scoreCommand`.

## Granice (świadomie poza zakresem)

Kolory nie są sprawdzane przy kandydacie zablokowanym; pojedyncza karta, bez kombinacji; payoffy „drugi czar w turze”; incubate Tillera.

## Weryfikacja

Sonda PRZED/PO, testy `test/audyt-pmssb37-*.test.js` czerwone na starym kodzie, golden-master (`--dump`, pary/flipy), `run-tests all`, build.
