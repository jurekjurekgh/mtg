# Lekcje projektowe (trwały rejestr)

Ten plik gromadzi **powtarzalne wnioski z pracy nad projektem** — rzeczy, które
kolejne sesje powinny wiedzieć, zanim popełnią ten sam błąd po raz trzeci.

**Czym różni się od innych dokumentów:**

| Dokument | Zakres | Trwałość |
|---|---|---|
| `docs/setup/HANDOFF_*.md` | stan JEDNEJ sesji: co zrobiono, co dalej | jednorazowy, traci aktualność |
| `docs/plans/PLAN_*.md` | roadmapa JEDNEGO zadania | jednorazowy |
| `docs/PROJECT_STATE.md` | bieżący stan projektu | żywy, ale opisuje „teraz" |
| `docs/decisions/*.md` (ADR) | wiążąca decyzja architektoniczna | trwała, formalna |
| **`docs/LESSONS.md`** | **wniosek/heurystyka diagnostyczna** | **trwała, nieformalna** |

Lekcja trafia tutaj, gdy jest **powtarzalna**, ale nie jest decyzją
architektoniczną (te idą do ADR). Jeżeli lekcja wymusza zmianę sposobu pracy —
dopisz ją też do `AGENTS.md`; jeżeli ustala granicę komponentów — napisz ADR
i tu zostaw tylko odsyłacz.

**Zasada dopisywania:** nowa lekcja = nowa sekcja z datą, objawem, przyczyną
i regułą na przyszłość. Nie kasujemy starych lekcji; jeśli przestały
obowiązywać, oznaczamy je jako nieaktualne z odsyłaczem do nowszej.

---

## L1 (2026-08-14) — „Bot robi coś głupiego" bywa ślepotą, nie głupotą

**Objaw (trzykrotny):** bot pompował liczniki Station bez końca (M84), celował
zdolnością w nielegalne obiekty (M82), rzucił Inspire Awe i zaatakował we
własną prewencję (M91). Za każdym razem zgłoszone jako „bot-idiota".

**Przyczyna:** we wszystkich przypadkach `PlayerView` nie niosło danych
potrzebnych do decyzji. Kontroler dostaje widok, nie stan (ADR 0003), więc
pole spoza widoku jest dla niego **fizycznie nieosiągalne**.

**Reguła:** zanim uznasz zachowanie kontrolera za błąd heurystyki, sprawdź, czy
widok w ogóle niesie potrzebne dane. Strojenie wag wokół brakującej informacji
to maskowanie objawu.

**Sformalizowane w:** [ADR 0017](decisions/0017-playerview-completeness-contract.md).

**Metoda audytu (do powtórzenia):** zestaw trzy zbiory — pola
`createGameState`, zawartość `playerView`, odczyty `view.X` w kontrolerach.
Pole obecne w stanie, nieobecne w widoku i mające wpływ na wybór komendy = luka.
Audyt M92 znalazł tak pięć luk, w tym brak `types` permanentu.

---

## L2 (2026-08-14) — Benchmark bota nie wykrywa błędów rzadkich mechanik

**Objaw:** po naprawie pięciu realnych luk decyzyjnych (M92) pełna macierz
benchmarku (5616 meczów) dała wynik **identyczny co do 0,1 pp**.

**Przyczyna:** karty wnoszące daną mechanikę (tu: prewencja obrażeń) występują
w jednej–dwóch taliach na kilkanaście. Poprawa ginie w uśrednieniu.

**Reguła:**

- Benchmark jest siecią bezpieczeństwa przed **regresją siły gry**, nie
  detektorem błędów decyzyjnych.
- Poprawki dotyczące konkretnej mechaniki mierz **pomiarem ukierunkowanym**:
  `node tools/benchmark.mjs --seeds 20 --decks <talie zawierające tę mechanikę>`.
  W M92 pełna macierz pokazała 65,2% vs aggro, a pomiar ukierunkowany 69,8%.
- Błędy decyzyjne wykrywa audyt kontraktu widoku, Żywy Tester i raport gracza.

---

## L3 (2026-08-14) — Kara w heurystyce musi przebić premię, inaczej jest martwa

**Objaw:** dodana kara −70 za jałowe zagranie (destroy w cel z tarczą
regeneracji) nie zmieniła zachowania bota — test nadal czerwony.

