# Audyt M206 — rozgrywki Żywym Testerem (2026-08-25)

**Zlecenie właściciela:** przeprowadzić kilka partii Żywym Testerem
i przeanalizować transkrypty pod kątem błędów na każdej ścieżce, ze szczególnym
naciskiem na:

- **(a)** efektywność czarów i zdolności bota (timing, wybór celu),
- **(b)** poprawne grupowanie i jednoznaczne opisy opcji targetowania,
- **(c)** czy czary wielocelowe używają modala z listą legalnych celów
  i ptaszkiem, a nie wyliczanki kombinacji.

Gałąź: `arena/01a038fe-mtg` (PR #78). Commity `M206/1`–`M206/4`.

---

## 0. Rzecz, która musiała pójść pierwsza: audyt nie działał

Pierwsze przebiegi na części seedów **nie kończyły się**. Transkrypt zawierał
300 identycznych linii o tym samym oknie wyboru, zero wykonanych ruchów —
i pogodne podsumowanie `== DETEKTORY: brak zgłoszeń ==`.

Sterownik testera szukał zaznaczeń jako
`.choice-request-option input[type="checkbox"]`. Kreator wielocelowy renderuje
**przyciski** `.multi-target-toggle` ze stanem w tekście (`[ ]` / `[x]`);
`<input type=checkbox>` nie ma w nim ani jednego (`grep` po
`src/table/choice-request.js`: checkboxy są wyłącznie w ptaszku wyciszenia
i w kreatorze walki). Selektor nie pasował do niczego → pusta lista zaznaczeń
→ „Zatwierdź” zostawał `disabled` → „Anuluj” **odtwarzał to samo żądanie
wyboru** → pętla.

**Konsekwencja dla zlecenia:** żaden czar wielocelowy (Fireball, Wrap in
Flames, Grave Exchange) ani mulligan z odłożeniem kart **nie był nigdy
przeklikany** przez audyt — czyli dokładnie klasa (c). Dwa błędy UI opisane
niżej czekały tam od wprowadzenia kreatora.

Drugi błąd w tej samej gałęzi: regex `zaznacz cele \((\d+)\)` nie pasował do
intro mulligana („Mulligan: zaznacz 2 karty…”), więc liczba potrzebnych
zaznaczeń zawsze spadała do 1.

Naprawione w `M206/1`. Materiał audytu to **19 przebiegów** (partie A–E) na
9 taliach i 5 profilach polityki.

---

## (c) Forma modala wielocelowego — **mechanizm jest poprawny**

Odpowiedź na pytanie właściciela: **tak, lista z ptaszkiem istnieje i jest
ogólna** — nie ma wyliczanki kombinacji.

`multiTargetPlanOf` (`src/table/multi-target.js`) wykrywa grupę wariantów tego
samego rzutu i wyprowadza z niej dwa niezależne wymiary: zbiór celów
(`targets`, `minTargets`/`maxTargets`) oraz licznik `X` (`hasX`, `xMin`/`xMax`).
`commandForSelection` odnajduje zatwierdzony wybór wśród `legalCommands` —
silnik pozostaje jedynym źródłem prawdy o legalności (L48).

Sprawdzone wprost sondą:

| przypadek | wynik |
|---|---|
| Fireball (21 kombinacji celów × X) | plan: 3 wiersze + licznik X 1–3 |
| Wrap in Flames („up to three”) | plan: wiersze na cel, min 0 / max 3 |
| czar o **stałych 2 celach** | plan powstaje (`sizes[0] > 1`) — **nie** rozsypuje się na kombinacje |
| czar jednocelowy (Terminal Agony) | `null` → zwykła lista opcji, po jednym wierszu na cel |

Ostatni wiersz to zachowanie **pożądane**, nie błąd: przy 10 legalnych celach
panel pokazuje 10 opcji, a nie 10 kombinacji.

Skan wszystkich transkryptów pod kątem eksplozji kombinacji (ta sama nazwa
karty ≥ 4 razy w jednym panelu) dał **jeden** wynik — Terminal Agony ×10,
czyli właśnie poprawna lista celów.

**Wniosek:** w tej osi nie było czego naprawiać w produkcie. Naprawy dotyczyły
narzędzia, które tego mechanizmu nigdy nie dotknęło.

---

## (b) Jednoznaczność opisów celów — **1 błąd, naprawiony**

### B1. Wiersze kreatora nie mówiły, czyj jest permanent

Przy lustrzanej planszy kreator pokazywał:

```
[ ] Squirrel          <- mój
[ ] Squirrel          <- wroga
[ ] Goblin Picker
```

Wiersze różniły się **wyłącznie ukrytym id obiektu**. Przy Wrap in Flames
(„1 obrażenie każdemu z celów”) to różnica między zabiciem swojego a cudzego
stwora.

Zwykłe listy celów rozwiązały to już w E (2026-08-11) — w transkrypcie audytu
widać `Rzuć: Brute Force (koszt R) → cel: Rat (Ty)` i
`→ cel: Ghost Warden (Nieprzyjaciel)`. Kreator z M195/C dostał własny, uboższy
`objectOrPlayerName` i tej zasady nie odziedziczył.

Naprawa (`M206/2`): `controllerTag` powtarza warunki oryginału — tylko
permanenty na polu bitwy, tylko przy znanym kontrolerze i dwóch graczach, skip
dla własnego face-down (ma już znacznik „(morph)”). Gracz jako cel zostaje bez
nawiasu — nie jest permanentem.

### B2. „Mulligan: zaznacz **5 karty**”

Intro mulligana składał warunek dwuwartościowy (`count === 1 ? 'kartę' :
'karty'`), choć projekt ma `polishPluralCount` z formą dopełniaczową i reszta
stołu (dobieranie, mielenie, odrzucanie) używa jej od dawna. Mulligan do
6 kart jest osiągalny — zmierzone w transkrypcie: „zaznacz 5 karty”, „zaznacz
6 karty”. Naprawione w `M206/1`.

### Grupowanie — bez zastrzeżeń

Dedupe etykiet działa: dwa identyczne tokeny w panelu dostają
`Soldier (Nieprzyjaciel) (1 z 2)` / `(2 z 2)` (`labelChoiceOptions`).

---

## (a) Efektywność bota — **2 błędy, oba naprawione**

### A1. Pump w oknach, w których nic nie kupuje

Transkrypt (warhammer vs innistrad, seed 8, profil explorer), trzy razy
w jednej partii:

```
• Faza: Początek walki
• Nieprzyjaciel aktywuje zdolność: Snarling Wolf — zmiana statystyk celu
```

…i ani jednego ataku w tej turze. Snarling Wolf to `{1}{G}: +2/+2 do końca
tury`. Dwie many na efekt, który wygasa w cleanup (CR 514.2).

**Root cause:** bramka brzmiała `const inCombat = view.turn.phase ===
'combat'`, a `beginning_of_combat` należy do fazy `combat` (`TURN_STEPS`).
Komentarz nad tym samym warunkiem mówił „po deklaracji atakujących/
blokujących” — kod tego nie egzekwował.

**Pierwsze podejście było za wąskie.** Wykluczenie samego
`beginning_of_combat` przesunęło marnotrawstwo w dwa inne okna (zmierzone
w przebiegu weryfikacyjnym: koniec walki bez udziału w walce, upkeep
przeciwnika). Reguła generyczna: pump „do końca tury” kupuje coś **tylko gdy
stwór realnie bierze udział w walce** (`attacking || blocking`); dopóki
deklaracji nie ma, czekanie nic nie kosztuje. Druga część: kara za jałowe okno
obejmowała dotąd wyłącznie własną turę, więc w turze przeciwnika pump poza
walką był dla bota darmowy.

Kontrola braku nadgorliwości: wilk atakujący i zablokowany przez 2/2 **nadal**
dostaje pump — tam +2/+2 rozstrzyga wymianę.

Efekt w rozgrywce (ta sama partia, ten sam seed): aktywacje pumpa **5 → 1**,
a pozostała jest w Głównej 1 przed atakiem, gdzie przyrost siły wchodzi do
walki.

### A2. Aura milląca własnego kontrolera na WŁASNYM landzie

Transkrypt (dominaria vs ravnica, seed 19, profil random), pięć razy w jednej
partii:

```
• Nieprzyjaciel rzuca Chronic Flooding → cel: Island      <- własny
• Chronic Flooding — trigger (zatapnięcie zaczarowanego permanentu)
• Nieprzyjaciel mieli Forced Landing do grobu
```

Bot płacił `{1}{U}` za to, żeby mielić **siebie** po 3 karty przy każdym
tapnięciu własnego landu.

**Root cause:** `auraIsHostile` rozpoznawało wrogość zapisaną w deskryptorze
aury albo w jej triggerze **wejścia**, i tylko dla efektów wrogich
PERMANENTOWI (`HOSTILE_PERMANENT_EFFECTS`). Chronic Flooding uderza
w **gracza** (mill 3) i to triggerem **późniejszym** („whenever enchanted land
becomes tapped”), więc aura wyglądała dla bota jak zwykły buff za +66.

Naprawa po deskryptorze, nie po nazwie (ADR 0002): trigger niosący efekt
z `applyTo: 'enchanted_controller'` obecny w `HOSTILE_PLAYER_EFFECTS` czyni
aurę wrogą. Bot zaczarowuje teraz land przeciwnika — czyli gra tą kartą
zgodnie z jej przeznaczeniem.

Efekt w rozgrywce: „Nieprzyjaciel mieli …” **4 → 0** przy tym samym seedzie.

### Sprawdzone i uznane za POPRAWNE (nie zgłaszam jako błędy)

- `Withstand → cel: Nieprzyjaciel` — prewencja obrażeń celuje w gracza; rider
  „draw a card” daje kartę niezależnie od tego, czy obrażenia nadejdą.
- `Piercing Rays → cel: Zombie` — „exile target **tapped** creature”, cel
  faktycznie zatapniony.
- `Blazing Torch — obrażenia w cel → cel: Ty` — poświęcenie ekwipunku
  w obrażenia w gracza przy odchodzącym nosicielu.
- `Ghoulcaller's Bell` ×5 — „each player mills a card”, symetryczny, przy
  przewadze bota w wyścigu bibliotek.

---

## Wpływ na siłę gry (benchmark szybki, 672 mecze)

| | przed sesją | po `M206/3` | po `M206/4` |
|---|---|---|---|
| heuristic ogółem | 79,6% | 82,3% | **82,4%** |
| heuristic vs random | 88,7% | 92,3% | **92,6%** |
| heuristic vs aggro | 70,5% | 72,3% | **72,3%** |

Naprawy timingu i wyboru celu przełożyły się na mierzalny wzrost, a nie tylko
na ładniejszy transkrypt.

---

## Utwardzenie narzędzia

Klasa błędu z sekcji 0 nie mogła zostać bez zabezpieczenia. Gałąź kreatora
w `run-game.mjs` liczy teraz nieudane próby zamknięcia **tego samego** okna
(`intro` jako tożsamość), loguje numer próby wraz z liczbą znalezionych
wierszy i po piątej przerywa przebieg wyjątkiem. Licznik zeruje się po udanym
zatwierdzeniu. Bez tego „Anuluj”, które odtwarza żądanie, nie ma jak zakończyć
przebiegu.

Kontrakt DOM, na którym stoi sterownik, jest teraz przypięty testem po stronie
aplikacji (`test/m195-multi-target.test.js`): wiersz to klikalny
`.multi-target-toggle`, w kreatorze nie ma `<input>`, stan siedzi w tekście
`[ ]`/`[x]`.

---

## Stan testów

`npm test` **3217/3217**, build 54 moduły / 2642,9 kB. Wszystkie nowe testy
zweryfikowane mutacyjnie (L61): pokazany RED po cofnięciu fiksu i GREEN po
przywróceniu.

Nowe lekcje: **L63** (selektor bez dopasowania = cicha pętla i fałszywe
„brak zgłoszeń”), **L64** (bramka na fazę ≠ bramka na moment; wyceniaj efekt
ulotny po STANIE, nie po nazwie kroku).
