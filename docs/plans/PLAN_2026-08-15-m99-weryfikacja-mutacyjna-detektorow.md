# PLAN M99 — weryfikacja mutacyjna detektorów Żywego Testera

**Data:** 2026-08-15 · **Gałąź:** `arena/01a000df-mtg` · **PR:** #52

## Cel

Udowodnić, że detektory Żywego Testera **same** wykrywają trzy przypadki, które
właściciel dotąd zgłaszał ręcznie z telefonu — zamiast wierzyć testom
jednostkowym na spreparowanym wejściu.

Metoda (dla każdego przypadku): **przywróć naprawionego buga → uruchom tester →
sprawdź, czy zgłasza → przywróć fix → sprawdź, czy 0 zgłoszeń.**

## Wyniki weryfikacji

| Przypadek | Detektor | Wynik |
|---|---|---|
| Ptaszek przy Village Rites | `detectGroupWithoutTick` | ✅ potwierdzony (`wiedzmin` 1 zgłoszenie, `black` 3; po fixie **0** w obu) |
| Forever Young (ekran „Poddaj partię") | `detectDeadEndWindow` | ✅ potwierdzony **dopiero po dopisaniu profilu `impatient`** |
| Carrion Call (brak okna na instant) | `detectNoResponseWindow` | ⚠️ detektor działał **błędnie** — fałszywy alarm; naprawiony, brak okna nie występuje w engine |

## Znalezione błędy — w narzędziu

1. **`detectNoResponseWindow` — fałszywy alarm zależny od `--quiet`.**
   Dowodem „okno było" była wyłącznie linia snapshotu `STOS:`, której w trybie
   cichym nie ma. Ten sam seed dawał 1 zgłoszenie pod `--quiet` i 0 pod
   `--snapshot-every 1`. Fix: dowodem oddania priorytetu jest każdy ślad
   powrotu sterowania do gracza (nowy blok modala, `>>`, modal, wizard).
2. **`detectDeadEndWindow` — ślepy pod `--quiet`.** Czytał tylko linie `AKCJE:`;
   w 300-krokowym przebiegu widział jedno okno zamiast wszystkich. Fix:
   sterownik zbiera `windowRecords` w każdym kroku, detektor przyjmuje je
   strukturalnie (parsowanie linii zostaje dla archiwum).
3. **Brak profilu odtwarzającego Forever Young.** Wszystkie cztery profile
   najpierw zamykały modal ruchu bota, więc żaden nigdy nie wysyłał komendy
   w trakcie pauzy — a to jedyna droga do tej klasy błędów. Dopisany profil
   **`impatient`** (klika „przez" pauzę + double-tap) odtworzył ekran „tylko
   Poddaj partię" po przywróceniu buga M90/B i pokazał 0 po przywróceniu fixu.
4. **Szum profilu `impatient`.** Odrzucenia komend są w nim zamierzone —
   detektor `rules` je pomija, żeby nie zawyżać statystyk znalezisk.
5. **Kruchy test `M96/3`** — wycinał sztywne 4000 znaków ciała `noteBotMove`,
   więc dopisanie komentarza wywracało test bez zmiany zachowania.

## Znalezione błędy — w produkcie (przy okazji)

6. **Log: „Ty wskazuje **?** z ręki przeciwnika"** (Dreams of Steel and Oil).
   Gdy w ręce nie ma kandydata, engine poprawnie wysyła `cardId: null`, ale
   `describeGameEvent` wołało `nameOf(null)` → fallback „?". Wariant grobu miał
   to obsłużone — brakowało symetrii. Test: `test/reveal-exile-log-null.test.js`.
7. **Modal „Ruch przeciwnika" gubił rozstrzygnięcie czaru bota** (oś 2).
   Czar bota rozstrzyga się dopiero, gdy obaj gracze spasują — czyli w wyniku
   komendy CZŁOWIEKA, gdy `botActing` jest już `false`. Gracz widział
   „Nieprzyjaciel rzuca Awaken the Bear" i nic więcej; log miał komplet.
   Fix: śledzenie kontrolera obiektów na stosie (`botStackObjects`).
8. **Modal gubił skutek czaru bota (`+3/+3`).** `stats_modified` jest globalnie
   szumem (P/T przelicza się co zdarzenie), ale w trakcie rozstrzygania czaru
   bota to właśnie informacja, przez którą gracz przegrywa walkę.
   Test: `test/bot-spell-resolution-in-modal.test.js`.

## Czego NIE potwierdzono

- **Brak okna na instant (Carrion Call) nie występuje** w żadnym z przebadanych
  przebiegów — engine oddaje priorytet poprawnie. Zgłoszenie właściciela
  dotyczyło zapewne wersji sprzed M90/C1 (`state.turn.passes` nie zerowane po
  akcji). Detektor został naprawiony i ma test na prawdziwy przypadek, ale
  **nie zgłaszamy tego jako znalezisko** — nie ma czego naprawiać.

## Dokumentacja

- `docs/setup/TESTER_STOLU.md` — profil `impatient`, sekcja „Detektor nie może
  zależeć od poziomu logowania".
- `docs/LESSONS.md` — **L13**: detektor bez weryfikacji mutacyjnej nie działa.
