# PLAN 2026-11-16 — PMSSB-91: celowana pętla ręcznego strojenia scoringu bota (Batch 74, karty 656–665)

Data z `date -u` w chwili pisania planu. Gałąź sesji: `arena/b87ffeb4-mtg`, PR **#187**,
HEAD startowy `e66fdcb` (po Etapie 3: definicje kart 656–665 + przelosowane talie).

## 0. Zlecenie właściciela (dosłownie, z roadmapy Batcha 74)

> „Nie potrzebuję ani pełnego BO ani tuningu. Wystarczy mi uczciwy PMSSB, czyli Pętla
> MANUALNEGO Strojenia Scoringu Bota. Czyli weryfikacja z punktu widzenia pro-playera MtG
> czy karta jest rzucana przez Bota w optymalnym momencie (tura, faza), w optymalny cel,
> w kontekście aktualnego stanu gry (co na stole, jaka ręka, jaka biblioteka, jaki cmentarz)
> itd." — `docs/plans/PLAN_2026-11-16-batch74-kolekcja-656-665.md` §Etap 4.

Bez pełnego B0 (ADR 0018) i bez maszynowego tuningu (`npm run tune-bot`). Produkt:
odpowiedź **(T)** moment / **(C)** cel / **(S)** kontekst stanu per karta, z pomiarem
przed→po i pinami RED→GREEN.

## 1. Po co NOWA sonda, skoro działa PMSSB-90

PMSSB-90 (`tools/pmssb90-batch73-petla-sonda.mjs`) jest harnessem dla Batcha 73 — jego
`SCENARIUSZE` są przybite do kart 645–655 i do ówczesnego kształtu talii. Batch 74 dokłada
**cztery klasy decyzji, których tamten harness nie modeluje**:

1. **koszt aktywacji płacony `{T}` źródła w turze przeciwnika** (Saltfield Recluse) —
   wymiar okna jest tu *silniejszy* niż przy instantach: zdolność zużywa ciało na stole;
2. **koszt poświęcenia WŁASNEGO permanentu z produkcją many** (Memorial to Genius, Temur
   Banner) — kolizja „mana dziś” vs „karta w ręce”, z progiem bezpieczeństwa biblioteki;
3. **trigger modalny na wejściu** (Gylwain — wybór jednej z 3 Ról) — decyzja podejmowana
   w oknie `resolve_modal_choice`, nie w `main`; harness musi rozliczać stos (`rozliczStos`);
4. **stan gracza zmieniany przez kartę** (Rad counters, Mirelurk Queen) — wymiar „kogo
   dotknąć” jest asymetryczny (przeciwnik vs własna głowa) i musi mieć własne warianty.

Dlatego sonda PMSSB-91 jest **nowym plikiem** (nie rozszerzeniem PMSSB-90): inny zestaw kart,
inny czytnik stanu (`radCounters`, `attachedTo`, `attachedRole`), a scenariusze PMSSB-90
muszą zostać odtwarzalne w stanie, w którym je zamrożono (L24: skutek bez śladu nie istnieje).

## 2. Zakres — 10 kart i ich okna (z Oracle, nie z pamięci)

| artId | Karta (`id`) | Typ/koszt | Okno decyzji (hipoteza do ZMIERZENIA) |
|---|---|---|---|
| 656 | Grollub (`grollub`) | Creature 3/3 `{2}{B}` | rzut/atak/blok: heal przeciwnika przy każdym obrażeniu |
| 657 | Saltfield Recluse (`saltfield-recluse`) | Creature 1/2 `{2}{W}` | `{T}`: `-2/-0` do końca tury — własna tura (walka) vs tura przeciwnika |
| 658 | Memorial to Genius (`memorial-to-genius`) | Land | `{4}{U},{T},Sac: draw 2` — kiedy poświęcić źródło many |
| 659 | Gylwain, Casting Director (`gylwain-casting-director`) | Legend 2/3 `{1}{G}{W}` | trigger ETB → tryb Roli (Royal/Sorcerer/Monster) |
| 660 | Lambholt Harrier (`lambholt-harrier`) | Creature 2/2 `{1}{R}` | `{3}{R}`: `cant_block` — tylko przed deklaracją blokerów |
| 661 | Arrow Storm (`arrow-storm`) | Sorcery `{3}{R}{R}` | main1 (4 dmg) vs main2 po ataku (Raid → 5 dmg, nieprewencyjne) |
| 662 | Loxodon Partisan (`loxodon-partisan`) | Creature 3/4 `{4}{W}` | battle cry — czy `declare_attackers` widzi `+1/+0` współatakujących |
| 663 | Temur Banner (`temur-banner`) | Artifact `{3}` | trzymać jako rampę vs poświęcić na draw |
| 664 | Frilled Sea Serpent (`frilled-sea-serpent`) | Creature 4/6 `{4}{U}{U}` | `{5}{U}{U}`: `cant_be_blocked` na sobie — koszt 7 many |
| 665 | Mirelurk Queen (`mirelurk-queen`) | Creature 4/4 `{4}{U}` | ETB: rad counters — na kogo; synergia z wcześniejszym millem |

