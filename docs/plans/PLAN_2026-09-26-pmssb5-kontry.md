# PMSSB-5: kontry (`counter_spell*`) — plan

Petla Manualnego Strojenia Scoringu Bota (hub: `docs/PMSSB.md`, procedura
krokow 0-7). Metoda M429: audyt przyczynowo-skutkowy JEDNEJ rodziny +
wdrozenie falami + piny. Nie tuning maszynowy (ADR 0018).

## Wybor celu (uzasadnienie)

Rejestr BACKLOG po PMSSB-4: kontry jako OSTATNIA rodzina BACKLOG
(`counter_spell`, hub: 5 kart, "mikro-petla?", "mala rodzina, wysoka
dzwignia"). Pytanie "mikro-petla?" rozstrzygam w krok-0 na korzysc
PELNEGO PMSSB-5:
- weryfikacja programowa: **7 kart** (nie 5), w tym 2x Negate (reprint);
- **4 kanaly**: twarde (negate/negate-m15/stoic) / modal (sabotage) /
  unless-pays (delusion/abstruse) / rider (fuel-proliferate);
- **dwie strony decyzji**: rzut kontujacego (5528) + platnika (8510);
- audyt zbioru HIGH_IMPACT vs katalog (co realnie umyka kontrze);
- dzwignia: kontra nietrafiona = karta w plecy + threat na stole.

Odrzucone: wszystko inne jest DONE/POKRYTE/OUT w rejestrze.

## Inwentarz (7 ID, weryfikacja `reg.all()`)

Twarde: negate, negate-m15 (M20/M15, {1}{U}, TYLKO noncreature-spell),
stoic-rebuttal (SOM, {2}{U}, dowolny czar, metalcraft-znizka {1} przy 3+
artefaktach). Modal: steel-sabotage (2XM, {U}: kontra artifact-spell LUB
bounce artefaktu). Unless-pays: frightful-delusion (ISD, {2}{U}: kontra
unless {1} + ODRZUT-1 BEZWARUNKOWY), abstruse-interference (OGW, {2}{C}:
kontra unless {1} + MOJ token Scion 1/1 z sac-mana; oracle "YOU create" —
silnik (domyslny kontroler zrodla) poprawny). Rider: fuel-for-the-cause
(MBS, {3}{U}: kontra + proliferate).

Brak w katalogu/silniku: counter_ability (0 kart; galaz bota to
future-proof), uncounterable (0 kart; brak mechaniki).

## Rozpoznanie kodu (krok-0)

Rzut (cast_spell ~5528, PRZED petla efektow): M120 kontra we wlasny
czar -> finish(-90) (twarda odmowa); mieszany -60; M237/2 cel-wroga:
HIGH_IMPACT (16 typow) LUB TMC-celu >= 3 -> wart; inaczej -60 (trzymaj);
E7/D2 unless-pays: platnik moze doplacic (pula + nietapniete lady) ->
-90 (czekaj az wyda mane). BRAK dodatniego skladnika kontry w petli
efektow (prognoza sondy: kontra-wplywowa = flat 50 = spellBase).
Platnik (`resolve_counter_pay_choice` 8510): pay 85 / decline 10, FLAT
(bez wartosci ratowanego czaru). Modal-rzut: efekty wybranego trybu
(5428) ida ta sama droga (sabotage-kontra trafia w galaz 5528).
Silnik: `counterStackObject` (wspolny helper, M271); delusion-discard
BEZWARUNKOWY (tez po zaplacie — zdania rozlaczne oracle); pendingCounterPay
z discardCount. Bot NIE ZNA: proliferate (brak case; fuel-rider = 0),
discardCount (brak; delusion-rider = 0), costReduction (stoic-znizka
niewidzialna — engine placi mniej, wartosc ta sama).

## Hipotezy H1-H8 (status po krok-1)

- H1: kontra wplywowa = flat 50 (brak skali wartoscia celu: destroy-8-drop
  == draw-2 == pump; TMC-celu tylko progiem >= 3, nie waga).
- H2: hold trywialnego dziala (M237/2: -60 -> -10 przy TMC<3 + brak
  HIGH_IMPACT).
- H3: luki HIGH_IMPACT: ktore <3-MV czary ze stosu umykaja (tutor?
  mill? discard-each? extra-turn? ... — audyt zbioru vs katalog).
- H4: E7/D2 -90 ignoruje delusion-discard (bezwarunkowy rider = 0 w bocie):
  hold przy otwartym {1} mimo discard-1 + podatku — nad-hold?
- H5: strona platnika flat (85/10): brak skali wartoscia ratowanego czaru
  (8-drop == 1-drop; pusta reka vs pelna — to samo).
- H6: ridery: fuel-proliferate = 0; delusion-discard = 0; abstruse-scion
  = +token (pin: body + mana-bank).
- H7: sabotage modalny: wybor trybu kontra-vs-bounce = wartosci trybowe
  (pin obu sciezek; kontra-artefaktu w galaz 5528).
- H8: brzegi hold: wlasny-czar -90 twardo (M120); counter-war (counter w
  HIGH_IMPACT); stoic-znizka niewidzialna (nieszkodliwa?); brak-celu =
  brak-oferty (silnik); blef-many = OUT-mana.

## Zakres swiadomie OUT

- counter_ability (0 kart), uncounterable (0 kart/mechaniki).
- Blef-many / opportunity-cost many (rodzina mana, nie kontry).
- Ward-pay / optional-pay flaty (inne rodziny; counter_pay JEST w zakresie).
- Nowe karty do katalogu (zakaz wlasciciela); talie bez zmian.

## Kroki 0-7 (hub)

0. Plan (ten plik) + commit + push. 1. Sonda PRZED
(`tools/pmssb5-kontry-sonda.mjs`) + status H1-H8 (Aneks A). 2. Audyt:
macierz cel x platnik x timing x stan + findingi F (Aneks B). 3. Fale
A/B/C + piny `test/pmssb5-kontry-wave-*.test.js`. 4. Sonda PO (diff).
5. Eval: full suite + golden (cel: zero regeneracji poza swiadoma) +
tie-audit. 6. Docs: Aneks C + hub (§PMSSB-5 + rejestr) +
PROJECT_HISTORY. 7. Bramy + push po kazdym kroku.

## Aneks A: pomiar PRZED (`tools/pmssb5-kontry-sonda.mjs`, 25 sond)

| Sonda | Wynik | Prognoza |
|---|---|---|
| K01 negate vs impactful (fireball) | 50.0, strzela | 50 TAK |
| K02 negate vs trivial (twiddle MV1) | -10, trzyma | -10 TAK |
| K02b negate vs shock MV1 (damage!) | 50, strzela | 50 TAK |
| K03 negate we wlasny czar | -90, odmawia | -90 TAK |
| K04 stoic mc0/mc3 | 50 == 50 | rowne TAK |
| K05a sabotage-kontra w czar-artefakt | 50 | 50 TAK |
| K05b sabotage-bounce w artefakt | 80 | pomiar |
| K05c sabotage vs fireball | BRAK OFERT | brak TAK |
| K06 delusion placi/tapped-out | -40 / 50 | -40/50 TAK |
| K07 platnik 1-drop/7-drop | 85/10 == 85/10 | flat TAK |
| K08 fuel vs impactful | 50 | 50 TAK |
| K09 abstruse tapped-out/placi | 59.97 / -30.03 | pomiar |
| K10 6 luk (divest/divine/unearth/forced/triumph/dreams) | WSZYSTKIE -10, trzyma | -10 TAK |
| K11 wojna kontr + wlasny | 50 / -90 | 50/-90 TAK |
| K12 negate vs creature-spell | BRAK OFERT | brak TAK |
| K13 dwa cele | 50 vs -10, wybor OK | TAK |

Status H1-H8: H1 POTWIERDZONA (flat-50, cel 1-drop-shock == fireball).
H2 POTWIERDZONA (hold trywialnego -10). H3 POTWIERDZONA (6 luk: hand-rip
MV1, edykt MV2, reanimacja MV1, tuck MV2, removal-artefaktow MV2 —
bot patrzy jak reka znika). H4 POTWIERDZONA (-90 mimo discard-1; rider
wartosciowany na 0). H5 POTWIERDZONA (platnik flat: 7-drop == 1-drop).
H6 POTWIERDZONA (fuel-proliferate = 0; abstruse-scion = +9.97;
delusion-discard = 0). H7 POTWIERDZONA (sabotage: kontra 50 / bounce 80 —
tryb bounca LICZBOWO ATRAKCYJNIEJSZY od kontry!). H8 POTWIERDZONA
(M120 -90; wojna-kontr strzela; stoic-znizka niewidzialna; brak-celu =
brak-oferty po stronie silnika; noncreature-only egzekwowane silnikiem).
## Aneks B: audyt + fale (krok-2)

Macierz (cel x platnik x stan) — werdykty: wplywowy+tapped-out STRZEL
(50) OK; wplywowy+platnik-moze TRZYMAJ (-40) OK (H4: dowod kasowania
nizej); trywialny TRZYMAJ (-10) OK; wlasny ODMOW (-90) OK; platnik PLAC
(85) OK (H5: dominacja); 6 luk STRZELAJA PO F-H3.

F-H3 (JEDYNA fala A): HIGH_IMPACT += 6 typow (bramka binarna, zero
pokretel, jak istniejace 16): reveal_hand_choose_discard (precedens:
discard_cards; lustro HOSTILE_PLAYER 45), reveal_hand_choose_exile
(samo), destroy_artifact_gain_life_mana_value (precedens:
destroy_permanent; L41 REMOVAL 90, M156/F2), return_permanent_from_graveyard
(precedens: reanimate_under_your_control), bounce_to_library_bottom
(precedens: bounce_permanent; L41 REMOVAL 75, Batch 43),
player_sacrifices_creature (precedens: destroy/exile; L41 REMOVAL 90).
Promien: DOKLADNIE 6 kart MV<3 (divest/dreams/divine/unearth/forced/
triumph; zero modali). Celowy brak unii map: REMOVAL zna tez tap-45,
ktorego bramka SLUSZNIE nie kontruje (M237/2) — rozne decyzje, rozne
zbiory (L41 dobrze rozumiane). Over-fire (edykt-przy-pustym-stole)
dolacza do istniejacej akceptowanej klasy (pump-bez-walki).
Falsyfikator: sonda-PO diff = DOKLADNIE 6 flipow -10->50, zero ruchu
gdzie indziej; piny + golden (oczekiwane zero regeneracji).

NO-F: H1 flat-50 = swiadomy projekt (bramka binarna; porzadkowanie
zagrozen miedzy strzalami = forward); H2 dziala; H4 = DOWOD KASOWANIA:
odrzut-bezwarunkowy jedzie TAK SAMO przy strzale-teraz (tax+discard)
jak przy strzale-pozniej (deny+discard) — kasuje sie z decyzji, zostaje
p*50 vs epsilon + mandat wlasciciela (E7/D2) — TRZYMAJ; H5 = dominacja
placenia (delusion: odrzut i tak nastapi; abstruse-brzeg = forward
H1); H6-fuel: karta >> proliferate wg WLASNYCH wag bota (loyalty +1,
+1/+1 +2 — rozstrzyganie proliferate 9386!) — hold-vs-trywialny zostaje,
lethal-poison-9 = forward; H6-abstruse POPRAWNE (+10 cialo, max-rol
sluszne (role wylaczne), -0.03 = tie-break F7 PMSSB-2 (0.01xMV3),
nie kontr); H6-delusion: kasowanie (jak H4); H7 sabo AKCEPTOWANE
(jeden modal = wybor XOR miedzy rownowaznymi odpowiedziami; urgencja
okna = forward); H8: M120 tak, mixed martwy-nieszkodliwy (silnik daje
warianty 1-celowe), counter_ability future-proof w tej samej bramce,
stoic-znizka = efekt-rowny (oszczedzona mana = rodzina mana OUT),
4 martwe wpisy zbioru (exile_target_creature, return_to_hand,
reanimate_under_your_control, discard_each_opponent — zero nosicieli,
nieszkodliwe), noncreature-only i brak-celu egzekwuje silnik.
Hold-udokumentowane: manifest-dread (polityka-jak-stwor), spare-from-evil/
memory-s-journey (kontekstowe), mill (kontekstowe), tap (M237/2 celowe).
Falszywe alarmy: assert-perfection (niesie pump), release-the-ants
(niesie damage), force-away (niesie bounce), curate (niesie draw),
fake-your-own-death (niesie pump) — strzelaja przez rodzenstwo.
Forwardy OUT: zysk-foe-side hand-rip NIEwyceniony w cascie (divest/
mindstab = czysta baza 50.00; M202 = self-harm, M408 = koszt-odrzutu —
luka rodziny discard!), self-divest +3 (wartosc bez wyboru), X-na-stosie
niewidzialne (epic-experiment MV2 trzyma nawet przy X=7 — potrzebny
xValue w widoku + prog bramki), porzadkowanie-zagrozen, lethal-proliferate,
liczenie-zasobow E7/D2 (sciony/skarbce = rodzina mana), swiadomosc-okna
odpowiedzi, bramka-czytajaca-cele.
## Aneks C: wyniki (do wpisania po falach)
