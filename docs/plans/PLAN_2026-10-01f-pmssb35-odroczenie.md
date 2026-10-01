# PLAN 2026-10-01f — PMSSB-35: odroczenie zagrania (`plot_card` / `suspend_card` / `warp_card` + rzut karty czekającej z wygnania)

Pętla z **procedury `docs/PMSSB.md`**. Wejście: `c01c293` (koniec PMSSB-34 —
koszt many aktywacji + treść sprzętu). Zlecenie właściciela bez zmian: JEDNA
rodzina, audyt przyczynowo-skutowy (kiedy efekt jest taktycznie najmocniejszy,
w jakich fazach/turach, kiedy zysk jest zerowy), potem wycena premiująca
momenty sensowne. Bez strojenia maszynowego (ADR 0018).

## 1. Wybór rodziny (i dlaczego to nie re-audyt)

Kolejka handoffu 01e wskazywała `manaAvailableNow` w `suspend_card` (pozycja
„stary model dostępności many”). Rekonesans 01f domknął obraz: to nie jeden
przestarzały warunek, a **cała rodzina odroczeń** — trzy akcje specjalne
(`plot_card`, `suspend_card`, `warp_card`) plus **rzut karty czekającej
z wygnania**, który jest jedyną wypłatą odroczenia.

Nośniki w katalogu i w taliach wzorcowych (wszystkie 5 kart jest grane):
`mindstab` (dominaria-brg) · `tumbleweed-rising` + `spinewoods-paladin`
(worek-dziki) · `sheriff-of-safe-passage` (srodziemie) · `weftblade-enhancer`
(worek-legend). Zero nowych kart (ADR 0029) — audyt na istniejącym katalogu.

### 1.1. Rdzeń znaleziska: wypłata odroczenia jest wyceniana NA ŚLEPO

`case 'cast_permanent'` czyta kartę wyłącznie z RĘKI:

```js
case 'cast_permanent': {
  const card = handCard(view, cmd.objectId);   // ← brak zoneCard
```

Skutek zmierzony sondą (`/home/user/scratch/pmssb35-exile-rzut-arytmetyka.mjs`):

| Karta w exile (plotted) | score rzutu | Uwaga |
|---|---|---|
| Sheriff of Safe Passage (0/0, MV 3) | **63,000** | = `P.creatureBase` 70 × waga `permanent` 0,9 |
| Hill Giant (3/3, MV 4) | **63,000** | identycznie |
| Hill Giant z P/T podmienionym na 20/20 | **63,000** | ciało nie jest czytane |
| Spinewoods Paladin (5/4, MV 5) | **63,000** | identycznie |
| Weftblade Enhancer (3/4, MV 6) | **63,000** | identycznie |
| ten sam Sheriff, ale z RĘKI | 59,396 | ciało − koszt many (inna ścieżka) |

Czyli: **im większa karta, tym większa strata** — zaplotowany 5/4 dostaje tyle
samo co 0/0, a darmowy rzut (CR 702.170d) jest wyceniany, jakby płacił pełny
koszt. To kontrola (a) procedury: ta sama karta na dwóch nośnikach
(ręka vs wygnanie) nie liczy tego samego. Dotyczy też okien darmowego impulsu
(CR 701.18, stempel `playableWithoutPaying`) i poczekalni warp.

### 1.2. Trzy akcje odroczenia są płaskie (bez ceny i bez treści)

