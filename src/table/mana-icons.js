/**
 * Ikony symboli many (zgłoszenie 2026-08-07): zamiast tekstu typu {2}{U}
 * kolorowe kółka z literą (jak symbole MtG). Zamiana zachodzi na poziomie
 * HTML — funkcje zwracają bezpieczny fragment do innerHTML; cały pozostały
 * tekst przechodzi przez escapeHtml.
 *
 * Mapowanie: {W},{U},{B},{R},{G} → kolorowe kółka z literą; {C} → szare
 * kółko „C"; {X} → szare „X"; {N} → szare kółko z liczbą; {W/P} → pół na
 * pół biały/fioletowy (phyrexian); {U/R} itd. → dwukolorowe kółko (hybryd).
 */

const COLOR_CLASS = Object.freeze({ W: 'w', U: 'u', B: 'b', R: 'r', G: 'g' });

/** Escape HTML — nazwy kart i teksty idą do innerHTML obok ikon. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Pojedynczy symbol {X} → span z klasą. */
function symbolSpan(token) {
  const inner = token.replace(/[{}]/g, '');
  // Phyrexian {W/P}: pierwsza litera = kolor, reszta po slashu = drugi kolor.
  const slash = inner.indexOf('/');
  if (slash !== -1) {
    const a = inner.slice(0, slash);
    const b = inner.slice(slash + 1);
    const clsA = COLOR_CLASS[a] ?? 'c';
    const clsB = COLOR_CLASS[b] ?? 'c';
    return `<span class="ms ms-${clsA} ms-hybrid">${escapeHtml(a)}<i class="ms-${clsB}"></i></span>`;
  }
  const cls = COLOR_CLASS[inner] ?? (inner === 'C' || inner === 'X' || /^\d+$/.test(inner) ? 'c' : 'c');
  return `<span class="ms ms-${cls}">${escapeHtml(inner)}</span>`;
}

/**
 * Zamienia napis zawierający symbole {W}..{G}, {C}, {X}, {N}, hybrydy i
 * phyrexian na HTML z ikonami; reszta tekstu escape'owana. Nieznane symbole
 * zostają jako zwykły tekst (escape'owany).
 */
export function manaSymbolsHtml(text) {
  const out = [];
  let rest = String(text ?? '');
  const pattern = /\{[A-Za-z0-9/]+\}/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(rest)) !== null) {
    out.push(escapeHtml(rest.slice(last, match.index)));
    out.push(symbolSpan(match[0]));
    last = match.index + match[0].length;
  }
  out.push(escapeHtml(rest.slice(last)));
  return out.join('');
}

/** Skrót: koszt many (string z MANA_COSTS) → HTML z ikonami. */
export function manaCostHtml(costStr) {
  return manaSymbolsHtml(costStr);
}
