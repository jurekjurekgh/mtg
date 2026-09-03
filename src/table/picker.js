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
 * M292 (2026-09-03, decyzja właściciela „1+2+3 i przerobienie testu"): ten sam
 * helper obsługuje także rodzinę „ile" (steppery przydziału obrażeń i podziału
 * obrażeń), listy jednodotykowe (źródła many w kreatorze płatności) oraz ptaszek
 * „ignoruj tę opcję" — w panelu akcji i w modalu wyboru, które do tej pory lepiło
 * go osobno. O to właśnie chodziło w prośbie: JEDEN komponent z parametrami
 * zamiast równoległej funkcji wizualizującej dla każdego efektu.
 *
 * Ten moduł odpowiada za WYGLĄD i obsługę dotyku, a nie za decyzję: które
 * wiersze istnieją, co znaczy zaznaczenie, ile wolno dołożyć i kiedy „Zatwierdź"
 * gaśnie — to wie wywołujący (per efekt), a legalność i tak rozstrzyga silnik
 * przez `legalCommands` (L48: UI nie wymyśla ruchów, tylko je pokazuje).
 *
 * Kontrakt klasy (nie zmieniać bez przejrzenia `tools/table-tester/run-game.mjs`
 * oraz testów `m129-*`, `m136-*`, `m172-*`, `m195-*`, `m200-*`, `m257r5-*`,
 * `m292-*`, `table-ui`, `choice-request-ui`, `choice-ignore`,
 * `choice-group-ignore`):
 *  - wiersz to `<label>` (ptaszki) / `<div>` (stepper) / `<button>` (jedno
 *    tapnięcie) z klasą rodzinną kreatora (np. `multi-target-row`) plus wspólną
 *    `picker-row` — chyba że wywołujący prosi o `variant: 'inline'`, patrz niżej,
 *  - ptaszek to `<input>` niosący KLASĘ TOGGULA kreatora (`multi-target-toggle`,
 *    `combat-wizard-toggle`, `escape-exile-toggle`, `action-ignore-input`) —
 *    tester klika właśnie ją,
 *  - nazwa to `<span class="picker-name …">` i to ona otwiera kartę (zamiast
 *    osobnego przycisku „Podgląd"),
 *  - licznik steppera to `<span class="picker-value …">`, a −/+ to
 *    `<button class="picker-step picker-step-dec|picker-step-inc …">`; haki
 *    kreatora (`damage-wizard-minus`, `damage-wizard-plus`, `damage-wizard-count`)
 *    wędrują na TE SAME elementy, więc tester
 *    (`$$('#choice-request .damage-wizard-plus')`) i `m136`/`m172` nic nie tracą,
 *  - `variant: 'inline'` = wspólna OBSŁUGA (label→input, stopPropagation, tytuł,
 *    synchronizacja), ale BEZ klas `picker-*`: tak jest w ptaszku wyciszenia,
 *    który siedzi WEWNĄTRZ przycisku opcji i nie może dostać wyglądu wiersza
 *    (44 px, ramka) — inaczej zagnieździłby wiersz w wierszu. Wywołujący podaje
 *    wtedy własne klasy (`action-ignore`, `action-ignore-input`) i na nie patrzą
 *    `test/table-ui.test.js`, `test/choice-group-ignore.test.js` oraz sonda
 *    `run-game.mjs` (`.action-ignore-input`).
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
 * Nazwa wiersza: osobny cel kliknięcia (pełny ekran karty) albo czysty tekst.
 * `html` przyjmuje WYŁĄCZNIE markup generowany w tym kodzie (ikony many z
 * `mana-icons.js`) — nazwy kart idą przez `label`, czyli `textContent`.
 */
function renderPickerName(host, { className, label, html, openable, onOpenCard, id }) {
  const nameEl = mkElement('span', host);
  nameEl.className = joinClasses('picker-name', className);
  if (html) nameEl.innerHTML = html;
  else nameEl.textContent = String(label ?? '');
  host.appendChild(nameEl);
  // Nazwa otwiera pełny ekran karty i NIE przełącza ptaszka (stopPropagation,
  // wzorzec M66 z wizarda walki). Bez `onOpenCard` nazwa pozostaje tekstem.
  if (openable && typeof onOpenCard === 'function' && id != null) {
    nameEl.className = joinClasses(nameEl.className, 'is-openable');
    nameEl.addEventListener('click', (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      onOpenCard(id);
    });
  }
  return nameEl;
}

/**
 * Wiersz wyboru. `kind`:
 *  - `'checkbox'` — wiele zaznaczeń, `'radio'` — jeden wybór w grupie (`group`),
 *    tak jak pozycje celu w Knockout Maneuver;
 *  - `'stepper'` — licznik `min..max` z przyciskami −/+ i `onStep(delta, id)`;
 *    wiersz NIE jest wtedy `<label>`, bo klik obok licznika nie ma prawa nic
 *    zmieniać, a sam licznik nie może być przełącznikiem;
 *  - `'button'` — cały wiersz jest jedną akcją (źródła many, listy wariantów).
 *
 * Zwraca uchwyt `{ row, input, label, actions, valueEl, setValue, getValue,
 * refresh, setDisabled, setChecked }`. `setChecked`/`setValue` synchronizują DOM
 * ze stanem MODELU: przy pozycjach celu klik w drugą kartę tej samej szufladki
 * zwalnia pierwszą, przy poświęceniu nowa ofiara zastępuje starą, a przy
 * stepperze o legalności ++/−− decyduje model wywołującego przez
 * `canDecrement`/`canIncrement` (CR 510.1d: bloker poniżej lethal zeruje
 * następnych). Bez tego widok kłamałby co do stanu — klasyczny rozjazd.
 */
export function renderPickerRow(host, {
  id = null,
  label = '',
  html = null,
  kind = 'checkbox',
  variant = 'row',
  checked = false,
  disabled = false,
  group = null,
  title = null,
  value = 0,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  format = null,
  decLabel = '−1',
  incLabel = '+1',
  rowClassName = '',
  toggleClassName = '',
  nameClassName = '',
  valueClassName = '',
  decClassName = '',
  incClassName = '',
  actionsClassName = '',
  canDecrement = null,
  canIncrement = null,
  onToggle = null,
  onStep = null,
  onActivate = null,
  onOpenCard = null,
  stopRowPropagation = false,
} = {}) {
  const inline = variant === 'inline';
  /** Klasy `picker-*` tylko w wariancie wierszowym — patrz nagłówek pliku. */
  const own = (base, family) => (inline ? family : joinClasses(base, family));
  const blockPropagation = (el) => {
    if (stopRowPropagation) el.addEventListener('click', (e) => e?.stopPropagation?.());
    return el;
  };

  // ===== wiersz-przycisk: listy, w których cała linia jest akcją ============
  if (kind === 'button') {
    const row = mkElement('button', host);
    row.type = 'button';
    row.className = joinClasses(own('picker-row', rowClassName), 'picker-button');
    if (disabled) row.disabled = true;
    if (title) row.title = String(title);
    const nameEl = renderPickerName(row, {
      className: nameClassName,
      label,
      html,
      // Tu nazwa nie podgląda karty osobno: cały wiersz jest jednym tapnięciem
      // i dorzucenie klikalnej nazwy dałoby dwa różne skutki w tym samym celu.
      openable: false,
      onOpenCard,
      id,
    });
    nameEl.className = joinClasses(nameEl.className, 'picker-button-label');
    blockPropagation(row).addEventListener('click', () => {
      if (row.disabled) return;
      onActivate?.(id);
    });
    host.appendChild(row);
    return {
      row,
      label: nameEl,
      setLabel(text) { nameEl.textContent = String(text); },
      setDisabled(flag) { row.disabled = Boolean(flag); },
    };
  }

  // ===== wiersz-stepper: rodzina „ile" (M292) ================================
  if (kind === 'stepper') {
    const row = mkElement('div', host);
    row.className = joinClasses(own('picker-row', rowClassName), 'picker-stepper');
    if (title) row.title = String(title);

    const nameEl = renderPickerName(row, {
      className: own('picker-name', nameClassName),
      label,
      html,
      openable: true,
      onOpenCard,
      id,
    });

    let n = Number(value) || 0;
    const dec = mkElement('button', host);
    dec.type = 'button';
    dec.className = joinClasses(own('picker-step', decClassName), 'picker-step-dec');
    dec.textContent = String(decLabel);
    const valueEl = mkElement('span', host);
    valueEl.className = joinClasses(own('picker-value', valueClassName), 'picker-count');
    const inc = mkElement('button', host);
    inc.type = 'button';
    inc.className = joinClasses(own('picker-step', incClassName), 'picker-step-inc');
    inc.textContent = String(incLabel);
    // Hak kreatora na licznik bywa inny niż na przyciski (`damage-wizard-count`
    // w podziale, `damage-wizard-amount` w przydziale bojowym) — `valueClassName`
    // ląduje więc na tym samym elemencie co `picker-value`, bo na niego patrzą
    // m172 i sonda przydziału z M136.

    const actions = mkElement('span', host);
    actions.className = joinClasses('picker-actions', actionsClassName);

    row.appendChild(dec);
    row.appendChild(valueEl);
    row.appendChild(inc);
    row.appendChild(actions);

    const paint = () => {
      valueEl.textContent = format ? String(format(n)) : String(n);
      const aboveMin = n > min && (typeof canDecrement !== 'function' || canDecrement());
      const belowMax = n < max && (typeof canIncrement !== 'function' || canIncrement());
      dec.disabled = !aboveMin;
      inc.disabled = !belowMax;
    };
    // Wyłączony przycisk nie wolno obsłużyć EVEN jeśli zdarzenie dojdzie
    // (stub DOM w testach UI odpala listenery niezależnie od `disabled`, a
    // na starszym iPhanie klik w `disabled` potrafi przebić się do rodzica).
    dec.addEventListener('click', () => { if (!dec.disabled) onStep?.(-1, id); });
    inc.addEventListener('click', () => { if (!inc.disabled) onStep?.(1, id); });
    paint();

    host.appendChild(row);
    return {
      row,
      label: nameEl,
      valueEl,
      actions,
      setValue(next) { n = Number(next) || 0; paint(); },
      getValue: () => n,
      refresh: paint,
      setDisabled(flag) { dec.disabled = inc.disabled = Boolean(flag); },
    };
  }

  // ===== wiersz z ptaszkiem: checkbox / radio =================================
  const row = mkElement('label', host);
  row.className = own('picker-row', rowClassName);
  if (title) row.title = String(title);
  blockPropagation(row);
  host.appendChild(row);

  const input = mkElement('input', host);
  input.className = own('picker-toggle', toggleClassName);
  input.type = kind === 'radio' ? 'radio' : 'checkbox';
  if (group) input.name = String(group);
  input.checked = Boolean(checked);
  input.disabled = Boolean(disabled);
  row.appendChild(input);

  let nameEl = null;
  if (label !== null && label !== '') {
    nameEl = renderPickerName(row, {
      className: own('picker-name', nameClassName),
      label,
      html,
      openable: true,
      onOpenCard,
      id,
    });
  }

  // Ptaszek jest jedynym źródłem przełączenia: wiersz to <label>, więc klik
  // gdziekolwiek (M129/C) trafia natywnie w input i nie podwaja zdarzenia.
  input.addEventListener('change', () => {
    if (onToggle) onToggle(Boolean(input.checked), id);
  });

  return {
    row,
    input,
    label: nameEl,
    setChecked(value_) { input.checked = Boolean(value_); },
    setDisabled(value_) { input.disabled = Boolean(value_); },
  };
}
