# PLAN 2026-11-05 — zgłoszenie D: combat triki z instantów rzucane poza walką

## Zgłoszenie właściciela

> „Karta Dragonscale Boon. »Put two +1/+1 counters on target creature and
> untap it.« Kolejna karta, która jest instantem, a bot nie korzysta z niej
> tak jak powinien. 90% kart instant to combat triki, które powinny być
> rzucane tylko podczas walki, po deklaracji blokerów przy własnym ataku albo
> po deklaracji atakujących przy ataku przeciwnika. Wtedy taki combat trick
> robi różnicę — w przypadku tej karty buffuje (i to na stałe) +2/+2 i jeszcze
> odtapowuje (co może pozwolić na blokowanie kreaturą, o której przeciwnik nie
> wiedział). Tymczasem bot rzuca ten czar jak tylko ma na niego manę (w swoim
> podtrzymaniu). Totalnie bez sensu marnuje potencjał tego triku. Popraw to
> i zrób audyt wszystkich instantów bo to już kolejna karta zakodowana w ten
> sposób (a właściwie scoring tej zdolności zakodowany niepoprawnie). Zrób
> sobie listę-roadmapę kart/zdolności tego typu do poprawy i po kolei je
> poprawiaj (możliwe że w wielu sesjach)."

## Rozpoznanie (pomiar 2026-11-05)

- Rejestr ma **91 instantów**. Profil triku bojowego (pump / trwałe liczniki /
  granty keywordów / untap na stwora) to ok. 25 kart.
- **Tymczasowy pump z instantu ma już bramkę okna walki** (`temporaryPumpPayoff`
  i gałąź tempPump: wartość tylko, gdy cel walczy i pump zmienia wynik,
  M146/M179) — ta klasa jest załatwiona, do zweryfikowania w audycie.
- **Luka zgłoszenia:** trwały licznik statystyk (`add_counter` z korzystnym
  licznikiem, np. `+1/+1`) z instantu wycenia `counterHostValue` — płaska
  wartość bazowa w KAŻDEJ fazie, bez względu na `spell.timing`. Dragonscale
  Boon ({3}{G}: 2 liczniki + odkręcenie) dostaje w podtrzymaniu pełny kredyt:
  liczniki za ok. 2 + 4·2 + 2·wartość gospodarza oraz odkręcenie bez
  kontekstu — i przebija `pass_priority`.
- Istniejące wyjątki w `counterHostValue`, które bramka MUSI respektować:
  licznik domykający grę (`counterLethalClockBonus`), licznik ratujący
  skazanego gospodarza (`counterSavesHost`), licznik poprawiający trwającą
  walkę (`counterCombatBonus`).
- Odkręcenie (`untap_permanent`) jako rider instantu: wartość zaskoczenia
  blokującego istnieje tylko w oknach walki (osobna klasa Savage Surge ma
  własne predykaty okien `isSavage*Window`); przy licznikach rider dziś nie
  niesie ani premii bojowej, ani kary za zmarnowanie.

## Roadmapa audytu instantów (kolejność = priorytet)

### K1 — trwałe liczniki z instantu (TO ZGŁOSZENIE, etap 1 tej sesji)
- Dragonscale Boon (`add_counter +1/+1 ×2 + untap_permanent`),
  Fleeting Flight (`add_counter + grant keywordów + prewencja bojowa`),
  Lifecrafter's Gift (`add_counter + rozlanie liczników`; instant).
- Naprawa generyczna po deskryptorze (ADR 0002): instant z korzystnym
  licznikiem statystyk na własnego stwora trzymamy na okno walki — poza nim
  kara trzymania (`counterInstantHoldPenalty`), z wyjątkami: trwająca walka
  z poprawą wyniku, ratunek skazanego gospodarza, licznik domykający grę.
  Odkręcenie-rider: premia tylko, gdy odkręcenie realnie dokłada blokującego
  albo atakującego w bieżącej walce; poza walką rider nie dokłada wartości.

### K2 — instanty z samym odkręceniem / odkręceniem jako głównym efektem
- Savage Surge (ma okna `isSavage*Window` — zweryfikować, czy wycena spoza
  okien nie przebija passa), Magic Damper, High Stride (pump+grant+untap:
  część pump jest bramkowana, rider untap do sprawdzenia), Twiddle-kształtne
  (`tap_or_untap_permanent` jako opcja).

