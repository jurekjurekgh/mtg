# Plan — uwagi z gry 2026-09-23 (14 pozycji z jednej partii)

Zlecenie właściciela: „Dobra, to teraz uwagi z ostatniej mojej gry. 14 uwag
z jednej gry. Najwięcej do tej pory.” Poniżej surowe uwagi A–L (z podpunktami:
B1/B2, F1/F2/F3) i ich mapowanie na kod. Obowiązują zasady stałe: test RED
przed fixem, jedna przyczyna u źródła (L41 — jedno miejsce prawdy), commit
i push po każdym etapie, zero warunków po nazwie karty (ADR 0002).

| # | Uwaga właściciela | Gdzie boli | Etap |
|---|---|---|---|
| A | Somberwald Spider (i inne z Morbid) — bot ma je zagrywać tylko we własnej Głównej 2 (chyba że flash i zamierza atakować) | scoring okna rzutu (`heuristic-bot.js`) | E1 |
| B1 | Azorius Justiciar — „detain up to two” pokazuje WSZYSTKIE kombinacje zamiast modala wielowyboru z „Zatwierdź”; sprawdzić całą klasę | plan decyzji celu triggera (`multi-target.js`, `main.js`) | E2 |
| B2 | Zatrzymane (detain) permanentne mają dostać badge na czas trwania | widok + odznaki (`render.js`) | E3 |
| C | Piercing Rays — Forecast w „Twoich działaniach” jako „Cel zdolności: Piercing Rays”; ma być nazwa + koszt zdolności | tytuł grupy (`choiceGroupTitle`) | E2 |
| D | Cemetery Recruitment — bot bierze najtańszego stwora; ma brać najdroższego na jakiego ma manę (także z tapniętych lądów) | scoring celu (`heuristic-bot.js`) | E1 |
| E | „Deklaracja atakujących” nad „Dalej (Pass)”, „Deklaracja blokujących” na samym dole; ma być: Pass → obie deklaracje pod nim (sprawdzić „Rozdziel obrażenia”) | kolejność panelu (`groupCombatDecisions`) | E4 |
| F1 | Veiled Ascension — wpis „(możesz)” w panelu ma WYKONAĆ efekt po kliknięciu; „Dalej (Pass)” = nieskorzystanie; modal zbędny | decyzja „you may” (`game-state.js` + panel) | E2 |
| F2 | Veiled Ascension — cloak Aury zsyła ją do grobu „aura bez legalnego gospodarza”; zakryta karta to 2/2 bez typów (CR 708.2) i ma zostać na stole | ścieżka aur przy wejściu (`attachments.js`) | E3 |
| F3 | „Obróć twarzą do góry (Cloak): …” — brak kosztu odkrycia | etykieta `turn_cloak_face_up` | E2 |
| G | Dimir Guildgate w Mana Wizard: po zapłaceniu pipów kolorowych błędne źródła (Mountain) nadal klikalne; wizard ma ukrywać źródła nieprodukujące potrzebnego pipa | kreator many (`mana-wizard.js`) | E3 |
| H | KAŻDA oferta w „Twoich działaniach” niesie koszt, chyba że jest darmowa (instanty, sorcery, aury, zdolności) | etykiety/tytuły grup — przegląd całej warstwy | E2 |
| I | Chronic Flooding — bot tapuje zaczarowany ląd i mieli się na śmierć (5 kart w bibliotece); ma tego nie robić przy cienkiej bibliotece | wybór lądu do tapnięcia (scoring) | E1 |
| J | Epic Experiment — 5 wpisów dla X=0..3; ma być JEDEN wpis „(koszt XUR)”, potem modal X, potem Mana Wizard | plan ofert + kreator X | E2 |
| K | Klik w „Wybierz: deklaracja blokujących” czasem nie działa (press-down przebudowuje layout i release mija przycisk) | aktywacja przycisków akcji (`render.js`/`main.js`, CSS) | E4 |
| L | „Przebieg tur dla AI” ma być domyślnie rozwinięty jak log | `src/table/index.html` | E4 |
| M | Acidic Slime — wśród lądów przeciwnika bot ma brać, o ile to możliwe, ląd, którego ten ma TYLKO 1 kopię (blokada koloru), a nie ląd z kilkoma kopiami | scoring celu triggera (`heuristic-bot.js`) | E1 |

Uwaga M dołączyła po wysłaniu A–L (druga wiadomość właściciela z tej samej
partii) — razem 15 pozycji; plik planu zostaje pod nazwą historyczną.

## Etapy

### E1 — bot: timing Morbid, wybór karty z grobu, samomielenie lądu (A, D, I)

- **A**: karta z deskryptorem `entersWithCountersIf: { morbid: true }` dostaje
  preferencję okna **main2** własnej tury (po walce może być martwy stwór);
  wyjątek: `flash` → main1 dopuszczalny (bot może chcieć atakować).
  Reguła po deskryptorze danych, nie po nazwie karty.
- **D**: `return_card_from_graveyard_to_hand` — wartość celu rośnie z mana value
  odzyskanej karty, ograniczona dostępną maną (także z tapniętych lądów).
  Dziś klasa celów z grobu ma odwróconą wartość („najtańszy”).
