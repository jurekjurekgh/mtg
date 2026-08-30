# Plan — M257 r5b (uwagi z testów, część 2), 2026-08-30

Kontynuacja PR #88. R5a (hover w Rozgrywce, blok pod presją życia, Bone
Splinters osobne wybory) zamknięta na `9e9ad1c` + fix M253 (`1eda1bd`).
Właściciel odesłał kolejną partię uwag („jak poprawisz poprzednią partię”).

## Zgłoszenia (wysłowne, właściciel)

**A.** „Opcja 'Tasuj talię' niech nie pokazuje żadnego komunikatu bo on nic
nie wnosi. Tylko podmiana seeda w polu seeda.”

**B.** „Zauważyłem, że Gracz zawsze zaczyna. Czy to kto zaczyna nie powinno
być losowe?”

**C.** „Karta Awaken the Sleeper. Ta karta służy do tego, żeby przejąć
kreaturę przeciwnika i zaatakować właściciela. Może też zniszczyć
equipmenty które ma założone. Na koniec tury wraca do właściciela. Bot nie
umie z niej korzystać. Przejął moją kreaturę, nic nie zrobił i zakończył
turę. To bez sensu. Po co ją przejmował? Jak już przejął to powinien
zaatakować właściciela. A najlepiej jakby przejął moją kreaturę z
założonym equipmentem jeśli taki mam i go zniszczył. Ale jeśli nie ma
takiej możliwości to przynajmniej powinien mnie zaatakować.”

**D.** „Czar Ruthless Invasion. Można go zapłacić życiem zamiast R. Bot robi
dwa błędy na raz: D1. Ma czerwoną manę (akurat zatapniętą, ale w przyszłej
turze będzie miał ją odtapowaną) i koniecznie chce rzucić ten czar więc
płaci życiem. Ja bym w ogóle nie pozwolił mi płacić życiem, chyba, że
naprawdę policzy, że jego atak zabije przeciwnika w tej turze dzięki temu
zakazowi blokowania. D2. Bot rzuca Ruthless Invasion po czym kończy turę
bez ataku. No to już jest kompletny bezsens. Skoro nie zamierza atakować to
ten czar to czyste marnotrawstwo.”

## Znajdzenia (recon 2026-08-30)

### A — komunikat po „Tasuj talię”
- `main.js` handler `shuffle-seed`: `el('seed').value = randomSeed()` +
  `showNotice('Nowe ziarno: … — kliknij „Rozpocznij partię”…')`.
- Root cause: komunikat z 2026-08-07 (dodany przy przycisku) — właściciel
  go nie chce; seed w polu mówi wszystko.
- Fix: usunąć `showNotice`; zostaje podmiana `el('seed').value`.

### B — „Gracz zawsze zaczyna”
- `createGameState`: `turn: initialTurn(ids[0])` — starterem jest ZAWSZE
  `players[0]` (w stole: p1 „Ty”).
- Reguły CR 103.7a / 103.4 zaszyte w `players[0]` (4 miejsca):
  1. `game-state.js:632` — oferta doborania tury 1: starter nie dobiera;
  2. `game-state.js:1337` — po mulliganach priorytet dostaje `players[0]`;
  3. `game-state.js:4702` — akcja turowa doborania: starter pomija;
  4. `setup.js:43` — kolejność mulliganów zaczyna `players[0]`
     (CR 103.4: pierwszy mulliganiuje ten, kto zaczyna).
  (`game-state.js:4319` to „drugi gracz” w 1v1 — niezależne od startera.)
- Root cause: brak pojęcia startera — partia startuje od tablicy graczy.
- Fix: `state.starterId` = losowanie z seeda (`createRng(seed).next()` z
  `src/engine/rng.js`, mulberry32 — deterministyczne, ADR 0005);
  `turn: initialTurn(starterId)`; cztery miejsca powyżej czytają
  `state.starterId`. UI nie wymaga zmian (wskaźnik tury pokazuje aktywnego).

### C — Awaken the Sleeper: bot nie atakuje przejętym stworem
Reprodukt (scenariusz właściciela, 5/5 bloker na planszy): bot rzuca
czar, `resolve_destroy_equipment_choice destroy=true` (niszczy equipment —
OK), ale **`declare_attackers atk=[]`** i tura się kończy. W wariantzie
bez blokera bot atakuje — więc usterka widoczna gdy właściciel ma czym
zablokować.
- Root cause 1 (atak): wycena `declare_attackers` traci stwora
  PRZEJĘTEGO jak własnego — gałęzie „ginie od blokera” (chump `-10`,
  `diesBeforeDealingDamage` `-(toughness+8)`) karzą utratę atakującego.
  Tymczasem stwór z `tempControlUntilTurn` wraca do właściciela na koniec
  tury — jego „utrata” to strata WŁAŚCICIELA (albo wraca, gdy przeżyje).
  Atak stworem pożyczonym nie ma dla bota żadnego downside'u.
