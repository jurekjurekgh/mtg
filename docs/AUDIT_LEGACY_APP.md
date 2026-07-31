# Audyt istniejącej aplikacji (`card_viewer_12_10_for_Github.html`)

- **Data audytu:** 2026-07-31
- **Przedmiot:** jeden plik HTML, 9 257 linii, 478 KB, wersja `v12.4` (tytuł) / `v12.10` (nazwa pliku)
- **Status danych:** wersja z wyciętymi sekretami — 8 stałych ma wartość `"classified"`
- **Cel:** ustalić fakty przed budową engine i standalone Wirtualnego Stołu (ADR 0006)

Ten dokument jest **zamrożonym opisem stanu zastanego**. Nie opisuje docelowej architektury
(zob. [ARCHITECTURE.md](ARCHITECTURE.md)) ani bieżącego postępu (zob. [PROJECT_STATE.md](PROJECT_STATE.md)).

## 1. Jak uruchomić i jak sprawdzono

Aplikacja jest pojedynczym plikiem bez zależności, builda i menedżera pakietów:

```text
card_viewer_12_10_for_Github.html
├── linie   1–7    doctype, meta, viewport (pinch-to-zoom włączony celowo)
├── linie   8–582  <style> — 575 linii CSS, 228 selektorów
├── linie 584–787  <body> — statyczny szkielet: overlaye, modale, #content, lightbox
└── linie 788–9256 <script> — 8 468 linii JS, jeden zasięg globalny, zero modułów
```

Uruchomienie w przeglądarce: otworzyć plik przez serwer HTTP (`python3 -m http.server`),
nie przez `file://` — kod robi `fetch` do arkuszy Google i oczekuje względnego katalogu `./img/`.
Ostatnia instrukcja skryptu to `loadData()`; cała inicjalizacja startuje z tego jednego wywołania.

**Weryfikacja wykonana w audycie.** Plik załadowano w JSDOM 26 (Node 22) z atrapą `fetch`
podającą trzywierszowy CSV kolekcji. Wynik:

| Sprawdzenie | Wynik |
|---|---|
| Parsowanie i wykonanie całego skryptu | OK (`node --check` na wyciętym JS przechodzi) |
| `loadData()` → `initApp()` → `render()` | OK, loader znika, `cards.length === 6` (3 bazowe + 3 wirtualne FOT) |
| Domyślna zakładka | `playtable`, faza `setup` |
| Render ekranu setup Wirtualnego Stołu | OK, 8 302 znaki HTML, widoczny wybór talii |
| `movePlaytableCard(hand → battlefield)` | OK, karta zmienia strefę, dostaje `summoning sickness`, wpis w undo |
| `getPtPromptText()` | OK, 5 364 znaki promptu |
| Błędy | tylko `window.scrollTo` niezaimplementowane w JSDOM (`renderPlaytable`, linia 7695) |

Wniosek: **aplikacja jest sprawna i uruchamialna również poza przeglądarką**, o ile podstawi się
`fetch`. To ważne — oznacza, że logika stołu nie jest zablokowana przez API przeglądarki.

## 2. Zależności zewnętrzne

| Zasób | Rola | Stan w repo |
|---|---|---|
| Arkusz Google (kolekcja, CSV) | **jedyne** źródło kart | `'classified'` w `loadData()` |
| Arkusz Google (Opowieści, CSV) | fragmenty narracji | URL jawny |
| Arkusz Google (Mangi, CSV) | rozdziały mang | URL jawny |
| Apps Script `DECK_API_URL` | odczyt/zapis talii | `"classified"` |
| Apps Script `SAVES_API_URL` | odczyt/zapis rozgrywek | `"classified"` |
| Apps Script `SCORE_API_URL` | ranking modeli AI | `"classified"` |
| Apps Script `MANGA_DISC_API_URL` | logi dyskusji/teleturnieju | `"classified"` |
| Apps Script `TALE_WRITE_API_URL` | zapis opowieści | `"classified"` |
| Apps Script `BATTLE_DOC_API_URL` | dokument bitwy | `"classified"` |
| `OPENROUTER_API_KEY` | klucz LLM **w kodzie klienta** | `"classified"` |
| `api.scryfall.com` | obrazy kart on-the-fly (17 miejsc) | jawne |
| `./img/*.png` | lokalne grafiki (`{ID}.png`, `{ID}FOT.png`, `{ID}KON.png`) | brak w repo |

