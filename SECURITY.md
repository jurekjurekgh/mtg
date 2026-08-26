# Bezpieczeństwo

Ten dokument opisuje, jak w projekcie MTG Engine chronimy repozytorium, dane i przebieg pracy
oraz jak zgłaszać problemy bezpieczeństwa.

To nieoficjalny, hobbystyczny projekt bez wdrożenia produkcyjnego i bez danych użytkowników.
Zakres bezpieczeństwa jest odpowiednio węższy: chronimy **integralność repozytorium**,
**sekrety** i **ukryte informacje w rozgrywce**.

## Wspierane wersje

Projekt jest w fazie inicjalizacji i nie ma jeszcze wydań ani wersjonowania.
Wspierana jest wyłącznie bieżąca gałąź `main`.

| Wersja | Wsparcie |
|---|---|
| `main` | tak |
| gałęzie robocze / PR | tak, do czasu scalenia lub zamknięcia |
| tagi i wydania | nie istnieją na tym etapie |

## Ochrona repozytorium

Gałąź `main` jest chroniona regułą repozytorium (ruleset **Protect main**):

- każda zmiana wchodzi wyłącznie przez Pull Request;
- bezpośredni push do `main` jest zabroniony;
- force push (non-fast-forward) jest zabroniony;
- usunięcie gałęzi `main` jest zabronione;
- bypass list pozostaje pusta — nikt nie omija zasad, łącznie z właścicielem;
- wymagane approvals: 0;
- wszystkie wątki komentarzy w PR muszą być rozwiązane przed scaleniem;
- dozwoloną metodą scalania jest `Squash and merge`;
- merge jest zawsze jawną decyzją właściciela;
- required status checks zostaną włączone po zbudowaniu stabilnego CI.

Praktyczna instrukcja obsługi tego procesu: [docs/WORKFLOW.md](docs/WORKFLOW.md).
Uzasadnienie decyzji: [ADR 0007](docs/decisions/0007-protected-main-and-mandatory-pull-requests.md).

## Zgłaszanie podatności

**Nie zgłaszaj problemów bezpieczeństwa przez publiczne Issue ani w komentarzu PR.**

Preferowana ścieżka:

1. Wejdź w zakładkę **Security** repozytorium.
2. Wybierz **Report a vulnerability** (GitHub Private Vulnerability Reporting).
3. Opisz problem, wpływ i sposób odtworzenia.

Jeżeli prywatne zgłaszanie jest niedostępne, skontaktuj się bezpośrednio z właścicielem
repozytorium i poczekaj z publikacją szczegółów.

W zgłoszeniu przydatne są:

- opis problemu i realny wpływ;
- minimalne kroki odtworzenia (bez prawdziwych sekretów);
- wersja/commit, na którym problem występuje;
- proponowana poprawka, jeśli ją masz.

### Czego się spodziewać

Projekt jest prowadzony hobbystycznie, bez zobowiązań SLA. Zakładany tryb pracy:

- potwierdzenie zgłoszenia — zwykle w kilka dni;
- wstępna ocena i decyzja o zakresie poprawki — po potwierdzeniu;
- publiczne ujawnienie szczegółów — dopiero po udostępnieniu poprawki, w uzgodnieniu ze zgłaszającym.

## Sekrety i dane wrażliwe

- Nie commituj tokenów, kluczy API, haseł, plików `.env` ani prywatnych danych.
- Nie umieszczaj sekretów w opisach PR, komentarzach, logach ani zrzutach ekranu.
- Do automatyzacji używaj GitHub Actions **secrets**, nie wartości w kodzie.
- Nie proś asystentów ani agentów o sekrety w treści rozmowy i nie przekazuj ich w promptach.

Jeżeli sekret trafił do repozytorium, potraktuj go jako **ujawniony**:

1. natychmiast unieważnij i wygeneruj nowy;
2. zgłoś to właścicielowi;
3. usuń wartość z kodu w normalnym PR;
4. pamiętaj, że usunięcie z pliku nie usuwa jej z historii Git — czyszczenie historii `main`
   wymaga osobnej, świadomej decyzji właściciela, ponieważ force push jest zabroniony.

## Dane kart, grafiki i licencje

Magic: The Gathering, nazwy kart i grafiki należą do ich właścicieli. Projekt jest nieoficjalny.

- Nie dodawaj masowo grafik kart ani pełnych baz danych bez uzgodnienia storage i statusu licencyjnego.
- Ciężkie zasoby trzymamy poza Git, chyba że uzgodniono inaczej.
- Prywatne dane kolekcji właściciela nie są przeznaczone do publikacji.

## Bezpieczeństwo informacji w rozgrywce (Fog of War)

To wymaganie produktowe, ale traktujemy je jako element bezpieczeństwa:

- kontroler i UI dostają wyłącznie `PlayerView`, nigdy pełnego `GameState`;
- ukryte informacje przeciwnika (ręka, biblioteka, karty face-down) nie mogą trafić
  do klienta, który nie ma prawa ich znać;
- każdy PR dotykający danych gry musi to sprawdzić — punkt jest w szablonie PR;
- docelowy poziom ochrony (UI-only kontra backend) pozostaje otwartym pytaniem
  w [docs/PROJECT_HISTORY.md](docs/PROJECT_HISTORY.md) i zostanie rozstrzygnięty osobnym ADR.

Zob. [ADR 0003 — Widoki graczy i Fog of War](docs/decisions/0003-player-specific-views-and-fow.md).

## Zależności i automatyzacja

- Stos technologiczny nie został jeszcze wybrany, więc nie mamy jeszcze skanowania zależności.
- Po wyborze toolchainu i uruchomieniu CI dodamy automatyczne sprawdzenia,
  a następnie oznaczymy je jako required status checks.
- Workflow GitHub Actions powinny mieć minimalne uprawnienia (`permissions`) i przypięte akcje.

## Zakres poza bezpieczeństwem

Nie traktujemy jako podatności:

- błędów reguł gry i niepoprawnych rozstrzygnięć — to zwykłe zgłoszenia błędów engine;
- braków w obsłudze kart — zakres jest świadomie ograniczony (ADR 0001);
- widoczności obu rąk w **obecnej**, ręcznej aplikacji kolekcjonerskiej — to znany stan
  wyjściowy opisany w `docs/PROJECT_HISTORY.md`.
