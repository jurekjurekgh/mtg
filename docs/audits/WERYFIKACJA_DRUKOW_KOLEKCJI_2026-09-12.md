# Weryfikacja druków kolekcji — zamknięcie zapadni A (56 snapshotów)

Data pomiaru: 2026-09-12. Stan wyjściowy: HEAD `582ffbe`. Narzędzie: `node tools/check-card-printings.mjs`.
Ratchet: `test/zgloszenie-a-druk-karty-z-arkusza.test.js` + `test/fixtures/druki-kart-zapadnia.json`.

## 1. Czym była zapadnia A

Ratchet klasyfikuje `source` każdego snapshotu w `docs/cards/scryfall-*.json`: adres jest **set-aware**,
gdy ma postać `/cards/<uuid>`, albo parametr `[?&]set=`, albo `oracleid`/`%3A`. Snapshot z adresem
wyszukiwania po samej nazwie nie dowodzi, że pobrano druk z kolekcji właściciela (ten sam tekst karty
ma wiele druków). Przed naprawą fixture wyliczał **43** takie karty (`bezSetu`) i **13** bez pola
`source` w ogóle (`bezZrodla`), razem **56**, plus **1** pozycję `uwagaSet` do ręcznego przeglądu.

## 2. Reguła naprawy (dwa przypadki, żadnego zgadywania)

Każdy z 56 plików trafił do dokładnie jednego przypadku:

- **Przypadek 1 — 13 plików (dawne `bezZrodla`).** Są to surowe odpowiedzi Scryfall, które mają
  własne pola `id` i `uri`, przy czym `uri == https://api.scryfall.com/cards/<id>` oraz `id` jest
  tym samym UUID, który występuje w `image_uris` (warunek sprawdzony dla wszystkich 13 przed zapisem).
  `source` ustawiono na **kopię własnego `uri`** — nie odtwarzano niczego, dowód leży w tym samym pliku.
  Bez dodatkowej adnotacji.
- **Przypadek 2 — 43 pliki (dawne `bezSetu`).** `source` był adresem wyszukiwania (np.
  `search?q=!"Name"+e:2xm` bez `%3A`, albo `cards/named?exact=Name`). Nowy `source` to
  `https://api.scryfall.com/cards/<UUID>`, gdzie UUID odczytano z `image_uris.large`/`normal` tego
  snapshotu. Ponieważ jest to **odtworzenie**, a nie oryginalny adres pobrania, każdy taki plik dostał
  klucz `proweniencja` z: datą, metodą, stwierdzeniem zgodności setu z arkuszem kolekcji oraz
  **poprzednim adresem** (historia nie ginie).

Skrypt walidował wszystkie 56 zmian przed zapisem któregokolwiek pliku (JSON poprawny, `source` równy
oczekiwanemu, brak zmian poza `source`/`proweniencja`); przy jakimkolwiek błędzie nie zapisywał nic.

## 3. Cross-check offline (wszystkie 56)

- set snapshotu == set z arkusza kolekcji `tools/collection-art-ids.csv` (porównanie bez względu na
  wielkość liter — `2XM` w arkuszu i `2xm` w snapshocie to **zgodność**, nie rozjazd);
- UUID z `image_uris` snapshotu == UUID w `imageUri` katalogu (`src/cards/card-data.js`);
- obecne `name`, `set`, `collector_number`.

Wynik: **56/56 zgodne, 0 rozjazdów, 0 kart z polem `uwaga` w tej grupie.**

## 4. Zakres weryfikacji online (uczciwie)

- **Sprawdzone w sieci: 1 karta.** `https://api.scryfall.com/cards/e13026a8-7e3c-45b2-9838-080f14ae4b29`
  zwróciło: `name` = „Apprentice Wizard”, `set` = `2xm`, `collector_number` = `40`, `id` i UUID w
  `image_uris.large` identyczne z użytym w adresie, a pole `uri` odpowiedzi równe adreśowi — czyli
  dokładnie ten druk, który jest w arkuszu (`2XM`) i w snapshocie. To potwierdza **schemat** adresu
  `/cards/<id>` i to, że UUID obrazu jest identyfikatorem karty.
- **Nie sprawdzono w sieci: pozostałych 55.** Kolejne pobrania przerwała awaria proxy środowiska
  (`SignatureDoesNotMatch` dwa razy z rzędu), więc nie ponawiano. Te 55 opiera się na cross-checku
  offline (sekcja 3), a 13 z nich dodatkowo na własnym `uri` w pliku. **Nie twierdzę, że każdy z 56
  adresów zweryfikowano online.**

## 5. Pomiar przed / po (`node tools/check-card-printings.mjs`)

