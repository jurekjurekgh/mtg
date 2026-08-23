# PLAN M193 — zgloszenie wlasciciela A/A1: kolory zrodel many (2026-08-22)

Zgloszenie wlasciciela z testow recznych (po Batchu 46, w trakcie petli
jakosci M192):

- **A.** Dismal Backwater nie jest traktowana jako zrodlo many niebieskiej
  ani czarnej. Land lezy na stole, razem z innym ladem daje mane na czar,
  ale oferty rzutu NIE MA w „Twoje dzialania" — auto-pass oddaje priorytet
  botowi i konczy ture. Czar za mane BEZBARWNA (artefakt) w kolejnej turze
  dziala. Podejrzenie wlasciciela: „moze to kwestia nie liczenia kolorow"
  i „tak jest pewnie ze wszystkimi zrodlami many poza basic landami".
- **A1.** Po aktywacji zdolnosci {T} log pisze „dodanie many do puli
  ({U}, {B})". Powinno byc: „dodanie 1 many niebieskiej lub czarnej do puli"
  (analogicznie do naprawy M190/A2 dla Heap Gate).

## Repro (potwierdzone przed kodowaniem)

Scenariusz wlasciciela — Dismal Backwater + Mountain, w rece czar za {1}{U}:
oferta rzutu **BRAK**. Kontrola Island+Swamp -> {U}{B}: oferta JEST.

## Root cause (A)

`getSourceForObject()` w `src/engine/mana-sources.js` ustala kolory produkcji
z DWOCH zrodel: podtypow podstawowych ladu (CR 305.6) i RECZNEJ mapy
`MANA_SOURCE_MAP` (cardId -> kolory). **Nie czyta deskryptorow zdolnosci
karty.** Dismal Backwater nie ma podtypu Island/Swamp i nie ma wpisu w mapie,
wiec wpada w fallback „land bez danych = bezbarwna" — mimo ze w danych karty
jej zdolnosc niesie `{ type: 'add_mana', colors: ['U','B'] }` (zgodnie
z Oracle „{T}: Add {U} or {B}").

To klasa L14/L41: **dwa zrodla prawdy** o tej samej regule. Deskryptor
zdolnosci (Oracle) mowi swoje, mapa mowi swoje, a silnik sluchа mapy.
Kazda nowa karta ze zdolnoscia many, ktorej autor nie dopisze recznie do
mapy, po cichu produkuje mane bezbarwna. Objaw dla gracza jest dokladnie
taki, jak w zgloszeniu: koszty generyczne dzialaja, kolorowe pipy nie.

**Skan calego katalogu** (parser Oracle „Add …" vs kolory znane silnikowi)
— cztery karty rozjechane:

| Karta | Oracle | Silnik |
|---|---|---|
| Dismal Backwater | {U}{B} | (bezbarwna) |
| Balamb Garden, SeeD Academy | {G}{U} | (bezbarwna) |
| Heap Gate | {C} + any | (bezbarwna) |
| Fertile Thicket | {G} | (bezbarwna) |

Fertile Thicket ma dodatkowo BRAK deskryptora zdolnosci many (Oracle
„{T}: Add {G}" nie zostal zakodowany) — luka danych karty.

## Root cause (A1)

`ABILITY_EFFECT_LABELS.add_mana` to staly napis „dodanie many do puli",
do ktorego log doklеja liste symboli w nawiasie. M190/A2 naprawilo tylko
przypadek PIECIU kolorow („1 mana dowolnego koloru"); konkretna lista nadal
wychodzi zargonem symboli („({U}, {B})") zamiast polskim zdaniem.

## Kroki (kazdy osobnym zielonym commitem, ADR 0020 C)

- [ ] K0: ten plan -> commit/push
- [ ] K1 (A): test RED — scenariusz wlasciciela (DB + Mountain, czar {1}{U})
      + STRAZNIK katalogu (Oracle „{T}: Add …" vs kolory silnika)
- [ ] K2 (A): naprawa u ZRODLA — `getSourceForObject` czyta kolory
      z deskryptorow zdolnosci many o koszcie SAMO {T} (jedno zrodlo prawdy);
      mapa zostaje wylacznie dla kart bez deskryptora (produkcja implikowana)
- [ ] K3 (A): uzupelnienie danych Fertile Thicket wg Oracle
- [ ] K4 (A1): opis many po polsku — jedno zrodlo dla logu i panelu (L41)
- [ ] K5: weryfikacja mutacyjna obu naprawionych sciezek + `npm test` + build
- [ ] K6: powrot do petli jakosci M192 (Zywy Tester) — Z2/Z3 do odtworzenia
- [ ] K7: dokumentacja (PROJECT_STATE, opis PR #70, LESSONS jesli nowa klasa)

## Ryzyka / pulapki

- **Koszt zdolnosci ma znaczenie**: do auto-tapu (oferta = platnosc, L48)
  wolno liczyc TYLKO zdolnosci o koszcie samo {T}. Heap Gate „{1},{T}: Add
  any" i Jeskai Devotee „{1}: Add {U},{R},{W}" NIE moga podnosic kolorow
  darmowej produkcji — inaczej silnik zaoferuje czar, ktorego nie da sie
  oplacic (odwrotny bug tej samej klasy).
- Fallback po `gameObject.colors` przypadkiem ratowal czesc kart
  (Immersturm Skullcairn ma `colors: ['B']`) — po naprawie ma dzialac
  z deskryptora, nie z przypadku.
- Landy maja OSOBNA galaz materializacji (`landData`) — deskryptory zdolnosci
  juz tam docieraja (`abilities`), wiec dane sa na obiekcie gry.
- Zmiana listy `abilities` karty przesuwa indeksy zdolnosci — sprawdzic testy
  odwolujace sie do `abilityIndex`.

## Wynik

(uzupelniany w trakcie)
