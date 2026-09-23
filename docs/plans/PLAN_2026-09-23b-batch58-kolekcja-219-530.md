# Batch 58 — karty właściciela 219FIN, 265OGW, 318CLB, 377AVR, 447DSK, 464AVR, 530ZEN (2026-09-23)

Zlecenie właściciela (2026-09-23): „Ok, to zabieraj się za ten batch” + lista
siedmiu pozycji w formacie arkusza kolekcji:

| artId | SET | Karta | Plan |
|---|---|---|---|
| 219 | FIN | Prishe's Wanderings | Final Fantasy |
| 265 | OGW | Boulder Salvo | Zendikar |
| 318 | CLB | Gond Gate | Forgotten Realms |
| 377 | AVR | Scroll of Avacyn | Innistrad |
| 447 | DSK | Resurrected Cultist | Warhammer Fantasy |
| 464 | AVR | Polluted Dead | Wiedźmin |
| 530 | ZEN | Grazing Gladehart | Zendikar |

Gałąź sesji: `arena/01a0ceb4-mtg` (PR #134). Baza pomiarowa: `efa4a77` —
zweryfikowana `git log -1` + `git status` przed pierwszym kodem.

Stan wyjścia **zmierzony** (2026-09-23, nie przepisany z handoffu):

| Miara | Wartość |
|---|---|
| `npm test` | 6179/6179 (0 fail) |
| pełna brama `node tools/run-tests.mjs all` | 6189/6189 (0 fail, ~365 s) |
| `npm run build` | 59 modułów / 4049,7 kB |
| katalog | 543 wpisy = 492 `supported` + 43 `token` + 8 `back` |
| karty z `artId` | 495 (pin `test/art-ids-tool.test.js`) |
| arkusz kolekcji | 502 wiersze |

To są **ostatnie 7 pozycji arkusza** bez odpowiednika w katalogu (pomiar M417/M419);
po tym batchu każda karta z arkusza właściciela jest w katalogu.

Dane kart: Scryfall **set-aware** (`/cards/named?exact=…&set=…`, ADR 0010 §2a)
— druk z arkusza, nie domyślny reprint. Snapshoty `docs/cards/scryfall-*.json`
+ rulingi pobrane 2026-09-23 (ADR 0028: po kartce, w kolejności batcha; bez hurtu).
Pobór szedł `fetch_page` (egress `curl`/`fetch` w sandboxie jest zablokowany —
HTTP 000), po jednej karcie na wywołanie.

## Lista i rozpoznanie (Oracle + rulingi pobrane online 2026-09-23, ADR 0030)

| artId / plan | Karta | Druk | Co wnosi | Status mechaniki |
|---|---|---|---|---|
| 219 Final Fantasy | Prishe's Wanderings | fin/193 | `{2}{G}` Instant: search biblioteki po **basic land LUB Town**, na pole bitwy **tapnięty**, tasuj; „When you search your library this way” — **refleksyjny** trigger: +1/+1 na cel-stwora, którego kontrolujesz | **NOWE**: kwalifikator szukania z ALTERNATYWĄ (`anyOf`: basic land ∨ Town — `librarySearchMatches` zna tylko AND), cel wybierany **po** przeszukaniu (odpowiednik triggera refleksyjnego) |
| 265 Zendikar | Boulder Salvo | ogw/102 | `{4}{R}` Sorcery: **Surge `{1}{R}`**; 4 obrażenia w cel-stwora | **istnieje**: surge (deskryptor + oferta + ścieżka płatności; dwie karty w katalogu), `damage` — karta to głównie dane + testy |
| 318 Forgotten Realms | Gond Gate | clb/353 | Land — Gate: „**Gates you control enter untapped**”; `{T}`: `{C}`; `{T}`: **mana dowolnego koloru, jaki mogłaby wyprodukować kontrolowana Brama** | **NOWE**: statyk zmieniający wejście INNYCH permanentów (wejście odkręcone) + zdolność many o kolorach **liczonych ze źródeł** (unia produkcji kontrolowanych Bram, także zdolności z kosztem many) |
| 377 Innistrad | Scroll of Avacyn | avr/220 | `{1}` Artifact: `{1}`, poświęć: dobierz kartę; **jeśli kontrolujesz Anioła** — +5 życia | **NOWE**: warunek efektu „kontrolujesz stwora o podtypie” (dziś jest tylko negatywny `controlsNoCreatureSubtype` i planeswalker) |
| 447 Warhammer Fantasy | Resurrected Cultist | dsk/115 | `{2}{B}` 4/1 Human Cleric: **Delirium** — `{2}{B}{B}`: wróć TĘ kartę z grobu na pole bitwy z **licznikiem finality**; aktywuj tylko przy 4+ typach kart w grobie i tylko jak sorcery | **NOWE**: bramka aktywacji z grobu „delirium” + efekt powrotu SIEBIE z grobu z licznikiem finality (jest powrót CUDZEJ karty — Zoraline) |
| 464 Wiedźmin | Polluted Dead | avr/116 | `{4}{B}` 3/3 Zombie: gdy umiera — **zniszcz cel-ląd** | **istnieje**: trigger `dies` + `destroy_permanent`; do sprawdzenia typ celu `land` na torze triggera (na torze czaru istnieje — Vandalize) |
| 530 Zendikar | Grazing Gladehart | zen/163 | `{2}{G}` 2/2 Antelope: **Landfall** — gdy ląd wchodzi, **możesz** zyskać 2 życia | **istnieje**: `land_entered_under_your_control` + `mayFire` (Angel's Feather), `gain_life` |

Rulingi (dowody reguł, zapisane w snapshotach):

- **Prishe's Wanderings** (wotc 2025-06-06): „You don't choose a target for
  Prishe's Wanderings at the time you cast it. Rather, a second *reflexive*
  ability triggers when you search your library this way. You choose a target
  for that ability as it goes on the stack. Each player may respond to that
  triggered ability as normal.” → czar **nie ma celu przy rzucie**; cel
  wybieramy po przeszukaniu, a trigger rozstrzyga się PO czarze.
- **Boulder Salvo** (wotc 2016-01-22): surge to koszt alternatywny; surge nie
  zmienia mana value; inny czar może być już rozstrzygnięty, skontrowany albo
  (instant) wciąż na stosie.
- **Scroll of Avacyn** (wotc 2012-05-01): „Whether you control an Angel is
  checked when the ability resolves.” → warunek czytany w chwili rozstrzygnięcia.
- **Resurrected Cultist** (wotc 2024-09-20): licznik finality działa na KAŻDYM
  permanencie (nie tylko stworze) i wygania zamiast śmierci; nie jest licznikiem
  słowa kluczowego; wiele liczników finality = redundantne.
- **Grazing Gladehart** (wotc 2024-11-08): landfall triggeruje, gdy ląd wchodzi
  z DOWOLNEGO powodu (zagranie lądu, czar, zdolność); NIE triggeruje, gdy
  permanent już na polu bitwy staje się lądem.
- **Gond Gate** i **Polluted Dead**: Scryfall nie ma rulingów (puste listy) —
  reguły bierzemy z Oracle + CR.

Żaden plan nie przechodzi progu auto-awansu M181 (wszystkie sześć planów ma już
własne talie: Final Fantasy 17, Zendikar 21, Forgotten Realms 24, Innistrad 37,
Warhammer Fantasy 40, Wiedźmin 34 wspieranych) → talie dostają po prostu nowe
karty przez generator.

## Nazwane brakujące reguły (generyczne, ADR 0002 — zero warunków na nazwę karty)

1. **Kwalifikator szukania z alternatywami** — `librarySearchMatches` składa
   kryterium z AND (typy, podtypy, kind, MV, nazwa). „Basic land card **or**
   Town card” (Prishe) wymaga listy `anyOf` i JEDNEJ implementacji czytanej
   przez obie ścieżki decyzji (`queueSearchChoice` i `resolve_search_choice`).
2. **Cel triggera refleksyjnego po przeszukaniu** — czar nie ma celu przy
   rzucie; po rozstrzygnięciu decyzji szukania (także przy „nie ma czego
   znaleźć” — szukanie i tak następuje) kolejkuje się decyzja celu
   (`creature_you_control`) i efekt licznika. Kolejność: najpierw dokończenie
   czaru (`finishPendingSpell`), potem decyzja celu — tak działa refleksyjny
   trigger (wchodzi na stos nad czarem, który już się rozstrzygnął).
3. **Statyk „wpisy wchodzą odkręcone”** — „Gates you control enter untapped”
   to efekt zastępczy modyfikujący wejście INNEGO permanentu. Wspólny predykat
   (`entersUntappedByStatic(state, entering, controllerId)`) czytany w każdej
   ścieżce, która dziś rozstrzyga „wchodzi tapnięty”: land drop
   (`playLand`, resources.js) i wejście z szukania/biblioteki (game-state.js).
4. **Mana „dowolnego koloru, jaki mogłaby wyprodukować kontrolowana Brama”** —
   deskryptor `add_mana` z kolorami liczonymi na chwili aktywacji: unia kolorów
   ze zdolności many kontrolowanych permanentów o podtypie `Gate` (Także
   zdolności z kosztem many — Heap Gate „{1},{T}: Add one mana of any color”
   liczy się do „could produce”, inaczej niż auto-tap M193/A). Brak Bramy
   produkującej KOLOR = zdolność nie produkuje nic (kolor bezbarwny nie jest
   kolorem); jeśli któraś Brama produkuje dowolny kolor — pula to WUBRG.
5. **Warunek efektu „kontrolujesz stwora o podtypie”** — pozytywny bliźniak
   `controlsNoCreatureSubtype` w efekcie `conditional` (Scroll of Avacyn:
   Anioł), czytany w chwili rozstrzygnięcia zdolności (ruling 2012-05-01).
6. **Bramka aktywacji „delirium”** (4+ typy kart w grobie) dla zdolności
   aktywowanej z grobu (Resurrected Cultist) — ten sam licznik co trigger
   (`graveyardCardTypeCount`), czytany w ofercie i w walidacji komendy.
7. **Powrót SIEBIE z grobu z licznikiem finality** — nowy efekt
   (`return_source_from_graveyard_to_battlefield`, finality counter) obok
   istniejącego powrotu cudzej karty (`return_permanent_from_graveyard`).

## Etapy — każdy = osobny, samodzielnie zielony commit (push od razu)

Zasady wspólne (bez powtarzania w każdym punkcie):

- **Testy RED przed implementacją**, potem GREEN; dla każdej karty scenariusz
  **legalny i nielegalny** (ADR 0010 §koszty).
- **Karty wchodzą do katalogu TYLKO w 100% gotowe** (ADR 0022 + M419: status
  `supported` od pierwszego commita; w katalogu nie ma `in-development`).
  Definicja karty wchodzi razem z `MANA_COSTS` i testami w tym samym etapie.
- **Dowiązania deskryptora (L84)** przed pierwszym pełnym `npm test`:
  `EVENT_TYPES` + opis zdarzenia (`session.js`), etykieta PL (`render.js`,
  strażnik M122), wycena bota albo `REVIEWED_UNVALUED` (M157),
  `gameObjectDataOf` (`materialize.js`) **oraz** jawna lista pól `installDeck`
  (`src/engine/deck.js`, M379), a dla nowych pól stanu `fingerprint`.
- **Karty wchodzą do talii wyłącznie generatorem** (ADR 0023/0024):
  `node tools/generate-plan-decks.mjs` po nadaniu `supported`.
- **Golden master**: każdy churn talii = świadoma regeneracja z **atrybucją**
  (która talia, dowód izolacji), bez zmian wag/progów (L124).
- Liczności pinowane w testach (`withArt` 495, arkusz 502) aktualizowane
  w etapie, w którym rosną.
- Po KAŻDYM etapie: `git log --oneline -1` + `git status`, `npm test`,
  `npm run build`, commit, push.

### B0a — plan (ten dokument) — ✅ wykonany (`d2743f0`)

Commit planu przed pierwszym kodem.

### B0b — dane źródłowe (7 snapshotów + rulingi) — ✅ wykonany (`6acec6f`)

`docs/cards/scryfall-{prishes-wanderings,boulder-salvo,gond-gate,scroll-of-avacyn,
resurrected-cultist,polluted-dead,grazing-gladehart}.json` — komplet pól
z JEDNEGO pobrania (source, print, set, set_name, collector_number,
image_uris), `pobrano: 2026-09-23`, rulingi z listy Scryfall. Bez definicji
kart (te wchodzą po jednej, gotowe, w etapach B1–B7).

**KOREKTA (zmierzona w B1, 2026-09-23):** snapshot NIE może wejść do
`docs/cards/` przed swoją kartą. Dwa strażniki klasowe czytają CAŁY katalog
plików `docs/cards/scryfall-*.json`:
`test/druki-druga-strona-i-uuid-obrazu.test.js` D/14 i
`test/obiekty-wsparcia-poza-rejestrem.test.js` OW/6 — każda nazwa pliku musi
być id karty z rejestru (albo obiektu wsparcia `undercity`), więc 6 snapshotów
bez kart otwierało 2 czerwone testy w `npm test` do końca batcha. Wariant
historyczny (Batch 55/57: karta wchodzi w B0b ze statusem `in-development`)
jest DZIŚ niemożliwy — M419/B dopuszcza w katalogu wyłącznie
`supported`/`token`/`back`. Dlatego obowiązuje: **snapshot wchodzi w tym samym
commicie co definicja karty** (B1–B7), a pliki czekające leżą POZA
repozytorium (katalog roboczy `/home/user/batch58-snapshots/`, poza drzewem
git). Każdy commit etapu pozostaje zielony, a `docs/cards` nie zna sierot.

### B1 — Boulder Salvo (265, Zendikar) — ✅ wykonany (`a36d648`)

Definicja karty (surge `{1}{R}` + `damage` 4 w cel-stwora) + `MANA_COSTS` +
testy (surge opłacony/nieopłacony, brak innego czaru w turze = pełny koszt,
cel nielegalny odrzucony) + talia generatorem + pin `withArt` 495 → 496.

### B2 — Grazing Gladehart (530, Zendikar) — ✅ wykonany (`054753c`)

Landfall z „możesz” (`mayFire`) + testy (ląd wchodzi → decyzja; „nie” nic nie
robi; trigger NIE odpala, gdy permanent staje się lądem) + talia + pin.

### B3 — Polluted Dead (464, Wiedźmin) — ✅ wykonany (`13cba9f`)

Trigger `dies` z celem `land` (jeśli tor triggerów nie zna typu `land` — dodać
generycznie, jedna implementacja z `isLand`) + testy (śmierć → zniszczony ląd;
brak legalnego celu → trigger schodzi bez efektu) + talia + pin.

### B4 — Scroll of Avacyn (377, Innistrad) — ✅ wykonany (`6b1e331`)

Warunek `controlsCreatureSubtype` w efekcie `conditional` + zdolność
aktywowana (`{1}` + `sacrificeSelf`) + testy (z Aniołem: dobranie + 5 życia;
bez Anioła: tylko dobranie; brak many = odrzucone) + talia + pin.

### B5 — Resurrected Cultist (447, Warhammer Fantasy) — ✅ wykonany (`74f2025`)

Bramka aktywacji `delirium` + efekt powrotu siebie z grobu z licznikiem
finality (i wygnanie przy śmierci — CR 122.1e) + testy (3 typy kart w grobie =
zdolność niedostępna; 4 typy = powrót 4/1 z finality; śmierć z finality →
exile; aktywacja nie jak sorcery = odrzucona) + talia + pin.

### B6 — Prishe's Wanderings (219, Final Fantasy) — ✅ wykonany (`c52788c`)

`anyOf` w kwalifikatorze szukania + cel refleksyjny po przeszukaniu + testy
(basic land znaleziony i wchodzi tapnięty; Town znaleziony; fail to find nadal
daje trigger; brak stwora = brak celu; nielegalny cel odrzucony) + talia + pin.

### B7 — Gond Gate (318, Forgotten Realms) — ✅ wykonany (`507def6`)

Statyk „Gates enter untapped” (wspólny predykat we wszystkich ścieżkach
wejścia) + mana „dowolnego koloru, jaki może dać kontrolowana Brama” + testy
(Brama wchodzi odkręcona z Gond Gate i tapnięta bez; `{T}`: `{C}`; druga
zdolność daje kolor Bramy-sąsiada, a przy Bramie „any color” — dowolny;
bez Bram kolorowych — brak produkcji) + talia + pin.

### B8 — domknięcie

Piny zbiorcze (arkusz/katalog/talie), pomiar pełnej bramy, wpis M-serii
w `docs/ENGINE_MILESTONES.md` i `docs/PROJECT_HISTORY.md`, README
(„Bieżący stan”), handoff, aktualizacja tego planu (odhaczenia + liczby).

**Stan wyjścia ZMIERZONY po batchu** (2026-09-23, `npm test` + `npm run build`
+ pełna brama, na commicie B7 `507def6`):

| Miara | Wartość |
|---|---|
| `npm test` | 6215/6215 |
| pełna brama `node tools/run-tests.mjs all` | 6225/6225 |
| `npm run build` | 59 modułów / 4087,3 kB |
| katalog | 550 wpisów = 499 `supported` + 43 `token` + 8 `back` |
| karty z `artId` | 502 (pin `test/art-ids-tool.test.js`) |
| arkusz kolekcji | 502 wiersze / 499 nazw (`tools/collection-art-ids.csv`) |

Po tym batchu **każda pozycja arkusza właściciela ma odpowiednik w katalogu**
(543 → 550 wpisów; siedem brakujących kart z tabeli na górze planu weszło
w etapach B1–B7). Kolejny batch startuje z nowej listy właściciela (ADR 0029).

Commity etapów (wszystkie wypchnięte na `arena/01a0ceb4-mtg`):
`d2743f0` (B0a) → `6acec6f` (B0b) → `a36d648` (B1) → `054753c` (B2) →
`13cba9f` (B3) → `6b1e331` (B4) → `74f2025` (B5) → `c52788c` (B6) →
`507def6` (B7). Handoff: `docs/setup/HANDOFF_2026-09-23b.md`.
