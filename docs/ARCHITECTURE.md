# Architektura docelowa

**Status dokumentu:** kierunek architektoniczny. Audyt istniejącej aplikacji został wykonany
([AUDIT_LEGACY_APP.md](AUDIT_LEGACY_APP.md)), a stos technologiczny wybrany
([ADR 0008](decisions/0008-plain-javascript-esm-no-build.md) — czysty JavaScript ESM bez builda).
Szczegółowe kontrakty `GameState`, `Command`, `Event`, `PlayerView` i `ChoiceRequest`
powstaną w Etapie 1; przykłady w tym dokumencie mają charakter poglądowy.

> Fragmenty kodu poniżej zapisano w składni TypeScript **wyłącznie jako czytelny zapis kształtu
> danych**. Implementacja jest w JavaScripcie, a typy opisuje JSDoc.

## Główne założenie

System ma być zbudowany wokół headless engine, który nie zależy od DOM-u, konkretnego UI ani konkretnego rodzaju kontrolera.

```text
┌──────────────────────────────────────────────────────────┐
│ Human UI │ Random Bot │ Heuristic Bot │ Search │ LLM     │
└───────────────┬──────────────────────────────────────────┘
                │ PlayerView + LegalActions / ChoiceRequest
                │ Command / ChoiceResponse
┌───────────────▼──────────────────────────────────────────┐
│                 Authoritative Engine                     │
│ turn/priority │ stack │ costs │ combat │ effects │ FoW  │
└───────────────┬──────────────────────────────────────────┘
                │ events + player-specific view
┌───────────────▼──────────────────────────────────────────┐
│                 Game Table renderer                      │
└──────────────────────────────────────────────────────────┘
```

## Warstwy odpowiedzialności

### Engine core

Core nie zawiera nazw ani specjalnych przypadków konkretnych kart, ale zna abstrakcje potrzebne grze:

- graczy i kolejność;
- strefy oraz zmianę stref;
- tożsamość obiektów gry;
- turę, fazy i kroki;
- aktywnego gracza i priorytet;
- stos;
- komendy, wybory i legalne działania;
- koszty oraz zasoby many;
- combat;
- state-based actions;
- zdarzenia gry;
- efekty jednorazowe, ciągłe, triggery i replacement effects — dodawane zgodnie z potrzebami kart;
- widoczność informacji.

„Core bez kart” nie oznacza „core bez reguł”. Oznacza brak warunków typu `if (card.name === ...)` w jądrze.

### Mechaniki wielokrotnego użytku

Klocki implementowane wtedy, gdy wymaga ich pierwsza karta, np.:

- zadanie obrażeń;
- dobranie/odrzucenie;
- zniszczenie lub exile;
- modyfikacja statystyk;
- utworzenie tokena;
- targetowanie;
- activated/triggered/static ability;
- wyszukanie w bibliotece.

Mechanika należy do wspólnej biblioteki, jeśli opisuje regułę użyteczną dla wielu kart. Specjalne zachowanie pojedynczej karty pozostaje przy jej definicji, ale korzysta wyłącznie z kontrolowanych API engine.

### Definicje kart

Definicja karty powinna łączyć dane z zachowaniem i metadanymi wsparcia. Przykład poglądowy, niezatwierdzony kontrakt:

```ts
defineCard({
  id: "lightning-bolt",
  name: "Lightning Bolt",
  manaCost: "{R}",
  types: ["Instant"],
  support: { status: "supported", limitations: [] },
  abilities: [
    spellAbility({
      targets: [creatureOrPlayer()],
      effects: [dealDamage({ amount: 3, target: selectedTarget(0) })],
    }),
  ],
});
```

Nie należy przedwcześnie tworzyć języka DSL zdolnego opisać każdą historyczną kartę. Deklaratywne klocki powinny mieć kontrolowany escape hatch w kodzie.

### Kontrolery

Wszyscy uczestnicy używają tego samego protokołu, np.:

```ts
interface PlayerController {
  chooseAction(view: PlayerView): Promise<ActionId>;
  makeChoice(request: ChoiceRequest): Promise<ChoiceResponse>;
}
```

To tylko ilustracja odpowiedzialności. Ostateczny kontrakt powstanie przed implementacją.

Kontroler:

- widzi wyłącznie swoją projekcję stanu;
- wybiera z działań/parametrów dopuszczonych przez engine;
- nie zapisuje bezpośrednio do `GameState`;
- może być zastąpiony bez zmiany zasad gry.

### Game Table

UI:

- renderuje otrzymany widok gracza;
- zbiera intencje i wybory;
- prezentuje przyczyny odrzucenia;
- odtwarza zdarzenia/animacje;
- nie oblicza legalności jako źródło prawdy;
- może lokalnie przewidywać lub podświetlać działania wyłącznie pomocniczo.

## Model informacji

Potrzebne są co najmniej trzy różne pojęcia:

