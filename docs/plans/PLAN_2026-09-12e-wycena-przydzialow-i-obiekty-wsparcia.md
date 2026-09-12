# PLAN 2026-09-12e — wycena przydziałów obrażeń (pokrycie lethal) + sierota `scryfall-undercity-dungeon.json`

**Sesja:** `arena/01a0925f-mtg` (PR #114 — ten sam PR, kontynuacja po `3286b50`).
**Baza:** `3286b50` (handoff: stan końcowy sesji). **Bramki na starcie:** `npm test`
5255/5255, `npm run build` 61 modułów / 3533,4 kB, quick benchmark 84,2% (566/672),
narzędzie druków exit 0 (DO POBRANIA 0), CI PR #114 zielone, Żywy Tester 13 partii /
795 sond / 0 zgłoszeń detektorów.

**Zlecenie właściciela (2026-09-12, odpowiedź na handoff):**

> (1) wycena bota przy przydziałach (lethal-first nie wykorzystuje pokrycia lethal
> przez inne stwory — po W5/B1 legalne, ale bot z tego nie korzysta)
>
> (2) sierota `scryfall-undercity-dungeon.json` (snapshot karty nieobecnej w
> rejestrze; czy dungeon ma dostać wpis — to ADR 0029, czyli Twoja decyzja)
>
> Ta karta jest w grze. Jest wyświetlana w panelu specjalnym po rozpoczęciu Wyprawy
> (mechanika Take an initiative). Na pewno nie wolno tego skasować bo panel działa
> dobrze i karta pokazuje się poprawnie. Nie wiem ten json jest wykorzystywany czy
> nie. Jak nie to pewnie można go skasować, nie wiem, do twojej decyzji.

## Punkt zaczepienia — pomiar, nie rekonstrukcja (L7/L92, ADR 0030 §2)

### Z2.1 Sierota: kto ją czyta

* `grep -rn "undercity-dungeon"` (bez `node_modules`/`.git`/`dist`): trafienia
  WYŁĄCZNIE w `test/druki-druga-strona-i-uuid-obrazu.test.js` (D/14, 3 linie) i w
  trzech dokumentach (HANDOFF ×2, raport ×2, PROJECT_HISTORY). **Żaden plik `src/`
  ani `tools/` (poza narzędziem audytowym przez konwencję nazw) jej nie czyta.**
* `grep -rn "docs/cards" src tools scripts *.mjs package.json`: `docs/cards/*.json`
  nie są czytane w runtime ani w buildzie — to materiał źródłowy („dane Oracle
  pobrane przed kodowaniem"), z którego ręcznie kodowano `src/cards/card-data.js`.
* Panel: `src/table/render.js:4636` → `img.src = UNDERCITY_DUNGEON.imageUri`, a
  `UNDERCITY_DUNGEON` (`src/cards/card-data.js:3917`) ma zaszyte
  `imageUri: 'https://api.scryfall.com/cards/tclb/20?format=image'`. Panel NIE
  czyta snapshotu — więc usunięcie pliku nie zepsuje panelu (zgadza się z obserwacją
  właściciela, że panel działa).
* Zawartość snapshotu (pomiar): `name` „Undercity // The Initiative", `set` `tclb`,
  `collector_number` `20`, `layout` `double_faced_token`, `source`
  `https://api.scryfall.com/cards/2c65185b-6cf0-451d-985e-56aa45d9a57d`,
  `image_uris.large` z TYM SAMYM UUID, `card_faces` = **pełny Oracle obu twarzy**
  (komnaty lochu: Secret Entrance, Forge, Lost Well, …) — czyli dowód dla ręcznie
  zakodowanego `UNDERCITY_ROOMS` w `src/engine/effects.js`; `legacy_image_uri`
  **identyczny** z `UNDERCITY_DUNGEON.imageUri` (tclb/20), `legacy_special_id`
  990006, `pobrano` 2026-08-03, `set_name` Commander Legends: Battle for Baldur's
  Gate, `illustration_id` obecny.
* Arkusz kolekcji: `grep -in "undercity\|tclb\|dungeon" tools/collection-art-ids.csv`
  → **0 wierszy**. Karty NIE ma w kolekcji właściciela, więc ADR 0029 zakazuje
  dopisywać jej do rejestru kart (rejestr rośnie wyłącznie z kolekcji).
* Drugi obiekt wsparcia (`DAY_NIGHT_TOKEN`, `card-data.js:3909`) snapshotu NIE ma —
  asymetria jest historyczna, nie celowa.

**Decyzja (delegowana przez właściciela): NIE kasować, NIE dopisywać do rejestru.**
Uzasadnienie: plik jest jedynym zapisem Oracle obu twarzy lochu i prowieniencją
zaszytego adresu obrazu używanego przez panel (`legacy_image_uri` == `imageUri`,
zmierzone) — skasowanie zniszczyłoby dowód, a dopisanie do rejestru złamałoby
ADR 0029 (brak w arkuszu) i zmieniło liczbę kart (509) oraz klasyfikację narzędzia.
Przyczyna źródłowa „sieroctwa" jest inna: model przeglądu zakładał, że każdy
snapshot odpowiada KARCIE Z REJESTRU, a obiekty wsparcia (lochy, znacznik dnia/nocy)
są eksportami tego samego modułu poza rejestrem — i nazwa pliku (`undercity-dungeon`)
nie jest równa id obiektu (`undercity`), więc dopasowanie było niemożliwe.

### Z2.2 Wycena przydziałów: dlaczego bot „nie korzysta"

* Bot NIE wybiera przydziału: `legalCommands` oferuje **dokładnie jeden** wariant
  (`src/engine/game-state.js:7050-7057`, M66/R — kombinacji nie enumerujemy, człowiek
  ma wizard), a `src/controllers/heuristic-bot.js:6253` to `return finish(0)` z
  komentarzem „dokładnie jeden wariant (lethal-first)". **Nie ma więc czego wyceniać**
  — dźwignią jest JAKOŚĆ deterministycznego planu domyślnego, który bot bierze
  w całości (i który jest punktem startowym wizarda człowieka).
* Pokrycie lethal przez inne stwory jest zaimplementowane TYLKO w gałęzi trample:
  `defaultDamageAssignment` (`src/engine/combat.js:587-616`) zmniejsza `need`
  wyłącznie `if (trample && context)` — to zakres B1 (zlecenie właściciela
  2026-09-12c). Bez trample kontekst jest ignorowany (test B1/5 to utrwala).
* Strona BLOKERA nie ma pokrycia WCALE: `defaultBlockerDamageAssignment`
  (`combat.js:661-674`) nie przyjmuje kontekstu, a `buildDefaultDamageAssignments`
  (`combat.js:807-830`) dla `role === 'blocker'` liczy przydziały bez mapy
  sekwencyjnej (dla atakujących — z mapą, B1).
* Walidatory zmian NIE wymagają: `validateDamageAssignment` dla atakującego bez
  trample sprawdza tylko permutację, sufit mocy i PEŁNĄ sumę (CR 510.1a/c —
  „podział między blokerów jest dowolny"), `validateBlockerDamageAssignment` nie ma
  warunku lethal w ogóle. Czyli przekierowanie obrażeń ze stwora, którego lethal
  pokrywają inni, jest legalne po obu stronach.

**Zmierzona strata (sondy `/tmp/probe-p.mjs`, `/tmp/probe-p2.mjs`, ten sam harness
co B1 — Cenn's Tactician daje drugi slot bloku):**

| scenariusz | plan domyślny DZIŚ | wynik dziś | plan po zmianie | wynik po zmianie |
| --- | --- | --- | --- | --- |
| A: `a` 4/4 **bez trample** blokowana przez `b1` 2/2 i `b2` 3/3; `z` 3/3 blokowana przez `b1` (lethal `b1` = 2 pokryty przez 3 od `z`) | `a: [{b1:3},{b2:1}]` | `b1` ginie, **`b2` przeżywa z 1 obrażeniem** — 1 zabity | `a: [{b1:0},{b2:4}]` | `b1` ginie od `z`, `b2` ginie — **2 zabite** |
| B: `w` 3/3+1/+1 (moc 4) blokuje `a1` 2/2 i `a2` 3/3; `v` 2/2 blokuje `a1` (lethal `a1` = 2 pokryty przez `v`) | `w: [{a1:2},{a2:2}]` | `a1` ginie (4 obrażeń), **`a2` przeżywa z 2** — 1 zabity | `w: [{a1:0},{a2:4}]` | `a1` ginie od `v`, `a2` ginie — **2 zabite** |

W obu przypadkach suma przydziału się nie zmienia (cała moc rozdzielona, CR 510.1a) —
zmienia się tylko ROZKŁAD, więc reguły są nietknięte, a bot zyskuje zabójstwo.

## Kroki

### K1 — obiekt wsparcia jako kategoria przeglądu (bez kasowania, bez rejestru)

1. `git mv docs/cards/scryfall-undercity-dungeon.json docs/cards/scryfall-undercity.json`
   (nazwa pliku = id obiektu wsparcia, ta sama konwencja co `scryfall-<id>.json`;
   po rename grep całego repo na starą nazwę — L: „snapshot filename must equal id").
2. `tools/check-card-printings.mjs`: kategoria obiektów wsparcia **wyprowadzona z
   modułu, którego używa gra** (zero nazw wpisanych na sztywno w narzędziu):
   import `UNDERCITY_DUNGEON`, `DAY_NIGHT_TOKEN` → `obiektyWsparcia()` zwraca
   `[{ id, name, imageUri, typeLine }]`; nowa czysta funkcja
   `przegladObiektowWsparcia({ obiekty, snapshotOf })` klasyfikuje każdy obiekt:
   `W-potwierdzony-offline` gdy snapshot istnieje i (a) `set`+`collector_number`
   snapshotu zgadzają się z setem/numerem wyciągniętym z `imageUri` obiektu
   (`/cards/<set>/<nr>?format=image`), (b) UUID z `source` == UUID z `image_uris`,
   (c) snapshot ma twarze (`card_faces`) — inaczej `W-<powód>` z mierzalnym powodem.
   CLI drukuje sekcję po klasach prowieniencji.
3. Test D/14 → przeformułowany: **sierot brak** (każdy snapshot odpowiada id karty
   z rejestru ALBO id obiektu wsparcia), zbiór snapshotów obiektów wsparcia ==
   dokładnie `['undercity']` (mierzone — pilnuje cichego przyrostu), cross-check
   set/numer/UUID/twarze oraz `legacy_image_uri == UNDERCITY_DUNGEON.imageUri`
   (proweniencja adresu, którego używa panel). Nowe testy `W/1…W/n` w osobnym pliku
   `test/obiekty-wsparcia-poza-rejestrem.test.js` (prefiks `W/` wolny — pomiar
   `grep -rhoE "^test\('[A-Z]+[0-9]?/"`).
4. Bramka: `npm test` cały pakiet (nie tylko dotknięty plik), narzędzie exit 0,
   `npm run build` (snapshot nie wchodzi do bundla — sprawdzić rozmiar).

### K2 — pokrycie lethal w planie domyślnym po OBU stronach (wycena, nie reguły)

1. `src/engine/combat.js`: symetryczne helpery dla kierunku bloker → atakujący
   (`assignedToAttackerThisPass`, `damageAssignedToAttackerThisPass`,
   `lethalAssignedByOtherBlockersThisPass`) z tymi samymi konwencjami co istniejące
   dla atakujących: przebieg (`inFirstStrikePassOf`/`inRegularPassOf`), deathtouch
   → każde niezerowe obrażenie jest lethal (CR 702.2b), jawne przydziały z mapy,
   `onlyAssigned` pomija stwory z decyzją, której jeszcze nie ogłoszono (polityka
   sekwencyjna B1 — inaczej każdy zakładałby, że pokryje ktoś inny).
2. `defaultDamageAssignment`: `need` liczony z pokryciem **niezależnie od trample**
   (trample zachowuje dotychczasowe zachowanie — nadmiar legalnie idzie na gracza);
   reszta bez trample nadal do OSTATNIEGO celu (konwencja E8/B3; pomiar: reszta > 0
   zachodzi tylko gdy wszystkie cele są już zgładzone, więc wybór celu reszty jest
   neutralny dla wyniku — bez martwej gałęzi „pierwszy niezgładzony").
3. `defaultBlockerDamageAssignment(…, context)`: to samo po stronie blokera;
   `defaultBlockerDamageAssignmentFor` dostaje opcjonalny kontekst (publiczna
   powierzchnia testowa, jak `defaultDamageAssignmentFor`).
4. `buildDefaultDamageAssignments`: dla `role === 'blocker'` przydziały liczone
   SEKWENCYJNIE z przekazywaną mapą (jak dla atakujących w B1) — kolejny bloker
   widzi, ile lethal pokrywają wcześniejsi.
5. Testy `P/1…P/n` w `test/p-wycena-przydzialow-pokrycie-lethal.test.js`: oba
   zmierzone scenariusze end-to-end (oferta → `execute` → kto ginie), przypadki
   ujemne (bez pokrycia plan się NIE zmienia — regresja M66/E8-B3 i B1/3),
   deathtouch po stronie blokera, trample bez zmian (B1/1, B1/4), legalność każdego
   planu domyślnego w swoim walidatorze, sekwencyjność przy dwóch blokerach z
   decyzją, przypadek „wszystkie cele pokryte" (cała moc do ostatniego, pełna suma).
6. **Świadoma korekta testu B1/5**: jego druga część utrwala „bez trample pokrycie
   NIC nie zmienia" — to dokładnie zachowanie, które właściciel kazał zmienić.
   Asercja `[{b1:3},{b2:3}]` → `[{b1:0},{b2:6}]` z uzasadnieniem (wynik w tym
   scenariuszu neutralny: obaj i tak giną, ale jedna polityka zamiast specjalnego
   przypadku trample) i z zachowaniem części pierwszej (bez pokrycia → `[2,4]`,
   bez zmian). Tytuł testu zaktualizowany.
7. Bramki: `npm test` cały pakiet; jeśli posypią się inne testy z dokładnymi
   planami — każdy przypadek rozstrzygnąć jako „świadoma korekta z uzasadnieniem"
   albo „moja zmiana jest zła" (bez maskowania); quick benchmark (win-rate może się
   przesunąć — pomiar uczciwie, także w dół); golden master `bot-scoring-snapshot`
   (jeśli churn — regeneracja świadoma z uzasadnieniem, jak po W4); `npm run build`;
   Żywy Tester ≥3 partie na świeżym `dist/` (sondy no-op, detektory, niewycenione
   ruchy bota) — po zmianie wyceny to obowiązek (L76), nie opcja.

### K3 — dokumenty i PR

HANDOFF (nowa sekcja + korekta „materiału na kolejną sesję", bo oba jego punkty
zostają domknięte), `docs/audits/WERYFIKACJA_DRUKOW_KOLEKCJI_2026-09-12.md`
(sierota → obiekt wsparcia, sekcja 6/7), `docs/PROJECT_HISTORY.md` (wpis),
opis PR #114 przez REST PATCH (`gh api -X PATCH … -F body=@plik`) — sekcja 13.
Commity przyrostowe, każdy samodzielnie zielony i od razu przepchnięty (ADR 0020);
przed każdym pushem `git log -1` + `git ls-remote` (incydent cofnięcia referencji).

## Ryzyka i granice

* Zmiana K2 dotyka planu domyślnego, który jest TEŻ punktem startowym wizarda
  człowieka — zachowanie legalne i korzystniejsze, ale widoczne; odnotować w
  dokumentach.
* Liczba ofert się NIE zmienia (M66/R nietknięte) — bot nadal ma jeden wariant,
  więc nie ma ryzyka wybuchu kombinatorycznego ani zmiany odcisku bram logu.
* Benchmark i golden master mogą się przesunąć: raportujemy pomiar, nie życzenie.
  Pełny B0 (~23k meczów) tylko na polecenie właściciela (ADR 0018).
* Nie dodajemy karty do rejestru (ADR 0029) i nie kasujemy snapshotu (proweniencja
  Oracle i adresu obrazu panelu).
