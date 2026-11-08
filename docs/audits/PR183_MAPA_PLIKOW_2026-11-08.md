# Mapa plików PR #183 (audyt 2026-11-08c)

Scalenie `9b9591c`, baza `12aac62`, head `95144f5`. REST: **13 plików, +562/−21, 6 commitów**. Diff lokalny rozdzielony `^diff --git ` ma 13 bloków zgodnych z REST (L190).

| Plik | +/− | Werdykt audytu |
|---|---|---|
| `docs/LESSONS_PRZYPADKI.md` | +5/−0 | Glosa „Wzorzec” L14 odtworzona w narracji; reguła i numer L14 w LESSONS nietknięte. Zgodne z procedurą kondensacji. |
| `docs/PROJECT_HISTORY.md` | +3/−1 | Wpis #183 opisuje zakres i bramy; korekta 23→24 commitów #182 potwierdzona REST (24). Liczby 10139/5802,6 zgodne z własnym pomiarem bazy. |
| `docs/audits/AUDYT_PR181_2026-11-08.md` | +9/−7 | Korekty licznika, mapowania CR i 712.6a sprawdzone wobec REST i CR 2026-11-06. Brak nowych zastrzeżeń. |
| `docs/audits/AUDYT_PR182_2026-11-08.md` | +220/−0 | Raport poprzedniej sesji czytelny; twierdzenie o „nieszkodliwym noop” ujemnego source_power nieprawdziwe w resolverze (F1). Dowody mutacji BM powtórzone. |
| `docs/audits/PR181_MAPA_PLIKOW_2026-11-08.md` | +2/−2 | Licznik 24 zgodny z obiektem PR; wiersz historii uproszczony bez utraty faktu. |
| `docs/audits/PR182_MAPA_PLIKOW_2026-11-08.md` | +31/−0 | 17 wierszy = REST #182; werdykty i legenda spójne. |
| `docs/plans/PLAN_2026-11-08b-audyt-pr182.md` | +88/−0 | E2/BM wykonane; bot-tie-audit jawnie odstąpiony, nie ukryte otwarte zobowiązanie. |
| `docs/setup/HANDOFF_2026-11-08.md` | +18/−1 | §6 opisuje #183 i wymagania schema triggera; ostrzeżenie o równoległych edycjach i ulotności .arena zgodne z ENVIRONMENT. |
| `src/cards/card-data.js` | +5/−2 | Cel przeniesiony do trigger.requiresTarget, notSelf zachowany; BM-1…4 RED na wersji sprzed PR, GREEN po. Oracle zgodny, ale pełny kontrakt ujawnia F1 (ujemne X) i F2 (oferta bez pumpa). |
| `src/engine/effect-intent.js` | +35/−6 | Znak dynamicznych delt działa dla catálogo-wej rodziny; BM-5 RED na starej wersji. Komentarz o ujemnej mocy błędny (F1); bliźniaczy helper triggerTargetPowerPumpOf nie zna dynamik (F2). |
| `src/engine/triggers.js` | +6/−2 | Wyłącznie komentarze: 732.2c przy untap, 702.145d/g przy ETB. Dosłowny CR pobrany, sha zgodny; CR/732.2c RED na starym komentarzu. |
| `test/audyt-pr181-cytaty-cr-dzien-noc.test.js` | +18/−0 | Nowy test 5 pinuje właściwy dom cytatu; mutacja komentarza daje RED, przywrócenie GREEN. |
| `test/zyjwy-tester-gruul-beastmaster.test.js` | +122/−0 | 5 pinów: wybór celu, autocel, brak celu, schema katalogu, znak dynamik. Mutacje karty 4 RED, intencji 1 RED. Luki F1/F2 poza ich zakresem — nowe piny w naprawach. |

Legenda: werdykt dotyczy zmiany i jej kontraktu, nie tylko wyniku testu. F1/F2 potwierdzone reprodukcjami; naprawy osobnymi commitami po tym audycie.
