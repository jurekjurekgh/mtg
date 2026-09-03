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
 * M293 (2026-09-03, decyzja właściciela o czystości projektu): piąty kształt —
 * `chip` (`renderPickerChip` + `renderPickerChipList`), pigułka z nazwą karty dla list
 * przeglądniętych (scry, surveil, „ułóż wierzch", „weź jeden land"), oraz
 * `renderPickerCancel` — stopka „Zamknij (dokończysz później)", którą trzy kreatory
 * (patrzenia, walki, przydziału obrażeń) rysowały własną, identyczną kopią. Chip
 * ŚWIADOMIE nie dostaje `picker-row`: wiersz wyboru to cel dotyku ≥44 px, a chip jest
 * mały i upakowany w linii (`padding: 5px 10px`, `font-size: 13px`); klikalna jest
 * tylko podkreślona nazwa i tylko gdy wywołujący podał `onOpenCard`. Nazwy haków
 * (`look-wizard-cards`, `look-wizard-card`, `look-wizard-card-name`) pozostają w
 * markupie JAKO PARAMETRY, bo patrzą na nie `m129`, `look-wizard-contrast`, `m293` i
 * sonda `run-game.mjs`, a sam styl mieszka w rodzinie `.picker-*` (reguły
 * `.look-wizard-*`: 5 → 2; `.look-wizard-cancel` → `.picker-cancel`, bo hook jeździł za
 * kopiami do kreatorów niemających nic wspólnego z „look").
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
 *    `run-game.mjs` (`.action-ignore-input`),
 *  - chip to `<div class="picker-chip …">` z `<span class="picker-chip-name">`; lista
 *    nosi `picker-chip-list` plus `listClassName` wywołującego, a numer pozycji
 *    zaczyna się od znaku nowej linii (konwenans M86/M87 z `renderChoiceRequest`:
 *    bez niego `textContent` skleja pozycje w jeden ciąg — to samo czyta sonda
 *    Testora i testy, więc nie zastępuje go margines CSS). Chip nie ma `<input>`
 *    i nie jest wierszem `picker-row`. Stopka kreatora: `<button class="ghost-btn
 *    picker-cancel">`.
 *
 * Testy, które liczą się z tym kontraktem: `m129-*` (dotyk i antyduplikat CSS),
 * `m292-*`, `m293-*`, `look-wizard-contrast`, `choice-request-ui`, `table-ui`,
 * `table-mana-wizard`, `m172-*`, `m136-*` — oraz jądro pomiaru
 * `test/harness/css-effective.js` (styl efektywny, nie tekst stylesheetu; L125).
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
 * Stopka kreatora: „Zamknij (dokończysz później)". Rysowana tu, bo trzy
 * kreatory (przeglądanie kart, walka, przydział obrażeń) miały IDENTYCZNE
 * cztery linie tego przycisku, a ich hook `.look-wizard-cancel` wędrował za
 * kopiami do kreatorów, które z „look" nie mają nic wspólnego (M293).
 */
export function renderPickerCancel(host, { label = 'Zamknij (dokończysz później)', className = '', onClick = null } = {}) {
  const btn = mkElement('button', host);
  btn.type = 'button';
  btn.className = joinClasses('ghost-btn picker-cancel', className);
  btn.textContent = String(label);
  btn.addEventListener('click', () => onClick?.());
  host.appendChild(btn);
  return btn;
}

/**
 * Chip: pigułka z NAZWĄ KARTY w liście przeglądniętej (scry/surveil/look,
 * sortery kolejności) — M293, decyzja właściciela z tury 14: „jeśli można te
 * dwa ostatnie sparametryzować i obsłużyć tym samym wizardem, powinniśmy to
 * zrobić dla czystości projektu".
 *
 * Świadomie NIE dziedziczy `picker-row`: wiersz wyboru to cel dotyku 44 px z
 * ramką, a chip to mały znaczek w upakowanej linii (`.picker-chip`, 5×10 px
 * paddingu). Wspólne jest RYSOWANIE (indeks + klikalna nazwa + dopiski), nie
 * wygląd wiersza — stąd kształt `chip` nie dostaje rodziny `.picker-row` ani
 * `picker-name` (ta druga niesie `flex:1` i podkreślenie wiersza).
 *
 * `marks` (dopiski „→ cmentarz", „→ spód (2.)") i `badge` („ · basic land") to
 * JEDYNE rzeczy, którymi różniły się dwa dotychczasowe budowniczowie listy.
 */
function renderPickerChip(host, {
  id = null,
  cardId = null,
  label = '',
  indexLabel = '',
  badge = null,
  marks = [],
  rowClassName = '',
  indexClassName = '',
  nameClassName = '',
  markClassName = '',
  onOpenCard = null,
} = {}) {
  const row = mkElement('div', host);
  row.className = joinClasses('picker-chip', rowClassName);
  if (indexLabel) {
    const indexEl = mkElement('span', host);
    // M87 (zgłoszenie): `textContent` body sklejał chipy w jedno
    // („Curate2. Woolly") — każdy wiersz zaczyna się od znaku nowego wiersza,
    // dokładnie jak w `renderChoiceRequest` (M86). Dlatego indeks nosi `\\n`,
    // a nie osobny margines CSS.
    indexEl.className = joinClasses('picker-chip-index', indexClassName);
    indexEl.textContent = String(indexLabel);
    row.appendChild(indexEl);
  }
  const nameEl = mkElement('span', host);
  const openable = typeof onOpenCard === 'function' && cardId != null;
  nameEl.className = joinClasses(openable ? 'picker-chip-name is-openable' : 'picker-chip-name', nameClassName);
  nameEl.textContent = String(label ?? '');
  if (openable) {
    // Nazwa karty otwiera pełny ekran (`log-card` + `dataset.cardId` — delegacja
    // w main.js, M167/C) i nie zaznacza niczego obok.
    if (nameEl.dataset) nameEl.dataset.cardId = String(cardId);
    nameEl.addEventListener('click', (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      onOpenCard(cardId);
    });
  }
  row.appendChild(nameEl);
  for (const mark of (badge ? [badge, ...marks] : marks)) {
    if (!mark) continue;
    const el = mkElement('span', host);
    if (markClassName) el.className = markClassName;
    el.textContent = String(mark);
    row.appendChild(el);
  }
  host.appendChild(row);
  return { row, nameEl };
}

/**
 * Lista chipów przeglądniętych kart. `items`: `{ id, cardId, name, badge,
 * marks }`. `numbered` daje prefix „\\n1. ", „\\n2. " (porządek = kolejność
 * biblioteki, nie kliknięć). Zwraca `{ list, rows }`.
 */
export function renderPickerChipList(host, {
  items = [],
  listClassName = '',
  rowClassName = '',
  indexClassName = '',
  nameClassName = '',
  markClassName = '',
  numbered = true,
  indexLabelOf = null,
  onOpenCard = null,
} = {}) {
  const list = mkElement('div', host);
  list.className = joinClasses('picker-chip-list', listClassName);
  host.appendChild(list);
  const rows = items.map((item, i) => renderPickerChip(list, {
    id: item.id ?? null,
    cardId: item.cardId ?? null,
    label: item.name ?? item.label ?? '',
    indexLabel: numbered
      ? (typeof indexLabelOf === 'function' ? indexLabelOf(item, i) : `\n${i + 1}. `)
      : '',
    badge: item.badge ?? null,
    marks: item.marks ?? [],
    rowClassName,
    indexClassName,
    nameClassName,
    markClassName,
    onOpenCard,
  }));
  return { list, rows: rows.map((r) => r.row), nameEls: rows.map((r) => r.nameEl) };
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
