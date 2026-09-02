/**
 * M288/A (uwaga właściciela z żywej gry, 2026-09-02): JEDEN wspólny wiersz
 * wyboru dla wszystkich efektów wielocelowych.
 *
 * Zgłoszenie:
 *   „Knockout Maneuver — wskaż po jednym celu dla każdej pozycji: 1. twój
 *    stwór: [ ] Krotiq Nestguard (Ty) Podgląd … Brakuje: twój stwór, stwór
 *    przeciwnika. Zupełnie inny modal niż pozostałe modale wielocelowe, np.
 *    blokowania czy Fireball. Warto przerobić na jeden wspólny helper do
 *    efektów wielocelowych w stylu blokowania czy wyboru atakujących — logika
 *    musi być w każdym typie efektu inna, ale wygląd może być taki sam
 *    (elastyczny helper)."
 *
 * Root cause (zmierzone, nie zgadywane): kreator wielocelowy
 * (`renderMultiTargetWizard`) NIE miał żadnej reguły CSS — `.multi-target-*`
 * nie istniało w `src/table/index.html` ani razu — i rysował wiersze jako
 * `<button>` z marką w TEKŚCIE (`[ ] Nazwa`, `[x] Nazwa`) plus osobny przycisk
 * „Podgląd". Wizard walki od M129/C ma natywne `<input type=checkbox>` w
 * `<label>` (cały wiersz = cel dotyku ≥ 44 px, ptaszek 24 px, złote tło po
 * zaznaczeniu), a klik w nazwę otwiera kartę. Stąd dwa różnie wyglądające
 * ekrany na tej samej planszy.
 *
 * Ten moduł odpowiada za WYGLĄD i obsługę dotyku, a nie za decyzję: które
 * wiersze istnieją, co znaczy zaznaczenie i kiedy „Zatwierdź" gaśnie — to wie
 * wywołujący (per efekt), a legalność i tak rozstrzyga silnik przez
 * `legalCommands` (L48: UI nie wymyśla ruchów, tylko je pokazuje).
 *
 * Kontrakt klasy (nie zmieniać bez przejrzenia `tools/table-tester/run-game.mjs`
 * oraz testów `m195-*`, `m200-*`, `m257r5-*`, `m129-*`):
 *  - wiersz to `<label>` z klasą rodzinną kreatora (np. `multi-target-row`)
 *    plus wspólną `picker-row`,
 *  - ptaszek to `<input>` niosący KLASĘ TOGGULA kreatora (`multi-target-toggle`,
 *    `combat-wizard-toggle`, `escape-exile-toggle`) — tester klika właśnie ją,
 *  - nazwa to `<span class="picker-name …">` i to ona otwiera kartę (zamiast
 *    osobnego przycisku „Podgląd").
 */

/** Tworzy element przez dokument gospodarza (testy core nie mają DOM-u). */
function mkElement(tag, host) {
  const doc = host?.ownerDocument ?? globalThis.document;
  if (!doc?.createElement) throw new TypeError('picker: brak dokumentu do utworzenia elementu');
  return doc.createElement(tag);
}

/** Składa klasy, pomijając puste — wywołujący podaje klasy rodzinne opcjonalnie. */
function joinClasses(...parts) {
  return parts.filter((part) => typeof part === 'string' && part.trim() !== '').join(' ');
}

/** Nagłówek sekcji wyboru („1. twój stwór:", „Poświęcenie (koszt):"). */
export function renderPickerSection(host, text, { className = '' } = {}) {
  const el = mkElement('div', host);
  el.className = joinClasses('picker-section', className);
  el.textContent = String(text);
  host.appendChild(el);
  return el;
}

/**
 * Wiersz wyboru. `kind: 'checkbox'` — wiele zaznaczeń; `'radio'` — jeden wybór
 * w grupie (`group` = nazwa grupy), tak jak pozycje celu w Knockout Maneuver.
 *
 * Zwraca uchwyt `{ row, input, label, setChecked, setDisabled }`. `setChecked`
 * synchronizuje DOM ze stanem MODELU: przy pozycjach celu klik w drugą kartę
 * tej samej szufladki zwalnia pierwszą, a przy poświęceniu nowa ofiara zastępuje
 * starą — bez tego ptaszek kłamałby co do stanu (klasyczny rozjazd widoku).
 */
export function renderPickerRow(host, {
  id = null,
  label = '',
  kind = 'checkbox',
  checked = false,
  disabled = false,
  group = null,
  rowClassName = '',
  toggleClassName = '',
  nameClassName = '',
  onToggle = null,
  onOpenCard = null,
} = {}) {
  const row = mkElement('label', host);
  row.className = joinClasses('picker-row', rowClassName);
  host.appendChild(row);

  const input = mkElement('input', host);
  input.className = joinClasses('picker-toggle', toggleClassName);
  input.type = kind === 'radio' ? 'radio' : 'checkbox';
  if (group) input.name = String(group);
  input.checked = Boolean(checked);
  input.disabled = Boolean(disabled);
  row.appendChild(input);

  const nameEl = mkElement('span', host);
  nameEl.className = joinClasses('picker-name', nameClassName);
  nameEl.textContent = String(label);
  row.appendChild(nameEl);

  // Ptaszek jest jedynym źródłem przełączenia: wiersz to <label>, więc klik
  // gdziekolwiek (M129/C) trafia natywnie w input i nie podwaja zdarzenia.
  input.addEventListener('change', () => {
    if (onToggle) onToggle(Boolean(input.checked), id);
  });
  // Nazwa otwiera pełny ekran karty i NIE przełącza ptaszka (stopPropagation,
  // wzorzec M66 z wizarda walki). Bez `onOpenCard` nazwa pozostaje tekstem.
  if (typeof onOpenCard === 'function' && id != null) {
    nameEl.className = joinClasses(nameEl.className, 'is-openable');
    nameEl.addEventListener('click', (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      onOpenCard(id);
    });
  }

  return {
    row,
    input,
    label: nameEl,
    setChecked(value) { input.checked = Boolean(value); },
    setDisabled(value) { input.disabled = Boolean(value); },
  };
}
