# Instrukcja dla agentów i automatycznych współpracowników

Przed rozpoczęciem pracy przeczytaj kolejno:

1. `README.md`
2. `docs/PROJECT_STATE.md`
3. `docs/PRODUCT.md`
4. `docs/ARCHITECTURE.md`
5. `docs/decisions/README.md`
6. właściwe ADR-y i dokumenty obszaru, którego dotyczy zadanie

## Źródło prawdy

Repozytorium, testy i dokumentacja są źródłem prawdy. Historia czatu, opis zadania i komentarze mogą być niepełne. Jeżeli są sprzeczne:

1. nie ukrywaj sprzeczności;
2. sprawdź najnowsze ADR-y i `PROJECT_STATE.md`;
3. poproś właściciela o decyzję, jeśli zmiana jest nieodwracalna lub wpływa na zakres;
4. zapisz rozstrzygnięcie w repozytorium.

## Nienegocjowalne granice

- Engine jest autorytetem reguł i stanu.
- UI i kontrolery wysyłają intencje/wybory; nie mutują bezpośrednio stanu.
- Core nie zawiera specjalnych przypadków rozpoznających konkretną kartę po nazwie/ID.
- Kontroler otrzymuje widok gracza, nie pełny stan z ukrytymi informacjami.
- Agent LLM nie jest walidatorem reguł.
- Nie oznaczaj karty jako obsługiwanej bez testów i jawnego zakresu.
- Nie dodawaj masowo grafik, baz i wygenerowanych artefaktów bez uzgodnienia storage/licencji.
- Nie przepisuj istniejącej aplikacji przed jej uruchomieniem i udokumentowanym audytem.

## Jak dokumentować pracę

Przy zmianie kodu lub projektu sprawdź, czy należy zaktualizować:

- `docs/PROJECT_STATE.md` — bieżąca faza, blokery, najbliższy krok;
- `docs/ROADMAP.md` — ukończone lub zmienione etapy;
- ADR — nowa istotna decyzja lub zastąpienie poprzedniej;
- dokumentację wsparcia kart/mechanik;
- instrukcję uruchomienia i testów.

Nie duplikuj bieżącego statusu w wielu miejscach. Szczegóły historyczne należą do commitów/ADR, a krótki stan bieżący do `PROJECT_STATE.md`.

## Oczekiwania wobec zmian

- Preferuj małe, odwracalne przyrosty.
- Najpierw test odtwarzający zachowanie lub błąd, potem implementacja, gdy ma to sens.
- Testy core nie powinny wymagać DOM-u, sieci ani grafik.
- Każde źródło losowości w grze powinno być kontrolowane i seedowalne.
- Błędy walidacji powinny być maszynowo rozpoznawalne oraz czytelne dla UI.
- Zmiany formatu danych powinny mieć plan migracji lub adapter.
- Nie rozszerzaj zakresu Comprehensive Rules „na zapas”; implementuj potrzebną abstrakcję bez zamykania drogi do rozwoju.

## Dodawanie kart

Przed implementacją karty ustal:

- jednoznaczną definicję/Oracle text i dane wejściowe;
- mechaniki już obsługiwane;
- brakujące reguły;
- pozytywne i negatywne scenariusze testowe;
- najważniejsze interakcje z istniejącym katalogiem;
- jawne ograniczenia wsparcia.

Jeżeli karta ujawnia brak w core, najpierw nazwij brakującą ogólną regułę. Nie naprawiaj go warunkiem zależnym od nazwy karty.

## Decyzje architektoniczne

Nowy ADR jest potrzebny, gdy zmiana:

- ustala lub zmienia granice komponentów;
- wybiera istotną technologię lub sposób persistence/deployment;
- zmienia model stanu, eventów, FoW albo determinizmu;
- wprowadza trwały kompromis wpływający na wiele funkcji.

Użyj szablonu z `docs/decisions/README.md`. Nie edytuj historii zaakceptowanego ADR tak, aby zmienić znaczenie decyzji; utwórz nowy ADR, który go zastępuje.
