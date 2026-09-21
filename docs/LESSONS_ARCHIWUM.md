# Archiwum lekcji (wpisy jednorazowe, poza lekturą startową)

Rejestr `docs/LESSONS.md` niesie REGUŁY i STRAŻNIKÓW — lektura startowa sesji.
Tu leżą wpisy przeniesione z rejestru decyzją właściciela (2026-09-21, przegląd
wszystkich 162 wpisów): **jednorazowe, których reguła żyje już w innym wpisie
rejestru (albo w `AGENTS.md`/`ENVIRONMENT.md`), a wiedza na przyszłość jest
znikoma**.

Nic nie jest kasowane: wpis wędruje w całości — razem z narracją z
`docs/LESSONS_PRZYPADKI.md` (pod nagłówkiem każdego wpisu) — a **numer lekcji
zostaje** (jest cytowany w kodzie, testach i planach; rejestr ma sekcję
„Wpisy przeniesione do archiwum (poza lekturą startową)”, która tu kieruje).

Jak czytać: szukasz numeru z komentarza w kodzie → tabela niżej mówi, gdzie
mieszka reguła, która go zastąpiła.

| Lekcja | Powód przeniesienia | Reguła żyje dziś w |
|---|---|---|
| **L3** | Klasa w pełni opisana w L54 (kara/premia wyceny musi być ZWYMIAROWANA względem bazy i dowiedziona testem zachowania); tu zostawał tylko techniczny szczegół „pomiń premię (`continue`)” — przeniesiony do L54 jako wariant 5. | L54 |
| **L7** | Przypomnienie procedury startowej, nie wiedza o silniku: reguła żyje w `AGENTS.md` („Repozytorium, testy i dokumentacja są źródłem prawdy”) oraz w `docs/setup/ENVIRONMENT.md` §7 (tam stoi razem z cytatem L7). | AGENTS.md + ENVIRONMENT.md §7 |
| **L8** | Pułapka `git checkout` powtórzona w pełni w L136 — razem z profilaktyką, której L8 nie miał: `git diff --stat` przed `restore`, kopie plików zamiast gita, checkpoint po każdym findingu. | L136 |
| **L9** | Dyscyplina commita/pushu opisana w L136 pkt 1 i w `ENVIRONMENT.md` §2 (jedyne źródło prawdy o sandboxie); wpis opisywał incydent z 2026-08-14 (pięć nie wypchniętych fixów, commit na `main`). | L136 + ENVIRONMENT.md §2 |
| **L10** | Jednorazowy przypadek obsługowy (cache przeglądarki właściciela: PR „bez opcji scalania”), zero wystąpień w kodzie i testach. Ogólna reguła „najpierw twarde dane, potem zmiana konfiguracji” żyje w rodzinie L29/L56. | L29, L56 |
| **L23** | Jednorazowa instancja klasy „dane w dwóch reprezentacjach porównuj maszynowo”: strażniki (`manaCost` = mana value, pipy vs `cost.colors`) są w pakiecie, a wzorzec przeniesiony do L152 (strażnik danych). | L152 + istniejące strażniki danych |
| **L35** | Jednorazowa poprawka ergonomii dotyku (M127) — bez reguły o silniku; pytanie o RODZINĘ kontrolek i próg 44 px mają dziś dom w rodzinie strażników stylu (L125/L126), a sam fakt nigdy nie miał strażnika. | L125 |
| **L62** | Technika przestarzała: narzędzie czyta stan przez mostek strukturalny (L133), więc kierunek rysowania logu przestał mieć znaczenie — L62 był obejściem poprzedniej generacji sond. | L133 |
| **L122** | Jednorazowy materiał audytowy (talia-sonda `wielocelowa` odrzucona przez `repo-decks`); niezmienniki mają własnych strażników, a wniosek o surowcu siedzi w `docs/backlog.md` §1/§4. | strażniki `repo-decks`/`m132` + backlog §1/§4 |

---

## L3 (2026-08-14) — Kara w heurystyce musi przebić premię, inaczej jest martwa

**Reguła:** przy zagraniu JAŁOWYM (efekt z definicji nie zadziała) nie wystarczy
dodać karę — trzeba POMINĄĆ PREMIĘ (`continue`). Po zmianie wag sprawdź testem,
że decyzja się zmieniła; samo naliczenie kary niczego nie dowodzi.

→ narracja: poniżej (przeniesiona z `docs/LESSONS_PRZYPADKI.md` razem z wpisem)

**W archiwum, bo:** Klasa w pełni opisana w L54 (kara/premia wyceny musi być ZWYMIAROWANA względem bazy i dowiedziona testem zachowania); tu zostawał tylko techniczny szczegół „pomiń premię (`continue`)” — przeniesiony do L54 jako wariant 5. Reguła dziś: **L54**.

