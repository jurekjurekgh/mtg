# PLAN 2026-08-28 — audyt PR #86 i porządki w `tmp-audyt-*` (sesja arena/01a049c7)

**Sesja:** `arena/01a049c7-mtg`. **Baza:** `main` @ `6d04551` (squash PR #86).
**Prompt:** „kontynuujemy projekt" + zlecenie właściciela: *po lekturze obowiązkowej
skasować niepotrzebne pliki w katalogach `tmp` narobione przez poprzedniego agenta.*
**Zasady:** ADR 0020 (PR na starcie → audyt poprzedniego PR → inkrementalne commity,
bez force push), ADR 0021 (pętla domyślna zamiast pytania o kolejkę), ADR 0016
(audyt + chirurgiczne patchowanie), ADR 0018 (pełny B0 tylko na komendę).

## Pomiar startowy

- `npm test` (szybki rdzeń): **3621/3621 pass**, 0 fail, ~129 s (handoff PR #86: 3620 →
  +1 test z ostatniego commitu sesji).
- `npm run build`: OK, 55 modułów / **2835.1 kB** (handoff: 2832.5 kB).
- Lektura obowiązkowa (AGENTS.md §0) wykonana w całości, z pomiarem: `AGENTS.md`
  358 linii, ADR-y 0001–0024 + rejestr (1993 linii), `docs/LESSONS.md` **2092 linii
  (L1–L82)**, `docs/setup/ENVIRONMENT.md` 175 linii, PR #86, `HANDOFF_2026-08-28b.md`.

## Etap 1 — lektura obowiązkowa (zanim cokolwiek innego)

- [x] Ten plik startowy, wszystkie ADR-y, `LESSONS.md`, `ENVIRONMENT.md`, ostatni PR,
      najnowszy handoff — czytane w całości (po zakresach linii, bez ucinania).

## Etap 2 — PR na starcie (ADR 0020 A)

- [x] Gałąź `arena/01a049c7-mtg` wypchnięta, PR otwarty **przed** pierwszą zmianą kodu
      (ten PLAN jako pierwszy commit).

## Etap 3 — audyt PR #86 (ADR 0020 B / ADR 0016)

Zakres kodu PR #86 (`2a1e79d…6d04551`, 58 plików, z czego 44 to transkrypty):
`fingerprint.js` (+5), `game-state.js` (+38/−11), `effects.js` (+4),
`session.js` (+45/−4), `render.js` (+13/−2), `choice-request.js` (+7/−1),
`main.js` (+6), `tools/table-tester/run-game.mjs` (+41/−3), 5 plików testów.

### Kroki
- [x] Przegląd diffu każdego zmienionego pliku kodu (8) i testów (5).
- [x] Weryfikacja mutacyjna (L61) każdej deklarowanej naprawy — fix cofnięty jedną
      edycją, test MUSI być czerwony:
      - N1 fingerprint (L16): `pendingManifestDread` out of `PENDING_DECISION_FIELDS` → RED;
      - N2 bramka `pass_priority`: `firstDecisionOwner == null` usunięte → RED
        (anty-over-fix: pass wraca po rozstrzygnięciu);
      - L81 filtr pokoju: powrót do `length > 0` → RED (test `room-targets-staleness`);
      - M251/B `sourceCardId` (Manifest Dread) usunięte z `effects.js` → RED (3 testy);
      - M251 copy „lethal-first" przywrócone → RED **tylko** pina copy (L82);
      - M252 nagłówek tury (session.js) cofnięty → RED z dokładnym komunikatem.
- [x] Skan kompletności klasy L16 poza PR: zestawienie 62 pól konsultowanych przez
      `firstPendingDecisionPlayerId` z pokryciem w `fingerprint.js` → brak luk.
- [x] Kontrola bezpieczeństwa zmian stołu: `labels[0]` w testerze filtruje „Poddaj";
      `streamAutoEvents` zwraca `significant` (strażnik nie jest martwy, L67);
      `blockedByOthersDecision` używane w ~60 miejscach (nie jest martwe po przeniesieniu).
- [x] Wynik → `docs/audits/AUDYT_PR86_2026-08-28.md` + opis PR.

### Znalezisko A1 (do naprawy w Etapie 4)
Strażnik `test/fingerprint-pending-decisions.test.js` liczy pokrycie jako **każde**
wystąpienie `pending*` w pliku `fingerprint.js` — łącznie z KOMENTARZEM. Dowód
(syntetyczna mutacja): dopisanie `state.pendingZzz` do `firstPendingDecisionPlayerId`
i wspomnienie `pendingZzz` wyłącznie w komentarzu `fingerprint.js` → strażnik zielony.
Klasa L31/L56 (strażnik pilnuje tekstu, nie kodu) przeniesiona na skan źródła.

## Etap 4 — naprawa A1 u root cause (chirurgicznie, ADR 0016 B)

- [x] Pokrycie liczone z kodu: komentarze usuwane przed skanem, lista
      `PENDING_DECISION_FIELDS` czytana z literału tablicy, projekcje ręczne z `state.pending*`.
- [x] Pin na strażniku (L13/L67): test, w którym pokrycie „tylko komentarzem"
      czerwieni strażnik (musi istnieć przypadek, na którym guard krzyczy).
- [x] `npm test` (3622/3622) + `npm run build` zielone → commit `2a0dc06`.
      Mutacje po naprawie: usunięcie pola z tablicy → RED, pokrycie komentarzem → RED,
      `stripComments` wyłączony → RED, produkcja czytająca surowy plik → RED.

## Etap 5 — porządki w `tmp-audyt-*` (zlecenie właściciela)

Inwentaryzacja przed kasowaniem (63 pliki / 3.0 MB, 4 katalogi M239–M251):

| Kryterium | Pliki | Decyzja |
|---|---|---|
| Duplikat bajt-w-bajt (md5) | `tmp-audyt-m250/t2b.txt` (= `t2-inn-wu-tarkir-bg.txt`), `tmp-audyt-m246/r1-equip-e11-dense.txt` (= `r1-equip-e11.txt`) | **USUŃ** — zero informacji |
| Przebieg przerwany `[STOP]` nadpisany pełnym re-runnem tego samego seeda i profilu | `tmp-audyt-m250/t1-theros-wiedzmin.txt` (217 linii, STOP; pełny: `t1b-…`, 820 linii), `tmp-audyt-m246/r2-ravnica-67.txt` (124, STOP; pełny: `r2b-…`, 575) | **USUŃ** — kompletny bliźniak zostaje |
| Pary przed/po naprawie (seed ten sam, różnią się tylko naprawionym copy) | `w8/w8b-domwu-ff`, `w13/w13b-mroczny-ravnica`, `r4-alara-33/-after` | **ZOSTAJĄ** — dowód objawu i skutku fixu |
| Kompletne przebiegi (wynik `Koniec partii`) | pozostałe 51 | **ZOSTAJĄ** |

- [x] Usunięcie 4 plików osobnym commitem (`ea7ca32`); sprawdzenie, że żaden nie jest cytowany
      w `docs/` ani `test/` (grep: brak cytowań per plik).
- [x] **Doprecyzowanie właściciela w trakcie sesji: „całkowicie do usunięcia,
      także inne rozsiane po repozytorium"** → inwentaryzacja całego repo
      (222 pliki .txt poza `decks/`) i usunięcie **205 plików / ~9 MB**
      (commit `9f93387`): `tmp-audyt-*/` (59), `tools/table-tester/audyt-*.txt`
      (23), `tools/table-tester/audyt-*/` (117), logi (4), zrzuty `.zip` (2).
- [x] Sprawdzenie zależności: żaden test/moduł nie czyta tych plików (tylko
      komentarze-proweniencja); 52 wzmianki w `docs/` → ścieżki historyczne.
- [x] Zabezpieczenie: `.gitignore` (`tmp-audyt-*/` + `*.log`/`*.zip`) oraz
      strażnik `test/repo-artefakty-audytu.test.js` (3 nogi, mutacyjnie RED).
- [x] Notatki w `docs/PROJECT_HISTORY.md` (nagłówek + sekcja sesji),
      `docs/setup/TESTER_STOLU.md` (obowiązująca reguła), handoff i opis PR.

## Etap 6 — pętla jakości (ADR 0021) — WYKONANE, bez znalezisk

- [x] Żywy Tester: 5 partii (`npm i` w `tools/table-tester` + `npm run build` przed
      pomiarem — L76) na największej puli kart niewidzianych w poprzednich
      transkryptach (handoff PR #86: `forgotten-realms`, 6 kart):
      | partia | profil | wynik |
      |---|---|---|
      | forgotten-realms vs theros (seed 3) | explorer | Koniec partii, detektory 0 |
      | forgotten-realms vs srodziemie (17) | explorer | Koniec partii, detektory 0 |
      | forgotten-realms vs wiedzmin (29) | greedy | Koniec partii, detektory 0 |
      | ravnica vs forgotten-realms (7) | explorer | Koniec partii, detektory 0 |
      | forgotten-realms vs alara (55) | random | Koniec partii, detektory 0 |
- [x] Pokrycie: **wszystkie 6 kart FR** (Basilisk Gate, Heap Gate, Cloak of the Bat,
      Curate, Gray Slaad, Silvanus's Invoker) pojawiło się w transkryptach
      (każda w ≥2 partiach) + **Epic Experiment** (ravnica, historyczny blocker M96).
- [x] Ręczny przegląd osi 2 (L27/L40): brak surowych slugów w logu, brak
      zduplikowanych linii, brak odrzuconych komend; `Curate` (surveil 2 + dobierz)
      opisane w logu zgodnie z Oracle (L24 OK).
- [x] Obserwacja BEZ naprawy (klasa znana, L15 + L57): `Basilisk Gate` (Oracle
      „target creature" — dowolny stwór) oferuje graczowi pump na stwora
      PRZECIWNIKA. Legalne wg Oracle → nie zawężamy ofert; wycena bota dla
      `pump_by_gates` działa od M146 (L50/L51).
- [x] Transkrypty partii **nie trafiają do repo** (poza `/home/user/tt-*.txt`) —
      po zleconych porządkach nie dokładamy nowego `tmp-audyt-*` bez potrzeby.

## Etap 7 — zamknięcie sesji (ADR 0013)

- [ ] Nowa lekcja `L83` (strażnik skanujący źródło nie może liczyć komentarzy) — jeśli
      potwierdzi się jako klasa powtarzalna.
- [ ] `docs/PROJECT_HISTORY.md` (sekcja sesji na górze) + `docs/setup/HANDOFF_2026-08-28c.md`.
- [ ] Opis PR zaktualizowany kumulacyjnie; `npm test` + `npm run build` zielone.

## Ryzyka i pułapki

- Kasowanie plików jest nieodwracalne w gałęzi (odwracalne historią gita) — dlatego
  usuwam wyłącznie pozycje z tabeli w Etapie 5 i zostawiam pełną inwentaryzację w repo.
- 140 transkryptów `tools/table-tester/audyt-*` (6.4 MB) jest śledzonych mimo reguł
  `.gitignore` (M203/M205) — **nie ruszam**, bo są cytowane w `docs/` na poziomie
  katalogów; temat do decyzji właściciela (zgłoszone w opisie PR).
- Mutacje weryfikacyjne cofam kopią z gita / `cp` wykonanym **przed** edycją (L8/L34).
