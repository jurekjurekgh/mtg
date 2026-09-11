# Weryfikacja druków kart — kolekcja właściciela vs Scryfall (2026-09-12)

Zlecenie właściciela: „Sprawdź wszystkie inne karty czy nie ma odstępstw między setem z kolekcji,
a setem czytanym przez Scryfall”. Kontynuacja zgłoszenia A (Curiosity pokazywała druk JMP zamiast ISD).

## Zakres

* Katalog (`src/cards/card-data.js`): **509** kart.
* W arkuszu kolekcji (`tools/collection-art-ids.csv`, kolumna `Ilustracja` — set to jej **ostatnie znaki**):
  **465** kart; każda z nich ma pasujący wiersz arkusza (artId + set).
* Poza arkuszem: **44** wpisy syntetyczne (tokeny i ziemie podstawowe) — nie mają druku w kolekcji,
  więc nie podlegają weryfikacji.
* Snapshoty w `docs/cards/`: 458 (51 kart bez snapshotu = 44 syntetyczne + 7 prawdziwych).

## Metoda

**Krok 1 — łańcuch offline (bez sieci).** Dla każdej karty porównano:
`arkusz (CSV)` → `set` w katalogu → `set` w snapshocie → UUID z `image_uris.large` snapshotu
→ UUID z `imageUri` katalogu → `source` snapshotu (`set=` / `/cards/<uuid>` / wyszukiwanie z `set:`).
Jeżeli cały łańcuch jest spójny, obraz w aplikacji pochodzi z druku zapisanego w snapshocie,
a snapshot pochodzi z pobrania ograniczonego do setu z arkusza — odstępstwo jest wtedy wykluczone.
Wynik: **455** kart z potwierdzonym offline UUID obrazu.

**Krok 2 — pobranie ze Scryfall.** Dla kart bez prowiniencji offline (brak snapshotu, snapshot bez
`image_uris`, snapshot składany ręcznie bez `source`) pobrano rekord **po UUID obrazu z katalogu**
(`https://api.scryfall.com/cards/<uuid>`) i odczytano `set`, `set_name`, `collector_number`.
To odpowiada wprost na pytanie „jaki druk czyta Scryfall z tego obrazu”.
Pobrano **33 rekordy po UUID** (pokrywają 37 wpisów kart — 4 karty dwustronne sprawdzono z obu stron)
plus **1 wyszukiwanie wsadowe** na 4 karty bez snapshotu obrazu (`jeskai-devotee`, `civilized-scholar`,
`homicidal-brute`, `battle-rattle-shaman`); razem **41 wpisów kart**. `curl`/`fetch` z piaskownicy są
zablokowane, więc użyto `fetch_page` (zgodę na pobieranie ze Scryfall wydał właściciel 2026-09-12).

## Wynik: odstępstwa znalezione i poprawione

| Karta | Było (obraz/set w aplikacji) | Powinno być (arkusz) | Poprawka |
| --- | --- | --- | --- |
| `curiosity` | obraz JMP #147 (`c5a0be10`) | ISD #49 | `imageUri` → `b212c36a`, snapshot przepisany set-aware |
| `expunge` | obraz VMA (`1b4650f3`) | USG #135 | `imageUri` → `0576ffe8` |
| `welder-automaton` | obraz GNT (`938066de`) | AER #183 | `imageUri` → `88b5bae4` |
| `enter-the-enigma` | `set: 'MKM'` w katalogu | DSK #52 (jedyny druk) | `set` → `'DSK'` (obraz był poprawny) |
| `angelic-benediction` | obraz DVD #19 (`a2a782a3`) | ALA #3 | `imageUri` → `dd1b9071`, snapshot: `collector_number` 9 → 3 |
| `fireball` | obraz CLB #175 (`df45a43e`) | JVC #56 | `imageUri` → `dcbdc3be`, snapshot: `set_name` „Jumpstart 2025” → „Duel Decks Anthology: Jace vs. Chandra”, `collector_number` 214 → 56 |
| `spread-the-sickness` | obraz MM2 #98 (`003bc8f1`) | MBS #56 | `imageUri` → `de42a771`, snapshot: `collector_number` 58 → 56 |
| `cogwork-assembler` | `set: '2XM'` + obraz 2XM #242 (`e4bfde3f`) | AER #145 | `set` → `'AER'`, `imageUri` → `6dddacdd` |
| `shivs-embrace` | obraz M14 #153 (`8a42fcd6`) | M11 #156 (`set` w katalogu już był M11) | `imageUri` → `386bfe05`, snapshot m14 → m11 |

