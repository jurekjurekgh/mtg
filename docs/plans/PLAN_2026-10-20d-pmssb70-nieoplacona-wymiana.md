# PLAN 2026-10-20d — PMSSB-70: nieopłacona wymiana w deklaracji ataku

Zgłoszenie właściciela (PR #168, audyt remisów): remis ex aequo `ravnica-wub|innistrad-wu`
s4011 t26 p2 — bot wybiera atak `attack[81,91,108]` ALBO `attack[81,91,108,token-135]`
(oba 1033). Właściciel: „trzeba zrobić tak, żeby bot wybierał A. Wybór B jest bez sensu,
skoro nic nie daje, tylko kosztuje stwora”.

## Pomiar PRZED (`.arena/pmssb70-przed-probe.log`)

Sonda: instrumentacja tymczasowa w `scoreCommand(declare_attackers)` (cofnięta, `git checkout`).
Na pozycji s4011 t26:

- `token-135` (token 1/1), blk 1, att 1: `perAttacker = 0` — gałąź „wymiana” `power - 1`.
- `81` (2/2): 5, `91` (1/4): 4, `108` (1/4): 4 — gałąź „przeżyje i zabija blokera”.
- Wynik zestawu: 1000 (lethal przez blokery) + 33; token dokłada 0, więc B = A.

Przyczyna: wycena deklaracji sumuje wartości atakujących, a każdy z nich zakłada
zabicie TEGO SAMEGO jedynego blokera. Zabicie jest więc liczone wielokrotnie, a token
płaci za „wymianę”, która w projekcji zestawu nie daje ŻADNEGO dodatkowego zabicia
(`zabici` = 1 w obu wariantach). Projekcja potwierdza: `ginie` 0 → 1, `zabici` 1 → 1.

## Audyt (kontrole obowiązkowe)

(a) L41 — wspólna miara: zmiana dotyczy wyłącznie deklaracji ataku (`declare_attackers`);
    wycena bloku i `attack[]` nie zmieniają się.
(b) Wymiar kosztu: nie dotyczy (koszt czaru bez zmian).
(c) Anty-over-fix: wymiana, którą BLOKER ZAPŁACI za nieblokowany pierwszy atak, nadal
    jest wartością (gdy są wolne bloki). Zmiana obejmuje tylko nadmiar wymian ponad liczbę
    blokerów, które mogą zginąć (`blockers.length − przeżyjące zabójstwa`).

## Wdrożenie (planowane)

- `heuristic-params.js`: `unpaidTradeEnabled` (1 = włączone; 0 = dawna wycena) i
  `unpaidTradeLoss` (= 2, jak kara jałowego ataku `−2`).
- `heuristic-bot.js`: w pętli atakujących liczniki `survivorKillers` (gałęzie „przeżyje
  i zabija”, także first strike) i lista `tradeValues` (gałąź „wymiana”). Po pętli:
  `wolne = max(0, blockers − survivorKillers)`; wymiany ponad `wolne` (najcenniejsze
  zostają opłacone) dostają karę `−unpaidTradeLoss` na dodatek do ich wartości.
  Wynik nie zależy od kolejności atakujących (liczby i posortowane wartości).

## Testy (RED → GREEN)

`test/audyt-pmssb70-nieoplacona-wymiana.test.js`:
1. RED: s4011 t26 — decyzja bota = `attack[81,91,108]` (A), nie z tokenem.
2. Pokrętło `unpaidTradeEnabled = 0` przywraca 1033 dla B (dowód, że to ta reguła).
3. Anty-over-fix: jeden bloker, jeden atakujący-wymiana → wymiana nadal opłacona (wartość bez kary).
4. Kolejność atakujących nie zmienia decyzji.

## Ewaluacja

- golden master BEZ regeneracji (cel: bez zmian; jeśli zmiana — uzasadnić per para);
- tie-audit PO (sufit `attack` ma spaść z 12);
- mirror-eval (reguły vs off) i Żywy Tester PO — dowód, że nie psuje ogólnej gry.

## Bramy

`npm test`, `npm run build`, `npm run test:all`. Push po każdym kroku.

## Wynik (2026-10-20)

**RED.** `test/audyt-pmssb70-nieoplacona-wymiana.test.js`: na pozycji s4011 w postaci minimalnej (życie wroga 4, 2/2 + 1/4 + 1/4 + token 1/1 kontra 1/1) A = B = 33 — test czerwony na „A ściśle wyżej niż B” (`.arena/pmssb70-red2.log`).

**GREEN** po wdrożeniu (`.arena/pmssb70-green5.log`): 5/5 testów pliku (A, K1, K2, P, G).

**Rewizja zakresu (decyzja w trakcie pętli, z dowodem).** Pierwsza wersja liczyła wolne sloty jak w planie (`blokery − przeżywające zabójstwa`) i karała każdą wymianę ponad nie — także gdy NIE było przeżywającego. Wynik: pin PMSSB-59/B-kontrola (pompa w pustą planszę ma być nieopłacalna) przestał przechodzić: pompa Duo dawała +3 zamiast −1. Sonda (`.arena/probe59b.mjs`): zestaw `[duo, mine]` (dwie wymiany wobec jednego blokera, bez przeżywającego) spadał z 2 do 0, a bramka `attackIntendsCreature` przełączała się i zmieniała wycenę pompy. Dwie wymiany bez przeżywającego to **inny mechanizm** (blokujący zablokuje jedną, druga przechodzi w twarz), którego ta poprawka nie modeluje. Kara została zawężona do `survivorKillers ≥ 1` — tylko wymiany PO przeżywającym zabójcy, czyli przypadek s4011 i opis właściciela. Test G pinuje tę granicę.

**Skutek na pin PMSSB-62/F7 (battle cry).** Scena z jednym blokującym: Ringleader przeżywa i zabija blokera, więc drugi atakujący-wymiana jest zbędny i dostaje karę (`razem` 5 zamiast 7). To ten sam przypadek co s4011, więc pin nie jest błędem reguły. Scenę domyślną przeniesiono na **dwóch** blokujących (wolny slot), gdzie battle cry ma co dołożyć; kontrfakt bez battle cry bez zmian; kotwica dyskryminująca bez zmian.

**Golden master.** Przed regeneracją: 2 z 6 partii różne (`ravnica-wub|innistrad-wu` s1000, `dominaria-brg|mirrodin-wu` s1001). Przegląd przykładów (tie-projekcja, `.arena/pmssb70-dump-off.json`):
- ravnica s1000 t16: `[54,75]` 6 → 3; 54 przeżywa i zabija jedynego blokera (wartość 5), 75 to wymiana, która nic nie dokłada → wybór `[54]`.
- dominaria s1001 t15: `[26,token-61]` 8 → 5; projekcja `ginie 1, zabici 1` — token ginie bez nowego zabójstwa → wybór `[26]`.
Obie zmiany to ta sama klasa co s4011. Regeneracja: `node tools/bot-scoring-snapshot.mjs --write` (`.arena/pmssb70-golden-write.log`). Przełącznik `unpaidTradeEnabled = 0` odtwarza fixture bit w bit (`.arena/pmssb70-golden-off.json`, hash = fixture sprzed zmiany).

**Tie-audit** (`tools/bot-tie-audit.mjs --gry=1`; baseline = ten sam przebieg z przełącznikiem 0, `.arena/pmssb70-tie-audit-off.json`):
- `attack`: akcyjne 14 → 11, tie_top 71 → 65; pozycja s4011 t26 zniknęła z remisów.
- `block`: akcyjne 10 → 9.
- `cast_spell`: akcyjne 6 → 7 — remis dwóch identycznych tokenów jako celu (ta sama wartość 25), w trajektorii zmienionej partii; nie kara wymiany.
- Łącznie akcyjne 114 → 111. Sufit `attack` w `audyt-bot-walka-remisy` (12) nie wymaga zmiany.

**Mirror-eval** (`tools/mirror-eval.mjs`, kandydat = domyślne, baseline = `unpaidTradeEnabled: 0`, 24 seedy × 6 talii × 2 strony): **143 : 145, win-rate 0,4965** (288 partii, `.arena/pmssb70-mirror24-final.log`). Neutralnie — zmiana nie poprawia siły w lustrze i nie pogarsza jej. Wcześniejsza wersja bez zawężenia: 142 : 146 (0,493).

**Żywy Tester** (`tools/table-tester`, build po zmianie): ravnica-wub vs innistrad-wu i dominaria-brg vs mirrodin-wu, seedy 11–13, 400 kroków: 6/6 zakończone („KONIEC PARTII”), rc 0, 0 `[STOP]`, 0 zgłoszeń detektorów (`.arena/pmssb70-tester-*.log`).

**Bramy.** `npm test` 8566/8566 (`.arena/pmssb70-npmtest2.log`); build exit 0 (`.arena/pmssb70-build.log`); `test:all` 8833/8833 (`.arena/pmssb70-testall.log`).

**Otwarte (poza zakresem tej pętli).**
- Dwie wymiany wobec jednego blokera BEZ przeżywającego (PMSSB-59 duo): drugi atakujący dostaje dawną wartość; w świecie gry drugi atakujący może przejść w twarz. Osobna rodzina, bez pomiaru po stronie blokera.
- Pożyczony stwór (`tempControlUntilEOT`), który zabija najsilniejszego blokera, nie jest liczony jako przeżywający zabójca (wartość dla właściciela, odrębna gałąź).
