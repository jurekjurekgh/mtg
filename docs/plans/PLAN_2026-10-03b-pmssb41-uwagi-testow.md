# Plan PMSSB-41 — zgłoszenia właściciela z testów: Weftblade (warp), Nanoform (untap), Wedgelight (kolejność station), Xu-Ifit (badge'y) (2026-10-03b)

Wejście: **cztery uwagi właściciela z gry** (kanał czatu, po sesji PMSSB-40).
Tryb: pętla PMSSB (hub `docs/PMSSB.md`, procedura 0–7) — zgłoszenie jest dowodem
wejściowym (wzorzec PMSSB-31/PMSSB-36), a nie tylko „bugiem do załatanie”.
Praca na gałęzi sesji `arena/01a0fe59-mtg` pod PR #151 (1 sesja = 1 gałąź = 1 PR).

## Diagnoza (POMIAR PRZED — sonda `/tmp/pr/probe-uwagi.mjs` + `probe-uwagi2.mjs`)

### A. `weftblade-enhancer` (warp) — karta bez modelu decyzji

Karta: 3/4 za {5}{W}, warp {2}{W}; ETB: „put a +1/+1 counter on each of up to two
target creatures” (`requiresTarget: {type: creature, count: 2, upTo: true}`).
Stan kodu: gałąź `warp_card` daje **flat +5** za sam fakt triggera ETB (bez celu,
bez jakości gospodarza) i nie porównuje z ofertą rzutu normalnego.

| # | Scenariusz | PRZED |
|---|---|---|
| A1 | 6 lądów, brak moich stworów | cast_permanent 74,703 > warp 66 → rzut normalny (OK) |
| A2 | 3 lądy (tylko warp), brak moich stworów | warp 66 → **wybrany** (karta + licznik do wygnania = 100% straty) |
| A3 | 3 lądy + mój flier na stole | warp **66 — identycznie jak A2** (brak wymiaru „cel wart wzmocnienia”) |

Wniosek właściciela (kryterium akceptacji): warp ma sens TYLKO gdy (1) rzut normalny
jest nieosiągalny (wszystkie niezatapowane źródła many), ORAZ (2) na stole jest
stwór WART wzmocnienia (nie token, nie cannon fodder — np. z flying/menace/landwalkiem).

### B. `nanoform-sentinel` — cel untapa po złej stronie stołu

Trigger `self_becomes_tapped` (raz na turę): „untap another target permanent”.
Pomiar: oferta triggera ma `friendly: false` dla WSZYSTKICH celów (silnikowa
klasyfikacja `triggerTargetEffectFriendly` nie zna `untap_permanent`), więc wycena
idzie gałęzią WROGĄ: `foeLand 58`, `foeCre 35`, `myLand −20`, `myCre −29`
→ bot wybiera **odkręcenie LĄDU PRZECIWNIKA** (dokładnie zgłoszenie właściciela).
Brak też wymiaru „odkręcenie ma wartość tylko na TAPNIĘTYM WŁASNYM stworze” —
ten wymiar istnieje już w dwóch innych ścieżkach (czar/resolve, aktywacja),
więc naprawa to L41 (jedna miara w trzech miejscach), nie nowa łata.

### C. `wedgelight-rammer` — kolejność tapowania do Station

Station: „Tap another creature you control: put charge counters equal to its power
on this Spacecraft. Station only as a sorcery. It’s an artifact creature at 9+.”
Pomiar (charge 6, moje stwory 2/2 i 4/4, główna 2): obie oferty
(`tapOtherCreatureId` = 2/2 i = 4/4) dostają **identyczną notę 9** — pierwsza
z enumeracji (2/2) wygrywa. Skutek zgłoszony przez właściciela: 6 → 8 (tap 2/2)
→ 12 (tap 4/4), czyli 12 zamiast 10 i zbędnie tapnięty stwór 2/2. Przyczyna:
wycena bierze `threshold − charge` (odległość do progu), a nie **ile realnie
dołoży tapnięty stwór** (jego moc) ani **czy ta aktywacja domyka próg**.

### D. `xu-ifit-osteoharmonist` — brak badge'ów po reanimacji

Aktywacja: „Return target creature card from your graveyard to the battlefield.
It’s a Skeleton in addition to its other types and has no abilities.”
Pomiar: silnik robi wszystko poprawnie — PlayerView niesie `subtypes:
['Giant','Skeleton']` i `abilitiesStripped: true` (żywy obiekt ma też
`subtypesBeforeStrip: ['Giant']`), ale `buildStateOverlay` nie czyta ANI
`abilitiesStripped`, ANI dodanych podtypów → **badge'y = []** (render nie zna
dwóch faktów, które gracz musi widzieć na stole; klasa L1/ADR 0017).

## Naprawy (generyczne, ADR 0002; reuse istniejących miar — L41/L48)

