# PLAN 2026-09-09d — sesja arena/01a08788: znaleziska właściciela A–D (Wishful Merfolk, Deathtouch-block, rozdzielanie obrażeń, Inferno Titan)

Kontynuacja sesji `arena/01a08788-mtg` / PR #111 (ADR 0013/0020 — jeden PR
kumulacyjny). Po audycie PR #109 właściciel podał 4 znaleziska z testów (A–D).
Wszystkie dotyczą WARSTWY POKAZU lub WYCENY BOTA — silnik/legalność już
poprawna, więc bez pobierania CR (ADR 0030 nie wymaga — nie zmiana reguł).
Każdy finding: repro/test → fix u root cause → test RED→GREEN → commit (zielony
`npm test` + `npm run build`).

## Rozpoznanie (zmierzone)
- Silnik/bot poprawne regułowo; problemy: A badge podtypu-nadpisanego nie
  sygnalizuje „do końca tury"; B scoring blokowania nie zna deathtouch
  (attackerDies liczy tylko sumę mocy, więc dokłada zbędnych blokerów); C modal
  „Rozdzielanie obrażeń bojowych (1 opcja)" — szum, gdy przydział jest jeden;
  D bot rozprasza 3 obrażenia Inferno Titana 1/1/1 zamiast zabić (wybór liczby
  celów nie uwzględnia budżetu obrażeń).

## Etapy (każdy = commit, zielony)

### F-A. Wishful Merfolk — badge „Human do końca tury" [X]
Objaw: aktywacja zdejmuje `defender` (badge „bez: obrońca" jest) i nadpisuje
podtypy na `Human` do końca tury (`subtypesBeforeOverride`), ale typ-line nie
sygnalizuje CZASOWOŚCI. Fix: overlay/live badge przy aktywnym
`subtypesBeforeOverride` pokazujący docelowy podtyp z „do końca tury"
(jak `tempControlNow`/`untapLockedNow`). Pole niesie widok (ADR 0017).
Strażnik: test overlay badge dla Wishful Merfolk (aktywacja → badge;
czyszczenie EOT → badge znika).

### F-B. Scoring blokowania nie zna deathtouch — niepotrzebne bloki [X]
Objaw: bot blokuje Deadly Recluse + drugim stworem, choć deathtouch i tak
zabija atakującego. Root cause: gałąź `declare_blockers` liczy `attackerDies =
totalBlockerPower >= attackerToughness` (surowa suma mocy), ignorując że
bloker z deathtouch zadający ≥1 sam jest śmiertelny (CR 702.4). Bot nie wie,
że deathtouch zabija → dokłada mocy. Fix: `attackerDies` prawdziwe, gdy
któryś żywy bloker ma deathtouch i moc >0 (1 obrażenie = lethal) ALBO suma
mocy ≥ wytrzymałość; nie nagradzać 2× za blok z dodanym zbędnym blokerem
(koszt i tak naliczany). Strażnik: test — atak 4/4, blokują Deadly Recluse
(1/2 deathtouch) vs Recluse + 2/2; bot wybiera samą Recluse.

### F-C. „Rozdzielanie obrażeń bojowych (1 opcja)" — szum UI [X]
Objaw: w wyborze podziału obrażeń pokazuje się „(1 opcja)" — bezsensowne.
Root cause: `choiceGroupLabel` dla `damage_assignment` nie ma specjalnego
przypadku (inaczej niż `damage_division`); przy trample/nadmiarze, gdy legalny
jest jeden przydział, modal to szum. Fix: dla `damage_assignment` etykieta
opisuje CZYNNOŚĆ (jak `damage_division`: „rozdziel obrażenia bojowe X między
Y"), bez licznika opcji. Strażnik: test etykiety grupy (żywy widok z 1 i z N
opcjami).

### F-D. Inferno Titan — bot rozprasza 3 obrażenia 1/1/1 [X]
Objaw: trigger ETB/atak dzieli 3 dmg 1/1/1 na 3 cele (toughness≥2) — nikt nie
ginie; najlepiej 3 na jednego (zabić toughness 3) albo 2+1. Root cause: wybór
LICZBY celów (`resolve_trigger_target` wielocelowy, requiresTarget upTo 3)
wycenia każdy cel osobno (~30+wartość), nie zna budżetu 3 obrażeń efektu
`damage_divided` — więc bierze max celów, a `resolve_damage_division` potem
dzieli minimalnie (każdy ≥1). Fix: przy efektach `damage_divided` bot w
wyborze celów uwzględnia, że suma obrażeń jest stała — lepiej jedno-trzy
skupione cele pozwalające zabić (lethal per cel, ilość celów ≤ budżet z
uwzględnieniem że cel dostanie ≥ potrzebne). Osobno `resolve_damage_division`
ma już premię lethal; upewnić spójność wyboru celów z budżetem.
Strażnik: test — ETB Titana z 3× toughness 2 u wroga: bot zadaje 3 w jednego
albo 2+1 tak, że ktoś ginie (zamiast 1/1/1).

### F-E. Domknięcie sesji
`npm run test:all` + build + quick; liczby README; HISTORY; HANDOFF; opis PR.

## Ryzyka / pułapki
- Gałąź już na origin (625e689) — tylko nowe commity, bez force; sprawdzać
  HEAD/status przed pushem (ADR 0020 D).
- Testy wyceny (B/D) pinują ZACHOWANIE bota w danych scenariuszach — budować
  przez realną ścieżkę (putCard + execute + decyzja bota), nie własny helper.
- Golden-master/scoring bota może drgnąć (B/D zmieniają wycenę) — uruchomić
  próbkę regresji `node --test test/bot-benchmark.test.js`; pełne B0 na komendę
  (ADR 0018).
- Polskie znaki w edycji — przez `python3`/`write_file`.

## Podsumowanie wykonania

F-A: badge nadpisania podtypu „do końca tury" (Wishful Merfolk) — pole widoku
(ADR 0017) + overlay w renderze; strażnik test/znaleziska-a-subtype-badge.test.js.
F-B: scoring blokowania zna deathtouch (CR 702.4) — bot blokuje samą Recluse;
strażnik test/znaleziska-b-deathtouch-block.test.js.
F-C: etykieta grupy `damage_assignment` opisuje czynność bez licznika
„(N opcji)" (jak `damage_division`); strażniki w test/choice-request-ui.test.js.
F-D: bot w `resolve_trigger_target` wielocelowym uwzględnia budżet
`damage_divided` (`view.pendingTriggerTarget.divisionTotal`) — premiuje skupiony
lethal (60/zabójstwo; ≥1 na cel, suma = budżet), zamiast rozstrzeliwać 1/1/1;
strażniki test/znaleziska-d-inferno-division.test.js (RED→GREEN).

Bramki (zmierzone w tej sesji): `npm test` fast 5055/5055; `npm run test:all`
5065/5065; `npm run build` 61 modułów / 3451,3 kB; próbka regresji bota 10/10
(node --test test/bot-benchmark.test.js).
Commity (PR #111): F-A 2645c59, F-B 7785e80, F-C 150f3ec, F-D 28684b8.
Domknięcie: wpis PROJECT_HISTORY, HANDOFF_2026-09-09c, opis PR #111.