**Narracja (przeniesiona z `docs/LESSONS_PRZYPADKI.md`):**

**Narracja — przypadek (2026-08-14):**

**Objaw:** kara −70 za jałowe zagranie (destroy w cel z tarczą regeneracji) nie
zmieniła zachowania bota.
**Przyczyna:** scoring sumuje składniki: zaraz po karze ta sama gałąź dodawała
premię za „usunięcie permanentu przeciwnika", która ją przebijała.


---

## L7 (2026-08-14) — Weryfikuj stan repozytorium, nie treść zlecenia

**Reguła:** repo, testy i dokumentacja są źródłem prawdy (AGENTS.md). Sesję
zaczynaj od pomiaru (`npm test`, `npm run build`, `git log`), nie od przyjęcia
zlecenia na wiarę. Rozbieżność zgłoś jawnie.

→ narracja: poniżej (przeniesiona z `docs/LESSONS_PRZYPADKI.md` razem z wpisem)

**W archiwum, bo:** Przypomnienie procedury startowej, nie wiedza o silniku: reguła żyje w `AGENTS.md` („Repozytorium, testy i dokumentacja są źródłem prawdy”) oraz w `docs/setup/ENVIRONMENT.md` §7 (tam stoi razem z cytatem L7). Reguła dziś: **AGENTS.md + ENVIRONMENT.md §7**.

**Narracja (przeniesiona z `docs/LESSONS_PRZYPADKI.md`):**

**Narracja — przypadek (2026-08-14):**

**Objaw:** handoff stwierdzał, że pięć fixów przepadło z working tree poprzedniej
sesji; audyt `main` wykazał, że cztery są w repo wraz z testami (M90).
**Przyczyna:** opis zadania powstał z pamięci o przebiegu sesji, nie z pomiaru
stanu repozytorium.


---

## L8 (2026-08-14) — `git checkout <plik>` cofa także własne, niezacommitowane zmiany

**Reguła:** przed instrumentowaniem kodu ZACOMMITUJ fix albo przywracaj zmiany
punktowo (edycja odwrotna). Po każdym `git checkout` sprawdź `git diff`/testem,
że zamierzona zmiana istnieje.
**Więcej pułapek:** [docs/setup/ENVIRONMENT.md](setup/ENVIRONMENT.md).

→ narracja: poniżej (przeniesiona z `docs/LESSONS_PRZYPADKI.md` razem z wpisem)

**W archiwum, bo:** Pułapka `git checkout` powtórzona w pełni w L136 — razem z profilaktyką, której L8 nie miał: `git diff --stat` przed `restore`, kopie plików zamiast gita, checkpoint po każdym findingu. Reguła dziś: **L136**.

**Narracja (przeniesiona z `docs/LESSONS_PRZYPADKI.md`):**

**Narracja — przypadek (2026-08-14):**

**Objaw:** przy usuwaniu tymczasowego `console.error` przez `git checkout`
zniknął też fix wprowadzony w tym samym pliku (M90).


---

## L9 (2026-08-14) — Praca istnieje dopiero po `git push`

**Przypadek:** (a) handoff twierdził, że pięć fixów przepadło — bo nie były wypchnięte; (b) sandbox odtworzył workspace w środku pracy i commit wylądował na `main`.

**Reguła:**
- Commituj i pushuj po każdym samodzielnie zielonym kroku, nie zbieraj
  commitów „na koniec".
- Po commicie sprawdź `git log --oneline -1` (czy HEAD tam, gdzie trzeba).
- Po resecie workspace: `git fetch origin <gałąź>` + `git reset --hard
  FETCH_HEAD`; commit omyłkowo na `main` przenieś `cherry-pickiem` (najpierw
  `git branch backup-… <sha>`).
- Co ma przetrwać sesję, musi być W REPOZYTORIUM: ustalenie z czatu bez pliku
  nie istnieje.

→ narracja: poniżej (przeniesiona z `docs/LESSONS_PRZYPADKI.md` razem z wpisem)

**W archiwum, bo:** Dyscyplina commita/pushu opisana w L136 pkt 1 i w `ENVIRONMENT.md` §2 (jedyne źródło prawdy o sandboxie); wpis opisywał incydent z 2026-08-14 (pięć nie wypchniętych fixów, commit na `main`). Reguła dziś: **L136 + ENVIRONMENT.md §2**.

**Narracja (przeniesiona z `docs/LESSONS_PRZYPADKI.md`):**

**Narracja — przypadek (2026-08-14):**

**Objaw (dwukrotny):** (a) handoff twierdził, że pięć fixów przepadło z
workspace — bo nie zostały wypchnięte; (b) sandbox odtworzył workspace ze
świeżego klona w środku pracy i commit wylądował na `main`.

