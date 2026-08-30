# PLAN 2026-08-29 — M257: audyt PR #87 i pętla jakości (sesja arena/01a04e98)

**Sesja:** `arena/01a04e98-mtg`. **Baza:** `main` @ `15a2be5` (squash PR #87).
**Prompt:** „kontynuujemy projekt” — brak nazwanego tematu → ADR 0021 (pętla
domyślna: PR → audyt poprzedniego PR → niedokończony plan → pętla jakości).
**Zasady:** ADR 0020 (PR na starcie, audyt przed kodowaniem, inkrementalne
commity, tylko przyrostowo — zakaz force push).

## Pomiar startowy

- `npm test` (szybki rdzeń): **3725/3725 pass** (~133 s).
- `npm run build`: OK, `dist/mtg-table.html` = **56 modułów / 2894.7 kB**.
- README (sekcja Status) podaje **2445/2445, 51 modułów / 2072 kB** i
  „138 wspieranych kart realnych” — **stare liczby** (drift dokumentacji;
  katalog po Batchu 51 = 478 kart). → znalezisko do naprawy w Etapie 1 (D1).
- `tmp-audyt-*` nie istnieje w drzewie (usunięte w PR #87, zgodnie z decyzją
  właściciela).

## Etap 1 — audyt PR #87 (ADR 0020 B / ADR 0016)

Zakres PR #87 (squash `15a2be5`, 303 pliki, +13 909/−98 250):
audyt PR #86 + A1 (strażnik L16), porządki `tmp-audyt-*` (205 plików),
**Batch 51 (8 kart, artId 572–579)**: bloodrush, renown, warunek MV,
`bounce_permanent`, `preventCombatDamageToController`,
`buff_attacking_creatures`; uwagi właściciela A–E (M254); M255 (5 napraw
pętli jakości); M256 (precyzja „trigger bez efektu”); L84–L91;
**ADR 0025** (benchmark pod budżetem meczów); reformat ADR-ów 0001–0024.

### Kroki

- [ ] **1.1** Przegląd diffa engine (`src/engine/*`, `src/cards/*`,
      `src/controllers/*`, `src/table/*`) po osi: poprawność vs CR, generyczność
      (ADR 0002 — zero warunków po nazwie/ID karty), spójność oferta↔walidacja
      (klasa L48/L90), dowiązania nowych deskryptorów (L84: EVENT_TYPES + opis,
      etykieta PL, wycena bota, `gameObjectDataOf`).
- [ ] **1.2** Weryfikacja 8 definicji kart vs pliki Oracle
      (`docs/cards/scryfall-*.json`): koszt, typy, P/T, `oracleText`,
      `artId`/`plan` (strażniki M66/M197), `support.limitations` puste (ADR 0022).
- [ ] **1.3** **Reformat ADR-ów 0001–0024** (978+/1013−, NIEOGŁOSZONY w opisie
      PR): porównanie semantyczne — czy żadna decyzja nie zmieniła znaczenia
      (reguła: nie edytuje się historii zaakceptowanego ADR tak, aby zmienić
      znaczenie). Wniosek do raportu: uzasadnić lub oznaczyć jako usterka
      procesowa (opis PR musiał wymienić oś).
- [ ] **1.4** Punkt (a) z handoffu 2026-08-28c: odporność `stripComments`/pina A1
      na inne kształty (np. `state.pendingX` w CIĄGU ZNAKOWYM, komentarze blokowe)
      — mutacje w `test/fingerprint-pending-decisions.test.js` (L61/L34).
- [ ] **1.5** Punkt (b) z handoffu: usunięcie 205 transkryptów nie odebrało
      dowodów cytowanych w raportach `docs/audits/*` (sprawdzone w poprzedniej
      sesji per plik — potwierdzić spotecznie) i strażnik
      `test/repo-artefakty-audytu.test.js` ma 3 żywe nogi (mutacje).
- [ ] **1.6** Weryfikacja mutacyjna RED→GREEN kluczowych nowych testów:
      `batch51-kart` (wybrać ≥3 mechaniki: bloodrush filtr, renown, MV),
      `m255-petla-jakosci` (F/G/A/E), `m256-zywy-tester-runda2` (H),
      `benchmark-budget-probki` + `benchmark-progress-watchdog` (ADR 0025),
      `m254-kolejnosc-pendingow` (klasa L90/L48).
- [ ] **1.7** Próba regresji bota: `npm run test:slow` (bot-benchmark 8 seedów)
      — zgodność z progi; wynik próby szybkiej vs `tools/b1-final-2026-08-29.*`
      (ADR 0025: pełna macierz pod budżetem, tylko na komendę — nie odpalam).
- [ ] **1.8** Naprawa u root cause potwierdzonych znalezisk:
      - **D1** README: „Bieżący stan” (liczba testów, moduły/kB) + liczba kart
        + sekcja „Talie” wg `decks/*.txt` (procedura ADR 0024);
      - **D2** brak handoffu końcowego sesji PR #87 (najnowszy `HANDOFF_2026-08-28c`
        opisuje stan PRZED Batchem 51/M255/M256) → uzupełnić jako część zamknięcia
        tej sesji (ADR 0013);
      - pozostałe: w miarę odkryć, każde z testem.