### K3 — tymczasowy pump i granty keywordów (weryfikacja istniejącej bramki)
- Brute Force, Awaken the Bear, Titan's Strength (pump+scry — rider scry nie
  może sam ciągnąć rzutu poza walką), You're Not Alone, Coat with Venom,
  Vampire's Bite, Artful Maneuver, Crumb and Get It, Violent Urge,
  Might of the Masses (pump od liczby stworów), Trumpet Blast
  (`buff_attacking_creatures`), Fake Your Own Death / Supernatural Stamina
  (pump+grant_abilities), Diplomatic Relations (pump+fight-bite),
  Timely Interference (debuff+kicker wymuszonego bloku), Hysterical Blindness
  i Turn the Tide (`buff_opponents_creatures` — debuff masowy).

### K4 — removal i obrażenia z instantu (weryfikacja okien odpowiedzi)
- `damage` w dowolny cel (polityka śmiertelnego celu istnieje — zweryfikować
  rzuty w twarz poza walką i trzymanie na odpowiedź), `destroy_permanent`,
  `exile_permanent`, bounce (ma `bounceCastTimingDelta` — zweryfikować),
  fight/bite (`damage_from_target_power`).

### K5 — kontrczary i odpowiedzi na stos
- `counter_spell`, `counter_spell_unless_pays` (+ridery scry/token/bounce):
  czy bot trzyma manę i kontruje tylko to, co się liczy; czy nie przepala
  kontry na błahostkę w pierwszej głównej przeciwnika.

### K6 — reszta instantów (przegląd lekki, tylko potwierdzone luki)
- dobieranie/kantrypy (`draw_cards`, scry/surveil-ridery), tokeny w tempie
  instantu, tutorzy (`search_library_to_battlefield`), masowe debuffy,
  prewencje (`prevent_next_damage`, `prevent_all_combat_damage_this_turn` —
  Fog-kształt: wartość wyłącznie w walce), modalne instanty (tryby wyceniane
  per tryb — sprawdzić, czy tryb-trik nie ciągnie rzutu poza walką).

Każda klasa: reprodukcja na prawdziwych kartach i komendach → test RED →
naprawa po deskryptorze efektu (zero nazw kart) → mutacja → bramki.
Klasy bez luki zamykamy pomiarem w tym planie, nie „na oko".

## Etapy tej sesji (K1)

- [x] Etap 1: reprodukcja sondą — Dragonscale Boon w podtrzymaniu własnej
  tury przy wolnej manie: bot rzuca zamiast pasować; w walce po deklaracji
  blokujących rzuca i to się opłaca (kontrola pozytywna).
- [x] Etap 2: testy RED (`test/zgloszenie-d-dragonscale-okno.test.js`):
  pas w podtrzymaniu i w głównej bez walki; rzut w walce zmieniającej wynik;
  wyjątki: licznik ratujący stwora przed śmiertelnymi obrażeniami,
  licznik domykający grę; odkręcenie dokłada nieoczekiwanego blokującego.
- [x] Etap 3: naprawa w `heuristic-bot.js` (+ parametr w
  `heuristic-params.js`): bramka trzymania instant-liczników poza walką,
  premia bojowa ridera odkręcenia. Zero nazw kart.
- [x] Etap 4: bramki — pakiet pokrewny wycen bota, `npm test`,
  `npm run build`; osobny commit i push. Golden-master scoringu: świadoma
  regeneracja tylko, gdy dryf dotyczy wyłącznie scen instant-liczników.
- [~] Etap 5: dokończenie audytu K2–K6 pomiarem (sondy wycen per klasa);
  klasy z luką dostają własne etapy/testy w kolejnych commitach tej sesji
  albo wpis do tego planu jako kontynuacja następnej sesji.
- [x] Etap 6: pełny `npm run test:all`, plan/historia/handoff, opis PR #179,
  CI i `mergeable_state`. Bez scalania, force-push, nowych kart, pełnego B0.

## Wynik sesji 2026-11-05 (K1 + audyt pomiarowy K2/K3)

**K1 ZAMKNIĘTE (commit `fcb8a83`).** Bramka trzymania w gałęzi `cast_spell`
bota: instant z korzystnym licznikiem statystyk na własnego stwora traci poza
oknem walki nowy parametr `counterInstantHoldPenalty` (120, `×0` = dawne
zachowanie). Okna dozwolone: cel już walczy, blokujący-niespodzianka po
deklaracji atakujących wroga (tapnięty cel tylko, gdy ten sam czar go
odkręca), licznik domykający grę w tym ataku. Sorcery i zdolności aktywowane
bez zmian. Dowód: `test/zgloszenie-d-dragonscale-okno.test.js` (D/1–D/5 na
prawdziwych decyzjach bota: RED 3/5 przy kontroli pozytywnej, po naprawie
5/5; mutacja kary 120→0 przywraca błąd D/1–D/2). Piny PMSSB-23 zaktualizowane
świadomie: zestaw `OKNA_OFF` wyłącza też bramkę D, sceny na parametrach
domyślnych mają wyniki niższe o karę. Bramki: pakiet pokrewny 103/103,
`npm test` 9981/9981, build 77 modułów / 5707,4 kB, `npm run test:all`
10249/10249.