| Gałąź | Model PRZED | Luka |
|---|---|---|
| `plot_card` | `55` + token/mill | brak kosztu plotu; **S6**: Tumbleweed Rising {1}{G} (plot {3}{G}), t3, 4 lasy → plot **55,000** wygrywa z rzutem **49,980** (bot płaci 4 many i czeka turę, choć rzut za 2 many jest teraz możliwy) |
| `warp_card` | `ciało − 15 + 5 ETB` | koszt warp niewidoczny: **70,000** przy 4 polach i przy 6 polach; przy 6 polach warp (70) wygrywa z rzutem stałym (65,703) |
| `suspend_card` | `30` / `8` wg `manaAvailableNow` | dostępność liczona po LĄDACH (pula + nietapnięte landy; bez kolorów/pipów/źródeł nielandowych): **S3** (5 lądów + Seer's Lantern) — silnik MA ofertę rzutu, a bot daje „nie stać mnie” = 30; brak treści (Mindstab = czar jałowy) i czasu (4 liczniki niezależnie od fazy gry) |

## 2. Fale

- **A — wypłata odroczenia (L41/L48):** `cast_permanent` czyta kartę z ręki
  **albo z dowolnej strefy** (`handCard ?? zoneCard`, wzorzec `cast_spell`);
  koszt many odejmowany **tylko, gdy rzut naprawdę płaci** — decyduje reguła
  silnika `castsWithoutPayingMana` (import z `src/engine/impulse-window.js`:
  „exile + plotted/stempel darmowego rzutu"), jedno źródło prawdy (L28). Ten
  sam warunek w `reservedManaOf` (podatek ward / oszczędność surge nie mogą
  rezerwować many, której rzut nie płaci).
- **B — cena odroczenia (kontrola (b) procedury):** wszystkie trzy akcje
  dostają cenę w tej samej skali co koszt karty/aktywacji
  (`P.creatureManaCostWeight`, 1 pkt za manę, `koszt + liczba pipów`).
  `plot_card` dodatkowo: gdy kartę można rzucić TERAZ (`castOfferedNow`,
  oferta = legalność, L48), plot jest sensowny tylko, gdy realnie oszczędza manę; inaczej
  surcharge `plotRedundantPenalty` + `plotDelayPenalty` (zwłoka). Przy braku
  oferty rzutu (jedyny sensowny moment odroczenia) baza 55 zostaje — anty-over-fix (c).
- **B2 — treść i czas w `suspend_card`:** dostępność „da się rzucić teraz"
  liczona ofertą silnika zamiast legacy `manaAvailableNow`; bonus treści z tej
  samej tabeli co `resolve_suspend_cast` (L41: damage/discard/destroy/mill +15,
  draw/gain_life +5); surcharge za czekanie `suspendWaitPenalty × liczniki czasu`
  (4 tury czekania to nie to samo co 1).
- **C — dowody:** piny + mutacje + sondy PO (te same scenariusze co PRZED) +
  regeneracja golden-mastera (świadoma, z raportem różnic).

## 3. Anty-over-fix (M429)

- Karty o identycznym koszcie i identycznej treści **nadal remisują** (pin).
- Przy braku oferty rzutu (odroczenie jest jedyną drogą) `plot_card` zachowuje
  bazę 55 i dotychczasowe bonusy (token/mill) — nowe wymiary tylko odejmują.
- `warp_card` zachowuje `−15` (tymczasowość) i `+5` (ETB) — dochodzi wyłącznie
  cena kosztu warp.
- Rzut darmowy nie dostaje premii — dostaje **brak kary za manę, której nie płaci**.
- Rzut natychmiastowy nie może przegrać z odroczeniem, które jest od niego
  droższe i późniejsze (dowód decyzyjny S6 → pin).

## 4. Znane granice (do raportu)

- Model nie zna „ile tur zostało" (brak zegara gry w stanie bota) — surcharge
  czekania jest liczony po licznikach czasu, nie po przewidywanej długości partii.
- Podwójny ETB z warp (rzut z ręki + późniejszy rzut z wygnania) nadal nie ma
  osobnego wymiaru — cena kosztu warp jest pierwszym krokiem.
- Karty z wygnania IMPULSEM (`hasFreeCastStamp`) w tej kolekcji nie występują
  (5 kart rodziny to plot/suspend/warp), ale reguła A jest klasowa — pin
  syntetyczny (ADR 0029) pilnuje wspólnej ścieżki.
- `plot_card` dla kart bez oferty rzutu pozostaje „płaską bazą + bonusy" —
  pełny model (treść czekająca na późniejszą planszę) to kandydat na kolejną pętlę.

## 5. Bramy i higiena

- Piny: `test/audyt-pmssb35-odroczenie.test.js` (RED→GREEN + mutacje).
- `npm test`, `npm run build`, `npm run test:all`; `bot-scoring-snapshot`
  (regeneracja świadoma + raport różnic), tie-audit PO, mirror-eval, Żywy Tester PO.
- Sonda i dumpy poza repo (`/home/user/scratch`, `/tmp`) — repo zostaje czyste.

## 6. Wynik implementacji (PO)

Fale A i B weszły zgodnie z planem. Jedna pozycja planu **świadomie odpadła**:

- **§2 B2 „bonus treści" dla `suspend_card`** — po pomiarze uznany za over-fix.
  Treść zawieszonego czaru jest wyceniana w momencie WYPŁATY (`resolve_suspend_cast`:
  70 + tabela damage/discard/destroy/mill +15, draw/gain_life +5), a nie dwa razy:
  premia w samej inwestycji zawyżałaby odroczenie wobec rzutu z ręki (kontrola (c):
  nowe wymiary to dopłaty/ kary, nie premie). Dowód z partii: sonda wypłaty
  (`pmssb35-wyplata.mjs`) — 24 partie, PRZED 10 odroczeń / 9 wypłat / 2 karty
  czekające na koniec; PO 5 / 5 / 0, czyli pętla odroczenia domyka się bez premii.
- **Surcharge za zwłokę** (`plotDelayPenalty`) dostał też wariant „rzut dostępny
  teraz" (nie sam plot): `if (castOfferedNow(view, card)) { redundant?; delay; }` —
  bez tego zwłoka karała także odroczenie, gdy rzut był nieosiągalny (a to jest
  jedyny sensowny moment odroczenia, anty-over-fix (c)).

### 6.1. Znalezisko silnika przy pomiarze wypłaty (naprawione u źródła)

Sonda wypłaty pokazała w partii `worek-legend|dominaria-brg` s1000 **dwa rzuty tej
samej karty z wygnania** (t12 i t14). Przyczyna: pieczęć rzutu z wygnania
(`plotted`/`plottedAtTurn`, `warpReady`/`warpedAtTurn`, para okna impulsu) jechała
z obiektem przez zmianę strefy — permanent rzucany z wygnania nosił ją dalej, więc
PONOWNIE wygnany (Faceless Butcher) wracał do ofert rzutu z wygnania. CR 400.7
(nowy obiekt nie pamięta poprzedniego istnienia) + CR 702.185b („warped card in
exile" = karta wygnana triggerem warp, nie dowolne wygnanie) + glosariusz
„Plotted" (karta wygnana akcją plot albo efektem, który tak stanowi).

Naprawa: choke point stref (`moveObjectDirectly`) zdejmuje pieczęcie wygnania przy
wyjściu z tej strefy; para pól okna impulsu przez helper-właściciela
(`impulse-window.js: clearImpulseWindowStamp`, guard `family-audit` 8/8).
Dowód: `/home/user/scratch/pmssb35-wyciek-stempli.mjs` (PRZED: oferty po ponownym
wygnaniu `[cast_permanent]` dla plot i warp; PO: `[]`), piny F1–F3 w pliku testów,
golden-master bez zmian (żaden z 6 meczów nie trafia w wyciek).

## 7. Bramy PO i wnioski

- `npm test` **7304/7304** (7286 po PMSSB-34 + 18 pinów tej pętli: A1–A4, B1–B5,
  C1–C4, D1, E1, F1–F3) · build **70 modułów / 4708,3 kB** (+7,4 kB wobec
  `c01c293` — komentarze i helper wchodzą do bundla) · `npm run test:all` zielone.
- Snapshot scoringowy: regeneracja **świadoma** (1 z 6 meczów, `scoreSum`
  −6,0 = suspend 8→2, `chosenKinds` identyczne ⇒ 0 flipów wyboru), hash
  `ab8d57d2…` → `4024bcd1…`; fix silnika fixture'u NIE ruszył.
- Tie-audit PO (`--gry=2`): 24 partie / 12 448 decyzji / 623 remisy (438 par
  „brak akcji" + 185 realnych = 10,0%); rodzina bez remisów „GROZY"
  (`suspend_card` 1 decyzja, `plot_card` 1, `warp_card` 0).
- Mirror-eval (A = nowe domyślne, B = trzy pokrętła odroczenia zerowane):
  **96 partii 48:48 (0,500)**; wariant 4 talii z nośnikami: 64 partie 32:32.
- Żywy Tester na finalnym buildzie: 6 sesji (3 na tymczasowej talii rodziny,
  3 wzorcowe) — 0 `[STOP]`, 0 zgłoszeń detektorów, 0 decyzji niewycenionych;
  klikane akcje rodziny (plot/warp/zawieszenie) i oferta darmowego rzutu
  z wygnania renderowana w panelu; talia tymczasowa usunięta po biegu.
- Sondy w partiach: PRZED 24 decyzje z ofertą rodziny / 6 plotów → PO 28 / 1 plot
  (4 flipy „plot → rzut tą samą kartą", wszystkie w oknach zdemaskowanych przez
  S6); wypłata odroczenia domyka się: PO 5 odroczeń / 5 rzutów z wygnania /
  0 kart czekających w wygnaniu na koniec partii.
- Pełny B0 **nie uruchamiany** (ADR 0018).

**Wniosek:** rodzina odroczeń ma teraz cenę (koszt akcji + zwłoka), wypłatę
liczoną z karty (nie z pustego 0/0) i dostępność czytaną z OFERTY silnika
(`castOfferedNow`), a jedyny przypadek nadużycia uprawnienia (pieczęć przeżywająca
zmianę strefy) jest naprawiony u źródła. Następne w kolejce: koszt okazji drugiego
trybu źródła, bankowanie many, `cast_spell` warianty — każda z nowym dowodem.
