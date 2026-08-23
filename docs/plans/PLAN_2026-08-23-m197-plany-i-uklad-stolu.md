# PLAN M197 — sprostowanie planów kolekcji + porządki w układzie stołu (2026-08-23)

Zlecenie właściciela z 2026-08-23 (dwie części):

1. **Zarzut**: „Jesteś pewien, że Kamigawa to nowy plan? Ja widzę w CSV takie
   karty z tego planu: Blade-Blizzard Kitsune, Kappa Tech-Wrecker, Greater
   Tanuki…" — plus sprostowanie listy planów: prawdziwe są tylko `Rabiah`,
   `Muraganda`, `Moag`; `Świat Wiedźmina` = `Wiedźmin` (do poprawki w pliku),
   reszta pozycji z tamtej listy to **nazwy kart**, nie plany.
2. **Poprawki UI** A1–A7 (układ stołu).

## Część 1 — plany kolekcji

### Weryfikacja zarzutu: właściciel ma rację

`Kamigawa` **nie była** nowym planem. W chwili pisania M196 katalog miał już
3 karty tego planu, a słownik kolekcji 4 wiersze:

| Karta | artId | gdzie |
|---|---|---|
| Blade-Blizzard Kitsune | 105NEO | CSV + katalog |
| Kappa Tech-Wrecker | 278NEO | CSV + katalog |
| The Kami War | 413STO | CSV (karta niezakodowana) |
| Greater Tanuki | 449NEO | CSV + katalog |

Dopiero czwartą kartą planu było Clawing Torment (546NEO) z Batcha 48.

**Root cause**: M196 zapisało „nowy plan w katalogu: Kamigawa" bez sprawdzenia <!-- plan-cytat -->
`grep Kamigawa` w katalogu i CSV — twierdzenie przeszło do trzech dokumentów
oraz do asercji testu, gdzie utrwaliło się jako „prawda". Klasa L1 (widok/opis
kłamie mimo poprawnych danych), tym razem w dokumentacji.

**Naprawa u źródła**: nie sama korekta zdań, lecz **strażnik** — test liczy
karty planu w katalogu i nie pozwala nazwać planu „nowym", jeśli już istniał.

### Skąd wzięła się fałszywa lista „planów"

Lista, którą właściciel zakwestionował, pochodziła z mojego `awk -F, '{print $NF}'`
po CSV. Plik ma **10 wierszy bez kolumny Plan** (dublety pozycji, które wyżej
występują komplet z planem), więc „ostatnia kolumna" zwracała dla nich **nazwę
karty**. Stąd „plany" typu `Trestle Troll` czy `Lab Rats`.

Dublety (wszystkie: `artId,nazwa` bez planu, każdy ma wyżej pełny wiersz):
235RTR Trestle Troll, 535STH Lab Rats, 231FDN Anthem of Champions,
8ALA Goblin Deathraiders, 273BFZ Fertile Thicket, 248M19 Reassembling Skeleton,
187ELD Idyllic Grange, 375M10 Deadly Recluse, 422CMR Benevolent Blessing,
470MH1 Springbloom Druid. Są w repo od dawna (nie z Batcha 48).

Dodatkowo `123TDM Trade Route Envoy` ma **pustą** kolumnę Plan (katalog: Tarkir).

### Rozjazdy plan katalog ↔ CSV (9 kart)

CSV to odwzorowanie arkusza kolekcji właściciela, więc jest źródłem prawdy dla
kolumny Plan. Katalog rozjeżdża się z nim na 9 kartach — i **wszystkie plany
występujące tylko w katalogu** (`Rath`, `Core`, `Commander`, `Modern Horizons`,
`Phyrexia`) należą do tej grupy, czyli powstały ze zgadywania po secie:

| Karta | katalog | CSV (prawda) |
|---|---|---|
| Lab Rats | Rath | Warhammer Fantasy |
| Deadly Recluse | Core | Śródziemie |
| Benevolent Blessing | Commander | Śródziemie |
| Springbloom Druid | Modern Horizons | Wiedźmin |
| Feed the Infection | Phyrexia | Mirrodin |
| Reassembling Skeleton | Dominaria | Warhammer Fantasy |
| Ballista Watcher | Innistrad | Wiedźmin |
| Ballista Wielder | Innistrad | Wiedźmin |
| Chittering Rats | Świat Wiedźmina | (Świat Wiedźmina → **Wiedźmin**) |

Osobno **Curate** i **Negate**: to świadome warianty druku z Batcha 47, gdzie
plan podał właściciel wprost w zleceniu (Curate STX → Arcavios, Negate M15 →
Warhammer Fantasy). CSV nie odróżnia druków w kolumnie Plan, więc te dwa
zostają jako **nazwany wyjątek** w strażniku, nie jako cicha niezgodność.

### Kroki części 1

- [x] K1 (`ee2dfed`): sprostowanie „nowego planu" (dokumentacja + asercja testu) oraz
      strażnik `plan-registry-guard` — nie da się nazwać planu nowym, gdy
      istnieje; `Świat Wiedźmina` zakazany jako alias `Wiedźmin`.
- [x] K2 (`92844cc`): higiena CSV — 10 dubli usuniętych, `Trade Route Envoy` dostaje plan,
      `Chittering Rats` → Wiedźmin; strażnik struktury pliku (3 kolumny,
      brak duplikatów `artId+nazwa`, brak pustego planu).
- [x] K3 (`2818d73`): synchronizacja 9 planów katalogu z CSV + regeneracja talii
      (ADR 0023) + przelosowanie seedów (L25).

