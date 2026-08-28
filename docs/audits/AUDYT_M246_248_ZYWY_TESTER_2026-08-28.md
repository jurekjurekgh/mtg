# AUDYT ŻYWYM TESTEREM M246–M248 (2026-08-28) — pętla jakości po zgłoszeniach A–M

**Zlecenie właściciela:** „wróć do pętli jakości Żywym Testerem i szukaj dziur
(w tym w heurystyce)". Kontynuacja po zamknięciu zgłoszeń A–M (M242–M245 + I1/I2).

## Metoda
- Świeży build (`dist/`); 12 partii na paramiach talii szerokich mechanicznie
  (equipment ×2 — kambuz M244, sagy final-fantasy, tarkir morph, theros,
  warhammer, alara, innistrad, zendikar landfall, worki×3) i profilach
  `explorer/greedy/defensive/impatient`. Detektory (osie 1–4) + ręczna lektura
  transkryptów (L27/L40). Transkrypty: `tmp-audyt-m246/`.
- Budżet: rundy r1–r4; każdy sygnał: repro → L57 → fix root-cause → RED→GREEN
  + mutacja (L61) → osobny commit (ADR 0020).

## Znalezisko 1 — M246 (NARZĘDZIE, nie produkt): STOP testera na decyzji „(możesz)"
Partia ravnica × alara seed 67 utykała w kroku 29: T11 upkeep gracza, na stosie
opóźniony trigger Plague Reavera + upkeep-trigger Veiled Ascension. **Wniosek po
lekturze: engine ani UI nie są wadliwe** — akcja „Veiled Ascension — cloak
(możesz) (2 opcje)" była normalnie dostępna w panelu, a bot sepolicy nie
sterował. Root cause: sterownik nie rozpoznawał etykiety pending decyzji
`resolve_optional_trigger_choice` (wzorzec `/\(możesz\)|efekt dobrowolny/`)
— zapisywał `[STOP] brak akcji`, fałszywy „game stuck". Fix w
`tools/table-tester/run-game.mjs` (wzorzec w sekcji mandatory). Po fixie ta sama
partia dobiegła końca (wygrywa bot). Commit: weszło do M247.

## Znalezisko 2 — M247 (BOT, heurystyka): removal w czysty ląd wroga
Partia mirrodin-brg × mirrodin-wu seed 11, tura 16: przeciwnik miał WYŁĄCZNIE
lądy; bot rzucił Banishment Decree za {3}{W}{W} w artefaktowy Great Furnace
(premie „ładnie oddaje tempo i kartę"). Root cause: gałąź wyceny removalu
dodawała płaską `removalEnemyBase` + wagę P+T każdemu wrogiemu permanentowi —
bez pytania o wartość bojową celu. Fix: cele czysto-lądowe (`Land` i nie
`Creature` — Dryad Arbor wykluczony) z premii wypadają i dostają karę 60
(poniżej passu, wzorzec M237/2). Anti-overfix: efekty projektowane pod
niszczenie lądów (spec celu 'land' — Vandalize) kary nie dostają (M247/3).
Zakres świadomie chirurgiczny: wrapper apply_to_each_target (spec
creature_or_enchantment — lądy nie dosięgalne z konstrukcji) i martwa gałąź
`return_to_hand` nietknięte. Mutacje A/B/C łapane. Commit **ed974e3**.

## Znalezisko 3 — M248 (UI, oferta gracza): fizzle ostrzeżenie dla destroy-if-least-power
Detektor oś 4 z partii alara × mirrodin-wu seed 33: „Rzuć: Wretched Banquet
(koszt B) → cel: Illusory Demon (Ty)" kończy się pewną stratą (intervening-if
CR 608.2a — cel da się wybrać legalnie przy rzuceniu, a warunek bada się przy
rozstrzyganiu). Wzór M102/U8: etykieta dostaje „UWAGA: czar fizzluje (cel nie
ma najmniejszej mocy wśród stworów)". Działa na „tied for least" (remis =
warunek spełniony, bez ostrzeżenia — M248/2/3). Engine tied-logika zweryfikowana
z CR (effectivePower === min ⇒ zniszczenie). Commit **5bdf9bc**.

## Sprawdzone i UZNANE za poprawne (bez zmian)
- Stos-trigger ping-pong Plague Reavera (cr-жафistykę kosztu odrzutu ×2 +
  poświęcenia ✔) i opóźniony powrót w upkeep celu (CR 603.7).
- Veiled Ascension: cloak „(may)" trafia na stos jako decyzja; licznik flying
  na face-down stworze ✔.
- Nieuciągane minimalne no-operacje testera (greedy-klikacz rzuca Shatter we
  własny ląd albo Wretched Banquet w Fisher'a — to wolność gracza, nie bug).
- Bot: Pyxis-of-Pandemonium-spam i Pristine-Talisman-aktywacje to klikacz
  (human profile), nie bot. Roiling Regrowth, Sea God's Scorn targetów wroga,
  Sweet Oblivion timing — poprawne.
- 12 partii, detektory finalnie ciszą; higiena „oferta == walidacja" (M82/L48)
  w zakresie tych mechanik czysta.

## Kardynały następnej rundy (nie pokryte tutaj)
- Duality obrony: jakość `declare_blockers` w multiprofilu (dd gang-block
  economics) — nie ćwiczone, bo profile nie wybierały głębokich gangu;
- kreatura-skrzynki-adventure/plot w następnej talii (zad talii nie zawierały);
- ewentualne rozszerzenie testera o oś „heurystyki bota" z parametru bota
  (bot-vs-bot z tracingiem) — detektor lokalnie wycina pass-quality.

## Bramy
`npm test` fast — 3610/0; `npm run test:all` — patrz sekcja „Weryfikacja braku
regresji" niżej; build 2829.6 kB; benchmark bez zmian (żadnej zmiany
parametrów torchów — tylko M247 zwarzenie karą, która uruchamia się wyłącznie
gdy wróg ma czyste lądy).
