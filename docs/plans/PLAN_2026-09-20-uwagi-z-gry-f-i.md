# Plan 2026-09-20 — uwagi z gry (F–I): martwy kreator talii, 4 lądy do czaru za 2, Explore bez nazwy karty, cichy discover

Zlecenie właściciela (2026-09-20, druga paczka zgłoszeń z gry w tym samym PR
#130): cztery uwagi do domknięcia „w tym PR”, paczkami — pin + zielone
`npm test` + `npm run build` + commit i push po KAŻDEJ paczce (stała zasada
właściciela). Zasady projektu bez zmian: ADR 0002 (UI nie rozpoznaje kart po
nazwie — tylko deskryptory), L41/L48 (jedno źródło reguły dla oferty,
wykonania i prezentacji), L135 (nowy kształt komendy/zdarzenia trzeba obsłużyć
u KAŻDEGO konsumenta), budżet lektury startowej bez podnoszenia progu.

Raport w kolejności zgłoszeń. Poprzednia paczka (A–E) opisana w
`docs/plans/PLAN_2026-09-20-uwagi-z-gry-a-e.md`.

## F. „Kreator talii” nie pokazuje się w aplikacji

Zgłoszenie: „sekcja Deck Builder jest martwa — nie używam jej i nie będę;
zakomentuj ją w aplikacji tak, żeby nie pokazywała się w ogóle”.

**Naprawa (paczka F, `4355c51`):**

- `src/table/index.html`: cały panel `#deck-builder` (markup, ~66 linii) siedzi
  teraz w bloku komentarza HTML, a nagłówek reguł CSS mówi, że style są
  uśpione. Markup ZOSTAJE w pliku (odwracalność: odkomentowanie), a wewnętrzne
  komentarze HTML mają myślniki zamienione na encje — inaczej `--` zamknąłby
  komentarz zewnętrzny (pułapka HTML, nie kosmetyka).
- `src/table/main.js`: zakomentowany import i OBA montaże `mountDeckBuilder`
  (moduł nie ma prawa wypełniać panelu nawet po przypadkowym powrocie markupu).
- Kod modułów (`src/table/deck-builder.js`, `src/cards/deck-builder.js`,
  ADR 0012) zostaje — wyłączony jest MONTAŻ, nie implementacja. Biblioteka
  talii własnych (IndexedDB → selecty talii) działa dalej, bo karmi selecty
  niezależnie od panelu.
- Strażnik: `test/zgloszenie-f-kreator-talii-wylaczony.test.js` — brak żywego
  `id="deck-builder"` (poza komentarzem HTML i poza `<style>`), markup
  zachowany w komentarzu (odwracalność), zero żywych wywołań `mountDeckBuilder`.
  RED przed poprawką 0/3.
- `test/table-ui.test.js`: test klikający panel zastąpiony guardem SKUTKU
  (po boocie aplikacji panel nie jest wypełniany).
- Efekt uboczny zmierzony: bundle 64 → **59 modułów** (3939,6 kB) — panel
  wypada z produkcji razem z zależnościami.

## G. „Kreator many kazał mi tapnąć 4 lądy do czaru za 2”

Zgłoszenie: „Canonized in Blood (koszt «CB» = 2 many) — kreator many kazał mi
tapnąć 4 lądy”.

**Pomiar (silnik czysty):** koszt karty to `{1}{B}` (`MANA_COSTS`,
`card-data.js`), `effectiveSpellManaCost` = 2, deskryptor płatności
`{costStr: '{1}{B}', totalNeeded: 2, requirements: [['B']]}`, postęp kreatora po
dwóch tapnięciach `done: true`. Oferta rzutu pojawia się wyłącznie z czarnym
źródłem (bez czarnego źródła jej brak — poprawnie). Czyli wadliwa była WARSTWA
PROWADZENIA PŁATNOŚCI: lista źródeł szła w porządku stołu, a po zebraniu sumy
kreator dalej proponował lądy BEZ brakującego koloru — gracz tapujący „po
kolei z góry” (Wyspa, Góra, Las, Bagno) marnował tapnięcia i płacił dopiero na
czwartym lądzie.

**Naprawa (paczka G, `de28378`):** `guideManaSources(sources, missingColors,
totalMet)` w `src/table/mana-wizard.js` — (1) KOLEJNOŚĆ: źródła dające
brakujący kolor idą pierwsze (sort stabilny, porządek stołu zachowany w grupie);
(2) ZAKRES: gdy suma jest zebrana, a brakuje koloru, zostają wyłącznie źródła
dające ten kolor (reszta tylko marnuje zasoby). `wizardProgress` dokłada do
modelu `missingColors` i `coversMissing` per źródło; render mówi
„— pokrywa {B}”, a pusta lista przy niepokrytym kolorze mówi WPROST: „Żadne
dostępne źródło nie daje B — Anuluj płatność”.

**Świadomie NIE zrobione:** auto-tapnięcie wymuszonego źródła („brak
alternatywy → automatycznie” w innych decyzjach). Tu płatność jest JAWNĄ
decyzją gracza o zasobach (CR 601.2h), a kreator prowadzi kolejnością i
zakresem — bez wydawania zasobów bez kliknięcia.

**Strażnicy:** `test/zgloszenie-g-kreator-many-brakujacy-kolor.test.js`
(przewodnik + postęp domykający `{1}{B}` w DWÓCH tapnięciach + render;
RED 0/4), `test/table-ui.test.js` — end-to-end na Mini-DOM z talią
„g-canonized” (4× Island/Mountain/Forest/Swamp + Canonized in Blood), gracz
tapuje ZAWSZE pierwszy wiersz kreatora. RED przed poprawką: **3 tapnięcia**
(w kolejności właściciela 4), po: **2 = koszt**.

## H. Explore pyta „co z odsłoniętą kartą?” bez nazwy karty

Zgłoszenie: „Guidestone Compass Explore — modal «Wybierz: Explore — co
z odsłoniętą kartą?» ma wymienić i podlinkować odsłoniętą kartę; teraz trzeba
jej szukać w logu, żeby podjąć świadomą decyzję”; pytanie dodatkowe: „czy modal
jest budowany z uniwersalnego kreatora?”.

**Odpowiedź:** TAK — decyzja Explore idzie przez wspólny `renderChoiceRequest`
(kreator wyboru z pickerem ról i opcjami), nie przez osobny modal. Brakowało
w nim DANYCH o karcie: komenda `resolve_explore_choice` ma dwa warianty
(wierzch/grób) bez identyfikatora karty, a odsłonięta karta siedziała
w oczekującej decyzji i nie była wystawiona w widoku decydenta.

**Naprawa (paczka H, `eea273a`):** `pendingExplore` niesie `sourceCardId`
(źródło eksploracji — publiczny permanent; wzorzec M162/C, M163/A, M240/K);
`playerView` wystawia `{ sourceCardId, cardId }` właścicielowi decyzji;
`choiceSourceTitle` ma gałąź `resolve_explore_choice` → „Guidestone Compass —
Explore: Fathom Fleet Cutthroat na wierzchu biblioteki”; `previewCardIdOfOption`
przyjmuje opcjonalny widok i dla decyzji bez karty w komendzie bierze ją
z oczekującej decyzji — dzięki temu OBA warianty dostają wspólny przycisk
„🔍 Podgląd karty” (pełnoekranowa ilustracja, jak M201/C2). Strażnik:
`test/zgloszenie-h-explore-nazwa-karty.test.js` (pełna ścieżka silnika: rzut
zdolności, zejście ze stosu, widok, tytuł, podgląd; RED 0/3 — komunikat RED
cytował dosłownie stary tytuł „Wybierz: Explore — co z odsłoniętą kartą?”).

## I. Discover bez trafienia — cisza w logu i „Rozgrywce”

Zgłoszenie: „Geological Appraiser ETB Discover 3 — przejrzana cała biblioteka,
brak trafienia; karty wróciły, ale «Rozgrywka»/log nie mówią, że biblioteka się
wyczerpała, że nie było trafienia ani że karty wróciły na spód w LOSOWEJ
kolejności — wpis kończy się na «trigger się rozstrzyga»”.

**Pomiar:** zdarzenie `discover_resolved` przy braku trafienia nie niosło
żadnych faktów poza `found: false`, a warstwa tekstu mapowała je na `null`
(wpis CICHY). Dodatkowo typ zdarzenia nie był przepuszczany przez bramkę logu
gracza poza okno stosu.

**Naprawa (paczka I, `9baaf89`)** — trzy warstwy, bo tyle było niepełnych:

1. SILNIK (`effects.js`, brak trafienia): `discover_resolved` niesie
   `revealedCardIds`, `bottomCount` i `libraryExhausted`.
2. SILNIK (`game-state.js`, trafienie): `discover_resolved` niesie
   `bottomCount` — „reszta na spód w losowej kolejności” (CR 701.53) też była
   w narracji niewidzialna.
3. TEKST (`session.js`): brak trafienia opisany wprost („nie znajduje karty dla
   discover (3) — biblioteka się wyczerpała (przejrzano N kart); odsłonięte
   karty (N) na spód biblioteki w losowej kolejności”), a trafienie dokłada
   informację o odłożonej reszcie.
4. BRAMKA (`session.js`): `discover_started`/`discover_resolved` wchodzą do
   `BOT_RESOLUTION_EVENTS` (skutek rozstrzygnięcia) i do `HUMAN_DIGEST_EVENTS`
   (własne odsłanianie biblioteki nie może zniknąć, gdy trigger zdążył zejść ze
   stosu — `stackSize 0`).

Strażnik: `test/zgloszenie-i-discover-brak-trafienia.test.js` — realna ścieżka
silnika (rzut Appraisera, rozstrzygnięcie stosu, biblioteka z samych landów →
brak trafienia) + opis zdarzenia + bramka logu; RED 0/4 (m.in. stary wpis
„Island — discover (rzut za darmo)” bez informacji o spód).

## Bramy po paczkach F–I

| Bramka | Wynik |
| --- | --- |
| `node tools/run-tests.mjs all` | **6022/6022**, 0 fail (F: 6010 → G: 6015 → H: 6018 → I: 6022) |
| `npm run build` | 59 modułów / **3948,2 kB** (przed F: 64 / 3970,2 kB) |
| benchmark `--quick` | 672 mecze, heuristic **85,9%** (parytet z 86,0% baseline) |

## Ryzyka i świadome decyzje

1. **F** — usunięcie markupu z żywego HTML zmienia zbiór identyfikatorów
   w `index.html`; harness Mini-DOM buduje listę id właśnie z tego pliku i ma
   uzupełnienie ręczne, więc testy przechodzą, ale KAŻDE nowe miejsce, które
   sięgnie po `#deck-builder-*`, dostanie `null` (a nie wyjątek) — dlatego
   strażnik pinuje też brak żywych wywołań montażu.
2. **G** — prowadzenie płatności zmienia KOLEJNOŚĆ wierszy w kreatorze
   (zachowanie widoczne dla gracza); istniejące testy kreatora (m202-o, m311,
   m327, m348, audyt-pr120, table-ui „Curate”) przechodzą bez zmian, bo nie
   pinowały kolejności „po stole”.
3. **H** — nowe pole `sourceCardId` w `pendingExplore` zmienia kształt stanu
   tylko wtedy, gdy istnieje oczekująca decyzja Explore (fingerprint liczony
   tylko dla takich stanów); benchmark quick bez zmian wyniku.
4. **I** — wpisy discover mogą pojawiać się w logu CZĘŚCIEJ niż dotąd (bramka
   szersza). To celowe: brak trafienia był wcześniej informacją ZGUBIONĄ
   (L24 — zgubiona informacja boli bardziej niż nadmiarowy wpis).

## Kolejka

Po paczkach F–I PR #130 czeka na decyzję właściciela (scala właściciel —
ADR 0007/0020). Świadomie otwarte, poza zakresem zgłoszeń: auto-tapníęcie
jednoznacznego źródła w kreatorze many (patrz G) oraz pary kart z podziałem
bezkolorowych (patrz plan A–E, punkt 3 „Kolejka”).
