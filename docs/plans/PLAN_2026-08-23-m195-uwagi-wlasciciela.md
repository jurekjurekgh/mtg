# PLAN M195 — uwagi wlasciciela z testow: A, B, C/C1, D (2026-08-23)

Zgloszenie po zamknieciu pierwszej partii startowej kart (Batch 47 KOMPLET).

## A — brak wizarda many przy platnosci „zaplac albo poswiec"

**Cytat:** „Rupture Spire. ETB — poswiec albo zaplac 1 dowolnej many. Wybralem
zaplate, engine nie pokazal wizarda tylko sam zatapowal pierwszy lepszy lad.
Zawsze kiedy platnosc many jest NIEJEDNOZNACZNA (wiecej niz 1 kombinacja
zrodel) powinien byc wizard."

**Rozpoznanie:** `manaWizardFor` w `src/table/main.js` obsluguje rzuty
(`cast_*`) i `activate_ability`, ale NIE komendy decyzji platniczych
(`resolve_pay_or_sacrifice`, `resolve_optional_pay_choice`,
`resolve_counter_pay_choice`). Te iда prosto do `session.apply`, a silnik
auto-tapuje zrodla wg swojej kolejnosci. Regula wlasciciela jest ogolna:
**kazda** niejednoznaczna platnosc ma miec wizard, nie tylko rzuty.

## B — bot marnuje trick bojowy na siebie w swojej fazie ataku

**Cytat:** „Ghost Warden. Faza walki bota. Bot aktywuje zdolnosc, tapuje go
i robi sie +1/+1. Bez sensu. To trick bojowy do buffowania, ale nie siebie
w swojej fazie ataku, bo to nic nie wnosi. Jesli tapne ta karte to juz nia nie
zaatakuje. Sensowne: buffowanie ATAKUJACEGO po deklaracji atakujacych albo
swojego BLOKUJACEGO w fazie ataku przeciwnika po deklaracji blokujacych."

**Rozpoznanie:** heuristic-bot wycenia pump, ale nie zna KONTEKSTU walki dla
zdolnosci z kosztem {T} na SAMYM SOBIE. Kara ma dotyczyc sytuacji: koszt tapuje
zrodlo, cel = zrodlo, a stwor moglby jeszcze atakowac/blokowac.

## C + C1 — wielocelowosc jako eksplozja kombinacji zamiast listy wyboru

**Cytat C:** „Fireball — mam 95 kombinacji obrazen. Powinna byc lista legalnych
celow do wyboru (ptaszek) i osobny licznik +/- na X i koszt. Po zatwierdzeniu
silnik sprawdza legalnosc i jesli trzeba daje wizard many."

**Cytat C1:** „Wrap in Flames — zamiast 50 kombinacji lista legalnych celow
z ptaszkiem, potem sprawdzenie legalnosci, potem ewentualnie wizard many."

**Rozpoznanie:** to JEDNA klasa — enumeracja `legalCommands` mnozy warianty
(cele x podzialy X). UI dostaje kartezjanski iloczyn i wypisuje go jako liste
przyciskow. Rozwiazanie: EKRAN WYBORU (checkboxy + licznik X), ktory sklada
JEDNA komende, zamiast setek gotowych komend w panelu. Silnik zostaje bez
zmian (komendy sa legalne) — zmiana jest w warstwie UI/oferty.

**Uwaga:** to najwieksza pozycja; robie ja po A/B/D, osobnymi commitami
(najpierw C1 — prostszy wariant bez X, potem C z licznikiem X).

## D — „(wybor gracza)" myli, gdy decyduje bot

**Cytat:** „Veiled Ascension zagral Bot. Komunikat: »Veiled Ascension —
skorzystac z efektu „you may"? (wybor gracza)«. To »gracza« jest mylace.
Powinno byc: »Veiled Ascension - wybor opcjonalny wlasciciela karty«.
Przypuszczam, ze ten sam wzor jest w wielu innych kartach."

**Rozpoznanie:** dokladnie 3 miejsca w `src/table/session.js` (linie ~1253,
~1270, ~1310) doklejaja staly napis „(wybor gracza)" niezaleznie od tego, KTO
decyduje. Zdarzenia niosa `playerId`, wiec opis moze nazwac decydenta wprost.

## Kroki (kazdy = osobny zielony commit + push; ADR 0020 C)

- [x] K0: ten plan — `1e03aff`
- [x] K1 (D): decydent nazwany po imieniu — `134f4f1`
- [x] K2 (A): wizard many takze dla decyzji platniczych — `799d4c0`
- [x] K3 (B): kara bota za tapniecie siebie poza walka — `813b1b0`
- [x] K4+K5 (C/C1): rdzen wyboru celow — `adba3bc`
- [x] K4+K5 (C/C1): ekran zaznaczania podlaczony do stolu — `69f9e3a`
- [x] K6: dokumentacja

## Ryzyka / pulapki

- **A**: wizard musi znac koszt decyzji (nie jest to koszt karty) — deskryptor
  platnosci trzeba zbudowac z `amount` zdarzenia, nie z MANA_COSTS.
- **B**: kara nie moze zabic sensownych uzyc (buff atakujacego po deklaracji,
  buff blokujacego w turze przeciwnika) — potrzebne kontrole anty-over-fix.
- **C/C1**: zmiana dotyka OFERTY — trzeba uwazac, zeby boty nadal dostawaly
  komendy (one nie klikaja UI). Bezpieczniej: UI sklada komende, a enumeracja
  dla botow zostaje (albo jest ograniczana osobno).
- **L25**: zmiany w bocie przelosuja seedy testow scenariuszowych.
- Reset workspace zdarzyl sie 10x — commit + push po KAZDYM kroku.

## Wynik — WSZYSTKIE 4 UWAGI NAPRAWIONE

`npm test` **2926/2926**, build **53 moduly / 2502.3 kB**.

| Uwaga | Efekt |
|---|---|
| A | wizard many otwiera sie takze przy „zaplac albo poswiec", opcjonalnej zaplacie i zaplacie za brak kontry |
| B | bot nie tapuje juz stwora, zeby wzmocnic samego siebie poza walka |
| C | Fireball: **232 przyciski -> 6 celow + licznik X 1..7** |
| C1 | Wrap in Flames: **15 przyciskow -> 4 cele (0..3), bez licznika** |
| D | „(wybor gracza)" -> „(wybor opcjonalny: Nieprzyjaciel)" |

### Co znalazlem przy okazji

- **B**: `summarize` w sladzie bota gubil zrodlo i cel aktywacji, wiec
  w diagnostyce nie dalo sie odroznic buffu sojusznika od tapniecia siebie.
- **B**: pierwsza wersja testow anty-over-fix pytala o NIEISTNIEJACE API bota
  (`rankCommands`) i cicho sie pomijala — pulapka L15 (test, ktory nigdy nie
  czerwienieje). Przepisane na realne `trace()`.
- **C**: zmierzone repro bylo gorsze niz w zgloszeniu — 232 kombinacje przy
  4 stworach i 8 ladach (wlasciciel widzial 95).

### Weryfikacja

Kazda naprawa ma mutacje czerwieniaca test. Uwaga C dodatkowo sprawdzona
Zywym Testerem na zbudowanym artefakcie (0 zgloszen detektorow).
