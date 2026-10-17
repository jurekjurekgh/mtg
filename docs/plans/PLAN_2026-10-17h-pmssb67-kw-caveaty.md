# PLAN 2026-10-17h — PMSSB-67: caveaty PMSSB-64 (słowa kluczowe ciała)

Zlecenie właściciela (2026-10-17, po pytaniu o zakres): **wszystkie cztery punkty** z sekcji
„Ograniczenia" raportu `docs/audits/PMSSB64_BATCH68_2026-10-17.md`, każdy przez pełną pętlę
PMSSB (`docs/PMSSB.md`, procedura 0–7), commit i push po każdej frakcji.

Etykiet (a)–(c) nie ma w dokumentach. Mapowanie przyjęte w tym planie (po odpowiedzi właściciela
„wszystko"):

| Frakcja | Punkt raportu | Istota |
|---|---|---|
| F1 | 4. brak pinu na `MASS_EVASION_KEYWORDS` | masowe zniszczenie wyceniane z pinem, nie tylko kodem |
| F2 | 3. latający 0/0 (Necrosquito) | rzut wyceniany mocą z karty (0), a wchodzi jako 2/2 z licznikami oil |
| F3 | 2. lifelink bez blokerów i atakujących | wartość lifelinku nie zależy od tego, czy ciało przeżyje walkę |
| F4 | 1. płaskie wagi 9 słów kluczowych | owner zakazał płaskich stałych w wycenie batcha 68 |

Zasada właściciela: wycena ma być stanowa (stół, ręka, cmentarze, faza, życie, biblioteka). Nie
wprowadzamy nowych płaskich stałych. Każda zmiana wagi ma PRZED/PO na sondzie stanu.

## Krok 0 — plan

Ten dokument. Commit przed pomiarem.

## Krok 1 — POMIAR PRZED

Sonda: `tools/pmssb67-kw-sonda.mjs`. Scenariusze: rzut ciała z ręki (`cast_permanent`, `castScore`
z `tools/pmssb64-keywords-sonda.mjs`) przy zestawie stołów: pusty, wróg z blokerem, wróg z latającym,
dwóch blokerów, wróg z dużym atakiem, wróg z ręką (liczba kart), niskie życie. Wynik: Δ względem
ciała bez słowa na tym samym stole. Plus `massDestroyWorth` dla F1 (wróg z first_strike).

Inwentarz kart rodziny: ciała z lifelink/deathtouch/vigilance/first_strike/double_strike/menace/
trample/reach/indestructible/hexproof w `src/cards/card-data.js` (okna: cast, atak, blok).

## Krok 2 — AUDYT

Macierz: słowo × stół × etap (rzut / atak / blok). Obowiązkowe kontrole (procedura 2):
(a) L41 — rzut, warp, adventure, planowanie liczą to samo (`creatureKeywordValue`);
(b) koszt czaru — wycena słowa nie zmienia kosztu many;
(c) anty-over-fix — najsłabszy realny wariant (ciało 1/1, brak stołu) zostaje na dawnej wartości.

## Krok 3–7 — per frakcja

Każda frakcja: poprawka w `heuristic-bot.js` + parametry w `heuristic-params.js` (z uzasadnieniem),
test `test/audyt-pmssb67-*.test.js` (RED→GREEN, pokrętło ×0 steruje), bramy (`npm test`, `test:all`,
build, `cr-numery --sprawdz`), lustro (`tools/pmssb66-mirror.mjs` / `pmssb64-mirror.mjs`), golden master
(dump diff; regeneracja fixtura tylko świadomie po diffie), raport `docs/audits/PMSSB67_*`, wpis w
`docs/PMSSB.md` (rejestr) i `docs/PROJECT_HISTORY.md`. Push po każdej frakcji.

## Dowód

Zlecenie właściciela: taktycznie mądra gra, nie zielone testy. Każda liczba w raporcie ma scenariusz
PRZED/PO na tym samym stole, zmieniany jednym czynnikiem.
