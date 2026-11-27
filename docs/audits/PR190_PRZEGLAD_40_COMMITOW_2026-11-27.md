# PR #191 — przegląd 40 commitów i zamknięcie audytu PR #190

Baza gałęzi `3facebd`, przeglądane commity od `d232485` do `b805815`. Właściciel nakazał zatrzymanie pierwotnej pętli po 40 commitach, klasyfikację i ograniczenie zakresu do obecnych kart. **Audyt zamknięto w tym ograniczonym zakresie; pierwotne E1–E3 nie zostały w całości wykonane.** Mapa 71 plików jest inwentarzem, nie dowodem pełnej weryfikacji każdego pliku. Nie ma podstaw twierdzić, że PR #190 nie zawiera innych usterek. Pełnego B0 nie uruchomiono.

Legenda: **zachowano** — rzeczywista poprawka lub użyteczne testy; **pomocniczy** — dokumentacja, test lub narzędzie, nie usterka gry; **wycofano** — brak obecnego nośnika; **częściowo** — zachowano tylko istotny zakres. Zmiany wycofano selektywnie w kolejnych zmianach gałęzi, bez przepisywania historii.

| Commit | Decyzja i podstawa |
|---|---|
| `d232485` | pomocniczy: plan |
| `608a9ec` | pomocniczy: reprodukcja Nobla |
| `66f189e` | zachowano: Malevolent Noble i Vault of Whispers; część testów self-sacrifice syntetyczna |
| `5c41bb6` | zachowano: drenaż Orazca Puzzle-Door i Gurmag Drownera w wycenie bota |
| `189b5e0` | zachowano: poprawka danych Coordinated Maneuver zgodna z Oracle; brak PW w katalogu, nie dowodzi błędu obecnej partii |
| `f113562` | pomocniczy: komunikat Vaporkina |
| `3dacdde` | pomocniczy: handoff |
| `5b0dc94` | zachowano: LKI Gutsy; realna Memory's Journey przenosi kartę z grobu przed wyzwalaczem, stary kod 0 zamiast 2 Junk |
| `64cd9b3` | zachowano: dwa Translatory mogą znaleźć się pod jedną kontrolą po Awaken the Sleeper; przy 1 życiu nie wytworzą 2 many |
| `0e898b1` | częściowo: zachowano rezerwację dla Phyrexian, realny przypadek także z jednym Translatorem i Porcelain Legionnaire; wycofano zmiany dla opcjonalnej płatności oraz syntetycznych połączeń kicker/buyback |
| `1bda488` | zachowano: przywrócony strażnik aktywacji istniejącego tokenu Mutagen |
| `cc6eab8` | pomocniczy: opis sondy Hurd |
| `3c8fb9f` | zachowano: korekta nieprawidłowych fixture Vaporkina |
| `fc38225` | pomocniczy: opisy scenariuszy |
| `591872e` | pomocniczy: brama |
| `e7743db` | pomocniczy: naprawa detektora testera, nie silnika |
| `811cad7` | pomocniczy: chronologia testera, zależy od detektora |
| `5b2f285` | pomocniczy: komunikaty i brama |
| `46d74a5` | zachowano: test istniejących Gutsy i Dryady z bestow |
| `d46a629` | pomocniczy: opis śladu |
| `59df1de` | zachowano: pin testowy Vandalize i poprawione opisy |
| `33e916d` | zachowano: sprostowanie pomiaru Gysahl Greens |
| `f7d2a18` | pomocniczy: mapa plików, nie dowód pełnego audytu |
| `3f4a700` | zachowano: korekta zasobów scenariusza Junk |
| `1aa843d` | pomocniczy: czytelność śladu ofiar, bez zmiany wyboru bota |
| `df86b35` | zachowano: atomowość nielegalnego kosztu X Krumara, bez dowodu częstego występowania w UI |
| `566e644` | zachowano: test rozróżnienia trybów Keep Out; obiekty enchantment creature istnieją |
| `30ad809` | wycofano: syntetyczna warunkowa restrykcja blokera |
| `c5356a2` | wycofano: syntetyczne nadanie restrykcji aurą |
| `31f668d` | zachowano: bot i rzeczywisty Vaporkin; heurystyka, nie legalność |
| `318e824` | zachowano: bot w mieszanej obronie z Vaporkinem; heurystyka |
| `1f24b75` | zachowano łącznie z `28091ff`: dopasowanie par blokerów dla realnych sytuacji; ograniczona heurystyka, nie solver walki |
| `e090f72` | wycofano: syntetyczne wielokrotne ograniczenia i format grup w widoku |
| `2f39407` | pomocniczy: brama i sprostowanie starszego raportu drenażu |
| `28091ff` | zachowano jako korektę `1f24b75`, nie niezależny błąd PR #190; poprawiona błędna kontrola ściany |
| `b07d760` | pomocniczy: szybki benchmark |
| `f4b86ea` | pomocniczy: weryfikacja generatora talii i komentarze P/T |
| `88564ab` | wycofano: koniunkcje filtrów bez obecnego drukowanego nośnika |
| `ddb2669` | pomocniczy: historyczny wynik bramy wycofanego eksperymentu |
| `b805815` | częściowo: test liczenia przy rozstrzygnięciu ma teraz istniejący cel-stwora zamiast syntetycznego PW/creature land; sama zmiana stanu testu jest syntetyczna |