1. `GameState` — pełny stan autorytatywny, wyłącznie dla engine.
2. `PlayerView` — projekcja dla konkretnego gracza/kontrolera.
3. `PublicLog` lub widoczne eventy — historia możliwa do pokazania danemu odbiorcy.

Przykładowo przeciwnik może widzieć rozmiar ręki, ale nie jej zawartość. Informacja wcześniej ujawniona wymaga jawnego modelu pamięci/ujawnień, jeśli zasady nadal pozwalają ją znać.

**Granica bezpieczeństwa:** jeżeli pełny `GameState` znajduje się w kodzie przeglądarki, FoW może działać w UI, ale użytkownik odczyta dane przez DevTools. Faktyczna poufność wymaga oddzielenia autorytatywnego procesu, najczęściej backendu lub zaufanego hosta. Decyzja pozostaje otwarta do czasu audytu i ustalenia wymagań.

## Komendy, wybory i eventy

Rekomendowany przepływ:

```text
Command → walidacja → ChoiceRequest (opcjonalnie) → Event(s) → nowy stan
```

- **Command** opisuje intencję, np. zagranie lądu lub rozpoczęcie rzucania czaru.
- **ChoiceRequest** prosi o cel, tryb, wartość X, kolejność albo sposób płatności.
- **Event** opisuje fakt, który zaszedł, np. zmianę strefy lub otrzymanie obrażeń.

Event nie musi oznaczać pełnego event sourcingu. Ta decyzja wymaga osobnego ADR po prototypie. Niezależnie od implementacji potrzebujemy diagnostycznego logu partii.

## Determinizm i odtwarzanie

Rekomendowane inwarianty:

- losowość przechodzi przez jedno kontrolowane API RNG;
- tasowanie i bot losowy korzystają z zapisanego seeda;
- decyzje kontrolerów mogą być zapisane;
- błąd da się odtworzyć z konfiguracji, seeda i sekwencji komend;
- zegar systemowy i globalne `Math.random()` nie wpływają bezpośrednio na reguły.

## Tożsamość obiektów

Należy rozdzielić:

- **definicję karty** — wspólne dane np. `lightning-bolt`;
- **druk/art/element kolekcji** — konkretne wydanie lub alternatywny obraz;
- **instancję w talii/partii** — konkretny fizyczny/logiczny egzemplarz;
- **obiekt gry** — byt istniejący obecnie w danej strefie, którego tożsamość może zmieniać się przy zmianie strefy zgodnie z zasadami.

To ważny punkt integracji z bazą kolekcjonerską. Audyt wykazał, że stara aplikacja **nie
rozdziela tych pojęć**: jeden numer koduje jednocześnie definicję karty i wariant graficzny
przez arytmetykę `+100000`/`+200000`/`+300000`/`+400000` (§3.2 audytu). Nowy model tożsamości
nie może tego dziedziczyć.

## Podział repozytorium

Ustalony w [ADR 0008](decisions/0008-plain-javascript-esm-no-build.md): katalogi zamiast
workspaces, granice pilnowane importami i testami.

```text
src/
  engine/       # headless rules engine — zero DOM, zero sieci
  protocol/     # kształty Command / ChoiceRequest / Event / PlayerView
  cards/        # definicje kart, dane reguł i registry statusu wsparcia
  mechanics/    # współdzielone mechaniki, jeśli warto wydzielić z engine
  controllers/  # boty i adapter człowieka
  table/        # standalone UI Wirtualnego Stołu
test/
```

Aplikacja kolekcjonerska **nie jest częścią tego repozytorium**
([ADR 0009](decisions/0009-standalone-game-table-instead-of-extraction.md)); pozostaje
u właściciela. Repozytorium zawiera jedynie zamrożony snapshot referencyjny do czasu Etapu 5.

## Inwarianty, które powinny być testowane

- instancja karty nie istnieje równocześnie w dwóch strefach;
- kontroler nie może wykonać działania spoza legalnego protokołu;
- `PlayerView` nie wycieka ukrytych informacji;
- tylko engine mutuje autorytatywny stan;
- nieobsługiwana karta nie trafia do legalnie uruchomionej gry;
- stan i log nie odwołują się do nieistniejących obiektów;
- wszystkie źródła losowości są kontrolowane;
- rozgrywka zatrzymuje się w jawnym `ChoiceRequest`, zamiast zgadywać decyzję gracza.

## Antywzorce

- warunki po nazwie karty w core;
- traktowanie pozycji DOM jako stanu gry;
- przesuwanie karty w UI przed akceptacją engine jako źródło prawdy;
- przekazywanie botowi pełnego `GameState` i proszenie, by ignorował ukryte pola;
- automatyczne uznawanie zaimplementowanej karty za poprawną bez testów;
- wywołanie LLM w celu potwierdzenia legalności ruchu;
- zależność testów reguł od przeglądarki lub grafiki kart.