Wspólny mechanizm wszystkich pięciu nowych przypadków: snapshot był **składany ręcznie bez pola
`source`**, więc nikt nie zapisywał, skąd pochodzi obraz — a obraz brano z pierwszego/domyślnego
druku nazwy (Curiosity: JMP, Angelic Benediction i Fireball: Duel Decks Anthology,
Spread the Sickness: Modern Masters 2015, Cogwork Assembler: Double Masters).
Set w katalogu był przy tym zwykle poprawny (wyjątki: `cogwork-assembler`, `enter-the-enigma`),
dlatego rozjazd było widać dopiero w warstwie ilustracji.

Dodatkowo: `JVC` w arkuszu to **Duel Decks Anthology: Jace vs. Chandra** (Scryfall `sets/jvc`),
a nie „Jumpstart 2025”, jak twierdził snapshot `fireball` — nazwa setu była zmyślona przy ręcznym
składaniu. Kolumna `Plan` w CSV to nazwa planu właściciela (np. „Warhammer Fantasy”), nie set.

## Odstępstwa udokumentowane (`uwaga`) — decyzja właściciela

| Karta | Arkusz | Katalog/obraz | Stan |
| --- | --- | --- | --- |
| `ethersworn-shieldmage` | `536CON` | ARB | Właściciel potwierdził (2026-08-05), że `CON` w arkuszu to skrót płaszczyzny Alara, a karta to druk ARB. Bez zmian. |
| `jwari-shapeshifter` | `227ROE` | WWK | Scryfall: `named?exact=Jwari+Shapeshifter&set=roe` → 404 „No cards found” (w ROE takiej karty nie ma); katalog i obraz niosą WWK. Kod setu w arkuszu wymaga potwierdzenia właściciela. |

## Tabela weryfikacji online (krok 2)

Set z arkusza = set odczytany ze Scryfall dla UUID obrazu z katalogu. „ODSTĘPSTWO” = poprawione (patrz wyżej).

