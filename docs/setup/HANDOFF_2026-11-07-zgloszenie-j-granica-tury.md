# Handoff: zgłoszenie J — pauza granicy tury zjadana przez warstwę grafik (2026-11-07, PR #181)

Gałąź: `arena/b2771170-mtg` (PR #181, inkrementalnie). To trzecie zgłoszenie
właściciela z 2026-11-07 (po H i I) — przyszło PO zamknięciu H1(a)
(bfa2049), na tym samym buildzie.

## Zgłoszenie (dosłowne, po dwóch sprostowaniach)

> „Mam swoją turę. Faza draw. Pauza. Widzę co dobrałem. Klikam w Rozgrywkę
> [= w «Rozumiem», jedno kliknięcie, mysz — NIGDY podwójne]. Nie mam nic
> do rzucenia. Moja tura się kończy. Zaczyna się tura Bota. TUTAJ POWINIEN
> BYĆ STOP [modal czeka na klik]. Ale nie ma tego stopu. Dopiero wtedy jest
> pauza (pokazuje się ekran wysokograficzny) kiedy bot rzuca np. sorcery
> w main1. Zazwyczaj działa, czasem nie."

Reguła (rozszerzenie M261 przez właściciela): KAŻDE rozpoczęcie nowej tury
— gracza i bota — pauzuje modal „Rozgrywka" i czeka na „Rozumiem".

## Root cause

`beginTurnStart` (game-state.js) emituje zdarzenia DAY/NIGHT — w tym
transformacje DFC (wilkołaki, CR 708.9) — **PRZED** `turn_started`. Gdy
transformacja wypada w strumieniu komendy, która przekracza granicę tury
(pass kończący turę):

1. `emitTransformEvent` uzbraja `awaitingArtAck` (warstwa grafik) JESZCZE
   PRZED nagłówkiem nowej tury;
2. `turn_started` uzbraja obowiązkową pauzę M261 (`awaitingBotAck`) —
   `streamAutoEvents` zwraca `true` bezwarunkowo na granicy;
3. UI tłumi modal pauzy (bramka `artPause` w `playDirect`/`closeArtShowcase`
   pokazuje tylko warstwę ilustracji) — gra formalnie stoi na DWOCH pauzach;
4. gracz zamyka warstwę → `continueArtPlay()` → `advance()`, który kasuje
   `awaitingBotAck` **na wejściu** — pauza granicy ginie bez pokazania;
5. `advance` przetacza ogon granicy (untap/upkeep/draw) i Main1 bota do
   pierwszego istotnego zagrania — rzut znów otwiera warstwę grafik.
   Gracz widzi: brak stopu na starcie tury, pierwszy stop = zagrywka
   w Main1 z ekranem wysokograficznym. Dokładnie zgłoszenie.

„Czasem" = tylko gdy obserwator artów odpali w strumieniu granicy tury
(transformacja day/night; potencjalnie każdy przyszły obserwator armowany
przez zdarzenia pre-header). Potwierdzone istnienie rasY: J/1 (zielony pin).

## Fix

`continueArtPlay()` (src/table/session.js): po zdjęciu `awaitingArtAck`
gra NIE jest przetaczana, gdy czeka niepotwierdzona pauza, której blok
zawiera nagłówek tury (`botMoves.some(m => m.type === 'turn_started')` —
ta sama klasyfikacja co istniejący getter `botPauseAtTurnBoundary`):
warstwa grafik jest PREZENTACJĄ równoległą, nie potwierdzeniem pauzy
granicy. UI po zamknięciu ilustracji pokazuje modal z „Tura N — …"
(`closeArtShowcase` → `rerender` + `showBotMoves` — bez zmian w main.js).
Pauza rzutu BEZ nagłówka tury (M254/C — warstwa zastępuje modal przy
rzucie) dalej jest konsumowana przez obejrzenie ilustracji: brak zmian
zachowania dla „czystych" pauz zagraniowych.

## Piny

`test/zgloszenie-j-pauza-granicy-tury.test.js`:
- **J/1** — rasa: wilkołak bota (Bird Admirer, daybound, z deskryptorem
  `transformTo` jak z `createCardDeck`) na polu, jest dzień, tura człowieka
  bez czarów → pass z cleanupu: pauza granicy M261 (`botPause`) i warstwa
  (`artPause`) uzbrojone JEDNOCZEŚNIE, nagłówek „Tura 2 — Nieprzyjaciel"
  w buforze, `botPauseAtTurnBoundary` prawdziwe.
- **J/2** — zamknięcie warstwy (`continueArtPlay`, jedno kliknięcie) NIE
  zjada pauzy: `botPause` nadal true, bot nic nie zagrał w Main1, nagłówek
  w buforze; dopiero `continueBotPlay` („Rozumiem") przewija ogon.
  RED→GREEN udowodniony: bez fixu J/2 pada na „bot zdążył zagrać w Main1 —
  pauza granicy została połknięta" (faza precombat_main, „zagrywa Plains"
  w buforze), z fixem 2/2.

## Śledztwo (wykluczenia — ważne dla przyszłych zgłoszeń tej klasy)

- **Sesja czysta**: fuzz biernego gracza (scratch, odtwarzalny: pętla
  „ack pauzy → continueArtPlay → pass/decline/resolve", asercja „pierwsza
  obserwacja tury bota/gracza ≥2 ma pauzę z nagłówkiem") — 181 par talii
  × 2 seedy, ~1500 tur: zero zgłoszeń środka gry. 26 trafień = wyłącznie
  TURA 1 przy ręcznym `pendingMulligans = []` (fuzzer omija mulligany, więc
  `game_started` nie płynie z komendą keep — w żywym UI nagłówek T1 jeździ
  z ostatnim keepem, potwierdzone transkryptami testera: t-102/104/107/…).
- **UI czysty przy pojedynczych klikach**: driver „przepływ właściciela"
  (scratch, jsdom na dist/mtg-table.html: keep → wyłącznie „Rozumiem" →
  pass, bierna obrona) — 15 gier, wszystkie nagłówki pokazane. Teoria
  odbicia palca (double-tap auto-ack) ODRZUCONA po sprostowaniu właściciela
  (mysz, jedno kliknięcie) — choć symulacja odbicia (dwa kliknięcia bez
  przerwy) rzeczywiście zjada pauzę następnego bloku; to odrębna, niezgłoszona
  klasa (patrz „Otwarte pozycje").
- Gałąź szumu / pustego bufora w `showBotMoves` (auto-click) NIE jest
  osiągalna na granicy: nagłówek jest pchany bezwarunkowo (noteBotMove →
  isMainLogEvent zawsze wpuszcza `turn_started`).

## Bramy

- `npm test` (fast): **10 087 / 0** (10 085 + 2 piny J).
- `npm run test:all`: **10 356 pass / 0 fail / 0 skip** (10 354 + 2 piny J).
- Build: 78 modułów / 5 768,2 kB.
- Driver właściciela po fixie: 3 gry (m.in. innistrad×innistrad,
  wiedzmin×innistrad-brg — talie transformacyjne) — kompletne, wszystkie
  nagłówki, brak zawieszeń (nowa gałąź „nie przetaczaj" nie blokuje UI:
  modal pokazuje się po zamknięciu warstwy).
- Żywy Tester: innistrad-wu vs wiedzmin-bg s210 (defensive),
  dominaria-wu vs tarkir-wur s211 (greedy) — detektory 0 zgłoszeń,
  skaner nagłówków tur czysty.
- Benchmark bota NIE uruchamiany (zmiana warstwy pauz/prezentacji, nie
  wyceny — ADR 0018).

## Otwarte pozycje (następna sesja)

1. **Double-tap na „Rozumiem"** (odrzucona teoria J, ale realna klasa):
   symulacja dwóch kliknięć bez przerwy zjada pauzę następnego bloku, który
   otwiera się synchronicznie w handlerze pierwszego kliknięcia (modal
   otwiera się „pod palcem"). Warstwa grafik ma bramkę 350 ms „odprysku"
   (installTapGesture → ignoreClick po artShowcaseOpenedAt); modal „Rozgrywka"
   jej NIE ma. Kandydat: ta sama bramka dla `closeBotMoveModalResume`
   (uwaga na tempo testera — klik <350 ms po otwarciu bywa ignorowany,
   pętla testera samodzielnie ponawia). Niezgłoszone przez właściciela
   (gra myszą) — niski priorytet, ale warto utrwalić decyzję.
2. Fuzzer scratch (patrz wyżej) nadaje się na stały strażnik regresji
   granic tur, gdyby właściciel chciał — wymaga dokumentacji w
   TESTER_STOLU.md i rozwiązania artefaktu T1 (odtwarzanie mulliganów).
