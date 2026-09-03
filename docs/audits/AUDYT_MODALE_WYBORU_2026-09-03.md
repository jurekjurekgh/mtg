# Audyt modali wyboru — wszystkie tory czarów i zdolności (2026-09-03)

**Zlecenie (właściciel):** „przejrzeć silnik i wszystkie tory czarów i zdolności
z modalami wyboru czy nie mają jakichś customowych modali, które należałoby
przerobić na uniwersalny helper".

## 1. Czy istnieją customowe modale wyboru POZA wspólnym torem?

**Nie.** Wszystkie wybory gracza przechodzą przez JEDEN punkt wejścia
(`openChoiceRequest`, `src/table/main.js`) do JEDNEGO modala
(`#choice-request`). Inwentarz modali w `index.html`: `choice-request`
(wybory), `mana-wizard` (płatność kosztów — celowo osobny, to nie wybór celów),
`bot-move` (informacja), `card-preview`/`context-menu`/`notice` (nie-wybory).
Żaden tor silnika nie otwiera własnego UI wyboru z pominięciem helpera.

Problem jest inny: `openChoiceRequest` ma 13 routowanych ścieżek do kreatorów,
a WSZYSTKO inne spada do awaryjnego `renderChoiceRequest` (ściana przycisków).

## 2. Mapa routingu (stan po M298)

| Ścieżka | Kreator | Rodziny |
|---|---|---|
| mulliganBottomPlanOf | multi | `resolve_mulligan_bottom_choice` |
| proliferatePlanOf (M298) | multi | `resolve_proliferate` |
| multiTargetPlanOf | multi | cele >1 i/lub X (`targets[]`) |
| sacrificeCastPlanOf | multi | cast_spell z `sacrificeTargetId` |
| singleTargetPlanOf (M298) | multi | `cast_spell targets[1]`, `resolve_trigger_target targetId` |
| mulliganKeepPlanOf (M298) | multi | `resolve_mulligan_choice` |
| lookWizardKindOf | look | scry / surveil / index |
| peek-pick | peek | `resolve_fertile_thicket` |
| declare_attackers/blockers | combat | walka |
| damage_division | division | Inferno Titan i klony |
| escape_exile | escape | koszt escape |
| damage_assignment | damage | przydział obrażeń |
| **reszta** | **fallback (przyciski)** | patrz §3 |

## 3. Co spada do fallbacku i co z tym zrobić

Silnik ma 66 typów `resolve_*`. Po odjęciu 13 ścieżek routowanych zostają
trzy klasy:

### 3a. Wybór JEDNEGO obiektu/karty — TA SAMA klasa co M298 (do konwersji)

Każda opcja = jeden kandydat (`{targetId}` / `{cardId}` / `{keepId}` /
`{pickId}` / `{sacrificeLandId}` / `{armyId}`), czasem z wariantem odmowy
(`{done:true}` / `{skip:true}` / `{cardId:null}`):

| typ | pole | odmowa | karty w taliach repo |
|---|---|---|---|
| resolve_backup | targetId | — | backup (4 deskryptory) |
| resolve_damage_target | targetId | — | Stomping Slabs [worek-mroczny] |
| resolve_delirium_target | targetId | — | delirium |
| resolve_mentor_target | targetId | — | mentor |
| resolve_opponent_target | targetId | — | Cuombajj Witches [wiedzmin] |
| resolve_redirect_choice | targetId | — | Willbender [dominaria-wu] |
| resolve_room_target | targetId | — | room |
| resolve_hand_creature | targetId | — | hand_creature |
| resolve_enter_as_copy | targetId | — | klony |
| resolve_copy_targets | copyId+targetId | — | Storm |
| resolve_graveyard_top_choice | targetId | {done:true} | Forever Young [worek-basni] |
| resolve_sacrifice_choice | targetId | — | Grave Exchange [innistrad-brg] |
| resolve_devour_choice | targetId | {done:true} | devour |
| resolve_exploit_choice | targetId | {skip:true} | exploit |
| resolve_amass_choice | armyId | — | amass |
| resolve_discard_choice | cardId | {cardId:null} | reguła rozmiaru ręki |
| resolve_hand_top_choice | cardId | — | hand_top |
| resolve_look_top_choice | cardId | — | Gurmag Drowner [tarkir-wur] |
| resolve_manifest_dread | cardId | — | Manifest Dread [worek-mroczny] |
| resolve_reveal_choice | cardId | — | reveal |
| resolve_reveal_exile_grave/hand | cardId | — | Dreams of... |
| resolve_satyr_look_choice | pickId | — | Satyr Wayfinder [theros] |
| resolve_springbloom | sacrificeLandId | {skip:true} | Springbloom Druid [wiedzmin] |
| resolve_legend_choice | keepId | — | prawo legend (15 legend) |

