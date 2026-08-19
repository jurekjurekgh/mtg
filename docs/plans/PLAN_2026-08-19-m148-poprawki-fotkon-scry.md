# PLAN sesji M148 — poprawki uwag właściciela (FOT/KON hover + scry/surveil kolejność)

Gałąź: `arena/01a01a7b-mtg` (kontynuacja sesji M147, PR #65).

## Uwagi właściciela (2026-08-19)

1. **FOT/KON hover (desktop).** W trybach FOT i KON po najechaniu na karty
   basic lądów, kart specjalnych i tokenów pokazuje się syntetyczny rysunek.
   W legacy (`card_viewer_12_10_for_Github.html`) hover nad kartami
   NIEobsługującymi tych torów NIE MA nic pokazywać; ilustracja z `./img/`
   pojawia się tylko dla kart, które taki tor mają. Trzeci raz — trzeba zrobić
   dobrze.

2. **Scry / Surveil — kolejność na wierzchu.** „...then put any number of them
   on the bottom and the rest on top in any order” — gracz ma móc wybrać
   KOLEJNOŚĆ kart na wierzchu (np. przy 2 kartach która pierwsza, która druga).
   Dziś modal pozwala tylko spód/top. Analogicznie surveil.

## Rozpoznanie (fakty z kodu)

- Zbadaj: jak legacy przechowuje FOT/KON (`./img/<artId>FOT.png`/`KON.png`),
  co decyduje o dostępności toru, co robi hover w `src/table/`.
- Zbadaj: `scry`/`surveil` — pending, oferty, wizard kolejności (Index/Stomping
  Slabs już robią „any order”?).

## Kryteria ukończenia (commit po commit, zielone: `npm test` + `npm run build`)

- [x] FOT/KON: hover nad kartą bez wsparcia toru → NIC; ze wsparciem → `./img/`.
      Zgodne z legacy. Test (render.js + table-card-art).
- [x] Scry: gracz wybiera kolejność na wierzchu (2+ kart). Test
      (game-state resolve_scry topOrder + choice-request wizard + scry-order-m148).
- [x] Surveil: analogicznie kolejność reszty na wierzchu (już istniało, zweryfikowane).
- [ ] `npm run test:all` zielony; push; CI zielony.

## Ryzyka / pułapki

- Zablokowany egress HTTPS — brak nowych pobrań z sieci.
- Polskie znaki w edycji przez `python3` + `pathlib`.
- Polityka seedy testów (L25) przy zmianie przepływu decyzji.
