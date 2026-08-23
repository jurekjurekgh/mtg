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

**Root cause**: M196 zapisało „nowy plan w katalogu: Kamigawa" bez sprawdzenia
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

- [ ] K1: sprostowanie „nowego planu" (dokumentacja + asercja testu) oraz
      strażnik `plan-registry-guard` — nie da się nazwać planu nowym, gdy
      istnieje; `Świat Wiedźmina` zakazany jako alias `Wiedźmin`.
- [ ] K2: higiena CSV — 10 dubli usuniętych, `Trade Route Envoy` dostaje plan,
      `Chittering Rats` → Wiedźmin; strażnik struktury pliku (3 kolumny,
      brak duplikatów `artId+nazwa`, brak pustego planu).
- [ ] K3: synchronizacja 9 planów katalogu z CSV + regeneracja talii
      (ADR 0023) + przelosowanie seedów (L25).

## Część 2 — układ stołu (A1–A7)

- [ ] A1: „Przebieg tur (dla AI)" — przycisk **kopiujący całą partię**
      (wszystkie tury), obok istniejącego kopiowania jednej tury.
- [ ] A2: usunięcie tekstowego paska statusu (`Partia zakończona po N turach`
      + dwa wiersze „❤ … mana … ręka … biblioteka …") — dubluje panel graczy.
- [ ] A3: pasek graczy:
  - A3A: „🗂 Strefy (groby / exile / biblioteka)" **poza** pasek, jako osobny
        boks z **licznikami** stref dla obu graczy (bez listy kart — te dalej
        po kliknięciu, w inspektorze).
  - A3B: **graficzna pula many** (ile i jaka) dla obu graczy.
  - A3C: „Ty" → „Gracz".
- [ ] A4: „Stworki i inne" → „Permanenty poza lądami".
- [ ] A5: inspektor stref bez sekcji „Biblioteka — podgląd topu (syntetyczny)".
- [ ] A6: usunięcie nagłówka „MTG · Wirtualny Stół (M20)".
- [ ] A7: usunięcie stopki „M20 — Wirtualny Stół i kreator talii…".

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
