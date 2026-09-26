# PLAN PMSSB-11: sac-economics (2026-09-26)

Wybór celu (krok-0): forward PMSSB-10 (exploit-sac-net!) — ETB-may-sac
(exploit ×2, devour ×1) z benefit-NIEWIDZIALNYM przy cast-cenie.
Resolution-covered: rampager (enumeracja!), rites/splinters/strands
(sac-net!), dreadmaw-ability (ujemny-net!) — guardy.

## 0. Teza i klastry (krok-0)

MODEL: exploit-net = max(0, benefit − cheapest-sac) × victim-gate!
OPT-IN (may-sac!): brak-ofiary → 0 (bramka!). benefit z tabeli-ETB:
silumgar-pump-(−3/−3) = removal-net, drowner-impulse = look-4-take-1.
sacValue-model ISTNIEJE (:5964: P×2+T+MV, cheapest-victim!).
Devour-N (any-number!) = max(0, N×counter − N×sac) — konserwatywnie
N=1 (jedna-ofiara!).

Klastry (census):
- exploit ×2: silumgar-butcher (pump-removal!), gurmag-drowner (impulse!);
- devour ×1: gorger-wurm (countery za N-ofiar!);
- guardy-covered: rampager (78.30/69.31!), rites (8.00!), splinters
  (84/−252!), strands (85!), dreadmaw-ability (−16!).

OUT: treść-na-rezolucji (konwencja-50!), mechanika-exploit (silnik M69!),
aktywowane-outlety (dreadmaw-covered — guard!).

## 1. Hipotezy (krok-1)

- **H1 (exploit-net):** max(0, benefit−sac) × victim-gate: silumgar
  (kill-2/2-foe: +18−sac-1/1 ≈ +15!) i drowner (impulse ≈ +7−sac!)
  niosą DODATNI net przy ofierze-na-stole; BEZ ofiary = 0 (gate!).
- **H2 (devour-net):** max(0, counter−sac) N=1: gorger +1/+1-counter
  (+5?) − sac-1/1 (≈3?) ≈ +2 (mały-dodatni!); bez-ofiary = 0.
- **H3 (guards):** rampager/rites/splinters/strands/dreadmaw BEZ ZMIAN
  (resolution-covered — anticipacja NIE DOTYKA cast-brancha!).

## 2. Macierz sond (krok-2, `tools/pmssb11-sac-sonda.mjs`)

S01 silumgar (exploit-0?), S02 drowner (exploit-0?), S03 gorger
(devour-0?), S04 rampager (enumerated!), S05 dreadmaw (cast+ability!),
S06 rites/splinters/strands (resolution-net!).

## 3. Fale (krok-3+, do potwierdzenia sondą)

- Wave-A (kandydat): F-S1 exploit-net + F-S2 devour-net + guardy + piny
  + golden (ryzyko NISKIE: 3 nosiciele!).
- Ryzyka: (a) victim-gate (cheapest-sac na RĘCE vs STOLE — cast-moment!
  ofiara musi być NA STOLE!); (b) silumgar-target-gate (foe-X/3?);
  (c) drowner-impulse-value (look-4-take-1 ≈ ?).

## Aneks A — ślady krok-0

- Census sac-benefitów (~9 nosicieli, 3 klasy) + treść-efektów.
- sacValue-model (:5964) do reuse; resolve_exploit/devour (M69/M130)
  pokrywają rezolucję — GAP tylko anticipacja-cast!

## Aneks A2 — wyniki sondy (krok-2/3, audyt WŁASNY)

PRE (victim-1/1 + foe-2/2): silumgar 65.70 (0!), drowner 65.70 (0!),
gorger 70.21 (0!), rampager 78.30/69.31 (enumerated!), dreadmaw-cast
68.41 + ability −16.00 (ujemny-net!), rites 8.00, splinters 84/−252,
strands 85.00. GAP = exploit/devour-anticipacja (H1/H2 GO!).

## Aneks B — forwardy (closeout 2026-09-26)

- Double-discount-lesson: helpery anticipacji zwracają RAW (cast-branch
  dyskontuje ×0.9!) — anticipatedSacValue v1 mnożył ×0.9 wewnątrz
  (silumgar +2.43 zamiast +2.7!). Reguła: NIGDY ×0.9 w helperze.
- Drowner-impulse = drawCardValue + min(x−1,3) (lustro cast-brancha!) —
  unifikacja impulse-formuły (3 miejsca: cast/etb/anticipacja?).
- WorthIt-TMC-gate (mirror-resolve!) działa też w anticipacji —
  wzorzec: anticipacja = lustro-decyzji-rezolucji (nie nowa-logika!).
- Exploit-mill-gate (drowner: mill-0 — covered!) — gdyby nosiciel
  z mill>0 się pojawił, bramka-biblioteczna do dodania.

## Aneks C — wyniki fal (closeout 2026-09-26)

Wave-A (`ae222e4`, F-S1+F-S2): anticipatedSacValue = max(0, benefit −
cheapest-sac): silumgar +2.7 (68.40, kill+worthIt!), drowner +5.4
(71.10, impulse!), gorger +2.7 (72.91, trash!). 9 bram CLOSED
(bare/victim-only/big-T/unworthy/lib0/big-sac/no-trash!), 5 guardów
SAME (rampager/rites/splinters/strands/dreadmaw!). 5 pinów, golden
CZYSTY (0 — bramki zamknięte w praktyce!), 6833/6833 GREEN.

Hipotezy: H1 GO, H2 GO, H3 GO. PMSSB-11 ZAMKNIĘTY (single-wave!).
Cena: double-discount (złapany sondą-POST przed pinami!).
