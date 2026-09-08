# Batch54 — integracja B5 (2026-09-08)

Zakres: dokładnie 10 kart 599–608 z planu właściciela, bez nowego katalogu
pomocniczego. B0–B4b opublikowane w PR106, ostatni przyrost `62ad1ab`.
CI tego przyrostu: 34260588839 SUCCESS. Końcowe wyniki B5 w handoff i PR.

## Ustalenia i poprawki B5

1. **Koniec walki po replacement.** Zwykłe obrażenia pozostawiały krok
   combat_damage po wyborze armor, a wznowienie first strike nie raportowało
   step_advanced. Serializowalny combatFinish + wspólne dokończenie w execute.
   Testy obu przebiegów RED→GREEN i łańcucha damage assignment→armor→end.
2. **Za wczesny end_of_combat podczas podziału obrażeń.** resolve_combat
   skakało dalej przy pendingDamageAssignment. Teraz czeka na przydział,
   tak samo jak na armor. Mutant przywracający stary guard wykryty.
3. **Dwa ruchy zwykłej aury.** W grupie host→aura ruch hosta uruchamiał cleanup
   aury, a drugi ruch rzucał wyjątek. Planowane ofiary połączone załącznikiem
   odpinamy przed ruchami grupy; pozostałe załączniki zachowują zwykły cleanup.
   Dwa porządki grupy, po jednym permanent_destroyed na ofiarę, RED→GREEN.
4. **Kreator many vs wyciszenie.** Live10607 powtórzył błąd Knight of the
   Skyward Eye: pięć tapnięć, anulowanie, brak aktywacji. Przyczyną nie był
   koszt {3}{G}, lecz auto-pass po tapnięciu źródła: wyciszona aktywacja nie
   zatrzymywała sesji, faza się zmieniała i pula znikała. UI przekazuje
   holdPriority do session.apply dla źródeł w kreatorze. Po płatności zwykłe
   auto-pass działa; Anuluj nie cofa many. Test prawdziwej sesji RED→GREEN
   oraz test rzeczywistego połączenia refreshManaWizard→playDirect→apply.
5. **Bot/T.** Domknięte pomocnicze sumy zagrożenia, ewazji i projekcje
   ataku/bloku korzystają z combatPower. Moc na kaflu, fight oraz progi mocy
   pozostają prawdziwym power. Test projekcji: power2, combat6 (RED2→GREEN6).
6. **APNAP.** Test odwróconej kolejności grupy potwierdza wybór aktywnego
   kontrolera przed nieaktywnym, brak ruchów przed ostatnim wyborem i
   przywrócenie priorytetu.

38 testów Umbra, w tym normal/modal/activated/triggered, Vandalize oba,
first strike, równoczesne zniszczenia, sacrifice/0T/indestructible, armor
z regeneracją/shield, combat/T vs fight, kolorowe płatności, FoW/UI.
B4b: 6/6 selektywnych mutantów zabitych (combat-power, armor-static,
auto-choice, damage-clear, early-tail, simultaneous). Produkcja odtworzona.
B5: dodatkowy mutant early-combat-end zabity; test sesji odtwarza autoprzejście
z upkeep do declare_attackers przy starej wersji. Nie podnoszono progów.

Przegląd pozostałych resolverów: trzy obecne Sagi nie mają destroy w
rozdziałach; jedyne onNthResolve (Soulbright Flamekin) dodaje manę, nie
niszczy. Nie rozszerzano przy tym kontraktu na hipotetyczne nowe Sagi.
Ogony wspieranych efektów niszczenia są testowane w czterech rodzinach stosu.

## Golden — wyjaśnione, nie zamaskowane

CR510.1 (wydanie 2026-08-07), źródło sprawdzone 2026-09-08:
https://mtg.wiki/page/Combat_damage_step

> First, the active player announces how each attacking creature assigns
> its combat damage, then the defending player announces how each blocking
> creature assigns its combat damage.

CR510.2: „Second, all combat damage that’s been assigned is dealt
simultaneously.” Przydział jest więc w kroku obrażeń, nie w end_of_combat.

