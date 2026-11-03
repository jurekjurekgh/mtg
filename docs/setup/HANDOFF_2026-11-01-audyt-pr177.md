# Handoff 2026-11-01 — audyt PR #177 rozpoczęty

PR sesji: https://github.com/jurekjurekgh/mtg/pull/178. Plan: `docs/plans/PLAN_2026-11-01-audyt-pr177.md`. Raport cząstkowy: `docs/audits/AUDYT_PR177_2026-11-01.md`.

Baza na `7aff9b6`: `npm test` 9156/9156, `npm run build` 76 modułów / 5608,7 kB. Pełny B0 nieuruchomiony. PR #177 obejmuje 111 plików; audyt **nieukończony**. Pierwsze ustalenie A1 dotyczy braku opcji wygnania przy champion po odejściu źródła; sprawdzono wskazaną gałąź i istniejący test syntetyczny, nie pełną sekwencję na stosie. Wpis historyczny: wtedy kod gry nie był jeszcze zmieniony; aktualny stan napraw opisano poniżej. Należy dokończyć audyt, a następnie wykonać pętlę jakości wg ADR 0021. Nie dodawać kart z własnej inicjatywy; pełny B0 tylko na komendę właściciela. Merge to decyzja właściciela.

## Kontynuacja — champion

A1 naprawiony; testy stosu i zmiany kontroli `test/audyt-pr177-champion-na-stosie.test.js` (5), pierwsze trzy RED→GREEN. `npm test` 9161/9161, build 76 modułów / 5609,7 kB. Opis i źródła w raporcie. Audyt pozostałych plików PR #177 nieukończony.

## Kontynuacja — klątwy upkeepu

A2: zapamiętany gracz zdarzenia upkeepu (mill i obrażenia); trzy testy RED→GREEN w `test/audyt-pr177-klatwa-gracz-upkeep.test.js`. `npm test` 9164/9164, `npm run test:slow` 268/268, build 76 modułów / 5610,1 kB. Audyt PR #177 nadal nieukończony; kontynuować od raportu i planu. Pełnego B0 nie uruchamiano.

## Kontynuacja — dobór many Converge

A3: globalny dobór jednostek do pipów i generic maksymalizuje liczbę kolorów, przy tie-breaku dla many ograniczonej i ochrony kolorów. `test/audyt-pr177-converge-dobor-many.test.js` (6, w tym 3 RED→GREEN i enumeracja małych pul). `npm test` 9170/9170, build 76 modułów / 5615,2 kB; slow po A3 268/268 (w tym test benchmarku); osobnego quick benchmarku nie uruchamiano. Strategia maksymalizuje automatycznie, swoboda wyboru konkretnych jednostek przez gracza wymaga osobnego zbadania. Audyt PR #177 nadal nieukończony.

## Kontynuacja — Morbid i bestow

A4: naprawiono błędną klasyfikację śmierci przy zniszczeniu aury bestow, także u Furious Forebear; 5 testów, przypadki Morbid i Forebear RED→GREEN. `npm test` 9175/9175, build 76 modułów / 5615,6 kB; slow po A4 nie uruchamiano. Pozostałe konsumenty typów bestow oraz semantyka syntetycznego triggera „a counter” wymagają dalszej analizy (`docs/audits/AUDYT_PR177_2026-11-01.md`). Audyt PR #177 nadal nieukończony.

## Kontynuacja — typy aury bestow

A5: aura bestow ma prawidłową linię typów na polu bitwy; przy odłączeniu lub opuszczeniu pola przywraca pierwotną. Pin Austere Command i 4 inne testy, 2 RED→GREEN. `npm test` 9180/9180, build 76 modułów / 5617,3 kB; slow po A5 268/268. Sprawdzić czar bestow na stosie (dotychczas drukowane typy i `kind=creature`), interakcje zmian typów/kopii i resztę diffu PR #177; zob. raport.

## Zgłoszenie N (2026-11-01)

Naprawiono modal X dla Magma Pummeler: `test/zgloszenie-n-magma-wybor-x.test.js`, `npm test` 9185/9185, build 76 modułów / 5618,4 kB. Żywy tester faktycznie rzucił X=0 przy dwóch Górach i X=1 przy trzech, bez zgłoszeń detektorów. Talia tymczasowa usunięta, artefakt przebudowany. Limit X=15 istnieje w danych/silniku i nie był zmieniany. Audyt #177 nadal w toku — kontynuować, nie przerywać po tym przyroście.

## A6 — wycena kosztu Heralda

Testy ujawniły, że PR #177 ignorował koszt trzech ofiar, gdy jedynym niebieskim stworem był sam Sphinx’s Herald, oraz nie rozróżniał konkretnych kombinacji. Wycena sumuje teraz ofiary z rzeczywistej legalnej komendy, w tym źródło. 2 RED→GREEN, pełny fast 9187/9187, build 76 modułów / 5617,6 kB. Wolny pakiet uruchomiony przed tą zmianą nie jest dowodem stanu po A6. Audyt #177 nadal nieukończony.

## A7 — błędne ostrzeżenia animacji i załogi

Silvanus’s Invoker faktycznie odtapowuje już animowany ląd; stare ostrzeżenie mówiło, że nic się nie zmieni i przepadnie tapnięcie. Uściślono ostrzeżenie do czystych zdolności crew/saddle i ich stanu; kreator używa tego samego helpera. 5 testów RED→GREEN, pokrewne 38/38, `npm test` 9243/9243, build 76 modułów / 5624,6 kB. Audyt nadal nieukończony, pozostałe kierunki w raporcie.

## A8 — priorytet podczas podrzędnej płatności many

Zagnieżdżony Mana Wizard aktywuje źródło z `holdPriority`, inaczej auto-pass mógł zmienić krok i wyczyścić nową manę przed powrotem do nadrzędnego kreatora. Test rzeczywistej sesji i wiring funkcji UI, RED→GREEN. Pokrewne 44/44, `npm test` 9244/9244, build 76 modułów / 5624,8 kB. Slow 268/268 uruchomiony przed A8. Audyt nadal trwa.

## A9 — Rupture Spire i manodorki/Powerstone

Bramka z PR #177 liczyła tylko pulę i nietapnięte lądy; ignorowała inne automatyczne źródła opłaty zdolności. Bot korzysta teraz z istniejących miar automatycznej i ograniczonej many. Druid, choroba przywołania, Powerstone i ograniczona pula: 4 testy, rzeczywiste wykonanie opłaty, 2 RED→GREEN. Pokrewne 18/18, `npm test` 9248/9248, build 76 modułów / 5625,2 kB. Taliom/katalogowi poświęcono pakiet 96/96. Audyt PR #177 nadal trwa.

## A10 — bestow w progu inwestycji Edifice

Załączona aura bestow była niesłusznie pomijana w literalnym progu TMC stwora z aurami/equipmentem ≥5. Test pokazuje decyzję i jej wykonanie, z odłączeniem bestow jako stwora; kontrole braku aury i braku śmiertelności. Innych heurystyk wyceny faktycznej straty karty nie zmieniono. Pokrewne 23/23, `npm test` 9251/9251, build 76 modułów / 5625,3 kB. Audyt trwa.

## A11 — ponowne otwieranie zakończonego kreatora

Po automatycznym zakończeniu nadrzędnej płatności powrót z podrzędnego kreatora ponownie otwierał już zamkniętą, pustą nakładkę. Warunek ponownego otwarcia sprawdza żywy deskryptor. Test rzeczywistej sesji i funkcji UI (postęp/render stubowane), RED→GREEN oraz kontrola niedokończonej płatności. Pokrewne 53/53, `npm test` 9253/9253, build 76 modułów / 5625,4 kB. `playDirect` nie zwraca wyniku sesji — nadal wymaga konkretnej osiągalnej reprodukcji przed poprawką. Audyt #177 trwa.

