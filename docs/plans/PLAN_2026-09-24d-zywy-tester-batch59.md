# Plan sesji 2026-09-24d — Żywy Tester na kartach batcha 59 + klasa „kwota alt-kosztu"

**Gałąź:** `arena/01a0d408-mtg` · **PR:** #136 (ten sam PR sesji, opis uzupełniany
kumulatywnie) · **Baza:** `c805674` (batch 59 zamknięty, bramy 6511/6511)

**Zlecenie właściciela (2026-09-24, po domknięciu batcha):**
1. raport: do których talii trafiły karty batcha i czy były przetasowania;
2. Żywy Tester **celujący w karty batcha** — ocena zgodności z CR oraz
   poprawności taktycznej zagrań bota; raport dla właściciela.

## Rozpoznanie (wykonane przed tym plikiem)

- **Ad 1** — `git diff f9bc44b..c805674 -- decks/ README.md`: 7 talii, wyłącznie
  DOŁOŻENIA kart batcha + wyrównanie landów (bez usunięć nie-basiców i bez
  przenosin między taliami); liczby w tabeli raportu.
- **Ad 2** — tester na taliach standardowych (8 partii A–H) pokazał tylko
  4 z 10 kart (karty 1-of w taliach singletonowych rzadko wychodzą), więc audyt
  celowany zrobiono na tymczasowej talii `decks/audyt-batch59.txt`
  (2× każda z 10 kart + 4× każdy basic, ~50% landów): **8 partii P1–P6 (bot gra
  talią audytową) i Q1–Q2 (gracz)** po 700 kroków — 8× naturalny koniec,
  8× „DETEKTORY: brak zgłoszeń", 8× „NIEWYCENIONE: brak".

## Znaleziska audytu (dowody z transkryptów `/tmp/zb-*.txt`)

| # | znalezisko | dowód | klasa |
| --- | --- | --- | --- |
| F1 | **Join the Dance: flashback za mało o {1}** — `spell.flashback.cost = 4`, a druk to `{3}{G}{W}` = **5** | transkrypt P1: „Join the Dance" + 4 tapnięcia (G, W, W, B); test B59/G1.4 sam twierdzi „{3}{G}{W} = 4 many" | błąd DANYCH + test konserwujący błąd |
| F2 | **Etykieta flashbacku gubi pipy** — `(koszt 1)` dla {G}, `(koszt 4)` dla {3}{G}{W} | `>> Flashback: Memory's Journey (koszt 1)`, `>> Flashback: Join the Dance (koszt 4)` | błąd WARSTWY ETYKIET (M151/M267/M268 — reszta rodziny używa `costSymbols`) |
| F3 | **Boulder Salvo (batch 58): surge za dużo o {1}** — `surge.cost = 3`, a druk to `{1}{R}` = **2** (ten sam skan co F1, karta spoza batcha 59) | `docs/cards/scryfall-boulder-salvo.json`: „Surge {1}{R}"; test B58/B1: „surge płaci 3 many" | błąd DANYCH + test konserwujący błąd |
| — | bez zastrzeżeń: Bird Admirer // Wing Shredder (702.145: dzień przy wejściu, noc → obrót, atak 4/5 z aurą), Charismatic Vanguard (611.2c — 4 stwory w chwili rozstrzygnięcia), Scavenging Harpy (603.3d brak celu + wygnanie karty z grobu bota), Waveskimmer Aven (egzaltacja), Slithering Cryptid (Mutagen: token, +1/+1, tylko jak sorcery), Sun-Collared Raptor ({2}{R}, trample), Savage Hunger (+1/+0, trample, cycling {2}), Kumano's Blessing (błysk, podmiana przy śmierci) | transkrypty P1–Q2 | — |
| — | **luki pokrycia** (nie defekty): efekt zastępczy Kumano's Blessing nie zszedł ani razu „na żywo" (brak śmierci zaczarowanego stwora po zadaniu obrażeń), obrót wrócił tylko w stronę nightbound; oba warianty mają testy jednostkowe | grep transkryptów | — |