- **I**: tapnięcie lądu zaczarowanego przez efekt „gdy się tapnie → miel”
  (deskryptor triggera `enchanted_permanent_tapped` + `mill_cards`) wchodzi do
  kosztu tapnięcia; przy bibliotece ≤ 30 kart kara przewyższa korzyść.
  Jedno miejsce prawdy dla „kosztu tapnięcia lądu”.
  **Zmierzone 2026-09-23c**: `paymentLibraryLoss` liczył tylko ILOŚĆ many —
  bot rzucał czar z pipem {U}, którego jedynym źródłem był zalany ląd
  (auto-tap sięgał po niego i mielił 5 → 2 karty, kara 0). Naprawa: pipsy
  (`reservedPipsOf`, bliźniak `reservedManaOf`) + pokrycie kolorów czystymi
  źródłami i kolorową pulą + nowe pokrętło `libraryTapSafeMargin` (30) dla
  mielących tapnięć/płatności (dobory z czarów zostają na `librarySafeMargin`
  = 20). Pin anty-over-fix B/3 przeniesiony na 40 kart.
- **M** (dopisane 2026-09-23, po A–L): cel-LĄD triggera `resolve_trigger_target`
  (Acidic Slime: artefakt/enchantment/ląd) dostaje w wycenie sygnały
  deskryptorowe: (1) ląd, którego przeciwnik ma **jedną kopię** (kopia = ten sam
  `cardId` wśród jego lądów) — premia 10; (2) ląd odcinający kolor (żaden inny
  jego ląd nie produkuje żadnego z jego kolorów — `getSourceForObject`) — premia
  18; kara 8 za każdą dodatkową kopię. Duplikat z definicji nie „odcina” (analiza
  liczy POZOSTAŁE lądy), więc lądy z wieloma kopiami trafiają poniżej baseline'u
  30 i nie wygrywają z artefaktami. Kolor-producent 0 (zakład `{C}`) nie daje
  żadnego sygnału. Dwie różne karty-uniczaty mogą remisować (kolejność silnika
  rozstrzyga) — to akceptowalne, dopóki unikat bije duplikat.

### E2 — panel i modale: upTo, „you may”, X, koszty (B1, C, F1, F3, H, J)

- **B1**: decyzje `resolve_trigger_target` z `targetIds` (0..count przy `upTo`)
  przechodzą przez TEN SAM kreator wielowyboru co proliferate (lista kandydatów,
  ptaszki, „Zatwierdź”; silnik sprawdza legalność — L48). **Audyt klasy**: lista
  wszystkich kart z `requiresTarget.count > 1` + strażnik, że żadna taka
  rodzina nie spada do ściany przycisków.
- **F1**: `resolve_optional_trigger_choice` — wpis panelu = WYKONANIE efektu,
  a „Dalej (Pass)” = nieskorzystanie (bez modala). Silnik dostaje wspólną
  ścieżkę „pass = odmowa dobrowolna” z walidacją i testem.
- **J**: czary z X bez celów (Epic Experiment) — jedna oferta „Rzuć: X (koszt
  XUR)”, po kliknięciu kreator X (+/−), potem płatność; brak wariantów X
  w panelu.
- **C, F3, H**: tytuł grupy zdolności nazywa zdolność i koszt („Piercing Rays:
  Forecast ({2}{W})”), `turn_cloak_face_up` pokazuje koszt odkrycia, a przegląd
  całej warstwy etykiet wykazuje oferty bez kosztu (strażnik: każda oferta
  rzutu/aktywacji ze zdolności lub karty ma koszt albo jest jawnie darmowa).

### E3 — silnik i odznaki: cloak-Aura, detain badge, Mana Wizard (B2, F2, G)

- **F2**: permanent zakryty (cloak/morph) nie ma typów (CR 708.2) — ścieżka
  wchodzenia aury nie może go traktować jak Aurę; Aura zakryta zostaje na polu
  bitwy jako 2/2.
- **B2**: badge `detain` na permanencie (widok już niesie `detained`), ważny
  przez cały czas trwania efektu (bez zmian silnika).
- **G**: kreator many ukrywa źródła, których kolory nie mogą zapłacić
  brakującego PIP-a kolorowego (dziś zostają i pozwalają kliknąć w ślepy zaułek).

### E4 — układ stołu: kolejność panelu, klik, sekcja AI (E, K, L)

- **E**: `groupCombatDecisions` wpina deklaracje w stałe miejsce POD passem
  (`unshift`/`push` łamały sortowanie `actionMenuRank`); „Rozdziel obrażenia”
  tą samą drogą.
- **K**: aktywacja przycisków akcji odporna na przebudowę layoutu między
  press-down a release (pointer capture + próg ruchu; stała szerokość kolumny).
- **L**: `details` sekcji „Przebieg tur (dla AI)” domyślnie `open`.

### E5 — domknięcie

Pomiary (szybki rdzeń + pełna brama + build), wpis M-serii, README/handoff,
odhaczenia w tym planie, aktualizacja PR.

## Zasady wykonania

- Każda pozycja z testem RED→GREEN; dla pozycji UI test warstwy stołu
  (te same narzędzia co `test/uwaga-z-gry-*`).
- Zero „napraw” przez pominięcie oferty: jeśli silnik oferuje coś legalnego,
  UI musi to pokazać czytelnie.
- Po każdym etapie: `npm test`, commit (`git commit -F`), push.