## A12 — wycena kwalifikowanego discardu

Wycena kosztu aktywacji liczy teraz wyłącznie własne karty spełniające kwalifikator, wspólnym predykatem silnika. Wcześniej niegrywalny nie-stwór zawyżał wycenę Vampire Hounds; przy koszcie dowolnej karty mogła też zostać policzona ukryta ręka przeciwnika. Cztery testy z wykonaniem wyboru, dwa RED→GREEN. Pokrewne 47/47, fast 9257/9257, build 5626,1 kB; audyt trwa.

## A13 — obrażony ląd-stwór w bramce ETB

Cutthroat uwzględnia teraz rzeczywiste publiczne cele obrażonego stwora, także ożywiony ląd, i nie traktuje hexproof ani ochrony przed źródłem jak legalnego celu. 5 testów (3 RED→GREEN), rzeczywiste wykonanie zniszczenia, pokrewne 49/49, fast 9262/9262, build 5626,3 kB. Audyt trwa.

## A14 — wynik sesji przy kończeniu kreatora

Potwierdzono odrzucenie rzeczywistego Kavu: Druid wybrany do convoke został użyty do many, a kreator zgłaszał sukces mimo odrzucenia. `playDirect` zwraca wynik/wyjątek, helper nie maskuje błędu. Dwa RED→GREEN, kontrola ważnego convoke; pokrewne 41/41, fast 9265/9265, build 5626,6 kB. Osobno zbadać i naprawić oferowanie źródeł zarezerwowanych do convoke. Audyt trwa.

## A15 — rezerwacja źródeł w kreatorze many

Kreator nie oferuje źródeł wskazanych do tapnięcia w kosztach bieżącej i nadrzędnych komend; filtr uwzględnia convoke, improvise, crew i tapnięcie źródła zdolności. Rzeczywista sesja Kavu/Druid z działającym rzutem, test podrzędnych rezerwacji i kontrola niezarezerwowanego źródła; dwa RED→GREEN. Pokrewne 53/53, fast 9268/9268, build 5627,5 kB. Audyt trwa.

## A16 — płatność improvise w kreatorze

Kreator Fen Haulera odejmuje artefakty improvise od części generycznej zamiast żądać pełnego kosztu. Rzeczywista oferta, model i wykonana ręczna płatność 5 many + 2 artefaktów, 4 testy (1 RED→GREEN), pokrewne 77/77, fast 9272/9272, build 5628,2 kB. Audyt trwa.

## A17 — kontrola rozstrzygnięcia czarów batcha

Sześć zielonych testów prawdziwych Tail Slash i Rumbling Rockslide przy zmianach między rzuceniem a rozstrzygnięciem; skorygowano mylące komentarze o liczbie landów (to nie wybierane X). Pokrewne 34/34, fast 9278/9278, build 5628,3 kB; audyt trwa.

## A18 — rezerwacje a auto-tap PODRZĘDNEGO kosztu

Ożywiona Wyspa wybrana do convoke Kavu była mimo A15 tapowana auto-tapem kosztu `{U}` Apprentice Wizarda, gdy dostępne Wyspy miały jeden profil. Rzeczywisty callback RED→GREEN: warunkowo wymuszony kreator potomny prowadzi do udanej aktywacji i rzutu; kontrole puli, braku rodzica, przodka i braku alternatyw. Ochrona może zachowawczo pokazać dodatkowy wybór. 5 testów, pokrewne 63/63, fast 9283/9283, build 5629,1 kB. Wolne 268/268 rozpoczęto na A16 i zakończono podczas prac A18, więc nie certyfikuje jednorodnego końcowego stanu. Audyt trwa.

## A19 — prowadzenie kreatora `{C}`

Kozilek's Shrieker: kreator mimo dwóch legalnych bezbarwnych źródeł pokazywał pustą listę; filtr i etykieta używają tego samego predykatu co silnik/solver. 6 testów (rzeczywista aktywacja oboma źródłami, kolor i render), pakiet 59/59, fast 9289/9289, build 5629,3 kB. Audyt trwa.

## A20 — kosztowy tryb Heap Gate

Rzeczywista legalna oferta Goblin Deathraiders: kreator pomijał `{1},{T}: kolor` Heap Gate. Dodany wiersz z własną komendą oraz zagnieżdżona płatność, solver nie może liczyć obu trybów jednego permanentu. 6 testów, pokrewne 85/85, fast 9295/9295, build 5630,1 kB. Odrębne ograniczenie: silnik nie uwzględnia kosztowego trybu lądu w auto-ofercie, gdy jest on jedynym źródłem koloru; A20 tego nie rozwiązuje. Audyt trwa.

Weryfikacja po A20: `npm run test:slow` na niezmienianym kodzie `1587c15` 268/268 (425 s). Audyt nadal nieukończony; bez B0.

## A21 — czar bestow na stosie

Leafcrown Dryad rzucona za bestow była na stosie niepoprawnie stworem. Wspólna linia aury działa teraz od stosu, a oryginał wraca po zmianie strefy/odłączeniu. Siedem testów obejmuje realny czar, Negate, nielegalny cel i syntetyczny artefakt-bestow, z walidacją Steel Sabotage; pokrewne 37/37 i 96/96, fast 9302/9302, build 5630,7 kB. Slow 268/268 sprzed A21. Audyt trwa; następna sonda: ochrona przed non-Human creatures przy wyborze celu bestow (realna Dryada + efekt Spare from Evil, brak oferty RED).

## A22 — ochrona celu bestow

Rzeczywisty Spare from Evil uniemożliwiał zagranie Dryady za bestow, mimo że czar nie jest stworem. Odwrotna sonda ochrony przed Aurami oferowała niedozwolony cel. Oferta i walidacja korzystają z cech wybranego wariantu. 6 testów, pakiet 81/81, fast 9308/9308, build 5630,6 kB; slow sprzed A21/A22. Syntetyczny artefakt-bestow z maną Powerstone nadal ujawnia osobną rozbieżność celu wydania many (sonda `.arena/a23-red.log`); brak wspieranej realnej karty artefakt-bestow. Audyt trwa.

## A23 — płatność bestow / A24 do dalszego badania

Syntetyczny artifact-bestow nie może korzystać z Powerstone ani rabatu Etherium Sculptor: cechy Aura na stosie stosowane do oferty, wykonawcy i kreatora. Zwykły artefakt i realny bestow nadal działają. 6 testów, zaktualizowana błędna przesłanka syntetycznego B54, 65/65 i 33/33 pokrewne, pełny fast 9314/9314, build 5631,3 kB. Pierwszy pełny bieg ujawnił B54 (9313/9314); po poprawie powtórzono. Slow nadal z A20.

A24 otwarty: realny Heap Gate + Forest + Mountain i Goblin Deathraiders, brak oferty przed ręczną aktywacją, po aktywacji czar działa (`.arena/a24-heap-probe.test.js`, `.arena/a24-red.log`). Automatyczny kreator mierzy też sumę, a nie pokrycie kolorów; oba elementy wymagają rozwiązania z ochroną przed wielokrotnym użyciem źródeł i z testami. Audyt trwa.

Wolny pakiet po A23 na niezmienionym `b8a7690`: 268/268 (`.arena/a23-slow.log`). Dodatkowy RED `.arena/a24-wizard-red.log` potwierdza, że po wymuszeniu jeszcze nieoferowanej komendy kreator nie otwiera się, gdy auto-tap ma dostateczną liczbę, ale nie kolor; A24 nadal otwarty.

