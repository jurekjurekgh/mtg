# PLAN 2026-10-18 — sesja domyślna (ADR 0021): audyt PR #167 i pętla jakości

**Zlecenie:** „Kontynuujemy projekt." — bez nazwanego tematu, więc wykonuje się pętlę
domyślną (ADR 0021). Nie zadajemy pytania o kolejkę (ADR 0021, pkt „Pytanie do właściciela").

**Gałąź:** `arena/3ce2ec34-mtg` (baza: `main` @ `34e8676`, PR #167 scalony).
**Źródła lektury:** AGENTS.md (§0 + tryb sesji), ADR 0001–0030, LESSONS.md (cały), ENVIRONMENT.md,
HANDOFF_2026-10-17.md.

## Stan wyjściowy (zweryfikowany poleceniem, nie z handoffu)

- `npm test`: **8492/8492**, rc=0 (`.arena/baseline-fast.log`, 142 s).
- `npm run build`: rc=0, 74 moduły, **5232.0 kB** (`.arena/build.log`).
- Niedokończony plan na `main`: **brak**. Najnowszy `PLAN_2026-10-18a-pmssb67-prog-latania.md`
  (decyzja właściciela „skalować próg do mocy") jest w całości wykonany i udokumentowany w PR #167
  (raport F5 w `docs/audits/PMSSB67_KW_CAVEATY_2026-10-17.md`, pin, dump diff, historia). Potwierdzone
  grepem: `creatureKwFlyingFloorScaled` w `heuristic-params.js`, gałąź `flying` w `heuristic-bot.js`.
- Otwarte punkty z handoffu 10-17: „próg latania dla mocy 0” zamknięty przez F5 (moc 0 → 0, zaakceptowane
  w planie 18a); Ad 3 (M243/C) i L48 zamknięte przez właściciela 2026-10-18; benchmark B0 — tylko na komendę
  (ADR 0018); „okno stosu modali w session.js” (test F3) — osobny batch/PR, nie podjęte.

## Etapy

0. [x] Bazowe bramy: `npm test` 8492/8492 rc=0, `npm run build` rc=0. Lokalny `.arena/` dopisany do
   `.git/info/exclude` (nie do `.gitignore`).
1. [x] Ten plan + PR sesji (ADR 0020 A): commit planu, `git push -u origin arena/3ce2ec34-mtg`, `gh pr create` do `main`.
2. [x] **Audyt PR #167** → `docs/audits/AUDYT_PR167_2026-10-18.md` (ADR 0020 B / ADR 0016).
   Zakres: pliki `src/` i `tools/` (silnik, bot, zasoby, UI), reguły CR w zmianach silnika (ADR 0030:
   cytaty z dostępnego źródła, nie z pamięci), generyczność (ADR 0002: brak warunków po nazwie karty),
   RED→GREEN testów (mutacje tam, gdzie to tanie). Wynik także w opisie PR.
3. [x] Naprawy znalezisk audytu u root cause (osobny commit na każde, testy + build przed commitem).
4. [x] **Pętla jakości** (ADR 0021 pkt 4): (a) partia Żywego Testera na zbudowanym artefakcie
   z perspektywy gracza, transkrypt przeglądany ręcznie (ADR/TESTER_STOLU), naprawy u root cause;
   (b) polowanie na rozbieżności CR w obszarze NIEodwiedzonym przez PR #166/#167 (ADR 0030).
   Bez nowych kart (ADR 0029).
5. [x] Dokumentacja: `docs/PROJECT_HISTORY.md` (wpis 2026-10-18), `docs/setup/HANDOFF_2026-10-18.md`,
   wskaźnik w `README.md`, podsumowanie wykonania w tym planie.
6. [ ] Bramy końcowe: `npm run test:all` (pełna brama PR, ADR 0019; log do `.arena/`, tylko ogon),
   `npm run build`, `node tools/cr-numery.mjs --sprawdz`. Push po każdym kroku, bez force push (ADR 0020 D).

## Ryzyka / pułapki

- Pełny benchmark B0 NIE jest w planie (ADR 0018/0025). Dla zmian bota: profil szybki
  `node tools/benchmark.mjs` i tylko jeśli dotyczy.
- Każdy znaleziony błąd jest naprawiany w tej samej sesji (AGENTS: „Znalezione błędy naprawiasz od razu").
- Kod z `src/` jedzie do przeglądarki: zero globali Node w modułach silnika/kontrolerów (L58).
- Przed `git checkout <plik>` sprawdzić `git diff --stat -- <plik>` (L136).
- Tester ładuje `dist/`, nie `src/` — po zmianie w `src/` najpierw `npm run build` (L76).

## Podsumowanie wykonania

- Krok 1 `b3d0ad9` (plan), PR #168 otwarty do `main`.
- Krok 2 audyt PR #167 → `docs/audits/AUDYT_PR167_2026-10-18.md`: A-1..A-3 naprawione, A-4 (latentne) i A-5 (decyzja właściciela) otwarte.
- Krok 3 naprawy: `6aee102` (A-1), `1f2843c` (A-2), `ac059cf` (A-3 + audyt + L19 + budżet lektury).
  Budżet lektury (test `dokumentacja-budzet-lektury`) pękł o ~0,2k przez wpis L19 — zapłacono skróceniem
  dziesięciu wpisów LESSONS; próg 100k bez zmian; suma ~99,8k (margines mały → handoff, punkt 1).
- Krok 4 pętla jakości: Żywy Tester 6 partii na `dist/`, 6/6 do końca, 0 `[STOP]`, 0 zgłoszeń detektorów;
  polowanie na CR ograniczone do `destroy_all`, suspend, escape (zgodne). Zakres do rozszerzenia w kolejnej pętli.
- Krok 5 dokumentacja: wpis w `docs/PROJECT_HISTORY.md`, `docs/setup/HANDOFF_2026-10-18.md`, wskaźnik w `README.md`.
- Krok 6 bramy końcowe: patrz handoff („Bramy”).