- Root cause 2 (wybór celu): efekt `gain_control_until_end_of_turn` nie ma
  ŻADNEJ wyceny w pętli efektów `cast_spell` — wszystkie warianty celu
  dostają tę samą bazę 50 i wygrywa pierwszy z enumeracji. Właściciel
  chce, by bot preferował cel z założonym equipmentem (decyzja o zniszczeniu
  idzie w ślad za przejęciem).
- `resolve_destroy_equipment_choice` działa (destroy=true) — zostaje.

### D — Ruthless Invasion: płatność życiem + brak ataku
- Root cause (D2): `cant_be_blocked` na własnym stworze = płaskie **+10**
  (`heuristic-bot.js:2505`) — czar wyceniany na ~59 pkt niezależnie od
  tego, czy stwór cokolwiek zrobi. Bot rzuca i kończy turę.
- Root cause (D1): płynie z D2 — wariant `phyrexianPayWithLife` (k=1) ma
  karę tylko `-2k`; gdy czerwona mana jest niedostępna (zatapnięta) silnik
  oferuje wyłącznie wariant życiowy, a wycena czaru i tak przewyższa pass.
  Reguła właściciela: płatność życiem tylko gdy atak (nieblokowalny) zabija
  przeciwnika W TEJ turze.

## Etapy (każdy = osobny zielony commit)

Kolejność: A → B → C → D (B zmienia asymetrię stron, więc benchmarki
C/D mierzone po B). Bramka każdego etapu: `node tools/run-tests.mjs all`
(brama CI) + `node tools/build.mjs`; etapy bota (C, D) dodatkowo quick
benchmark przed/po (ADR 0018, bez `--full`).

### Etap A — „Tasuj talię” bez komunikatu [UI] ✅ DONE (49cb7f0)
1. `main.js`: usunąć `showNotice` z handlera `shuffle-seed`.
2. Test (rozbudowa `test/table-ui.test.js` lub nowy plik r5b): klik
   `shuffle-seed` → seed zmieniony (1..999999) + modal `notice` NIEAKTYWNY.
   RED: asercja braku komunikatu na starym kodzie.

### Etap B — losowy starter [engine] ✅ DONE (0f389fa)
1. `game-state.js`: `createGameState` liczy `starterId`
   (`createRng(seed).next() * players.length` → indeks; 1v1 = 50/50),
   `turn: initialTurn(starterId)`; pola `state.starterId`.
2. Zamiana `players[0].id` → `state.starterId` w: 632 (oferta doborania),
   1337 (priorytet po mulliganach), 4702 (akcja turowa doborania),
   `setup.js:43` (kolejność mulliganów) + komentarz `setup.js:37`.
3. Testy:
   - starter deterministyczny z seeda: ten sam seed → ten sam starter;
     próba seedów pokrywa oba gracze (np. 20 seedów → oba id występują);
   - CR 103.7a w obu wariantach: starter NIE dobiera w turze 1, drugi tak
     (oferta `draw_card` / akcja turowa);
   - mulligany: priorytet zaczyna starter (CR 103.4).
   - Oczekiwane: część testów zakłada „p1 zaczyna” — poprawić je JASNO
     (jawnie ustawiają starter albo czytają `state.starterId`), nie maskować.
4. Benchmark przed/po (losowanie zmienia strony w meczach lustrzanych —
   spodziewany drobny przeskok, bez regresji w progu `bot-benchmark.test.js`).

### Etap C — Awaken the Sleeper [bot] ✅ DONE (1179ce0)
1. `declare_attackers` (heuristic-bot.js:3566+): dla atakującego z
   `tempControlUntilTurn === view.turn.number` (stwór pożyczony — generyczna
   flaga, bez nazw kart, ADR 0002; w PlayerView trzeba ją upewnić w
   projekcji pola bitwy): wycena bez downside'u — „śmierć” atakującego to
   strata przeciwnika. Gałęzie pożyczonki:
   - otwarte pole: `power + attackThroughBonus` (jak dziś, bez zmian);
   - blokerzy, atakujący ginie od blokera: `power + attackThroughBonus`
     + wartość usuniętego stwora przeciwnika (`power + toughness`) —
     właściciel traci permanent (albo stwór wraca, gdy nie zginie);
   - wymiana (zabija blokera i ginie): jak wyżej + moc zablokowanego obrażeń
     nie przejdzie, ale właściciel traci DWA stworы — najkorzystniejszy
     wariant.
   Cel ataku: właściciel (jedyne legalne cele to gracze) — bez zmian.