**Przyczyna:** nowa sesja Areny widzi wyłącznie `main` na GitHubie i treść
pierwszego promptu (ADR 0013). Środowisko może zresetować workspace w trakcie
sesji (reflog: `clone: from …`).

**Procedury:** [docs/setup/ENVIRONMENT.md](setup/ENVIRONMENT.md) §1–2.


---

## L10 (2026-08-14) — Zanim zaczniesz szukać winy w konfiguracji, sprawdź dane

**Przypadek:** — właściciel zgłosił, że PR od 30 minut nie ma opcji scalania ani informacji o CI.

**Wniosek:** stan po stronie GitHuba był poprawny — objaw dotyczył warstwy
prezentacji u zgłaszającego (cache przeglądarki).

**Reguła:** przy „coś nie działa w UI GitHuba" zbierz TWARDE DANE Z API przed
zmianą konfiguracji. Zmiana ustawień pod objaw widoczny w jednej przeglądarce
potrafi zepsuć działający setup.

→ narracja: poniżej (przeniesiona z `docs/LESSONS_PRZYPADKI.md` razem z wpisem)

**W archiwum, bo:** Jednorazowy przypadek obsługowy (cache przeglądarki właściciela: PR „bez opcji scalania”), zero wystąpień w kodzie i testach. Ogólna reguła „najpierw twarde dane, potem zmiana konfiguracji” żyje w rodzinie L29/L56. Reguła dziś: **L29, L56**.

**Narracja (przeniesiona z `docs/LESSONS_PRZYPADKI.md`):**

**Narracja — przypadek (2026-08-14):**

**Objaw:** właściciel zgłosił, że PR od 30 minut nie ma opcji scalania ani
informacji o CI. Odruch: szukać błędu w workflow albo w ochronie gałęzi.

**Diagnoza (4 zapytania):** (1) `gh pr view --json state,mergeable,
mergeStateStatus,statusCheckRollup` → `MERGEABLE`, `CLEAN`, check `test` =
`SUCCESS`; (2) `git ls-remote origin <gałąź>` vs `head_sha` runu CI → ten sam
commit; (3) `gh api repos/…/rules/branches/main` → reguły, `reviewThreads.
totalCount = 0`; (4) `githubstatus.com/api/v2/summary.json` → brak incydentów.


---

## L23 (2026-08-16) — Koszt karty to DANE: pipy kolorowe i mana value weryfikujesz maszynowo

**Przypadek:** w katalogu siedziały trzy błędy kosztów: „{B}{B}" i „{R}" jako sama liczba many, a {2}{U} jako `manaCost: 2` (karta o manę tańsza).

