# M105 — łowy błędów vs CR (brązowa odznaka, wyzwanie właściciela 2026-08-16)

Zadanie: znaleźć i naprawić unikalne błędy/uproszczenia względem Comprehensive
Rules w istniejących kartach i mechanikach (nie w nowym kodzie tej sesji).
Metoda jak w poprzednich odznakach: dowód behawioralny (test RED) → naprawa
u root cause → GREEN, bez specjalnych przypadków po nazwie karty (ADR 0002).

## Metoda polowania (co dało sygnał, a co nie)

1. **Sondy CR w silniku** (mana pool CR 500.4, tokeny CR 111.7, SBA aur
   CR 704.5m, deathtouch+trample CR 702.2c/702.19b, menace, vigilance,
   regeneracja CR 701.12, indestructible, limit lądów CR 305.2, zdolności
   many CR 605.3a, cleanup CR 514.2) — **wszystko poprawne**. Silnik jest po
   pięciu odznakach dobrze przeorany; łatwe klasy błędów są wyczerpane.
2. **Skanery katalogu** (`oracleText` vs deskryptor): keywordy, liczba
   triggerów/aktywowanych, liczby (życie, obrażenia, mielenie, liczniki,
   P/T tokenów), timing („only as a sorcery", „only once each turn"),
   `entersTapped`, kolory tokenów — dały 3 realne trafienia (koszty kolorowe
   i mana value) plus komplet fałszywych alarmów, które opisano niżej.
3. **Weryfikacja przy źródle prawdy** (Scryfall `format=text`) dla kart
   podejrzanych — potwierdziła Monastery Flock.
4. **Przegląd kodu pod kątem świadomych uproszczeń** (`grep uproszcz|minimalny
   wymiar`) — stąd znaleziska w opóźnionych triggerach i w obrocie morpha.

## Znalezione błędy (6 + 1 odrzucone po weryfikacji)

| # | Karta / mechanika | Objaw | Reguła |
|---|---|---|---|
| B1 | Trigon of Corruption | zdolność „{B}{B}, {T}: połóż licznik charge" kosztowała 2 DOWOLNE many (deskryptor bez `colors`) — dało się ją odpalić samymi Lasami | CR 202.1/601.2f |
| B2 | Goblin Picker | „{R}, {T}, odrzuć kartę: dobierz kartę" bez pipa czerwonego — aktywacja za dowolną manę | CR 202.1/601.2f |
| B3 | Monastery Flock | koszt {2}{U} zapisany jako `manaCost: 2` — stwór 0/5 z defender+flying tańszy o całą manę (i błędna mana value dla filtrów „mv ≤ N") | CR 202.3 |
| B4 | Aerith Rescue Mission (tryb „Take 59 Flights of Stairs") | „Tap **up to three** target creatures" enumerowane od 1 celu — nie dało się rzucić trybu bez celu ani przy pustym stole | CR 601.2c |
| B5 | Lodestone Needle | „tap **up to one** target artifact or creature" wymagało wskazania celu — brak opcji „bez celu" (gracz musiał tapnąć własny permanent, gdy był jedynym kandydatem) | CR 601.2c |
| B6 | opóźnione wygnanie „at the beginning of **the next** end step" (Cogwork Assembler, unearth) | trigger czekał na end step KONTROLERA, więc token-kopia stworzony w turze przeciwnika przeżywał całą jego turę i wracał do ataku | CR 603.7b |
| B7 | ~~morph / megamorph — obrót na stosie~~ | **ODRZUCONE po weryfikacji**: `performActivation` już traktuje obrót jak akcję specjalną (`isFaceUpAction` pomija stos). Pierwsza sonda była błędna — ręcznie zbudowany permanent nie miał zdolności obrotu, którą engine dokłada przy zagraniu twarzą w dół. Zostaje TEST-STRAŻNIK | CR 702.36b |

## Fałszywe alarmy (sprawdzone i odrzucone — zapis, żeby nie wracać)

- Scion Summoner bez kolorów — **poprawnie**: karta ma Devoid (CR 702.114).
- Porcelain Legionnaire `manaCost: 2` — poprawnie: `{W/P}` jest osobnym polem
  `phyrexianManaCost` (płatność maną albo 2 życiem, CR 118.9).
- Trigon of Corruption „3 charge" i Necrosquito „2 oil" — to `entersWithCounters`.
- Shiv's Embrace +2/+2 — pump aury, nie zdolność aktywowana.
- Equipment bez `timing: 'sorcery'` — equip ma własną bramkę czasową (M101/B1).
- Tokeny (P/T, kolory, podtypy, keywordy), tokeny w grobie (CR 111.7), pula
  many między krokami (CR 500.4), aury po utracie legalnego gospodarza
  (CR 704.5m), Faceless Butcher, Angel's Feather (trigger obu graczy),
  Cellar Door, Withstand, Etherium Sculptor — bez zastrzeżeń.

## Kolejność commitów

1. ten plan,
2. testy RED + naprawy danych kart (B1–B5) — jeden commit na klasę,
3. naprawa opóźnionych triggerów (B6),
4. morph jako akcja specjalna (B7),
5. dokumentacja (PROJECT_STATE, LESSONS, handoff) + benchmark szybki.

## Wynik

Sześć błędów naprawionych u root cause, wszystkie z testami RED→GREEN
(`test/bug-hunt-2026-08-16-bronze.test.js` — 15 testów, przed naprawami
padało 10 asercji). Dwa stare testy utrwalały zaniżony koszt Monastery Flock
i zostały poprawione. Pakiet **1938/1938**, build 51 modułów / 1727.1 kB,
benchmark szybki bez zmian (58,2% / 92,1%, `tools/b3-m105-2026-08-16.*`).
Siódmy kandydat (morph na stosie) odrzucony po weryfikacji — został jako
test-strażnik. Lekcja **L23** (dane w dwóch reprezentacjach = strażnik).

## Kryteria ukończenia

- każdy błąd ma test RED→GREEN w `test/bug-hunt-2026-08-16-bronze.test.js`
  (dowód behawioralny, nie tylko inspekcja danych),
- `npm run test:all` zielone, build 51 modułów,
- benchmark profil szybki bez regresji hierarchii botów (ADR 0018 — pełne B0
  tylko na komendę właściciela).
