# Plan 2026-10-08 — zgłoszenie H: Krumar Initiate, „endure X" co kolejkę 1/1 za 1 życie

- **Gałąź:** `arena/6b9bb8b8-mtg`, PR #158
- **Zgłoszenie właściciela (dosłownie):** „Karta Krumar Initiate. „{X}{B},
  {T}, Pay X life: This creature endures X. Activate only as a sorcery. (Put X
  +1/+1 counters on it or create an X/X white Spirit creature token.)" Bot co
  kolejkę tworzy za 1 życia spirit 1/1. Co kolejkę ten token ginie. Niby
  wielkiej straty nie ma, bo zablokował mnie i nie stracił życia, ale ta karta
  mogłaby być lepiej wykorzystana. Mógłby stworzyć potwora typu 5/5 który
  zblokowałby wszelkie moje stwory (zamiast 5 razy tworzyć 1/1 za te same 5
  życia stworzyłby 5/5) albo mógłby siebie dopakować +3/+3 counterami i mieć
  ten sam efekt. Tak myślę, że optymalnie to byłoby stworzyć spirit token albo
  siebie dopakować tak, żeby mieć kreaturę o power większym niż toughness
  mojego największego stwora albo toughness większy niż power mojego
  największego stwora (do blokowania). W każdym razie tworzenie co kolejkę 1/1
  za 1 życia jest wielce nieoptymalne. Oczywiście trzeba tak to robić, żeby nie
  zabić siebie -> pewnie treshhold np. nie więcej płacę niż 25% mojego życia
  jest konieczny."

Karta w katalogu (`src/cards/card-data.js:6627`): koszt `{manaX, mana: 1,
colors: ['B'], tap: true, payLifeX: true}`, `timing: 'sorcery'`, efekt
`{type: 'endure_x'}` — pełna obsługa (ADR 0022), problem jest wyłącznie w
WYCENIE bota.

## Diagnoza (przed kodem)

Pomiar sondą (`.arena/probe-h-krumar.mjs`, prawdziwa karta, mana 9, życie 20):

| oferta | score PRZED | uwaga |
|---|---|---|
| `activate_ability(kru#0)` X=1 | **0,5** | wybór bota |
| X=2..8 | 0 | identyczna nota — X nie ma wyceny |

Cztery przyczyny, wszystkie w `src/controllers/heuristic-bot.js`:

1. **Efekt `endure_x` nie miał wpisu w gałęzi `activate_ability`.** Jedynym
   składnikiem zależnym od X była kara za manę (`min(X,2) * 0,5`, stropiona na
   X=2), więc X=1 wygrywało ZAWSZE — niezależnie od tego, co jest na stole.
2. **Koszt „Pay X life" nie był wyceniony NIGDZIE** (CR 601.2h — koszt, nie
   efekt), więc płacenie 1 i 8 życia wychodziło po samo.
3. **Wybór trybu (`resolve_endure_choice`) był płaski** — 42 (token) / 40
   (liczniki) niezależnie od N.
4. **Warianty X były nierozróżnialne w śladzie** — wszystkie streszczały się do
   `activate_ability(kru#0)` (klasa L34/L40, ta sama lekcja co M195/B,
   M203/2, PMSSB-41/C), więc nie dało się zmierzyć, który X bot wybiera.

Sonda `.arena/probe-h2.mjs`: w katalogu kształt „efekt `endure_x`" mają tylko
dwie karty — `krumar-initiate` (aktywacja, koszt `payLifeX`) i
`descendant-of-storms` (trigger „attacks", kwota stała 1, wyceniany tabelą
ETB/triggera). Fix dotyka więc wyłącznie aktywacji Krumara.

## Fix

