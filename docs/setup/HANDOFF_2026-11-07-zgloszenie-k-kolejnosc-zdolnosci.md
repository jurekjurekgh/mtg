# Handoff — zgłoszenie „K": kolejność równoczesnych zdolności (2026-11-07)

Sesja: `arena/b2771170-mtg`, PR #181. Zgłoszenie zamknięte; niniejszy plik to
punkt zaczepienia dla kontynuacji.

## Zgłoszenie (dosłownie)

Właściciel: rozstrzyganie dwóch zdolności związanych z atakiem (triggerowanych
atakiem, najprawdopodobniej równoczesnych) daje modal:

```
Wybór
✕
Wybierz: Która zdolność ma rozstrzygnąć się jako następna? — wskaż kartę:
?
?
```

„I jak ja mam to wybrać???"

## Root cause (dwie warstwy UI, silnik czysty)

1. **Przekierowanie kaskady:** ogólna rodzina jednowyborowa M299
   (`singleTargetPlanOf` w `src/table/multi-target.js`) porywała grupę
   `resolve_trigger_order` po polu `cardId` (każda opcja niesie cardId
   ŹRÓDŁA zdolności, opcje mają różne wartości → wygląda jak „wybór karty").
   Kreator „wskaż kartę" etykietuje wiersze przez objectId w strefach
   widoku — cardId nie jest objectId, stąd wiersze „?".
2. **Etykieta bez skutku:** `commandLabel` dla `resolve_trigger_order`
   opisywał efekt z `cmd.effectTypes` — same TYPY efektów bez parametrów
   („? obrażeń obrońcy"); pełne deskryptory (`abilityEffects`) są jawne w
   widoku stosu (ADR 0017), ale etykieta ich nie czytała.

## Naprawa

- `multi-target.js`: `resolve_trigger_order` w SINGLE_PICK_EXCLUDED_TYPES —
  decyzja o KOLEJNOŚCI zdolności nie jest wyborem karty; grupa trafia do
  wspólnego helpera przyciskowego M302 (`buttonsPlanOf`) z pełnymi
  etykietami komend.
- `render.js` `commandLabel` → `resolve_trigger_order`: skutek czytany z
  PEŁNYCH deskryptorów wpisu zdolności na stosie w widoku
  (`view.zones.stack` po `cmd.stackEntryId`, normalizacja obiekt/tablica),
  fallback na `effectTypes` komendy (partia śmierci deathBatch trzyma
  zdolności w slotach bez wpisów na stosie — stare zachowanie).
- `choice-request.js` `previewCardIdOfOption`: dla `resolve_trigger_order`
  zwraca kartę ŹRÓDŁA (`option.cardId`) — lupa w modalu pokazuje kartę,
  której kolejność rozstrzygamy (wcześniej polityka „cel przed źródłem"
  pokazałaby cel triggera zamiast źródła).

## Efekt w UI

Modal (i grupa w „Twoje działania") pytają jak dotąd „Która zdolność ma
rozstrzygnąć się jako następna?", a przyciski nazywają kartę, zdarzenie i
skutek, np.:

- „Najpierw: Scorch Spitter — atak — 1 obrażenie obrońcy"
- „Najpierw: Gruul Beastmaster — atak — +X/+0 (X = moc źródła) do końca tury"

Podgląd karty źRÓDŁA zdolności działa WSPÓLNYM modelem wszystkich modali:
nazwa wiersza jest podkreślona i pokazuje hoverem img karty ze Scryfall;
na dotyku klik w nazwę otwiera pełny ekran. Żadnych ikon lup — patrz
niżej „Model wyświetlania”.

## Model wyświetlania (kontynuacja 2026-11-07, wieczór — dyrektywa właściciela)

Wcześniejsze podsumowanie zamknięcia K błędnie opisało „lupę” przy
przyciskach. Stanowisko właściciela (wiążące): „Żadnych lup! Modale
wyboru mają być wszystkie z jednego wspólnego źródła, ze wspólnym
modelem wyświetlania. Jedynym akceptowalnym modelem jest podkreślona
nazwa karty/efektu i hover z img karty ze scryfall (fullscreen po
kliknięciu na ekranach dotykowych). ŻADNYCH NOWYCH NIEZALEŻNYCH
MODALI!!!”

Zweryfikowany stan kodu (zgadza się z dyrektywą): modal kolejności
renderuje wspólny helper M302 (wiersze radio + „Zatwierdź wybór”),
nazwa wiersza jest podkreślona (`picker-name is-openable`, kropkowane
podkreślenie w index.html) i pokazuje hoverem img karty ŹRÓDŁA zdolności
ze Scryfall; na dotyku (brak callbacków hover) klik w nazwę otwiera pełny
ekran. Ikony lup nie ma w żadnym modalu — `renderPeekButton` to od
O2 (2026-10-18) i zgłoszenia 2026-11-05 PODKREŚLONA NAZWA z hoverem,
nie ikona.

Piny konwencji na scenie zgłoszenia:
`test/zgloszenie-k-kontynuacja-wspolny-model.test.js` (K/5–K/8).

## Piny

`test/zgloszenie-k-kolejnosc-zdolnosci.test.js` (scena = repro zgłoszenia:
Scorch Spitter + Gruul Beastmaster atakują naraz):

- **K/1** — kaskada UI: `singleTargetPlanOf` = null (koniec „wskaż kartę"),
  `buttonsPlanOf` przejmuje grupę (M302);
- **K/2** — etykieta: karta + zdarzenie („atak") + skutek z parametrem
  („1 obrażenie obrońcy", „moc źródła"), nie „? obrażeń";
- **K/3** — tytuł grupy/modala pyta o kolejność, bez „wskaż kartę";
- **K/4** — `previewCardIdOfOption` = karta źródła (nie cel).

## Bramy

fast **10 095/10 095** (4 nowe), test:all **10 364/10 364/0**, build
**78 modułów / 5773,8 kB**.

## Otwarte nitki

- Etykieta skutku zależy od `describeEffect` (render.js) — deskryptory
  nietypowych efektów mogą dawać ogólnik; zgłaszać po klasie (L26), nie
  łatać po nazwie karty.
- Zgłoszenie J (granica tury, wariant bez DFC) — WSTRZYMANE przez właściciela;
  protokół przy nawrocie: `HANDOFF_2026-11-07-zgloszenie-j-granica-tury.md`.
- Zgłoszenie „J. Undercity" (etykiety pokoi) — zamknięte wcześniejszym
  commitem `71da887` w tej samej sesji.

## Recovery po resecie gałęzi (wzorzec platformowy)

Jeśli lokalna gałąź wróciła do `d2e0d61` i push jest odrzucony:
niezacommitowane zmiany → `cp` do untracked tmp; potem
`git fetch origin arena/b2771170-mtg && git reset --hard origin/arena/b2771170-mtg`;
przywrócić tmp; commit + push. Po resecie `tools/table-tester/node_modules`
znika — przed użyciem driverów `npm i` w `tools/table-tester` i `npm run build`
w głównym repo.
