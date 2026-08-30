# M259 — Brązowa odznaka wyłapywacza błędów: wyzwanie właściciela (2026-08-30)

> **Kontekst:** po zamknięciu M258 (audyt PR #88, pętla jakości, F3/ward)
> właściciel ogłosił challenge: „znajdź i napraw 5 unikalnych błędów vs
> zasady MtG w istniejących kartach i mechanikach — inne modele mogły coś
> ominąć/pomylić/uprościć". Kontynuacja serii bug-huntów (M105/bronza
> 2026-08-16, M140, odznaka diamentowa). Sesja `arena/01a0526d-mtg`, PR #89.
>
> **Nota:** w tej samej turze domknięte D3/D4 z audytu PR #87 (decyzja
> właściciela: bezzasadne — porzucone), commit `dfcaf53`.

## Metoda (jak w M105)

1. **Rozpoznanie terenu:** mapa mechanik silnika (combat/SBA/many/priority
   zweryfikowane jako pokryte — CR 106.4, 701.12, 704.x, 702.82, 702.79
   potwierdzone w kodzie).
2. **Masowy audyt danych:** automatyczne porównanie WSZYSTKICH kart
   `REAL_CARDS` (184) ze snapshotami Scryfall (`docs/cards/scryfall-*.json`,
   155 pokrycia): CMC, power/toughness, typy, podtypy, kolory + skan
   słów kluczowych w Oracle text.
3. **Czytanie semantyczne:** zrzut Oracle text vs deskryptory efektów dla
   139 kart z mechaniką (kwoty, cele, timing, warunki, koszty kolorowe).
4. **Weryfikacja źródłowa:** dwie rozbieżności typu potwierdzone ŻYWYM
   API Scryfall (nie tylko snapshotem).

## Znaleziska (7 błędów, 4 klasy; wszystkie naprawiane)

| ID | Karta | Błąd vs zasady | CR/źródło |
|---|---|---|---|
| **B1** | Courage in Crisis | zamodelowana jako **Instant**, a to **Sorcery** — rzut w dowolnym momencie | Oracle/Scryfall (live), CR 307 |
| **B2** | Enter the Enigma | jw. — **Instant** zamiast **Sorcery** | Oracle/Scryfall (live), CR 307 |
| **B3** | Porcelain Legionnaire | **mana value 2 zamiast 3** — `manaCost` nie liczy symbolu {W/P}; Divine Offering (w puli!) daje 2 życia zamiast 3 | CR 202.3 |
| **B4** | Wormfang Newt | podtypy `Salamander` zamiast `Nightmare Salamander Beast` | CR 205.1 (type line) |
| **B5** | Healer of the Glade | podtypy `Elf` zamiast `Elemental` | CR 205.1 |
| **B6** | Lodestone Needle | craft **{2}{U}** zamodelowany jako 3 bezbarwne — brak pipa {U} | CR 118.2/601.2f |
| **B7** | Bone Shredder | echo **{2}{B}** płacone 3 bezbarwnymi — brak pipa {B} | CR 702.29 |

## Plan napraw

- **B1/B2/B5/B4:** korekta danych kart (`types`, `spell.timing`, `subtypes`).
- **B3:** `manaCost` 2→3 (pełna wartość MV) + korekta 4 miejsc arytmetyki
  płatności (koszt zawiera symbol phyrexian → `X - lifePaid` zamiast
  `X + (symbols - lifePaid)`): `resources.js` castPermanent,
  `game-state.js` warianty cast_permanent, `spells.js` castSpell
  (płatność + warianty). Zachowanie płatności bez zmian (3 many albo
  2+2 życia) — pokryte istniejącymi testami batch11.
- **B6:** `cost.colors: ['U']` w deskryptorze craft (enumeracja + płatność
  kolorowa istnieją — ta sama ścieżka co Trigon {B}{B}).
- **B7:** nowy deskryptor `echoColors` (przez deck.js → game-state.js →
  identity.js) + kolorowa bramka w `queuePayOrSacrifice` + pipy w płatności
  (`pay_mana` z `colors`).

## Testy

`test/m259-bug-hunt-bronza.test.js` — każdy znalezisko najpierw RED
(pokazany na kodzie sprzed naprawy), potem GREEN; testy behawioralne
przez `playerView`/`execute` (oferty, płatności, decyzje), nie tylko
asercje danych. Aktualizacja `test/real-cards-batch11.test.js`
(manaValue 2→3 w tabeli).

## Bramki — WYKONANE (2026-08-30)

- [x] testy m259 RED (9/11) → GREEN **11/11**; `npm test` **3847/3847**,
  `npm run test:all` **3857/3857**, build 56 mod / **2961.2 kB**.
- [x] Sanity: 8 pełnych partii botów (seeds 81–82, 4 pary decków ze
  zmienionymi kartami) — finished, **0 odrzuceń komend**; echo opłacone,
  courage-in-crisis rzucony jako sorcery.
- [x] Regeneracje legalne: `generate-plan-decks` (sort po MV), fixture
  golden-master (`bot-scoring-snapshot --write`); benchmark botów 10/10.
- [x] Dokumentacja: raport AUDYT_M259_BUG_HUNT, PROJECT_HISTORY, **L96**,
  README, opis PR #89.
- [x] Bonus poza plan: druga karta phyrexian (Ruthless Invasion, żyjąca
  poza REAL_CARDS) — objęta naprawą konwencji MV + zaktualizowane testy
  (batch48, strażnik katalogu z brązu 2026-08-16).
