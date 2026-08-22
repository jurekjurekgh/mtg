# PLAN 2026-08-22 — M178: rewolucja talii (talie per PLAN, worki, singleton, landy 1:2)

Zlecenie właściciela: usunąć WSZYSTKIE dotychczasowe talie (asymetria 30–70
kart przez praktykę „nowe karty tylko do tokens/ostrza/graveyard” — zamrożone
seedy 5 testów); zbudować ~10 talii wg PLANów (jednoplanowe gdy stać plan na
talię, małe plany łączone w „worki”), KAŻDA wspierana karta w jakiejś talii,
singleton, basic landy 1:2 dobrane do kolorów; naprawić testy i benchmark;
przeredagować ADR-y/LESSONS pod przyszłe batche.

## Inwentarz (343 wspierane karty, 38 planów)

Po uzupełnieniu 11 kart bez pola `plan` (plan JEST w tools/collection-art-ids.csv
— fix danych): Innistrad 31, Tarkir 28, Mirrodin 28, Dominaria 27, Warhammer
Fantasy 22, Wiedźmin 19 (+Świat Wiedźmina 1), Alara 18, Forgotten Realms 17,
Zendikar 17, Ravnica 17, Theros 12, Śródziemie 11, Final Fantasy 11, Ixalan 10,
The Edge 9, Kaladesh 9, Eldraine 8, Lorwyn 7, Bloomburrow 6, Thunder Junction 5,
Duskmourn 5, New Capenna 4, Kamigawa 3, Shandalar 3, Kaldheim 2, Ikoria 2,
Amonkhet 2, single (10): Arcavios, Moag, Rath, Core, Commander, Modern
Horizons, Rabiah, Phyrexia, Muraganda.

## Projekt talii (14: 10 jednoplanowych + 4 worki)

Próg talii jednoplanowej (doprecyzowanie właściciela): **≥15 kart
nielandowych** — każdy plan z 15+ kartami MA własną talię, mniejsze plany
idą do worków. (Obecnie największy plan poniżej progu to Theros 12, więc
skład talii jak niżej.) Walidator: singleton, min 15 nielandów; landy =
ceil(nieland/2), kolory landów proporcjonalnie do pipów kosztów many,
każdy kolor z ≥1 pipem dostaje ≥1 land.

1. `innistrad.txt` (31), 2. `tarkir.txt` (28), 3. `mirrodin.txt` (28),
4. `dominaria.txt` (27), 5. `warhammer.txt` (22), 6. `wiedzmin.txt`
(Wiedźmin + Świat Wiedźmina = 20), 7. `alara.txt` (18),
8. `forgotten-realms.txt` (17), 9. `zendikar.txt` (17), 10. `ravnica.txt` (17),
11. `worek-basni.txt` (Eldraine, Lorwyn, Bloomburrow, Kamigawa, Moag, Core,
Commander, Modern Horizons = 28), 12. `worek-legend.txt` (Theros, Śródziemie,
Amonkhet, Shandalar, Rabiah, Rath, Arcavios = 31), 13. `worek-dziki.txt`
(Ixalan, Kaladesh, The Edge, Thunder Junction, Muraganda = 34),
14. `worek-mroczny.txt` (Final Fantasy, Duskmourn, New Capenna, Kaldheim,
Ikoria, Phyrexia = 25).

Nagłówek każdego pliku talii wylicza PLANY, które obsługuje (przyszłe
batche: karta idzie do talii swojego planu; nowy plan → przydział do worka
wg motywu i najmniejszej talii).

## Kroki

- [ ] 1. Plan (ten plik) + fix 11 brakujących pól `plan` w card-data — commit.
- [ ] 2. Generator talii (tools/generate-plan-decks.mjs, deterministyczny) +
  14 nowych talii + usunięcie 12 starych + aktualizacja repo-decks.test — commit.
- [ ] 3. Triage `npm test`: naprawa testów po plikach/klasach (fixtury talii,
  zamrożone seedy — hunter L25) — commity partiami.
- [ ] 4. bot-benchmark: zamiast pełnej macierzy par talii — STAŁA próbka
  kilku par (doprecyzowanie właściciela: bez wszystkich kombinacji i 100k
  meczów; różnorodność kolorów/stylów, deterministyczna); rekalibracja
  progów — commit.
- [ ] 5. ADR 0023 (polityka talii per plan + worki + zasady przyszłych
  batchów), LESSONS, PROJECT_STATE, opis PR — commit.
- [ ] 6. test:all + build + push + CI.

## Wynik

(uzupełnić po wykonaniu)
