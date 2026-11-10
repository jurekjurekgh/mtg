/**
 * Zgłoszenie V (właściciel, 2026-11-09): „up to two" — wybór gracza bez
 * odpowiednika w ofercie silnika.
 *
 * Tło. PR #179 (`7a18659`, „G, etap 2") zamienił pełną enumerację podzbiorów
 * celów triggera na ZIARNA (`triggerTargetSeedSubsets`): pełny zestaw
 * zachłanny, singletony i pusty przy `upTo`. Powód był słuszny — C(n,k) rośnie
 * lawinowo. Ale kreator wielocelowy oddawał wyłącznie komendę ZNALEZIONĄ
 * w `legalCommands` (L48: „UI nie wymyśla ruchów"). Przy 7 kandydatach i
 * „up to two" par jest 21, a komendę miała jedna — więc „Zatwierdź" gasło
 * dla 20 z 21 wyborów. Silnik ma KOMPLETNĄ walidację w `execute` (rozmiar
 * ≤ count, zero tylko przy upTo, kandydaci z listy); brakowało jednej reguły,
 * która tę walidację wykorzysta.
 *
 * Reguła (jedno źródło — L41): dla wyboru gracza oddaj gotową komendę
 * z oferty, a gdy takiej nie ma — zbuduj ją z szablonu grupy. Silnik nie
 * potrzebuje żadnego znacznika „to zbudowane": jego kontrakt jest czysto
 * legalnościowy i pinuje go `zgloszenie-e-inferno-podzial` E/4 (legalny
 * zbiór bez znaczników przechodzi). Próby bramkowania execute znacznikiem
 * zostały zmierzone i odrzucone — łamały E/4.
 *
 * Nielegalności NIE filtrujemy tutaj: rozmiar i przynależność kandydatów
 * sprawdza silnik (CR 601.2c/608.2b). Kreator ma oddawać to, co gracz
 * wskazał — inaczej błąd silnika schowałby się w UI (klasa L48/L181).
 */

/**
 * Komenda dla dokładnie tego zbioru. Kolejność jak w protokole: najpierw
 * oferta silnika (wtedy oddajemy JĄ), a dopiero gdy takiej nie ma, budujemy
 * z szablonu grupy.
 *
 * @param {Array} commands   oferta (`legalCommands` grupy decyzji)
 * @param {string[]} targetIds wybór gracza (kolejność kliknięć nieistotna)
 * @param {{type: string}} opts typ komendy (rodzina decyzji)
 * @returns {object|null} komenda do oddania albo null (brak szablonu)
 */
export function builtTargetSetCommand(commands, targetIds, { type }) {
  const ids = [...(targetIds ?? [])];
  const key = [...ids].sort().join('|');
  const offered = (commands ?? []).find((cmd) => cmd
    && cmd.type === type
    && Array.isArray(cmd.targetIds)
    && [...cmd.targetIds].sort().join('|') === key);
  if (offered) return offered;
  const template = (commands ?? []).find((cmd) => cmd
    && cmd.type === type
    && Array.isArray(cmd.targetIds));
  if (!template) return null;
  // Wariant pusty silnik koduje BEZ pola `targetIds` (konwencja `command()`),
  // a szablon pusty mógłby nie istnieć — dlatego pole dodajemy jawnie.
  return { ...template, targetIds: ids };
}