Grafik w repozytorium nie ma i **nie należy ich dodawać** (SECURITY.md, README).
Zero bibliotek zewnętrznych, zero `import`/`export`, zero `type="module"`.

## 3. Model danych kart

### 3.1 Arkusz kolekcji

Nagłówki wykrywane heurystycznie (`headers.findIndex(h => h.includes(...))`):

`ilustracja`, `nazwa`, `set`/`fusion`, `plan`/`setting`, `colors`/`kolory`, `narracja`, `bestiariusz`, `lore`.

**Krytyczne ustalenie: w arkuszu nie ma żadnych danych reguł MtG.** Brak kosztu many, typów,
podtypów, siły/wytrzymałości, rzadkości i Oracle text. Kolumna `Colors` nie jest tożsamością
koloru karty — to flaga sterująca generowaniem wariantów graficznych (`K` → wariant KRA,
niepuste → wariant FOT). Pole `Set` bywa kodem setu, ale bywa też listą ID rodziców fuzji
(`"12,34"`) albo parą `"od-do"` opisującą gałąź Story.

W praktyce ze wszystkich pól karty kod stołu używa realnie pięciu: `ID` (53 odwołania),
`Nazwa` (37), `Plan` (33), `Set` (20), `Ilustracja` (11).

### 3.2 Tożsamość karty i przestrzeń ID

ID nie pochodzi z osobnej kolumny — jest wyparsowane z **prefiksu nazwy pliku ilustracji**
(`ilustracja.match(/^\d+/)`). Na tej podstawie kod buduje przestrzeń adresową przez arytmetykę:

| Zakres | Znaczenie |
|---|---|
| `< 100000` | karta bazowa |
| `+100000` | wirtualny wariant KRA (krajobraz) |
| `+200000` | wirtualny wariant FOT (panorama 21:9) |
| `+300000` | wirtualny wariant KON (bestiariusz 16:9) |
| `+400000` | wirtualny wariant LOR (lore) |
| `990001–990005` | lądy podstawowe, hardkodowane w `BASIC_LANDS` |
| `990006–990008` | The Undercity, Day, Night — hardkodowane karty specjalne |

Warianty wirtualne to **osobne wpisy w `cards`/`cardMap`**, nie pola karty bazowej.
Odzyskiwanie ID bazowego jest niespójne: `getPlaytableCardImage` używa `cardId - 200000`,
`getPlaytableKonImage` używa `cardId % 100000`, `getPlaytableFullCardImage` też `% 100000`.
Przy migracji trzeba to ujednolicić do jednej funkcji.

Rozróżnienie z ADR 0002/ARCHITECTURE (definicja / druk / instancja / obiekt gry) **nie istnieje**:
jeden numer miesza definicję karty z wariantem graficznym.

### 3.3 Instancja karty na stole

```js
{ instanceId: "inst_<random36>_<Date.now()>", cardId, isTapped, isFacedown,
  attachedTo, counters: [{name, value}], owner: 'player'|'ai' }
```

Token ma inny kształt (`isToken: true`, `name`, `desc`, brak `cardId`), przez co **każde**
miejsce czytające kartę powtarza ten sam warunek:
`cardInst.isToken ? {Nazwa: cardInst.name} : (cardMap[cardInst.cardId] || BASIC_LANDS.find(...))`.
Ten wzorzec występuje kilkanaście razy i jest gotowym kandydatem na jedną funkcję rozwiązującą.

### 3.4 Talie i zapisy

Talia to `{ name, cardIds: [id, id, ...] }` — płaska lista z powtórzeniami, bez sideboardu,
bez limitu 4 kopii, bez walidacji rozmiaru. Serializacja do chmury spłaszcza tablicę do
stringa `cardIds.join(";")`.