**Reguła:** dane w dwóch reprezentacjach dostają strażnika porównującego je
maszynowo (`manaCost` = mana value stringa kosztu dla KAŻDEJ karty; osobny skan
porównuje pipy linii „{koszt}: efekt" z `cost.colors`). Skanery, które trafiły,
zostaw w pakiecie jako test-strażnik.

→ narracja: poniżej (przeniesiona z `docs/LESSONS_PRZYPADKI.md` razem z wpisem)

**W archiwum, bo:** Jednorazowa instancja klasy „dane w dwóch reprezentacjach porównuj maszynowo”: strażniki (`manaCost` = mana value, pipy vs `cost.colors`) są w pakiecie, a wzorzec przeniesiony do L152 (strażnik danych). Reguła dziś: **L152 + istniejące strażniki danych**.

**Narracja (przeniesiona z `docs/LESSONS_PRZYPADKI.md`):**

**Narracja — przypadek (2026-08-16):**

**Objaw:** w katalogu siedziały trzy błędy kosztów: „{B}{B}" i „{R}" zapisane
jako sama liczba many (zdolność opłacalna dowolnym kolorem) oraz {2}{U}
zapisane jako `manaCost: 2` (karta o manę tańsza). Testy kart sprawdzają
SKUTEK zdolności, nie to, czy dało się ją opłacić złym kolorem.

**Przyczyna:** koszt żyje w dwóch reprezentacjach (`MANA_COSTS[id]` jako string
Oracle i `manaCost`/`cost.colors` jako dane silnika) bez bramki między nimi.


---

## L35 (2026-08-17) — Nowy widget dziedziczy dług dotykowy, jeśli rodzina nie ma reguły

Uwaga C właściciela („ptaszki w wyborze atakujących za małe na telefonie") nie
była regresją: te pola NIGDY nie miały CSS. Klasy `.combat-wizard-*` istniały w
JS od M66, ale w `index.html` nie było dla nich reguły — przeglądarka
renderowała checkbox ~13-16 px. Identyczny problem rozwiązano w M91 dla
ptaszka wyciszenia (`.action-ignore`), ale poprawka nie objęła drugiego miejsca,
bo nikt nie zapytał „gdzie jeszcze mamy pola wyboru".
**Reguła:** przy poprawce ergonomii dotyku pytaj o RODZINĘ kontrolek (wszystkie
checkboxy / steppery), nie o zgłoszony widget. Jedno zapytanie o
`type = 'checkbox'` i `ghost-btn` wskazało trzy miejsca (atakujący, blokujący,
steppery przydziału obrażeń) — dwa jeszcze niezgłoszone.
**Strażnik:** próg liczbowy (44 px wg Apple HIG) czytający źródło CSS — styl nie
ma reprezentacji w testach DOM-owych.

**W archiwum, bo:** Jednorazowa poprawka ergonomii dotyku (M127) — bez reguły o silniku; pytanie o RODZINĘ kontrolek i próg 44 px mają dziś dom w rodzinie strażników stylu (L125/L126), a sam fakt nigdy nie miał strażnika. Reguła dziś: **L125**.


---

## L62 (2026-08-25) — Kolejność renderu to część kontraktu: log rysowany od najnowszego łamie liczenie „nowych" po indeksie

**Przypadek:** — kolektor wpisów logu w Żywym Testerze („odpytuj nowe linie `#log` po indeksie") znajdował 0 wpisów, choć sesja je generow…

**Reguła:** zanim oprzesz narzędzie na „nowe elementy = ogon listy", sprawdź w
renderze kierunek rysowania (`reverse()`, `prepend`, `insertBefore`,
`column-reverse`). Kolejność renderu to kontrakt UI jak nazwy klas.

→ narracja: poniżej (przeniesiona z `docs/LESSONS_PRZYPADKI.md` razem z wpisem)

**W archiwum, bo:** Technika przestarzała: narzędzie czyta stan przez mostek strukturalny (L133), więc kierunek rysowania logu przestał mieć znaczenie — L62 był obejściem poprzedniej generacji sond. Reguła dziś: **L133**.

**Narracja (przeniesiona z `docs/LESSONS_PRZYPADKI.md`):**

**Narracja — przypadek (2026-08-25):**

**Objaw (M205):** kolektor wpisów logu w Żywym Testerze („odpytuj nowe linie
`#log` po indeksie" — wg handoffu) znajdował 0 wpisów, choć sesja je
generowała i `session.log` je miał.

**Przyczyna:** `render.js` rysuje log od NAJNOWSZEGO
(`[...session.log].reverse()`), więc nowe wpisy dokładają się na POCZĄTKU
listy DOM; pętla `for (i = widzianeDotąd; i < entries.length; i++)` czytała
najstarsze jako „nowe". Poprawnie: `entries.slice(0, nowe).reverse()`.

**Wariant z tej samej sesji:** `--out katalog/plik.txt` do nieistniejącego
katalogu wywracał zapis na ENOENT dopiero PO ~40-sekundowym przebiegu — cały
transkrypt przepadał. Narzędzie waliduje miejsce zapisu ZANIM zacznie mierzyć
(L33).


---

## L122 (2026-09-02) — Materiał do audytu przepuść przez niezmienniki repo w tej samej minucie

**Przypadek:** żeby podnieść pokrycie kreatora celów w Żywym Testerze, ułożyłem
talię `decks/wielocelowa.txt` (12 kart pickerowych + 12 ciał; talia-sonda usunięta po audycie — trafiała do licznika repo-decks).

**Reguła:** niezmiennik, który mówi „brak materiału", jest rozstrzygnięciem projektu,
nie błędem formatowym do obejścia. Czytaj komunikat strażnika do końca: tu pierwszy
był formatowy (lądy), a drugi zasadniczy — i to on pokazał, że realnym problemem jest
surowiec (7 na 443 kart z >1 celem), nie brak chęci. Trzecia droga (przenieść karty
między taliami) była gorsza niż brak talii, bo talie karmią benchmark i audyt remisów.

**Strażnik:** `test/repo-decks.test.js` + `test/m132-proporcje-landow.test.js`;
wniosek zapisany w `docs/backlog.md` §1 i §4.

→ narracja: poniżej (przeniesiona z `docs/LESSONS_PRZYPADKI.md` razem z wpisem)

**W archiwum, bo:** Jednorazowy materiał audytowy (talia-sonda `wielocelowa` odrzucona przez `repo-decks`); niezmienniki mają własnych strażników, a wniosek o surowcu siedzi w `docs/backlog.md` §1/§4. Reguła dziś: **strażniki `repo-decks`/`m132` + backlog §1/§4**.

**Narracja (przeniesiona z `docs/LESSONS_PRZYPADKI.md`):**

**Narracja — przypadek (2026-09-02):**

Zanim zdążyłem
wymyśleć obejście, dwa strażniki powiedziały „nie": M132/B (3,00 nielandowych na ląd
przy progu 2,00) i M178/ADR 0023 (każda wspierana karta w DOKŁADNIE jednej talii —
11 z 12 moich kart już gdzieś leżało).


---
