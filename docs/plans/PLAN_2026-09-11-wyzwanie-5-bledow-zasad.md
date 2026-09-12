# PLAN 2026-09-11 — wyzwanie: 5 unikalnych błędów/uproszczeń vs zasady MtG (brązowa odznaka)

> **Wyzwanie właściciela (2026-09-11):** „Przejrzyj istniejące karty i mechaniki i znajdź, a potem
> napraw 5 unikalnych błędów/uproszczeń vs zasady MtG. Inne modele w innych sesjach mogły coś
> ominąć, pomylić, uprościć niezgodnie z zasadami, ograniczyć. […] Pamiętaj o sprawdzeniu online
> (a nie w pamięci treningowej) CR i rulings przed zmianą czegokolwiek.”
>
> **Status:** PR #113 (gałąź `arena/01a08d0e-mtg`), kontynuacja — audyt PR #112 i pętla jakości
> już w tym PR (commity `7248098`…`97f5209` na GitHubie). Ten plan dokłada pięć kroków E1–E5.
> **Uwaga operacyjna:** połączenie z GitHubem w tej sesji zwraca 401 (gh) / brak poświadczeń
> (git) — kroki są commitowane lokalnie, push po odnowieniu połączenia (bez force push).

## Metoda (ADR 0030 + L13 + L41)

Każdy krok: **dowód online** (CR/ruling z mtg.wiki lub Scryfall, cytowany w teście i w kodzie) →
**test RED** pokazujący odstępstwo → **naprawa w źródle reguły** (jeden predykat/jedna funkcja,
żadnej karty-wyjątku w silniku — ADR 0002) → **mutacja over-fix** (sprawdzian, że straż nie jest
pusta) → `npm test` + `npm run build` → osobny commit.

Reguły pobrano 2026-09-11 z `mtg.wiki` (CR z 7 sierpnia 2026 — *The Hobbit*) i ze Scryfall API
(Oracle + rulings). Żadnej reguły nie wzięto z pamięci modelowej; tam, gdzie pamięć modelowa
mijała się ze stanem faktycznym (proliferate, numeracja SBA), zostało to odnotowane poniżej.

## Tabela wyzwań

