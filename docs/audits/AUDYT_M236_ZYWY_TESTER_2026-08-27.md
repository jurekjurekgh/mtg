# Audyt Żywym Testerem — nieoptymalne rzucanie czarów/zdolności bota, M236

- **Data:** 2026-08-27
- **Zlecenie właściciela:** kontynuować audyt Żywym Testerem szukając
  nieoptymalnego wykorzystania czarów/zdolności przez bota, aż do wyczerpania
  budżetu — nie przerywać po pierwszym znalezisku.
- **Metoda:** ~25 partii bot-vs-gracz (wszystkie talie, profile defensive/
  explorer/random/impatient, wiele seedów) + 3 skany STRUKTURALNE bot-vs-bot
  (instrumentacja realnych decyzji po deskryptorach). Detektory: **0 zgłoszeń**
  we wszystkich partiach — każde znalezisko z ręcznej lektury / skanu (L27/L40).
  Transkrypty: `tools/table-tester/audyt-m236/`.

## 6 napraw (Oś 1 — każda RED→GREEN, generyczna po deskryptorze, ADR 0002)

### M236/1 — fog przed deklaracją ataku (Inspire Awe)
final-fantasy vs theros, seed 61: bot rzucił Inspire Awe (prevent combat damage
+ scry 2) w upkeepie gracza, który nie miał stworów — prewencja nic nie robiła.
Fog to instant: wartość dopiero po deklaracji atakujących. Kara przed
deklaracją (−75) → bot czeka na okno (attackingEnemyPower>0).

### M236/2 — poświęcenie permanentu za życie przy bezpiecznym życiu (Instant Ramen)
forgotten-realms vs final-fantasy, seed 73: bot aktywował Instant Ramen
({2},{T},poświęć: 3 życia) przy 22 życia i przewadze. Wartość życia zależy teraz
od sytuacji (krytyczne=pełna, wysoko=0); sacrificeSelf bez korzyści < pass.

### M236/3 — jałowy tap-za-życie (Soulmender)
ravnica vs srodziemie, seed 76: bot tapował Soulmender ({T}: 1 życia) 6× przy
20+ życia, marnując stwora do walki. Pure gain_life bez wartości < pass; ostrzej
gdy tapuje zdolnego do walki stwora.

### M236/4 — skalujący Fireball spalony za trywialny chip w twarz
innistrad-brg vs warhammer-ubr, seed 91: bot rzucił Fireball za X=1 w twarz
(19→18) w 2. turze. Dobicie = zawsze; trywialny chip (≤2, daleko od dobicia)
< pass (trzymaj zasób); realne cięcie życia i letalne trafienie premiowane.

### M236/5 — nieletalne spalenie w stwora poza walką (Shock w 2/3)
skan strukturalny (worek-dziki): Shock (2) w Cogwork Assembler (2/3) — cel nie
ginie, obrażenia znikają w sprzątaniu. Nieletalne obrażenia poza oknem walki <
pass (gdy damage to jedyna treść czaru, znosimy też spellBase). Letalne i chip
w walce bez zmian.

### M236/6 — zakopywanie karty z grobu na spód biblioteki (Barkform Harvester)
skan strukturalny (worek-basni): bot aktywował Barkform ({2}: karta z grobu na
SPÓD biblioteki) 3×/turę — jałowy churn many. put_graveyard_card_on_bottom =
near-zero wartość (zdolność niszowa) → kara poniżej passu.

## Zagrania sprawdzone i UZNANE za poprawne (bez zmian)
- Ghoulcaller's Bell (symetryczny mill) — bot dzwoni tylko prowadząc w wyścigu
  bibliotek (M162/B działa).
- Station (Wedgelight Rammer) — ładowanie charge w main2 po ataku (M153/A2).
- Might of the Masses / Coat with Venom — combat tricki rzucane w oknie walki.
- Pump/stat-aury (Feral Invocation, Serra's Embrace, Vow of Wildness) — wartość
  trwała, rozwój planszy w main jest OK.
- Withstand (prewencja + dober) — cantrip, rzut dla karty jest uzasadniony.
- Fireball/Shock w cel LETALNY — poprawne removal (także 1/1 recursive).

## KOREKTA po uwagach właściciela (M236/8)

Trzy naprawy wymagały korekty modelu:

- **ad 2&3 — życie to BUFOR.** Życie powyżej 20 nie marnuje się (21, 22…).
  Zysk życia jest zawsze małą wartością dodatnią. „{T}: zyskaj życie" (tap bez
  poświęcenia) jest DARMOWE → bot buduje bufor bez końca, chyba że stwór jest
  potrzebny do bloku. **M236/3 (Soulmender) było BŁĘDNYM znaleziskiem** —
  cofnięte; tap-za-życie jest OK.
- **ad 2 — poświęcenie permanentu** za życie tylko gdy: życie krytyczne,
  permanent i tak ginie w tej turze (bloker ginący bez zabicia atakującego /
  cel destroy/exile/lethal na stosie — helper `permanentDoomedThisTurn` czyta
  combat+stos z widoku, nie spekulację „removal w ręce"), albo TMC ≤ 1.
- **ad 4 — Fireball** przerobiony na model M236/5: pełna wycena per-cel
  (dobicie stwora = removal, dobicie gracza = 1000, istotny cios ≥1/3 życia =
  premia, chip = trzymaj). Bot woli zabić stwora niż chipować twarz.

Commit M236/8.

## Weryfikacja braku regresji
Po KAŻDEJ naprawie: `npm test` zielony (finalnie **3542/3542**),
`bot-benchmark` **9/9** (progi 0.78/0.62), golden-master bez zmian, build 55
modułów. 6 commitów M236/1–6, każdy wypchnięty przyrostowo (ADR 0020 D).

## Wniosek
Metodologia „typuj częste ∧ nieoptymalne, potem strój" utrzymana: przecięcie
skanu strukturalnego (częstość) z ręczną lekturą (jakość) dało 6 realnych klas
marnotrawstwa many/czarów/potencjału, wszystkie niewidoczne dla detektorów.
Rodzina „timing/wartość spalenia i lifegainu" była najsłabiej skalibrowana.