1. **`endureBodyValue(view, size)` — JEDNA miara ciała** (obok
   `untapTargetValue`, ~4260). Cel ROZMIARU to ciało przeżywające największe
   ciało przeciownika: `need = max(P, T) wroga + 1` — dokładnie reguła
   właściciela („power większy niż toughness mojego największego stwora albo
   toughness większy niż power"). Punkty do `need` mają pełną wagę ciała
   (P×2 + T×1, L41); powyżej `need` rozmiar waży MNIEJ niż koszt życia za
   punkt (`endureOversizeWeight` 1 vs 2) — bot rośnie do celu, nie do limitu
   many. Gdy przeciwnik nie ma ciał, celem jest bezpieczny budżet życia
   (`lifePayThreshold`) — inaczej karta degraduje do „1/1 za 1 życie co
   kolejkę", czyli dokładnie do zgłoszenia.
2. **`endureXValue(view, x, source)` = LEPSZY z trybów** (CR 701.63a):
   liczniki na ŹRÓDLE (rozmiar = źródło + X) albo token X/X (rozmiar = X).
   Dla źródła 2/2 i wrogiej 5/5 liczniki dają 6/6 już za X=4, a token dopiero
   5/5 za X=5 — ten sam efekt za mniej życia (druga połówka uwagi
   właściciela: „siebie dopakować +3/+3 counterami i mieć ten sam efekt").
3. **Koszt „Pay X life"** (blok kosztu obok kary za manę): wspólna drabina
   samouszkodzenia `selfLifeLossPenalty` (PMSSB-36, L41 — 1000 przy
   samobójstwie, 80/15× przy niskim życiu) PLUS próg 25% puli
   (`payLifeXThreshold`) z karą `payLifeXOverThresholdPenalty` za każdy punkt
   powyżej progu. Bot nigdy nie płaci więcej, niż bezpiecznie może.
4. **`resolve_endure_choice` liczy ciało z N** — nowe pole widoku
   `pendingEndures` (`game-state.js`, wzorzec `pendingExploits`, ADR 0017/L48:
   N jest informacją publiczną — X wybiera gracz jawnie, komenda przechodzi
   przez stos) + premia `endureTokenBodyPremium` za DRUGIE ciało. Ta sama
   miara co przy wyborze X (L41) — inaczej aktywacja wybierała X pod liczniki,
   a rozstrzyganie robiło mniejszy token.
5. **Tap źródła w precombat** płaci `tapBodyCost` (L41) — atak w tej turze.
   Kara dodatkowa za „odroczenie do main2" została PRZETESTOWANA i ODRZUCONA:
   wartość ciała (19–30 pkt) przewyższa stracony atak 2/2 (~4 pkt), więc
   fixed-point penalty albo nic nie robi, albo gwałcię aktywację — a tap
   źródła i tak jest już wyliczony.
6. **Ślad rozróżnia warianty**: `activate_ability(...,X=n)` i
   `resolve_endure_choice(tryb)`.

Klasa awarii to **L50/L131** (rodzina: efekt bez wyceny + wariant oferty bez
różnicy w notacji) — konkretniej: „skalowany efekt nie miał wyceny, więc
jedynym składnikiem zależnym od X był koszt". WPIS do `docs/LESSONS.md` celowo
NIE dodany (budżet lektury startowej — ten sam rachunek co w planach F i G).

## Cytaty CR (ADR 0030 — tylko z fetch)

Plik CR: mirror `nwgarne/mtg-data` (`gh api .../contents/rules/cr-raw.txt`),
SHA-256 `8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca` —
identyczny z zarejestrowanym w `test/helpers/cr-numery-tabela.js` (wydanie
2026-09-25). Dosłowne:

- **701.63a** „Certain abilities instruct a permanent to endure N. To do so,
  that permanent’s controller creates an N/N white Spirit creature token
  unless they put N +1/+1 counters on that permanent.” → dwa tryby, wybór
  kontrolera; rozmiar obu zależy od N.
- **701.63b** „If a permanent is instructed to endure 0, nothing happens. No
  counters are put on that permanent and no tokens are created.” → X=0 nic nie
  robi (silnik i tak oferuje X≥1).
- **601.2h** „The player pays the total cost. First, they pay all costs that
  don’t involve random elements or moving objects from the library to a public
  zone, in any order. …” → „Pay X life" to KOSZT, płacony przed efektem.
- **118.4** „Some costs include an {X} or an X. See rule 107.3.” → X w koszcie
  aktywacji wybiera gracz.
- **302.6** „A creature’s activated ability with the tap symbol or the untap
  symbol in its activation cost can’t be activated unless the creature has been
  under its controller’s control continuously since their most recent turn
  began. …” → świeże źródło nie może się tapnąć (tapBodyCost = 0).

Numery `701.63a/b`, `601.2h`, `118.4`, `302.6` są już w tabeli — brak nowych
wpisów.

## Kroki

- [x] **H/0** — diagnoza + pomiar przed fixem (sondy `.arena/probe-h-krumar.mjs`,
      `.arena/probe-h2.mjs`).
- [x] **H/1** — `endureBodyValue` / `endureXValue` + koszt „Pay X life" z progiem
      25% (`heuristic-bot.js`, `heuristic-params.js`).
- [x] **H/2** — `resolve_endure_choice` po N + pole widoku `pendingEndures`
      (`game-state.js`).
- [x] **H/3** — etykiety wariantów w śladzie (`,X=n` i `(tryb)`).
- [x] **H/4** — pomiar po fixie (sondy `.arena/probe-h-krumar.mjs`,
      `.arena/probe-h3.mjs` — E2E).
- [x] **H/5** — testy H/1–H/6 w
      `test/zgloszenie-h-krumar-initiate-endure-x.test.js` (RED→GREEN + dowód
      mutacyjny).
- [x] **H/6** — bramka fast + build zielone, commit, push, opis PR.
- [x] **H/7** — dokumentacja: ten plan, `PROJECT_HISTORY.md`, handoff sesji.

## Pomiar po fixie

E2E (`.arena/probe-h3.mjs`, bot wybiera wariant, silnik go wykonuje, bot
rozstrzyga tryb):

| scena | PRZED | PO | efekt |
|---|---|---|---|
| wróg 5/5, życie 20, main1 | X=1, token 1/1, 1 życie | **X=4, liczniki, źródło 6/6, 4 życia** | przeżywa 5/5 |
| wróg 5/5, życie 20, main2 | X=1 | X=4, 6/6, 4 życia | jak wyżej |
| pusty stół, życie 20 | X=1 | **X=3, źródło 5/5, 3 życia** | nie 1/1 za 1 życie |
| wróg 2/2, życie 20 | X=1 | **X=1, 3/3, 1 życie** | minimum potrzebne |
| wróg 4/4, życie 20 | X=1 | **X=3, 5/5, 3 życia** | minimum potrzebne |
| wróg 8/8, życie 40 | X=1 | **X=7, 9/9, 7 życia** | need = 9 |
| życie 8, wróg 2/2 | X=1 | **X=1, 3/3** | próg 25% = 2, X=1 wystarcza |
| życie 4 (X=8 = samobójstwo) | — | **pass / X ≤ 1** | drabina samouszkodzenia |

W każdym scenariuszu X jest MAKSIMALNIE tyle, ile potrzebne, by przeżyć
największe ciało wroga, i MINIMALNIE tyle — bot nie przepłaca życia.

## Dowód mutacyjny (testy H muszą łapać usunięcie fixa)

| mutacja | pass / fail | co łapie |
|---|---|---|
| mH1: `endureBodyValue` → `4 * size` (dawny wpis ETB) | 2 / **9** | cały fix — X=1 znowu wygrywa |
| mH2: `payLifeXThreshold: 1` (próg 100%) | 10 / **1** | H/3 — próg 25% puli |
| mH3: `resolve_endure_choice` → płaskie 42/40 | 8 / **3** | H/1b, H/6, H/6b — tryb po N |
| mH4: bez `,X=n` w etykiecie śladu | 5 / **6** | H/1, H/3, H/4, H/5, H/6c — warianty nierozróżnialne |
| mH5: bez kar za życie w koszcie | 3 / **8** | H/1–H/5, H/6c — koszt „Pay X life" |
| mH6: bez kosztu tapa źródła | 10 / **1** | H/5 — atak w precombat |

Po przywróceniu kodu: 11/11.
