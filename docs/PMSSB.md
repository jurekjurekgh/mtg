# PMSSB-1 — pętla jakości scoringu bounce (2026-09-25)

**Problem (sonda S10, owned by 25h):** bot nie rozumiał odbicia — remisował
38/38 na Vanish from Sight, odbijał własne stwory, nie widział tokenów ani
okna EOT. Pętla: audyt `kierunek × cel × timing × stan` (F1–F8) →
fale A/B/C → 29 pinów → suit 6668/6668.

**Plik testów:** `test/audyt-pmssb1-bounce.test.js` (A: 9, B: 8, C: 12).
**Kod:** `bounce*` w `src/controllers/heuristic-bot.js`,
pokrętła w `src/controllers/heuristic-params.js`.

## Fala A — siła efektu + cel wroga (commit `8ec4acb`)

- **F8 skala siły** (`BOUNCE_STRENGTH`): hand 0 < top 8 < bottom 18
  (bottom ≈ destroy-ETB — prawie removal).
- **F7 Vanish** (`owner_library_top_or_bottom` w `REMOVAL_EFFECTS`):
  skaluje wartością celu — koniec remisu 38/38.
- **F2 token wroga** +12 (CR 704.5d — znika na zawsze; symetria
  z `create_token` 12).
- **F3 aura wroga na celu** +30/aura (ta sama jednostka co trigger-decyzje —
  `bounceAuraDelta`, L41).
- **F6 ETB wroga** −1×`etbEnterBonusValue` (powtórka dla wroga — lustro F4).
- **Anty-over-fix:** goły 1/1 wroga bez kontekstu = DOKŁADNIE 80 (jak PRZED).

## Fala B — kierunek własny (commit `fae2482`)

- **F5 ratunek:** wrogi removal na stosie w mój cel → fizzle-premia 22
  (karta wroga w plecy, CR 608.2b) + utrzymane ciało (22 + 2×worth +
  TMC + deathtouch, lustro M234) − recast − tempo. Śmiecia nie ratujemy
  (pin F5-neg: pass wygrywa).
- **F4 reuse:** trigger własny (Invasive) liczy pełną ekonomikę kandydata
  (`fullEconomics`): ETB-reuse − recast − tempo; land −20 > reuse > śmieć.
- **Token własny** pod bounce'em: kara jak utrata stwora (CR 704.5d w obie
  strony) — NIE ratuj.
- **Własna aura na celu:** −30/aura (spada razem ze stworem).
- Pokrętła: `bounceRecastManaWeight: 3` (mana droższa od power —
  many nie wracają), `bounceTempoPenalty: 10` (połowa „karty").
- **Anty-over-fix:** własny 2/2 bez kontekstu = DOKŁADNIE −114.

## Fala C — timing + stan (commit `26ab5b7`)

- **F1 okna instantu** (jak tapowanie M139): EOT-wroga +8 / main-własna 0 /
  main-wroga −8. Sorcery bez wyboru okna: tylko premia precombat +8
  (main1 + gotowy atakujący + odtapowany bloker wroga). EOT-własny = 0.
  Jeden pokrętło: `bounceTimingSwing: 8`.
- **Fizzle ofensywny:** wrogi buff na stosie w JEGO własny cel (pump/grant/
  licznik/regeneracja) → +22 (2-za-1). TYLKO cel pojedynczy (CR 608.2b —
  przy wielu celach czar i tak się rozstrzyga). Czary-aury pomijamy
  (widok stosu nie niesie deskryptora aury).
- **Overflow** (CR 514.1, limit 7): ręka wroga 7+ → +12 (wymuszony odrzut),
  MOJA ręka 7+ → −12 (sam odrzucę). `bounceOverflowBonus: 12`.
- **Atakujący:** +2×obrażenia-na-twarz (lustro kary −2×amt za damage we
  mnie). **Lethal-dodge:** bounce zdejmuje lethal → +100 (życie > karta,
  poniżej twardego bana). `bounceLethalDodgeBonus: 100`.
- **Ratunek bojowy:** ofiara blokuje mojego ginącego atakującego, a bez
  niej przeżywa (reszta mocy < wytrzymałość, brak deathtoucha) →
  premia jak F5 (bez recastu). Po `damageAssigned` = 0 (CR 510).
- **Lockout:** wróg bez odtapowanych landów na recast (TMC) → +10
  (ta sama jednostka co `bounceTempoPenalty`). Same lądy (bez dorków —
  konserwatywnie, jak M247).
- **Screw:** trigger przy ≤2 własnych landach — cofnięcie landu −22
  (land-drop to życie); przy 3+ bez dopłaty.
- **L41-wrapper:** `apply_to_each_target` z wewnętrznym bounce'em
  (Sea God's Scorn) liczy te same wymiary (M233/2: relacje < pass /
  > pass trzymają, bez pinów exact).
- **Piny:** EOT 88 / main-własna 80 / main-wroga 72; overflow-foe 92;
  overflow-own −126; lockout-TMC5 112; lethal-dodge > 150.
- **Setupy „bez kontekstu" wymagają neutralnej many wroga**
  (`neutralFoeMana` — 3 odtapowane wyspy), inaczej lockout zapala się
  w każdym teście i psuje piny fal A/B.

## Znane granice (świadome, nie bugi)

1. Aktywowane zdolności bounce: katalog ma ZERO kart — gałąź gotowa
   (wymiary A/B/C przez wspólne helpery), timing tylko w cast_spell.
2. Czary-aury wroga na stosie nie dają fizzle-premii (brak deskryptora
   w widoku; ofiara i tak zwykle dostaje premię F3 po wejściu aury).
3. Ratunek bojowy ignoruje first/double strike (konserwatywna arytmetyka
   mocy — premia może nie wpaść, nigdy nie wpada na próżno).
4. Lockout liczy tylko lądy (nie dorki/pulę) — konserwatywnie.
5. Timing sorcery wymaga fazy `precombat_main` (M179/C); EOT-własny = 0.

## Pomiar końcowy

- Suit 6668/6668 GREEN, w tym golden-master BEZ regeneracji
  (`overallHash 227e6cbe…` stoi — 0/6 meczów drgnęło).
- Lustro 48 gier (talie z bounce'em, kandydat C vs baseline z 3 pokrętłami
  ×0): 24–24, brak sygnału — zgodnie z lekcją B6 to problem PRÓBKI, nie
  parametru (wymiary C zapalają się w wąskich stanach: EOT, pełne ręce,
  lethal-ataki z odpowiedzią w ręce — rzadkie w losowym self-playu).
- Dowód wartości fali C = 29 pinów behawioralnych (12 nowych) + testy
  sterowania pokrętłami (×0 zmienia wynik) + zero regresji w suicie.