**Przyczyna:** scoring sumuje składniki. Kara była naliczana, ale zaraz po niej
ta sama gałąź dodawała premię za „usunięcie permanentu przeciwnika", która ją
przebijała.

**Reguła:** przy zagraniu **jałowym** (efekt z definicji nie zadziała) nie
wystarczy dodać karę — trzeba **pominąć premię** (`continue`). Po każdej
zmianie wag sprawdź testem, że decyzja faktycznie się zmieniła; sam fakt
naliczenia kary niczego nie dowodzi.

---

## L4 (2026-08-14) — Odrzucona komenda nie może zmieniać stanu sesji

**Objaw:** gracz zostawał na ekranie z jedyną opcją „Poddaj partię", w logu
`Ruch odrzucony: not_priority` (M90/B).

**Przyczyna:** `session.apply()` czyścił bufor modala i kasował pauzę bota
**przed** `execute()`, „defensywnie" zakładając powodzenie. Gdy engine odrzucił
komendę, sesja traciła pauzę i drogę wznowienia.

**Reguła:** mutuj stan warstwy UI/sesji **dopiero po** potwierdzeniu, że
komenda została przyjęta. Operacje „na wszelki wypadek przed" zostawiają
system w stanie niespójnym przy każdej ścieżce błędu.

---

## L5 (2026-08-14) — Test na obecność kodu to nie test zachowania

**Objaw:** funkcja ptaszka wyciszenia miała pięć zielonych testów, a mimo to nie
działała dla czarów z wariantami (M91/B).

**Przyczyna:** testy sprawdzały regexami, czy w źródle występują odpowiednie
identyfikatory (`ignoredOptionKeys`, `action-ignore`). Kod istniał, ale nie był
wywoływany dla tej ścieżki UI.

**Reguła:** testy UI mają renderować i sprawdzać **wynik** (drzewo elementów,
reakcja na zdarzenie), nie obecność napisów w pliku. Testy na źródło dopuszczalne
są wyłącznie jako uzupełnienie (np. strażnik konfiguracji), nigdy jako jedyne
zabezpieczenie. Kontrola jakości testu: **wyłącz fix i sprawdź, czy test
czerwienieje** (weryfikacja mutacyjna).

---

## L6 (2026-08-14) — Zdarzenie musi nieść dane, których opis nie odtworzy

**Objaw:** log i modal „Ruch przeciwnika" nie mówiły, który tryb czaru modalnego
wybrał bot — Ruinous Rampage wyglądał identycznie niezależnie od wyboru (M91/D).

**Przyczyna:** `describeGameEvent` jest czystą funkcją bez dostępu do rejestru
kart (świadomie — jest testowalna headless). Zdarzenie niosło `modeIndex`, ale
nie nazwę trybu, więc warstwa opisu nie miała jak jej ustalić.

**Reguła:** projektując zdarzenie, sprawdź, czy warstwa opisu ma **wszystko**,
czego potrzebuje do zbudowania czytelnego komunikatu. Jeżeli wymagałaby dostępu
do rejestru albo stanu — dołóż dane do zdarzenia.

---

## L7 (2026-08-14) — Weryfikuj stan repozytorium, nie treść zlecenia

**Objaw:** handoff stwierdzał, że pięć fixów przepadło wraz z working tree
poprzedniej sesji. Audyt `main` wykazał, że cztery z nich są w repozytorium
wraz z testami (M90).

**Przyczyna:** opis zadania powstał na podstawie pamięci o przebiegu sesji,
a nie pomiaru stanu repozytorium.

**Reguła:** repozytorium, testy i dokumentacja są źródłem prawdy (AGENTS.md).
Sesję zaczynaj od pomiaru (`npm test`, `npm run build`, `git log`, przegląd
plików), nie od przyjęcia treści zlecenia na wiarę. Rozbieżność zgłoś jawnie —
oszczędza to pracy nad problemem, którego już nie ma.

---

## L8 (2026-08-14) — `git checkout <plik>` cofa także własne, niezacommitowane zmiany

**Objaw:** przy usuwaniu tymczasowego `console.error` z pliku poleceniem
`git checkout` zniknął również fix wprowadzony w tym samym pliku (M90).

**Reguła:** przed instrumentowaniem kodu (debug print) **zacommituj fix** albo
przywracaj zmiany punktowo (edycja odwrotna). Po każdym `git checkout` sprawdź
`git diff`/testem, że zamierzona zmiana nadal istnieje.
