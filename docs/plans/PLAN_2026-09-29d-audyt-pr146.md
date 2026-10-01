# Plan sesji 2026-09-29d — audyt scalonego PR #146 + pętla jakości

**Tryb:** ADR 0020 (A: PR na starcie, B: audyt poprzedniego PR, C: commity
inkrementalne, D: bez force push) + ADR 0021 (prompt nie nazywa tematu ⇒ pętla
domyślna, bez pytania o kolejkę) + ADR 0016 (chirurgiczne patchowanie).

**Prompt startowy:** „Kontynuujemy projekt." — bez nazwanego tematu.

## Rozpoznanie (zmierzone, nie przepisane)

| Pomiar | Wartość | Gdzie |
|---|---|---|
| `main` (baza sesji) | `6789702` = squash PR #146 | `git log --oneline -3` |
| `npm test` (fast) na bazie | **7101 pass / 0 fail**, ~113 s | pomiar sesji |
| `npm run build` na bazie | **70 modułów / 4621,1 kB** (deterministyczne, 2×) | pomiar sesji |
| Poprzedni scalony PR | #146 „Audyt PR #145 + pętla jakości", 30 plików, +1680/−48 | `gh pr view 146` |
| Klon | płytki (`git rev-list --count HEAD` = 1 na starcie); dyfuzje historyczne przez `gh pr diff` / `git fetch --depth` | ENVIRONMENT §1 |

Rozbieżność z zapisem poprzedniej sesji (handoff `HANDOFF_2026-09-29b.md` mówi
**7089/7089** i **4617,0 kB**) jest przedmiotem audytu, nie założeniem — patrz
Etap 2/F4.

## Etapy

### Etap 0 — lektura obowiązkowa (AGENTS.md §0) — [x]

