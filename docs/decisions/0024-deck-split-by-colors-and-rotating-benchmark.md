# ADR 0024: Podział talii planowej po przekroczeniu progu (kolory) i rotująca próbka benchmarku

- **Status:** Zaakceptowana
- **Data:** 2026-08-27
- **Decydenci:** właściciel projektu (zlecenie M228 + trzy doprecyzowania)

## Kontekst

ADR 0023 wprowadził talie per PLAN: plan z ≥15 wspieranymi kartami dostaje własną
talię, mniejsze plany trafiają do worków. Talie rosły jednak bez górnego
ograniczenia — Innistrad dobił do 35 kart nielandowych, kilka innych do 30+.
Duża talia jednoplanowa traci tożsamość (miesza wiele kolorów) i jest mniej
użyteczna jako spójne „środowisko" do gry i benchmarku.

Równolegle benchmark (ADR 0018/0023) grał na STAŁEJ, ręcznie zamrożonej próbce
`BENCH_DECKS`. Chroniło to progi przed dryfem, ale zamrażało „środowisko" — bot
był mierzony wiecznie na tych samych 6 taliach.

## Decyzja

### 1. Obowiązkowy podział kolorystyczny przy ≥30 kartach nielandowych

Talia JEDNOPLANOWA (nie worek — worki są przejściowe, ADR 0023 §4), która po
dodaniu kart osiągnie **≥30 kart nielandowych** (poza basic-landami), jest
OBOWIĄZKOWO dzielona na dwie talie po kolorach. Każda część musi mieć **≥15 kart
nielandowych** (zasada nadrzędna z ADR 0012).

- Kryterium podziału: kolory kart. Karta idzie na stronę z większością swoich
  kolorów; funkcja celu minimalizuje „leak" (karty rozdarte między strony) i
  różnicę liczności. Brute-force po 30 podzbiorach 5 kolorów — deterministyczny
  (ADR 0005), bez RNG.
- **Tożsamość kolorystyczna karty** (doprecyzowanie właściciela): dla karty z
  kolorami w definicji — jej `colors[]`. Dla KAŻDEJ karty BEZKOLOROWEJ (ląd,
  artefakt „mana rock", stwór devoid) — kolory MANY, jaką ta karta PRODUKUJE,
  czytane z engine'owego `getSourceForObject` (L41: jedna reguła produkcji many,
  jeden odczyt). Dimir Guildgate ({U}{B}), Great Furnace ({R}) czy artefakt
  dający {U} idą do talii ze swoim kolorem. Źródło bezbarwne ({C}), any-color
  (Rupture Spire) albo nie-źródło many → BEZKOLOROWY wypełniacz balansujący
  strony (jak zwykły artefakt).
- Nazewnictwo: `<slug-planu>-<litery-kolorów>` (np. `innistrad-wu`,
  `innistrad-brg`); nazwa talii: `<Plan> (KOLORY)`. Sufiksy z partycji są
  rozłączne (każdy kolor po jednej stronie).
- **Re-podział przy kolejnym wzroście:** jeśli plan ma już więcej niż jedną
  talię i któraś znów przekroczy próg, dzielimy PONOWNIE cały zbiór kart planu
  (nie tylko przepełnioną talię), żeby podział pozostał równomierny — w praktyce
  generator liczy podział od zera przy każdym uruchomieniu.
- **Fallback „fill_then_keep"** (decyzja właściciela): jeśli czystego podziału
  na dwie talie ≥15 nie da się osiągnąć (plan zbyt jednokolorowy), talia
  ZOSTAJE jedna, a generator wypisuje ostrzeżenie. Nie tworzymy sztucznej,
  niespójnej talii.

### 2. Zasady nadrzędne (niezmienne, ADR 0012/0023)

- singleton: każda karta poza basic-landem w DOKŁADNIE jednej talii;
- basic landy w proporcji ~2:1 do reszty (`ceil(nielandów/2)`), liczone osobno
  per talia po podziale;
- żadna karta (poza basic-landami) nie jest w więcej niż jednej talii;
- nie mniej niż 15 kart nielandowych w talii.

### 3. Rotująca próbka benchmarku

`BENCH_DECKS` NIE jest już ręcznie zamrożoną listą — to `selectBenchDecks()`:
deterministyczny wybór pierwszych 6 talii JEDNOPLANOWYCH (bez worków),
posortowanych alfabetycznie. Podział talii zmienia zestaw z czasem, więc
„środowisko" benchmarku ODŚWIEŻA się wraz z katalogiem (świadoma decyzja
właściciela — to korzyść: bot nie jest wiecznie mierzony na tych samych
taliach). Zmiana składu próbki = jednorazowa rekalibracja progów regułą
„zmierzone −15 p.p., tylko w górę" (historia w nagłówku
`test/bot-benchmark.test.js`).

## Procedura dla przyszłych batchów

- Po dodaniu kart uruchom `node tools/generate-plan-decks.mjs` — generator sam
  awansuje plany z worków (ADR 0023) i dzieli talie, które dobiły do 30
  (ADR 0024). Ostrzeżenia `[generator] PODZIAŁ: …` i `UWAGA: … fallback` mówią,
  co się stało.
- Po podziale talii z próbki benchmarku: uruchom `node tools/benchmark.mjs`,
  wklej tabelę do PR, przelicz progi w `test/bot-benchmark.test.js` („−15 p.p.,
  tylko w górę"), zregeneruj golden-master
  (`node tools/bot-scoring-snapshot.mjs --write`).
- Zaktualizuj sekcję „Talie" w `README.md` (nazwa, kolory, liczność).
- Testy scenariuszowe czytające konkretną talię: użyj nowej nazwy połówki (np.
  `tarkir-bg`); seedy zamrożone przelosuj hunterem (L25).

## Konsekwencje

- Talie pozostają spójne kolorystycznie i mieszczą się w 15–29 kartach
  nielandowych; duży plan = dwie talie o wyraźnej tożsamości.
- Benchmark „żyje" z katalogiem; rotacja próbki odkrywa błędy, które stała
  próbka pomijała (M228 ujawnił dwa pre-istniejące błędy silnika: pass podczas
  undercity/fabricate oraz rzut modala impulsem z exile).
- Koszt: każdy podział talii z próbki wymusza rekalibrację progów i regenerację
  golden-mastera — akceptowany świadomie.