| Karta | Nazwa wg Scryfall | Arkusz | Scryfall | Nr | UUID obrazu | Werdykt |
| --- | --- | --- | --- | --- | --- | --- |
| `grizzled-outcasts` | Grizzled Outcasts // Krallenhorde Wantons | ISD | ISD | 185 | 4b43b0cb | OK |
| `krallenhorde-wantons` | Grizzled Outcasts // Krallenhorde Wantons (rewers) | ISD | ISD | 185 | 4b43b0cb | OK |
| `scorned-villager` | Scorned Villager // Moonscarred Werewolf | DKA | DKA | 125 | 6f35e364 | OK |
| `moonscarred-werewolf` | Scorned Villager // Moonscarred Werewolf (rewers) | DKA | DKA | 125 | 6f35e364 | OK |
| `guidestone-compass` | Lodestone Needle // Guidestone Compass (rewers) | LCI | LCI | 62 | dedd7a22 | OK |
| `jill-shivas-dominant` | Jill, Shiva's Dominant // Shiva, Warden of Ice | FIN | FIN | 58 | 1f163763 | OK |
| `shiva-warden-of-ice` | Jill, Shiva's Dominant // Shiva, Warden of Ice (rewers) | FIN | FIN | 58 | 1f163763 | OK |
| `jeskai-devotee` | Jeskai Devotee | TDM | TDM | 110 | 27f31f9c | OK |
| `high-stride` | High Stride | BLB | BLB | 176 | 09c8cf4b | OK |
| `inspiration` | Inspiration | 8ED | 8ED | 85 | be039716 | OK |
| `minotaur-abomination` | Minotaur Abomination | M14 | M14 | 107 | 9dca75a1 | OK |
| `guildsworn-prowler` | Guildsworn Prowler | CLB | CLB | 130 | d7efb10f | OK |
| `giant-spider` | Giant Spider | M19 | M19 | 183 | 80996b0d | OK |
| `scroll-thief` | Scroll Thief | M13 | M13 | 66 | dc201a82 | OK |
| `force-away` | Force Away | KTK | KTK | 40 | dda70b3e | OK |
| `civilized-scholar` | Civilized Scholar // Homicidal Brute | ISD | ISD | 47 | 7bf864db | OK |
| `homicidal-brute` | Civilized Scholar // Homicidal Brute (rewers) | ISD | ISD | 47 | 7bf864db | OK |
| `battle-rattle-shaman` | Battle-Rattle Shaman | M21 | M21 | 130 | faca827d | OK |
| `silumgar-butcher` | Silumgar Butcher | DTK | DTK | 122 | 40cb67f7 | OK |
| `relic-robber` | Relic Robber | ZNR | ZNR | 153 | 4540205c | OK |
| `flurry-of-wings` | Flurry of Wings | ARB | ARB | 127 | dbabaf1d | OK |
| `expose-to-daylight` | Expose to Daylight | RNA | RNA | 8 | 094c2ac3 | OK |
| `etherium-abomination` | Etherium Abomination | ARB | ARB | 20 | 312bbd63 | OK |
| `awaken-the-bear` | Awaken the Bear | KTK | KTK | 129 | 803a6ac7 | OK |
| `security-rhox` | Security Rhox | SNC | SNC | 220 | 0050dd40 | OK |
| `dreams-of-steel-and-oil` | Dreams of Steel and Oil | BRO | BRO | 92 | 261ac92e | OK |
| `tenth-district-veteran` | Tenth District Veteran | RNA | RNA | 26 | ef573e92 | OK |
| `mournful-zombie` | Mournful Zombie | APC | APC | 43 | 9ba12fb1 | OK |
| `necrosquito` | Necrosquito | ONE | ONE | 100 | 72af72d2 | OK |
| `veiled-ascension` | Veiled Ascension | MKC | MKC | 18 | 5196eb5b | OK |
| `angelic-benediction` | Angelic Benediction | ALA | ALA | 3 | dd1b9071 | ODSTĘPSTWO — było dvd #19 |
| `frontline-war-rager` | Frontline War-Rager | EOE | EOE | 134 | fa232943 | OK |
| `lash-of-the-balrog` | Lash of the Balrog | LTR | LTR | 92 | 812fee97 | OK |
| `fireball` | Fireball | JVC | JVC | 56 | dcbdc3be | ODSTĘPSTWO — było clb #175 |
| `spread-the-sickness` | Spread the Sickness | MBS | MBS | 56 | de42a771 | ODSTĘPSTWO — było mm2 #98 |
| `warmaker-gunship` | Warmaker Gunship | EOE | EOE | 167 | 9e5957f4 | OK |
| `ballista-wielder` | Ballista Watcher // Ballista Wielder (rewers) | VOW | VOW | 143 | 63d96c52 | OK |
| `dire-strain-brawler` | Tireless Hauler // Dire-Strain Brawler (rewers) | MID | MID | 203 | 3e96f9a6 | OK |
| `balamb-garden-airborne` | Balamb Garden, SeeD Academy // Balamb Garden, Airborne (rewers) | FIN | FIN | 272 | 001e9f20 | OK |
| `cogwork-assembler` | Cogwork Assembler | AER | AER | 145 | 6dddacdd | ODSTĘPSTWO — było 2xm #242 |
| `shivs-embrace` | Shiv's Embrace | M11 | M11 | 156 | 386bfe05 | ODSTĘPSTWO — było m14 #153 |

## Stan po poprawkach (do odtworzenia offline)

`node tools/check-card-printings.mjs` — kod wyjścia 0, rozjazdy tylko udokumentowane:

* UUID obrazu potwierdzony offline (snapshot = katalog): **455** kart.
* Klasy prowiniencji snapshotów: `source` z `set=` — **348**; `source` z UUID karty — **32**;
  wyszukiwanie z `oracleid`/`set:` — **21**; surowa odpowiedź API bez `source` (set zgodny
  z arkuszem) — **13**; `source` tylko z nazwą, bez `set=` — **44**; brak snapshotu — **51**
  (44 tokeny/ziemie podstawowe + 7 kart zweryfikowanych w kroku 2).
* Rozjazdy katalog ↔ arkusz: **2**, oba z `uwaga` (`ethersworn-shieldmage`, `jwari-shapeshifter`).
* Zapadnia `test/fixtures/druki-kart-zapadnia.json`: `bezSetu` 46 → **44**, `bezZrodla` 42 → **13**,
  `uwagaSet` 4 → **2**. Listy mają tylko maleć.

## Co z tego wynika na przyszłość

1. `docs/cards/HOW_TO_ADD_CARD.md`: pobranie **jednego** rekordu set-aware
   (`cards/named?exact=…&set=…`) — bez `set=` Scryfall zwraca druk domyślny.
2. Każdy snapshot ma mieć `source`; snapshoty składane ręcznie dostały `source` i
   `zweryfikowano` (26 plików) — `test/fixtures/druki-kart-zapadnia.json` pilnuje, żeby listy
   `bezSetu` (44) i `bezZrodla` (13) już nie rosły.
3. Powtórzenie przeglądu offline: `node tools/check-card-printings.mjs` (raport spójności
   arkusz ↔ katalog ↔ snapshot ↔ obraz; krok 2 wymaga sieci i jest ręczny).
