# PLAN 2026-10-04a — PMSSB-52: kondensacja rejestru lekcji (budżet lektury na 99,96%) + 3 lekcje z tej sesji

Wejście: kolejka z `docs/setup/HANDOFF_2026-10-03i.md`/`03j` (pozycja 3) oraz
AGENTS.md §0 („gdy próg zostanie przekroczony, przepisanie/rozdzielenie
dokumentów staje się obowiązkowym zadaniem sesji, a nie opcją”).

## Problem (zmierzony)

Budżet lektury startowej (AGENTS.md §0 poz. 1–4, strażnik
`test/dokumentacja-budzet-lektury.test.js`, próg 100k) stał na **99,958
tokenów — 42 tokeny zapasu** przy `c6181b8`: jakikolwiek nowy wpis w rejestrze
lekcji (a kolejka ma trzy kandydatów) przekraczał próg i czerwienił bramkę.
Rozkład przed: AGENTS.md 8,160 · ADR-y (30) 38,952 · **LESSONS.md 49,453** ·
ENVIRONMENT.md 3,393.

## Zakres (mechanizm z PR #93 / M284 — bez zmiany kontraktu)

1. Rejestr skraca się do postaci `## LN (data) — reguła w jednym zdaniu` +
   **Przypadek** + **Reguła** + **Strażnik** + `→ narracja: … (LN)`;
   proza (Objaw/Przyczyna, dowody, tabele) przenosi się w CAŁOŚCI do
   `docs/LESSONS_PRZYPADKI.md` (poza budżetem) pod tym samym numerem.
2. Numery `## LN` są cytowane w kodzie ~1150 razy — **żaden nie znika**
   (strażnik: mapa klas + kotwice + obecność nagłówków w archiwum).
3. Wpisy-kotwice zostawiają własny KONKRET (≥300 zn. dla listy strażnika).
4. Progu NIE podnosimy (L5/L66/M208).

## Kryteria ukończenia

1. `npm test` zielony, w tym strażnicy docs (25/25 w pliku `docs-decisions`
   + `dokumentacja-budzet-lektury`).
2. Liczba wpisów rejestru: 164 → 167 (zero ubytków; +L174–L176).
3. Każdy nowy odsyłacz `→ narracja` ma nagłówek w archiwum; każdy nagłówek
   archiwum ma wpis w rejestrze.
4. Zapas budżetu ≥ 250 tokenów (start: 42).
5. Trzy lekcje-kandydaci z tej sesji dopisane: L174 (bramka na zamrożonym
   drzewie), L175 (`name != null` ≠ karta, CR 108.2b), L176 (`--dump`
   lokalizuje dryf golden-mastera).

## Wykonanie (2026-10-04)

**Skrócone wpisy (proza → archiwum, dodany odsyłacz):** L161, L113, L101, L34,
L110, L37, L111, L31, L73, L53, L141, L112, L146, L124, L123, L159, L160,
L48, L164, L169. **Nagłówek rejestru** (opis kontraktu, mapa klas, sekcja
archiwum) skrócony o ~0,6 kB bez zmiany wymaganych fraz strażnika.

**Nowe lekcje (L174–L176)** — treść z tej sesji:

| nr | reguła | dowód |
|---|---|---|
| L174 | bramkę uruchamiaj na zamrożonym drzewie; brak wyniku ≠ zielony | `test:all` po `c6181b8` zniknął w resecie środowiska; wynik wiąże się z commitem |
| L175 | „czy to karta” czytaj z `isToken`, nie z `name` | F6 audytu PR #153: 12 kopii `name != null`, filtr bota po `name` był MARTWY |
| L176 | dryf golden-mastera lokalizuj `--dump` PRZED/PO, nie mutacjami | PMSSB-50: pierwsza różniąca się decyzja #104 po zrzucie śladu |

**Pomiary budżetu:** 99,958 → **99,701 tokenów** (zapas 42 → **299**), mimo
dodania trzech wpisów. Robocza reguła na przyszłość: nowy wpis (~0,5–0,7 kB)
kosztuje ~180–250 tokenów, więc pas 300 tokenów wystarcza na 1–2 wpisy —
kolejna kondensacja będzie potrzebna przy trzecim.

**Strażnicy po zmianach:** 25/25 (`docs-decisions` + `budżet lektury`),
`git` bez zmian w kodzie (tylko `docs/LESSONS.md`, `docs/LESSONS_PRZYPADKI.md`).

## Pułapka tej rundy (dopisana do raportu, nie do rejestru)

Pierwsza wersja skryptu kondensującego wycinała wpis „od nagłówka do
następnego nagłówka” — przy złym dopasowaniu zniknęło 50 wpisów z ogona
pliku. Ratunek: kopie `LESSONS.md`/`LESSONS_PRZYPADKI.md` w `/tmp` przed
passem + powtórka metodą **podmiany dokładnego bloku z asercjami** (blok
unikalny, proporcja długości 0,25–1,15, licznik nagłówków `## L\\d+ (` stały
przed i po). Wniosek dla kolejnych passów: żadnych cięć po indeksie pozycji
w dużym pliku — tylko dopasowanie treści z weryfikacją liczby nagłówków.

## Granice świadome

Ten pass NIE wyczerpuje tematu: najgrubsze wpisy (1,2–1,9 kB: m.in. L164,
L169, L170, L165, L168, L163, L5, L167, L171) niosą nadal 4–6 punktów reguły
z konkretami — skrócenie ich wymaga decyzji, co jest regułą, a co dowodem,
i jest materiałem na kolejny pass (kandydat kolejki). Progu nie podnoszono.