**Audyt K2/K3 POMIAREM (sonda `.arena/checkpoint/d-audit-probe.mjs`):**
scena „własne podtrzymanie, wolna mana, własne stwory 2/2” dla 24 instantów
profilu triku — bot trzyma 23 (wszystkie pumpy tymczasowe, granty, samo
odkręcenie Savage Surge, liczniki po naprawie K1). Jedna potwierdzona luka:

- **Diplomatic Relations** (`pump + damage_from_target_power`, klasy K3/K4):
  bot rzuca w podtrzymaniu (wynik oferty 11 > pas 0) — ugryzienie wyceniane
  jak usunięcie poza oknem walki. Następny etap: bramka okna dla
  pump+ugryzienie (rzut poza walką tylko, gdy ugryzienie jest realnym,
  opłacalnym usunięciem zaakceptowanym jako koszt utraty triku — do
  rozstrzygnięcia pomiarem scen walki i poza nią).

## Etap 7 (kontynuacja, 2026-11-05): Diplomatic Relations — pump + ugryzienie

Potwierdzona pomiarem luka z audytu K2/K3: instant łączący tymczasowy pump
własnego stwora z ugryzieniem (`damage_from_target_power`) bot rzuca w
podtrzymaniu, bo ugryzienie zabijające cel jest wyceniane jak zwykłe
usunięcie (oferta 11 > pas 0), a pump jest tylko riderem. To ten sam kształt
triku co K1, tylko z pumpem czasowym zamiast licznika.

Naprawa generyczna (ADR 0002, zero nazw kart): bramka trzymania na poziomie
rzutu — instant z pumpem na własnego stwora i ugryzieniem z tego stwora
traci poza oknem walki nowy parametr `pumpBiteHoldPenalty`. Okna jak w K1:
cel pumpu już walczy; blokujący-niespodzianka po deklaracji atakujących
wroga; pump domyka grę w tym ataku. Dowód: testy DR/1–DR/4 (pas w
podtrzymaniu i głównej, rzut w walce po blokach i w obronie), mutacja,
pakiet pokrewny, `npm test`, build, `test:all`.

**Etap 7 ZAMKNIĘTY (commit `5b1ea34`).** Bramka `pumpBiteHoldPenalty` (120)
dla instantu „pump własnego stwora + ugryzienie”: testy DR/1–DR/4 4/4
(mutacja złapana), pakiet pokrewny 89/89, `npm test` 9985/9985, build
77 modułów / 5709,7 kB, `npm run test:all` 10253/10253.

**Pomiar K4 (sonda `.arena/checkpoint/d-k4-probe.mjs`, własne podtrzymanie,
wolna mana, wróg ze stworem 2/2):** Shock, Bring Low, Consign to Dream
i Douse in Gloom bot rzuca od razu w podtrzymaniu; Kill Shot, Erase
i Summary Judgment pasują (warunki celu). Osobno: **Shock w twarz przy
20 życia przeciwnika w podtrzymaniu — bot rzuca** (potwierdzona luka:
burn w twarz poza walką bez domknięcia gry). Następny etap K4: polityka
obrażeń w twarz (tylko śmiertelne albo realna presja zegara) oraz timing
instant-removalu (trzymanie na odpowiedź vs strata tempa).

## Etap 8 (kontynuacja, 2026-11-05): K4a — obrażenia w twarz poza walką

Zmierzona luka: Shock w twarz przy 20 życia przeciwnika w podtrzymaniu —
bot rzuca, choć 2 obrażenia nic nie zmieniają i karta powinna czekać na
smiertelny moment albo odpowiedź. Zakres etapu: polityka obrażeń w gracza
z czaru instant (po deskryptorze `damage` i celu-graczu, zero nazw kart):
poza oknem walki i bez domknięcia gry rzut w twarz traci karę trzymania.
Timing instant-removalu na stwory (bot zabija już w podtrzymaniu) zostaje
jako osobna obserwacja K4b — strata dotyczy elastyczności, nie samej karty.

Dowód: testy K4/1–K4/4 (twarz przy 20 życia — pas; twarz śmiertelna —
rzut; obrażenia w stwora w podtrzymaniu bez zmian; twarz w walce przy
domykaniu bez zmian), mutacja, pakiet pokrewny, `npm test`, build,
`test:all`.

