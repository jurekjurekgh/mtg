# AUDYT ŻYWYM TESTEREM E6 (2026-09-12) — pętla jakości PR #114: 6 partii na świeżym `dist/`, 1 znalezisko silnikowo-językowe (tokeny mechanik) + 1 UI (wizard trample po W5), oba naprawione

**Sesja:** `arena/01a0925f-mtg` (PR #114). **Etap:** E6 planu
`docs/plans/PLAN_2026-09-11b-audyt-pr113-wyzwanie-3-5.md` (ADR 0021 §4a —
pętla jakości po zmianach reguł W3/W4/W5).

**Baza:** `abd19d6` (po W5 `fa52619`). Bramy przed audytem: `npm test`
5193/5193, `npm run build` 61 modułów / 3522,1 kB, quick benchmark 84,2%
(566/672). Artefakt `dist/mtg-table.html` przebudowany przed każdą serią
(L76: Żywy Tester mierzy `dist/`, nie `src/`).

## Metoda

- 6 partii człowiek-vs-bot, `tools/table-tester` (jsdom na prawdziwym artefakcie),
  300 kroków, `--snapshot-every 25`; talie spoza jednej rodziny i profile
  różne od siebie (greedy ×2, explorer, defensive, impatient, hoarder).
- Lektura **ręczna** wzdłuż trzech osi z `docs/setup/TESTER_STOLU.md`
  (decyzja właściciela 2026-08-14): (1) bezsensowne działania bota,
  (2) zdarzenia niewidzialne/nieczytelne dla gracza, (3) ptaszki wyciszenia
  auto-pass. L27: zero zgłoszeń detektorów to pomiar NARZĘDZIA, nie produktu.
- Transkrypty poza repo, w `tmp-audyt-e6-2026-09-12/` (konwencja M239/M253 —
  `.gitignore` obejmuje `tmp-audyt-*/`; decyzja właściciela 2026-08-28:
  transkrypt to artefakt audytu, nie treść repo).

## Wynik macierzy

| partia | talie (gracz ↔ bot) | seed | profil | wynik | detektory | akcje UI (widziane/kliknięte) |
|---|---|---|---|---|---|---|
| g1 | dominaria-brg ↔ ravnica | 42 | greedy | wygrywa Bot (gracz wyczerpał bibliotekę) | 0 | 17/16, 1 modal |
| g2 | tarkir-bg ↔ warhammer-ubr | 7 | greedy | wygrywa Bot (życie 0) | 0 | 25/24, 1 modal |
| g3 | theros ↔ innistrad-brg | 1234 | explorer | wygrywa Bot (życie 0) | 0 | 12/10, 0 modali |
| g4 | warhammer-wg ↔ mirrodin-brg | 3001 | defensive | wygrywa Bot (życie −9) | 0 | 20/18, 0 modali |
| g5 | alara ↔ srodziemie | 3002 | impatient | wygrywa Bot (życie 0) | 0 | 12/11, 0 modali |
| g6 | wiedzmin-brg ↔ kaladesh | 3003 | hoarder | wygrywa Bot (życie −2) | **1 (`info`)** | 20/19, 1 modal |

`== NIEWYCENIONE ==` w każdej partii: brak (każdy wybrany ruch bota miał
dedykowaną wycenę). `[STOP] brak akcji` i `== LIMIT ==`: zero — żadna partia
nie utknęła.

## Znaleziska

### F-E6-1 (oś 2, naprawione `ea63934`) — surowy identyfikator tokenu mechaniki silnika w logu

Detektor partii g6: `Surowy identyfikator tokenu „token_servo" zamiast nazwy`
(„[ROZGRYWKA] • token_servo ginie"). Root cause: mapa nazw tokenów
(`collectTokenNames`, M188/B) powstaje z KATALOGU kart, a Servo tworzy mechanika
**fabricate** w kodzie silnika (`src/engine/game-state.js`, CR 702.122a) —
deskryptora nie ma w rejestrze, więc `nameOf` zwracał cardId; token po śmierci
znika ze stanu (CR 111.7), więc opis miał do dyspozycji wyłącznie cardId.
Klasa dotyczyła wszystkich tokenów mechanik silnika: `token_skeleton`,
`token_hero`, `token_clue`, `token_incubator`, `token_phyrexian`, `token_clone`,
`token_spirit`, `token_servo`.

Naprawa GENERYCZNA (ADR 0002 — bez listy nazw i bez przypadków po nazwie karty):
cardId tokenu to slug jego nazwy, więc reguła ma jedno źródło prawdy
(`tokenCardIdFromName` w `src/engine/tokens.js`, używa jej `createToken`) i
odwrotność `tokenNameFromCardId`; `nameOf` w sesji sięga po nią, gdy brakuje
wpisu w rejestrze (L41).

**Weryfikacja dwustronna (L27):** ten sam zestaw (g6, seed 3003, hoarder) PRZED
naprawą — 1 zgłoszenie; PO naprawie na świeżym `dist/` — 0 zgłoszeń, w logu
„Nieprzyjaciel tworzy token Servo (1/1)", „Servo wchodzi na pole bitwy", na polu
wroga „Servo · 0 · Artifact Creature — Servo · 1/1". Wynik partii identyczny
(wygrywa Bot, gracz −2 ż.) — zmiana dotyczy wyłącznie nazw. Strażnik klasy:
`test/e6-nazwy-tokenow-silnika.test.js` (round-trip reguły + przegląd każdego
literału `cardId: 'token_*'` w `src/engine`).

### F-E6-2 (oś 2, naprawione `078e6ed`) — wizard trample nie wyjaśniał poluzowanej bramki po W5

Lektura ręczna g2: po W5 (CR 702.19b/702.2b) bramka trample pozwala przydzielić
blokerowi mniej niż jego lethal, gdy lethal pokrywają obrażenia przydzielane mu
w tym samym kroku przez inne stwory — ale gracz nie widział DLACZEGO, więc
zachowanie wyglądało na błąd UI. Etykieta celu dostaje dopisek z widoku:
`Omenspeaker (wytrz. 3, śmiertelne 3, od innych w tym kroku: 3 (śmiertelne pokryte))`;
dopisek pojawia się tylko gdy jest co pokazać (`assignedByOthers > 0` albo
`lethalByOthers`), więc dotychczasowe ekrany zostają bez szumu. Bez zmiany reguł
i polityki domyślnej. Test: przypadek w `test/choice-request-ui.test.js`.

## Lektura osi — czego NIE znaleziono

**Oś 1 (bezsensowne działania bota):** żadnej akcji bota bez wpływu na grę ani
działającej przeciw sobie; brak sekwencji powtarzanych akcji (jedyne dwie
identyczne akcje pod rząd w g2 — „zagrywa Mountain" — dzieli granica tury, więc
limit jednego lądu na turę, CR 305.2, nie jest naruszony); brak mielenia własnej
biblioteki i niszczenia własnych permanentów przez bota (znalezisko B właściciela
z 2026-09-12 naprawione wcześniej w tej sesji). `== NIEWYCENIONE ==` puste w
sześciu partiach. Uwaga POMOCNICZA (nie produktowa): w g1 rolę człowieka grał
tester z profilem `greedy` i tapował własny ląd z `Chronic Flooding`, aż
wyczerpał bibliotekę — polityka testera nie modeluje bezpieczeństwa własnej
biblioteki (w przeciwieństwie do bota po naprawie B). To ograniczenie narzędzia,
nie znalezisko; zapisane, żeby kolejna sesja nie wzięła tego za regresję bota.

**Oś 2 (zdarzenia nieczytelne):** poza F-E6-1/F-E6-2 opisy są pełne — także
przypadki „trigger bez efektu" z podanym powodem (`brak legalnych celów`,
`nie było czego wykonać`, `pusta biblioteka`), zniknięcie tokenu w wygnaniu
(„token istnieje tylko na polu bitwy") i śmierć `Faceless Butcher` z niczym do
zwrócenia. Mechaniczny test osi (wszystkie `EVENT_TYPES` przez
`describeGameEvent`) jest skodyfikowany w `test/m134-kompletnosc-zdarzen.test.js`.

**Oś 3 (ptaszki auto-pass):** decyzje `resolve_*` — w tym nowe wizardy
rozdzielania obrażeń z W3/W4/W5 — ptaszka nie dostają i to jest poprawne
(akcje obowiązkowe); strażnikiem osi jest `test/session-autopass.test.js`.
W g2 oba nowe wizardy przeszły przez prawdziwy artefakt: podział atakującego
między dwóch blokerów (Silumgar Butcher 4 → 3+1) i trample z dwoma blokerami
(Stampeding Elk Herd 5 → 3+2, „do gracza: 0"); obrażenia w transkrypcie
zgadzają się z przydziałem, a zgony następują PO zadaniu całości (CR 510.2 +
704.3) — regresji W4 w prawdziwej partii nie widać.

## Bramy po naprawach

`npm test` **5195/5195**, `npm run build` 61 modułów / 3523,6 kB, quick
benchmark bez zmian (84,2% — patrz E7), `npm run test:all` w E7.

## Odtworzenie

```bash
npm run build
cd tools/table-tester && npm i
node run-game.mjs --human wiedzmin-brg --bot kaladesh --seed 3003 --steps 300 \
  --profile hoarder --snapshot-every 25 --out ../../tmp-audyt-e6-2026-09-12/g6.txt
```

Pozostałe partie: `--human dominaria-brg --bot ravnica --seed 42` (greedy),
`--human tarkir-bg --bot warhammer-ubr --seed 7` (greedy),
`--human theros --bot innistrad-brg --seed 1234` (explorer),
`--human warhammer-wg --bot mirrodin-brg --seed 3001` (defensive),
`--human alara --bot srodziemie --seed 3002` (impatient).