Zapis gry to `JSON.stringify` z 12 pól `playtableState` (bez `undoHistory`, bez talii —
zapisywane są tylko **nazwy** talii). Trzy warstwy trwałości: `localStorage`
(`mtgPlaytableDecks`, `mtgPlaytableSaves`, `mtgAiScores`), cache w pamięci
(`cachedDecks`, `cachedSaves`) i Apps Script. Zapisy do chmury idą trybem `no-cors`,
czyli **kod nie może sprawdzić, czy zapis się powiódł** — odpowiedź jest nieczytelna.
Usuwanie realizowane jest przez nadpisanie wiersza pustą wartością, nie przez `DELETE`.

## 4. Granice modułu Wirtualnego Stołu

Kod stołu zajmuje **2 566 z 8 468 linii JS (30%)** w dwóch blokach:

- `103–358` — konfiguracja, `BASIC_LANDS`, `playtableState`, undo, log, obrazy, hover;
- `6160–8469` — `showPtNotification` … `triggerPlaytableAIQuery`.

Reszta to kolekcja, mangi, bitwy, opowieści, teleturniej, lightbox, ranking AI.

### 4.1 Co stół bierze z reszty aplikacji

Analiza statyczna identyfikatorów wykazała bardzo wąską, dobrze zdefiniowaną powierzchnię.

**Uwaga: to inwentarz stanu obecnego, a nie lista rzeczy do przeniesienia.** Kolumna „Los
w nowej aplikacji" jest wiążąca — cztery z sześciu pozycji znikają całkowicie.

| Symbol | Rola w starym kodzie | Los w nowej aplikacji |
|---|---|---|
| `cards`, `cardMap` | baza kart | **zastąpione** repozytorium definicji kart (ADR 0010) |
| `loadData()` | ładowanie CSV z arkusza | **zastąpione** wczytaniem definicji z repozytorium |
| `getCardImageSrc()` | obrazy lądów podstawowych | **przeniesione** — 10 linii, rozszerzone o przełącznik źródła grafik |
| `AI_MODELS` | lista modeli LLM w selektorze | **usunięte całkowicie** — przeciwnik jest algorytmiczny |
| `OPENROUTER_API_KEY` | klucz LLM w kodzie klienta | **usunięte całkowicie** — nowa aplikacja nie woła LLM |
| `waitForExternalAI()` | ręczne wklejenie odpowiedzi LLM | **usunięte całkowicie** — nie ma ścieżki decyzyjnej przez LLM |

**To wszystko.** Stół nie zależy od mang, komiksów, bitew, opowieści, teleturnieju,
konstelacji ani lightboxa. Odwrotny kierunek jest jeszcze węższy: z całej reszty aplikacji
tylko `initApp()` woła `renderPlaytable()` przy przełączeniu zakładki.

Praktyczny wniosek: **realna powierzchnia do przeniesienia to dwie pozycje** — źródło kart
(i tak przepisywane od zera) oraz dziesięciolinijkowy helper od obrazów. Cała warstwa AI
odpada razem z kluczem API, co jednocześnie zamyka najpoważniejszy problem bezpieczeństwa z §7.

**Wniosek: moduł stołu jest praktycznie odseparowany logicznie i tylko sklejony fizycznie
w jednym pliku.** Wydzielenie standalone nie wymaga rozplątywania funkcji kolekcjonerskich —
wymaga podstawienia źródła kart i usunięcia klucza API. To istotnie obniża ryzyko z ADR 0006.

### 4.2 CSS i DOM

Ze 575 linii CSS tylko 42 dotyczą prefiksu `pt-`; reszta to style współdzielone
(`battle-btn`, `filter-select`, `sub-filter-btn`, zmienne `--gold`, `--muted`, `--accent`)
oraz style modułów niezwiązanych ze stołem. Standalone musi przenieść zmienne CSS i kilka
klas pomocniczych, ale nie cały arkusz.

Elementy DOM należące do stołu i zdefiniowane statycznie w `<body>`: `#pt-hover-preview`,
`#pt-hover-preview-img`, `#playtable-modal` (+ `#pt-modal-title`, `#pt-modal-search`,
`#pt-modal-body`). Reszta powstaje dynamicznie w `#content`.

## 5. Miejsca bezpośredniej mutacji stanu

To sedno audytu z perspektywy ADR 0002.

