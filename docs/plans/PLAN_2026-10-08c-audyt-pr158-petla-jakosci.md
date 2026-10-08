# PLAN 2026-10-08c — audyt scalonego PR #158 + pętla jakości (ADR 0020/0021)

Sesja `arena/563e279e-mtg`. Prompt startowy: „Kontynuujemy projekt\" — temat
nie nazwany, więc obowiązuje **ADR 0021** (pętla domyślna), a jej pierwszy krok
to **ADR 0020 A/B**: PR na starcie i pełny audyt poprzedniego scalonego PR
zanim jakiekolwiek nowe kodowanie. Plan wypchnięty jako osobny commit PRZED
kodem (ADR 0020 A/C).

## 1. Stan faktyczny na starcie (zmierzony, nie przepisany)

| Fakt | Wartość | Jak zmierzone |
|---|---|---|
| `main` | `c27655f` „Sesja 2026-10-07b: audyt PR #157 + pętla jakości (#158)\" | `git log --oneline -1` |
| Poprzedni scalony PR | **#158**, MERGED 2026-10-08T21:13:51Z, 121 plików, +7890/−488 | `gh pr view 158`, `gh api …/pulls/158/files` |
| Drzewo robocze | czyste (`git status --porcelain` puste) | `git status` |
| Klon | shallow (`.git/shallow` = `c27655f`) — diff PR pobierany z API GitHuba, nie z lokalnej historii | `cat .git/shallow` |

Zawartość PR #158 (do zaudytowania):

1. **audyt PR #157** (raport `docs/audits/AUDYT_PR157_2026-10-07.md`) + korekty
   cytatów CR i cenzus cytatów (`tools/cr-numery.mjs`);
2. **zgłoszenie E** — regeneracja jednorazowo (CR 701.19a);
3. **zgłoszenia F–K** — sześć napraw wyceny bota: obrażenia triggera z celem
   (F), obowiązkowy ETB-ping we własne ciało (G), `endure X` (H), Wrap in
   Flames / okno ataku (I), grant flying do EOT (J), kreatury z flash jako
   combat trick (K);
4. **batch 64** — 10 kart kolekcji właściciela (artId 261–328), M439 + migracja
   talii Dominaria (`dominaria-ub`/`-wrg` → `-wu`/`-brg`, L180);
5. **PMSSB-59** — pętla jakości mechanik batcha 64 (fale A/B + werdykty
   kontrolne), M441.

## 2. Zakres i metoda audytu (ADR 0020 B, ADR 0016, ADR 0030)

Bez pełnego B0 (ADR 0018); dopuszczalne potwierdzenie to `npm test`,
`node tools/run-tests.mjs all`, `node --test test/bot-benchmark.test.js`.

- **A. Silnik** (`src/engine/*`, `src/cards/*`) — każdy zmieniony plik: czy
  zmiana jest generyczna (ADR 0002: zero przypadków po nazwie/ID karty),
  zgodna z CR (cytat dosłowny ze źródła — ADR 0030), deterministyczna (ADR
  0005), kompletna w łańcuchu pól (L21: definicja → `gameObjectDataOf` →
  `createGameObject` → `addObject`/`ADD_OBJECT_FIELDS` → `installDeck` →
  widok → fingerprint) i czy nic nie zregresowało.
- **B. Karty batcha 64** — Oracle text vs definicja (snapshoty
  `docs/cards/scryfall-*.json`), `limitations` puste (ADR 0022), `artId`/`plan`
  wg słownika kolekcji (ADR 0029), talie spójne z generatorem (ADR 0023/0024).
- **C. Wycena bota (F–K + PMSSB-59)** — czy każda naprawa jest po deskryptorze
  i stanie `PlayerView` (ADR 0002/0017), czy nie odcina ruchu wartościowego
  (L121), czy piny mają dowód mutacyjny (L13) i czy żaden pin nie cementuje
  zgłoszonego zachowania (L181).
- **D. Testy** — RED→GREEN, piny dwukierunkowe, brak pinów utrwalających błąd;
  sprawdzenie, czy strażniki mierzą regułę, nie tekst źródła (L5).
- **E. Dokumentacja** — spójność liczb stanu (L92), kompletność roadmap
  (odhaczone etapy), lektura startowa w budżecie 100k (L66).

Znaleziska dostają identyfikatory `F-n` i są naprawiane u root cause w tej
samej sesji (ADR 0021 pkt 2), każde osobnym commitem (ADR 0020 C).

## 3. Etapy i kryteria ukończenia

- [ ] **S0.** Lektura obowiązkowa (`AGENTS.md`, 30 ADR-ów, `docs/LESSONS.md`
      2339 linii, `docs/setup/ENVIRONMENT.md`) — WYKONANE przed tym planem.
- [ ] **S1.** PR sesji otwarty na GitHubie PRZED kodem (ADR 0020 A).
- [ ] **S2.** Baseline na `c27655f`: `npm test`, `npm run build`,
      `node tools/run-tests.mjs all` — liczby zapisane poniżej (L174: brama na
      zamrożonym drzewie, logi w `.arena/`).
- [ ] **S3.** Audyt A–E; raport `docs/audits/AUDYT_PR158_2026-10-08.md`
      z werdyktem i listą znalezisk (każde z dowodem: plik, linia, cytat CR).
- [ ] **S4.** Naprawy znalezisk u root cause — każda z pinem RED→GREEN i
      dowodem mutacyjnym (L13), osobny commit + push.
- [ ] **S5.** Pętla jakości (ADR 0021 pkt 4): (a) audyt Żywym Testerem z
      perspektywy gracza na artefakcie `dist/` + naprawy u root cause + nowy
      detektor dla każdej klasy znalezionej ręcznie (L27); (b) łowy na
      niezgodności z CR inną ścieżką niż poprzednia sesja (cenzus cytatów był
      w #158 — szukać poza cytatami: semantyka reguł, nie numeracja).
- [ ] **S6.** Bramka końcowa na zamrożonym drzewie: `npm test`,
      `node tools/run-tests.mjs all`, `npm run build`, strażnik cytatów CR,
      budżet lektury startowej — wszystkie EXIT 0.
- [ ] **S7.** Domknięcie: raport audytu, wpis `docs/PROJECT_HISTORY.md`,
      handoff `docs/setup/HANDOFF_2026-10-08c.md`, opis PR, lekcje (nowy wpis
      płaci się skróceniem innego — L66).

## 4. Ryzyka i pułapki

- **Shallow clone** — `git diff <baza>` lokalnie nie zadziała; diff PR czytam
  przez `gh api …/pulls/158/files` (paginacja), a stan plików z drzewa.
- **Budżet lektury** ma ~15 tokenów zapasu (handoff 2026-10-08) — każdy nowy
  wpis do `docs/LESSONS.md` wymaga skrócenia innego w tym samym commicie.
- **Zakaz force push** (ADR 0020 D); push tylko na `arena/563e279e-mtg`.
- **Katalog nie rośnie z inwencji sesji** (ADR 0029) — brak nowych kart bez
  listy właściciela.
- **Pełny B0 wyłącznie na komendę właściciela** (ADR 0018).

## 5. Zapis wykonania (uzupełniane commitami)

- S0 — lektura: `AGENTS.md` (do końca), 30 ADR-ów + README rejestru,
  `docs/LESSONS.md` 1–2339, `docs/setup/ENVIRONMENT.md` 1–219, handoff
  2026-10-08 i 2026-10-07b.