1. **A (warp):** koniec flat +5; nowa miara `warpEtbHostPayoff` = suma
   `counterHostValue` najlepszych (do `count`) MOICH stworów z pominęciem samej
   rzucanej karty, z progiem „wart wzmocnienia” (`warpEtbHostMin`; tokeny i gołe
   2/2 poniżej progu). Gdy karta ma ETB z wymogiem celu, a żaden gospodarz progu
   nie przechodzi → kara `warpFutileEtbPenalty` (warp schodzi pod pass: „100%
   straty”). Gdy rzut normalny JEST oferowany → kara `warpRedundantPenalty`
   (jak `plotRedundantPenalty` w PMSSB-35/B1, L41). Pokrętła ×0 = stan sprzed zmiany.
2. **B (untap triggera):** `untap_permanent` wchodzi do listy PRZYJAZNYCH efektów
   triggera (silnik, `effect-intent.js` — jedno źródło dla ofert i bota), a wycena
   celu (friendly) używa wspólnej miary odkręcania `untapTargetValue`
   (własny TAPNIĘTY stwór = realna wartość; ląd = 0/ujemne; cudzy = ujemne) —
   ta sama miara co w ścieżce czaru i aktywacji (L41: dotąd dwie kopie).
3. **C (station):** wycena liczy `added = moc tapowanego stwora`, `progress =
   min(added, threshold − charge)`, premia za domknięcie progu
   (`stationCloseBonus`) i kara za nadmiar (`overshoot`) — kolejność „najpierw
   najmocniejszy” wychodzi z samej monotoniczności `progress` (M429: pokrętło ×0
   zostawia poprawkę kolejności, zdejmuje tylko premię za domknięcie).
4. **D (badge'y):** PlayerView niesie `subtypesBeforeStrip` (fakt publiczny
   efektu, jak `abilitiesStripped` i jak `subtypesBeforeOverride` — ADR 0017),
   a `buildStateOverlay` dokłada badge `bez zdolności` (`abilitiesStripped`)
   i `typ: +Skeleton` (dodane podtypy).

## Weryfikacja

Test `test/audyt-pmssb41-uwagi-testow.test.js` (bloki A–D + kontrole anty-over-fix).
Mutacje po commicie: (a) flat +5 wraca, (b) brak `untap_permanent` w liście
przyjaznej, (c) `progress` liczone po odległości do progu, (d) badge usunięty.
Bramy: `npm test`, `node tools/run-tests.mjs all`, build; golden-master; wpis
w hubie (§PMSSB-41) + rejestr + `PROJECT_HISTORY.md`; PR #151 rozszerzony.

## Postęp (2026-10-03b, zamknięte)

Kroki 0–7 wykonane. Commity: plan `59f6821`, kod + test `8915d03`, golden-master `20969a3`,
piny sąsiednich rodzin `b1df1f1` (wszystkie wypchnięte na `arena/01a0fe59-mtg`).

**Pomiary potwierdzające naprawy** (PO):
- **A** (`/tmp/pr/probe-a-final.mjs`): 6 lądów → `cast_permanent` 71,1 (warp −89); 3 lądy bez
  stworów → `pass_priority` (warp −29); token 2/2 → `pass_priority`; 3/3 → warp 85; 4/3 trample
  → 89; 2/1 flier + bloker → 82; dwa 3/3 → 109. Kalibracja progu: `probe-hostmin.mjs`
  (token 18, vanilla 16, hill-giant 24, tackle-artist 28, flier+zablokowany 20) → `warpEtbHostMin 20`.
- **B** (`probe-uwagi2.mjs`): wszystkie oferty `friendly=true`, wybór `myCre`, wyniki 14 / −4 /
  −25 / −25 (`foeCre` = `foeLand`).
- **C** (`probe-c-final.mjs`): charge 6 → tap 4/4; charge 8 → tap 2/2; charge 9 → pass;
  charge 5 → tap 6/6; etykiety śladu `activate_ability(wr#1+station:c4)`.
- **D** (`probe-d3.mjs`, pełny tor silnika): badge `["bez zdolności","typ: +Skeleton","choroba"]`.

**Mutacje (m1–m9, RED):** 5 / 2 / 1 / 1 / 1 / 1 / 3 / 1 / 1 — szczegóły w §PMSSB-41 hubu.
Dwie mutacje przeżyły pierwsze podejście (`progress` bez klampu, brak kary za nadmiar) i wymusiły
dodatkowe piny C7 (remis rozstrzygany enumeracją) i C8 (premia za domknięcie progu).

**Ewaluacja:** golden-master — dryf 2/6 partii (talie z `untap_permanent`: tenth-district-veteran,
midnight-guard; `scoreSum` +107/+80, decyzje i `chosenKinds` bez zmian) → świadoma regeneracja
`20969a3`; tie-audit PO 24 partie / 12 612 decyzji, 26,9% (9,9% akcyjnych), GROZY 13;
mirror-eval nowy kod vs kopia `5cc7058`: **30:18 (0,6250)**, 0 niedokończonych.

**Bramy:** fast **7474/7474** EXIT 0 · all **7745/7745** EXIT 0 · build **70 modułów / 4790,6 kB**.
Trzy regresje ujawnione przez bramę fast (PMSSB-35 D1, M277 kontrakt widoku, klasa
„zatapianie” w komentarzu) naprawione w `b1df1f1`.
