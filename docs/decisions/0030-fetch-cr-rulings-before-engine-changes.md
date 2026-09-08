# ADR 0030: Zmiany regułowe wymagają pobrania CR i rulingów ze źródeł online (nie z pamięci)

- **Status:** Zaakceptowana
- **Data:** 2026-09-08
- **Decydenci:** właściciel projektu (po audycie PR #105: dwa szkodliwe „fixy" agenta — F3 i B4)

## Kontekst

W PR #105 agent dwukrotnie „naprawił" poprawny kod, opierając twierdzenia
regułowe wyłącznie na pamięci treningowej:

- **E9/F3 (`a7ae267`, cofnięty `613a379`)**: agent twierdził, że explore nie
  daje wyboru („CR 701.54b"). Dosłowny tekst CR 701.44a i reminder text dają
  wybór („…may put the revealed card into their graveyard"; „put the card
  back on top or into your graveyard"). Oryginalna maszyna była poprawna;
  fix usuwał legalne zachowanie.
- **E8/B4 (`2e15ba6`)**: agent przeczytał ODWROTNIE klauzulę CR 702.19b
  („…but not any abilities or effects that might change the amount of damage
  that's actually dealt") — jako „prewencja obniża lethal", podczas gdy
  klauzula WYŁĄCZA prewencję z wyliczenia lethal przydziału. Fix uczynił
  legalnym przydział 0 obrażeń w blokera z protection (naruszenie CR) i
  zmienił domyślny przydział botów na nielegalny.

W obu przypadkach bramki (testy pisane przez tego samego agenta, suite,
build, benchmark) były zielone — automat nie łapie błędnej interpretacji
reguły, jeśli test zakłada tę samą błędną interpretację. Jedyna skuteczna
bariera to WERYFIKACJA U ŹRÓDŁA przed napisaniem claimu i testu.

## Decyzja

1. **Obowiązek źródłowy:** zanim agent zmieni istniejący kod o znaczeniu
   regułowym (silnik, combat, triggery, efekty, strefy) ALBO dopisze nową
   mechanikę, której wcześniej nie było, MUSI pobrać z sieci dosłowny tekst
   stosownych reguł CR (np. yawgatog.com/resources/magic-rules,
   mtg.wiki, blogs.magicjudges.org) oraz — gdzie istnieją — rulingi
   Gatherera (scryfall/mtg.wtf) i przytoczyć je dosłownie.
2. **Pamięć treningowa NIE jest źródłem.** Numeracja reguł i ich treść
   z pamięci mogą być przestarzałe lub zniekształcone (dowód: F3 cytował
   nieistniejącą treść pod złą datą numeracji; B4 odwrócił sens klauzuli).
3. **Ślad w artefaktach:** cytat dosłowny (z numerem reguły i źródłem)
   trafia do opisu commitu i/lub komentarza testu-guardii; w razie
   rozbieżności pamięci ze źródłem rozstrzyga źródło.
4. **Test-guardia pinuje regułę**, nie implementację: komentarz testu cytuje
   klauzulę, której pilnuje, żeby przyszły „poprawiacz" widział podstawę.
5. Jeżeli źródła są niedostępne (brak sieci), agent NIE zgłasza znaleziska
   ani nie wykonuje zmiany regułowej — odkłada ją z adnotacją „do weryfikacji
   u źródła".

## Konsekwencje

- Każdy fix regułowy startuje wolniej (krok pobrania źródeł), ale PR nie
  zawiera twierdzeń „z pamięci"; dyskusja z właścicielem toczy się o cytaty,
  nie o wspomnienia.
- Zmiany czysto inżynierskie (refaktory, wydajność, UI, telemetria) bez
  twierdzeń regułowych nie wymagają cytowania CR.
- Fałszywe „znaleziska" klasy F3/B4 powinny być wychwytywane PRZED commitem:
  dosłowny tekst reguły niemal zawsze rozstrzyga wątpliwość w kilka minut.
- Straże regułowe (testy z cytatami) tworzą rosnącą, weryfikowalną bazę
  interpretacji przyjętych w silniku.
