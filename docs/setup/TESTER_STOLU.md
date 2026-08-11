# Żywy tester stołu — audyt rozgrywki „z perspektywy gracza"

> Narzędzie: `tools/table-tester/` (automatyczny gracz na artefakcie przez jsdom).
> Wprowadzone: M73b (2026-08-11, PR #42). Pomysł właściciela: „wciel się w
> gracza, rozegraj partię i obserwuj stół".

## Po co to jest

Testy engine (`npm test`) weryfikują reguły i protokół. Ale **nie weryfikują
tego, co faktycznie widzi gracz**: etykiet akcji, modalów wyboru, zachowania
bota, kolejności rozstrzygania na stole, logu. „Żywy tester" wypełnia tę lukę:

- ładuje **prawdziwy zbudowany artefakt** `dist/mtg-table.html` (ten sam plik,
  który otwierasz na telefonie),
- uruchamia partię człowiek-vs-bot i **gra rolę gracza** — klika akcje w panelu
  „Twoje działania", odpowiada na modale (mulligan, szukanie w bibliotece,
  scry/surveil, wizardy atakujących/blokujących, wybory celów), zamyka modal
  „Ruch przeciwnika",
- zapisuje **transkrypt**: wskaźnik tury, stos, panel akcji, ręka, pola,
  ogon logu w kolejnych krokach.

To narzędzie **audytowe** — wykrywa błędy UX i „głupie zachowania", które
przeszłyby przez testy engine. Nie zastępuje `npm test` ani testów na
telefonie (jsdom nie renderuje layoutu/obrazów — patrz „Ograniczenia").

## Jak używać (dla agentów)

```bash
npm run build                      # 1. zbuduj artefakt (wymagany)
cd tools/table-tester && npm i     # 2. zainstaluj jsdom (jedyna zależność)
node run-game.mjs --human green --bot red --seed 42 --steps 300 --out g1.txt
```

Opcje:

| Opcja | Znaczenie | Domyślnie |
|---|---|---|
| `--human <talia>` | talia gracza (nazwa z `decks/*.txt` bez `.txt`) | `green` |
| `--bot <talia>` | talia bota | `red` |
| `--seed <n>` | seed partii | `42` |
| `--steps <n>` | limit kroków gry | `300` |
| `--out <plik>` | plik transkryptu | `transcript.txt` |
| `--quiet` | bez snapshotów co krok (mniejszy transkrypt) | — |
| `--snapshot-every <n>` | snapshot co n kroków (przy `--quiet`) | `3` |
| `--help` | pomoc | — |

Dostępne talie: lista `decks/*.txt` (aktualnie: azorius, black, graveyard,
green, innistrad, red, spellslinger, tokens, wiedzmin).

Przykłady kombinacji do audytu: `green vs red` (ramp vs aggro),
`tokens vs spellslinger` (tokeny i czary), `innistrad vs wiedzmin` (wilkołaki
i transformy), `azorius vs black` (aura/protection vs destroy).

### Jak czytać transkrypt

```
--- krok 12 | T. 4 On | Ty: 15 ż. | On: 20 ż. | Główna 1 ---
  STOS: Caravan Vigil (rzuca: Ty)          ← co na stosie (i kto rzucił)
  AKCJE: ...                               ← panel „Twoje działania"
  RĘKA: Forest | Servant of the Scale ...  ← kafle ręki (po jednym na kartę)
  MOJE POLA: ...                           ← kafle Twojego bitwiska
  POLA WROGA: ...                          ← kafle bitwiska wroga
  LOG: ...                                 ← ogon logu partii
  >> Zagraj ląd: Forest                    ← akcja, którą „kliknął" gracz
  [modal choice] Wybierz: Szukanie ... -> klikam opcję: ...
```

- `[STOP] brak akcji` — gra utknęła w oknie bez akcji: **sygnał do zbadania**
  (albo bug, albo okno wymagające innej interakcji — sprawdź też modale).
- `== KONIEC PARTII ==` — naturalny koniec (wygrana/przegrana/deck-out).
- `== LIMIT KROKÓW ==` — partia dłuższa niż `--steps` (podnieś limit).
- Etykiety akcji i modali to **to, co zobaczyłby gracz** — zwracaj uwagę na:
  czytelność, dublowanie kosztów, brakujące nazwy (`?`), polskie opisy.

### Polityka „gracza"

Sterownik wybiera akcje w ustalonej kolejności priorytetów:
dobierz kartę → zagraj ląd → rzuć czar (`Rzuć:`) → zagraj permanent (`Zagraj:`)
→ aktywuj zdolność (`Aktywuj:`) → wznow grę bota → otwórz wybór (`Wybierz:`)
→ pass. W modalu wyboru klika **pierwszą opcję** (albo zatwierdza wizarda,
a w wizardze atakujących zaznacza pierwszego dowolnego atakującego). To prosta
heurystyka — ma odgrywać partię sensownie, nie optymalnie.

## Ograniczenia (ważne)

- **jsdom nie renderuje obrazów ani layoutu** — audyt dotyczy treści DOM
  (etykiety, modale, kolejność), **nie wyglądu**. Wygląd weryfikuj na telefonie
  (Pages) albo w prawdziwej przeglądarce.
- Wymagany **świeży `npm run build`** — tester działa na artefakcie, nie na
  źródłach.
- Nie testuje: hover, pełnego ekranu, gestów dotyku, kreatora talii,
  zapisu/wznowienia (wymagają przeglądarki/IndexedDB).
- Część modalów (np. rozdzielanie obrażeń combat, wybór celu z listy) działa
  przez „pierwszą opcję" — do głębszych scenariuszy sterownik można rozbudować
  (patrz roadmapa).
- jsdom bywa wolniejszy niż Node — partie z limitem 300–600 kroków trwają
  sekundy–minuty.

## Zgłaszanie wyników

Audyty „żywym testerem" zgłaszaj jak inne audyty (wzorzec M54/M65/M73):
- opisz **co widział gracz** (cytat z transkryptu) i dlaczego to błąd/niejasność;
- napraw u root cause (nie maskuj);
- dodaj test regresyjny (engine lub UI) blokujący powrót błędu;
- transkrypt (`--out`) zachowaj w PR lub wklej fragment do opisu.

## Rozwój narzędzia (opcje na kolejne sesje)

Pełna lista: `docs/ROADMAP.md` → sekcja „Rozwój żywego testera stołu". Krótko:
tryb interaktywny (agent steruje w pętli), screenshoty przez headless
Chromium, więcej polityk gracza, wykrywanie podejrzanych etykiet (automatyczne
flagi: `?`, dublowane koszty, puste modale), integracja z CI jako test
opcjonalny.
