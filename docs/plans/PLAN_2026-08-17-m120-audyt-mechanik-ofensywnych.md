# PLAN M120/M121 — bot nie strzela do siebie: audyt mechanik ofensywnych

Data: 2026-08-17 · gałąź `arena/01a00fa6-mtg` · PR #57

## Zlecenie właściciela

1. Bot nie ma kontrować **własnych** czarów (panel gracza zostaje bez zmian — Z6/Z7 świadomie nietknięte).
2. Przerwać szukanie nowych znalezisk Żywym Testerem po dokończeniu ostatniego.
3. Zrobić **detektor sytuacji, gdy bot rzuca czary/zdolności na własne stwory**.
4. Przeprowadzić **dogłębny audyt mechanik ofensywnych**: każdy efekt uszkadzający,
   zabijający, tapujący itp. ma mieć penalty za użycie na własnym permanencie i na
   sobie; tak samo discard / mielenie / exile skierowane na siebie.
   Wymagany audyt wszystkich typów, nie punktowa łatka.

## Diagnoza (dlaczego to się w ogóle działo)

Kary za „bicie we własne” dopisywano **punktowo, przy okazji kolejnych zgłoszeń**:
`destroy/exile/bounce` w M91, `damage` w M92, `mill/lose_life` w M96. Każdy nowy
typ efektu startował więc **bez ochrony** — domyślnie dostawał bazowe punkty za
„legalne zagranie” i bot potrafił nim uderzyć w siebie.

Inwentaryzacja `card-data.js` dała **44 typy potencjalnie ofensywne**. Zmierzone
realne wpadki (stół przeciwnika pusty, bot ma tylko swoje stwory):

| Karta | Efekt | Zachowanie przed naprawą |
|---|---|---|
| Chill of the Grave | `tap_permanent` | tapował **własnego** stwora |
| Sterling Keykeeper | `tap_permanent` (zdolność) | j.w. |
| Entrancing Lyre | `tap_permanent` + `lock_untap` | unieruchamiał **własnego** stwora |
| Spectral Prison | aura → ETB `lock_untap` | aura-kotwica na **własnym** stworze |

Spectral Prison to nie hipoteza — trafił do transkryptu serii D
(`/tmp/D-sojusznicy-innistrad-404.txt`, linia 504).

## Kroki

- [x] Zmiana A: bot nie kontruje własnych czarów (kontroler wpisu na stosie).
- [x] Zmiana B: Station nie tapuje atakujących, gdy atak wygrywa partię; próg
      brany z karty (Wedgelight Rammer 9, Warmaker Gunship 6).
- [x] Zmiana C: literówka „przeglądnięte karty” → „obejrzane karty”.
- [x] Audyt 44 typów efektów — tabela pokrycia, które mają kontrolę właściciela celu.
- [x] `selfHarmPenalty` + tabele `HOSTILE_PERMANENT_EFFECTS` / `HOSTILE_PLAYER_EFFECTS`,
      podpięte w **obu** ścieżkach wyceny (czary i zdolności aktywowane).
- [x] `auraIsHostile` — aura-kotwica przestaje być wyceniana jak buff (+66);
      wrogość czytana też z **triggera ETB**, nie tylko z deskryptora aury.
- [x] Detektor `detectBotSelfHarmOnOwnPermanents` + `harmfulCardNames`.
- [x] Testy regresyjne i anty-over-fix.
- [ ] `npm run test:all` na zielono + benchmark profilu szybkiego.
- [ ] `docs/PROJECT_STATE.md`, `docs/LESSONS.md`, commit i PR.

## Decyzje projektowe

- **Odwrócona domyślność.** Efekt z tabeli jest ofensywny **z definicji**; wycena
  musi udowodnić, że cel należy do przeciwnika. Nowy typ efektu dopisany do tabeli
  jest chroniony od razu, bez czekania na zgłoszenie z rozgrywki.
- **Zero nazw kart** w regułach (ADR 0002) — wyłącznie deskryptory.
- **Whitelista świadomych „na siebie”.** Część typów celuje we własne rzeczy
  z założenia i **nie** dostaje kary: `exile_own_land`, `sacrifice_*` jako koszt
  rzucenia, `prevent_*`, `untap_permanent`.
- **Detektor klasyfikuje po rejestrze, nie po tekście.** W logu widać samą nazwę
  karty („rzuca Shatter → cel: X”), więc regex po polskich słowach kluczowych nie
  ma czego dopasować. Rejestr wstrzykiwany z zewnątrz — detektory zostają czyste.
- **Anty-over-fix jest częścią kontraktu.** Osobne testy pilnują, że aura-kotwica
  i tap nadal **trafiają w stwory przeciwnika**. Kara nie może zamienić się
  w paraliż.

## Ryzyka

- Zbyt szeroka kara mogłaby wyłączyć poprawne zagrania (poświęcenie własnego
  stwora jako koszt, blink). Stąd whitelista i testy anty-over-fix.
- Detektor porównuje nazwy kart ze snapshotów; ta sama nazwa po obu stronach stołu
  jest nierozstrzygalna z transkryptu — taki przypadek świadomie **pomijamy**,
  żeby nie produkować fałszywych alarmów.
