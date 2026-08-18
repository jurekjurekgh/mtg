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

- [x] **E0.** Plan + push jako osobny commit przed kodowaniem.
- [x] **E1.** Seria partii audytowych: różne pary talii × profile gracza.
      Cel: materiał na 10 unikalnych znalezisk.
- [x] **E2.** Triage: lista zgłoszeń, każde potwierdzone w kodzie
      (`docs/audits/AUDYT_2026-08-18-m138.md`).
- [x] **E3.** Naprawy u root cause + testy regresyjne (partiami, commit na temat).
- [x] **E4.** Nowe detektory w testerze dla klas błędów, które wyszły z logu.
- [x] **E5.** `npm run test:all` + `npm run build` + weryfikacja: powtórka
      partii, w których znaleziska wystąpiły (czy zniknęły).
- [x] **E6.** Docs (`PROJECT_STATE.md`, `LESSONS.md`, `TESTER_STOLU.md`),
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


---

## Wykonanie

**Zebrano 11 znalezisk** (zlecone 10) w 22 partiach: 12 talii, 5 profili gracza,
`--tick-rate` 0–0,3, oba tryby logowania. Wszystkie naprawione u root cause.

### Kluczowy wynik metodyczny

Detektory Testera zgłosiły w tych 22 partiach **zero** nowych rzeczy. Wszystkie
znaleziska pochodzą z czytania transkryptu w roli gracza. To nie znaczy, że
narzędzie jest złe — znaczy, że nie miało reguł dla tych klas (L27 → L40).
Trzy klasy dały się zamienić w detektory i **w pierwszym uruchomieniu
kontrolnym wykryły jedenaste znalezisko**, którego nie zauważyłem ręcznie.

### Rozkład

| warstwa | ile | przykład |
|---|---|---|
| UI (opisy) | 7 | koszt „{1},{T}” zamiast „{R},{T}, odrzuć kartę” |
| bot | 1 | 24× Zadeptywanie dla MOICH stworów |
| engine/log | 2 | „nic się nie wydarzyło”, gdy stwór zmienił się z 1/3 na 3/3 |
| narzędzie | 1 | fałszywy alarm po zmianie kontrolera |

8 z 11 to jedna choroba: informacja jest w danych, ale mapa opisów jej nie zna
(L41). Koszt zdolności liczyły TRZY niezależne kopie kodu, każda znająca inny
podzbiór pól — stąd naprawa przez wspólną tabelę, nie przez łatanie kart.

### Pomiary

* `npm run test:all` — **2224/2224**, 0 failów (przed rundą: 2196).
* `npm run build` — zielony.
* Benchmark (8 seedów, 2 496 meczów): **63,1 %** vs aggro, **90,2 %** vs random
  — bez regresji po zmianie wyceny bota (było 63,0 % / 90,4 %).
* Weryfikacja mutacyjna: przeciw kodowi sprzed audytu pada **14 z 16** testów.
* Detektory sprawdzone dwustronnie na realnych transkryptach: 10/1/2 zgłoszenia
  przed naprawami, 0 po.

Raport z cytatami: `docs/audits/AUDYT_2026-08-18-m138-zywy-tester.md`.
