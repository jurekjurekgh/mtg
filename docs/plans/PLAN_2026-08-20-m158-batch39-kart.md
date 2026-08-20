# PLAN M158 — Batch 39 (10 kart, lista właściciela 2026-08-20)

## Karty i mechaniki (dane Scryfall pobrane, ADR 0010 §2a)

| # | Karta (set) | Koszt | Mechanika | Zasób |
|---|---|---|---|---|
| 1 | Merfolk Mesmerist (M12) | {1}{U} 1/2 | {U},{T}: gracz-cel mieli 2 | REUSE (mill_cards) |
| 2 | Exterminator Magmarch (M3C) | {2}{B}{R} 5/3 | {1}{B}: Regenerate; trigger multiplayer (martwy w 1v1 — fakt formatu) | NOWY efekt `regenerate` (tarcza w state.regenerationShields — maszyneria istnieje); trigger z warunkiem niespełnialnym w 1v1 |
| 3 | Wrap in Flames (MM2) | {3}{R} | 1 obrażenie KAŻDEMU z do 3 celów + nie mogą blokować tę turę | variableTargets w czarach (sprawdzić tryby) + damage per cel + cant_block rider |
| 4 | Revolutionist (MH2) | {5}{R} 3/3 | ETB: instant/sorcery z grobu do ręki; **Madness {3}{R}** | spec istnieje; **NOWA MECHANIKA Madness (CR 702.34)**: odrzucenie→exile+decyzja rzutu za koszt madness |
| 5 | Dire Fleet Ravager (OTC) | {3}{B}{B} 4/4 | Menace, deathtouch; ETB: każdy gracz traci 1/3 życia (zaokr. w górę) | NOWY efekt ułamkowej utraty życia (generyczny numerator/denominator) |
| 6 | Knight of the Skyward Eye (ALA) | {1}{W} 2/2 | {3}{G}: +3/+3 EOT, raz na turę | REUSE (oncePerTurn — Snarling Wolf) |
| 7 | Breaching Hippocamp (THS) | {3}{U} 3/2 | Flash; ETB: odkręć INNEGO własnego stwora | REUSE + notSelf w spec creature_you_control (rozszerzenie) |
| 8 | Invasion of the Giants (KHM) | {U}{R} Saga | I: Scry 2; II: dobierz + możesz ujawnić Olbrzyma z ręki→2 obrażenia przeciwnikowi; III: następny czar Olbrzyma tańszy o {2} | Saga ✓; NOWE: ujawnienie karty podtypu z ręki (decyzja) + rabat na następny czar podtypu (konsumowany) |
| 9 | Wishful Merfolk (ELD) | {1}{U} 3/2 | Defender; {1}{U}: traci defender i staje się Człowiekiem do EOT | NOWE: tymczasowe nadpisanie podtypów + utrata keyworda do EOT (wzorzec originalBeforeAnimation) |
| 10 | Squire's Lightblade (EOE) | {W} | Flash equipment; ETB: przypnij do własnego stwora + first strike EOT; +1/+0; Equip {3} | REUSE + efekt attach-self-do-celu (Kazuul pattern w ETB) |

## Zasada nadrzędna

ADR 0022: KAŻDA karta 100% wg Oracle albo nieobsługiwana. Zero „uproszczeń".
Strażniki L51/L28 wymuszą klasyfikację nowych typów efektów celowanych w botach.

## Transze commitów (każda zielona: npm test + build + test:slow przy zmianach bota/engine)

1. **Plan** (ten plik).
2. **Transza A — reuse:** Mesmerist, Knight, Hippocamp (notSelf), Lightblade
   (+ efekt attach_self_to_target). Pliki Scryfall do docs/cards/.
3. **Transza B — proste nowe mechaniki:** regenerate (Magmarch + trigger
   multiplayer martwy w 1v1), ułamkowa utrata życia (Ravager), Wishful
   (override podtypu + utrata keyworda EOT).
4. **Transza C — Wrap in Flames:** wielocelowy czar „each of up to N"
   (enumeracja + aplikacja per cel + cant_block rider) — rozszerzenie
   variableTargets czarów.
5. **Transza D — Invasion of the Giants:** rozdział II (ujawnij Olbrzyma→
   obrażenia) i III (rabat na następny czar podtypu); I scry 2.
6. **Transza E — Revolutionist + Madness (CR 702.34):** routing odrzucenia
   (efekt + decyzje + cleanup), pendingMadnessCast, rzut za koszt madness
   (ignoruje timing jak rebound/suspend).
7. **Talie + seedy (L25) + strażniki (L23/L26/L48/L50/L51) + PROJECT_STATE.**

## Ryzyka/pułapki

- Madness ma wiele ścieżek odrzucenia (efekt discard, decyzja gracza, cleanup,
  koszty typu „discard as cost") — znaleźć JEDEN choke point (jak
  moveObjectDirectly dla zmian stref) albo jawnie zsynchronizować wszystkie.
- variableTargets istnieje tylko w trybach modalnych (legalModeCasts) —
  zweryfikować, czy zwykły spell.targets wspiera; jak nie — rozszerzyć
  spójnie (oferta=walidacja, L48).
- Karty W w talii azorius z aktywacją {3}{G} (Knight) — sprawdzić źródła many
  talii przed przydziałem; jeśli brak G, rozważyć talię green (dual-color?) —
  decyzja wg faktycznego składu talii (M132).
- Każdy nowy typ efektu celowanego: wpisy do wycen bota (strażnik L28 wyszczyka).
- Duży zakres 10 kart — jeśli budżet sesji padnie w środku, transze są
  samodzielnie zielone i PR opisuje stan częściowy (karty niedokończone
  NIE wchodzą do talii).