| # | Zgłoszenie | Źródło prawdy | Co jest źle | Naprawa |
|---|---|---|---|---|
| 1 | Bloodthirst liczy „czy **źródło** zadało obrażenia”, nie „czy **przeciwnik dostał** obrażenia” | CR 702.54a + M12 FAQ 2011-05-25 | `state.dealtDamageToOpponentThisTurn[dealer]` — klucz to kontroler źródła, a warunek `dealer !== e.target` oznacza „źródło zadało obrażenia komuś innemu niż cel” | stan per **odbiorca** obrażeń; warunek wejścia = „przeciwnik kontrolera wchodzącego stwora dostał obrażenia w tej turze” |
| 2 | Changeling nie działa — porównania podtypów czytają surowe `object.subtypes` | CR 702.73a + Lorwyn Rules Primer 2007-08-23 | `creatures_with_subtype` / `creature_without_subtype` / statyka plemienna pomijają CDA (63 karty z keywordem; „works everywhere, even outside the game”) | jeden predykat `hasCreatureType()` w `permanents.js` (L41) + wszystkie porównania podtypów stworów przez niego |
| 3 | **NIEAKTUALNA (korekta 2026-09-12, sesja PR #114):** brak akcji stanowej parowania liczników +1/+1 z −1/−1 | CR 704.5q + CR 704.8 (przykład Young Wolf) | pary liczników zostają na permanencie (pulpit, proliferate, „has a +1/+1 counter”), a persist/undying odpalają się po śmierci od −1/−1 mimo LKI z +1/+1 | `removePairedCounters()` w SBA + snapshot LKI sprzed przebiegu (704.8) |
| 4 | Bloker blokujący dwóch atakujących zadaje **pełną moc każdemu** | CR 510.1a + 510.1d (przykład z 702.19b: „2/2 that can block an additional creature”) | pętla obrażeń iteruje po atakujących i dla każdego z nich przydziela blokerowi pełną moc — moc mnoży się przez liczbę blokowanych | przydział obrażeń blokera dzielony między atakujących (decyzja obrońcy, boty lethal-first) |
| 5 | **NIEAKTUALNA (korekta 2026-09-12, sesja PR #114):** trample + deathtouch: przydział wymaga pełnej wytrzymałości każdego blokera | CR 702.19b + M11 FAQ 2010-07-02 | `lethalOf()` liczy `toughness − damage` bez deathtouch, więc legalny przydział (1 na blokera, reszta w gracza) jest odrzucany jako nielegalny | deathtouch źródła ⇒ „1 obrażenie to lethal” w `lethalOf` |

## Korekta 2026-09-12 (sesja PR #114, `arena/01a0925f-mtg`)

Triża kroków 3–5 została zmierzona w kodzie i skonfrontowana ze źródłami online
(ADR 0030) w `PLAN_2026-09-11b-audyt-pr113-wyzwanie-3-5.md`, sekcja „Punkt
zaczepienia". Stan faktyczny pięciu wyzwań:

| # | Stan na 2026-09-12 |
|---|---|
| 1 | Zrealizowane w PR #113 (bloodthirst, `2bf9405`). |
| 2 | Zrealizowane w PR #113 (changeling, `2bc5ee2`). |
| 3 | **NIEAKTUALNE.** Parowanie +1/+1 z −1/−1 ISTNIEJE w silniku (SBA, CR 704.5r/704.5q) — teza oparta na pamięci modelowej, nie na pomiarze. |
| 4 | Zrealizowane w PR #114 jako **W3** (`c5adc97`, `test/wyzwanie-3-podzial-obrazon-blokujacych-510-1d.test.js`); sąsiedztwo domknięte jako **W4** (`41dc498` — wszystkie przydziały ogłaszane PRZED zadaniem obrażeń, CR 510.1/510.2). |
| 5 | **NIEAKTUALNE w sformułowaniu z planu.** `lethalOf()` (combat.js) LICZY deathtouch: dla źródła z deathtouch lethal = 1, więc przydział 1 na blokera 3/3 + reszta w gracza jest legalny; kombinacja trample+deathtouch ma testy (`test/e8-b4-trample-protection.test.js`). Realny błąd w tym sąsiedztwie był INNY i naprawiono go jako **W5** (`fa52619`): lethal blokera nie uwzględniał obrażeń przydzielanych mu w TYM SAMYM kroku przez inne stwory (CR 702.19b: „damage from other creatures that's being assigned during the same combat damage step"; CR 702.2b dla deathtouch) — pomiar: `tools/probe-w5-trample-lethal-w-kroku.mjs`. |

Kroki **E4** i **E6** tego planu są więc skreślone (tezy nieaktualne), **E5**
zrealizowany jako W3, **E7** przejęty przez `PLAN_2026-09-11b` (domknięcie sesji
PR #114). Wyzwanie właściciela (5 unikalnych błędów) domknięte w PR #113 (1–2)
i PR #114 (3 = W3, 4 = W4, 5 = W5).

## Kroki

- **E1 (plan)** — ten plik.
- **E2 bloodthirst** — test `test/wyzwanie-1-bloodthirst-odbiorca-obrazen.test.js`
  (trzy scenariusze: obrażenia zadane sobie przez przeciwnika ⇒ krew wchodzi; własne
  samouszkodzenie ⇒ nie wchodzi; obrażenia z Manabarbs-like od źródła przeciwnika ⇒ wchodzi).
- **E3 changeling** — test `test/wyzwanie-2-changeling-typy-stworow.test.js` (cel „non-Mount”
  nie trafia changelinga; statyka plemienna go wzmacnia; „can't be blocked by Vampires”
  blokuje changelinga w każdej strefie).
- **E4 liczniki +1/+1 vs −1/−1** — test `test/wyzwanie-3-pary-licznikow-704-5q.test.js`
  (parowanie, LKI 704.8 ⇒ persist NIE wraca, gdy śmierć i parowanie w tym samym przebiegu,
  ale wraca, gdy pary zniknęły wcześniej).
- **E5 bloker vs dwóch atakujących** — test `test/wyzwanie-4-bloker-dwoch-atakujacych-510-1d.test.js`
  (Cenn's Tactician 2/2 blokujący dwóch: łącznie 2 obrażenia, nie 4).
- **E6 trample + deathtouch** — test `test/wyzwanie-5-trample-deathtouch-lethal-1.test.js`
  (przydział 1 na blokera 3/3 + reszta w gracza jest legalny).
- **E7** — `npm run test:all` (brama PR), wpis w opisie PR #113 (REST PATCH, nie `gh pr edit`).

## Ryzyka

- **E2** dotyka ~100 miejsc porównujących podtypy — regresje w talii/trybach plemiennych;
  mitigacja: jeden predykat + pełny `npm test` + przegląd wszystkich `.subtypes` w silniku.
- **E4** zmienia stan gry (liczniki znikają) — snapshot złotej odznaki bota może się zmienić;
  jeśli zmiana wynika z poprawnych zasad, snapshot aktualizujemy i opisujemy w PR.
- **E5** wprowadza decyzję gracza w środku `resolve_combat` (jak przydział atakującego) —
  trzeba zachować brak zawieszeń i determinizm botów.
- **GitHub 401** — brak pusha; praca w commitach lokalnych, push po odnowieniu tokena.