## 3. Kroki (procedura `docs/PMSSB.md`, checklist 0–7)

- [x] **0. Plan** — ten plik, commit + push PRZED jakimkolwiek kodem wyceny (ADR 0020 A).
- [x] **1. POMIAR PRZED** — `tools/pmssb91-batch74-petla-sonda.mjs` (commitowana; harness
      skopiowany z PMSSB-90 z poprawkami H-1…H-7, plus nowe czytniki: rad counters,
      Role na permanentach, `attackedThisTurn`). Per karta ≥4 scenariusze zmieniające JEDEN
      wymiar, realistyczna mana (nie `richMana`), ≥2 kandydatów na cel, wydruk: wybrana
      komenda, jej score, score alternatyw, faza/tura, stan (stół/ręka/biblioteka/grób/życie).
      Zrzuty `.arena/pmssb91-przed.{json,log}`.
- [x] **2. AUDYT** — macierz kierunek × cel × timing × stan → findingi **F-91/x**, obowiązkowe
      kontrole: (a) L41 — `cast_spell`/`cast_permanent`/`activate_ability`/modalny trigger
      liczą to samo; (b) S11 — koszt many różnicuje (7 many Frilled vs 3 many Harrier);
      (c) anty-over-fix M429 — najsłabszy realny wariant = dawna wartość, nowe wymiary to kary.
- [x] **3. IMPLEMENTACJA** — rodziny w `src/controllers/heuristic-params.js` (preferowane
      istniejące: `evasion*`, `sacrifice*`, `tap*`, `remove*`, `battleCry*`) + wspólne helpery
      w `heuristic-bot.js`. NIGDY po `cardId` (ADR 0002).
- [x] **4. TESTY** — `test/audyt-pmssb91-batch74.test.js`: piny RED→GREEN per finding,
      anty-over-fix, pokrętła ×0 (`params` = 0 przywraca dawną wartość), dowód mutacyjny.
- [x] **5. EWALUACJA** — `tools/bot-scoring-snapshot.mjs` (CEL: bez regeneracji; jeśli dryf —
      ślad per para i uzasadnienie), `tools/bot-tie-audit.mjs --gry=2`, mirror-eval reguł vs ×0,
      Żywy Tester na taliach z batchiem 74.
- [x] **6. DOKUMENTACJA** — raport §PMSSB-91 w `docs/PMSSB.md`, wiersz w rejestrze rodzin,
      `docs/PROJECT_HISTORY.md`, kamień milowy `docs/ENGINE_MILESTONES.md`, opis PR #187.
- [x] **7. BRAMY** — `npm run test:all`, `npm run build`, `node tools/cr-numery.mjs`,
      `node tools/bot-tie-audit.mjs --gry=2`.

## 4. Krok 1–2: POMIAR PRZED i audyt (wykonane 2026-11-16)

