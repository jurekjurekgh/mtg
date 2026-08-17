# M110 — eliminacja ograniczeń: karty 100 % wg Oracle · 2026-08-17

Polecenie właściciela: „kontynuuj z eliminowaniem limitowania — wg zasady
100 % kart wg Oracle". Punkt wyjścia: 63 karty z niepustym `limitations`,
z czego zdecydowana większość to OPISY zachowania (np. „karta bez zdolności —
standardowa istota 2/1", „surveil jest realną decyzją"), a nie odstępstwa od
Oracle. W tej sesji zamknięte zostały trzy PRAWDZIWE odstępstwa.

## 1. Spare from Evil — ochrona przed jakością: pełne DEBT (CR 702.16)

M109 dał tylko dwie litery: D (prewencja obrażeń) i B (bloki). Dołożone:

- **T — celowanie (CR 702.16b).** `validateTargets` przyjmuje teraz ŹRÓDŁO
  czaru/zdolności i odrzuca cel chroniony przed jego jakością;
  `legalTargetCandidates` filtruje identycznie, więc oferta i walidacja się
  nie rozjeżdżają (pułapka M82). Źródło przekazane we wszystkich ścieżkach:
  czary, zdolności aktywowane, triggery, rewalidacja przy rozstrzyganiu
  (CR 608.2b).
- **E — załączniki (CR 702.16c).** Equipment o chronionej jakości nie da się
  przypiąć, aura nie znajdzie gospodarza, a już przypięte odpadają w SBA.

Anty-over-fix (testy): czar NIE jest stworem, więc „protection from non-Human
creatures" go nie zatrzymuje; zdolność Człowieka celuje dalej.

Helpery ochrony jakościowej mieszkają teraz w `attachments.js` obok
kolorowej (`permanents.js` je re-eksportuje) — bez cyklu importów.

## 2. Spreading Insurrection — storm w pełnym brzmieniu (CR 702.40)

- **Storm to zdolność triggerowana.** Przy rzucie na stos idzie czar, a NAD
  nim trigger; przeciwnik ma okno odpowiedzi. Kopie powstają dopiero przy
  rozstrzygnięciu triggera; liczba kopii (czary rzucone wcześniej w tej
  turze) jest zamrażana w chwili rzutu. Czar zdjęty ze stosu (kontrczar) =
  trigger komunikuje brak skutku z powodem (M106/Z2).
- **„You may choose new targets for the copies".** Nowa decyzja
  `resolve_copy_targets` (stan `pendingCopyTargets`, zdarzenia
  `copy_targets_required` / `copy_targets_resolved`): kontroler wskazuje cel
  każdej kopii po kolei; PIERWSZA oferta to cel oryginału, więc „may" jest
  spełnione, a boty domyślnie nic nie zmieniają. Nowy cel przechodzi tę samą
  walidację co przy rzucie (CR 706.10c).

Kopie czarów WIELOCELOWYCH zachowują cele oryginału — to ograniczenie
infrastruktury wyboru (brak UI dla kombinacji celów), nie karty: Spreading
Insurrection ma dokładnie jeden cel, więc jest w 100 % wg Oracle.

## 3. Willbender — „spell OR ability" (CR 115.7)

Ograniczenie mówiło „engine nie ma zdolności na stosie" — to była prawda
o silniku sprzed wprowadzenia `activatedEntry`/`triggerEntry`. Dziś zdolności
czekają na stosie po rundzie passów, więc:

- helper `singleTargetOfStackEntry` (`objects.js`) zwraca jedyny cel wpisu
  stosu i jego deskryptor — dla czaru, zdolności aktywowanej i triggerowanej;
- kandydaci celu triggera i efekt `redirect_spell_target` korzystają z niego;
- podmiana celu trafia tam, gdzie wpis naprawdę trzyma cele.

## Testy

- `test/protection-quality.test.js` (5) — celowanie, załączniki, anty-over-fix.
- `test/storm-oracle.test.js` (5) — trigger na stosie, liczba kopii, nowe cele.
- `test/willbender-ability-redirect.test.js` (3) — pełna ścieżka morph →
  trigger → przekierowanie obrażeń zdolności.
- Testy storma z M109 przepisane na sekwencję zgodną z Oracle.

## Pomiary

- `npm run test:all` — **2006/2006**; build 51 modułów / 1791,8 kB.
- Benchmark szybki (`tools/b7-m110-2026-08-17.txt`): heuristic **61,9 %**
  vs aggro, **88,1 %** vs random, 0 niedokończonych — bez zmian wobec M109.

## Co zostaje w kolejce (przejrzane, świadomie NIE zmieniane)

- **Etherium Sculptor** — obniżka nie dotyka kosztów alternatywnych
  (bestow/escape/cleave). W katalogu nie ma artefaktu z takim kosztem, więc
  odstępstwo jest dziś teoretyczne; do zrobienia przy pierwszej takiej karcie.
- **Jyoti, Moag Ancient** — „commander casts" wymaga strefy dowodzenia,
  której format 1v1 w tym silniku nie ma (mechanicznie poprawne zero).
- **Selesnya Charm / Etherwrought Page / Vandalize** — wpis mówi o polityce
  BOTA („bierze pierwszy tryb"), nie o zgodności karty z Oracle; to zadanie
  dla wyceny trybów w `heuristic-bot`.
- Pozostałe ~55 wpisów to opisy zachowania (kiedy decyzja jest blokująca,
  co znaczy „one or more" itd.), nie odstępstwa — warto je z czasem
  przenieść z `limitations` do komentarzy przy karcie, żeby pole
  `limitations` znaczyło wyłącznie „tu NIE gramy pełnego Oracle".
