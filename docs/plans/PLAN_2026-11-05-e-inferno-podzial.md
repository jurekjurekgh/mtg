# PLAN 2026-11-05 — zgłoszenie E: Inferno Titan, podział obrażeń w modalu

## Zgłoszenie właściciela

> Rzucam Inferno Titana. ETB — dostaję modal z wyborem celów dla
> 3 obrażeń, ale mogę zaznaczyć tylko 0 albo 3 cele (nie 1 ani 2).
> Gdy wybiorę 3 cele, silnik sam dzieli 3 przez 3 (po 1 każdemu), co jest
> niezgodne z treścią karty. Poprawnie: wybór 0–3 celów i dla każdego
> przypisanie 0–3 obrażeń tak, żeby suma wynosiła 3 (w tym 0 celów =
> nikt nie dostaje obrażeń).

## Rozpoznanie (pomiar 2026-11-05)

- Silnik jest poprawny: `damage_divided` przyjmuje zadeklarowany podział,
  `resolve_trigger_target` przyjmuje 0..N celów, `resolve_damage_division`
  dowolną kompozycję sumującą do budżetu (testy m171, batch40, checkpoint).
- Kreator podziału (`renderDamageDivisionWizard`) też jest poprawny —
  steppery pozwalają 1–3 cele i dowolne kwoty o sumie = budżet
  (testy m172 E2/E3), ale w prawdziwej aplikacji **nigdy się nie otwiera**
  dla decyzji triggera.
- Przyczyna: w `openChoiceRequest` (src/table/main.js) gałąź
  `upToTargetsPlanOf` (kreator ptaszkowy „do N celów”) stoi PRZED gałęzią
  `request.type === 'damage_division'` i przechwytuje komendy
  `resolve_trigger_target`. Kreator ptaszkowy dopasowuje zaznaczenie do
  wyenumerowanych wariantów silnika, a enumeracja (limit 32) przy
  większej liczbie kandydatów ucina warianty 1- i 2-celowe — zostają
  trójki i wariant pusty („tylko 0 albo 3 cele”). Po wybraniu trójki
  decyzja kwot to enumeracja kompozycji, a dla 3 celów jedyna legalna
  kompozycja dodatnia to 1/1/1 („silnik sam dzieli”).
- Specyfikacja właściciela (a) rozszerza kreator: wolno też potwierdzić
  ZERO celów (obrażenia przepadają) — silnik to legalizuje (`upTo`),
  kreator dotąd wymagał ≥1 celu z kwotą > 0.

## Naprawa

1. `src/table/main.js`: gałąź `damage_division` w `openChoiceRequest`
   PRZED `upToTargetsPlanOf` (kolejność gałęzi = jeden kreator podziału
   dla decyzji z `divisionTotal`, jak zaprojektowano w M172/E).
2. `src/table/choice-request.js`: `renderDamageDivisionWizard` dostaje
   opcję `allowZeroTargets` (tylko ścieżka triggera): potwierdzenie
   legalne także przy zerze wybranych celów; tekst wprowadzenia o tym
   mówi. Ścieżka rzutu czaru (Fireball/Fiery Justice) bez zmian —
   tam 0 celów nie jest legalnym rzutem.
3. Bez zmian silnika, definicji karty i bota.

## Dowód

- `test/zgloszenie-e-inferno-podzial.test.js`:
  - E/1: kolejność gałęzi w `openChoiceRequest` (podział przed „do N celów”);
  - E/2: kreator z `allowZeroTargets` — potwierdzenie przy 0 celów daje
    pusty wybór; kwoty 2+1 i 3 w jeden cel działają jak dotąd;
  - E/3: kreator bez `allowZeroTargets` nadal blokuje 0 celów (rzut czaru);
  - E/4: silnik end-to-end (prawdziwy Inferno Titan): 0 celów = brak
    obrażeń; 1 cel = 3 obrażenia; 2 cele = podział 2+1.
- Mutacja (przywrócenie kolejności gałęzi) łapie E/1.
- Bramki: pakiet pokrewny (m171/m172/batch40/UI modalne), `npm test`,
  `npm run build`, na końcu `npm run test:all`, opis PR #179, CI.
  Bez scalania.
