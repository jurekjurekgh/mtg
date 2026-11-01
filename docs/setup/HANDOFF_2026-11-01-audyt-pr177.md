# Handoff 2026-11-01 — audyt PR #177 rozpoczęty

PR sesji: https://github.com/jurekjurekgh/mtg/pull/178. Plan: `docs/plans/PLAN_2026-11-01-audyt-pr177.md`. Raport cząstkowy: `docs/audits/AUDYT_PR177_2026-11-01.md`.

Baza na `7aff9b6`: `npm test` 9156/9156, `npm run build` 76 modułów / 5608,7 kB. Pełny B0 nieuruchomiony. PR #177 obejmuje 111 plików; audyt **nieukończony**. Pierwsze ustalenie A1 dotyczy braku opcji wygnania przy champion po odejściu źródła; sprawdzono wskazaną gałąź i istniejący test syntetyczny, nie pełną sekwencję na stosie. Wpis historyczny: wtedy kod gry nie był jeszcze zmieniony; aktualny stan napraw opisano poniżej. Należy dokończyć audyt, a następnie wykonać pętlę jakości wg ADR 0021. Nie dodawać kart z własnej inicjatywy; pełny B0 tylko na komendę właściciela. Merge to decyzja właściciela.

## Kontynuacja — champion

A1 naprawiony; testy stosu i zmiany kontroli `test/audyt-pr177-champion-na-stosie.test.js` (5), pierwsze trzy RED→GREEN. `npm test` 9161/9161, build 76 modułów / 5609,7 kB. Opis i źródła w raporcie. Audyt pozostałych plików PR #177 nieukończony.

## Kontynuacja — klątwy upkeepu

A2: zapamiętany gracz zdarzenia upkeepu (mill i obrażenia); trzy testy RED→GREEN w `test/audyt-pr177-klatwa-gracz-upkeep.test.js`. `npm test` 9164/9164, `npm run test:slow` 268/268, build 76 modułów / 5610,1 kB. Audyt PR #177 nadal nieukończony; kontynuować od raportu i planu. Pełnego B0 nie uruchamiano.

## Kontynuacja — dobór many Converge

A3: globalny dobór jednostek do pipów i generic maksymalizuje liczbę kolorów, przy tie-breaku dla many ograniczonej i ochrony kolorów. `test/audyt-pr177-converge-dobor-many.test.js` (6, w tym 3 RED→GREEN i enumeracja małych pul). `npm test` 9170/9170, build 76 modułów / 5615,2 kB; slow po A3 268/268 (w tym test benchmarku); osobnego quick benchmarku nie uruchamiano. Strategia maksymalizuje automatycznie, swoboda wyboru konkretnych jednostek przez gracza wymaga osobnego zbadania. Audyt PR #177 nadal nieukończony.

## Kontynuacja — Morbid i bestow

A4: naprawiono błędną klasyfikację śmierci przy zniszczeniu aury bestow, także u Furious Forebear; 5 testów, przypadki Morbid i Forebear RED→GREEN. `npm test` 9175/9175, build 76 modułów / 5615,6 kB; slow po A4 nie uruchamiano. Pozostałe konsumenty typów bestow oraz semantyka syntetycznego triggera „a counter” wymagają dalszej analizy (`docs/audits/AUDYT_PR177_2026-11-01.md`). Audyt PR #177 nadal nieukończony.

## Kontynuacja — typy aury bestow

A5: aura bestow ma prawidłową linię typów na polu bitwy; przy odłączeniu lub opuszczeniu pola przywraca pierwotną. Pin Austere Command i 4 inne testy, 2 RED→GREEN. `npm test` 9180/9180, build 76 modułów / 5617,3 kB; slow po A5 268/268. Sprawdzić czar bestow na stosie (dotychczas drukowane typy i `kind=creature`), interakcje zmian typów/kopii i resztę diffu PR #177; zob. raport.

## Zgłoszenie N (2026-11-01)

Naprawiono modal X dla Magma Pummeler: `test/zgloszenie-n-magma-wybor-x.test.js`, `npm test` 9185/9185, build 76 modułów / 5618,4 kB. Żywy tester faktycznie rzucił X=0 przy dwóch Górach i X=1 przy trzech, bez zgłoszeń detektorów. Talia tymczasowa usunięta, artefakt przebudowany. Limit X=15 istnieje w danych/silniku i nie był zmieniany. Audyt #177 nadal w toku — kontynuować, nie przerywać po tym przyroście.

## A6 — wycena kosztu Heralda

Testy ujawniły, że PR #177 ignorował koszt trzech ofiar, gdy jedynym niebieskim stworem był sam Sphinx’s Herald, oraz nie rozróżniał konkretnych kombinacji. Wycena sumuje teraz ofiary z rzeczywistej legalnej komendy, w tym źródło. 2 RED→GREEN, pełny fast 9187/9187, build 76 modułów / 5617,6 kB. Wolny pakiet uruchomiony przed tą zmianą nie jest dowodem stanu po A6. Audyt #177 nadal nieukończony.

## A7 — błędne ostrzeżenia animacji i załogi

Silvanus’s Invoker faktycznie odtapowuje już animowany ląd; stare ostrzeżenie mówiło, że nic się nie zmieni i przepadnie tapnięcie. Uściślono ostrzeżenie do czystych zdolności crew/saddle i ich stanu; kreator używa tego samego helpera. 5 testów RED→GREEN, pokrewne 38/38, `npm test` 9243/9243, build 76 modułów / 5624,6 kB. Audyt nadal nieukończony, pozostałe kierunki w raporcie.