- [ ] **1.9** Raport `docs/audits/AUDYT_PR87_2026-08-29.md` + wynik do opisu PR.

## Etap 2 — pętla jakości (ADR 0021, jeśli Etap 1 wyczerpie się bez dużej naprawy)

- [ ] **2.1** Audyt Żywym Testerem z perspektywy gracza na następnym największym
      puli kart niewidzianych (po FR ~39/420 pozostało; pula = grep po
      `tools/collection-art-ids.csv` vs `artId` w `card-data.js` — największa
      niewidziana), profile `explorer/greedy/defensive/impatient/random`,
      osie z `TESTER_STOLU.md` (bezsensowne działania bota, kompletność
      logu/modalu, ptaszki auto-pass).
- [ ] **2.2** Znalezione klasy → naprawy u root cause + nowe detektory + testy.
- [ ] **2.3** Polowanie na niezgodności z CR inną ścieżką niż M256 (runda 2) —
      np. skan strukturalny (L11) rodziny mechanik dodanych w PR #87 albo
      przegląd RODZEŃSTWA (L72) efektów zbiorowych.
- [ ] **Nie** wymyślać nowego batcha kart (ADR 0021 pkt 4c).

## Ryzyka / pułapki

- Żywy Tester mierzy `dist/`, nie `src/` — `npm run build` po każdej zmianie
  (L76); `npm i` w `tools/table-tester` (izolacja sesji, ENVIRONMENT §1).
- Repo klonowane płytko — rozpakowane `--unshallow` (wykonano na starcie);
  audyt PR przez `git diff 6d04551 15a2be5 -- <ścieżki>`.
- Mutacje: kopia bazowa PRZED edycją, `git show` jako wersja bazowa (L8/L34);
  przy powtarzalnych wzorcach sprawdź, że mutujesz właściwe wystąpienie.
- Pełny B0 wyłącznie na komendę właściciela (ADR 0018/0025); szybki profil
  `node tools/benchmark.mjs` (~2–4 min) jest OK.
- `npm test` = szybki rdzeń; brama PR = `npm run test:all` (ADR 0019).
- Force push zakazany (ADR 0020 D); przed pushem `git log --oneline -3` +
  porównanie z `FETCH_HEAD`.
- `write_file` potrafi podwoić backslashe — pliki z takimi treściami przez
  `python3` (handoff 2026-08-28c).

## Kolejność commitów

1. (ten plik) PLAN + otwarcie PR (ADR 0020 A).
2. Audyt PR #87 → `docs/audits/AUDYT_PR87_2026-08-29.md` (commit dokumentacyjny).
3. Naprawy znalezisk audytu (każda osobno, zielona).
4. Pętla jakości (dopełniana w miarę pracy).
5. Zamknięcie: dziennik `PROJECT_HISTORY.md` + handoff sesji + opis PR.

## Podsumowanie wykonania

(do uzupełnienia na końcu sesji)
