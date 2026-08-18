# Audyt M138 — „wcielam się w gracza”, Żywy Tester (2026-08-18)

**Zlecenie właściciela:** rozegrać partie jako GRACZ przy wirtualnym stole,
obserwować interfejs i przebieg gry, zebrać **10 unikalnych znalezisk**, naprawić
je, a nowe klasy błędów dopisać do automatycznych detektorów Testera.

## Materiał

22 partie na prawdziwym artefakcie (`dist/mtg-table.html`, jsdom), wszystkie
kombinacje 12 talii, 5 profili gracza, `--tick-rate` 0–0,3, oba tryby logowania.

| Seria | Pary talii | Profile |
|---|---|---|
| p1, p-* | green·red, azorius·black, tokens·spellslinger, innistrad·wiedzmin, graveyard·mechanicy | greedy, explorer, defensive, random |
| q-* | red·green, sojusznicy·ostrza, wiedzmin·tokens, black·azorius, spellslinger·graveyard, mechanicy·innistrad | + `--tick-rate 0.2` |
| r-*, s-* | ostrza·sojusznicy, green·azorius, innistrad·graveyard, tokens·red, spellslinger·wiedzmin, azorius·mechanicy, graveyard·tokens, mechanicy·spellslinger, red·innistrad, sojusznicy·wiedzmin, ostrza·black, green·mechanicy | `--snapshot-every 1` |

**Detektory zgłosiły 7 rzeczy w 22 partiach — wszystkie znane albo z etykietą
ostrzegawczą.** Dziesięć znalezisk poniżej pochodzi z CZYTANIA transkryptu
w roli gracza; to jest wniosek sam w sobie i dlatego E4 dokłada trzy nowe
detektory (Z1, Z4, Z6 są wykrywalne mechanicznie).

---

## Z1 — bot rozdaje Zadeptywanie MOIM stworom (oś 1, bot)

**Co widziałem** (green vs red, seed 101, tura 28):

```
• Nieprzyjaciel aktywuje zdolność: Soulbright Flamekin → cel: Elemental
• Elemental zyskuje: zadeptywanie          ← Elemental jest MÓJ
• Nieprzyjaciel aktywuje zdolność: Soulbright Flamekin → cel: Giant Spider
• Giant Spider zyskuje: zadeptywanie       ← Giant Spider też MÓJ
```

24 aktywacje w jednej partii, w tym na Voice of the Vermin, Segmented Krotiq,
Dawntreader Elk, Woolly Loxodon — same moje stwory. Bot płacił {2} za
wzmocnienie przeciwnika, i to Zadeptywaniem, które liczy się tylko w ATAKU
na niego.

**Root cause:** `heuristic-bot.js` — pętla po efektach zdolności aktywowanej nie
zna typu `grant_keywords_until_end_of_turn` (0 wystąpień w pliku). Efekt spoza
listy nie zmienia `score`, więc każdy wariant miał gołe `score = 2` i bot brał
pierwszy z brzegu. Dokładnie ten sam wzorzec, co M135 przy scry.

**Nie jest to ślepota bota** (ADR 0017): `controllerId` celu jest w `PlayerView`,
`resolve_backup` obok korzysta z niego poprawnie.

## Z2 — koszt zdolności na kaflu kłamie (oś 2, UI)

**Co widziałem:** `Goblin Picker · {1}, {T}: dobierz 1 kartę`, a w logu:
`Nieprzyjaciel odrzuca Vandalize → koszt zdolności`.

Oracle: `{R}, {T}, Discard a card: Draw a card.` Kafel zgubił kolor pipa
(pokazał generyczne `{1}`) i CAŁY koszt „odrzuć kartę”.

**Root cause:** `abilityCostHtml` (render.js) obsługuje `discardCards` (liczbę),
a karty używają `discardCard` (boolean). Audyt wszystkich 304 kart rejestru
wykazał **8 pól kosztu bez obsługi**:

| pole | karty |
|---|---|
| `discardCard` | Goblin Picker, Fledgling Imp |
| `tapCreature` | Holdout Settlement, Dragonbroods' Relic |
| `tapOtherCreature` | Wedgelight Rammer, Warmaker Gunship |
| `removeCounter` | Trigon of Corruption, Rustvine Cultivator |
| `exileFromGraveyard` | Goldmeadow Nomad, Glitch Ghost Surveyor |
| `payLifeX` | Krumar Initiate |
| `sacrificeLand` | Seismic Monstrosaur |
| `maxPowerX` | Entrancing Lyre |

Gracz płaci koszt, o którym nie został uprzedzony — najgorszy rodzaj
niespodzianki w grze karcianej.

## Z3 — warunkowy keyword bez skutku: „gdy ma licznik +1/+1” i tyle

**Co widziałem:** `Ainok Artillerist · Creature — Dog Archer · gdy ma licznik
+1/+1 · 4/1`. Warunek jest, skutku nie ma. Oracle: „has reach as long as it has
a +1/+1 counter”.

