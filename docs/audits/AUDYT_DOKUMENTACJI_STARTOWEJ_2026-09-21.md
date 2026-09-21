# Audyt dokumentacji startowej (2026-09-21)

Zlecenie właściciela: „dogłębna analiza dokumentacji startowej — duża część
lekcji i ADR-ów jest merytorycznie nieaktualna"; kryteria: **lekcje na tematy
jednorazowe** (bez wpływu na przyszłe kodowanie) i **ADR-y, których decyzje
zostały dawno zmienione** → do archiwum, poza lekturą startową. Przy ADR-ach
sprawdzić, czy decyzja naprawdę została zmieniona, czy tylko uzupełniona.

Metoda: pomiar, nie wrażenie (L7). Lektura startowa = `AGENTS.md` + 29 ADR-ów
+ `docs/LESSONS.md` + `docs/setup/ENVIRONMENT.md`, budżet 100 000 tokenów
(`test/dokumentacja-budzet-lektury.test.js`, przelicznik 2,8 zn./tok.).

## 1. Wynik w jednym akapicie

**Przesłanka nie potwierdziła się w skali, którą zakładała.** Z 30 decyzji ADR
**żadna** nie wymaga dziś archiwizacji: 29 obowiązuje, a 0008 jest
zarchiwizowany od 2026-09-01 (jego żywe zasady przeniesiono do 0011).
Sprawdzenie „czy naprawdę zmieniona" wypadło na **korzyść dokumentu**: ADR 0006
(„najpierw audyt, potem decyzje") wygląda na zastąpiony przez 0009, ale 0009
mówi wprost „ADR 0006 **pozostaje w mocy** co do zasady… zmienia się wyłącznie
strategia wydzielenia" — czyli uzupełnienie, nie zmiana decyzji. W lekcjach:
162 wpisy, 0 merytorycznie martwych reguł; **3** wskazywały nieistniejące pliki
(naprawione), proza siedzi w archiwum. Realne znaleziska są więc mniejsze niż
oczekiwano, ale konkretne: **4 nieaktualne odsyłacze** w dokumentach, 1 rozjazd
wdrożenie↔decyzja (0012) i **7 427 B prozy** wyniesione z rejestru lekcji do
archiwum. Budżet startu: **99 406 → 97 007** tokenów (zapas ~3,0 tys.).

## 2. Budżet lektury startowej

| Pozycja | Przed | Po | Uwaga |
|---|---|---|---|
| `AGENTS.md` | 7 998 | 8 040 | +42 tok.: wpis o archiwum prozy w „Czego NIE czytasz" |
| `docs/LESSONS.md` | 49 235 | 46 583 | −2 652 tok.: 30 wpisów skróconych do reguły (proza → archiwum) |
| `docs/setup/ENVIRONMENT.md` | 3 393 | 3 393 | bez zmian |
| `docs/decisions/` (29 ADR + README) | 38 780 | 38 991 | +211 tok.: noty stanu w 0012/0014/0023/0029 |
| **Razem** | **99 406** | **97 007** | próg 100 000; zapas rośnie z ~0,6 tys. do ~3,0 tys. |

## 3. ADR-y — weryfikacja punkt po punkcie

Kryterium archiwizacji (README rejestru + zlecenie): decyzja **przestała**
obowiązywać i jej żywe zasady zostały przeniesione do następcy. Sprawdzono
każdy dokument + artefakt, który decyzję realizuje.

| ADR | Decyzja żywa? | Dowód / uwaga |
|---|---|---|
| 0001 katalog stopniowy | tak | `src/cards/registry.js`, statusy wsparcia, ADR 0022/0029 |
| 0002 engine niezależny od kart | tak | deskryptory efektów; brak gałęzi „po nazwie karty" |
| 0003 widoki graczy + FoW | tak | `playerView`, piny FoW (`test/fow-*`) |
| 0004 wymienne kontrolery | tak | `src/controllers/*` (heurystyczny, aggro, polityki) |
| 0005 determinizm i replay | tak | `src/engine/fingerprint.js`, testy determinizmu |
| 0006 audyt przed wydzieleniem | tak | **nie archiwizować**: 0009 §„Co to zmienia w ADR 0006" zostawia zasadę w mocy, zmienia tylko strategię |
| 0007 chroniony `main` + PR | tak | AGENTS.md §zasady, CI `test` na każdym PR |
| 0008 (archiwum) | nie — zastąpiona przez 0011 | żywe zasady przeniesione; poza lekturą od 2026-09-01 |
| 0009 standalone stół zamiast wydzielania | tak | `src/table/`, `tools/build.mjs` |
| 0010 dane reguł ręcznie w repo | tak | `card-data.js` + snapshoty Scryfall; §1 zastąpiony notą (0014) |
| 0011 źródła modularne, 1 artefakt | tak | build: 59 modułów → `dist/mtg-table.html` |
| 0012 kreator talii + format | tak (z notą) | **rozjazd wdrożenie↔decyzja:** panel nie jest montowany (`main.js` zakomentowany, PR #130/F); dopisana nota stanu 2026-09-21 — włączenie = odkomentowanie |
| 0013 sesje Arena + handoff | tak | `docs/setup/HANDOFF_*.md`, README |
| 0014 definicje w jednym module | tak | `src/cards/card-data.js`; dopisana nota: podział wg warstw (registry/materialize/mana-costs) |
| 0015 kolorowa pula many | tak | `resources.js` (`canPayColoredCost`, `spendMana`) |
| 0016 audyt poprzedniego PR + chirurgia | tak | AGENTS.md §tryb sesji |
| 0017 kontrakt PlayerView | tak | piny kompletności widoku, L1/L21 |
| 0018 pełny benchmark na komendę | tak | `tools/benchmark.mjs` (`--full`); domyślnie profil szybki |
| 0019 tiery testów + manifest | tak | `tools/run-tests.mjs` + `tools/test-manifest.json` |
| 0020 tryb sesji (PR, audyt, commity) | tak | AGENTS.md, ten przebieg |
| 0021 domyślna praca bez pytań o kolejkę | tak | AGENTS.md; brak pytań o kolejkę w sesji |
| 0022 pełny Oracle albo brak wsparcia | tak | `limitations`/`notes`, strażnicy katalogu |
| 0023 talie per plan, singleton, 1:2 landy | tak | `decks/*.txt`, `test/repo-decks.test.js` |
| 0024 podział talii po kolorach | tak | `decks/*-bg.txt` / `*-wur.txt` |
| 0025 budżet meczów benchmarku | tak | `tools/benchmark.mjs` (próbka par) |
| 0026 strefy na stole, `meta.exiledBy` | tak | `exiledBy` w engine, boksy w widoku |
| 0027 odznaka platynowa = analizator | tak | `tools/event-contract-audit.mjs` + `test/m273-kontrakty-zdarzen.test.js` |
| 0028 rulingi „przy kartce" | tak | snapshoty `docs/cards/*.json` niosą `rulings` |
| 0029 katalog = kolekcja właściciela | tak | `test/proweniencja-katalogu.test.js` |
| 0030 CR i rulingi ze źródeł online | tak | AGENTS.md + praktyka sesji |

**Nieaktualne odsyłacze naprawione** (decyzji nie ruszano):

| Miejsce | Było | Jest |
|---|---|---|
| ADR 0023 §4 | `test/m181-auto-awans` | `test/m181-auto-awans.test.js` |
| ADR 0029 kontekst | `decks/wiedzmin.txt` | + nota: dziś `wiedzmin-bg.txt` + `wiedzmin-wur.txt` (podział ADR 0024) |
| ADR 0014 koszty | propozycja `src/cards/real-batch12.js` | nota stanu: podział wg warstw, nie per-batch |
| ADR 0012 | brak informacji o wdrożeniu | nota stanu: panel odłączony, decyzja bez zmian |

Wniosek dla właściciela: **żaden plik ADR nie idzie do archiwum w tej sesji**.
Jedyna pozycja „do rozstrzygnięcia" to ADR 0012 — czy kreator talii ma wrócić
do artefaktu (dziś: nie montowany). To decyzja właściciela, nie sprzątanie.

## 4. Lekcje — pomiar i wyniesiona proza

- 162 wpisy, 122 odsyłacze `→ narracja:` do archiwum, 136 sekcji w
  `docs/LESSONS_PRZYPADKI.md` (161 806 B; poza lekturą startową).
- Nagłówek rejestru nie zna już pól **Objaw**/**Przyczyna** — w rejestrze
  nie występują (pilnuje tego nowy test, §6).
- Numery `L<nr>` są kontraktem: **1 599 cytowań w 383 plikach** kodu/narzędzi —
  żaden numer nie może zniknąć, kotwice muszą prowadzić do wpisu głównego.
- 13 kotwic ma własne fakty i próg 300 znaków (`test/docs-decisions.test.js`);
  skrócenie do samego odsyłacza było by utratą indeksu klas błędów.
- **Martwe odsyłacze: 3** (naprawione): L25 `decks/green.txt` → nota o ADR
  0023/0024; L122 `decks/wielocelowa.txt` → nota „talia-sonda usunięta po
  audycie"; L123 strażnik `test/m291-*.test.js` → `test/m195-multi-target.test.js`
  (+ picker `test/uwagi-tura8-picker-wielocelowy.test.js`).
- **Proza wyniesiona: 30 wpisów, 7 427 B** (`ls` → rejestr 137 858 → 130 431 B;
  archiwum +9 920 B). Zostaje: przypadek w jednym zdaniu + reguła + strażnik +
  odsyłacz. Zabezpieczenia skryptu: wpis po skróceniu MUSI nieść regułę,
  kotwica MUSI zachować link do wpisu głównego i ≥300 znaków konkretu.

Skrypt wykonawczy: `/home/user/scratch/w/lessons-kondensacja.py` (poza repo —
jednorazowe narzędzie sesji; procedurę opisuje AGENTS.md §0 i nagłówek rejestru).

## 5. Co uznano za merytorycznie AKTUALNE (nie ruszano)

Lekcje o kluczach reguł (L1–L5, L13, L21, L27, L48, L107 i ich kotwice),
kontrakty zdarzeń/widoku (L6, L24, L79, L99–L101, L153), środowisko i git
(L7–L9, L136) oraz pułapki narzędzi (L60, L63, L68, L74–L76, L133) — każda
z nich nadal chroni przed powtarzalnym błędem, często ma pin w kodzie.

## 6. Strażnicy kontraktu dokumentacji

- `test/docs-decisions.test.js` — rejestr ADR ↔ pliki, format lekcji, kotwice
  z linkiem do wpisu głównego, odsyłacz narracji z adresatem, **nowy test**:
  rejestr nie zawiera bloków `**Objaw:**`/`**Przyczyna:**` (proza → archiwum),
  kotwice z listy zachowują ≥300 znaków własnego konkretu.
- `test/dokumentacja-budzet-lektury.test.js` — próg 100 000 tokenów (nie
  podnosić; przekroczenie = obowiązkowe zadanie sesji).
- `test/proweniencja-katalogu.test.js` — katalog rośnie tylko z kolekcji.

## 7. Otwarte pozycje dla właściciela

1. **ADR 0012** — kreator talii: przywrócić montaż w artefakcie czy zostawić
   odłączony (dziś nota stanu w ADR; decyzja formalnie bez zmian)?
2. **Twarde cięcie lekcji** — gdyby miało być głębsze niż proza: reguła rejestru
   i strażniki (≥50 odsyłaczy, ≥300 znaków kotwicy) wymagają wtedy decyzji
   właściciela o zmianie kontraktu. Rekomendacja sesji: **nie teraz** — rejestr
   niesie reguły, a różnica zdań dotyczyła prozy, która już jest w archiwum.
3. **ADR 0006** — jeśli zasada „najpierw audyt, potem decyzje" zostanie uznana
   za wyczerpaną, 0006 można przenieść do archiwum z następcą 0009; na dziś
   0009 sam ją utrzymuje w mocy, więc sesja tego nie robi.

## Powiązania

- [Lessons](../../LESSONS.md) · [narracja](../../LESSONS_PRZYPADKI.md) ·
  [rejestr ADR](../decisions/README.md) · [budżet lektury](../setup/ENVIRONMENT.md)
- Milestone sesji: M401 (`docs/ENGINE_MILESTONES.md`)
