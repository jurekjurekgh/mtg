# PLAN 2026-10-20j — PMSSB-74: Bloodfire Infusion (damage_each_creature_sacrificed_power)

Status: DONE (2026-10-20). Rejestr: `docs/PMSSB.md` §PMSSB-74.

> Plan spisany po wdrożeniu (ta sama zasada co w PLAN_2026-10-20h): treść odpowiada kolejności pomiar → audyt → RED → GREEN → ewaluacja.

## Pomiar PRZED
`.arena/probe-bloodfire.mjs`: aktywacja `bf` wyceniona 2 we wszystkich 8 scenach (bez wrogów, z jednym i dwoma wrogami, z moimi stworami, przy życiu 5 i 20). Bot wybierał ją nawet bez wrogich stworów.

## Audyt
- L41: zamiatanie (`massDestroyValue`) i obrażenia z mocy poświęconego to ta sama klasa — wspólna miara `sweepHitsValue`.
- Koszt: `sacrificeSelf`/`sacrificeCreature` mają karę w pętli kosztów; `sacrificeEnchantedHost` jej nie miało. Koszt = jednostka własnej straty w zamiataniu (`massDestroyCardValue + worth`) × `massDestroyOwnMultiplier` × odbudowa.
- Anty-over-fix: zmiana tylko dla `damage_each_creature_sacrificed_power`.

## RED → GREEN
`test/audyt-pmssb74-bloodfire.test.js`: bez wrogów (RED), jeden wróg 1/1 (RED), dwóch wrogów (pin), presja (RED), własna strata (pin), pokrętło `massDestroyThreatWeight` (pin).

## Ewaluacja
npm test 8599/8599; test:all 8866/8866; golden bez zmian; A/B 80 partii: 9 rozjechanych decyzji, bez wyraźnej zmiany wyniku.

## Otwarte
Letal wroga nie wchodzi do wyceny (obrażenia tylko stworom). Tie-audit i mirror nie wykonane.
