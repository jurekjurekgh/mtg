/**
 * Katalog czasowników etykiet akcji Żywego Testera — JEDNO źródło prawdy dla
 * puli ruchów profili (`run-game.mjs`) i listy wyciszalnych akcji detektorów
 * (`detectors.mjs`, oś „akcja bez ptaszka auto-pass").
 *
 * Kontrakt: każda etykieta akcji wystawiana w panelu „Twoje działania"
 * (`commandLabel` w `src/table/render.js`) MUSI być w tej tabeli — inaczej
 * profil `greedy` ją pomija, `explorer` nigdy nie oznaczy jej jako
 * „odwiedzonej", a transkrypt wygląda na grę bez tej akcji.
 *
 * 2026-09-13 (E2 sesji arena/01a09c9e): PR #115 zmienił etykietę crew/saddle
 * z „Aktywuj: <pojazd> (koszt załoga N)…" na „Obsadź:"/„Osiodłaj:" (znalezisko
 * A1). Tester znał dalej tylko `^Aktywuj:`, więc CAŁA ścieżka kliku w pojazd
 * (kreator załogi) była dla pętli jakości niewidzialna — sześć partii na
 * taliach z pojazdami pokazało etykietę „Obsadź:" w panelu 54× i ZERO kliknięć
 * (żaden detektor nie zapalił: etykieta istnieje, więc klasa L46 milczy).
 * Ta sama klasa dryfu dotyczyła czasowników, których panel używa od dawna,
 * a katalog nie znał: Ucieczka, Przygoda, Zagraj z przygody, Ninjutsu,
 * Channel, Plotuj, Przygotuj manę, Zawieś, Rzuć z Cleave/odbiciem/wygnaną/
 * zawieszone, Zagraj aurę/za bestow/za manę ze Skarbów, Obróć twarzą do góry.
 * Detektory miały dodatkowo martwe wpisy w stylu angielskim (`Escape:`,
 * `Plot:`) — nigdy nie mogły trafić w polską etykietę silnika.
 *
 * Pilnuje tego `test/tester-wzorce-akcji.test.js`: (a) etykiety crew/saddle
 * generuje prawdziwy `commandLabel` (zmiana nazwy etykiety w silniku zapala
 * test), (b) każdy czasownik z tabeli istnieje w `render.js` jako literał
 * etykiety, (c) klasyfikacja pulp/bezpieczeństwo/priorytet jest spójna.
 */

