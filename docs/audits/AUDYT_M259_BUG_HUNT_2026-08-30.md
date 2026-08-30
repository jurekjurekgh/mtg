# M259 — Brązowa odznaka wyłapywacza błędów: raport z łowów (2026-08-30)

> **Challenge właściciela:** „Przejrzyj istniejące karty i mechaniki i znajdź,
> a potem napraw 5 unikalnych błędów/uproszczeń vs zasady MtG. Inne modele
> w innych sesjach mogły coś ominąć, pomylić, uprościć niezgodnie z zasadami,
> ograniczyć." — podjęte, wykonane **nadwykonanie: 7 błędów** (4 klasy).
>
> Sesja `arena/01a0526d-mtg`, PR #89, plan:
> `docs/plans/PLAN_2026-08-30-m259-brazowa-odznaka-lowy.md`.

## Metoda (Sherlock, nie scanowanie na ślepo)

1. **Rozpoznanie:** mechaniki silnika przystawione do CR punkt po punkcie
   (regeneracja CR 701.12, SBA CR 704.x, pusta pula CR 106.4, persist
   CR 702.79 z warunkiem LKI, exalted CR 702.82, equip sorcery CR 702.6b,
   first/double strike, trample+deathtouch) — **pokryte**, niskie szanse.
2. **Masowy audyt danych:** automatyczne porównanie kart rejestru ze
   snapshotami Scryfall (`docs/cards/scryfall-*.json`, pobranymi z żywego
   API przy dodawaniu kart): CMC, power/toughness, linia typów, podtypy,
   kolory + skan słów kluczowych Oracle vs `keywords[]`.
3. **Czytanie semantyczne:** zrzut Oracle text vs deskryptory efektów
   (~140 kart z mechaniką): kwoty, cele, timing, warunki „as long as",
   koszty kolorowe, „only as a sorcery", once per turn.
4. **Weryfikacja źródłowa:** oba znaleziska timingowe potwierdzone ŻYWYM
   API Scryfall (nie tylko snapshotem z repo).

**Metodyczna pułapka wykryta po drodze:** 105+ prawdziwych kart żyje w
eksportcie `VIRTUAL_BASIC_LANDS` ( batching historyczny), nie w
`REAL_CARDS` — audyt po `REAL_CARDS` omijałby ~275 kart. Drugi przebieg
objął cały `registry.all()`. Wśród ukrytych kart wykryto **drugą kartę
phyrexian** (Ruthless Invasion {3}{R/P}) — naprawa konwencji MV objęła
ją automatycznie.

## Znaleziska (7 błędów, wszystkie naprawione)

| ID | Karta | Błąd vs zasady | Reguła | Fix |
|---|---|---|---|---|
| **B1** | Courage in Crisis | zamodelowana jako **Instant**, Oracle: **Sorcery** ({2}{G}, WAR) — rzut w dowolnym momencie z priorytetem | CR 307.1 | dane: types + spell.timing → sorcery |
| **B2** | Enter the Enigma | jw. — **Instant** zamiast **Sorcery** ({U}, DSK) | CR 307.1 | jw. |
| **B3** | Porcelain Legionnaire (+ Ruthless Invasion) | **manaCost nie liczył symboli {W/P}**: {2}{W/P} miał MV 2 (poprawnie 3); Divine Offering (w puli!) dawał 2 życia zamiast 3; sortowanie decków i filtry „MV ≤ N" czytały złą wartość | CR 202.3 | konwencja pełnego MV w `manaCost` + arytmetyka płatności `koszt − pipy życiowe` (4 miejsca) |
| **B4** | Wormfang Newt | subtypes `['Salamander']`, Oracle: **Nightmare Salamander Beast** | CR 205.1 | pełna linia typów |
| **B5** | Healer of the Glade | subtypes `['Elf']`, Oracle: **Elemental** (M20) | CR 205.1 | poprawa subtypów |
| **B6** | Lodestone Needle | craft **{2}{U}** zamodelowany jako 3 bezbarwne — craft bez źródła niebieskiego | CR 118.2/601.2f | `cost.colors: ['U']` |
| **B7** | Bone Shredder | echo **{2}{B}** płacone 3 bezbarwnymi — bez pipa {B} | CR 702.29 + 118.2 | deskryptor `echoColors` przez cały pipeline + kolorowa bramka opłacalności + pipy w płatności |