Niezacommitowany F-190/29 (kopiowanie syntetycznych grup widoku i dwa testy) również odrzucono. Nie wykazano, że drukowany Vaporkin był mutowalny przez ten alias. Syntetyczne testy nie są same w sobie dowodem rzeczywistej potrzeby; ADR 0029 ich dopuszczalność nie stanowi podstawy rozwijania funkcji na zapas.

## Regresje i granice dowodów

- W repozytorium zapisano scenę Lightning Spear → śmierć Gutsy z 2 licznikami → Memory's Journey → 2 Junk. Przed `5b0dc94` kontrolna sonda zwracała 0; po poprawce 2.
- Dla `0e898b1`: jeden Translator, jedna mana i 2 życia nie wystarczają do wariantu Porcelain Legionnaire płaconego życiem; przy 3 życiach oferta pozostaje. Przed poprawką wariant przy 2 życiach był błędnie oferowany.
- Dwa Translatory: test przejęcia przez Awaken the Sleeper dowodzi realności przypadku przy singletonie. Poprzednia oferta obiecywała 2 many za jedno życie.
- Zoraline jako jedyny znaleziony trigger z kosztem many i życia wymaga `{W}{B}`; Translator daje `{C}`. Nie dowiedziono aktualnego przypadku wymagającego wycofanej rezerwacji opcjonalnej płatności. Brak drukowanego kickera/buybacku na dwóch obecnych kartach Phyrexian.
- Dopasowanie bloków bota to przybliżenie: nie dowodzi optymalnej gry ani pełnego rozwiązania menace. Zachowano istniejące testy realnych sytuacji i poprawkę regresji flying.
- Wyniki historycznych bram w raporcie dotyczą wymienionych tam stanów, nie bieżącego drzewa. Dwie partie testera zakończone naturalnie nie są pełnym pokryciem gry ani testem layoutu.

## Końcowa brama

Na nieruchomym drzewie kodu po wycofaniu: `npm test` **10 663/10 663**, `npm run build` **79 modułów / 6051,9 kB**, `npm run test:all` **10 947/10 947**, 0 fail/skipped, RC=0. Ostatnie 20 testów celowanych również zielone. Trzy nowe regresje na odseparowanych wcześniejszych stanach dały RED: Gutsy `0 !== 2` na `f113562`, przejęty Translator `2 !== 1` na `5b0dc94`, Phyrexian `true !== false` na `64cd9b3`. Po bramie dopisano tylko wyniki do dokumentacji.