/** Znaki specjalne wyrażeń regularnych w czasowniku etykiety. */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Tabela czasowników. `re` = źródło wzorca (gdzie etykieta ma czasownik;
 * niekotwiczone tam, gdzie historycznie łapaliśmy go w treści — „Zagraj ląd"),
 * `pula` = akcja gracza dla profili, `bezpieczna` = podzbiór profilu
 * `defensive`, `greedy` = pozycja w kolejności priorytetów profilu `greedy`.
 * KOLEJNOŚĆ `greedy` w tabeli = kolejność priorytetów (historyczna najpierw).
 */
const TABELA = [
  { v: 'Zagraj ląd', re: 'Zagraj ląd', pula: true, bezpieczna: true, greedy: true },
  { v: 'Rzuć', re: '^Rzuć:', pula: true, greedy: true },
  { v: 'Rzuć za warp', re: '^Rzuć za warp:', pula: true, greedy: true },
  { v: 'Zagraj', re: '^Zagraj:', pula: true, greedy: true },
  { v: 'Aktywuj', re: '^Aktywuj:', pula: true, bezpieczna: true, greedy: true, dynamiczny: true },
  { v: 'Obsadź', re: '^Obsadź:', pula: true, bezpieczna: true, greedy: true, dynamiczny: true },
  { v: 'Osiodłaj', re: '^Osiodłaj:', pula: true, bezpieczna: true, greedy: true, dynamiczny: true },
  { v: 'Wybierz', re: '^Wybierz:', pula: true, greedy: true },
  // --- czasowniki, których pula nie znała do 2026-09-13 (E2) ---------------
  { v: 'Obróć twarzą do góry', re: '^Obróć twarzą do góry:', pula: true, bezpieczna: true, greedy: true },
  { v: 'Rzuć z Cleave', re: '^Rzuć z Cleave:', pula: true, greedy: true },
  { v: 'Rzuć z odbiciem', re: '^Rzuć z odbiciem:', pula: true, greedy: true },
  { v: 'Rzuć wygnaną', re: '^Rzuć wygnaną:', pula: true, greedy: true },
  { v: 'Rzuć zawieszone', re: '^Rzuć zawieszone:', pula: true, greedy: true },
  { v: 'Rzuć za surge', re: '^Rzuć za surge:', pula: true, greedy: true },
  { v: 'Zagraj z przygody', re: '^Zagraj z przygody:', pula: true, greedy: true },
  { v: 'Zagraj aurę', re: '^Zagraj aurę:', pula: true, greedy: true },
  { v: 'Zagraj za bestow', re: '^Zagraj za bestow:', pula: true, greedy: true },
  { v: 'Zagraj za manę ze Skarbów', re: '^Zagraj za manę ze Skarbów:', pula: true, greedy: true },
  { v: 'Ucieczka', re: '^Ucieczka:', pula: true, greedy: true },
  { v: 'Przygoda', re: '^Przygoda:', pula: true, greedy: true },
  { v: 'Ninjutsu', re: '^Ninjutsu:', pula: true, greedy: true },
  { v: 'Channel', re: '^Channel:', pula: true, greedy: true },
  { v: 'Cycling', re: '^Cycling:', pula: true, bezpieczna: true, greedy: true },
  { v: 'Wyposaż', re: '^Wyposaż:', pula: true, bezpieczna: true, greedy: true },
  { v: 'Flashback', re: '^Flashback:', pula: true, greedy: true },
  { v: 'Bloodrush', re: '^Bloodrush:', pula: true, greedy: true },
  { v: 'Plotuj', re: '^Plotuj:', pula: true, greedy: true },
  { v: 'Przygotuj manę', re: '^Przygotuj manę:', pula: true, bezpieczna: true, greedy: true },
  { v: 'Zawieś', re: '^Zawieś:', pula: true, greedy: true },
];

/**
 * Wzorce etykiet wyboru celu/decyzji, które też są akcjami gracza w panelu,
 * ale nie mają czasownika z tabeli (klasa etykiety grupowej, nie czasownika).
 */
// Uwaga C1 właściciela (2026-09-19, Merchant's Dockhand): grupa „Tap
// X artefaktów” ma etykietę tytułową „<karta> — przejrzyj X kart…” (kreator
// ze stepperem X), nie czasownika z tabeli — bez wzorca tester nigdy nie
// klikał oferty i kreator tapX nie był ćwiczony na żywym stole (L135).
const WZORCE_GRUP = ['^Cel czaru', '^Cel zdolności:', '^Bestow:', '^Aura:', 'cel triggera', 'podziel \\d+ obrażeni?[ae]?', 'przejrzyj X kart'];

/** Ogon historycznej kolejności priorytetów profilu `greedy` (bez czasowników). */
// „przejrzyj X kart” (uwaga C1 właściciela, 2026-09-19): grupa kreatora tapX
// jest decyzją rozwijającą, więc należy do ogona grupowego jak cele zdolności.
const PRIORYTET_GRUP = ['cel triggera', 'podziel \\d+ obrażeni?[ae]?', '^Cel zdolności:|^Cel czaru:|^Bestow:|^Aura:', 'przejrzyj X kart'];

/** Czasowniki akcji (bez etykiet grupowych) — wspólne dla testera i detektorów. */
export const ACTION_LABEL_REGEX = new RegExp(TABELA.filter((a) => a.pula).map((a) => a.re).join('|'));

/** Pula ruchów rozwijających: czasowniki + etykiety grupowe celów/decyzji. */
export const PLAY_REGEX = new RegExp([...TABELA.filter((a) => a.pula).map((a) => a.re), ...WZORCE_GRUP].join('|'));

/** Podzbiór „bezpieczny" profilu `defensive` (lądy, zdolności, koszty taptu). */
export const SAFE_REGEX = new RegExp(TABELA.filter((a) => a.bezpieczna).map((a) => a.re).join('|'));

/**
 * Kolejność priorytetów profilu `greedy` (regresja M80–M96): historyczny
 * łańcuch `||` w tej samej kolejności, potem czasowniki nowo dodane (E2),
 * a na końcu cele czarów/zdolności. `Obsadź:`/`Osiodłaj:` stoją zaraz po
 * `Aktywuj:` — to ta sama rodzina (zdolność permanentu), a przed `Wybierz:`
 * (deklaracja atakujących), bo obsadzony pojazd ma szansę wejść do walki
 * w tej samej turze.
 */
export const GREEDY_PRIORITY = [
  ...TABELA.filter((a) => a.greedy).map((a) => new RegExp(a.re)),
  // Dalsza część historycznego łańcucha: cel triggera, podział obrażeń i (na
  // samym końcu) grupy celów czarów/zdolności — kolejność bez zmian.
  ...PRIORYTET_GRUP.map((src) => new RegExp(src)),
];

/** Etykieta akcji (pula ruchów)? Zostaje dla czytelności wywołań w testerze. */
export function isPlayLabel(label) {
  return PLAY_REGEX.test(String(label));
}

/**
 * Czasowniki puli wyłączone z osi 3 (zachowanie sprzed 2026-09-13):
 *  - „Zagraj ląd" — kładzenie lądu ma własny tryb w panelu,
 *  - „Wybierz" — deklaracje atakujących/blokujących i mulligan to kroki
 *    obowiązkowe (pierwsza wersja wspólnej listy zgłosiła je jako „brak
 *    ptaszka" — fałszywy alarm naprawiony tu, po stronie testera, L12).
 * Rozszerzenie osi poza te dwa to osobna decyzja UX.
 */
const BEZ_PTASZKA = new Set(['Zagraj ląd', 'Wybierz']);

/**
 * Oś 3 detektorów (`detectMissingIgnoreTick`): akcje-czary i zdolności, którym
 * należy się ptaszek auto-pass. Zakres historyczny — lądów nie obejmuje
 * („Zagraj ląd" ma własny tryb w panelu); rozszerzenie tej osi to osobna
 * decyzja UX, nie skutek uboczny naprawy dryfu nazw.
 */
export const IGNORABLE_LABEL_REGEX = new RegExp(
  TABELA.filter((a) => a.pula && !BEZ_PTASZKA.has(a.v)).map((a) => a.re).join('|'),
);

/** Wszystkie czasowniki tabeli (strażnik w teście; bez etykiet grupowych). */
export const ACTION_VERBS = TABELA.map((a) => a.v);

/** Czasowniki w podzbiorze „bezpiecznym" profilu `defensive`. */
export const SAFE_VERBS = TABELA.filter((a) => a.bezpieczna).map((a) => a.v);

/** Czasowniki w kolejności priorytetów profilu `greedy`. */
export const GREEDY_VERBS = TABELA.filter((a) => a.greedy).map((a) => a.v);

/** Czasowniki, których nie ma w `render.js` jako literał (dynamiczne etykiety). */
export const DYNAMIC_VERBS = TABELA.filter((a) => a.dynamiczny).map((a) => a.v);

export { esc as escapeVerbPattern };
