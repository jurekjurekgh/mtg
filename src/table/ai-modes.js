/**
 * AI-OpenRouter (Etap-1): tryby AI — budowa promptów.
 *
 * Moduł CZYSTY: same funkcje tekstowe, zero DOM-u/sieci/pamięci.
 * Tryb I (`lore-bot`): komentarz do ostatniej tury w lore świata talii bota.
 */

export const LORE_COMMENT_LIMIT = 600;

/**
 * Buduje prompt trybu I.
 * ctx: { botLogName, deckTitle, deckKey, world, turnNumber, turnText }.
 * - botLogName: imię bota w logu („Nieprzyjaciel"),
 * - deckTitle/deckKey: dokładna talia bota (tytuł + klucz),
 * - world: świat-lore talii (tytuł talii / dominujący plan kart),
 * - turnNumber/turnText: numer ostatniej tury + PEŁNY zapis od początku.
 */
export function buildLorePrompt(ctx) {
  const c = ctx ?? {};
  const bot = c.botLogName || 'Nieprzyjaciel';
  const deck = c.deckTitle || c.deckKey || '(nieznana talia)';
  const world = c.world || deck;
  const turnNo = c.turnNumber ?? '?';
  const history = c.turnText || '(brak zapisu)';
  return [
    `Jesteś ${bot} — przeciwnikiem Czarodziejki w pojedynku magów.`,
    `Grasz talią „${deck}" ze świata: ${world}.`,
    '',
    'Poniżej pełny zapis partii (format „Tura N — Imię" + zdarzenia), od początku do końca aktualnej tury:',
    '',
    history,
    '',
    `Skomentuj OSTATNIĄ turę (nr ${turnNo}) w 100% w klimacie (lore) świata ${world}.`,
    'Zasady:',
    '- opowiedz starcie jako historię o pojedynku z Czarodziejką,',
    `- NIE używaj wprost nazw kart Magic: The Gathering ani meta-nazw mechanik, zdolności i słów kluczowych (opisuj zdarzenia językiem świata: ${world}),`,
    `- krótko: do około ${LORE_COMMENT_LIMIT} znaków.`,
  ].join('\n');
}
