# Audyt M152 — Żywy Tester, pozostałe karty ostatnich batchy (2026-08-19)

**Zlecenie:** kolejna sesja Żywym Testerem celująca w karty Batch 35/36/37,
które w sesji M151 nie zostały rozegrane (były tylko w ręce lub wcale).
Weryfikacja, czy w prawdziwej grze zachowują się poprawnie, czy kombinacje
efektów są poprawnie rozstrzygane, czy bot gra efektywnie.

## Karty pod lupą (niezagrane w M151)

- **azorius:** Static Net (linked exile + Powerstone + 2 życia), Piercing Rays
  (forecast), Village Bell-Ringer (ETB untap all), Survivor of Korlis (scry
  z grobu), Palace Familiar (dies: draw).
- **green:** Thornhide Wolves, Grizzled Leotau, Satyr Wayfinder (odsłoń 4,
  ląd do ręki), Feral Invocation (flash aura), Trade Route Envoy.
- **spellslinger:** Omenspeaker (scry 2), Twiddle (tryb Odkręcenie),
  Mysteries of the Deep (draw 2 / 3), Jeskai Devotee (mana).
- **black:** Wretched Banquet (destroy_if_least_power), Mindstab (suspend),
  Returned Centaur (mill 4), Liliana's Triumph (sacrifice), Bone Splinters.

## Metoda

W M151 karty nie zostały dobrane (talia ~38 kart, ~15 losowanych). Zamiast
palić dziesiątki seedów na pełnych taliach, stworzono **tymczasowe talie
audytowe** (docelowe karty + lądy) i rozegrano je Żywym Testerem; po audycie
talie usunięto. To nadal praca przez `tools/table-tester` na prawdziwym
artefakcie (`npm run build` + `npm i`), tylko z celowanym składem.

Każde znalezisko potwierdzono w kodzie (render.js / game-state.js), zanim
uznano je za błąd (transkrypt = to, co tester renderuje).

## Wyniki

### Nowe znaleziska (2)

1. **Satyr Wayfinder — „Weź ląd do ręki: ?"** (etykieta decyzji). Po ETB
   odsłonięciu 4 kart panel pokazywał `Weź ląd do ręki: ?` dla każdego lądu
   zamiast nazwy („Forest"). Root cause: karty odsłoniętej biblioteki są
   w PlayerView ukryte (`hidden:true`, bez cardId), a `nameOfObjectId`
   zwracał „?". Satyr Wayfinder odsłania WŁASNE karty (gracz je zna), więc
   etykieta bierze nazwę z pełnego stanu sesji — ten sam wzorzec co
   `resolve_reveal_exile_hand` / `resolve_discard_choice`. Naprawione.
   Test: `test/satyr-wayfinder-label-m152.test.js`.

2. **Tester zatrzymywał się na „Weź ląd do ręki / Nie bierz lądu".**
   `pickAction` nie znał tych wzorców → `[STOP]` w oknie decyzji Satyr
   Wayfinder (blokował audyt zielonej talii). Dodane wzorce do `mandatory`.

### Karty zweryfikowane jako poprawne (w prawdziwej grze)

- **Static Net:** ETB wygnanie wrogiego nie-lądowego permanentu, +2 życia,
  token Powerstone — wszystko działa. Powrót linked-exile (LTB) pokryty
  testem `real-cards-batch37` (nie dało się go naturalnie wywołać w grze,
  bo Static Net nie opuścił pola bitwy).
- **Piercing Rays:** zarówno forecast (aktywacja z ręki w upkeep — „tap"),
  jak i zwykły rzut (exile target tapped creature) działają.
- **Village Bell-Ringer:** ETB „odkręć wszystkie twoje stwory" — działa
  (przy braku zatapniętych poprawnie „zero efektu").
- **Survivor of Korlis:** aktywacja z grobu (wygnaj siebie + scry 2) działa.
- **Palace Familiar:** trigger śmierci → dobierz kartę działa.
- **Omenspeaker:** ETB scry 2 działa.
- **Twiddle:** tryb „Odkręcenie" z celami działa.
- **Mysteries of the Deep:** dobiera 2 (wariant bez landfall); wariant
  Landfall (3) pokryty testem `conditional`.
- **Wretched Banquet:** niszczy stwora o najmniejszej mocy — działa.
- **Mindstab:** normalny rzut (cel odrzuca 3) działa; suspend (liczniki →
  darmowy rzut) pokryty testami `real-cards-batch35`.
- **Returned Centaur / Liliana's Triumph / Bone Splinters:** mill /
  sacrifice each opponent / poświęcenie — działają.
- **Thornhide Wolves / Grizzled Leotau / Trade Route Envoy / Feral
  Invocation:** zwykłe stwory / conditional ETB / flash aura — działają.

## Nota (nie-bug)

Panel oferuje zagranie **Feral Invocation (+2/+2) na wrogim stworze**, gdy to
jedyne legalne cele (pusta własna plansza). To legalny MtG wybór gracza (zła
strategia, nie bug karty). Greedy-profil (gracz) go nie klika; sonda noop
słusznie nie raportuje (zmienia stan). Nie naprawiane.

## Weryfikacja

- `npm test`: **2397/2397** (było 2390; +1 nowy `satyr-wayfinder-label`).
- `npm run build`: 51 modułów / ~2035 kB.
- Detektory na nowych transkryptach: **0 zgłoszeń** (placeholdery „?" po
  naprawie zniknęły).