> **Streszczenie bez żargonu.** Obecny stół nigdzie nie sprawdza, czy ruch jest zgodny
> z zasadami — po prostu przestawia kartę tam, gdzie kliknięto. Zmiana stanu gry dzieje się
> w 105 różnych miejscach kodu, każde bezpośrednio w obsłudze kliknięcia. Żeby dołożyć reguły,
> trzeba by wstawić sprawdzanie w każde z tych 105 miejsc i pamiętać o nim przy każdej
> przyszłej zmianie. Nowa architektura ma **jedno wejście**: interfejs wysyła zamiar,
> engine go sprawdza i dopiero wtedy zmienia stan. Jedno miejsce do pilnowania zamiast 105.

Zliczenie w blokach stołu:

| Rodzaj mutacji | Liczba miejsc |
|---|---|
| Przypisania do pól `playtableState.*` | **105** |
| Mutacje tablic stref (`push`/`splice`/`pop`/`sort`/…) | 16 |
| Mutacje pól instancji (`isTapped`, `counters`, `attachedTo`, …) | 23 |

Wszystkie w blokach `103–358` i `6160–8469`, wszystkie z **handlerów UI**.
Wzorzec jest zawsze taki sam i zawsze ręczny:

```js
savePtStateForUndo();       // 23 wywołania, każde ręczne — łatwo pominąć
<mutacja stanu wprost>;
logPtAction("...");         // 27 wywołań, każde ręczne
renderPlaytable();          // 35 wywołań, pełne przerenderowanie #content
```

Nie ma warstwy komend, walidacji ani zdarzeń. `movePlaytableCard()` jest jedyną funkcją
przypominającą operację domenową (8 wywołań), ale i tak sama woła render i sama loguje.

### Reguły MtG faktycznie zakodowane w UI

Mimo braku engine, kilka reguł już żyje rozproszone po handlerach:

- karta zmieniająca strefę traci znaczniki (komentarz odwołuje się do CR 122.2);
- wejście na battlefield nadaje `summoning sickness`, z wyjątkiem lądów podstawowych;
- tokeny i karty specjalne (`>= 990006`) znikają, opuszczając battlefield;
- opuszczenie battlefield zeruje `isTapped`, `isFacedown` i zrywa `attachedTo` w obie strony;
- „odtapuj wszystko" czyści też znacznik ataku u przeciwnika.

To dobra wiadomość: **te reguły są już nazwane i przetestowane w praktyce przez właściciela**.
Przy budowie engine stanowią gotową listę wymagań, a nie zgadywanie.

### Kluczowe braki wobec ADR 0002/0003/0005

1. **Brak autorytetu reguł.** Legalność ruchu ocenia człowiek. Można zagrać 5 lądów w turze,
   rzucić czar bez many, zaatakować kartą z summoning sickness.
2. **Brak Fog of War.** Ręka AI jest renderowana w całości: komentarz w kodzie mówi wprost
   „Karty w ręce AI są w pełni widoczne dla gracza". Prompt dla LLM zawiera pełną rękę gracza.
   Nie ma nawet warstwy UI do ukrycia — nie ma czego „włączyć".
3. **Brak determinizmu.** Tasowanie to `library.sort(() => Math.random() - 0.5)` — statystycznie
   stronnicze i nieodtwarzalne. `Math.random()` w 11 miejscach, `Date.now()` w 9,
   `instanceId` łączy oba. Ten sam seed nie odtworzy partii, bo seeda nie ma.
4. **Brak modelu tury.** `activeTurn` i `activePhase` to dwa stringi ustawiane ręcznie
   z `<select>`; 5 faz jako etykiety po polsku. Brak priorytetu, stosu, kroków, ról
   atakujący/blokujący, state-based actions.
5. **Undo to snapshot, nie historia zdarzeń.** Głęboka kopia 9 pól przez `JSON.parse(JSON.stringify(...))`,
   bufor 30 pozycji, ręcznie wołany. Nie daje replayu ani diagnostyki.
6. **Renderowanie pełne przy każdej akcji** — `renderPlaytable()` przebudowuje całe `#content`
   (funkcja ma 1 027 linii), z ręcznym ratowaniem pozycji scrolla i `minHeight`.

