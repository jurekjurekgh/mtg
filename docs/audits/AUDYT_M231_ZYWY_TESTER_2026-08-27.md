# Audyt Żywym Testerem — więcej seedów/profili + impatient, M231

- **Data:** 2026-08-27
- **Kontekst:** kontynuacja M229/M230. Cel: (a) profil `impatient` (błędy
  stanu po ODRZUCONEJ komendzie — „gracz bez wyjścia"), (b) szersze pokrycie
  seedów/profili na taliach po podziale i spoza benchmarku.
- **Metoda:** 16 partii — 5× impatient (tick 0.3), 6× explorer/random/defensive,
  5× szeroki miks. Transkrypty: `audyt-m231/`.

## Znalezisko i naprawa (1 realny błąd bota)

**M231/1 (bot, Oś 1) — Awaken the Sleeper na WŁASNYM stworze:** w partii
dominaria-wu vs mirrodin-brg (seed 33) bot rzucił Awaken the Sleeper
(gain_control_until_end_of_turn) na własnego Bone Shreddera — przejęcie
kontroli nad stworem, którego JUŻ się kontroluje, jest jałowe. Root cause:
wycena premiowała tylko cel wroga; cel własny nie miał kary, więc przy braku
wrogich stworów remis z bazą 50 wygrywał z passem. Fix: cel własny karany −70
(poniżej passu); cel wroga nadal premiowany. Generycznie po kontrolerze celu
(ADR 0002). Ta rodzina (gain_control) dała już M229/2 (detektor) — teraz
domknięta od strony ZACHOWANIA bota.

## Profil impatient — brak dead-endów

5 partii impatient (klika „przez" pauzę bota): ZERO odrzuconych komend, ZERO
ślepych okien (każde „Poddaj partię" miało też realny wybór). Klasa
Forever-Young nie wystąpiła na tych taliach/seedach — czysty wynik osi.

## Weryfikacja utrzymania wcześniejszych napraw

- **M230/3 (Bomat re-crew):** 0 akcji ≥5×/turę w całym batchu — guard trzyma.
- **M229/M230 (wycieki opisów):** 0 undefined/NaN/camelCase w transkryptach.
- **Oś 2/3/4/6:** brak przecieków, placeholderów, jałowych ofert.

## Wniosek

Szersza próbka (16 partii, w tym impatient) potwierdziła stabilność po
wcześniejszych naprawach i wyłapała ostatni przypadek rodziny gain_control
(rzut w własny cel). 1 naprawa, RED→GREEN, commit M231/1; golden-master
i bot-benchmark bez regresji.