**Fałszywe tropy odrzucone** (dla rzetelności): 5 rozbiejności typów przy
MDFC/DFC (`//` w type_line — model dwutwarzowy poprawny), „Flying" w
oracle Wedgelight Rammmera (to cechy stacji 9+, obsługiwane), equip z
`timing: 'instant'` w danych (silnik wymusza sorcery CR 702.6b), brak
podtypu Aura przy Spectral Prison (model pola `aura`), Urza's Mine
(apostrof typograficzny w snapshotcie — tożsame semantycznie).

## Naprawa B3 — zmiana konwencji (największy zasięg)

Dotychczas: `manaCost` = koszt BEZ symboli phyrexian (Porcelain 2, Ruthless
3), a symbole doliczała arytmetyka płatności. Problem: **każdy odczyt MV w
silniku** (`object.manaCost` w filtrach efektów „mana value N or less",
triggers `spellManaValueAtLeast`, Divine Offering, sortowanie generatora
decków, wyceny botów) widział wartość zaniżoną o liczbę symboli.

Nowa konwencja: `manaCost` = pełna wartość MV (CR 202.3), a **płatność
odejmuje pipy opłacone życiem** (`koszt − k`). Poprawione miejsca:
`resources.js` castPermanent, `game-state.js` warianty cast_permanent
(+ bramka bazy liczująca z wariantem życiowym — regresja wykryta przez
istniejący test batch11), `spells.js` castSpell + warianty czarów +
buyback, `canPayMadnessCost`. Zachowanie płatności bez zmian
(3 maną / 2+2 życia; 4 maną / 3+2 życia) — pilnują tego istniejące testy
batch11 i m200.

## Weryfikacja

- **Testy RED→GREEN:** `test/m259-bug-hunt-bronza.test.js` — 11 testów
  (9 RED przed fixem, 2 kontrole GREEN); po fixie **11/11 GREEN**.
- **Aktualizacje testów istniejących** (zmiany ŚWIADOME, każda z komentarzem
  M259): strażnik katalogu w bug-hunt-2026-08-16 (nowa konwencja MV),
  tablica danych batch11, asercja MV Ruthless Invasion w batch48,
  materializacja batch1 (echoColors null-vs-[]).
- **Regeneracje legalne:** `tools/generate-plan-decks.mjs` (sortowanie decków
  po MV: Ruthless Invasion 3→4, Porcelain 2→3 — 2 pliki), fixture
  golden-master botów (`tools/bot-scoring-snapshot.mjs --write` — dywergencja
  w partii ravnica@1001, gdzie Courage in Crisis nie może już być rzucany
  jak instant; benchmark botów **10/10**, progi utrzymane).
- **Suite:** `npm test` **3847/3847**, `npm run test:all` **3857/3857**,
  build 56 modułów / **2961.2 kB**.
- **Sanity (pełne partie botów headless, 8 gier, seeds 81–82):** wszystkie
  finished, **0 odrzuceń komend**; echo Bone Shreddera odpaliło i zostało
  opłacone (seed 81 mirrodin), Courage in Crisis rzucony w main phase
  (seed 82 ravnica), Ruthless Invasion rzucana za manę (seed 81).

## Wnioski procesowe (→ LESSONS L96)

- Snapshoty Scryfall w repo to gotowy **masowy audyt danych** — porównanie
  pól mechanicznych wszystkich kart to kilkanaście minut pracy zamiast
  czytania 430 definicji; dwie klasy błędów (timing, subtypy) wyszły
  w całości stamtąd.
- **Audytuj po `registry.all()`**, nie po nazwie eksportu tablicy —
  `VIRTUAL_BASIC_LANDS` nosi 105+ prawdziwych kart.
- Konwencje deskryptorów („manaCost = X") bywają niejawne i rozjeżdżają
  się z CR — gdy pole ma odpowiadać regule (MV), warto mieć strażnika
  zgodności z MANA_COSTS (istniejący strażnik wyłapałby zmianę konwencji,
  gdyby nie był zakodzony w starej).
