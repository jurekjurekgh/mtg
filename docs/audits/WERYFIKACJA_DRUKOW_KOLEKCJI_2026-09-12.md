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

## 6. Co zostało poza tym zamknięciem

- **E-source-wyszukiwanie: 21 kart.** Ich `source` ma kwalifikator setu, więc ratchet je uznaje, ale
  forma jest słabsza niż `/cards/<id>`. Zacieśnienie do postaci kanonicznej jest możliwe tą samą
  metodą (UUID z `image_uris`) — to decyzja właściciela, nie wykonano jej bez zlecenia.
- **brak-snapshotu: 51 kart**, z czego 44 są poza arkuszem (tokeny i ziemie bazowe — nie mają druku
  do udowodnienia), a **7** to karty z kolekcji wymagające pobrania z sieci: `krallenhorde-wantons` (ISD),
  `guidestone-compass` (LCI), `shiva-warden-of-ice` (FIN), `homicidal-brute` (ISD), `ballista-wielder`
  (VOW), `dire-strain-brawler` (MID), `balamb-garden-airborne` (FIN). Sieć w tym środowisku jest
  niedostępna dla `curl`/`node`, a `fetch_page` od awarii proxy zwraca `SignatureDoesNotMatch`, więc
  pozostają otwarte. Adresy są już wyprowadzone z `imageUri` katalogu (do pobrania i porównania
  `set` odpowiedzi z arkuszem — to dokładnie ta sama weryfikacja, która wykryła przypadek Curiosity):

  ```text
  krallenhorde-wantons    ISD  https://api.scryfall.com/cards/4b43b0cb-a5a3-47b4-9b6b-9d2638222bb6
  guidestone-compass      LCI  https://api.scryfall.com/cards/dedd7a22-92e2-41fd-aa80-944c69653a5e
  shiva-warden-of-ice     FIN  https://api.scryfall.com/cards/1f163763-4802-4a96-a5bc-f3c381db7b5c
  homicidal-brute         ISD  https://api.scryfall.com/cards/7bf864db-4754-433d-9d77-6695f78f6c09
  ballista-wielder        VOW  https://api.scryfall.com/cards/63d96c52-66ce-4b46-9a0b-7cd9a43f9253
  dire-strain-brawler     MID  https://api.scryfall.com/cards/3e96f9a6-c215-42b1-aa02-8e6143fe5bd7
  balamb-garden-airborne  FIN  https://api.scryfall.com/cards/001e9f20-5b15-41cb-bf82-46172decc235
  ```
- **ROZJAZD 1: `ethersworn-shieldmage`** — arkusz `536CON` vs katalog `ARB`. Udokumentowane polem
  `uwaga` w snapshocie; właściciel potwierdził (2026-08-05) druk ARB, a `CON` w CSV to skrót planu
  Alara, nie kod setu. Bez zmian.

## 7. Odtworzenie pomiaru

```bash
node tools/check-card-printings.mjs                     # klasy prowieniencji + rozjazdy
node --test test/zgloszenie-a-druk-karty-z-arkusza.test.js   # ratchet (6/6)
npm test                                                 # cały pakiet
```
