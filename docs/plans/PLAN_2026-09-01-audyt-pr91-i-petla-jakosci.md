# PLAN 2026-09-01 — audyt PR #91 + pętla jakości

**Sesja:** `arena/01a05d4f-mtg` (PR sesji: otwarty na starcie, ADR 0020 A).
**Baza:** `main` @ `3c23e03` (squash PR #91, merged 2026-09-01T13:42Z).
**Prompt:** „kontynuujemy projekt" — brak nazwanego tematu → **ADR 0021**
(pętla domyślna: PR na starcie → audyt poprzedniego scalonego PR → pętla
jakości). Zasady: ADR 0020 (PR/audyt/inkrementalne commity/bez force push),
ADR 0016 (chirurgiczne patchowanie), ADR 0022 (pełny Oracle albo brak
wsparcia), ADR 0018/0025 (pełne B0 tylko na komendę właściciela).

## Pomiar startowy (wykonany przed kodowaniem)

- [x] `npm test` (szybki rdzeń): **4074/4074 pass**, 0 fail (~151 s).
- [x] `npm run build`: OK — **57 modułów / 3029,5 kB**.
- [x] `git log --oneline -1` = `3c23e03`; working tree czysty.
- [x] Lektura obowiązkowa (AGENTS.md §0): AGENTS.md, ADR 0001–0027 w całości,
      `docs/LESSONS.md` L1–L113 w całości, `docs/setup/ENVIRONMENT.md`,
      PR #91 (opis + lista plików), `docs/setup/HANDOFF_2026-09-01-m277.md`.

## Etap 1 — audyt PR #91 (ADR 0020 B / 0016) — OBOWIĄZKOWY, przed kodowaniem

Zakres PR #91 (M265–M277, sesja `arena/01a058db`): audyt PR #90 + pętla
jakości (M265), naprawy kosztów kolorowych w opisie zdarzeń (M265/M266),
deskryptory alt-kosztów w widoku (M265/M267/M268), pięć odznak CR
(M269–M273, błędy #22–#25 + analizator `tools/event-contract-audit.mjs`),
kontynuacja platyny (M274, #26–#27), konsolidacja wiedzy (M275), rodzina
`damage` (M276, #28), ADR 0015 status + kontrakt widok↔render (M277).

Kryteria ukończenia etapu:

- [x] przeczytany CAŁY diff `4e18fed..3c23e03` (87 plików: src, tools,
      testy, docs);
- [x] dla każdej zmiany silnika: zgodność z CR/Oracle i ADR 0002 (brak
      przypadków po nazwie/ID karty), brak regresji zachowań;
- [x] weryfikacja mutacyjna RED→GREEN kluczowych nowych testów (L61/L34:
      baza z `git show`), min. 5 mutacji;
- [x] sprawdzenie kontraktu widoku (ADR 0017) dla nowych pól i fingerprintu
      (ADR 0005, klasa L16);
- [x] raport `docs/audits/AUDYT_PR91_2026-09-01.md` + wynik w opisie PR;
- [x] znaleziska naprawione u root cause z testem RED→GREEN (osobne commity).

## Etap 2 — pętla jakości (ADR 0021 §4), kierunki z handoffu M277

Po audycie, w kolejności (każdy podetap = osobny zielony commit):

- 2.1 **Żywy Tester** (`tools/table-tester`, `docs/setup/TESTER_STOLU.md`):
      ostatnie partie były w M265 (14 partii, seedy 301–333); od tego czasu
      8+ błędów naprawiono statycznie. Bierzemy matrycę na puli rzadziej
      audytowanej i sprawdzamy, czy analizator nie przegapił czegoś, co
      widać dopiero w grze. Lektura transkryptów wzdłuż osi 1–4; każde
      podejrzenie weryfikowane wobec Oracle/CR PRZED naprawą (L57).
- 2.2 **Analizator rodzin jako narzędzie stałe** (kierunek 2 z M277):
      `/tmp/fam*.mjs` (ad hoc w M274/M276/M277) → `tools/` obok
      `event-contract-audit.mjs`, z testem. Uwaga L113: zasięg skanu =
      zasięg klasy, nie pliku z pierwszym przypadkiem.
- 2.3 **Polowanie na niezgodności z CR** innymi ścieżkami niż M269–M274
      (tamte: choke pointy stref, kontrakty zdarzeń, cechy wejścia, liczniki,
      widok grobu). NIE dotykać: `tapObject` dla cudzych permanentów — dług
      udokumentowany w M277, nie naprawiać na zapas.

## Ryzyka i pułapki (z LESSONS/ENVIRONMENT)

- Żywy Tester mierzy `dist/`, nie `src/` → `npm run build` przed pomiarem (L76).
- Transkrypty NIE trafiają do repo (strażnik `repo-artefakty-audytu`); katalog
  roboczy `tmp-audyt-*/` jest w `.gitignore`.
- `edit_file` psuje polskie znaki → pliki z polską treścią pisz `python3`.
- Mutacje: wersja bazowa z `git show HEAD:<plik>`, nigdy lokalna kopia (L34).
- Przed każdym pushem: `git log --oneline -3`, `git fetch origin` + porównanie
  `HEAD..FETCH_HEAD` / `FETCH_HEAD..HEAD`; force push zakazany (ADR 0020 D).
- Liczby „bieżącego stanu" (README) aktualizuję na KONIEC sesji (L92).
- Sandbox bywa przeklonowany: po resecie `git fetch origin <gałąź>` →
  `git reset --hard FETCH_HEAD`; nigdy `--force` (ENVIRONMENT §2).
- Budżet lektury startowej na styk: nowy wpis → najpierw sprawdź, czy nie
  należy do istniejącej klasy (L66, handoff M277).

## Kolejność commitów

1. Ten plan (osobny commit na starcie, przed kodowaniem) → otwarcie PR.
2. Raport audytu PR #91 + naprawy znalezisk (po jednym commicie na znalezisko).
3. Pętla jakości: fix + test per zielony krok (Żywy Tester, analizator w
   `tools/`).
4. Domknięcie: README (zmierzone liczby), `docs/PROJECT_HISTORY.md`,
   `docs/setup/HANDOFF_<data>.md`, kumulatywny opis PR.