`AGENTS.md` (373 linie), **wszystkie 30 ADR-ów** + README rejestru,
`docs/LESSONS.md` (2576 linii, 162 wpisy `## L…`, do ostatniej linii),
`docs/setup/ENVIRONMENT.md` (189 linii), ostatni PR (#146) i najnowszy handoff
(`HANDOFF_2026-09-29b.md`). Bez fragmentów: zakresy `sed -n` do końca pliku
(L78).

### Etap 1 — PR na starcie (ADR 0020 A) — [ ]

Ten plan jako osobny commit → `git push origin arena/01a0eec8-mtg` →
`gh pr create` do `main`. **Kryterium:** PR istnieje na GitHubie PRZED
jakąkolwiek zmianą kodu.

### Etap 2 — audyt PR #146 (ADR 0020 B / 0016) — [ ]

Przegląd KAŻDEGO zmienionego pliku (8 plików `src/`, 12 plików `test/`,
2 narzędzia, 8 dokumentów) wobec CR MtG, ADR 0002 (zero przypadków po nazwie
karty) i RED→GREEN testów. Bez pełnego B0 (ADR 0018).

Kandydaci na znaleziska (do potwierdzenia repro + mutacją, L11/L13):

- **F1 — klasa F6 nie domknięta.** `spendMana` (`src/engine/resources.js`)
  dostał wspólny predykat `unitCoversAnyRequirement` w JEDNEJ z pętli (linia
  402). Ręczny odpowiednik `X.some((c) => reqColors.has(c))` został w 6 liniach
  tego samego pliku: komparatory sortu 372/373 i 481/482 oraz **filtry** 562
  i 568 (blok „obrona w głąch" z seeda 2027). Filtry mają dokładnie ten sam
  kształt co naprawiony błąd: źródło bezbarwne (`colors: []`) nie przechodzi,
  więc pip `{C}` nie da się odtworzyć z bezbarwnego źródła. L48/L28/L41.
- **F2 — strażnik 508 nie pilnuje 509.** `test/cr-numery-508-restrykcje-
  wymogi-straznik.test.js` deklaruje w komentarzu parę 508.1c/509.1b
  (restrykcje) i 508.1d/509.1c (wymogi), ale skanuje wyłącznie `508.1c`/
  `508.1d`; w `src/` jest 19 cytatów `509.1b`/`509.1c`. Zamiana literą obok
  w sekcji 509 przeszłaby zielono (L5/L39).
- **F3 — zmiana bez opisu.** `src/table/ai-modes.js` (+13/−7, „AI-R8": talia
  Czarodziejki w promptach) i `test/ai-modes.test.js` (+26) weszły w PR #146,
  ale nie ma ich ani w opisie PR, ani w `docs/PROJECT_HISTORY.md`, ani
  w handoffie (grep `AI-R8`/`heroDeck` po `docs/` = 0 trafień). ADR 0013 §4 /
  AGENTS.md „opis PR kumulatywny".
- **F4 — liczby stanu nieprzeliczone na koniec sesji (L92).** Handoff i
  `PROJECT_HISTORY.md` podają fast **7089/7089** i **4617,0 kB**; pomiar
  scalonego drzewa daje **7101/7101** i **4621,1 kB**. Do przypisania:
  pomiar worktree'a bazy (`6a47c35`) rozstrzyga, czy 7089 to baseline
  podpisany jako wynik końcowy.
- **F5 — `resolve_food_choice` (PMSSB-22).** Nowe pole `creatureId` w komendzie
  z `playerView`: sprawdzić walidację/`execute`, etykietę, wycenę obu botów
  i to, czy `pumpChangesOutcome`/`unblockedAttackers` naprawdę mają dane
  (ADR 0017, L1) — oraz czy `foodKeepValue`/`foodDecisiveBonus` nie są atrapą
  (L169 pkt 6).

**Kryterium ukończenia:** raport `docs/audits/AUDYT_PR146_2026-09-29.md`
z metodą, dowodami (repro PRZED, mutacja, pomiar PO) i jawną listą rzeczy
sprawdzonych i POPRAWNYCH (L11); każde znalezisko naprawione u root cause
osobnym zielonym commitem.

### Etap 3 — pętla jakości (ADR 0021 pkt 4) — [ ]

Po domknięciu audytu: (a) dalsze polowanie na rozjazdy oferta/walidacja
i kopie tej samej reguły (klasa L48/L107) innymi ścieżkami niż #146;
(b) audyt Żywym Testerem z perspektywy gracza, jeśli zmiany dotkną UI.
**Bez nowego batcha kart** (ADR 0029 — katalog tylko z listy właściciela).

### Etap 4 — domknięcie — [ ]

`npm test` + `npm run test:all` + `npm run build` + szybki profil benchmarku
(ADR 0018: nigdy `--full` bez komendy) + `node tools/bot-tie-audit.mjs`;
handoff `docs/setup/HANDOFF_2026-09-29d.md`; wpis `docs/PROJECT_HISTORY.md`;
opis PR kumulatywny; budżet lektury (`test/dokumentacja-budzet-lektury.test.js`
— na starcie ~99,9k/100k, więc każdy nowy wpis do `LESSONS.md` płaci się
skróceniem innego).

## Kolejność commitów

1. plan (ten plik),
2. raport audytu,
3. F1…Fn — każdy osobno: repro/test RED → naprawa → mutacja → `npm test` +
   `npm run build` → push,
4. dokumentacja sesji (PROJECT_HISTORY + handoff + opis PR).

## Ryzyka i pułapki

- **Budżet lektury na styk** (99 885/100 000) — nowy wpis do `LESSONS.md`
  wymaga skrócenia innego; progu NIE podnosimy (L5/L66).
- **Golden-master siedzi w warstwie SLOW** — zmiana wyceny bota nie czerwieni
  `npm test`, dopiero `npm run test:all` (pułapka zapisana w handoffie #146).
- **Klon płytki** — `git show <sha>` z historii nie działa; `git fetch
  --depth`/`gh pr diff`. Worktree bazy: `/home/user/wt-base` (poza repo,
  do pomiarów; usunąć przed bramą).
- **Sandbox potrafi cofnąć wskaźnik gałęzi** (ENVIRONMENT §2) — push po każdym
  zielonym commicie, `git log --oneline -1` po każdym.
- **`git checkout <plik>` zjada pracę tury** (L136) — mutacje przez kopię
  w `/tmp`, nie przez gita.
- Zmiany regułowe wymagają dosłownego CR ze źródła online (ADR 0030) —
  pamięć treningowa nie jest źródłem.
