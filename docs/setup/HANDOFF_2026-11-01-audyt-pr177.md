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
