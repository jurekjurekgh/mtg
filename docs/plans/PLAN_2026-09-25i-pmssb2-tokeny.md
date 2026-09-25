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
