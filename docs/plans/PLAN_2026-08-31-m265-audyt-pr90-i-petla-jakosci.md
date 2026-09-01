# PLAN 2026-08-31 — M265: audyt PR #90 + pętla jakości

**Sesja:** `arena/01a058db-mtg` (PR sesji: otwarty na starcie, ADR 0020 A).
**Baza:** `main` @ `4e18fed` (squash PR #90).
**Prompt:** „kontynuujemy projekt" — brak nazwanego tematu → **ADR 0021**
(pętla domyślna: PR na starcie → audyt poprzedniego scalonego PR → pętla
jakości). Zasady: ADR 0020 (PR/audyt/inkrementalne commity/bez force push),
ADR 0016 (chirurgiczne patchowanie), ADR 0022 (pełny Oracle albo brak
wsparcia), ADR 0018/0025 (pełne B0 tylko na komendę właściciela).

## Pomiar startowy (wykonany przed kodowaniem)

- [x] `npm test` (szybki rdzeń): **3893/3893 pass**, 0 fail (~151 s).
- [x] `npm run build`: OK — **56 modułów / 2989.5 kB**.
- [x] `git log --oneline -1` = `4e18fed`; working tree czysty.
- [x] Lektura obowiązkowa (AGENTS.md §0): AGENTS.md, ADR 0001–0026 w całości,
      `docs/LESSONS.md` L1–L98 w całości, `docs/setup/ENVIRONMENT.md`,
      PR #90 (opis + lista plików), `docs/setup/HANDOFF_2026-08-31.md`.

## Etap 1 — audyt PR #90 (ADR 0020 B / 0016) — OBOWIĄZKOWY, przed kodowaniem

Zakres PR #90 (M263+M264): korekta M261 (granica tury w modalu), naprawy
z audytu PR #89 (Z1 `chooseColor` w `installDeck`, Z2 ward w `playerView`),
piny ward W10/W11, Żywy Tester (11 partii) → 2 naprawy root-cause
(B: wyciek FoW nazwy zakrytego źródła triggera, C: FA noop ward-kontr),
DFC kopie (`frontFaceId`, CR 707.8a/701.51/712.9) + fingerprint.

Kryteria ukończenia etapu:

- [ ] przeczytany CAŁY diff `006fcb7..4e18fed` (src, tools, testy, docs);
- [ ] dla każdej zmiany silnika: zgodność z CR/Oracle i ADR 0002 (brak
      przypadków po nazwie/ID karty), brak regresji zachowań;
- [ ] weryfikacja mutacyjna RED→GREEN kluczowych nowych testów (L61/L34:
      baza z `git show`), min. 5 mutacji;
- [ ] sprawdzenie kontraktu widoku (ADR 0017) dla nowych pól (`frontFaceId`,
      `exiledBy`, ward) i fingerprintu (ADR 0005, klasa L16);
- [ ] raport `docs/audits/AUDYT_PR90_2026-08-31.md` + wynik w opisie PR;
- [ ] znaleziska naprawione u root cause z testem RED→GREEN (osobne commity).

## Etap 2 — pętla jakości (ADR 0021 §4)

Po audycie, w kolejności (każdy podetap = osobny zielony commit):

- 2.1 **Żywy Tester** (`tools/table-tester`, `docs/setup/TESTER_STOLU.md`):
      matryca partii na puli innej niż w M264 (M264 grało: forgotten-realms,
      ravnica, dominaria-wu, zendikar, worek-mroczny, theros, mirrodin-wu,
      mirrodin-brg, worek-dziki) — bierzemy talie dotąd rzadziej audytowane;
      lektura transkryptów wzdłuż osi 1–4; każde podejrzenie weryfikowane
      wobec Oracle/CR PRZED naprawą (L57).
- 2.2 **Klasy → detektory:** każda klasa błędu znaleziona ręcznie kończy się
      detektorem w `tools/table-tester/detectors.mjs` z weryfikacją
      dwustronną (L13/L40).
- 2.3 **Polowanie na niezgodności z CR** innymi ścieżkami niż M263/M264
      (tamte: ward, DFC-kopie, FoW zakrytych źródeł).

## Ryzyka i pułapki (z LESSONS/ENVIRONMENT)

- Żywy Tester mierzy `dist/`, nie `src/` → `npm run build` przed pomiarem (L76).
- Transkrypty NIE trafiają do repo (strażnik `repo-artefakty-audytu`); katalog
  roboczy `tmp-audyt-m265/` jest w `.gitignore`.
- `edit_file` psuje polskie znaki → pliki z polską treścią pisz `python3`.
- Mutacje: wersja bazowa z `git show HEAD:<plik>`, nigdy lokalna kopia (L34).
- Przed każdym pushem: `git log --oneline -3`, `git fetch origin` + porównanie
  `HEAD..FETCH_HEAD` / `FETCH_HEAD..HEAD`; force push zakazany (ADR 0020 D).
- Liczby „bieżącego stanu" (README) aktualizuję na KONIEC sesji (L92).

## Kolejność commitów

1. Ten plan (osobny commit na starcie, przed kodowaniem).
2. Raport audytu PR #90 + naprawy znalezisk (po jednym commicie na znalezisko).
3. Pętla jakości: fix + test per zielony krok.
4. Domknięcie: README (zmierzone liczby), `docs/PROJECT_HISTORY.md`,
   `docs/setup/HANDOFF_<data>.md`, kumulatywny opis PR.