Pełne porównanie sześciu śladów przed/po: **jedynie dwa pola `step`**:
- tarkir-bg|warhammer-ubr@1000, wpis189: end_of_combat→combat_damage;
- tarkir-bg|warhammer-ubr@1001, wpis207: ta sama korekta.

Pozostałe cztery ślady bit w bit identyczne. We wszystkich sześciu identyczne
wybrane komendy, wyniki punktowe, opcje, długości i agregaty. Izolowane
cofnięcie WYŁĄCZNIE guardu pendingDamageAssignment odtwarza cały stary fixture
46eea4eb…; reszta kodu B5 bez zmian. Po tej diagnozie przyjęto hash
4d9b14e84a7aedfea809663b54ced107cbf4077971c85d9cf0dd872ffa13c886.
Zbiór partii, wagi i progi niezmienione. To korekta raportowanego kroku
silnika, nie strojenie jakości bota. Surowe ślady pozostały w `.arena/`.

## Żywy Tester i triage

- 10607, alara/worek-mroczny, explorer, policy-seed1, tick-rate.25:
  przed B5 88kroków, po B5 również88; 20 widzianych/17 klikniętych akcji,
  55 sond, 0 detektorów/0 wybranych akcji bez dedykowanej gałęzi wyceny.
  **Po poprawce w T15 cztery tapnięcia płacą {3}{G}, Knight dostaje +3/+3
  i zadaje5 zamiast2.** Nie ma piątego tapnięcia ani anulowania kreatora.
  Dalej naturalny koniec przez Fear of Burning Alive. Sam brak detektorów
  przed poprawką NIE był dowodem poprawności kreatora.
- 10608, srodziemie/wiedzmin-wu, explorer, policy-seed1, tick-rate.25:
  122kroki, 23/23 akcje, 1modal, 61sond, 0detektorów/0niewycenionych.
  Coven naprawdę daje flying; Membrane zaczarowuje Orc Army, nie tapuje go
  i trafia do grobu po śmierci hosta. Końcówka17:17, bot przegrywa przez
  zwykłe dobranie z pustej biblioteki w T21 (nie przez kliknięcie Clue).
  Ten seed nie dowodzi zagrania Treefolk Umbra — od tego są testy scenariuszy.

Chronologia obu partii przejrzana, a naprawa kreatora zweryfikowana powtórką.
Logi nie są commitowane (decyzja właściciela); surowe pliki lokalnie:
`tools/table-tester/.arena/b54-10607-{repeat,final}.txt`, `b54-10608.txt`.

### Świadomie pozostawione uwagi jakościowe spoza dziesięciu kart

- **Stomping Slabs:** brak trafienia w reveal jest zgodny z Oracle, a w
  wygenerowanej talii singleton drugi egzemplarz nie istnieje. Nie zmieniamy
  karty ani legalności rzutu, aby wymusić obrażenia. Bot mimo to wydaje kartę
  na tę loterię — gałąź cast_spell liczy bazę, a telemetria nie rozróżnia
  pokrycia podtypów efektów. Potrzebna osobna wycena reveal/namedCard z
  legalnej wiedzy o talii; nie odczyt ukrytej biblioteki ani wyjątek po ID.
- **Dobieranie/cel:** Inspiration w T11 wybiera przeciwnika, ponieważ wspólna
  wycena draw_cards nalicza własną korzyść niezależnie od odbiorcy.
  To luka jakości starej karty, nie błąd wykonania efektu. Do osobnej poprawki
  rodziny celowanego dobierania i benchmarku; nie ukrywamy jej pod „0detektorów”.
- Słabe ataki/wymiany i przegrany wyścig bibliotek w10608 nie są dowodem
  błędu reguł; nie wykonywano globalnego tuningu ani pełnego B0.

jsdom nie weryfikuje layoutu/gestów i ilustracji. Dwie partie nie są dowodem
idealnej gry ani pokrycia każdej karty; wyniki quick też są pomiarem próbki.
