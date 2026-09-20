# Plan 2026-09-20 — paczka J: tapnięcia na manę w „Logu partii”

Zlecenie właściciela (2026-09-20, trzecia paczka uwag tego samego dnia w PR
#130): „Chciałbym w sekcji «Log partii» widzieć dodatkowo każdy tapnięty na
manę permanent. To nam ułatwi debugowanie błędów — będzie widać co i kiedy
zostało tapnięte”.

Zasady projektu bez zmian: ADR 0002 (UI nie rozpoznaje kart po nazwie),
ADR 0011 (reguła tekstu to czysta, testowalna funkcja), L41/L48 (jedno źródło
reguły dla oferty, wykonania i prezentacji), L24 (zgubiona informacja boli
bardziej niż nadmiarowy wpis), budżet lektury startowej bez podnoszenia progu.

Poprzednie paczki tego dnia: `docs/plans/PLAN_2026-09-20-uwagi-z-gry-a-e.md`
oraz `docs/plans/PLAN_2026-09-20-uwagi-z-gry-f-i.md`.

## Pomiar przed naprawą

1. **Co niesie silnik.** `src/engine/resources.js` (`tapLandForMana`,
   `tapObjectForMana`) emituje `mana_produced` z kompletem danych:
   `{ playerId, source: objectId, amount, colors, grantMana }` — źródło jest
   OBIEKTEM na polu bitwy (ląd, stwór-źródło many, artefakt, Skarb), a `colors`
   mówi, jaka mana realnie powstała.
2. **Czego brakowało w logu.** `object_tapped` w tekstach zdarzeń
   (`session.js`) mapuje się na `null` — log go nie opisuje. `mana_produced`
   trafiał wyłącznie do szumu `TURN_NOISE`/`MAIN_LOG_NOISE`, czyli do bufora
   „Rozgrywka” dla bota, a nie do logu stołu.
3. **Sonda na pełnej partii** (`ixalan` vs `warhammer-ubr`, pętla do końca
   gry): dziesięć produkcji many Nieprzyjaciela, **zero** wpisów w
   `logEntries()` — a więc i zero w „Logu partii”, który czyta ten sam
   strumień. Zgłoszenie potwierdzone.
4. **Wybór zdarzenia.** Opisujemy PRODUKCJĘ many, nie tapnięcie: `object_tapped`
   nie wie ani ile many powstało, ani jakiej, więc nie odpowiada na pytanie
   „co zapłacił”. `mana_produced` niesie jedno i drugie — i to ono jest źródłem
   prawdy o płatności.

## Naprawa (paczka J)

- **Reguła tekstu — `manaSourceLogText(e, { nameOfObject, who })`**
  (`src/table/session.js`, eksportowana, czysta): `„Ty tapujesz na manę: Wyspa
  → {U}”`, dla drugiej osoby „tapuje”. Symbole w liczbie
  `max(amount, colors.length)` — „{C}{C}{C}” dla trzech bezbarwnych jednostek,
  powtórzenia przy dwóch jednostkach jednego koloru. Zwraca `null`, gdy
  zdarzenie nie jest produkcją, gdy brak nazwy źródła albo gdy nazwa to `?`
  (wpis bez wiedzy byłby szumem — L24 dotyczy informacji, nie braku wiedzy).
- **Wpięcie w log stołu — `logManaSource(e)`**: woła `sessionLog('tap', …)`
  po nagłówku fazy w OBU gałęziach `MAIN_LOG_NOISE` (strumień komend gracza
  i pętla bota) — jedno źródło reguły dla obu ścieżek, bez zmiany zawartości
  szumu dla modala „Rozgrywka”.
- **UI**: `src/table/index.html` → `.log-tap { color: var(--muted-2); }` —
  wpis debugowy wizualnie nie konkuruje z narracją (render nada klasę
  `log-tap` automatycznie, bo buduje ją z rodzaju wpisu).

## Granice (świadome)

Wpis **nie** wchodzi do:

- modala „Rozgrywka” (`botMoves`) — decyzja właściciela z 2026-08-02: modal nie
  pokazuje tapowania many (zamienia się w klikanie bez treści); miejsce na
  debug to „Log partii”,
- zapisu tur dla AI (`turnHistory`) — to nie ruchy istotne dla modelu bota.

Oba ograniczenia pinuje test 3 strażnika.

## Bramy

- `test/zgloszenie-j-tapniecia-many-w-logu.test.js` — 3 piny; przed poprawką
  plik czerwony (brak eksportu reguły), po: 3/3.
- e2e w `test/table-ui.test.js` (talia „g-canonized”, ten sam test co pin G):
  po zapłacie log stołu ma wiersz `log-tap` („Ty tapujesz na manę: Swamp →
  B” — symbole renderują się jako ikony), pole „Log partii” ma pełny zapis
  z symbolami, a „Przebieg tur (dla AI)” nie zawiera „na manę”. Przed
  poprawką pada `wierszeTap.length >= 1` (log bez wiersza „tap”).
- `node tools/run-tests.mjs all` → **6025/6025** (6022 + 3 nowe).
- `npm run build` → **59 modułów / 3950,9 kB** (modułów bez zmian; +2,7 kB treści).

## Ryzyka i świadome decyzje

1. **Więcej wpisów w logu** — każda produkcja many (także bota) dokłada wiersz.
   To jest cały sens zgłoszenia („będzie widać co i kiedy”), a rodzaj `tap`
   z wyciszonym kolorem trzyma te wiersze poza narracją. Gdyby szum okazał się
   zbyt duży, naturalnym krokiem jest filtr rodzaju w UI, nie wycięcie wpisów.
2. **Zakres „każdy permanent”** — pokryte jest każde źródło, które PRODUKUJE
   manę (ląd, stwór, artefakt, Skarb). Tapnięcie bez produkcji (np. koszt
   zdolności „{T}: …” bez many) nie jest tapnięciem NA MANĘ, więc świadomie
   nie ma wpisu.
3. **Pułapka zasięgu** — pierwsza wersja wrappera wołała `whoN` (istnieje tylko
   w closures deskryptorów zdarzeń), co dało `RuntimeError: whoN is not defined`
   w teście. Poprawka: `who()` z zasięgu sesji. Szczegóły: lekcja **L157**.
4. **Budżet lektury** — L157 zapłacona skróceniem opisów przypadków w rejestrze
   (narracja w `docs/LESSONS_PRZYPADKI.md`), budżet **99 971 / 100 000**.

## Kolejka

PR #130 czeka na decyzję właściciela (scala właściciel — ADR 0007/0020).
Otwarte świadomie (bez zmian): auto-tapnięcie jednoznacznego źródła w kreatorze
many, pary kart z podziałem bezkolorowych, filtr rodzaju wpisów w „Logu partii”.
