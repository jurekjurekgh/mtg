# Plan: ostateczne wyzwanie Testera Gracza (M84)

Sesja `arena/019ff818-mtg`. Zlecenie właściciela: użyć Żywego Testera
(`tools/table-tester/run-game.mjs`), wcielić się w rolę gracza, rozegrać partie
różnymi taliami i znaleźć **15 unikalnych błędów** albo stwierdzić, że więcej
nie da się znaleźć.

## Metoda
1. `npm run build` + partie różnymi taliami (ostrza, mechanicy, sojusznicy,
   wiedzmin, green, red, azorius, black, spellslinger, tokens, innistrad,
   graveyard) z różnymi seedami.
2. Obserwacja logu, modalów, etykiet, walki, stosu, kontroli, inicjatywy.

## Znalezione błędy (15+)

Nowe w tej partii (M84):
1. **`equipped_creature_attacks`** — kafel pokazywał surowy „Trigger atak
   wyposażonego stwora:". Dodany czytelny opis „Gdy wyposażony stwór atakuje".
2. **Epic Experiment** — „kończy Epic Experiment (1 kart do grobu)" / „wygnano
   1 kart" — zła odmiana (powinno „1 karta"/„1 kartę"). `polishPlural`.
3. **Proliferate** — `counter_added` bez `total` → „(razem undefined)".
   Dodany `total` w efekcie proliferate.
4. **Station over-use bota** — bot pompował liczniki charge bez końca (41×
   Wedgelight Rammer) bo nie widział progu. Dodana kara w bocie, gdy charge
   osiągnął threshold (PlayerView niesie `station`).
5. **Index/look_top** — „patrzy na 2 kart z wierzchu" — zła odmiana
   („2 karty"). `polishPlural`.
6. **Fertile Thicket/reveal** — „odsłania 1 kart z wierzchu" — odmiana.
7. **`damage_prevented`** — „Obrażenia (N) ... zostają zniwelowane" bez powodu
   (mylące). Dodany powód: ochrona przed kolorem / Inspire Awe / tarcza
   prewencji. Flaga `inspireAwe` na eventach z combat.js.
8. **Tester** nie klikał akcji „... brak karty w ręce (pomijam)" → STOP.
   Dodane „pomijam|brak karty" do polityki. Tester atakuje wszystkimi
   stworami (żeby „can't attack alone" miał partnera).

Z M83 (10, wcześniej w tej sesji):
9. Log walki „A i B i C blokuje" → „A, B i C blokują".
10. „Faza: Faza główna" → „Faza: Główna 1".
11. „Brak bloków" w modalu pomijany.
12. Morph koszt w PlayerView (pusty „(morph )").
13. Cel-gracz na stosie „→ cel: ?".
14. Surowe opisy 13 triggerów.
15. Etykieta czaru X bez wartości („X=N").
16. Re-equip loop bota (kara).

## Weryfikacja
- `npm test` **1458/0**; `npm run build` 50 modułów / ~1575.9 kB.
- Bot zmieniony (Station + re-equip) → benchmark bez niedokończonych, progi OK.
- Testy regresyjne: `test/audit-m84-tester.test.js` (6) + M83 (10).
