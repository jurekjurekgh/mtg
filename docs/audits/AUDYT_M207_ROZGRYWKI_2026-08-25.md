# Audyt M207 — rozgrywki Żywym Testerem (2026-08-25)

**Zlecenie właściciela:** rozegrać kilka partii nowym, lepszym Żywym Testerem
i przeanalizować transkrypty pod kątem błędów na każdej ze ścieżek
wymienionych w `docs/setup/TESTER_STOLU.md` (osie 1–6), ze szczególnym
naciskiem na:

- **(a)** efektywność czarów i zdolności bota (timing, wybór celu, sens
  taktyczny zagrania),
- **(b)** poprawne grupowanie i jednoznaczne opisy opcji targetowania,
- **(c)** czy czary wielocelowe używają modala z listą legalnych celów
  i ptaszkiem, a nie wyliczanki kombinacji.

Gałąź: `arena/01a038fe-mtg` (PR #78). Commity `M207/1`–`M207/3`.

---

## 0. Najpierw: audyt znowu mierzył nie to, co trzeba

M206 naprawił selektor kreatora wielocelowego, więc tester zaczął go
przeklikiwać. Okazało się jednak, że **klika go na pusto**.

Sterownik zaznaczał cele w pętli „klikaj, dopóki »Zatwierdź« jest wyłączony”.
Dla czarów **„up to N”** (`minTargets = 0`) przycisk jest aktywny **od
pierwszej chwili** — więc pętla kończyła się po zerowym kliknięciu i tester
zatwierdzał czar **bez ani jednego celu**:

```
• Ty rzucasz Wrap in Flames
• Wrap in Flames zostaje rozstrzygnięty      <- i nic więcej
```

Detektory milczały (`== DETEKTORY: brak zgłoszeń ==`), bo formalnie nic się nie
zepsuło: czar się rozstrzygnął, gra szła dalej. Tyle że **cała ścieżka
„czar wielocelowy robi coś realnego” nie była testowana** — na wszystkich
pięciu trafieniach sweepu (`warhammer` vs `ravnica`, seedy 9/13/17/29/41)
w transkrypcie było „potrzeba 0”.

Naprawa w `M207/1` (tester liczy górną granicę z intro „zaznacz cele (0–3)”
i celuje w `max(needed, upper, 1)`, cofając nadmiar). Po naprawie:

```
• Wrap in Flames zadaje 1 obrażenie (Hill Giant)
• Hill Giant nie może blokować do końca tury
```

To potwierdza lekcję L-z-M206 w nowym wariancie: **„brak zgłoszeń” nie jest
dowodem czystego przebiegu** — trzeba sprawdzić, czy zagrany czar miał
**realny skutek**.

---

## 1. Oś (c) — modal wielocelowy: forma była dobra, ale tylko dla połowy kart

M195/C rozwiązało przypadek **jednorodny**: Fireball i Wrap in Flames pokazują
listę legalnych celów z ptaszkiem zamiast iloczynu kombinacji (95 wariantów
obrażeń → lista + licznik X). To działa i **nie uległo zmianie**.

Audyt pokazał drugą rodzinę kart, której ta forma **nie obsługuje**: czary
o kilku **RÓŻNYCH pozycjach celu**. Grave Exchange (Oracle: „Return target
creature card from your graveyard to your hand. Target player sacrifices
a creature of their choice.”) renderował się tak:

```
Grave Exchange — zaznacz cele (2):
  [ ] Hill Giant        <- karta z mojego grobu
  [ ] Ty                <- gracz
  [ ] Nieprzyjaciel     <- gracz
  [ ] Goblin Piker      <- karta z grobu
```

Cztery nierozróżnialne wiersze w jednym worku. Wady:

1. Nic nie mówiło, że to **dwie niezależne pozycje**, a nie „dwa cele
   z jednej puli”.
2. Można było zaznaczyć dwie karty z grobu albo dwóch graczy — wybór był
   wtedy **nielegalny** (`commandForSelection` → `null`), a jedyną informacją
   zwrotną pozostawało wyszarzone „Zatwierdź”, **bez słowa czego brakuje**.
3. Kolejność wierszy wynikała z porządku odkrywania celów w wariantach, więc
   obie szufladki się **przeplatały** (`['gy1','p1','p2','gy2']`).

W bazie ten kształt ma **7 kart**: Grave Exchange oraz sześć w układzie
„twój stwór + stwór przeciwnika” (Knockout Maneuver, Diplomatic Relations,
Blade-Blizzard Kitsune, Ivy Lane Denizen, Malamet Battle Glyph,
Assert Perfection).

**Naprawa (`M207/2`)** — rozpoznanie po **strukturze wariantów**, nie po
nazwie karty (ADR 0002). `targetSlotsOf` odczytuje pozycje z **kolejności**
tablicy `targets` (silnik enumeruje iloczyn kartezjański, więc indeks
w `targets[]` = numer pozycji z `spell.targets`). Zwraca `null`, gdy rozbicie
nie ma sensu:

- warianty mają **różne długości** („up to N”, „any number”) → płaska lista,
- pozycje **dzielą kandydatów** (wspólna pula, np. „two target creatures”) →
  płaska lista, bo sekcje pokazałyby tych samych stworów dwa razy.

Dzięki temu Fireball i Wrap in Flames **zostają** przy formie z M195/C.

Kreator w trybie pozycyjnym:

```
Grave Exchange — wskaż po jednym celu dla każdej pozycji:
  1. karta-stwór w grobie:
     [ ] Hill Giant
     [ ] Goblin Piker
  2. gracz:
     [ ] Ty
     [ ] Nieprzyjaciel
  Brakuje: karta-stwór w grobie, gracz
```

- nagłówek pozycji bierze `targetTypeLabel` z deskryptora `spell.targets` —
  kreator etykiet **nie wymyśla**;
- wybór w obrębie pozycji jest **jednokrotny** (kolejne kliknięcie zastępuje);
- status wymienia **brakujące** pozycje („Brakuje: gracz”) zamiast milczeć;
- komenda składana jest **po kolejności pozycji** i odnajdywana
  w `legalCommands` — silnik pozostaje źródłem prawdy o legalności (L48).
  `commandForSelection` tu nie wystarczał, bo **sortuje** cele i gubi rolę
  pozycji.

Knockout Maneuver renderuje analogicznie `1. twój stwór:` / `2. stwór
przeciwnika:`.

---

## 2. Oś (b) — kafel karty pokazywał połowę prawdy

Znalezione na transkrypcie `ge-11.txt`, na karcie leżącej w ręce:

```
Grave Exchange · 6 · Sorcery · stwór z grobu na rękę + cel poświęca stwora
                               · cel: karta-stwór w grobie
```

Sekcja efektów mówi o dwóch rzeczach („+ cel poświęca stwora”), sekcja celów
wymienia **jedną**. `describeSpellEffects` czytał na sztywno
`spell.targets[0]` i milcząco gubił resztę deskryptora.

Najgorzej wypadały karty „twój stwór + stwór przeciwnika”:

```
Knockout Maneuver · cel: twój stwór
```

Z kafla wynikało, że czar dotyka **wyłącznie mojego** stwora, podczas gdy
Oracle mówi „put a +1/+1 counter on target creature you control, then it deals
damage equal to its power to **target creature an opponent controls**”. Gracz
planujący turę z ręki nie miał jak zobaczyć, że potrzebuje też celu po drugiej
stronie stołu — dowiadywał się dopiero w kreatorze.

Dotyczy **5 kart** o ≥2 pozycjach celu. Po naprawie (`M207/3`):

| karta | kafel po naprawie |
|---|---|
| Grave Exchange | `cel: karta-stwór w grobie + gracz` |
| Knockout Maneuver | `cel: twój stwór + stwór przeciwnika` |
| Diplomatic Relations | `cel: twój stwór + stwór przeciwnika` |
| Malamet Battle Glyph | `cel: twój stwór + stwór przeciwnika` |
| Assert Perfection | `cel: twój stwór + stwór przeciwnika (do jednego, opcjonalnie)` |

Zachowany wyjątek **M100/E10**: samotne „any target” nadal renderuje się jako
„dowolny cel”, bez przedrostka „cel:” (etykieta już zawiera to słowo).
Pierwsza wersja poprawki ten wyjątek **zepsuła** — sonda po 62 kartach
jednocelowych pokazała pleonazm „cel: dowolny cel”, stąd jawny warunek
i asercja w teście.

---

## 3. Oś (a) — timing i cele bota

Przebiegi po naprawach (`warhammer` vs `ravnica`, `--profile explorer
--policy-seed 4`, seedy 9/13/17/29/41) kończą się poprawnie, 0 zgłoszeń
detektorów. Przejrzane zagrania bota:

**Poprawne — nie zgłaszać:**

- `Piercing Rays → Rat` / `→ Hill Giant` — zatapnięcie realnego atakującego.
- `Toll of the Invasion → Ty`, `Liliana's Triumph → Ty` — czary bez wyboru
  lepszego celu w 1v1.
- `Selesnya Charm — tryb: Rycerz` — tryb tokena przy pustym stole.
- `Expose to Daylight → Wooden Stake / Contested Game Ball / Brawler's Plate` —
  za każdym razem realny artefakt przeciwnika, nie własny.
- `Courage in Crisis → Boros Challenger / Ivy Lane Denizen / Morph` — licznik
  +1/+1 zawsze na **własnym** stworze.
- `Chronic Flooding` — po naprawie z M206 bot zaczarowuje **cudze** landy
  (`Mountain`/`Plains`/`Island` przeciwnika w seedach 13/17/41), nie własne.
  Poprzednia sesja łapała tu dokładnie odwrotny błąd, więc poprawka trzyma.

**Znalezione, NIEnaprawione w tej sesji (wymaga zmiany w silniku):**

`Guildscorn Ward` — aura „enchanted creature has protection from
multicolored”. Bot rzuca ją chętnie (3 przypadki w sweepie: na `Morph`,
`Ivy Lane Denizen`, `Boros Challenger`), bo wycena `cast_permanent` traktuje
każdą nie-wrogą aurę na własnym stworze jako buff wart **+66**. Tymczasem
w matchupie `warhammer` vs `ravnica` przeciwnik ma **1 kartę wielokolorową na
48** (Terminal Agony) — ochrona jest w praktyce **martwa**, a bot płaci
kartę i manę.

Reguła byłaby generyczna (ADR 0002): aura **bez `pump` i bez `keywords`**,
której jedyny efekt to warunkowa ochrona, powinna być wyceniana wg tego, ile
realnych zagrożeń ta ochrona wyłącza. Problem: **`playerView` nie wysyła
`colors` dla obiektów na polu bitwy** (`game-state.js` ~ln 4596 — wpis
battlefield ma `power`/`toughness`/`keywords`, ale nie kolory; ograniczenie
świadome, bo CR 708.2 każe ukrywać kolory zakrytych permanentów). Bot nie ma
więc z czego policzyć, czy „protection from multicolored” cokolwiek blokuje.

Naprawa wymaga rozszerzenia widoku (z zachowaniem mgły wojny dla face-down)
i przewalidowania benchmarkiem — to osobny, samodzielny krok, świadomie
**nie** wciskany na koniec sesji. Dla kontekstu: aur „bez pump i bez keywords”
jest w bazie **11**, ale tylko Guildscorn Ward i Benevolent Blessing opierają
wartość na ochronie warunkowej; pozostałe (Hobble, Grounded, Spectral Prison,
Chronic Flooding…) mają już własne reguły wrogości.

---

## 4. Weryfikacja mutacyjna (L61)

Każda poprawka dostała test **i** kontrolę, że test faktycznie broni zmiany:

| mutacja | oczekiwanie | wynik |
|---|---|---|
| A: `slots: null` na stałe | RED | ✅ B1, B3, B4 FAIL |
| B: usunięcie bramki jednorodności | RED | ✅ B2 FAIL *(po poprawce, patrz niżej)* |
| C: powrót do `spell.targets[0]` w kaflu | RED | ✅ B5 FAIL |

**Mutacja B przeżyła pierwsze podejście** i to jest najciekawsza lekcja tej
sesji. Test B2 sprawdzał „up to three” i „any number of targets” — ale oba te
przypadki odpadają **wcześniej**, na warunku `sizes.length !== 1` (różne
długości list celów). Bramki jednorodności nie pinowały wcale.

Pinuje ją dopiero czar o **stałej** arności ≥2 z **jednej puli** (permutacje
`a/b/c` — „two target creatures”), gdzie sama arność niczego nie wyklucza.
Po dopisaniu tego przypadku mutacja B daje FAIL.

Wniosek do zapamiętania: **test przechodzący na przypadku odsianym przez
wcześniejszy warunek nie testuje warunku, o który nam chodzi.**

---

## 5. Stan końcowy

- `npm test` — **3222/3222**, `npm run build` — 54 moduły / 2648,5 kB.
- CI na PR #78 — **pass**.
- Commity: `87d4313` (M207/1), `17082c9` (M207/2), `6e8c3c5` (M207/3).
- Transkrypty: `tools/table-tester/audyt-m207/` (gitignored).

**Otwarte po tej sesji:** wycena aur ochronnych przez bota (sekcja 3) —
wymaga `colors` w widoku pola bitwy.
