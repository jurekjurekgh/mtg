# M119 — audyt „z perspektywy gracza” Żywym Testerem · 2026-08-17

Polecenie właściciela: *wciel się w gracza, rozegraj partie różnymi taliami,
obserwuj stół — zbierz 10 unikalnych błędów/usterek/niejasności/głupich
zachowań bota, napraw je, a klasy błędów dopisz do detektorów Testera.*

## Rozegrane partie (artefakt `dist/mtg-table.html`, `?tester=1`)

| # | Talie (gracz vs bot) | seed | profil | wynik | detektory |
|---|---|---|---|---|---|
| 1 | green vs red | 42 | greedy | wygrana gracza | 0 zgłoszeń |
| 2 | innistrad vs wiedzmin | 7 | explorer | wygrana bota | 0 |
| 3 | tokens vs spellslinger | 13 | defensive | wygrana bota | 0 |
| 4 | azorius vs black | 21 | random | wygrana bota | 0 |
| 5 | graveyard vs mechanicy | 55 | explorer | wygrana gracza | 0 |
| 6 | ostrza vs sojusznicy | 8 | defensive | wygrana bota | 0 |
| 7 | wiedzmin vs tokens | 31 | random | wygrana bota | 0 |
| 8 | black vs green | 17 | impatient | wygrana bota | 0 |

**Wszystkie osiem partii: „DETEKTORY: brak zgłoszeń”.** Każde znalezisko
poniżej pochodzi z ręcznego czytania transkryptu w roli gracza — to samo
w sobie jest wnioskiem: obecne detektory nie pokrywają tych klas błędów
(stąd wymóg właściciela, żeby je dopisać).

## Znaleziska

### Z1 — log nie odmienia liczników („dostaje +2 licznik”)
*Oś 2 (informacja).* Transkrypt (partia 1, krok 44):
`Leafcrown Dryad dostaje +2 licznik +1/+1 (razem 2)`, a także
`dostaje +2 licznik stun`, `dostaje +2 licznik charge`.
Po polsku: „+2 **liczniki**”. Analogicznie `counter_removed`:
„traci 2 licznik”. W pliku istnieje `polishPlural`, używany dla obrażeń
i kart — liczniki go po prostu pominięto.
Root cause: `src/table/session.js`, `case 'counter_added'`/`'counter_removed'`.

### Z2 — „Proliferate: 2 celów” / „odłóż 5 kartę”
*Oś 2.* Odmiana „na piechotę” zamiast `polishPlural`:
- `proliferated`: `${e.count} cel${e.count === 1 ? '' : 'ów'}` → „2 celów”
  (poprawnie: „2 cele”);
- `mulligan_bottom_required`: `kart${e.count === 1 ? 'ę' : 'y'}` → „5 karty”
  (poprawnie: „5 kart”).

### Z3 — mulligan londyński: 35 opcji, w tym nierozróżnialne duplikaty
*Oś 4 + lekcja L19.* Partia 3 (tokens, seed 13), ręka 7 kart, odkładamy 3:
panel pokazuje **35 opcji** — wszystkie podzbiory C(7,3) — a wśród nich
pozycje nieodróżnialne dla gracza:
`Mulligan — odłóż na spód (2): Mountain, Mountain (1 z 15)` … `(15 z 15)`.
Numeracja „x z 15” niczego nie mówi: każdy z 15 wariantów odkłada dwie
identyczne Góry i daje **ten sam stan gry**.
Dwa błędy w jednym: (a) brak capu enumeracji wbrew L19 (precedensy
`COMBAT_OPTION_CAP`, `ESCAPE_OPTION_CAP` = 32), (b) brak deduplikacji
wariantów równoważnych (ten sam multizbiór nazw kart).
Root cause: `src/engine/game-state.js`, gałąź `pendingMulliganBottom`.

### Z4 — koszt zdolności renderowany jako „T2” zamiast „{2}, {T}”
*Oś 2/UX.* Partia 7: `Aktywuj: Seer's Lantern (Ty) (koszt T2) — scry 1`.
Oracle: `{2}, {T}: Scry 1`. Kolejność jest odwrócona wobec konwencji MtG
i bez separatora, więc „T2” czyta się jak jeden symbol. Obok stoi druga
zdolność „(koszt T)” — gracz nie widzi od razu, że ta droższa wymaga 2 many.
Root cause: `abilityCostHtml` w `src/table/render.js` wypycha `{T}` na
początek tablicy `mana`.

### Z5 — bot filtruje manę bez powodu (Jeskai Devotee)
*Oś 1 (bezsensowne działania bota).* Partie 3 i 6: bot aktywuje
`{1}: Add {U}, {R}, or {W}` **w każdej swojej turze** (16 aktywacji),
w tym w turach, w których nie rzuca potem żadnego czaru.
Zweryfikowane sondą: pula przed `{R:3}` → po `{R:2, WUR:1}`. To zamiana
1 many na 1 manę; niewykorzystana mana znika w cleanup (CR 500.4), więc
w turze bez czaru to czysta strata. `oncePerTurn` DZIAŁA poprawnie
(1×/turę) — błędem jest wycena, nie reguła.

### Z6 — log mówi „Bierzesz mulligan (1)”, potem „(4)” — bez kontekstu
*Oś 2.* Partia 6: w logu pojawia się `Bierzesz mulligan (1)` i
`Bierzesz mulligan (4)`, choć modal odliczał kolejne ręce. Liczba w nawiasie
to licznik mulliganów, ale gracz nie ma jak tego wiedzieć — brak jednostki.

## Weryfikacja hipotez ODRZUCONYCH (żeby nie zgłaszać fałszywek)

