# Handoff — zgłoszenie „J. Undercity”: etykiety pokoi lochu (2026-11-07)

Sesja: `arena/b2771170-mtg`, PR #181. Zgłoszenie zamknięte w tym samym
commicie co naprawa; niniejszy plik to punkt zaczepienia dla kontynuacji.

## Zgłoszenie (dosłownie)

Właściciel: „Kolejne pokoje Undercity mają źle opisane efekty — ani w
«Twoje działania», ani w modalach wyboru nie wiadomo, o jaki pokój chodzi
ani jaki jest jego efekt.” Przykład: Forge → modal pokazywał
„Wybierz: Cel pokoju lochu”. Wymaganie: **za każdym razem dokładnie napisane,
JAKI to pokój i JAKI efekt celujemy** — w modalach wyboru i w panelu działań.

## Co było źle (root cause)

1. Intro modala i grupa w panelu brały deskryptor typu żądania
   (`CHOICE_GROUP_TYPE_DESCRIPTORS['room-target'] = 'Cel pokoju lochu'`)
   — bez nazwy pokoju i bez efektu.
2. Wiersz opcji celu nazywał pokój, ale nie efekt
   (`Pokój Forge: wybierz cel — <stwór>`).
3. Oferta trasy nazywała pokój docelowy, ale nie jego skutek
   (`Podziemia — idź do: Forge`) — gracz wybierał drogę „w ciemno”.

## Naprawa (commity na gałęzi)

- **`src/engine/effects.js`** — nowe czyste `undercityRoomEffectText(roomName)`:
  polski opis efektu pokoju **wyprowadzany z danych `UNDERCITY_ROOMS`**
  (switch po typie efektu; L41 — brak ręcznej kopii opisów), z fallbackiem
  `'efekt pokoju lochu'` dla nieznanego pokoju. Przykładowe teksty:
  Forge → „2 liczniki +1/+1 na wybranym stworze”, Trap! → „wybrany gracz
  traci 5 punktów życia”, Lost Well → „scry 2”, Throne → „odsłoń 10 kart,
  stwór spośród nich z 3 licznikami +1/+1 i hexproof do twojej następnej tury”.
- **`src/table/render.js`**
  - `choiceGroupTitle`: dla `room-target` / `resolve_room_target` zwraca
    `Pokój <nazwa> — <efekt>: wybierz cel` (z `view.pendingRoomTarget`).
    Ten sam tytuł zasila **intro modala** (main.js: `introLabel` ←
    choiceGroupTitle) i **grupę w panelu „Twoje działania”** (choiceGroupLabel
    spada na choiceGroupTitle) — jedno źródło.
  - `commandLabel` → `resolve_room_target`: prefiks wiersza opcji =
    `Pokój <nazwa> — <efekt>: wybierz cel — <kandydat>` (escapeHtml).
  - `commandLabel` → `resolve_undercity_route`: `Podziemia — idź do: <pokój>
    — <efekt>` (prefiks M190/B nietknięty, doklejony skutek).
- **`src/table/choice-request.js`** — `CHOICE_TYPE_LABELS['room-target']`
  to jawnie AWARYJNY fallback („Wybór celu — pokój lochu Undercity”); realny
  tytuł zawsze przychodzi z choiceGroupTitle jako introLabel.

## Piny

- **`test/zgloszenie-j-undercity-etykiety-pokoi.test.js`** (3 warstwy):
  - J/1 silnik — `undercityRoomEffectText` opisuje wszystkie 9 pokoi, bez
    surowych typów efektów, fallback dla nieznanego pokoju;
  - J/2 Forge (cel stwora) — tytuł modala + grupa panelu + wiersz opcji
    nazywają pokój i efekt, wiersz nosi kandydata, zero „Cel pokoju lochu”;
  - J/3 Trap! (cel gracza) — te same gwarancje dla każdego wiersza;
  - J/4 trasa — „Podziemia — idź do: Forge — <efekt>” / „…Lost Well — scry 2”;
    tytuł grupy trasy pozostaje „Ścieżka w Undercity” (pin M200/A2).
- **`test/table-tester-detectors.test.js` (M103)** — fixtury dopięte o nowe
  kształty etykiet („Pokój Forge — …: wybierz cel (N opcje)”): detektor
  „grupa bez ptaszka” nadal NIE zgłasza obowiązkowych decyzji pokoi.

## Bramy

- fast: **10 091/10 091** (4 nowe testy), test:all: **10 360/10 360/0**,
  build: **78 modułów / 5772,2 kB**; sanity-grep potwierdza nowe etykiety
  w zbudowanym `dist/mtg-table.html`.

## Otwarte nitki

- **Zgłoszenie J (granica tury, wariant bez DFC) — WSTRZYMANE przez właściciela**
  („na razie odłóżmy; jak błąd się pojawi ponownie, będziemy szukać”).
  Protokół przy nawrocie: `HANDOFF_2026-11-07-zgloszenie-j-granica-tury.md`
  (najpierw „Eksportuj zapis”, potem talie + numer tury).
- Nazwy pokoi pozostają angielskie (Forge, Trap!, …) — to nazwy własne kart
  Oracle; opisy efektów są po polsku. Jeśli właściciel zechce polskie nazwy
  pokoi, to decyzja translacyjna osobno (dotyka wszystkich etykiet naraz).
- Boczny panel lochu (postęp: „Dalsza droga: Forge albo Lost Well”) nadal
  pokazuje same nazwy — poza zakresem zgłoszenia (właściciel wskazał
  „Twoje działania” + modale); łatwo dokleić `undercityRoomEffectText`,
  gdyby poprosił.

## Recovery po resecie gałęzi (wzorzec platformowy)

Jeśli lokalna gałąź wróciła do `d2e0d61` i push jest odrzucony:
niezacommitowane zmiany → `cp` do untracked tmp; potem
`git fetch origin arena/b2771170-mtg && git reset --hard origin/arena/b2771170-mtg`;
przywrócić tmp; commit + push. Po resecie `tools/table-tester/node_modules`
znika — przed użyciem driverów `npm i` w `tools/table-tester` i `npm run build`
w głównym repo.
