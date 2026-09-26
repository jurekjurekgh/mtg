Status: DONE 2026-09-26 (fale A/B/C: 3d88e94 / 65e16cc / 3a5bfa7; raport: §PMSSB-2 w docs/PMSSB.md)

# PMSSB-2: tokeny (`create_token`) — plan

Zlecenie właściciela (25i): druga sesja PMSSB z inną rodziną. Wybór agenta
(zgoda właściciela „sam podejmij decyzje"): tokeny. Metoda: procedura
`docs/PMSSB.md` (M429, nie tuning maszynowy; ADR 0018: pełne B0 tylko
na komendę).

## Wybór celu (uzasadnienie)

Największa rodzina efektów w katalogu: **45 kart** z `create_token` —
7 instantów (Raise the Alarm, Flurry of Wings, …), 10 sorcery
(Gather the Townsfolk, Howl of the Night Pack, …), 4 zdolności aktywowane
(Dragonbroods' Relic, Heap Gate, …), ~24 triggery (ETB/dies/combat-damage/
cast/noncreature…). Wybór iloczynem rozmiar × luka (tie-audit PO nie
wskazał remisów rodzinowych — cast_spell 16 remisów to warianty równoważne).

Wycena dziś — 5 ścieżek, 3 formuły (rozjazd L41):

| Ścieżka | Formuła | Ignoruje |
|---|---|---|
| cast_spell (bot ~5750) | `10 × count × (2P+T)/3` (dynamic count M106/Z6, fateful hour, greatest_power) | timing, chorobę, rolę tokena, keywordy, koszt czaru |
| activate_ability (bot ~7253) | to samo + M243/C (Treasure-bank) + koszt sacrifice | timing, rolę (poza Treasure) |
| tryb modalny (bot ~4453) | flat **8** | ilość, P/T, wszystko |
| plot_card (bot ~4804) | flat **+12** | ilość, P/T |
| tabela ETB (bot ~1248, cast_permanent) | flat **12** | ilość, P/T (token 5/5 = 1/1!) |

## Hipotezy do potwierdzenia sondą (krok 1)

- **H1 (L41):** modal/plot/ETB flat — Selesnya Charm (2/2 vigilance) =
  Raise the Alarm (2× 1/1)? Jyoti (ZERO tokenów, `commander_casts`) = 12?
- **H2 (timing instantów):** token wchodzi z chorobą (atak dopiero następną
  turę, blok od razu) — EOT vs precombat-wroga vs main-własna płasko?
- **H3 (timing sorcery):** premia precombat jak bounce-F1 (token do bloku
  w turze wroga / presji przed atakiem)?
- **H4 (rola tokena):** Treasure/Powerstone/Scion (mana — M243/C tylko
  w zdolnościach!), Mutagen (licznik +1/+1), evasive/keywordy
  (flying/infect/lifelink/vigilance/trample), fodder — wszystko płasko w P/T?
- **H5 (wrogie tokeny):** Relic Robber (`controllerFromEvent: damagedPlayerId`,
  0/1 cantBlock + ping w upkeepie wroga) — dziś +3.3 za ciało DLA WROGA,
  rider/damage niewycenione (klasa „błędny znak”).
- **H6 (dynamiczne ilości):** Undead Servant (`cards_named_in_graveyard`) —
  brak klucza w M106/Z6 (3 klucze: attacking/lands/commander) → fallback 1
  zamiast liczby w grobie; Jyoti → 0 tokenów za 12 (ETB).
- **H7 (koszt czaru, S11):** Chatter 1 vs Chocobo 4 (2/2) vs Howl — koszt
  many nie wchodzi do wyceny (remis 5 vs 2 many z PMSSB-1/S11)?
- **H8 (dies-tokeny):** Doomed Dissenter / Patron / Crawling Chorus / Elgaud —
  „ubezpieczenie” ciała (wartość przy chumpie/poświęceniu); interakcja z H-bota
  (przydział obrażeń) i M236 (skazaniec)?
- **H9 (hybrydy):** Abstruse Interference (counter + token-self) — suma
  gałęzi OK, czy podwójne liczenie / brak synergii?

## Kroki (procedura z hubu)

0. Plan (ten plik) — commit. 1. POMIAR PRZED: sonda
   `/tmp/pmssb2-tokeny-przed.mjs` (scenariusze → tabela wynik/FINDING).
2. AUDYT: macierz kierunek × cel × timing × stan + decyzje wartości (fale).
3. IMPLEMENTACJA: rodzina `token*` w params + wspólne helpery (L41).
4. TESTY: `test/audyt-pmssb2-tokeny.test.js` RED→GREEN + mutacje.
5. EWALUACJA: snapshot (cel: bez regeneracji), tie-audit PO, mirror, ŻT PO.
6. DOKUMENTACJA: raport w hubie + rejestr DONE + PROJECT_HISTORY.
7. Bramy, push po każdym kroku, PR.

## Zakres świadomie OUT

- Tuning maszynowy wag; pełne B0 (ADR 0018). - Cuombajj (mikro-pętla).
- `create_copy_token` / `create_token_copy_of_source` (kopie — osobna
  rodzina, inny model wartości: kopiuje CAŁĄ kartę, nie P/T z deskryptora).

## Aneks A: pomiar PRZED (sonda /tmp/pmssb2-tokeny-przed.mjs, 10 scenariuszy)

| # | scenariusz | wynik PRZED | finding |
|---|---|---|---|
| S1 | Selesnya Charm (modal 2/2 vigilance) | 70 (1 wariant cast) | **T7**: modal-wycena (+8) działa w `resolve_modal_choice`, nie w cast — wymaga sondy wyboru trybu |
| S2 | Jyoti (4: 0 tokenów!) vs Gearcrafter (3: 2/1+1/1) | 75.6 > 74.7 | H1-ETB ilustracja (dowód twardy: tabela ignoruje amount/P/T — kod) |
| S3 | Raise the Alarm: EOT-foe vs main-own vs main-foe | 70 = 70 = 70 | **H2 POTWIERDZONE**: timing instantu płaski (choroba niewidzialna) |
| S4 | Gather: main1 vs main2 (gotowy atak + bloker) | 70 = 70 | **H3 POTWIERDZONE**: sorcery pre/post płasko |
| S5 | Call (4: 3×1/1) 80 vs Chocobo (4: 2/2) 70 vs Chatter (1: 1×1/1) 60 | worth-scaled OK | H7: koszt w kode nie występuje (fakt z kodu); brak pary same-tokeny-różny-koszt do ilustracji |
| S6 | atak: Robber solo vs vanilla 2/2 solo | 13 = 13 | **H5**: trigger (wrogie 0/1 + ping) NIEWYCENIONY (0), ciało wroga bez kary |
| S7a | Undead Servant: grób 0 vs 3 imienniki | 76.50 = 76.50 | **H6 POTWIERDZONE**: dynamiczna ilość z grobu ignorowana (brak klucza Z6) |
| S7b | Flurry: 0 vs 3 atakujących | −70 vs 80 | OK (kontrola: guard Z6 działa) |
| S8 | blok 5/5: Dissenter (→2/2) vs vanilla 1/1 | 2 vs 1 | **H8**: dies-token wart +1 — jakim mechanizmem? czy adekwatnie? |
| S9 | Abstruse (counter+token) na pump wroga | 60 > 0 (pass) | H9: rzuca; dekompozycja counter-vs-token do audytu |
| S10 | Heap Gate ACT (Treasure) | −30/−30 | **T5**: bramka Treasure NIGDY się nie aktywuje? (M243/C vs koszt) |

Kontrola pozytywna: Flurry Z6, Abstruse-cast, worth-scale S5.

## Aneks B: decyzje audytu (findingi F1–F8 + fale jak M429)

Zasada anty-over-fix (M429): najsłabszy realny wariant (sorcery 1×1/1 za 1,
Chatter = 60) = dawna wartość; nowe wymiary to DOPŁATY/KARY. Wszystkie dane
w PlayerView (P/T/ilość/keywordy z deskryptora, stos, faza, ręka-licznik) —
prognoza BEZ zmian engine (do potwierdzenia w fali B/C).

- **F1 (timing instantów, H2 — S3: 70/70/70):** token wchodzi z chorobą
  (atak następną turę, blok od razu). Okna: EOT-własny (przed turą wroga —
  blok gotowy) > main-własna > EOT/main-wroga? Decyzja wartości w fali B
  (sonda falowa, nie zgadywanie).
- **F2 (timing sorcery, H3 — S4: 70/70):** premia precombat (main1 + presja
  + blok w turze wroga), jak bounce-F1.
- **F3 (L41 flat, H1):** ETB 12 + plot +12 (Tumbleweed live!) ignorują ilość
  i P/T; cast/ability liczą `10×count×(2P+T)/3`. Modal-trigger +8 MARTWE dla
  tokenów (0 kart) — ujednolicić prewencyjnie (precedens PMSSB-1/B:
  gałąź gotowa na zero kart). Jyoti (0 tokenów → 12) znika przy okazji.
- **F4 (rola tokena, H4):** Treasure/Powerstone/Scion (mana-bank: dziś 0
  w cast, −13/−14 w ability, 12 w ETB — pełny rozjazd!), Mutagen (licznik),
  keywordy (flying/infect/lifelink/vigilance/trample), fodder. M243/C
  (Heap Gate −30) ŚWIADOME (raport właściciela #3) — nie ruszać wyniku,
  tylko ujednolicić rolę między ścieżkami.
- **F5 (wrogie tokeny, H5 — S6: 13=13):** Robber: trigger 0 w ataku, ciało
  0/1 dla wroga bez kary, ping-rider (upkeep damage_to_controller)
  niewyceniony. Znak + rider + (atak-trigger jak Disa/Relic w wycenie ataku).
- **F6 (dynamiczne ilości, H6 — S7a: 76.50=76.50):** brak klucza
  `cards_named_in_graveyard` w M106/Z6 (Undead Servant → fallback 1);
  ETB nie czyta amount wcale (Jyoti). Kontrola: Flurry Z6 działa (−70/80).
- **F7 (koszt czaru, H7/S11):** koszt nie występuje w wycenie (fakt z kodu).
  Zakres MINIMALNY: tie-break (ten sam efekt → tańszy wygrywa); pełny
  opportunity-cost (mana na follow-up z ręki) OUT (osobna pętla, wymaga
  modelu castability — por. NOTE przy Unstable Frontier).
- **F8 (dies-tokeny w bloku, H8 — S8: +1 to różnica ciał 1/1 vs 1/2, NIE
  token):** `blockerValueLost` = czyste P+T (kod) — triggery śmierci
  (Dissenter/Patron/Chorus/Elgaud) niewidzialne. Ubezpieczenie ciała.

Fale: **A** (wartość tokena: F3+F4+F6 — wspólny `tokenBodyValue` + rola +
klucze; anty-over-fix Chatter=60); **B** (timing: F1+F2 — okna + choroba);
**C** (kontekst: F5-znak/rider/atak + F7-tie-break + F8-ubezpieczenie).
OUT: `create_copy_token*` (osobna rodzina), M243/C-wynik, opportunity-cost,
counter-decyzje Abstruse (rodzina kontr w backlogu hubu).
