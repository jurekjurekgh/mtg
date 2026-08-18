# Talie w repozytorium

Talie są wersjonowanymi plikami tekstowymi (ADR 0011, ADR 0012). Format jest
dokładnie tym samym formatem, który kreator talii kopiuje i pobiera:

```text
# Nazwa talii

1x Highland Game
1x Woolly Loxodon
11x Forest
```

## Zasady (paradygmat singleton, decyzja właściciela 2026-08-04)

- jedna linia na kartę: `<liczba kopii>x <nazwa karty>`;
- nazwa musi odpowiadać definicji z katalogu (`src/cards/card-data.js`);
- talia może odwoływać się wyłącznie do kart o statusie `supported` —
  naruszenie wykrywa test (`test/repo-decks.test.js`), nie dopiero gra;
- **singleton**: każda karta (poza landem podstawowym) max **1 kopia**;
  **lądy podstawowe bez limitu** (ich liczba jest dowolna, dopasowana do talii);
- **minimum 15 kart nielandowych** w talii (lądy podstawowe się nie liczą).

Walidację wymusza `validateDeck` (`src/cards/deck-validation.js`) — domyślnie
`maxCopies=1`, `minNonland=15`. Format tekstowy i round-trip pilnuje
`test/repo-decks.test.js`.

## Bieżące talie (9, hybryda: kolor + setting)

- `green.txt`, `black.txt`, `red.txt` — talie mono-kolorowe (G/B/R) + karty
  bezbarwne/wielokolorowe uzupełniające do 15 nielandowych;
- `innistrad.txt` — setting Innistrad (gotycki horror, 5 kolorów);
- `azorius.txt` — biało-niebieskie tempo (W/U);
- `wiedzmin.txt` — Wiedźmin + Wschód (G/U/B);
- `graveyard.txt` — cmentarz jako zasób (morbid, reanimacja, mill);
- `spellslinger.txt` — niebiesko-czerwony potok czarów i prowess;
- `tokens.txt` — generowanie tokenów + Moonlit Meditation.

Po M54 (audyt + Batch 23) wszystkie wspierane karty nielandowe mają swoje
miejsce w taliach (pilnuje test `repo-decks.test.js` „każda wspierana karta
nielandowa jest w którejś talii"): Batch 22 i 23 weszły do talii — red
dostał aggro/burn (Scorch Spitter, Stomping Slabs, Vandalize, Welder
Automaton, Shiv's Embrace), green bestie/rampę (Healer of the Glade,
Courage in Crisis, Deepwood Denizen, Vow of Wildness, Greater Tanuki),
azorius tempo/kontrolę (Wormfang Newt, Thistledown Players, Feedback,
Turn the Tide), black Expunge, tokens Raise the Alarm + Selesnya Charm,
spellslinger Enter the Enigma, graveyard Cellar Door, innistrad
Etherwrought Page.

Każda talia: 15–20 kart nielandowych (singleton) + lądy dopasowane do kolorów
(po M33 talie rosną wraz z batchami realnych kart — nowe karty trafiają do
swoich talii zamiast osobnych plików batchowych). Pula many engine jest
bezbarwna, więc kolor lądu to kwestia smaku — liczy się LICZBA lądów.

## Manabaza: reguła 2 : 1 (M132, zgłoszenie właściciela 2026-08-17)

**Na każde 2 karty nielandowe przypada co najmniej 1 ląd** (≈ 33 % lądów;
klasyczna manabaza Magic to ~40 %, czyli 17/40 albo 24/60). Górny limit to
55 % lądów — małe talie bywają landowo przeważone, ale nie bez granic.

Regułę egzekwuje `test/m132-proporcje-landow.test.js` i podaje wprost, ilu
lądów brakuje. **Dokładając karty do talii, dosyp lądy w tej samej zmianie** —
cztery talie (green 2,52 · red 2,32 · black 2,25 · azorius 2,18) zjechały
poniżej progu właśnie dlatego, że kolejne batche dokładały same czary,
a konwencja żyła wyłącznie w tym pliku, bez strażnika w testach.
