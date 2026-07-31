# Karta projektu

## Problem

Obecny Wirtualny Stół pozwala ręcznie przesuwać karty, ale nie rozgrywa partii:

- nie jest autorytatywnym źródłem stanu;
- nie waliduje reguł;
- pokazuje ukryte informacje obu stron;
- wymaga ręcznego przekazywania snapshotu do chatbota;
- wymaga, aby człowiek wykonywał fizycznie wszystkie decyzje przeciwnika.

## Wizja

Zbudować rozwijalny system, w którym człowiek rozgrywa partię MtG przeciwko kontrolerowi komputerowemu, a headless engine:

- prowadzi autorytatywny stan gry;
- wyznacza legalne działania i wymagane wybory;
- odrzuca nielegalne intencje;
- rozpatruje działania według zaimplementowanych reguł;
- udostępnia każdemu graczowi wyłącznie dozwolone informacje;
- umożliwia odtworzenie i diagnostykę partii;
- zasila niezależny interfejs Wirtualnego Stołu.

## Użytkownik i podstawowy scenariusz

Głównym użytkownikiem jest właściciel prywatnej kolekcji. Wybiera dwie talie z obsługiwanego katalogu, uruchamia partię i steruje jednym graczem. Drugim graczem steruje bot. UI prezentuje stan z perspektywy człowieka, a engine zatrzymuje rozgrywkę tylko wtedy, gdy potrzebna jest jego decyzja.

## Zakres docelowy

- własny, kontrolowany katalog około 400 kart i jego przyszłe rozszerzenia;
- talie tworzone z tego katalogu;
- rozgrywka człowiek kontra bot;
- rzeczywisty Fog of War na ustalonym poziomie zaufania;
- wielokrotnego użytku mechaniki kart;
- status wsparcia i testy dla każdej obsługiwanej karty;
- wydzielony Wirtualny Stół korzystający ze wspólnych danych kolekcji.

## Poza zakresem

Dopóki jawnie nie zmienimy decyzji, projekt **nie zakłada**:

- obsługi wszystkich wydanych kart;
- pełnej implementacji każdego przypadku Comprehensive Rules;
- kompatybilności z dowolną talią importowaną z internetu;
- matchmakingu i publicznego multiplayera;
- handlu kolekcją lub zarządzania sklepem;
- automatycznego interpretowania dowolnego Oracle text przez LLM w czasie gry;
- uznawania agenta AI za sędziego reguł.

## Zasady produktu

### 1. Jawny zakres wsparcia

Każda karta ma status, np.:

- `unsupported` — nie może wejść do legalnej talii;
- `in-development` — dostępna tylko w testach/development;
- `supported` — obsługiwana w zadeklarowanym zakresie;
- `limited` — działa z jawną listą ograniczeń.

System nie może udawać, że rozumie kartę, której nie zaimplementowano.

### 2. Engine, nie UI, rozstrzyga grę

Drag-and-drop jest intencją użytkownika. Dopiero odpowiedź engine zmienia stan prezentowany przez interfejs.

### 3. Ukryte dane są filtrowane u źródła

Kontroler powinien otrzymać `PlayerView`, a nie pełny `GameState` z polami ukrytymi jedynie przez CSS. Szczegółowa granica bezpieczeństwa zależy od decyzji o uruchamianiu engine lokalnie lub na backendzie.

### 4. Stopniowy wzrost

Nowa karta może rozszerzyć wspólną bibliotekę mechanik. Implementacja jest ukończona dopiero razem z testami legalności, rozpatrywania i najważniejszych interakcji.

### 5. Kontrolery są wymienne

Człowiek, prosty bot, bot heurystyczny, search bot i ewentualny agent LLM korzystają z tego samego publicznego protokołu decyzji. Żaden kontroler nie dostaje specjalnego dostępu do mutowania stanu.

## Mierniki postępu

Najbardziej użyteczne mierniki to:

- liczba kart oznaczonych jako `supported`;
- liczba mechanik wielokrotnego użytku;
- pokrycie testami obsługiwanych interakcji;
- liczba pełnych symulacji zakończonych bez błędu/inwariantu;
- możliwość deterministycznego odtworzenia błędu;
- średni czas podjęcia decyzji przez bota;
- liczba ograniczeń znanych dla obsługiwanych kart.

Sama liczba plików lub kart z zaimportowanymi danymi nie jest miarą wsparcia reguł.