Sonda `tools/pmssb91-batch74-petla-sonda.mjs` (commitowana): **23 scenariusze / 96 rekordów /
10 kart**, wymiary T (moment), C (cel), S (kontekst), K (koszt). Zrzuty (trwałe): `docs/audits/PMSSB91_POMIAR_PRZED_2026-11-16.{json,txt}`, `PMSSB91_POMIAR_PO_2026-11-16.{json,txt}` i `PMSSB91_TABELA_PRZED_PO_2026-11-16.txt` (96 rekordów, 6 zmienionych = wyłącznie wiersze findingów; żadnych skutków ubocznych). Harness = kopia H-1…H-7 z PMSSB-90
+ trzy rozszerzenia czytnika stanu (`rad`, `attackedThisTurn`, `ATAKUJE`/`BLOKUJE`) + helper
`deklarujAtak` (odsiewa nielegalnych atakujących, zamiast wywalać pomiar wyjątkiem silnika —
bez niego scenariusz „atak w mur 0/4" kończył się crashem, nie pomiarem).

### Findingi (macierz kierunek × cel × timing × stan)

| # | Karta / rodzina | Wymiar | Pomiar PRZED | Status |
|---|---|---|---|---|
| F-91/1 | **Saltfield Recluse** (`pump` ujemny, aktywacja) | C | `-2/-0` na atakującym wroga: 4/4 → **35,00**, 1/1 → **35,00**, 2/2 → 42,00, 6/7 → **35,00**. Wartość NIE zależy od tego, ile obrażeń realnie zdejmuje: 2/2 (zdejmuje 2, zabija w symulacji bloku) = 42, a 6/7 (zdejmuje 2 z 6) = 35 — a 1/1 (zdejmuje 1) też 35. `negativePumpValue` liczy `4 × \|Δpower\|`, nie `4 × min(\|Δpower\|, moc atakującego)`. | FALA A |
| F-91/2 | **Frilled Sea Serpent** (`cant_be_blocked`, `applyTo: 'self'`) | S | Aktywacja za 7 many: **39,00 identyczne** przy pustym stole wroga, blokerze 4/4 (ginie), blokerze 6/7 (zabija Serpenta) i ścianie 8/8. Brak bramki „czy jest czym blokować" — wzorzec `attackerCanBeBlocked` istnieje już w gałęzi ETB `cant_be_blocked` (`heuristic-bot.js:3046`). Bot płaci 7 many, gdy nie kupuje NIC. | FALA A |
| F-91/3 | **Arrow Storm** (`damage` + `amountIfRaid`) | T | main1 bez Raidu, cel 5/5: bot RZUCA (13,00 > pass 0) za 4 obrażenia, które nie zabijają. main2 z Raidem na tym samym celu: 55,00. Brak mechanizmu „trzymaj do ataku" — `holdForAddendum` (wzorzec Addendum, ta sama klasa: niższa/niepełna liczba obrażeń) istnieje, dla Raidu nie. | FALA A |
| F-91/4 | **Mirelurk Queen** (`add_rad_counters`) | S | ETB rad: score **7,81 identyczny** przy wrogu 20/20, 5 życia i cienkiej bibliotece (4 karty). Wartość płaska `4 × amount`; wymiar „presja na życie / deck-out" nie istnieje. | FALA B (dokumentacja) |
| F-91/5 | **Mirelurk Queen** (trigger `nonland_cards_milled`) | K | `repeatLibraryDrain` traktuje trigger jak POWTARZALNE źródło własnego doboru i karze pełną drabiną: biblioteka 30 → 78,01; 20 → **7,81**; 12 → **−35,39** (bot odmawia). Warunek triggera jest ZEWNĘTRZNY („one or more nonland cards are milled" — mielenie kogokolwiek), a karta sama go nie generuje poza rad-licznikami na wrogu. | FALA B (dokumentacja) |
| F-91/6 | **Memorial to Genius** / **Temur Banner** (`sacrificeSelf` + draw) | T | Poświęcenie na dobranie: **8,00** (Memorial) i **4,00** (Banner) w KAŻDYM kroku własnej tury — main1, main2, beginning_of_combat, declare_blockers, end. Brak premii za end step przeciwnika i brak kary za main1 (traci źródło many do końca tury). Wzorzec `looksAtOwnLibraryOnly` (M211/A1) dotyczy scry, nie sac-draw. | FALA B (dokumentacja) |
| F-91/7 | **Gylwain** (3 tryby Roli) | C | Tryby różnicują się o 0,35–1,10 pkt (Monster 16,30 / Royal 15,95 / Sorcerer 15,20), ale **Monster nie rośnie** przy stole 3× 1/1 (chump-block pewny) wobec pustego stołu — brak wymiaru „trample vs chump-blockerzy". Wybór trybu wynika z ogólnej wyceny `create_token`, nie z reguły per tryb. | ZAAKCEPTOWANE (pomiar zapisany) |
| F-91/8 | **Loxodon Partisan** (battle cry) | T | `declare_attackers` widzi `+1/+0`: Partisan sam 14,00; +2/2 → 20,00; +2× 1/1 → 24,00; pełny zestaw +2/2+1/1 → 30,00. Kontrola pozytywna PMSSB-62/F7 DZIAŁA — bez findingu. | ZWERYFIKOWANE |
| F-91/9 | **Grollub** (trigger `dealt_damage`) | S/C | Atak: pusty stół 14,00; ściana 0/4 → **−2,00** (bot nie atakuje); 5/5 → −10,00. Rzut: pusty stół 67,50; wróg 2/2 → 71,10. Wymiar healu wroga jest widoczny. | ZWERYFIKOWANE |
| F-91/10 | **Lambholt Harrier** (`cant_block`) | T/C | main1 2,00 / początek walki 2,00 / po walce i w turze własnej main2: brak oferty powyżej passu. Cel: odkręcony 4/4 → 8,00; tapnięty → brak oferty; własny → −22,00. Działa. | ZWERYFIKOWANE |
| F-91/11 | **Memorial/Banner** vs deck-out | S | Biblioteka 1 → −124,00, 2–3 → −64,00, 5 → −64,00, 20 → +8,00. Drabina `libraryDeckingPenalty` chroni przed samobójstwem. | ZWERYFIKOWANE |

### Kontrole obowiązkowe procedury

- **(a) L41** — znaleziony rozjazd: `cant_be_blocked` na CELU (ETB) filtruje kandydatów przez
  `attackerCanBeBlocked`, a ta sama instrukcja na SAMYM źródle (`applyTo: 'self'`, Frilled) nie
  filtruje niczego → dwa różne wyniki dla tej samej zdolności (F-91/2).
- **(b) S11 (koszt)** — namierzony: aktywacja Frilled za 7 many ma tę samą wartość co nic
  (39,00 na pustym stole) → koszt nie różnicuje, bo nie ma czego różnicować (brak bramki).
  Po naprawie: 7 many przy braku realnego blokera schodzi pod pass.
- **(c) anty-over-fix M429** — wszystkie trzy naprawy Fali A mają postać KARY/DOPŁATY
  (nowe pokrętła domyślnie włączone, wyzerowanie przywraca dawną wartość), nie nowej skali.

## 5. Pytania pro-playera per karta (hipotezy — do ZMIERZENIA, nie do założenia)

**656 Grollub.** T: czy bot rzuca 3/3 za 3, gdy potrzebuje blokera, a nie wystawia go w
wyścigu z tanimi blokami, gdzie każdy atak leczy wroga? C: czy przy bloku wybiera wymianę
dającą mu zysk (zabija + heal jest kosztem wroga = neutralny), a nie darmowy heal bez zabicia?
S: czy `gain_life` z `amountFrom: 'damageAmount'` na `each_opponent` jest w ogóle wyceniana
(nowa ścieżka Etapu 2A — grozi „niewycenione”)? Bonus: czy przy własnym Grollubie bronionym
bot nie „leczy” wroga blokiem bez wartości.

**657 Saltfield Recluse.** T: czy `{T}` `-2/-0` nie idzie w `main1`/`main2` własnej tury
(efekt wyparuje), a w oknie ataku przeciwnika / przed blokerami? C: cel = atakujący o mocy ≥2,
nigdy własny stwór, nigdy moc 0/1. S: czy przy niskim życiu wybiera największe nieblokowane
obrażenia; czy przy braku atakujących wcale nie tapuje.

**658 Memorial to Genius.** T: czy poświęcenie ląda idzie na koniec tury przeciwnika (instant-
speed sink) zamiast w `main1` (traci źródło many na resztę tury)? S: przy manascrew — nie
poświęca; przy pustej ręce i 6+ lądach — tak; przy bibliotece ≤ 5 — kategorycznie nie (deck-out).

**659 Gylwain.** T: czy w `main1` najpierw wystawia Gylwaina (drugi stwór też dostanie Rolę)?
C: tryb Roli — Royal przy otwartej manie wroga / cennym stworze; Monster dla dużego stworu przy
chump-blokerach; Sorcerer przy słabej ręce i bezpiecznym ataku; oraz brak dublowania `trample`.
S: czy SBA CR 303.7 (jedna własna Rola na stworze) jest odzwierciedlona w wycenie trybu.

**660 Lambholt Harrier.** T: `cant_block` tylko przed deklaracją blokerów, nigdy w `main2`/
turze przeciwnika. C: najgroźniejszy odkręcony bloker, nigdy tapnięty/własny. S: nie płaci
`{3}{R}` przy pustym stole.

**661 Arrow Storm.** T: atak NAJPIERW (Raid), strzał w `main2` = 5 dmg nieprewencyjne
(wyjątek: `main1` na blokera ≤4 toughness, bez którego atak nie przejdzie). C: cel o
toughness 5 osiągalny tylko po Raid; nie strzela 4 w 5/5; tarcze prewencji/protection przy Raid.
S: nie marnuje 5 many na token 1/1 przy pustym stole wroga.

**662 Loxodon Partisan.** T/S: czy `declare_attackers` uwzględnia `+1/+0` battle cry dla
współatakujących (np. 2/2 → 3/2 przebija blokera 2/3). C: przy szerokim stole preferuje
Partisana nad innym 5-manowym permanentem.

**663 Temur Banner.** T: rampa wcześnie, poświęcenie wyłącznie na end stepie przeciwnika /
pod pilną odpowiedź. S: przy ręce wymagającej kolorów — trzyma; przy floodzie — wymienia;
przy bibliotece ≤ 4 — nie.

**664 Frilled Sea Serpent.** T: `cant_be_blocked` wyłącznie własne `main1`/beginning_of_combat,
gdy Serpent może atakować. S: 7 many ma sens TYLKO przy realnym blokerze; przy pustym stole
wroga = 0. Kontrola S11: koszt musi być widoczny w score.

**665 Mirelurk Queen.** C: rad counters ZAWSZE na przeciwnika (obaj są legalni!). S: czy
pierwszy nonland mill w turze (draw + `+1/+1`) jest wyceniany; czy bot nie dobiera sam siebie
na pustą bibliotekę.

## 6. Wynik pętli

Wypełniane w krokach 2–7 poniżej (tabela findingów + statusy + bramy). Ten plan jest
artefaktem procesu: kolejny agent czyta raport §PMSSB-91 w `docs/PMSSB.md` i piny w
`test/audyt-pmssb91-batch74.test.js`, nie ten plik.

## 6. Wynik pętli (krok 7 domknięty, 2026-11-16)

| Fala | Findingi | Status | Dowód |
|---|---|---|---|
| A (naprawy) | F-91/1 cap mocy debuffu; F-91/2 bramka ewazji samo-celu; F-91/3 hold-for-Raid; F-91/5 trigger o warunku zewnętrznym | **NAPRAWIONE** | piny 1a–1c, 2a–2d, 3a–3f, 5a–5c (23/23 zielone), 4 mutacje (M1 → 2 czerwone: 2a+2d; M2 → 3c; M3 → 5a; M4 → 1a) |
| B (dokumentacja) | F-91/4 rad płaski; F-91/6 sac-draw timing; F-91/7 tryby Roli | **ZMIERZONE, PIN** | piny 4, 6, 6b — zamrażają zmierzone zachowanie, żeby przyszła zmiana nie przeszła niezauważona |
| Kontrole | battle cry (F-91/8), Harrier (10), Grollub (9), deck-out (11), L41 (K4) | **ZWERYFIKOWANE** | piny K1–K4 |

**Lekcja pętli (do rozważenia przy następnej kondensacji `LESSONS.md`):** domyślna
wartość parametru harnessa dobrana pod jedną rodzinę kart potrafi ZAFAŁSZOWAĆ pomiar
innej — zanim uzna się kartę za zepsutą, trzeba przemierzyć wymiar, który może ją
fałszować (tu: rozmiar biblioteki 5→30). Wzorzec: PMSSB-91/F-91/5.

**Bramy końcowe:** `node tools/run-tests.mjs fast` **10 532/10 533** (jedyny czerwony
`E5/1` skanuje własny wzorzec — klasa jak `docs/PROJECT_HISTORY.md`), `slow` **282/282**,
`npm run build` **79 modułów / 5978,8 kB**, `node tools/cr-numery.mjs` **OK** (583 numery,
563 unikalne w 6855 cytatach), `bot-scoring-snapshot` **4/4 bez regeneracji**,
`bot-tie-audit --gry=2` **RC=0** (12 remisów przed = 12 po), mirror-eval **6:6 / 6:6 / 7:5**.