| klasa prowiniencji | przed (`582ffbe`) | po |
| --- | --- | --- |
| A-source-set-aware | 349 | 349 |
| B-source-uuid-spójny | 32 | **88** |
| C-bez-source-surowa-odpowiedz | **13** | **0** (klasa zniknęła) |
| E-source-wyszukiwanie | 21 | 21 |
| F-source-bez-set | **43** | **0** (klasa zniknęła) |
| brak-snapshotu | 51 | 51 |

Klasy problemowe C i F zniknęły; 56 kart przeszło do klasy B (adres z UUID spójnym z obrazem).
Ratchet po naprawie: `bezSetu 0`, `bezZrodla 0`, `uwagaSet 1`; `node --test
test/zgloszenie-a-druk-karty-z-arkusza.test.js` → **6 pass / 0 fail**.

## 6. Stan końcowy po drugim etapie (2026-09-12, `3821187`)

Punkt „co zostało" z pierwszego etapu został zamknięty na zlecenie właściciela
(„zrób teraz to co proponujesz — 21 klasy E") oraz po jego wskazówce, że siedem kart
„do pobrania" to drugie strony kart dwustronnych.

| klasa / pozycja | po etapie 1 (`c0a1908`) | po etapie 2 (`3821187`) |
| --- | --- | --- |
| A-source-set-aware | 349 | 349 |
| B-source-uuid-spójny | 88 | **110** |
| B2-druga-strona-pokryta-snapshotem | — (klasy nie było) | **7** |
| C-bez-source-surowa-odpowiedz | 0 | 0 |
| D-bez-source-reczny | 0 | 0 |
| E-source-wyszukiwanie | 21 | **0** |
| F-source-bez-set | 0 | 0 |
| B-source-uuid-ROZJAZD | 0 | 0 |
| brak-snapshotu | 51 | **43** (wszystkie poza arkuszem) |
| DO POBRANIA ZE SCRYFALL | 7 | **0** |
| UUID obrazu potwierdzony offline | 455 | **458** |
| ROZJAZDY | 1 (udokumentowany `uwaga`) | 1 (ten sam) |

Rozjazd `ethersworn-shieldmage` (arkusz `536CON` vs katalog `ARB`) pozostaje jedynym
i jest udokumentowany polem `uwaga` — właściciel potwierdził druk ARB (2026-08-05),
a `CON` w CSV to skrót płaszczyzny Alara, nie kod setu.

Poza klasami zostaje jedna sierota: `docs/cards/scryfall-undercity-dungeon.json` —
snapshot „Undercity // The Initiative" (tclb) dla karty, której NIE ma w rejestrze
kart (silnik tworzy dungeon dynamicznie jako `undercity`, `src/engine/effects.js`).
Plik ma kanoniczne `source`, więc nie psuje żadnej klasy; pilnuje go test D/14, żeby
nowe sieroty nie pojawiały się cicho.

## 7. Drugi etap — metoda i pomiary

**7.1 Klasa E → 0 (21 snapshotów).** Wszystkie 21 miały `source` wyszukiwania
z zakodowanym setem (`oracleid`/`%3A`) — set-aware wg ratcheta, ale bez adresu jednej
karty. Przed zapisem zmierzone dla każdego: UUID obrazu == `imageUri` katalogu, set
snapshotu == set z arkusza, obecne `name`/`set`/`collector_number`. Wyjątki:
`scorned-villager` (transform — UUID z `card_faces[0].image_uris`, równy `imageUri`
obu twarzy katalogu) oraz `ethersworn-shieldmage` (rozjazd setu udokumentowany `uwaga`
— zaakceptowany świadomie, nie po cichu). Każdy plik dostał `source = /cards/<UUID>`
i klucz `proweniencja` z metodą oraz POPRZEDNIM adresem.

**7.2 Drugie strony kart dwustronnych (7) — decyzja: bez osobnych snapshotów.**
Pomiar: dla każdej z siedmiu kart katalogowe `imageUri` niesie TEN SAM UUID co
`imageUri` przedniej twarzy, snapshot przedniej twarzy ma `layout: transform` i nazwę
tylnej twarzy w `card_faces`, a arkusz kolekcji daje obu twarzom ten sam `artId`+set
(`krallenhorde-wantons`/`grizzled-outcasts` = 486ISD, `guidestone-compass`/
`lodestone-needle` = 484LCI, `shiva-warden-of-ice`/`jill-shivas-dominant` = 527FIN,
`homicidal-brute`/`civilized-scholar` = 180ISD, `ballista-wielder`/`ballista-watcher`
= 505VOW, `dire-strain-brawler`/`tireless-hauler` = 118MID, `balamb-garden-airborne`/
`balamb-garden-seed-academy` = 153FIN). Scryfall opisuje transform jako JEDEN obiekt
karty (jedno `id`, obie twarze w `card_faces`), więc drugi snapshot byłby duplikatem
tych samych bajtów i drugim źródłem prawdy dla jednego druku. Zamiast tego narzędzie
klasyfikuje je jako `B2-druga-strona-pokryta-snapshotem` i NIE umieszcza na liście
„DO POBRANIA". Warunek pokrycia jest mierzalny, nie zgadywany: nazwa karty musi być
twarzą snapshotu „brata" — samo współdzielenie UUID nie wystarcza (przypadek ujemny
z danych: `token_rat` dzieli UUID z `lab-rats`, a jego twarzą nie jest; test D/6).