**Przyczyna wspólna F1/F2/F3:** przekonanie, że `cost` deskryptora to część
GENERYCZNA, a nie SUMA symboli (`costSymbols(amount, colors)` liczy
`generic = amount − pips.length`). Stąd i zaniżona kwota w danych, i etykieta
z gołym `{N}`. Komentarz w `render.js` („escape.cost = {generic}") utrwalał ten
błąd.

## Etapy (kolejność commitów)

- [x] **A0** — ten plan (commit przed kodowaniem, ADR 0020).
- [x] **A1 (dane + detektor):** `join-the-dance` flashback 4 → **5**,
      `boulder-salvo` surge 3 → **2**; skan Oracle↔definicja **całej rodziny
      alt-kosztów po SYMBOLACH** (nie tylko pipach, jak M268) — nowy
      `test/audyt-m428-kwota-alt-kosztu.test.js`; korekta twierdzeń w
      `test/real-cards-batch{58,59}.test.js`, które konserwowały błąd.
- [x] **A2 (etykiety):** `render.js` — oba miejsca etykiety flashbacku przez
      `costSymbols(cost, colors)` + usunięcie komentarza „escape.cost =
      {generic}"; piny etykiet w A1-owskim pliku testowym.
- [x] **A3 (dokumentacja):** M428 w `docs/PROJECT_HISTORY.md` i
      `docs/ENGINE_MILESTONES.md`, lekcja **L168** + narracja w
      `docs/LESSONS_PRZYPADKI.md`, domknięcie tego planu, handoff sesji.
- [x] **A4 (sprzątanie):** usunięcie tymczasowej `decks/audyt-batch59.txt`
      (łamie strażniki talii) i przebudowa `dist/`; raport dla właściciela
      (tabela talii + tabela znalezisk).

## Bramy i ryzyka

- Bramy po KAŻDYM etapie: `npm test` + `npm run build` (inkrementalne commity,
  ADR 0020 pkt 3); na koniec `npm run test:all`.
- Ryzyko: zmiana kwoty alt-kosztu rusza ofertę i płatność → sprawdzić, że
  Boulder Salvo **nie** jest oferowany przy samej manie {1}{R} bez innego czaru
  i że Join the Dance nie jest oferowany przy 4 manie; oraz że etykiety nie
  mają gołego `{N}` (piny jak M268/label).
- Ryzyko: skan symboli ma jeden celowy wyjątek — `cleave` trzyma kwotę
  w `manaCost` (nie `cost`), a `morph` w ogóle pomijamy (dwa koszty, L104/1).

## Podsumowanie wykonania

- **Commity:** `436b4ad` (A0 plan), `990b5f0` (A1 dane + skan symboli + piny
  batchy 58/59), `aff9597` (A2 etykiety flashbacku + piny etykiet), A3 (ten
  wpis + M428 + L168 + handoff 24d).
- **Znaleziska:** F1 `join-the-dance` flashback 4 → **5**; F2 etykieta
  flashbacku bez pipów (oba miejsca `render.js`); F3 `boulder-salvo` surge
  3 → **2** (ta sama klasa, karta z batcha 58).
- **Detektor:** `test/audyt-m428-kwota-alt-kosztu.test.js` — 8 testów: skan
  Oracle↔definicja po CAŁYM napisie dla rodziny alt-kosztów, jawna lista
  pominiętych kart (adventure), dowód RED na obu znaleziskach, piny etykiet
  (grupa + komenda).
- **Sprzątanie:** `decks/audyt-batch59.txt` usunięta (strażniki talii znów
  zielone), `dist/` przebudowany.
- **Bramy:** `npm test` 6519/6519 (0 fail), build 60 modułów / 4241,6 kB.
- **Raport dla właściciela:** tabela talii + tabela znalezisk w tym pliku oraz
  w czacie (sesja 24d); opis PR #136 uzupełniony kumulatywnie.