**Etap 8 ZAMKNIĘTY (commit `836d90d`).** Bramka `faceBurnHoldPenalty` (120):
instant z `damage` w gracza przeciwnika, kwota mniejsza od życia wroga,
brak trwającej walki. Testy `test/zgloszenie-d-k4-twarz.test.js` (K4/1–K4/4)
4/4, mutacja złapana. Pięć pinów starej konwencji twarzy zaktualizowanych
świadomie: uwaga-m (kontrola twarzy), PMSSB-32/A5, PMSSB36-C1, PMSSB-7 F-H1,
B/7 Epic Experiment (Shock śmiertelny przy 2 życia). `npm test` 9989/9989,
build 77 modułów / 5711,3 kB, `npm run test:all` 10257/10257.

## Etap 9 (kontynuacja, 2026-11-05): K4b — instant-removal we własnym podtrzymaniu

Pomiar K4: Shock, Bring Low, Consign to Dream i Douse in Gloom bot rzuca
już we własnym podtrzymaniu. Karta nie jest zmarnowana (cel ginie tak
samo), ale decyzja zapada przed dobraniem karty i przed główną fazą, bez
żadnej pilności — instant powinien poczekać na główną albo na odpowiedź.
Zakres (wąski, po deskryptorze): instant z efektem usuwającym permanent
przeciwnika (śmiertelne `damage` w stwora, `destroy_permanent`,
`exile_permanent`, bounce) we WŁASNYM kroku podtrzymania/dobrania traci
karę trzymania `removalUpkeepHoldPenalty`. Tura przeciwnika, walka,
główne fazy i sorcery bez zmian — tam timing jest treścią instanta.

Dowód: testy K4b/1–K4b/4 (podtrzymanie — pas; główna — rzut; podtrzymanie
przeciwnika — rzut; nieśmiertelne obrażenia w stwora bez zmian), mutacja,
pakiet pokrewny, `npm test`, build, `test:all`.

**Do następnych sesji:** K5 (kontrczary), K6 (reszta: dobieranie, tokeny,
tutorzy, Fog), po kolei: reprodukcja → test RED → naprawa po deskryptorze
→ bramki.

**Etap 9 ZAMKNIĘTY (commit `dd0c1cb`, regeneracja golden-mastera `3778492`).**
Bramka `removalUpkeepHoldPenalty` (120). Testy K4b/1–K4b/4 4/4, mutacja
złapana; K4/3 świadomie przestawiony na główną fazę. `npm test` 9993/9993,
build 77 modułów / 5712,9 kB. Golden-master: dryf tylko
ravnica-wur|innistrad-wu@1001 (299→284 decyzji) — fixture zregenerowany
świadomie z notą w nagłówku testu. `npm run test:all` 10261/10261.

## Etap 10 (kontynuacja, 2026-11-05): K5 — kontrczary i odpowiedzi na stos

Zakres: czy bot trzyma kontrczar na to, co się liczy — nie przepala kontry
na błahy czar w pierwszej głównej przeciwnika i nie pasuje, gdy wróg rzuca
coś, co wygrywa grę. Pomiar na prawdziwych decyzjach: stos z czarem wroga
(błahy 1/1 za {1} kontra zagrożenie 6/6 / czar dobierający / usunięcie
mojego stwora), bot z kontrą i maną. Naprawa tylko przy potwierdzonej
luce, po deskryptorze (`counter_spell`, `counter_spell_unless_pays`),
zero nazw kart. Dowód: testy, mutacja, pakiet pokrewny, `npm test`,
build, `test:all` (golden-master tylko świadomie).

## Wynik audytu K5 (pomiar, bez luki)

Sonda decyzji (`.arena/checkpoint/d-k5-probe.mjs`, Cancel + mana, czar
wroga na stosie): trywialny czar MV1 i stwór 1/1 — bot trzyma kontrę
(oferta −10); duży stwór, removal, dobieranie, Fireball — kontruje
(82–124). Polityka M237/2 + premia za zatrzymane zagrożenie działa.
Świadomie poza zakresem: bot nie jest archetypem kontrolnym, więc nie
modelujemy „trzymania many pod kontrę” kosztem rozwoju stołu.

## Etap 11 (kontynuacja, 2026-11-05): K6 — instanty z tokenami w podtrzymaniu

Pomiar K6 (`.arena/checkpoint/d-k6-probe.mjs`): Fog/prewencje, tutorzy
i ramp bot trzyma; dobieranie w podtrzymaniu uznane za akceptowalne
(karta przed dobraniem kroku bywa plusem). Luka tej samej rodziny co K4b:
Raise the Alarm i Carrion Call bot rzuca we własnym podtrzymaniu —
tokeny nie zyskują nic przed główną fazą, a instant traci wartość
zaskoczenia (blokujący znikąd w turze wroga). Bramka jak K4b: instant
z `create_token` we własnym upkeep/draw traci `tokenUpkeepHoldPenalty`;
tura wroga i walka bez zmian. Dowód: testy K6/1–K6/3, mutacja, bramki.
