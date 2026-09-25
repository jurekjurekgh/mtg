# PLAN 2026-09-25f — UWAGA C v2: ptaszek „nie przerywa auto-passu" w prawdziwej przeglądarce

- **Zlecenie właściciela (2026-09-25, KRYTYCZNE):** „Nie działa zaptaszkowanie
  zdolności, która ma nie przerywać auto-passa. Po najechaniu na pole do
  zaptaszkowania pojawia się w hoverze informacja 'Zaznacz: ta opcja nie
  przerywa autopassu', ale kliknięcie nie zaznacza jej tylko rzuca czar/zdolność
  czyli kliknięcie w tą ofertę. Po zmianie w UI w poprzednim PR przesunęły się
  obiekty i teraz klikanie w pole wyboru nie powoduje zaznaczenia go tylko
  aktywuje czar/zdolność/ofertę."
- **Status:** plan przed kodowaniem (ADR 0020); audyt poprzedniego PR (#138)
  wykonany i dostarczony (`docs/audits/AUDYT_PR138_2026-09-25.md`, commit 4e862cf).
- **Reguła nadrzędna:** L170 — bramka osadzonych kontrolek idzie do modułu
  GESTURÓW, nie do CSS (właściciel potwierdził: fix C z PR #138 nie działa
  w przeglądarce mimo zielonych testów stubowych).

## Dlaczego testy C1–C7 z 2026-09-25 przechodzą, a błąd występuje

Zmierzone w prawdziwym Chromium (headless, `@sparticuz/chromium` + realne moduły
`gestures.js`/`picker.js` + realny arkusz stylu z `index.html`, skrypt
`scenarios.mjs`/`slip*.mjs` w katalogu sandboxa): stub testowy (`MiniEl`)
symuluje `pointerup` z `target` wskazującym węzeł POD kursorem, a prawdziwa
przeglądarka robi dwie rzeczy, których stub nie modeluje (znana ograniczenie
C5):

1. **Retarget `setPointerCapture` (panel akcji):** press startuje na etykiecie
   tekstu opcji → przycisk przechwytuje wskaźnik → `pointerup` MA `target =
   BUTTON`, nawet gdy fizycznie kursor jest nad ptaszkiem. Warunek
   `isPressExemptTarget(event.target)` w `pointerup` nie widzi wyspy →
   `activate()` → `play(cmd)`. Kliknięcia nad ptaszkiem NIE ma (przechwycenie
   przekierowuje też `click` na przycisk).
2. **Click na wspólnym przodku (panel ORAZ modal):** press startuje NA
   ptaszku, palec zejdzie z wąskiego wiersza (mierzony rozmiar pola w realnym
   CSS: `label.action-ignore` = **40×28 px** przy etykiecie tekstu ~865 px
   szerokości) i zwolnienie wypada na tekście → przeglądarka generuje `click`
   na **wspólnym przodku = `button`** (nie na wierszu, więc `stopPropagation`
   z wiersza NIE działa), `event.target` jest „uczciwy", ale press z ptaszka
   nigdy nie zapisał `handled=true` → ścieżka `click` aktywuje opcję →
   `play(cmd)` / `choiceResponse`, a ptaszek się NIE przełącza (bo click nie
   trafił w `input`).

Zmierzone scenariusze (Chromium 153, realne zdarzenia):

| Scenariusz | Obecny wynik | Pożądany |
|---|---|---|
| A/B: click prosto w input / padding wiersza | toggle ✓ | toggle |
| E/F: to samo w modalu wyboru | toggle ✓ | toggle |
| C/C2/C3/E2c: press na tekście → zwolnienie nad ptaszkiem | **CAST (bug)** | toggle |
| E2b: press na ptaszku → zejście 35 px na tekst → zwolnienie | **CAST (bug)** | brak gry (max: toggle przy mikro-zejściu ≤ slop) |
| G: modal, press na tekście → zwolnienie nad ptaszkiem | **CAST (bug)** | toggle |
| D/L: press i zwolnienie na tekście/diamencie opcji | CAST ✓ (to jest kliknięcie w ofertę) | CAST |
| H: spacja na ptaszku | toggle ✓ | toggle |

## Decyzja naprawcza (gest, nie CSS)

Plik `src/table/gestures.js`, `installPressActivation` — trzy reguły:

1. **Uczciwe trafienie przy `pointerup`:** zamiast `event.target` (kłamliwy przy
   aktywnym przechwyceniu) używamy `elementFromPoint(clientX, clientY)`
   (`element.ownerDocument`), z fallbackiem do `event.target`.
   - Zwolnienie **nad wyspą** (`[data-press-exempt]`): nigdy nie aktywujemy
     opcji; `handled = true` (nadchodzący `click` z przechwycenia/idący na
     wspólnego przodka połykamy); gdy gest był tapem (ruch ≤ `slopPx`)
     **przekazujemy interakcję wyspie** (`hit.click()` — natywne przełączenie
     checkboxa/etykiety/steppera). Przy ruchu > `slopPx` (przeciągnięcie/
     scroll przez pole) tylko połykamy — bez przełączania.
2. **Press zaczęty na wyspie nigdy nie aktywuje opcji:** `pointerdown` w wyspie
   zaznacza `islandDown` (i kasuje ewentualny `start` — nieistniejący/leżący
   press nie może się doliczyć do zwolnienia nad ptaszkiem). Przy `pointerup`:
   zwolnienie na wyspie → natywny `click` trafi w `input`/`label` i przełączy
   (bez naszej ingerencji); zwolnienie **poza** wyspą, ale w obrębie przycisku
   → `handled = true` (click na wspólnym przodku = przycisk zostaje połknięty —
   żadnego rzutu), a gdy ruch ≤ `slopPx` dodatkowo przekazujemy tap wyspie
   (mikro-ślizg palca przy celowaniu w wąskie pole dalej zaznacza).
   Zwolnienie poza przyciskiem → click idzie nad przyciskiem, nic nie robimy.
3. **Modal wyboru (`choice-request.js`):** opcje modala dostają
   `installPressActivation(button, …choiceResponse…)` zamiast gołego
   `addEventListener('click')` — ta sama bramka gestu (pkt 1–2 działa tylko
   gdy press jest zainstalowany), zapasowa korzyść: K-odporność na reflow też
   obejmuje modal. Klawiatura (`detail === 0`) i wywołania testowe
   (`stub.click()`) aktywują opcję dokładnie raz jak dotąd.

Niezmiennie: markę wyspy nadaje `picker.js` (`stopRowPropagation`), reguła w
`gestures.js` jest generyczna i nie zna klas `.action-ignore*` (kontrakt C).

## Testy (RED → GREEN, stub DOM — zero deps repo)

Nowy plik `test/uwaga-z-gry-C2-ptaszek-2026-09-25.test.js` modelujący KOLEJNOŚĆ
i **targety prawdziwej przeglądarki** (dokładnie te, które zmierzyłem w
Chromium):

- C2/1 — zgłoszenie właściciela: `pointerdown` w `input` (wyspa), `pointerup`
  na etykiecie tekstu (cel przycisku — jak po zejściu z pola), `click` na
  `button` → **zero gry**; przy ruchu ≤ slop dodatkowo przełączenie ptaszka
  (spy na `input.click()`); przy ruchu > slop wyłącznie brak gry.
- C2/2 — retarget przechwycenia (prawdziwe C5): `pointerdown` na przycisku
  (capture), `pointerup` z `target = button`, ale `elementFromPoint` zwraca
  `input` (kursor nad ptaszkiem) → **zero gry** + przełączenie wyspy;
  następnie `click` na `button` (jak Chrome) → połknięty przez `handled`.
- C2/3 — brak regresji: press na tekście i zwolnienie na tekście dalej gra
  (kontrakt K); opcja z > slop nad wyspą nie przełącza (scroll).
- C2/4 — modal: opcja z `installPressActivation` — press na tekście +
  zwolnienie nad ptaszkiem → brak `onResponse`, ptaszek przełączony; zwykły
  press na opcji → `onResponse` DOKŁADNIE raz.

Istniejące C1–C7 muszą zostać zielone bez zmian (dokładamy tylko nowe
scenariusze; C5 dostaje realny dowód zamiast zakładać `target = input`).

## Brama i kolejność commitów (ADR 0020 C–D)

1. Ten plan (dokumentacja) — osobny commit, push.
2. `gestures.js` + nowe testy C2 (najpierw lokalny RED na samych testach,
   potem fix → GREEN) — `npm test` + `npm run build` → commit → push.
3. `choice-request.js` (press activation dla opcji modala) + testy modalne —
   `npm test` + `npm run build` → commit → push.
4. Finał: `npm test` + `node --test test/bot-benchmark.test.js` (potwierdzenie
   audytowe wg ADR 0018 — bez pełnego B0), weryfikacja w prawdziwym Chromium
   (scenarios + slip: A/B/E/F/H/I toggle, C/C2/C3/G/E2c toggle po fixie,
   D/L dalej grają, E2b bez gry), aktualizacja opisu PR sesji (#139).

Bez force push, commity tylko przód, każdy samodzielnie zielony.
