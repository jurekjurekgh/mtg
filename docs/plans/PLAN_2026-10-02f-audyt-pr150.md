# Plan sesji 2026-10-02f — audyt scalonego PR #150 (batch 62 + PMSSB-36…39) + pętla jakości

**Tryb:** ADR 0020 (A: PR na starcie, B: audyt poprzedniego PR, C: commity
inkrementalne, D: bez force push) + ADR 0021 (prompt „kontynuuj projekt" nie
nazywa tematu ⇒ pętla domyślna, bez pytania o kolejkę) + ADR 0016/0030.

## Rozpoznanie

| Pomiar | Wartość |
|---|---|
| `main` (baza sesji) | `dcbc99f` = squash PR #150 („Sesja 2026-10-01g/02: audyt PR #149 + batch 62 (kolekcja 176–210)") |
| Poprzedni scalony PR | **#150** — 74 pliki: 19 × `src/` (`card-data.js` +226, `heuristic-bot.js` +443/−26, `spells.js` +237/−15, `heuristic-params.js` +25, `multi-target.js` +70/−1, `choice-request.js` +41/−5, `render.js` +24/−7, `main.js` +28/−1, `triggers.js` +19/−1, `zones.js` +20, `game-state.js` +17/−1, `objects.js` +6, `permanents.js` +10, `attachments.js` +4, `identity.js` +6, `effects.js` +8/−1, `resources.js` +1, `registry.js` +16, `mana-costs-data.js` +17), ~20 × testy, fixture golden-mastera, 27 talii, dokumentacja (5 planów, AUDYT_PR149, handoffy, PMSSB, LESSONS L173) |
| Baseline `npm test` / `build` | do zmierzenia na starcie (handoff 2026-10-02: `test:all` 7659/7659 po poprawce; sam `npm test` 7384/7384) |
| Niedokończone plany na `main` | brak (wszystkie `PLAN_*` zamknięte; kolejka handoffu 2026-10-02 = pozycje otwarte bez planu) |
| Kolejka z handoffu 2026-10-02 | (a) pula celów Fiery Justice = 8 (`DIVIDED_POOL_CAP`) — kreator podziału „ręczny"; (b) przegląd czytników `zone === 'exile'`; (c) pin O1 `castsWithoutPayingMana` w `reservedManaOf`; (d) projekcje remisów `cast_spell`/`activate_ability` |

## Etapy

- [x] **Etap 0 — lektura startowa**: `AGENTS.md`, ADR 0001–0030,
  `LESSONS.md` (L1–L173, w kawałkach do końca pliku), `ENVIRONMENT.md`,
  handoff 2026-10-02, `gh pr view 150`.
- [x] **Etap 1 — PR na starcie** (ADR 0020 A): ten plan jako pierwszy commit
  na `arena/01a0fe59-mtg` + push + otwarcie PR.
- [x] **Etap 2 — baseline**: `npm test`, `npm run build` na `main`; porównanie
  z handoffem. **Wynik: `npm test` 7425/7425 (exit 0, 192,6 s), `npm run build` 70 modułów / 4771,6 kB.**
- [x] **Etap 3 — audyt PR #150**: `gh pr diff 150` czytany plik po pliku
  (priorytet: `src/engine/spells.js` — podział obrażeń przy rzucie CR 601.2d /
  608.2b, kicker niemanowy CR 702.33; `src/engine/triggers.js` — nowe zdarzenie
  `you_cast_instant_or_sorcery_spell`; `src/engine/zones.js` — `another` +
  ETB-mana; `src/engine/attachments.js`/`permanents.js`/`identity.js` —
  `pumpPerAttachedEquipment` (L21 pełny łańcuch); `card-data.js` — zgodność
  10 kart z Oracle i snapshotami Scryfall; `heuristic-bot.js` — wyceny PMSSB-36…39).
  Metoda: każde twierdzenie komentarza sprawdzane w kodzie + sondy na żywym
  silniku (nie sam odczyt raportu testów); piny weryfikowane mutacjami
  (L13/L159); zgodność z CR ze źródeł online (ADR 0030); ADR 0002 (zero
  przypadków po nazwie/ID karty). Raport: `docs/audits/AUDYT_PR150_2026-10-02.md`.
- [x] **Etap 4 — naprawy znalezisk audytu** (każde: repro → fix u root cause →
  pin → osobny zielony commit + push). **F1** (podział obrażeń w oknach rzutu
  spoza ręki) + **F3** (`{X}` zdolności nie jest maną wydaną na czar) — commit
  `06fc9a9`, pin `test/audyt-pr150-podzial-w-oknach-rzutu.test.js` (3 mutacje
  czerwone). Raport: `docs/audits/AUDYT_PR150_2026-10-02.md`.
- [x] **Etap 5 — pętla jakości (w zakresie budżetu)**: **re-weryfikacja mutacji
  F–H po commicie naprawy** — F czerwone (3), **G czerwone (1, nie 5)**, **H
  czerwone (2, nie 5)**; pierwszy przebieg G/H był unieważniony przez
  `git checkout -- src/` na brudnym drzewie (tabela i wniosek 4 w raporcie
  skorygowane). **O1 (`DIVIDED_POOL_CAP`)**: przegląd ścieżki ofert i kreatora
  panelu — pula nadal capowana w silniku, a oferta = komenda, więc „ręczny"
  kreator z dowolnego celu wymaga zmiany powierzchni ofert (koszt
  kombinatoryczny u botów) → **osobny plan**, pozycja w handoffie razem
  z czytnikami `zone === 'exile'`, pinem `castsWithoutPayingMana` i projekcjami
  remisów.
- [x] **Etap 6 — zamknięcie**: handoff `docs/setup/HANDOFF_2026-10-02f.md`,
  wpis w `docs/PROJECT_HISTORY.md`, liczby bramki zmierzone na końcu (L92):
  `npm test` **7430/7430**, `test:all` **7701/7701**, build **4775,1 kB**;
  opis PR #151 zaktualizowany kumulatywnie, blok przekazania w czacie.

## Ryzyka i pułapki

- Zmiana wycen bota ⇒ golden-master (`node tools/bot-scoring-snapshot.mjs --write`)
  tylko po świadomej decyzji i z raportem różnic; `npm test` sam nie wystarcza —
  golden-master jest w warstwie `slow` (CI = `npm run test:all`).
- Żywy Tester czyta ARTEFAKT (`dist/`): rebuild po każdej zmianie `src/` (L76);
  talie tymczasowe nie zostają w `decks/` podczas `npm test`.
- Cytaty CR tylko z dosłownego tekstu u źródła (CR 2026-09-25); nowy numer →
  ręcznie w `test/helpers/cr-numery-tabela.js` z uzasadnieniem (L164/L165).
- Pełny B0 NIE uruchamiany (ADR 0018).
- Scratch poza repo znika między turami (L173/L136) — nic „na później".
