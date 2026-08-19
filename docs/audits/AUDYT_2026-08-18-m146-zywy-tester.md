# Audyt Żywym Testerem po Batch 35 (M146) — 2026-08-18

**Zlecenie właściciela:** audyt po dodaniu nowych kart — (a) auto-detektory,
(b) analiza logu (czy bot rzuca czary optymalnie — na najgroźniejszego wroga,
w turze i fazie o największym sensie), (c) dodatkowe detektory sensowności
działań bota.

## Przebieg

- 20+ partii Żywym Testerem (`tools/table-tester`), kombinacje talii
  obejmujące NOWE karty Batch 35 po OBU stronach stołu:
  - Twiddle (spellslinger) — bot: seeds 3/11/23/51/77,
  - Basilisk Gate + Steelfin Whale (mechanicy) — bot: seed 5,
  - Blazing Torch (innistrad), Mindstab (black) — jako bot i gracz,
  - Trade Route Envoy (green).
- Świeży `npm run build` przed każdą serią (mostek `?tester=1`, sonda noop).

## (a) Auto-detektory — wyniki

Przesiew istniejącymi detektorami (raw/bot/ui/rules/noop + sonda noop na
klonie stanu, ~100–340 sond na partię). Większość partii: **0 zgłoszeń**.
Zgłoszenia powtarzalne (weryfikacja → artefakty znanych klas):

- `[noop]` Soulbright Flamekin „zdobądź Zadeptywanie" na celu z tym
  keywordem — znany wzorzec M103/A2 (oferta no-opu, bramka
  `abilityEffectIsNoOp` nie obejmuje tej konfiguracji `onNthResolve`);
- `[noop]` Dragon Arch bez wielokolorowej karty w ręce — znany M126/#2;
- `[rules]` Plague Reaver „trigger bez efektu" + obok skutek Rustvine —
  znana klasa M138/Z4 (L24, cichy skutek) na innej parze kart.

Żadne z powyższych nie jest regresją Batch 35.

## (b) Analiza logu — jakość decyzji bota z nowymi kartami

Kluczowa weryfikacja: czy bot gra nowymi kartami sensownie (cel = najgroźniejszy
wróg, właściwe okno). **Znalezione dwa realne problemy, naprawione u root cause:**

### B1 — Bot wzmacniał stwory PRZECIWNIKA Basilisk Gate

Transkrypt (green vs mechanicy, seed 5):

```
[ROZGRYWKA] • Nieprzyjaciel aktywuje zdolność: Basilisk Gate → cel: Scion Summoner
[ROZGRYWKA] • Nieprzyjaciel aktywuje zdolność: Basilisk Gate → cel: Greater Tanuki
```

Detektor `detectBotBuffsMyCreatures` (istniejący) zgłosił oba — bot płacił
{2},{T} za +X/+X na STWORACH GRACZA. Root cause: efekt `pump_by_gates`
(nie istniał w momencie budowy tabeli kar) nie miał wyceny w ścieżce
`activate_ability` heuristic-bota — warianty remisowały i bot brał pierwszy
cel z brzegu (wzorzec M96/M135: efekt spoza wyceny = „pierwsza oferta").

**Naprawa:** `pump_by_gates` w gałęzi pump (kara za wzmacnianie wroga −60,
X liczone z widoku jako liczba kontrolowanych Gates). Weryfikacja: ta sama
partia po przebudowie — 0 zgłoszeń, bot nie aktywuje na stwory gracza.

### B2 — Bot odkręcał GÓRĘ wroga Twiddle (tryb Odkręcenie)

Transkrypt (red vs spellslinger, seeds 11/23):

```
[ROZGRYWKA] • Nieprzyjaciel rzuca Twiddle — tryb: Odkręcenie → cel: Mountain
```

Bot płacił {U} + kartę, żeby ODKRĘCIĆ permanent wroga w swoim upkeepie
(oddanie wrogowi many). Root cause podwójny:
1. `untap_permanent` nie miał żadnej wyceny (czary ani zdolności) —
   warianty remisowały, bot brał pierwszy cel;
2. czysto-utylitarny czar (tylko tap/untap) startował od bazowych 50 pkt,
   więc nawet zła kara (50−12=38) przebijała pass (0).

**Naprawa (dwie reguły generyczne):**
- `untap_permanent`: własny zatapnięty STWÓR = +8+2×moc; własny LAND = kara
  (land odkręca się sam w untap step — ręczne odkręcenie to marnowanie
  czaru); cudzy permanent = −25 (pomoc wrogowi);
- czar, którego WSZYSTKIE efekty to tap/untap/lock/evasion, startuje od −1
  (PONIŻEJ passu) — wartość tylko z efektu na konkretnym celu.

Weryfikacja (seeds 3/11/23/51/77 po przebudowie): bot przestał odkręcać
cokolwiek; tapuje już wyłącznie stworów wroga („Tapnięcie → cel: Soulbright
Flamekin/Goblin Piker/Ramroller"), a gdy stwory wroga są zatapnięte —
nietkniętą górę (poprawny wybór spośród dostępnych celów).

### B3 — Zgłoszenie detektora `[ui]` — „dostaje undefined/undefined"

`[ROZGRYWKA] • Krumar Initiate dostaje undefined/undefined` — opis zdarzenia
`stats_modified` znał tylko wariant z `powerModifier`, a zdarzenie bywa
emitowane dla innych skutków (lock_untap, skipsNextUntap, base PT, copy) —
renderował śmieć (pre-existing, nie regresja Batch 35, ale znalezisko audytu).

**Naprawa:** opis zna każdy wariant: „nie odkręca się, dopóki X jest na
polu bitwy i zatapnięte", „nie odkręca się w następnym kroku odkręcania",
„staje się N/N do końca tury", „kopiuje cechy celu".

## (c) Nowy detektor

**`detectBotUntapsMyPermanent`** (oś 1/5, kategoria `bot`) — bot ODRKĘCA
TWÓJ permanent (klasa B2; uzupełnienie matrycy `detectBotBuffsMyCreatures`).
Zweryfikowany dwustronnie: zgłasza wzorzec z transkryptu, milczy na celach
własnych/niejednoznacznych i na trybie Tap. Testy: 2 w
`test/table-tester-detectors.test.js`.

## Potwierdzenia

- `npm run test:all` **2310/2310**; build 51 modułów / 1958.4 kB.
- Benchmark szybki 0 crashy: heuristic 80.2% vs random (bez regresji).
- Transkrypty: `/tmp/audyt-*.txt` (serie przed/po naprawach).

## Wnioski

- Detektory + sonda noop działają; część zgłoszeń to znane klasy
  (nie regresje) — zapisane, żeby nie wracać.
- Wartość audytu leżała w OSI 1 (sensowność bota): dwie nowe karty
  (Basilisk Gate, Twiddle) weszły z luką w wycenie efektów `pump_by_gates`
  i `untap_permanent` — obie naprawione generycznie (ADR 0002).
- Nauczka do LESSONS: **nowy typ efektu w kartach batcha wymaga sprawdzenia,
  czy heuristic-bot go WYCENIA** (wzorzec M96/M135 — efekt spoza wyceny =
  „pierwsza oferta") — dopisać do listy kontrolnej dodawania kart.
