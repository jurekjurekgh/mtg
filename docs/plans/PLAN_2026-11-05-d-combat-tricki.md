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

- [ ] Etap 1: reprodukcja sondą — Dragonscale Boon w podtrzymaniu własnej
  tury przy wolnej manie: bot rzuca zamiast pasować; w walce po deklaracji
  blokujących rzuca i to się opłaca (kontrola pozytywna).
- [ ] Etap 2: testy RED (`test/zgloszenie-d-dragonscale-okno.test.js`):
  pas w podtrzymaniu i w głównej bez walki; rzut w walce zmieniającej wynik;
  wyjątki: licznik ratujący stwora przed śmiertelnymi obrażeniami,
  licznik domykający grę; odkręcenie dokłada nieoczekiwanego blokującego.
- [ ] Etap 3: naprawa w `heuristic-bot.js` (+ parametr w
  `heuristic-params.js`): bramka trzymania instant-liczników poza walką,
  premia bojowa ridera odkręcenia. Zero nazw kart.
- [ ] Etap 4: bramki — pakiet pokrewny wycen bota, `npm test`,
  `npm run build`; osobny commit i push. Golden-master scoringu: świadoma
  regeneracja tylko, gdy dryf dotyczy wyłącznie scen instant-liczników.
- [ ] Etap 5: dokończenie audytu K2–K6 pomiarem (sondy wycen per klasa);
  klasy z luką dostają własne etapy/testy w kolejnych commitach tej sesji
  albo wpis do tego planu jako kontynuacja następnej sesji.
- [ ] Etap 6: pełny `npm run test:all`, plan/historia/handoff, opis PR #179,
  CI i `mergeable_state`. Bez scalania, force-push, nowych kart, pełnego B0.