2. Wycena celu `cast_spell` (pętla efektów): gałąż
   `gain_control_until_end_of_turn`:
   - `score += 3 * power` (stwór atakuje w tej turze — haste/untap z
     efektu; wartość = obrażenia bojowe),
   - bonus equipmentu założonego na celu: `+25 + 5 * liczba` (właściciel:
     „najlepiej z założonym equipmentem… i go zniszczył”) — preferencja
     celu wyposażonego,
   - brak celu: kara (efekt bez celu).
3. Testy (scenariusze z reproduktu, wzorzec m230/bot-combat-prevention):
   - C1 (otwarte pole): bot rzuca, niszczy equipment, ATAKUJE przejętym
     stworem (owner dostaje obrażenia);
   - C2 (scenariusz właściciela: 5/5 bloker): bot NIEATKUJE = RED → po
     fixie atakuje (przejęty stwór ginie od blokera = strata właściciela,
     bot nie traci nic);
   - C3 (wybór celu): cel 1/1 z equipmentem vs cel 4/4 bez — bot wybiera
     wyposażonego;
   - C4 (anty-overfix): stwór pożyczony wraca do właściciela po turze
     (inwariant: kontroler po cleanup) — test inżynieryjny zachowania
     silnika, że fix bota nie rusza reguł.
4. Benchmark przed/po.

### Etap D — Ruthless Invasion [bot] ✅ DONE (57bf588)
1. `cant_be_blocked` (heuristic-bot.js:2505) — wycena warunkowa:
   - cel WROGA: kara jak dziś (`-60`) — bez zmian;
   - cel WŁASNY: wartość tylko gdy stwór MOŻE realnie zaatakować w tej
     turze: moja tura + krok do combatu włącznie (`main1`/`main2`/
     `beginning_of_combat` przed deklaracją) + nietapnięty + bez choroby
     (albo haste) + `power > 0`. Wtedy: `2 * power` + bonus, gdy atak
     przechodzi (brak blokerów albo zabija najsilniejszego bloker
     `power >= strongestBlockerToughness`) + bonus LETHAL
     (`power >= życie wroga` — atak zabija; to jedyny uzasadniony powód
     płacenia życiem, D1). W pozostałych krokach/tapnięty/0 mocy:
     `-90` (karta na nic — musi spaść poniżej passu, D2).
2. D1 (płatność życiem) nie wymaga osobnej gałęzi: gdy atak nie ma
   wartości, cały czar spada poniżej passu (bot nie rzuca ani w wariancie
   manowym, ani życiowym); gdy jest (lethal), `phyrexianPayWithLife`
   przejmuje — kara `-2k` zostaje, premia lethal przewyższa.
3. Testy:
   - D2a: 3/3 nietapnięty, main1, otwarte pole → bot RZUCA (RED dziś:
     także rzuca, ale decyduje wariant z blokerem — patrz D2b);
   - D2b: 3/3 + wrogie 5/5 nietapnięte, main1 → po fixie NIE RZUCA
     (atak chumpowy — czar bez sensu);
   - D1a: bez czerwonej many, 4/4 nietapnięte, wróg przy 4 życiu, otwarte
     pole → bot RZUCA wariantem `phyrexianPayWithLife: 1` (lethal);
   - D1b: to samo, wróg przy 12 życia → bot NIE RZUCA (życie za nic).
4. Benchmark przed/po.

## Ryzyka

- **B**: największy promień — testy i benchmark zakładają asymetrię stron
  (p1 = start). Progi regresji `bot-benchmark.test.js` mogą drgnąć od
  losowania startera (miary lustrzane). Mitigacja: bramka pełna +
  benchmark przed/po w opisie etapu; jeśli próg drgnie — decyzja z
  właścicielem, nie cisza.
- **B**: projekcja PlayerView nie niesie `starterId` (niepotrzebna — testy
  czytają state). UI bez zmian.
- **C**: overwycena pożyczonki — atak „za darmo” nie może zacząć się
  pojawiać przy stworach, które NIE są pożyczonymi (flaga
  `tempControlUntilTurn` tylko w tym efekcie — zweryfikowane grepem).
- **D**: okno „main przed atakiem” — czar rzucany w `end`/`main2 po
  combacie` musi spaść poniżej passu (kara `-90` musi przebić bazę 50 +
  scry — wzorzec M236/Inspire Awe).
- (ogólnie) ADR 0016 B: chirurgicznie — etapy nie ruszają się wzajemnie;
  C i D dotykają różnych gałęzi wyceny.

## Etap dokumentacji (na końcu, osobny commit) ✅ DONE

- PR #88: tytuł „r1–r5” + sekcja r5b w opisie (zgłoszenia, root causes,
  benchmarki per etap);
- `docs/PROJECT_HISTORY.md`: wpis r5b;
- ten plan: odhaczanie etapów po każdym zielonym commicie.