To jest ~24 typy o IDENTYCZNYM kształcie decyzji co `resolve_trigger_target`
z M298: jeden wybór z listy kandydatów, Zatwierdź = komenda z legalCommands.
Generalizacja `singleTargetPlanOf` domyka klasę jednym ruchem (bez zmian
silnika i protokołu — L48).

### 3b. Małe enumeracje — przyciski są DOBRE (nie konwertować)

2–5 opcji bez wymiaru celu/karty: `resolve_color_choice` (5 kolorów),
`resolve_land_type_choice` (5), `resolve_modal_choice` (tryby),
`resolve_clash_choice`, `resolve_fabricate`, `resolve_endure_choice`,
`resolve_library_placement`, `resolve_moonlit_choice`,
`resolve_pay_or_sacrifice`, `resolve_ward_pay_choice`,
`resolve_counter_pay_choice`, `resolve_optional_pay_choice`,
`resolve_optional_trigger_choice`, `resolve_optional_draw`,
`resolve_replacement_choice`, `resolve_explore_choice`,
`resolve_destroy_equipment_choice`, `resolve_food_choice` (tak/nie).
Ściana przycisków przy 2–5 opcjach to czytelna lista, nie problem.

### 3c. Inny kształt decyzji — osobne kreatory albo zostają (poza tym audytem)

- **okna rzutu** (`resolve_exile_cast` Vaan, `resolve_grave_free_cast` Halo
  Forager, `resolve_madness_cast`, `resolve_rebound_cast`,
  `resolve_suspend_cast`): każda opcja to OSOBNY rzut z własnymi celami/X/stun
  (etykiety K1/K2 z audytu PR #94) — to nie jest „jeden wybór z listy".
  **AKTUALIZACJA 2026-09-03 (M300):** decyzja właściciela („w obu przypadkach
  trzeba to załatać") — okna rzutu DOŁĄCZONE do wspólnego kreatora: jedna
  opcja = jeden wiersz radio z etykietą K1/K2 i podglądem karty
  (`castWindowPlanOf`, `commandForCastWindowSelection`); silnik bez zmian (L48);
- **kolejność** (`resolve_index_choice` — wizard index już istnieje;
  `resolve_reveal_order` — permutacje, dziś jedna oferta);
- **podgląd+wybór sekwencyjny** (`resolve_search_choice` — para
  `{found, destination}`: dwa wymiary, kandydaci = biblioteka); wymagałby
  własnego planu, nie ogólnej generalizacji;
- **undercity** (`resolve_undercity_route` — `{room, roomName}`): wybór pokoju,
  etykieta niesie nazwę pokoju (nie obiekt); niszowe.

## 4. Rekomendacja

Wykonać §3a: generalizacja planu pojedynczego wyboru na całą rodzinę
(`singleTargetPlanOf` czyta pole wyboru z komend zamiast dwóch
wypisanych typów). Jedno miejsce definicji (jak M298), walidacja zostaje
w silniku (L48), prowadzenie Żywego Testera już działa (`.multi-target-toggle`
+ Zatwierdź), testy `table-ui` już prowadzą pickery (M298). Ryzyko: etykiety
grup bez `objectId` stracą nazwę źródła w intro — akceptowalne (nazwa zostaje
w nagłówku panelu akcji; można rozszerzyć później).

Świadomie NIE ruszamy: §3b (przyciski poprawne), §3c bez okien rzutu
(search_choice — dwa wymiary, undercity, kolejności reveal — decyzje
właściciela). Okna rzutu: zrealizowane jako M300 (decyzja właściciela
2026-09-03 — patrz §3c, aktualizacja).
