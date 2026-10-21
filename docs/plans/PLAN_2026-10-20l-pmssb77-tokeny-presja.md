# PLAN — PMSSB-77: presja życia w wycenie tokenów-stworów własnych (2026-10-20)

Status: spisany po pomiarze PRZED (`.arena/pmssb77-pre.txt`), przed wdrożeniem. Zakres wynika z otwartego punktu PMSSB-75 („tokeny nie znają presji życia”).

## Problem (pomiar PRZED)

- `tokenBodyValue` (`src/controllers/heuristic-bot.js`) wycenia ciało tokenu-stwora jako `10·(2P+T)/3` + latanie + lifelink. Nie zna życia ani stołu.
- Geist (aktywacja z cmentarza, tokeny): pusty stół 24; dwóch wrogich Makindi 18 przy życiu 20 i 18 przy życiu 5. Spadek 24 → 18 to bramka latania (`enemyHasUntappedFlyingOrReachBlocker`), NIE presja.
- Raise the Alarm: 69,98 we wszystkich czterech scenach (życie 5/20 × wróg 0/2). Brak reakcji na presję.

## Audyt (a)(b)(c)

- (a) L41 — wspólna miara: `enemyAttackPower(view) / myLife(view)`, ograniczona do 1, ta sama co w `counterValue` (PMSSB-71 v3). Nie nowa stała.
- (b) wymiar — brak; token ma jedno ciało, koszt czaru już jest wyceniany osobno (F7).
- (c) anty-over-fix — presja tylko dla WŁASNEGO tokenu-stwora (token wrogi ma znak roli, bez presji). Pusty stół = zero zmiany (pin).

## Wdrożenie

- `src/controllers/heuristic-params.js`: nowe pokrętło `tokenPressureWeight` = 6 (ta sama skala co `counterPressureWeight`), dodane do `HEURISTIC_PARAM_KEYS`.
- `src/controllers/heuristic-bot.js`: w `tokenBodyValue` składnik `tokenPressure = P.tokenPressureWeight × min(1, enemyAttackPower / max(1, myLife))` dodany do `bodyWorth` tylko dla stworów i tylko gdy kontroler to ja.

## Testy

- `test/audyt-pmssb77-tokeny-presja.test.js` (4): RED na HEAD (Geist, Raise the Alarm, pokrętło); pin pustego stołu.
- Mutacja składnika na `0` łapie 2 testy (Geist, Raise the Alarm).
- Piny starych testów (`audyt-pmssb2-tokeny`, `audyt-pmssb68-amass`) zaktualizowane o zmierzone delty z komentarzem (nie na progi).

## Bramy i ewaluacja

- `npm test`, `npm run test:all` (log `.arena/pmssb77-testall.log`).
- Golden: `--dump` PRZED/PO, 1437 decyzji, 0 zmienionych wyborów, 3 wyniki wybranych opcji i 17 wycen opcji (maks. Δ 1,5). Hash zmienia się → NIE regenerować fixture bez decyzji właściciela.
- Tie-audit PRZED/PO: `tie_top` 700 → 674, akcyjne 197 → 196.
- Mirror 24 seedy, kandydat (6) vs baseline (`tokenPressureWeight` 0 = dawne zachowanie): 144:144, win-rate 0.5. Brak dowodu poprawy siły.

## Poza zakresem

- Presja w wycenie tokenów wrogich (znak roli) — nie zmieniana.
- Miara `enemyAttackPower` sumuje siłę wszystkich wrogich stworów (nie tylko atakujących). Ta sama przybliżona miara co licznik PMSSB-71 v3; okno po blokach dostaje tę samą presję, więc różnica okna chumpa (16) zostaje.

## Errata po PR #168 — audyt 2026-10-21

Powyższa sekcja „Poza zakresem” opisuje **pierwotną iterację**, nie stan
końcowy PR #168. W późniejszym domknięciu tej samej serii luka została
usunięta: `tokenBodyValue` dolicza presję również tokenowi oddanemu wrogowi,
a znak roli zmienia ją w koszt; gałąź `exileSwap` stosuje ten sam składnik
po przeskalowaniu do `2·moc + wytrzymałość` (×3/10). Pokrętło
`tokenPressureWeight: 0` przywraca starą wycenę po obu stronach. Piny:
`test/audyt-pmssb77-tokeny-presja.test.js` (Secure the Scene, 6 testów) i
`test/audyt-pmssb63-secure.test.js`; wynik i akceptacja fixture golden są w
`docs/PMSSB.md` §PMSSB-77. Historycznej intencji pierwszej iteracji
nie przepisujemy, ale **nie wolno traktować jej jako obecnego ograniczenia**.
