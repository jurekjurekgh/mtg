# Ilustracje kart na stole

Jak Wirtualny Stół dobiera obrazy kart i co zrobić, żeby działały też lokalne
ilustracje właściciela (warianty FOT/KON z arkusza kolekcji).

Kod: [`src/table/card-images.js`](../../src/table/card-images.js) (adresy),
[`src/table/render.js`](../../src/table/render.js) (ładowanie i fallback),
[`tools/fetch-art-ids.mjs`](../../tools/fetch-art-ids.mjs) (numery ilustracji).

## Co widać na stole

| Miejsce | Obraz | Rozmiar |
|---|---|---|
| Kafel karty (stół, ręka, groby, exile) | druk ze Scryfalla z `imageUri` definicji karty | `normal` (488×680) |
| Podgląd hover (desktop) | ten sam druk | `large` (672×936) |
| Pełny podgląd karty (klik / menu) | ten sam druk | `large` |
| Karta zakryta (morph, ręka przeciwnika) | wspólny rewers Magica | — |
| Karta bez druku (syntetyczna, token) | kolorowa twarz syntetyczna | — |

Reguła nadrzędna: **obraz jest domyślny, syntetyczna twarz jest fallbackiem.**
Twarz zostaje w DOM przez cały czas i pokazuje się, dopóki obraz się nie
wczyta — a po błędzie (404, brak sieci, tryb offline) zostaje na stałe. Nigdy
nie ma pustego kafla, a stół działa bez internetu.

Szczegóły:

- **Lazy-load** (`loading="lazy"`, `decoding="async"`): przeglądarka pobiera
  tylko to, co realnie widać — na stole bywa kilkadziesiąt kart.
- **Tapnięcie** obraca cały kafel (`.tile.tapped .cardvis`), więc ilustracja
  kręci się razem z ramką.
- **DFC (transform)**: obiekt gry po transformacji ma `cardId` drugiej strony,
  a jej definicja własny `imageUri` z `/back/` — kafel sam pokazuje tył.
- **Wirtualne landy podstawowe** nie mają druku w definicji batchowej, więc
  używają przekierowania po nazwie (`api.scryfall.com/cards/named?exact=…`),
  dokładnie jak plik legacy. Decyzja właściciela: druk domyślny Scryfalla.
  Świadomy koszt: Scryfall może z czasem zmienić, który druk jest domyślny.
- **Nakładka stanu** (obrażenia, choroba przywołania, aura/equipment,
  efektywne P/T) rysuje się **na** ilustracji — druk zna tylko wartości bazowe.
- **Fog of War**: każda zakryta karta ma ten sam adres rewersu. Gdyby zależał
  od karty, samo pobranie pliku zdradzałoby tożsamość (ADR 0003).

## Tory podglądu i scroll (jak w legacy HTML)

Na desktopie hover pokazuje powiększenie, a **scroll nad kartą przełącza tor**
(`playtableState.hoverMode` w legacy):

| Tor | Źródło | Kształt okna |
|---|---|---|
| `scryfall` (domyślny) | pełna karta ze Scryfalla | 320×448 |
| `fot` | `./img/<artId>FOT.png` — panorama 21:9 | 900×386 |
| `kon` | `./img/<artId>KON.png` — bestiariusz 16:9 | 900×550 |

Tory lokalne wymagają `artId` (numer z arkusza kolekcji) i plików w `./img/`.
Gdy któregoś brakuje, podgląd cicho spada na pełną kartę ze Scryfalla.
Tor żyje w pamięci strony — bez `localStorage`.

Na urządzeniach dotykowych hover pozostaje wyłączony (M7c): tapnięcie otwiera
menu kontekstowe, a pełny obraz jest pod pozycją „Pełny podgląd karty".

## Skąd się bierze `artId`

W arkuszu kolekcji nie ma kolumny z ID — numer jest **prefiksem nazwy pliku**
w kolumnie `Ilustracja` (np. `412FOT.png` → `412`), zob. audyt §3.2.
Uzupełnia to narzędzie, a nie człowiek:

```bash
# adres opublikowanego arkusza NIGDY nie trafia do repozytorium
export MTG_COLLECTION_CSV_URL='https://docs.google.com/spreadsheets/…/pub?output=csv'

node tools/fetch-art-ids.mjs --dry-run   # raport dopasowań
node tools/fetch-art-ids.mjs             # dopisuje artId do src/cards/card-data.js
npm test && npm run build
```

Zamiast sieci można podać eksport z dysku: `--csv eksport.csv`.

Zasady:

- narzędzie dopasowuje wiersze do kart **po nazwie** (bez rozróżniania wielkości liter);
- zapis jest **idempotentny** — ponowne uruchomienie nic nie zmienia;
- do repozytorium trafiają wyłącznie numery, nigdy adres arkusza
  ([SECURITY.md](../../SECURITY.md) §Sekrety i dane wrażliwe);
- w CI adres można wstawić jako **GitHub Actions secret**, jeśli kiedyś ma się
  odświeżać automatycznie.

Dopóki `artId` nie istnieje (stan po pierwszym wdrożeniu), tory FOT/KON
zachowują się jak tor Scryfall — funkcja jest gotowa, brakuje tylko danych.

## Tryb lokalny `./img/` dla pełnego podglądu

Przełącznik „Ilustracje" w pasku stołu nadal steruje kolejnością źródeł
w **pełnym podglądzie karty**: `img/<SET>/<slug>.jpg` przed Scryfallem
(tryb `local-first`, domyślny przy otwarciu pliku z dysku) albo odwrotnie.
Kafle na stole zawsze idą po druk ze Scryfalla — tak zdecydował właściciel.