## Powrót do diffu PR #177 — zakres właściciela

Właściciel poleca skupić się na #177 i realnych interakcjach z katalogiem; nie implementować hipotetycznych przyszłych kart/konfiguracji, najwyżej komentarz w kodzie. Wcześniejsze A24 Heap Gate nie jest bieżącą kolejką. Mapa 111 plików `docs/audits/PR177_MAPA_PLIKOW_2026-11-02.md` jawnie rozróżnia częściowe i otwarte. A25 cztery testy Violent Urge + Halo Scarab + Shock w prawdziwym oknie stosu: 37/37 pokrewne, fast 9318/9318, build 5631,3 kB; bez nowego błędu w tych przypadkach. Sonda `.arena/a26-champion.test.js`: Awaken the Sleeper → Changeling Berserker → Terminal Agony zwraca Highland Game do właściciela (zielona); nie jest włączona do pakietu. Slow 268/268 na b8a7690, nie na A25. Kontynuować systematycznie otwarte fragmenty #177.

A26: dwa nowe realne testy championa, powrót przejętego Highland Game do właściciela oraz odmowa wygnania/śmierć championa i Morbid; 42/42 pokrewne, fast 9320/9320, build 5631,3 kB. Kontynuować mapę #177; sonda `.arena/a27-hounds-madness-probe.test.js` wstępnie potwierdza koszt Vampire Hounds + Revolutionist/madness, bez końcowego rozstrzygnięcia.

A27: w granicach realnych interakcji #177 znaleziono istniejącą rozbieżność madness: aktywacja Vampire Hounds z odrzuceniem Revolutionist prowadzi natychmiast do decyzji, bez priorytetu przy triggerze; realny RED `.arena/a27-priority-red.log`. Trigger madness nie jest obiektem stosu (świadomy starszy model w `game-state.js`). CR 702.35a/603.3 i instrukcja reprodukcji w raporcie. Bez naprawy; potrzebny projekt rozwiązania wielu jednoczesnych odrzuceń, wstrzymanych efektów, cleanupu i priorytetu. Nie mylić z niepowiązanym A24 Heap Gate.