**7.3 Trzy przyczyny źródłowe znalezione przy tej okazji.**
1. UUID obrazu był czytany tylko z `image_uris.large`, a karty dwustronne trzymają
   obrazy przy twarzach — 3 snapshoty (`scorned-villager`, `grizzled-outcasts`,
   `jill-shivas-dominant`) nie potwierdzały druku offline, a po zacieśnieniu `source`
   narzędzie zgłosiło FAŁSZYWY `B-source-uuid-ROZJAZD`. Helper `uuidObrazuSnapshotu`
   z zapasowym odczytem z `card_faces[0]` (potwierdzone offline 455 → 458).
2. Porównanie setu snapshotu z katalogiem działało bezwarunkowo, a 44 wpisy
   syntetyczne (tokeny, ziemie bazowe) mają w katalogu `set: null` — po ujawnieniu
   snapshotu tokena Tarmogoyf pojawił się fałszywy rozjazd `tm3c vs null`. Teraz
   porównujemy tylko gdy obie strony mają set (tak samo jak przy arkuszu); różnica
   przy obu obecnych nadal jest rozjazdem (test D/15 z mutacją).
3. Ratchet miał WŁASNE kopie `uuidOf`/`sourceUuid`/`sourceSet` i czytał UUID tylko
   z `image_uris.large` — dryf dwóch implementacji (klasa F7/L41) sprawiał, że test
   i narzędzie różnie widziały transformy. Teraz ratchet importuje helpery z narzędzia,
   a narzędzie ma eksporty + main-guard i czystą funkcję `przegladDrukow`.

**7.4 Nazwa pliku niezgodna z konwencją.** Snapshot tokena Tarmogoyf leżał jako
`scryfall-token-tarmogoyf.json` (myślnik) przy id `token_tarmogoyf` (podkreślenie),
więc przegląd widział tę kartę jako „brak snapshotu". `git mv` na nazwę zgodną z id,
ścieżka w `test/real-cards-batch21.test.js` zaktualizowana, `source` tokena zacieśnione
do `/cards/<UUID>` (UUID równy `imageUri` katalogu).

**7.5 Zakres weryfikacji online — bez zmian i bez upiększeń.** W sieci potwierdzono
JEDEN adres (Apprentice Wizard, `2xm` nr 40 — patrz sekcja 4). Zacieśnienia klasy E
i klasy B2 opierają się na cross-checku offline (arkusz kolekcji + `imageUri` katalogu
+ pola snapshotu) oraz — dla 13 plików z etapu 1 i surowych odpowiedzi — na własnym
polu `uri`. Kolejne pobrania przerwała awaria proxy środowiska (`SignatureDoesNotMatch`).

**7.6 Testy.** Nowy `test/druki-druga-strona-i-uuid-obrazu.test.js` (D/1–D/15):
UUID z `card_faces`, wszystkie 7 par druga-twarz ← snapshot, przypadek ujemny
`token_rat`, mutacja (snapshot „brata" bez `card_faces` → brak pokrycia), klasy
problemowe puste, `DO POBRANIA` 0, jedyny rozjazd udokumentowany, konwencja nazw
plików i sierota `undercity-dungeon`, reguła `set: null` z mutacją w drugą stronę.
Ratchet rozszerzony o A/7 (reguły porównania: token z `set=null` i transform bez
`image_uris`). `npm test` **5255/5255**.

## 8. Odtworzenie pomiaru

```bash
node tools/check-card-printings.mjs                            # klasy prowieniencji, B2, rozjazdy
node --test test/zgloszenie-a-druk-karty-z-arkusza.test.js      # ratchet druków (7/7)
node --test test/druki-druga-strona-i-uuid-obrazu.test.js       # D/1–D/15
node --test test/w3-wizard-podzialu-blokera-ui.test.js          # B/1–B/7 (wizard blokera)
npm test                                                        # cały pakiet (5255/5255)
```