## 6. Rola LLM w obecnym przepływie

`getPtPromptText()` (≈5,4 tys. znaków) serializuje stół do tekstu i skleja z instrukcją systemową.
Prompt miesza trzy zupełnie różne odpowiedzialności:

1. decyzję o ruchu („podejmij najlepszą strategicznie decyzję");
2. **odzyskiwanie danych reguł** — instrukcja nr 1 brzmi: *„OBOWIĄZKOWO! Wyszukaj w internecie
   statystyki i efekty każdej nowej karty w grze"*;
3. generowanie fabularnego SKIT-u (ponad połowa objętości promptu).

Punkt 2 jest bezpośrednim skutkiem braku danych reguł w arkuszu (§3.1) i dokładnie tym,
co ADR 0002 i PRODUCT.md wykluczają („LLM nie jest sędzią reguł", „bez automatycznego
interpretowania Oracle text w czasie gry"). Model odpowiada **tekstem po polsku**, który
człowiek czyta i ręcznie wykonuje — nie ma parsowania odpowiedzi ani struktury.

Punkt 3 jest jednak realną, lubianą funkcją produktu i nie ma nic wspólnego z regułami.
W nowej architekturze SKIT-y powinny być osobnym, opcjonalnym konsumentem logu partii,
całkowicie poza ścieżką decyzyjną engine.

## 7. Bezpieczeństwo

- **Klucz OpenRouter w kodzie klienta.** W wersji w repo wycięty. W wersji roboczej właściciela
  jest w pliku HTML — każdy, kto dostanie plik, dostaje klucz. Nowa aplikacja nie może
  powtórzyć tego wzorca; przy grze offline z botem algorytmicznym klucz w ogóle nie jest potrzebny.
- **Endpointy Apps Script bez uwierzytelnienia** — kto zna URL, ten czyta i pisze talie oraz zapisy.
- **`mode: "no-cors"`** — brak potwierdzenia zapisu, ciche utraty danych są niewykrywalne.
- **159 użyć `innerHTML`**, w tym z danymi wpisywanymi przez użytkownika (nazwa i opis tokenu,
  nazwy talii, nazwy kart z arkusza). To wektor XSS. Przy grze lokalnej ryzyko jest niskie,
  ale w nowym kodzie należy używać `textContent` i budowy węzłów.
- Sekrety zostały poprawnie wycięte przed wgraniem — skan `sk-`, `AIza`, `AKfycb`,
  `script.google.com` nie znalazł nic. Dwa URL-e do publicznych arkuszy CSV (mangi, opowieści)
  pozostały jawne; są publiczne z założenia, ale warto o tym wiedzieć.

## 8. Co przejmujemy, a czego nie

### Warte przeniesienia (sprawdzone w praktyce)

- model stref: `library`/`hand`/`battlefield`/`graveyard`/`exile` × 2 graczy;
- kształt instancji karty (`instanceId`, `isTapped`, `isFacedown`, `attachedTo`, `counters`, `owner`);
- reguły zmiany strefy z §5 — gotowa lista wymagań dla engine;
- rozdzielenie battlefield na lądy i nie-lądy oraz układ „AI u góry, gracz u dołu";
- inspektor stref (modal z podglądem cmentarza/exile/biblioteki), menu biblioteki
  (dobierz / spal / odkryj X / przeszukaj / potasuj), liczniki na kartach i na graczach,
  tokeny z pamięcią ostatniego, załączniki, podgląd hover w trzech trybach (FOT/KON/Scryfall);
- log akcji i autosave z debounce;
- `getPlaytableFullCardImage()` — sprytne budowanie URL Scryfall po nazwie i kodzie setu;
- `parseCSV()` — poprawny parser z obsługą cudzysłowów.

### Do porzucenia

- pełny `renderPlaytable()` jako jedna funkcja 1 027 linii;
- mutacje stanu z handlerów UI;
- `sort(() => Math.random() - 0.5)`;
- klucz API i wywołania LLM po stronie klienta na ścieżce decyzyjnej;
- prompt każący modelowi wyszukiwać reguły kart w internecie;
- `mode: "no-cors"` jako mechanizm zapisu;
- arytmetyka ID (`+100000`/`+200000`/`% 100000`) jako model tożsamości;
- moduły mang, bitew, opowieści, teleturnieju, konstelacji, rankingu AI — poza zakresem stołu.

## 9. Odpowiedzi na otwarte pytania z `PROJECT_STATE.md`

| # | Pytanie | Odpowiedź z audytu |
|---|---|---|
| 1 | Backend czy przeglądarka? | Aplikacja działa czysto w przeglądarce i **poprawnie wykonuje się także w Node/JSDOM**. Engine można napisać bez DOM. Backend potrzebny wyłącznie dla realnego FoW — decyzja odłożona (§9, pyt. 8). |
| 2 | Jak przechowywane są dane? | Karty: publiczny CSV z Google Sheets. Talie i zapisy: Apps Script + `localStorage` + cache w pamięci. Grafiki: lokalny `./img/` + Scryfall on-the-fly. |
| 3 | Format identyfikatorów? | Definicja: liczba wyparsowana z nazwy pliku ilustracji, warianty przez offsety `+100000..+400000`. Instancja: `"inst_<random>_<timestamp>"`. Obiekt gry: **nie istnieje jako pojęcie**. |
| 4 | Czy baza ma Oracle text? | **Nie.** Zero danych reguł. Stąd instrukcja w promptcie każąca LLM szukać ich w internecie. |
| 5 | 60 kart czy mniej? | Obecnie brak jakiegokolwiek limitu; talia startowa w kodzie ma 10 kart. Format testowy do ustalenia z właścicielem. |
| 6 | Pierwszy zestaw kart? | **Właściciel poda listę** ze swojego katalogu (decyzja z 2026-07-31). |
| 7 | TypeScript i monorepo? | Właściciel wybiera prostotę i przenośność → **JS + ESM**, źródła modularne, artefakt jednoplikowy budowany przez CI. Zob. ADR 0008 i ADR 0011. |
| 8 | Poziom FoW? | Dziś **zerowy**. W aplikacji czysto klienckiej realnie osiągalny poziom to „uczciwy UI + kontroler bota nie dostaje ukrytych danych". Pełna poufność wymaga backendu — poza zakresem najbliższych etapów. |

## 10. Rekomendacja

1. **Nie kontynuować rozwoju stołu wewnątrz pliku HTML.** Stan mutowany z 105 miejsc,
   render 1 027 linii i brak walidacji sprawiają, że dokładanie reguł zwiększa koszt każdej
   kolejnej zmiany.
2. **Nie przepisywać całej aplikacji kolekcjonerskiej.** Audyt pokazał, że stół jest logicznie
   niezależny (§4.1). Właściciel zachowuje działającą aplikację po swojej stronie; repozytorium
   buduje standalone Wirtualny Stół.
3. **Zbudować headless engine w czystym JS (ESM)** i podłączyć do niego nowy, cienki UI
   przejmujący sprawdzone rozwiązania z §8.
4. **Odblokować dane reguł** — bez kosztu many, typów i P/T engine nie ma czym walidować.
   To warunek wejścia w Etap 2 i największe pojedyncze ryzyko harmonogramu.
5. **Traktować SKIT-y jako osobną funkcję** czytającą log partii, nigdy jako część decyzji.

## Powiązania

- [ADR 0006 — audyt przed wydzieleniem stołu](decisions/0006-audit-before-table-extraction.md)
- [ADR 0008 — czysty JavaScript ESM bez kroku budowania](decisions/0008-plain-javascript-esm-no-build.md) (zastąpiona przez 0011)
- [ADR 0011 — modularne źródła, jednoplikowy artefakt i dwa tryby uruchomienia](decisions/0011-modular-sources-single-file-artifact.md)
- [ADR 0009 — standalone Game Table zamiast wydzielania z aplikacji](decisions/0009-standalone-game-table-instead-of-extraction.md)
- [ADR 0010 — dane reguł kart w repozytorium](decisions/0010-card-rules-data-in-repository.md)
- [Roadmapa](ROADMAP.md)
- [Bieżący stan](PROJECT_STATE.md)