**Root cause:** `describeStatic` pokazuje keywordy zdolności statycznej TYLKO
gdy ma ona `scope` (żeby nie dublować z `keywordLine`). Ale keyword warunkowy
trafia do `keywordLine` dopiero, gdy warunek JEST spełniony — więc dopóki nie
jest, znika z kafla całkowicie. Dotyczy 5 kart: Ainok Artillerist,
Evangel of Synthesis, Esper Stormblade, Gray Slaad, Crew Captain.

## Z4 — log mówi „nic się nie wydarzyło”, a efekt zadziałał (oś 2)

**Co widziałem** (green vs red, tura 35):

```
• Voice of the Vermin — trigger bez efektu (nic się nie wydarzyło (zerowy wynik))
```

a Giant Spider w tym samym kroku zmienił się z 1/3 na 3/3 (bazowe 4/4 z triggera
minus licznik −1/−1). Efekt **zadziałał**, a gracz przeczytał, że nie.

**Root cause:** `resolveTrigger` (triggers.js) uznaje „0 nowych zdarzeń” za
„brak skutku”. Trzy efekty mutują stan bez emisji zdarzenia i wpadają w tę
pułapkę: `set_base_pt_until_end_of_turn`, `lock_untap`,
`dont_untap_next_untap_step`. To wariant L24 „cichych skutków” — tym razem cisza
produkuje AKTYWNIE fałszywy komunikat.

## Z5 — etykieta celu gubi parametr

**Co widziałem:**
* `Sterling Keykeeper · {2}, {T}: cel: stwór bez podtypu — tap` (Oracle: non-**Mount**)
* `Selesnya Charm · … cel: stwór o sile ≥` (bez liczby! Oracle: power 5 or greater)
* `Lunar Rejection · … cel: stwór z podtypem` (Oracle: Wolf **or** Werewolf)
* `Entrancing Lyre · {X}, {T}: cel: stwór` (Oracle: power **X or less**)

**Root cause:** `TARGET_TYPE_LABELS` to mapa `typ → stały tekst`; typy
sparametryzowane (`subtype`, `subtypes`, `min`, `keyword`, `maxPowerX`) tracą
parametr. „Stwór o sile ≥” bez liczby to zdanie urwane w połowie.

## Z6 — Spacecraft przekroczył próg Station i nikt tego nie widzi

**Co widziałem:** `Warmaker Gunship · Artifact — Spacecraft · … · charge×6`,
przy progu **6+**. Zgodnie z Oracle to już artefaktowy stwór 4/3 z lataniem —
a kafel dalej pokazuje sam artefakt, bez P/T, bez Latania. W logu partii ZERO
komunikatów o przekroczeniu progu.

**Zweryfikowane w izolacji** (`/tmp/station.mjs`): engine jest poprawny —
`kind='creature'`, `types=['Artifact','Creature']`, `effectiveKeywords=['flying']`,
zdarzenie `station_status_changed` emitowane.

**Root cause:** `cardInfo` (render.js) buduje `types` z `details.types`
(statyczny rejestr karty), zamiast z `object.types` (stan gry). `power`/
`toughness` obok czytane są z obiektu — stąd niespójność. Gracz nie ma jak
się dowiedzieć, że wrogi statek stał się blokerem/atakującym.

## Z7 — „korzysta z efektu «you may»” — z jakiego?

**Co widziałem:**

```
• Nieprzyjaciel korzysta z efektu „you may"
```

Ani nazwy karty, ani co się stało. Chodziło o Soulbright Flamekin (8 many
z trzeciej aktywacji) — informacja krytyczna dla gracza, bo zapowiada duży ruch.

**Root cause:** zdarzenie `optional_trigger_resolved` NIESIE `sourceCardId`,
ale `describeGameEvent` go nie używa. Materiał leży w payloadzie i jest
wyrzucany.

## Z8 — Entrancing Lyre nie mówi o limicie siły celu

Wydzielone z Z5 jako osobny przypadek, bo dotyczy `cost.maxPowerX` (nie typu
celu): `{X}, {T}: cel: stwór — tap`. Oracle: „Tap target creature with power X
or less”. Gracz wybiera X, nie wiedząc, że X ogranicza też, kogo wolno tapnąć.

## Z9 — aura Grounded: kafel zupełnie pusty

**Co widziałem:** `Grounded · 2 · Enchantment — Aura` — i nic więcej. Cała
treść karty („Enchanted creature loses flying”) zniknęła.

**Root cause:** `auraLine` w render.js opisuje `pump`, `keywords` i `grantMana`,
ale nie `losesKeywords` — słowo `losesKeywords` nie pada w całym render.js ani
razu, mimo że engine (permanents.js) je obsługuje. Komentarz nad tym kodem mówi
wprost, że pusty opis aury to bug (M100/E10) — przypadek „odbiera keyword”
został wtedy przeoczony.

## Z10 — Regenerate: koszt bez nazwy efektu

**Co widziałem:** `Trestle Troll · Creature — Troll · Obrońca Zasięg · {3} · 1/4`.
Samotne `{3}` w środku kafla. Oracle: `{1}{B}{G}: Regenerate this creature.`

