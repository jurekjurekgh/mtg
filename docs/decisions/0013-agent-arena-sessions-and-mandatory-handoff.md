# ADR 0013: Projekt prowadzony przez sesje Agent Arena i obowiązkowy handoff po scaleniu PR

- **Status:** Zaakceptowana
- **Data:** 2026-08-02
- **Decydenci:** właściciel projektu

## Kontekst

Projekt jest realizowany przez agentów działających w środowisku **Agent Arena**.
Środowisko to nakłada ograniczenie, którego nie widać w samym repozytorium:

- każda sesja agentska jest trwale związana z jedną gałęzią `arena/…` i jednym PR;
- **scalenie (lub zamknięcie) tego PR kończy sesję** — agent traci możliwość
  dalszej pracy z GitHubem w tej sesji (push, PR, komentarze);
- **nowa sesja nie ma dostępu do stanu lokalnego poprzedniej** — ani do plików
  spoza repozytorium, ani do `/tmp`, ani do historii czatu. Startuje wyłącznie
  z gałęzi `main` na GitHubie oraz z tekstu, który dostanie w pierwszym prompcie.

Dwukrotnie doszło już do utraty kontekstu przy zamykaniu sesji (m.in. notatka
odtworzona jako `docs/setup/HANDOFF_2026-08-01.md`). Ciągłość projektu nie może
zależeć od pamięci pojedynczej sesji.

## Decyzja

1. Model pracy **1 sesja Agent Arena = 1 gałąź `arena/…` = 1 PR** jest zasadą
   projektu, nie konwencją. Agent nigdy nie scala własnego PR.
2. **Obowiązkowym etapem zamknięcia sesji** (najpóźniej bezpośrednio po tym, jak
   właściciel zapowie lub wykona `Squash and merge`) jest wypisanie przez
   bieżącego agenta **instrukcji przekazania projektu** — jednego bloku tekstu
   w czacie, gotowego do wklejenia jako pierwszy prompt nowej sesji.
3. Instrukcja przekazania musi być samowystarczalna wobec `main` i zawierać:
   - pierwsze kroki weryfikacyjne (`git pull origin main`, `npm test`,
     `npm run build`) wraz z oczekiwanymi wynikami (liczba testów, rozmiar artefaktu);
   - listę dokumentów do przeczytania przed zmianą czegokolwiek;
   - zasady nienegocjowalne (ADR 0002, 0003, 0005, 0010, 0011, ten ADR);
   - stan po ostatnim scaleniu (karty, mechaniki, wyniki benchmarku, progi regresji);
   - kolejkę zadań z priorytetami i decyzjami właściciela;
   - pułapki środowiska (blokady egressu, ograniczenia tokena, znane problemy z gitem).
4. Ta sama treść, w części trwałej (stan, kolejka, decyzje), ląduje **w repozytorium**:
   `docs/PROJECT_HISTORY.md` oraz `docs/setup/HANDOFF_<data>.md`. Blok w czacie jest
   wygodą operacyjną; źródłem prawdy pozostaje repozytorium.
5. Agent rozpoczynający sesję traktuje otrzymany blok jako **sugestię**, a rozbieżności
   z repozytorium rozstrzyga na korzyść repozytorium (zasada „Źródło prawdy” z `AGENTS.md`).

## Konsekwencje

### Pozytywne

- Utrata sesji przestaje oznaczać utratę kontekstu projektu.
- Właściciel może scalać PR w dowolnym momencie, bez ryzyka „urwanej” pracy.
- Nowy agent startuje w kilka minut, bez rekonstrukcji stanu z historii commitów.

### Koszty i ryzyka

- Każda sesja kończy się dodatkową pracą dokumentacyjną (handoff + `PROJECT_HISTORY`).
- Blok przekazania może się zdezaktualizować, jeśli po jego napisaniu wejdą kolejne
  zmiany — dlatego pisze się go jako ostatni krok sesji i uzupełnia po scaleniu.

## Rozważone alternatywy

- **Poleganie na historii commitów i opisach PR** — odrzucone: opisy PR są kumulatywne
  i długie, a decyzje właściciela z czatu nie trafiają do commitów.
- **Automatyczny generator handoffu** — odrzucone na teraz: kolejka zadań i decyzje
  właściciela nie są maszynowo dostępne; wymagałoby to CI, którego jeszcze nie ma.

## Powiązania

- [ADR 0007 — chroniony `main` i obowiązkowe PR](0007-protected-main-and-mandatory-pull-requests.md)
- [WORKFLOW — praca z sesją agentską (Arena)](../WORKFLOW.md#praca-z-sesją-agentską-arena)
- [docs/setup/HANDOFF_2026-08-01.md](../setup/HANDOFF_2026-08-01.md)
- [AGENTS.md](../../AGENTS.md)

## Nota (2026-08-14)

Praktyczne konsekwencje izolacji sesji (co przetrwa do następnej sesji, jak
odzyskać pracę po resecie workspace, pułapki gita i sieci) zebrano w trwałym
dokumencie **[docs/setup/ENVIRONMENT.md](../setup/ENVIRONMENT.md)** — wcześniej
były powtarzane w sekcjach „Pułapki" kolejnych handoffów i przepadały razem
z nimi. Ten ADR pozostaje źródłem samej decyzji; ENVIRONMENT opisuje jej
stosowanie i jest utrzymywany na bieżąco.
