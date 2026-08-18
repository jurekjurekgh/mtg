# PLAN M138 — audyt „wcielam się w gracza” Żywym Testerem (runda 4)

**Zlecenie właściciela (2026-08-18):** uruchomić wirtualny stół, rozegrać
partie jako GRACZ (konkretna talia vs bot inną talią), obserwować interfejs,
opcje, czary, zdolności, stos, tury — i zebrać **10 unikalnych znalezisk**
(błędy, usterki, niejasności, uproszczenia, głupie zachowania bota). Potem
naprawić. Jeśli z analizy logu wyjdą nowe klasy błędów — **dopisać do Testera
reguły automatycznego wykrywania**, żeby łapał je w kolejnych partiach.

To audyt REALNYCH WYDARZEŃ NA STOLE, nie kodu silnika.

## Zasady tej rundy

* Znalezisko = coś, co zobaczyłby gracz. Cytat z transkryptu obowiązkowy.
* Każde zgłoszenie potwierdzam w kodzie **zanim** nazwę je błędem
  (artefakt jsdom ≠ bug produktu — `TESTER_STOLU.md` → „Ograniczenia”).
* Naprawa u ROOT CAUSE, reguły generyczne po deskryptorach (ADR 0002).
* Każda naprawa ma test regresyjny przepuszczony przez mutację odwracającą.
* Nowa klasa błędu → nowy detektor w `tools/table-tester/detectors.mjs`
  (opary na danych strukturalnych, nie na parsowaniu snapshotów — M99/M104).
* „Zielony” = cały `npm run test:all`.

## Etapy

- [ ] **E0.** Plan + push jako osobny commit przed kodowaniem.
- [ ] **E1.** Seria partii audytowych: różne pary talii × profile gracza.
      Cel: materiał na 10 unikalnych znalezisk.
- [ ] **E2.** Triage: lista zgłoszeń, każde potwierdzone w kodzie
      (`docs/audits/AUDYT_2026-08-18-m138.md`).
- [ ] **E3.** Naprawy u root cause + testy regresyjne (partiami, commit na temat).
- [ ] **E4.** Nowe detektory w testerze dla klas błędów, które wyszły z logu.
- [ ] **E5.** `npm run test:all` + `npm run build` + weryfikacja: powtórka
      partii, w których znaleziska wystąpiły (czy zniknęły).
- [ ] **E6.** Docs (`PROJECT_STATE.md`, `LESSONS.md`, `TESTER_STOLU.md`),
      aktualizacja opisu PR #58.

## Ryzyka / pułapki

* **Detektory zależne od poziomu logowania** (L: M99, M104) — nowy detektor
  uruchamiać w OBU trybach (`--quiet` i `--snapshot-every 1`); rozjazd = błąd
  detektora.
* **Fałszywe alarmy z osi 2**: `turn_started` NIE jest szumem; sama nazwa fazy
  jest szumem. W M97 już raz się na tym przejechano.
* **Ślepy bot ≠ głupi bot** (ADR 0017, L1) — przed oskarżeniem heurystyki
  sprawdzić, co bot w ogóle widzi w `PlayerView`.
* Znaleziska „na styku” (świadome decyzje właściciela) — Z6/Z7, mulligan,
  kontrczar we własny czar, ostrzeżenie „czar fizzluje” przy Bone Splinters —
  **nie zgłaszać ponownie**.
* Partia z jsdom bywa wolna; limity kroków 300–600.
