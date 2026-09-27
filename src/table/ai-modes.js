/**
 * AI-OpenRouter: tryby AI — budowa promptów.
 *
 * Moduł CZYSTY: same funkcje tekstowe, zero DOM-u/sieci/pamięci.
 * Tryb I (`lore-bot`): komentarz do ostatniej tury w lore świata talii bota.
 * Tryb II (`player-bot`, AI-R2): komentarz bota-gracza żargonem MtG.
 */

export const LORE_COMMENT_LIMIT = 600;
export const PLAYER_COMMENT_LIMIT = 600;

/** Wspólne wyciąganie pól ctx (oba tryby komentują ten sam zapis). */
function baseCtx(ctx) {
  const c = ctx ?? {};
  return {
    bot: c.botLogName || 'Nieprzyjaciel',
    deck: c.deckTitle || c.deckKey || '(nieznana talia)',
    world: c.world || c.deckTitle || c.deckKey || '(nieznany świat)',
    turnNo: c.turnNumber ?? '?',
    history: c.turnText || '(brak zapisu)',
  };
}

/**
 * Tryb I: Nieprzyjaciel opowiada turę w realiach swojego świata.
 * AI-R2: (a) tożsamość wbita łopatą — „Nieprzyjaciel” w zapisie to ON,
 * (b) mniej poetyki i archaizmów, więcej twardych odniesień do lore świata.
 */
export function buildLorePrompt(ctx) {
  const { bot, deck, world, turnNo, history } = baseCtx(ctx);
  return [
    `TY jesteś ${bot} — przeciwnikiem Czarodziejki w pojedynku magów.`,
    `Grasz talią „${deck}” ze świata: ${world}.`,
    `W zapisie partii każde zdanie o ${bot} opisuje CIEBIE (twoje zagrania, twoje stwory, twoje rany) — nie trzeciego gracza. Czarodziejka to twoja przeciwniczka.`,
    '',
    'Poniżej pełny zapis partii (format „Tura N — Imię” + zdarzenia), od początku do końca aktualnej tury:',
    '',
    history,
    '',
    `Skomentuj OSTATNIĄ turę (nr ${turnNo}) jako ${bot}, w realiach świata ${world}.`,
    'Zasady:',
    '- mów w pierwszej osobie (to TY walczysz z Czarodziejką),',
    `- nawiązuj KONKRETNIE do lore świata ${world}: jego miejsc, frakcji, postaci, stworów i wydarzeń — mniej poetyki i archaizmów, więcej twardych odniesień do świata,`,
    '- opowiedz starcie jako historię o pojedynku z Czarodziejką,',
    `- NIE używaj wprost nazw kart Magic: The Gathering ani meta-nazw mechanik, zdolności i słów kluczowych (opisuj zdarzenia językiem świata: ${world}),`,
    `- krótko: do około ${LORE_COMMENT_LIMIT} znaków.`,
  ].join('\n');
}

/**
 * Tryb II (AI-R2): bot-gracz — współczesny, towarzyski gracz MtG.
 * Zna zasady, ma swoją talię, próbuje wygrać; komentuje zagrania OBU stron
 * z humorem, czasem złośliwie. Żargon MtG tu MILE WIDZIANY (to gracz!).
 */
export function buildPlayerPrompt(ctx) {
  const { bot, deck, turnNo, history } = baseCtx(ctx);
  return [
    `Grasz towarzysko w Magic: The Gathering. TY jesteś graczem-botem z talią „${deck}” — naprzeciwko siedzi Czarodziejka (człowiek).`,
    `W zapisie partii twoje zagrania to te podpisane „${bot}” — ${bot} przy stole to TY, nie trzeci gracz.`,
    '',
    'Poniżej pełny zapis partii (format „Tura N — Imię” + zdarzenia), od początku do końca aktualnej tury:',
    '',
    history,
    '',
    `Skomentuj OSTATNIĄ turę (nr ${turnNo}) jak współczesny gracz MtG przy stole: po swojemu, z humorem, czasem złośliwie.`,
    'Zasady:',
    '- mów w pierwszej osobie jako gracz („ja”, „moja talia”), o przeciwniczce mów „Czarodziejka” / „ona”,',
    '- żargon MtG jak najbardziej (topdeck, mana, removal, board, dobór, atak…) — to rozmowa graczy, nie baśń,',
    '- odnieś się KONKRETNIE do zagrań z ostatniej tury: kto co zagrał, co poszło nie tak, co ci grozi,',
    '- znasz zasady i próbujesz wygrać, ale jesteś kumplem przy stole, nie mentorem-pro,',
    `- krótko: do około ${PLAYER_COMMENT_LIMIT} znaków.`,
  ].join('\n');
}

/**
 * Dyspozytor trybów: `modeId` z konfiguracji → budowa promptu.
 * Nieznany tryb = bezpieczny default (lore).
 */
export function buildPromptForMode(modeId, ctx) {
  if (modeId === 'player-bot') return buildPlayerPrompt(ctx);
  return buildLorePrompt(ctx);
}