**Root cause:** zdolność ma `keyword: 'regenerate'` i `effect: []` (regenerację
obsługuje silnik po keywordzie). `describeAbility` opisuje `effect`, ma osobne
gałęzie dla `cycling` i `channel`, ale nie dla pozostałych zdolności
keywordowych — zostaje sam koszt. Przy okazji koszt gubi pipy kolorów (`{3}`
zamiast `{1}{B}{G}`), bo `describeAbility` skleja koszt inaczej niż
`abilityCostHtml`.

---

## Podsumowanie klas

| # | Znalezisko | Warstwa | Klasa |
|---|---|---|---|
| Z1 | bot buffuje wroga | bot | wycena efektu spoza listy |
| Z2 | 8 pól kosztu niewidocznych | UI | niekompletna mapa |
| Z3 | warunkowy keyword bez skutku | UI | luka między dwiema ścieżkami opisu |
| Z4 | fałszywe „nic się nie wydarzyło” | engine/log | cichy skutek (L24) |
| Z5 | typ celu gubi parametr | UI | niekompletna mapa |
| Z6 | Station niewidoczny na kaflu | UI | dane z rejestru zamiast ze stanu |
| Z7 | „you may” bez źródła | log | payload wyrzucony |
| Z8 | limit siły celu (maxPowerX) | UI | niekompletna mapa |
| Z9 | aura losesKeywords | UI | niekompletna mapa |
| Z10 | regenerate bez opisu | UI | brak gałęzi dla keywordu |

**Wzorzec:** 7 z 10 to „mapa/lista, która nie nadążyła za danymi” — dokładnie
klasa L29 (rejestr obiecujący/gubiący wpisy) i L31 (strażnik słownika ≠
strażnik użycia). Stąd naprawy dostają strażniki DWUSTRONNE: nie tylko „czy
etykieta istnieje”, ale „czy każde pole używane w danych ma pokrycie w opisie”.


---

## Z11 (bonus) — znalezione już przez NOWY detektor

Audyt kontrolny po naprawach (5 partii) nie miał wykryć niczego nowego —
i wykrył. `detectTruncatedCardText` zgłosił:

```
[ui] Kafel „Moonlit Meditation" nie pokazuje ŻADNEJ treści reguł
     Moonlit Meditation · 3 · Enchantment — Aura |
```

Oracle: „The first time you would create one or more tokens each turn, you may
instead create that many tokens that are copies of enchanted permanent”. Karta
zmienia zasady tworzenia tokenów, a kafel milczał — dokładnie ta sama rodzina
co Z9, tylko inne pole deskryptora (`replaceTokenCreation`).

Skan wszystkich aur wykazał cztery pola bez opisu: `cantAttack`, `cantBlock`,
`cantAttackYou`, `replaceTokenCreation` (karty: Hobble, Vow of Wildness,
Moonlit Meditation). Naprawione razem z Z9 — łatanie jednego pola zostawiłoby
resztę na następny audyt. Strażnik dwustronny (`test/m138-audyt-stolu.test.js`)
pilnuje odtąd KAŻDEGO pola deskryptora aury.

**To jest właściwa miara wartości detektorów:** klasa błędu, którą znalazłem
ręcznie, została zamieniona w regułę i ta reguła od razu znalazła kolejny
przypadek, którego ręcznie nie zauważyłem.

## Fałszywy alarm, który poprawił narzędzie

Ten sam audyt kontrolny zgłosił „Bot wzmacnia TWÓJ permanent (Silvanus's
Invoker)”. Weryfikacja w transkrypcie: bot **załogował** nim własny pojazd,
czyli stwór był jego. Przyczyna: zbiór nazw z mojego bitwiska kumuluje się
przez całą partię, a ta sama nazwa może wystąpić po obu stronach (dwie talie,
zmiana kontrolera).

Poprawka w testerze (nie w detektorze): sterownik zbiera też nazwy widziane po
stronie wroga, a detektor pomija nazwy niejednoznaczne. Milczenie jest tu
lepsze od zgadywania — narzędzie audytowe żyje z zaufania do swoich zgłoszeń
(L33: najpierw podejrzewaj narzędzie).

## Weryfikacja napraw

| Znalezisko | Dowód „przed” | Dowód „po” |
|---|---|---|
| Z1 | 24 aktywacje, cele: moje stwory | 10 aktywacji, wszystkie w stwory bota |
| Z2 | `{1}, {T}: dobierz 1 kartę` | `{R}, {T}, odrzuć kartę: dobierz 1 kartę` |
| Z3 | `gdy ma licznik +1/+1` | `Zasięg · gdy ma licznik +1/+1` |
| Z4 | „nic się nie wydarzyło (zerowy wynik)” | brak takich wpisów |
| Z8 | `cel: stwór` | `cel: stwór o sile ≤ X` |
| Z9 | `Grounded · Enchantment — Aura` | + `stwór traci: Latanie` |

Testy: `test/m138-audyt-stolu.test.js` (16) i `test/m138-detektory.test.js` (12).
Weryfikacja mutacyjna: przeciw kodowi sprzed audytu **14 z 16** testów pada.
Detektory sprawdzone dwustronnie na realnych transkryptach (10/1/2 zgłoszenia
przed naprawami, 0 po).
