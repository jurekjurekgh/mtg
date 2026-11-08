# Plan 2026-11-08c — audyt PR #183 i kontynuacja pętli jakości

Sesja: `arena/76d4141f-mtg`. Wejście: „Kontynuujemy projekt.” bez nowego
zlecenia produktowego. Obowiązuje ADR 0020 (PR → audyt → małe zielone
commity), a przy braku nazwanego tematu ADR 0021 (pętla jakości).
Bez nowych kart (ADR 0029), pełnego B0 (ADR 0018), scalania i force push.

## Rozpoznanie i punkt zaczepienia

- Bieżący `main`/HEAD: `9b9591c`, scalenie #183. Baza poprzedniego PR:
  `12aac62` (scalenie #182), head `95144f5`. REST: **13 plików,
  +562/−21, 6 commitów**; lokalny diff ma 13 zakotwiczonych bloków,
  zgodnych z inwentarzem `pulls/183/files` (L190).
- #183 zawiera audyt #182, poprawki komentarzy/dokumentów oraz zmianę
  funkcjonalną E2/BM: cel triggera Gruul Beastmaster i klasyfikacja
  dynamicznych delt P/T. To nie jest PR wyłącznie dokumentacyjny.
- Własny pomiar bazy: `npm test` **10139/10139, fail 0**, build
  **78 modułów / 5802,6 kB**, oba EXIT 0. Logi: `.arena/baseline-*.log`.
- Najnowszy handoff: `docs/setup/HANDOFF_2026-11-08.md`, §6 (#183).
  Nie traktuję jego kolejki jako zlecenia ani nie wznawiam zgłoszenia J,
  wstrzymanego przez właściciela. Jedyny nieodhaczony punkt najnowszego
  planu to jawne „ODSTĄPIONE: bot-tie-audit”, nie ukryte zobowiązanie;
  audyt bieżącego PR ma pierwszeństwo. Audyt remisów mogę wykorzystać
  jako narzędzie pętla jakości, bez udawania kontynuacji nieistniejącego planu.

## E0. Plan i PR przed kodowaniem

- [x] Obowiązkowa lektura wykonana w całości: AGENTS, rejestr i wszystkie
  ADR-y, LESSONS (2267 linii), ENVIRONMENT (225 linii); następnie #183
  (opis, REST, cały diff) i najnowszy handoff.
- [x] Rozpoznanie i własne bramki bazowe.
- [x] Ten plan jako osobny commit, push gałęzi sesji i otwarcie jednego PR.

## E1. Audyt każdego pliku #183 względem jego bazy

- [x] Mapa **13/13** w `docs/audits/PR183_MAPA_PLIKOW_2026-11-08.md`:
  zakres zmiany, sprawdzony kontrakt, werdykt i dowód. Nie zamykam
  wiersza samym uruchomieniem testów.
- [x] `card-data.js`: porównanie Beastmastera z lokalnym snapshotem Oracle
  i jego rulingami; choice celu, `notSelf`, brak celu, X przy rozstrzyganiu,
  LKI oraz przypadek ujemnej mocy źródła. Sprawdzić cały łańcuch triggera,
  nie tylko obecność `requiresTarget`.
- [x] `effect-intent.js`: znak obu delt, liczniki i mnożniki, nieznane
  deskryptory; porównanie z konsumentami intencji i wyceny. Sprawdzić,
  czy klasyfikacja nie obiecuje zachowania, którego resolver nie wykonuje.
- [x] `triggers.js` i pin cytatu dnia/nocy: dosłowny tekst CR 732.2c,
  702.145d/g z wydania przypiętego w repo; mutacja komentarza ma dać RED.
- [x] Pozostałe 9 plików dokumentów/testów: spójność opisów z diffem,
  zachowanie faktów przy kondensacji, liczby z REST, zakres twierdzeń
  i domknięcie zgłoszeń. Nie przepisywać historii w celu upiększenia raportu.
- [x] Nowe testy E2/BM-1…5 oraz CR/732.2c: odtworzyć RED przeciw konkretnym
  zmianom #183, przywrócić zielony kod. Kopie mutowanych plików zrobić
  przed edycją; po każdej mutacji sprawdzić zakres diffu i czystość po cofnięciu.
- [x] Raport `docs/audits/AUDYT_PR183_2026-11-08.md`: stan przed/po,
  wynik każdego sprawdzenia, dowody mutacyjne, ograniczenia audytu.
  Znalezione błędy naprawić od razu, osobnymi commitami, bez zmiany ADR
  i bez nowych powodów `limitations`.

Kryterium ukończenia: mapa 13/13 z werdyktem, wszystkie znaleziska
zamknięte albo jawnie zablokowane decyzją/źródłem; `npm test` i build
zielone na każdym opublikowanym przyroście.

## E2. Naprawy wynikające z audytu (przed dalszą pętlą)

Potwierdzone F1/F2 reprodukcjami `.arena/repro-pr183.mjs` (raport §4/§5):
ujemne `source_power` daje ujemną deltę, a dynamiczny pump nie dociera do
oferty/wyceny celu. Naprawy poniżej, każda z pinami i mutacją.

- [x] Pobrać aktualne CR i rulingi dołączane do dowodu (ADR 0030); nie
  cytować z pamięci. Jeśli źródło niedostępne, nie wdrażać zmiany regułowej.
- [ ] Test odtwarzający błąd na zamrożonej bazie, dopiero potem chirurgiczna
  naprawa u źródła; pin legalnej dodatniej pompy i przypadku bez celu.
- [ ] Mutacja naprawy: RED → GREEN; pełny szybki rdzeń + build, commit + push.

## E3. Pętla jakości — inna ścieżka niż poprzednia sesja

- [ ] Skan kontraktu triggerów celowanych i dynamicznych delt P/T:
  definicja → materializacja → wybór celu → resolver → intencja → wycena.
  Zero trafień nie jest dowodem poprawności; sprawdzić dodatnią kontrolę
  narzędzia i przeglądać ręcznie rodzinę znalezionych kandydatów.
- [ ] Żywy Tester na zbudowanym artefakcie: partie innymi taliami/seedami
  niż a1–a3/b1–b3 z poprzednich sesji, z ręczną lekturą trzech osi z
  TESTER_STOLU. Najpierw instrukcja i walidacja argumentów narzędzia.
- [ ] Ukierunkowany pomiar naprawionej rodziny; jeśli użyję audytu remisów,
  policzyć rzeczywiste wystąpienia rodzin i nie traktować pustej próbki
  jako wyniku (L179). Bez pełnego B0 i bez podnoszenia progów regresji.
- [ ] Znalezione defekty: reprodukcja, fix, test i mutacja w osobnym
  przyroście. Braki sterownika naprawiać w sterowniku, nie omijać okna gry.

## E4. Domknięcie i przekazanie

- [ ] `npm run test:all` na zamrożonym finalnym drzewie, cichy log,
  zachowany EXIT; build i końcowy szybki rdzeń. Wynik powiązać z HEAD.
- [ ] Historia projektu, handoff tej sesji, podsumowanie wykonania planu,
  kumulatywny opis PR z wynikami i ograniczeniami. Liczby odświeżać na końcu.
- [ ] Budżet lektury: nowy wpis tylko z uczciwą kondensacją istniejącej
  klasy i zachowaniem faktów w PRZYPADKI; progu nie podnosić.
- [ ] Sprawdzić czysty stan, brak niewypchniętych commitów, opis i wątki PR.
  Nie scalać. W czacie przekazać stan, dowody i następne kroki.

## Kolejność publikacji i ryzyka

1. Plan + PR. 2. Audyt/mapa. 3. Każdy potwierdzony fix z testami osobno.
4. Narzędzia/pętla jakości. 5. Dokumentacja końcowa i pełna brama.

Pułapki: równoległe edycje tego samego pliku, mutacja bez zmiany kodu,
testowanie `src/` zamiast `dist/`, pełne logi testów w czacie, stare
numeracje CR, lokalne pliki nietrwałe między sesjami. Długie testy uruchamiać
w tle z przekierowaniem obu strumieni; nie modyfikować drzewa podczas bramy.
Każdy push poprzedzić statusem, logiem HEAD i fetchem gałęzi sesji.