A27 częściowo naprawione: madness to osobny trigger stosu, decyzja po passach; 5 realnych testów Hounds/Revolutionist/Shock oraz Cathartic Reunion/Terminal Agony, migracja testów wielokrotnych odrzuceń i cleanup. Fast 9325/9325, slow 268/268, build 5630,7 kB (ten sam kod/testy); bez B0. **Otwarta realna kolejność:** dla jednoczesnych Revolutionist + Terminal Agony w Cathartic Reunion kontroler nie wybiera kolejności triggerów; osobne dodawanie innych triggerów nie gwarantuje wspólnego APNAP (Talion's Messenger). CR 603.3b i plan w raporcie. Kontynuować naprawę tej realnej interakcji oraz mapę #177; nie uznawać A27 ani całego audytu za skończone.

A28 potwierdzony RED na rzeczywistych Cathartic Reunion + Revolutionist + Terminal Agony: oba triggery na stosie, ale bez wyboru kolejności przed `pass_priority`; `.arena/a28-madness-order-red.test.js` i log 0/1, opis reprodukcji również w audycie. Naprawa w toku, bez commitu kodu A28.


A28 po poprawce: wybór kolejności przy madness przez właściciela przed priorytetem; 13 testów, w tym wszystkie kolejności Cathartic Reunion, Talion's Messenger/refleks, wczesny trigger dobierania Lorescale Coatl, Mindstab, cleanup, UI, boty i replay. Pokrewne 157/157 i 38/38, fast 9338/9338, slow 268/268, build 5635,2 kB na tym samym kodzie. Zakres nie obejmuje dowodu wszystkich możliwych ścieżek ogólnego APNAP; mapa #177 wciąż otwarta. Dalsza kolejka: kontynuować konkretne zmiany `counters.js`/`triggers.js` #177 w kontekście prawdziwego Magma Pummeler i kart katalogu.


A29: rzeczywiste Pummeler + Shock/Rumbling Rockslide/Trigon of Corruption/Spin Out — pięć testów na prewencję, śmierć źródła, rozstrzygnięcie triggera i zwykłą anihilację bez fałszywego „this way”. Pakiet 72/72, fast 9343/9343, build 5635,2 kB. Slow 268/268 kod A28; audyt #177 pozostaje otwarty.


A30: sprawdzono dane batcha 71 (wybrane pola zgodne z CSV i snapshotami) oraz generator bez zapisu (31/31 talii identycznych z plikami). Pokrewne 106/106, fast 9345/9345; build A29, slow A28. Nie oceniono strategii talii ani kompletnej semantyki. Audyt #177 trwa.


A31: champion nietargetowany działa z rzeczywistym Scythe Tiger (jego własne ETB po powrocie wymaga lądu) i z tokenem rzeczywistego Ambassador Oak (token znika). Oba wybory odtworzone w replay, pola decyzji w fingerprint; cztery testy, pokrewne 53/53, fast 9349/9349, slow 268/268 przed korektą komentarza testu, build 5635,2 kB. Audyt #177 pozostaje otwarty.


A32: trzy testy rzeczywistych nazw po transformie (Merciless Repurposing/Incubator, Civilized Scholar, Jill/Shiva), materializacja talii i sesja stołu; pokrewne 126/126, fast 9352/9352, build 5635,2 kB. Slow 268/268 A31 przed testami A32, ten sam kod. Pozostały audyt otwarty.


A33: naprawiono fałszywą premię bounce dla stun/finality oraz dodawanie TMC własnej aury na wrogim celu; 6 rzeczywistych testów, 4 mutacje wykryte, pokrewne 122/122, fast 9358/9358, build 5635,7 kB; slow 268/268 na kodzie i testach A33. Audyt #177 nadal otwarty.


A34: RED→GREEN rzeczywisty Spellkeeper Weird wobec hexproof, protekcji i niezniszczalności, z kontrolą wygnania. 11 testów, 3 mutacje, pokrewne 41/41, fast 9369/9369, build 5636,6 kB; slow 268/268. Pozostały audyt #177 otwarty.


A35: Wretched Banquet na rzeczywistych stworach, remis, liczniki, odpowiedź; RED→GREEN warunkowego usunięcia przy poświęceniu Spellkeeper Weird. 7 testów, mutacja wykryta, pokrewne 29/29, fast 9376/9376, build 5636,7 kB; slow 268/268 tylko A34. Audyt #177 nadal otwarty.


A36: Zoraline + Plague Reaver/finality wraca z exile, a po Awaken the Sleeper kontroler triggera nie jest mylony z właścicielem. Osiem rzeczywistych testów, 3 mutacje, pokrewne 85/85, fast 9384/9384, build 5637,4 kB; slow 268/268 tylko na A34. Audyt #177 pozostaje otwarty.


A37: 9 testów rzeczywistego Anticipate 0–4 kart, prywatności, kolejności, Coatl oraz Inspiration; bez błędu w badanym zakresie. Pokrewne 65/65, fast 9393/9393, build 5637,4 kB. Slow 268/268 tylko A34; audyt #177 otwarty.


A38: 6 testów rzeczywistego Trumpet Blast z Kappą/ninjutsu, Trostani i Act of Treason, decyzje bota w obu turach, cleanup; GREEN w badanym zakresie. Pokrewne 58/58, fast 9399/9399, build 5637,4 kB; slow 268/268 tylko A34. Audyt #177 otwarty.


A39: sześć testów Tail Slash na realnych kartach; pokrewne 44/44, fast 9405/9405, build 5637,4 kB. Slow po A38 w toku; audyt #177 otwarty.


Uzupełnienie: slow po A38 268/268; kod produkcyjny A39 bez zmian, test A39 poza zestawem slow.


A40: RED→GREEN rzeczywistej wyceny wygnania tokena przez Berserkera, który nie wraca; cztery testy, mutacja wykryta, pokrewne 24/24, fast 9409/9409, build 5637,7 kB. Slow 268/268 po A38 przed zmianą A40. Audyt #177 otwarty.


A41: 4 realne testy bloku i obrażeń (bezpieczny blok, nieopłacalna strata, flying, deathtouch), pokrewne 13/13, fast 9413/9413, build 5637,7 kB. Slow 268/268 po A38 przed A40. Audyt #177 otwarty.


A42: siedem testów Curse na prawdziwych kartach, biblioteki 0–3, deck-out przy draw, Naturalize przed/po upkeep i skala wyceny. Pokrewne 25/25, fast 9420/9420, build 5637,7 kB; slow po A41 w toku. Audyt #177 otwarty.


Uzupełnienie: slow po A41 268/268, po zmianie produkcyjnej A40; nowy test A42 poza slow.


A43: cztery realne testy Cutthroata, obrażenia w walce, Shock, Magic Damper i własny stwór. Pokrewne 16/16, fast 9424/9424, build 5637,7 kB; slow po A41 268/268 na tym samym kodzie produkcyjnym. Audyt #177 otwarty.


A44: 5 rzeczywistych testów wiedźm i wyboru przeciwnika, nielegalności jednego z dwóch celów; pokrewne 54/54, fast 9429/9429, build 5637,7 kB. Slow po A41 268/268 na tym samym kodzie produkcyjnym; audyt #177 otwarty.


A45: RED→GREEN wyceny Tail Slash przeciw ochronie źródła, osiem rzeczywistych testów, dwie mutacje wykryte; pokrewne 49/49, fast 9437/9437, build 5638,0 kB. Slow po A45 w toku; audyt #177 otwarty.


A46: 5 rzeczywistych testów Benevolent Blessing, walka i Tail Slash; pokrewne 24/24, fast 9442/9442, build 5638,0 kB. Slow po A45 w toku; audyt #177 otwarty.


Uzupełnienie: slow po A45 268/268 na tym samym kodzie produkcyjnym A46; test A46 poza slow.


A47: sprawdzono tabelę 10 zmienionych talii i zaktualizowano status README, zachowano historię; pokrewne 40/40, fast 9444/9444, build 5638,0 kB, slow po A45 268/268 na tym samym kodzie produkcyjnym. Audyt #177 otwarty.


A48: 4 rzeczywiste testy Rupture Spire/Druid/Fiery Fall, odpowiedź i mana w puli; pokrewne 18/18, fast 9448/9448, build 5638,0 kB. Slow po A45 268/268 na tym samym kodzie produkcyjnym; audyt #177 otwarty.


A49: 3 realne testy infect, liczników i wyboru proliferate, pokrewne 20/20, fast 9451/9451, build 5638,0 kB. Slow po A45 268/268 na tym samym kodzie produkcyjnym; audyt #177 otwarty.


A50: Final Parting rzeczywisty RED prywatność/tasowanie (błędy już w bazie #177), fix GREEN, pokrewne 82/82, fast 9456/9456, build 5639,0 kB; slow na A50 268/268. Surowe eventy nie są filtrowanym API. Otwarte: dobór karty do grobu, możliwe warianty przy 1 karcie i inne search.


A51: bezpośredni diff #177 L, 5 realnych testów Ambulatory Edifice, dwie mutacje, pokrewne 24/24, fast 9461/9461, build 5639,0 kB. Slow po A50 268/268 na tym samym kodzie produkcyjnym. Kontynuować bezpośredni diff #177.


A52: bezpośredni diff #177 G — 5 rzeczywistych kontr i interakcji, mutacja 10→6 wykryta, pokrewne 31/31, fast 9466/9466, build 5639,0 kB; slow po A50 268/268, zachowanie produkcji bez zmian. Kontynuować bezpośredni diff #177.


A53: bezpośredni diff #177 PMSSB-80, 6 realnych scenariuszy Rockslide, dwie mutacje, pokrewne 22/22, fast 9472/9472, build 5639,0 kB. Slow po A50 268/268 na tym samym zachowaniu produkcyjnym. Kontynuować bezpośredni diff #177.


A54: bezpośredni diff #177 PMSSB-81, sprostowany błędny cytat Hounds, dwa realne testy i dwie mutacje, pokrewne 49/49, fast 9474/9474, build 5639,0 kB. Slow po A50 268/268 na tym samym zachowaniu produkcyjnym. Kontynuować bezpośredni diff #177.


A55: bezpośredni diff #177 helpera testera, miejsc logu i help benchmarku; realna etykieta po saddle, pokrewne 29/29, fast 9477/9477, build 5639,0 kB. Slow po A50 268/268 na tym samym zachowaniu produkcyjnym. Żadnego B0 ani gry przeglądarkowej. Kontynuować bezpośredni diff #177.


A56: bezpośredni diff #177 PMSSB-82, rzeczywista walka, wybór bota i delirium, dwie mutacje wykryte; pokrewne 45/45, fast 9481/9481, build 5639,0 kB. Slow po A50 268/268 na tym samym zachowaniu produkcyjnym; A56 poza slow. Kontynuować diff #177.


A57: niepełne podłączenie nowych danych #177 do logu, zastany objaw, RED dwóch rzeczywistych czarów → GREEN; 7 testów, pokrewne 28/28, fast 9488/9488, build 5639,2 kB. Slow A57 268/268, log `.arena/a57-slow.log`. Kontynuować audyt diffu #177.


A58: bezpośredni diff #177 wyceny Dawntreader Elk, pięć testów realnego kosztu i search, mutacja wykryta; pokrewne 35/35, fast 9493/9493, build 5639,2 kB. Slow po A57 268/268 na tym samym zachowaniu produkcyjnym; A58 poza slow. Kontynuować diff #177.


A59: bezpośredni diff #177 G, Force Away, rzeczywiste odbicia i ferocious, 6 testów, mutacja wykryta; pokrewne 75/75, fast 9499/9499, build 5639,2 kB. Slow po A57 268/268 na tym samym zachowaniu produkcyjnym; A59 poza slow. Kontynuować diff #177.


A60: bezpośredni diff #177 PMSSB-6, Frightful Delusion na rzeczywistym stosie, 6 testów i mutacja wagi; pokrewne 63/63, fast 9505/9505, build 5639,2 kB. Slow po A57 268/268 na tym samym zachowaniu produkcyjnym; A60 poza slow. Kontynuować diff #177.


A61: bezpośredni diff #177 batch 71, realny Ambassador Oak i token z Ivy Lane Denizen; 3 testy, mutacja koloru, related 52/52, fast 9508/9508, build 5639,2 kB. Slow po A57 268/268 na tym samym zachowaniu produkcyjnym; A61 poza slow. Kontynuować diff #177.


A62: 10 kart #177, zgodność cech/tekstu ze snapshotami i rzeczywista instalacja; przegląd strażników, CSV i trzech dodanych numerów CR. Mutacja instalacji wykryta; related 92/92, fast 9518/9518, build 5639,2 kB. Slow po A57 268/268 na tym samym kodzie produkcyjnym; A62 poza slow. Audyt diffu trwa.


A63: realne Edifice i Benevolent Blessing — wycena nielegalnego celu, RED→GREEN i wybór bota; defekt sprzed #177. Related 97/97, fast 9523/9523, build 5639,5 kB; slow 268/268 na kodzie po A63.


A64: PMSSB-81/25/26, rzeczywista walka Hounds i koszt dwóch kart bez koloru, 4 testy; mutacja parametrów RED, related 39/39, fast 9527/9527, build 5639,5 kB. Slow po A63 268/268, A64 poza slow. Audyt trwa.


A65: odtworzono 6+6 historycznych śladów golden mastera, wykryto i sprostowano mylną interpretację wybranego scoreSum oraz opisy Reavera/kwoty Rockslide. Related 32/32, golden 4/4, fast 9527/9527, build 5639,5 kB; slow po A63 268/268 na tym samym kodzie, A65 poza slow. Nie B0. Kontynuować przegląd zmian produkcyjnych.

A66: Morbid/token Ambassador Oak poświęcony Village Rites i Liliana’s Triumph (pre-existing brak LKI); oraz potwierdzona regresja #177: unearth Etherium Abomination wygnane przez Rites, Spin Out i Fiery Fall fałszywie ustawia Morbid. RED porównany z archiwami bazowym i po #177; dwa generyczne fixy, 12/12, related 101/101, fast 9539/9539, build 5640,0 kB. Slow aktualnego kodu 268/268. Audyt nadal trwa.

A67: Somberwald Spider, drugi rzeczywisty odbiorca Morbid — rzut i Unbreakable Bond po śmierci tokena, wygnaniu unearth i bez śmierci. Regresję #177 odtworzono w archiwum względem bazy (2/2 vs 0/2), mutacja trackera wykryta na licznikach. 6/6, related 34/34, fast 9545/9545, build 5640,2 kB; slow po A66 268/268, ten sam kod. Audyt trwa.

A68: realny Scorn, Curiosity i Feedback — wspólne odbicie hosta i wybranych aur; błąd występuje także w bazie #177. Naprawa kolejności przetwarzania wybranych załączników, 10/10, mutacja 5 RED, related 69/69, fast 9555/9555, build 5641,2 kB; slow 268/268. Nie deklarować ogólnej jednoczesności/LKI. Audyt trwa.

A69: Converge Kaleidoscorch realnie płatny i flashback oraz 3 darmowe ścieżki (Appraiser, Halo Forager, Epic Experiment), dwa niezależne RED mutacji; 5/5, related 80/80, fast 9560/9560, build 5641,2 kB, slow po A68 268/268 na tym samym kodzie. Audyt trwa.

A70: Scorn na czterech prawdziwych stworach i Curiosity, realne bestow Dryad oraz Germ ze Strandwalker; decyzja bota i faktyczne strefy, mutacja liczenia bestow RED. 3/3, related 60/60, fast 9563/9563, build 5641,2 kB; slow po A68 268/268 na tym samym kodzie. Audyt trwa.

A71 OTWARTE: realny Shock/Goblin Picker, Crows i Selhoff u obu graczy ujawnia przeplot APNAP i inny draw/mill. Ten sam defekt w bazie `59815d5` i #177, nie regresja; 4 wykonujące się TODO czerwone, 2 kontrole zielone. Samo końcowe sortowanie nie daje poprawnej kolejności wyborów. Potrzebna spójna kolejka triggerów i celów (CR 603.3b/d), uwzględnić A28 madness, inne decyzje i replay. Related 64 pass + 4 TODO, fast 9565 pass + 4 TODO, build 5641,2 kB. Audyt nieukończony.

A72: Prishe’s Wanderings (basic/Town/fail-to-find) i Hounds w jednym stanie, ograniczenie stref/kwalifikatorów i atomowe odrzucenie niedozwolonych komend; dwa RED mutacji, 4/4, related 59/59, fast 9569 pass + 4 TODO A71, build 5641,2 kB. A71 wciąż otwarte, audyt trwa.

A73: spreparowane `destination` search omijało Morbid Caravan Vigil i mogło wyłożyć stwora przez Final Parting; odtworzone na bazie #177 i #177, wcześniejszy defekt. Walidacja korzysta ze wspólnej listy destynacji z ofertą; nielegalne komendy atomowo odrzucane, oba legalne warianty Morbid i default starszych komend zachowane. 5/5, mutacja 5 RED, related 119/119, fast 9574 pass + 4 TODO A71, slow 268/268, build 5641,5 kB. A71 nadal otwarte; audyt trwa.

## Zgłoszenia właściciela 2026-11-02 i A74

Plan `docs/plans/PLAN_2026-11-02-uwagi-manowar-austere.md`: bot nie rzuca nosiciela obowiązkowego ETB bounce na dowolnego stwora, jeśli brak legalnego stwora przeciwnika; legalność ludzkiego rzutu pozostaje bez zmian. Austere Command: cztery checkboxy, wybór dokładnie dwóch, sześć par rozstrzygniętych w testach. Wspólna bramka odrzuca niewyspecjalizowane listy kombinacji o tablicowych polach i metadanych złożonych trybów; testy mutacyjne i inwentarz `choose two`. To strukturalny strażnik, nie dowód na wykrycie dowolnego przyszłego niestandardowego kodowania semantyki w polu skalarnym — nowe deskryptory muszą deklarować składniki i przejść przez kreator. Fast 9606 pass + 1 TODO, build 77/5656,3 kB; slow 268/268.

A74 utrwalono: ograniczone APNAP naprawia oryginalny przypadek A71, ale `Polluted Dead`/cel ląd nadal RED na bazie, #177 i teraz (wykonywane TODO). Pozostałe checkpointy, Ward i mieszane decyzje również otwarte; dalszy audyt #177 nieukończony, bez B0. Szczegóły i golden-master w raporcie.

Uzupełnienie testów: rzeczywiste Magic Damper z hexproof i produkcyjny router+DOM Austere, skorelowane pola tablic wyboru; fast 9611 pass + 1 TODO, pokrewne ze slow UI/session 246/246, build 77/5656,3 kB. Slow 268/268 przed zaostrzeniem strażnika, pełny slow po tym zaostrzeniu 268/268.

Austere także przez Epic Experiment oraz okno Vaan: testy routingu RED→GREEN, bez list par, legalna odmowa osobno; fast 9611 pass + 1 TODO, related 248/248, build 77/5656,3 kB. Pełny slow ostatniego kodu 268/268.

A75: Polluted Dead / Circle of the Land Druid — cele lądów w APNAP; cztery RED na bazie #177, #177 i przed fixem, ograniczone GREEN w obu orientacjach, pojedynczy auto-cel, obce/nielegalne cele, dwa testy Ward granicy, bot i replay dla obu kart. Mutacje wykryte 5+1. Fast 9621/9621 bez TODO, slow 268/268, pokrewne 189/189 przed testami replay, build 77/5656,8 kB. APNAP z Ward, mieszanymi decyzjami i innymi checkpointami nadal otwarte; audyt trwa.

A76: APNAP po `resolve_combat` bez zawieszenia, także first strike; 4 historyczne RED → 8 GREEN, mutacja 8 RED, fast 9629/9629, slow 268/268, build 77/5656,9 kB. Otwarte: inne checkpointy (np. aktywacja z kosztem ofiary), przypisanie obrażeń/replacement, Ward, mixed triggers. Audyt trwa.

A77: APNAP kosztów poświęcenia niemanowych Elk/Dreadmaw, 8 historycznych RED i 14 testów GREEN, obie mutacje wykryte; fast 9643/9643, related 110/110, build 77/5657,5 kB, slow 268/268. Mana i odrzucenie wyłączone bez twierdzenia poprawności; pozostałe checkpointy i ogólny APNAP otwarte.

A78: 4 historyczne RED / 7 GREEN Scion z prawdziwego Scion Summoner, samodzielna mana; płatność Ward nie zostaje przerwana nowym batch, ale jej APNAP nie poprawiony. Mutacja 6 RED, pokrewne 95/95, fast 9650/9650, build 77/5658,2 kB, slow 268/268. Sonda: Ward auto-kontruje Shock przy puli 1 + Scion mimo możliwości dopłaty; dodatkowo zeruje pending przed walidacją. Formalny RED i osobny plan A79 przed zmianą.

A79: Ward przedwcześnie kontrował Shock/zdolność Justiciara mimo Sciona; nieopłacalny pay usuwał pending. Oba historyczne; poprawiono, wspólna konserwatywna bramka może pokazać samą odmowę. 11 testów GREEN, dwie mutacje; fast 9660/9660 i related 84/84 przed dodatkowym testem Justiciara, build 77/5658,3 kB, slow 268/268. Następny trop: `pendingPayOrSacrifice` i `pendingOptionalPay` mutują decyzję przed płatnością many, formalny RED i plan przed zmianą.

## A80 / A81

A80: 4 RED na bazie `59815d5`, #177 i przed poprawką: rzeczywisty Scion/Rupture Spire obaj gracze oraz syntetycznie zubożona pula po prawdziwej decyzji (dawniej wyjątek i utrata decyzji). 11 GREEN: odmowa, cudzy Scion, zatapowane źródło, replay i deskryptor/kreator oraz rzeczywisty Bone Shredder (wejście do upkeep zainicjowane zdarzeniem), w tym kontrola kolorowego echa i syntetycznie zubożonej puli. Konserwatywna bramka źródła dotyczy tylko generycznego kosztu, może dać samą odmowę; kolorowe echo z ręczną maną nadal poza zakresem. Sprawdzanie zapłaty następuje przed mutacją; komenda zapłaty oferowana tylko dla osiągalnych źródeł, bez automatycznej ofiary Sciona. Mutacje otwarcia i atomowości odpowiednio 4 i 5 RED (przed dodaniem testu kreatora); pokrewne 84/84, fast 9671/9671 (przed testem kreatora i RED A81), build 77/5659,3 kB, slow 268/268; pełny APNAP płatności i opcjonalne dopłaty nadal otwarte. A81 rozpoczęte: Scion/Pangolin oraz spreparowane niewystarczające zasoby dla Pangolina i Zoraline RED również na bazie i #177; nie są regresjami #177. A82 planuje zbadać kolory kreatora, na razie podejrzenie.

## A81–A82

A81: 7 RED baza/#177/przed zmianą: rzeczywisty Pangolin + Scion dla obu graczy, syntetyczne zubożenie puli po otwarciu decyzji oraz rzeczywista Zoraline (syntetyczny ubytek koloru lub życia) i Kappa (syntetyczne zdarzenie obrażeń i zdjęcie znacznika po otwarciu). GREEN 12: też prawidłowe zapłaty, odmowa, brak źródła, zachowawcza odmowa dla zatapowanego źródła i replay. Generyczne okno zachowane, całość kosztu walidowana przed mutacją; kolorowa ręczna mana poza zakresem A81 (A83 RED). Mutacje: bramka 4 RED, walidacja 5 RED. Pokrewne A81/A82 128/128, fast 9689/9689, build 77/5661,6 kB, slow 268/268. APNAP w trakcie płatności nieobjęty.

A82: 4 RED na bazie/#177/przed zmianą — rzeczywista decyzja Zoraline {W}{B} i echo Bone Shredder {2}{B} (upkeep inicjowany zdarzeniem), błędne źródła oraz zakończenie postępu mimo braku pipów. GREEN 5: deskryptor, filtrowanie, postęp, rzeczywista płatność przez finishWizardPayment i reanimacja; mutacja usuwa pipy 4 RED. Pokrewne z A81 128/128, fast 9689/9689, build 77/5661,6 kB, slow 268/268.

## A83 i otwarte A84

A83: cztery RED na bazie `59815d5`, #177 i przed poprawką: prawdziwy Scion pokrywa część generyczną echa Bone Shredder {2}{B} oraz Forebear {1}{W} (obaj gracze; upkeep echa zainicjowany zdarzeniem). 7 GREEN z kontrolami brakujących pipów, skutkami, replay. Mutacje bramek 2 i 3 RED. Konserwatywne okno jest możliwe również dla kolorowego kosztu, gdy pipy pokrywają zwykłe źródła; Scion nie zastąpi koloru, a źródła nigdy nie są poświęcane automatycznie. Ręczne źródło nieobsługiwane przez automat, które samo produkuje brakujący kolor, nadal poza dowodem. Pokrewne 78/78, fast 9696/9696 przed dodaniem A84, build 77/5661,7 kB, slow 268/268.

A84 — OTWARTE, bez udawanej poprawki: `AUDIT_A84_ENFORCE=1 node --test test/audyt-pr177-a84-ward-apnap.test.js` daje 8 RED w aktualnym stanie. Samodzielne `test` oznacza osiem skip, aby nie psuć wszystkich testów; wymuszony przebieg nadal wykonywalny. Po aktywacji Sciona podczas rzeczywistego Ward dwa Crows trafiają na stos zanim dopłata Ward się zakończy, zaś po opłaceniu nie ma prawidłowych wyborów APNAP. Na bazie/#177 pierwsze cztery kontrole przedwczesnego stosu pozornie przechodzą, ponieważ historycznie w ogóle gubiono triggery śmierci tokena (A66); pozostałe cztery RED z powodu braku oczekiwanych triggerów. Nie twierdzimy więc, że ten sam objaw stosu wykazano na bazie. Potrzebne zachowanie LKI i momentu triggerowania dla wielu ręcznych aktywacji/źródeł, powiązanie z nieukończonym efektem, innymi decyzjami i kolejnymi zdarzeniami; proste odroczenie skanowania zdarzeń albo schowanie już utworzonych wpisów może zgubić źródła, utrwalić niewłaściwe cele lub złamać inwarianty stosu. Pełne rozwiązanie otwarte.

## A85

A85 — HISTORYCZNIE przed A88: Panic Spellbomb + rzeczywisty Holdout Settlement i nietapnięty Goblin Piker nie otwierały dopłaty {R}, chociaż legalna zdolność lądu tapuje stwora i produkuje czerwony kolor. Niezależny test z syntetycznym usunięciem czerwonej puli po otwarciu decyzji wykazał też brak tej zdolności w źródłach kreatora. Na bazie/#177 oraz przed A88 3 RED + 1 GREEN (bez stwora). `AUDIT_A85_ENFORCE=1 node --test test/audyt-pr177-a85-holdout-pay.test.js` wymusza RED; wówczas domyślnie 3 skip i 1 GREEN; po A88 1 skip i 3 GREEN, a po A90 wszystkie 4 GREEN w ograniczonym scenariuszu, patrz niżej. Powody nierozwiązania: bieżąca miara źródeł ręcznych liczy netto i nie może liczyć lądu drugi raz, kreator ignoruje bezkosztowy w manie wariant lądu z kosztem tapnięcia stwora; trzeba ująć wybór kosztu bez nielegalnych kombinacji i bez jednoczesnego użycia tego samego permanentu jako źródła i kosztu. Czyste otwarcie okna bez poprawnej oferty i ścieżki UI nie byłoby pełną naprawą. Pierwotnie nie wprowadzono zmian produkcyjnych A85; ograniczoną zmianę silnika wprowadzono następnie w A88.

## A86

A86: dwa RED na bazie/#177 i przed zmianą (bramka oraz rzeczywisty router `main.js` wywołany w VM), 4 GREEN: przy ręcznie osiągalnym {R} sama suma {C} nie zamyka kreatora, gdy automat nie pokryje kolorów; kontrola braku wariantu i poprawnej auto-płatności. Rzeczywista decyzja Panic Spellbomb po syntetycznym zubożeniu puli; źródło ręcznie zbudowane z prawdziwej legalnej komendy Holdout, gdyż A85 nadal nie naprawione. Zmiana przekazuje wymagania kolorów do `canPayColoredCost` z wykluczeniami i celem nieartefaktowym; kontrole Powerstone/bestow. Mutacje bramki 2 RED, routingu 1 RED. Powiązane 80 pass + 3 skip (otwarte A85), fast 9701 pass + 11 skip (A84/A85), slow 268/268, build 77/5662,1 kB. A86 nie usuwało braków okna/źródeł i UI wyboru kosztu A85; okno dopłat jednego pipa naprawiono następnie w A88.

## A87–A88 w toku

A87 — częściowy krok: z legalnych ofert prawdziwych Holdouta/Wardena i Goblin Pikera zbudowano syntetyczny model kosztów (`tapCostChoices`), którego lista źródeł A85 wtedy jeszcze nie produkowała (podłączono w A90). Dwa RED na bazie/#177 i przed poprawką: Warden nie może opłacić kosztu oraz dać many, a dwa Holdouty nie mogą tapnąć jednego stwora. Dopasowanie różnych obiektów kosztu z wykluczeniem źródeł w solverze: 5 GREEN, mutacja 2 RED. To przygotowany kontrakt, nie dowód błędu faktycznej listy UI ani zamknięcie A85; żadne wybory nie są wykonywane automatycznie ani wyświetlane jako kombinacje. Powiązane 85 pass + 3 skip, fast 9706 pass + 11 skip, slow 268/268, build 77/5663,1 kB.

A88 przed poprawką: realne Panic Spellbomb + Holdout i 1 nietapnięty stwór, 3 RED/3 GREEN; trzy wcześniejsze RED odtworzono na bazie/#177 (dodatkowe kontrole po tym porównaniu). Następnie poprawiono silnik; osobny brak UI A85 był wtedy otwarty, poprawiony dla tego scenariusza w A90.

## A89 — dopłaty botów po A80/A81

A89 — regresja po poszerzeniu ofert A80/A81 (nie historyczny błąd tej konkretnej decyzji: na bazie/#177 okno się nie otwierało). Rzeczywiste Rupture Spire/Oreplate Pangolin i Scion z rzutu: 6 RED, heurystyczny bot dla obu graczy wybierał odrzuconą płatność; random także (seed 7), aggro również. Wspólny filtr automatycznej płatności i ocena ręcznej aktywacji przed płatnością: 8 GREEN, w tym syntetyczne kontrole puli Powerstone i odmowy niekorzystnego refleksu. Aggro może odmówić zamiast aktywować. Mutacje: filtr heurystyczny 4 RED, premia aktywacji 4 RED, filtr random 2 RED, filtr aggro 2 RED. Powiązane 79 pass + 6 skip (A85/A88), fast 9717 pass + 14 skip (A84/A85/A88), build 77/5664,7 kB; slow 268/268. Brak ogólnego dowodu dla wieloźródłowego finansowania, w szczególności A85/A88 kolorowych pipów przez Holdouta.

## A88 — wąska dopłata pojedynczym kolorem

`45cbeca` otwiera realną możliwość wyprodukowania pojedynczego pipa przez Holdout Settlement/Dragonbroods Relic kosztem tapnięcia stwora: okno jest konserwatywne, oferta wymaga legalnej zdolności i rzeczywistego kandydata, executor nadal wymaga wyprodukowanej many. Rzeczywiste Panic Spellbomb u obu graczy, replay, odmowa, błędny kolor/Heap Gate, tapnięte źródło i brak stwora, Zoraline z dwoma Holdoutami i jednym stworem (bez obietnicy dwóch pipów), bezpieczeństwo botów. 10 GREEN, mutacje bramki 4 RED i oferty 2 RED; mutacja usunięcia sprawdzenia tapCreatureId przeżyła, bo legalna enumeracja już zapewnia id. Po A88 A85 miał 3 GREEN i 1 wymuszony RED (wariant źródła UI), 1 domyślny skip; A90 naprawia ten ograniczony scenariusz. To nie naprawa wielu kosztów/pipów ani kreatora. Powiązane 104 pass + 1 skip (A85 UI), fast 9726 pass + 9 skip (A84/A85), slow 268/268, build 77/5666,8 kB.

## A90 — sekwencyjny koszt stwora (A85 dla jednego pipa)

Przed poprawką w aktualnym kodzie 9 RED / 1 GREEN na prawdziwym oknie Panic Spellbomb, bez syntetycznego zdejmowania many. `26514fa`: legalne warianty {T}+tap stwora grupowane w JEDEN wiersz trybu źródła; osobny krok pokazuje poszczególne stwory i powrót bez opłaty. Po wybraniu kosztu ponowna walidacja względem bieżących legalnych komend, potem aktywacja i dopłata. Bezbarwna zdolność Holdouta to osobny tryb tego samego źródła. Rzeczywiste Holdout, Dragonbroods Relic, Warden, oba kierunki graczy, routing `main.js` w VM, DOM, replay i syntetyczna zmiana tapnięcia po otwarciu kroku; 11 GREEN, A85 4 GREEN bez flag i bez skipów. Produkcyjne źródła zasilają `tapCostChoices` solvera A87, kontrola Warden nie liczy go jako kosztu i źródła jednocześnie oraz rezerwacja convoke. Mutacje listy 8 RED, sekwencji 2 RED, walidacji przestarzałego wyboru 1 RED, dopasowania 1 RED. Pięć fixture VM uzupełniono importem nowej zależności. Powiązane 164/164, fast 9738 pass + 8 skip (otwarte A84), slow 268/268, build 77/5671,2 kB. Poprawka dotyczy ograniczonego kształtu {T}+tap stwora i konkretnego okna jednego pipa, nie ogłasza ogólnej poprawności wielu kolorowych źródeł, wszystkich kosztów, ani A84 APNAP.

## A91–A92 — koszt tapnięcia Heap Gate

A91: w bazie/#177 i przed poprawką 6 RED/1 GREEN: rzeczywista oferta Heap Gate z wybranym Basilisk Gate pokazywała w kreatorze kosztu many tę samą bramę jako źródło. W routerze rodzica i potomka `481f50d` rezerwuje wskazany permanent typu, stwora i innego stwora na podstawie deskryptora kosztu, nie celów efektu. 8 GREEN, rzeczywisty skarb, replay i kontrola Holdout/Station; trzy mutacje wykryte (4, 1, 1 RED). Powiązane 120/120, build 77/5671,8 kB, fast 9746 pass + 8 skip (A84), slow 268/268.

A92 niezależnie: po legalnym tapnięciu wskazanej bramy przestarzała komenda Heap Gate zwraca odrzucenie, ale wcześniej tapuje Heap Gate i zmienia fingerprint — 6 RED/1 GREEN na bazie/#177 i przed fixem. RED zapisano w 8e6e31d i b0adb78, naprawiono w d7637e6. Finalnie `d7637e6` waliduje bramę i manę przed kosztem, z wykluczeniem zarezerwowanej bramy; 11 GREEN (syntetyczna zmiana strefy i brak ID jako kontrole), mutacje 9/1/2 RED. To nie dowód atomowości innych kosztów aktywacji.

A92 rozszerzenie RED: po prawdziwym Shocku silnik liczy Gate wybrany jako koszt jako jedyne źródło {1}, po czym tapuje oba landy i odrzuca aktywację; baza/#177/aktualnie 9 RED/2 GREEN. Izolowany prototyp obejmuje przedwalidację i wyłączenie Gate z dostępnej many; mutacje 9/1/2 RED, naprawione w d7637e6. A93 RED: ożywiony (syntetyczny efekt) prawdziwy Holdout może zostać zaoferowany i zaakceptowany jako stwór do zapłaty swojego `{T}, tap creature`; 8 RED/3 GREEN w trzech wersjach, izolowany prototyp 11 GREEN, 4 mutacje wykryte. Obie poprawki są w produkcji (d7637e6, 56f0a74); A91 fast 9746 pass + 8 skip (A84), slow 268/268.

### A92/A93: produkcja i ograniczenia

A92: `d7637e6` — prawdziwy Heap Gate, przeterminowana brama lub brak dostępnej many po Shocku; 11 GREEN, 9/1/2 RED mutacji, oba gracze, replay. A93: `56f0a74` — rzeczywisty Holdout ożywiony syntetycznie; osobny stwór musi opłacić koszt gdy źródło ma własne `{T}`; 12 GREEN/replay, mutacje oferty/wyboru domyślnego/jawnego/strefy 3/2/2/1 RED. Kontrole obejmują Shock usuwający wybranego stwora i syntetyczny deskryptor bez `{T}`. Wspólny szybki podzbiór 52/52; powiązane 403 pass + 8 skip (A84), build 77/5672,7 kB, fast 9769 pass + 8 skip, slow 268/268. Nie twierdzimy, że wszystkie złożone koszty aktywacji są atomowe ani że A84 jest rozwiązane.

A94 (`8a567ca`) nowy RED: w realnej dopłacie Panic Spellbomb, Scion uruchamia cel Selhoff i blokuje wykonanie oferowanego Holdouta/lądu (`trigger_target_unresolved`), choć można odmówić; 6 RED/4 GREEN, historycznie brak okna A88. Izolowany prototyp zwalnia tylko zdolności many właściciela decyzji opcjonalnej spod tej bramki, 10 GREEN/mutacje 6/1 RED; nadal A84 bez poprawki i przedwczesne triggery zaobserwowane również w Spellbomb. Zastosowano `5154403`: 10 GREEN, podzbiór 115/115, A84 nadal 8 wymuszonych RED; fast A92/A93 9769 pass + 8 skip, slow 268/268; A94 powiązane 608 pass + 8 skip, fast 9779 pass + 8 skip, slow 268/268, build 77/5673,1 kB.

### A94 — ograniczona poprawka, nie APNAP

`5154403` przepuszcza źródło many decydującego przez późniejszą bramkę oczekującego celu tylko przy `pendingOptionalPay`; pozostałe komendy nadal blokuje pierwsza decyzja, bez dopłaty nadal blokuje cel. W rzeczywistej sytuacji po Scionie i triggerze Selhoff Holdout plus osobny stwór wytwarza {R}, Spellbomb dobiera, oba kierunki aktywnego i płacącego; 10 GREEN, replay, tap lądu i odmowa. Przed poprawką 6 RED/4 GREEN; na bazie/#177 nie otwiera się okno A88 i tego samego błędu nie wykazano. Mutacje obejścia/istnienia decyzji 6/1 RED. Podzbiór 115/115; powiązane 608 pass + 8 skip, fast 9779 pass + 8 skip, slow 268/268, build 77/5673,1 kB. Wymuszony A84 nadal 8 RED: ta zmiana nie opóźnia położenia triggerów i nie rozwiązuje ogólnego APNAP ani innych decyzji płatności.

A95 `0fb59b4` RED: dwa Sciony z prawdziwych Summonerów muszą kolejno opłacić Ward {2}, ale po pierwszym celu Selhoff drugi jest odrzucany; 5 RED/3 GREEN. Historyczne wersje nie otwierają okna. Izolowany prototyp poszerzenia A94 o Ward: A94+A95 18 GREEN, mutacje 5/6 RED; nie naprawia A84. A95/A96 poprawione w `41c4591`; A94 powiązane 608 pass + 8 skip/build 77/5673,1 kB, fast 9779 pass + 8 skip, slow 268/268.

A96 `2bcfa3b` RED: Izzet Charm kontra `{2}`, Shock i dwa realne Sciony; drugi odrzucany po celu Selhoff, 5 RED/3 GREEN w bieżącej/bazie/#177 z tym samym objawem. Wspólny izolowany prototyp A94/A95/A96 26 GREEN, mutacje counter/Ward/optional 5/5/6 RED; APNAP A84 pozostaje otwarte. Produkcja `41c4591` zawiera A95/A96, A94 slow 268/268.

### A95–A96: Ward i kontr-dopłata, nadal bez APNAP

`41c4591`: podczas Ward i kontry ta sama bramka oczekującego celu dopuszcza legalną manę płacącego co A94. Dwa prawdziwe Sciony z Summonerów finansują Ward {2} lub Izzet Charm {2}; Selhoff wyzwala cel po pierwszym. A95 przed zmianą 5 RED/3 GREEN (baza/#177 nie otwierają Ward), A96 5 RED/3 GREEN także w bazie/#177 z tym samym objawem. Po poprawce 8+8 GREEN z replay, obie orientacje, odmowa i blokady; mutacje wyłączenia counter/Ward/optional 5/5/6 RED. Powiązany podzbiór 131/131; powiązane 624 pass + 8 skip, fast 9795 pass + 8 skip, slow 268/268, build 77/5673,2 kB. A84 wymuszony nadal 8 RED: nie naprawiono umieszczania triggerów, APNAP ani pozostałych decyzji.

A97 RED: realny Bone Shredder echo `{2}{B}` z czarnym pipem i dwoma Scionami, wejście upkeep syntetycznym zdarzeniem jak A80. Pierwszy Scion wyzwala cel Selhoff i blokuje drugiego; 3 RED/3 GREEN, historycznie brakuje okna A83. Izolowane poszerzenie na pay-or-sacrifice 32 GREEN łącznie A94–A97, cztery mutacje 3/5/5/6 RED; poprawiono w `cfe9dae`, A84 nadal otwarte.

A95/A96 po poprawce: powiązane 624 pass + 8 skip, build 77/5673,2 kB, fast 9795 pass + 8 skip, slow 268/268.

### A97: echo Bone Shredder, nie APNAP

`cfe9dae` pozwala użyć many płacącego podczas `pendingPayOrSacrifice` mimo oczekującego celu triggera. Bone Shredder z `{B}` i dwa realne Sciony z Summonerów płacą echo `{2}{B}`; cel Selhoff po pierwszym nie blokuje drugiego. 3 RED/3 GREEN przed poprawką, 6 GREEN po; replay, odmowa, obaj gracze. Upkeep inicjowany syntetycznym zdarzeniem jak A80; baza/#177 nie otwierały okna A83. Wspólne mutacje czterech dopłat 3/5/5/6 RED, podzbiór 137/137; powiązane 630 pass + 8 skip, build 77/5673,2 kB; fast/slow w toku. A84 wymuszone nadal 8 RED, brak dowodu prawidłowego APNAP i pozostałych decyzji.

A97 — doprecyzowanie setupu: karta i aktywacje/Sciony są prawdziwe, wejście w upkeep inicjuje syntetyczne zdarzenie, a pule many do przygotowania partii i pip `{B}` są ustawiane pomocniczym `addMana`; nie jest to pełna rozgrywka od rozpoczęcia partii. Powiązane 630 pass + 8 skip (A84), build 77/5673,2 kB, fast/slow w toku.