- **„Leafcrown Dryad ma moc 7 zamiast 5”** — sprawdzone w izolacji: 2/2
  bazowo + 3/3 z aury Vow of Wildness + **2 liczniki +1/+1 z pokoju Forge**
  (Undercity) = 7/7. Silnik liczy poprawnie.
- **„Zdarzenia zwracają surowy typ w logu”** (`reveal_order_required`,
  `reveal_resolved`, `proliferate_target_required`,
  `delayed_trigger_scheduled`) — te cztery typy **nie są nigdzie emitowane**
  (0 wystąpień `event('…')` w `src/`), więc do UI nie trafiają. Dług
  martwego kodu, nie błąd gracza.
- **„mass_stats_modified mówi «bez zmian»”** — mój błąd wywołania sondy
  (pola `power`/`toughness` zamiast `powerModifier`/`toughnessModifier`).
  Z realnym zdarzeniem opis brzmi „twoje stwory (2 stwory): +1/+1”.
- **„Brak okna odpowiedzi na czar bota”** — okna „▶ Wznów grę bota” to
  świadoma pauza bota (M100), nie brak priorytetu.

### Z7 — panel oferuje kontrczar we WŁASNY czar gracza
*Oś 4 (oferta bez skutku).* Partia 7 (wiedzmin vs tokens, seed 31, krok 21):
gracz rzuca Village Rites, a w oknie odpowiedzi panel pokazuje
`Rzuć: Negate (koszt 1U) → cel: Village Rites` — czyli propozycję
skontrowania **własnego, dopiero co rzuconego czaru**, za dodatkowe 2 many.
Formalnie legalne (CR 115.4 — kontrczar może celować w dowolny czar na
stosie), ale to pewna strata: gracz płaci dwa razy i nie dostaje nic.
Sonda `probeCommandEffect` tego nie zgłasza, bo stan gry SIĘ ZMIENIA
(czar znika ze stosu) — klasyfikator widzi „efekt”, nie „samobójstwo”.

## Naprawy (M119)

| # | Naprawa | Miejsce |
|---|---|---|
| Z1 | liczniki odmieniane przez `polishPlural` | `src/table/session.js` |
| Z2 | „2 cele” i „odłóż 5 kart” zamiast odmiany na piechotę | `src/table/session.js` |
| Z3 | mulligan: **deduplikacja po składzie ręki** + cap 32 (L19) | `src/engine/game-state.js` |
| Z4 | koszt zdolności w kolejności Oracle: „(koszt 2, T)” | `src/table/render.js` |
| Z5 | wycena bota: filtr many o bilansie ≤ 0 dostaje karę | `src/controllers/heuristic-bot.js` |

Z6 (czytelność „Bierzesz mulligan (N)”) i Z7 (kontrczar we własny czar)
zostają **opisane, ale nienaprawione** — patrz „Do decyzji właściciela”.

### Efekt Z3 zmierzony na tej samej partii (seed 8, ostrza vs sojusznicy)

| modal | przed | po |
|---|---|---|
| „odłóż 1” | 7 opcji | **2** |
| „odłóż 2” | 21 opcji | **3** |
| „odłóż 3” | 35 opcji | *(nie wystąpił)* |

Ręka z siedmiu identycznych Gór daje teraz **jedną** ofertę zamiast 35.

## Nowe detektory (żeby te klasy łapały się same)

Wszystkie dwanaście partii audytu zakończyło się „DETEKTORY: brak zgłoszeń” —
to znaczy, że narzędzie nie pokrywało znalezionych klas. Dopisane
(`tools/table-tester/detectors.mjs`, testy w
`test/table-tester-detectors.test.js`):

1. **`detectPolishPluralErrors`** (kategoria `info`) — sprawdza zgodność formy
   rzeczownika z liczebnikiem wg reguły polskiej (1 / 2–4 / 5+, z wyjątkiem
   12–14) dla rzeczowników realnie występujących w logu. Uwaga techniczna:
   `\b` **nie działa** po polskich znakach diakrytycznych („kartę” kończy się
   literą spoza ASCII), więc granica wyrazu sprawdzana jest przez `(?![\p{L}])`
   — bez tego detektor produkował fałszywe alarmy na poprawnym „1 kartę”.
2. **`detectIndistinguishableOptions`** (kategoria `ui`) — normalizuje etykiety
   opcji modala (ucina licznik egzemplarzy „(x z N)”) i zgłasza modal,
   w którym po normalizacji zostają duplikaty. Wykryłby M102/U3 i Z3.

Weryfikacja wsteczna na archiwalnych transkryptach: oba detektory zgłaszają
dokładnie te znaleziska, które znalazłem ręcznie, i milczą na poprawnych
formach.

## Do decyzji właściciela (nienaprawione świadomie)

- **Z6 — „Bierzesz mulligan (1)”.** Liczba w nawiasie to licznik mulliganów,
  ale bez jednostki gracz może ją czytać jako liczbę kart. Propozycja:
  „Bierzesz mulligan nr 1 (ręka: 7 kart, odłożysz 1)”. Zmiana czysto
  redakcyjna — zostawiam do akceptacji brzmienia.
- **Z7 — kontrczar we własny czar.** Odfiltrowanie tej oferty byłoby
  odebraniem legalnego ruchu (są sytuacje, gdy gracz CHCE skontrować własny
  czar — np. żeby nie dopuścić do triggera przeciwnika). Alternatywa:
  ostrzeżenie w etykiecie („cel: TWÓJ czar”). Wymaga decyzji, bo dotyka
  zasady „panel nie ocenia ruchów za gracza”.