## Część 2 — układ stołu (A1–A7)

- [x] A1: „Przebieg tur (dla AI)" — przycisk **kopiujący całą partię**
      (wszystkie tury), obok istniejącego kopiowania jednej tury.
- [x] A2: usunięcie tekstowego paska statusu (`Partia zakończona po N turach`
      + dwa wiersze „❤ … mana … ręka … biblioteka …") — dubluje panel graczy.
- [x] A3: pasek graczy:
  - [x] A3A: „🗂 Strefy (groby / exile / biblioteka)" **poza** pasek, jako osobny
        boks z **licznikami** stref dla obu graczy (bez listy kart — te dalej
        po kliknięciu, w inspektorze).
  - [x] A3B: **graficzna pula many** (ile i jaka) dla obu graczy.
  - [x] A3C: „Ty" → „Gracz".
- [x] A4: „Stworki i inne" → „Permanenty poza lądami".
- [x] A5: inspektor stref bez sekcji „Biblioteka — podgląd topu (syntetyczny)".
- [x] A6: usunięcie nagłówka „MTG · Wirtualny Stół (M20)".
- [x] A7: usunięcie stopki „M20 — Wirtualny Stół i kreator talii…".

## Ryzyka / pułapki

- **K3 przelosuje talie** — zmiana planu przenosi kartę między taliami, więc
  `repo-decks`, `m132-proporcje-landow` i testy scenariuszowe wymagają nowych
  seedów (L25). Robić jako ostatni krok części 1, osobnym commitem.
- `Świat Wiedźmina` jest w mapie generatora (`SINGLE_PLAN_DECKS`) jako alias
  `Wiedźmin` — po usunięciu z danych wpis zostaje wyłącznie jako zabezpieczenie
  wsteczne albo znika razem z danymi (decyzja przy K1).
- **A3B**: `playerView` niesie `mana` jako LICZBĘ; kolory puli żyją w
  `player.manaPool` (klucze `manaUnitKey`). Bez rozszerzenia widoku UI nie ma
  z czego narysować kolorów — to zmiana w `playerView` (ADR 0017: pula jest
  informacją jawną, więc widok obu graczy).
- **A2 vs testy**: `els.status` jest używany przez `renderTableView`; usunięcie
  treści nie może wywrócić testów UI ani Żywego Testera.
- Reset workspace zdarzył się 11× — commit i push po KAŻDYM zielonym kroku.

## Wynik — KOMPLET

`npm test` **2978/2978**, build **53 moduly / 2542.4 kB**. Katalog 459 kart.

### Czesc 1 — plany kolekcji (3 commity)

Zarzut wlasciciela potwierdzony w calosci; przy okazji wyszedl **blad
systemowy w narzedziu**, ktory zatruwal dane od dawna.

| Problem | Root cause | Naprawa |
|---|---|---|
| „Kamigawa to nowy plan" | M196 nie sprawdzilo grepem; teza poszla do 3 dokumentow i asercji testu | strażnik: dokument nie moze nazwac planu „nowym", gdy repo juz go zna |
| Lista „planow" z nazwami kart | 10 wierszy CSV bez 3. kolumny → „ostatnia kolumna" zwracala nazwe karty | dublety usuniete (566→556) + strażnik ksztaltu pliku |
| Curate/Negate: oba druki ten sam plan | `collectionCsvWithPlan` splaszczalo mape set-aware do „plan PIERWSZEGO wpisu" | zapis kolumny Plan jest set-aware (set z kolumny „Ilustracja") |
| 8 kart z planem zgadnietym po secie | brak strażnika spojnosci katalog↔kolekcja | plan czytany z arkusza; strażnik pilnuje zgodnosci per DRUK |

Plany wystepujace **wylacznie** w katalogu (`Rath`, `Core`, `Commander`,
`Modern Horizons`, `Phyrexia`) okazaly sie w komplecie skutkiem zgadywania —
po synchronizacji zniknely. `Swiat Wiedzmina` scalony z `Wiedzmin`.

Talie przegenerowane (8 plikow), seedy przelosowane (L25): morph-label
20→22, bot-spell-resolution-in-modal 6→10, session-abilities test 2 1→2.

### Czesc 2 — uklad stolu (A1–A7)

Wszystkie 7 punktow zrobione. Najwieksza zmiana pod spodem: **A3B** wymagalo
rozszerzenia `playerView` o `manaPool` — widok niosl tylko LICZBE many, wiec
UI nie mialo z czego narysowac kolorow (klasa L1).

Weryfikacja na **zbudowanym artefakcie** (jsdom): naglowek/stopka/podglad
topu nie istnieja, liczniki stref pokazuja realne rozmiary, etykieta grupy to
„Permanenty poza ladami", 0 zgloszen detektorow. `run-game.mjs` zwraca teraz
zrzut `layout`, wiec uklad stolu jest sprawdzalny na zywym artefakcie takze
w kolejnych sesjach.

### Naprawione przy okazji (nie bylo w zleceniu)

- panel trucizny mowil „Ty"/„Nieprzyjaciel" niespojnie z reszta stolu →
  wspolne stale `PLAYER_LABEL`/`BOT_LABEL`;
- martwy `refreshLibraryPreview` w `main.js` (A5);
- pierwsza wersja strażnika dokumentacji miala dziure (filtr po slowie
  „sprostowanie") — wykryta **weryfikacja mutacyjna**, zastapiona jawnym
  markerem `<!-- plan-cytat -->`.
