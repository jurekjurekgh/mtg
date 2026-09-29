/**
 * AI-OpenRouter: tryby AI — budowa promptów.
 *
 * Moduł CZYSTY: same funkcje tekstowe, zero DOM-u/sieci/pamięci.
 * - `lore-bot`: komentarz Nieprzyjaciela w lore jego świata.
 * - `player-bot`: komentarz bota-gracza (AI-R4: zakaz slangu, zwięźle w punktach).
 * - `observer` (AI-R4): to samo okiem niezależnego obserwatora.
 * - `lore-observer` (AI-R4): lore okiem niezależnego obserwatora.
 * - `skit` (AI-R4): scenka dialogowa — brief właściciela + PRAWDZIWE światy
 *   obu talii (AI-R4b: Dominaria/Zendikar były tylko przykładem).
 */

export const LORE_COMMENT_LIMIT = 600;
export const PLAYER_COMMENT_LIMIT = 600;
export const OBSERVER_COMMENT_LIMIT = 600;
export const LORE_OBSERVER_COMMENT_LIMIT = 600;

/** Wspólne wyciąganie pól ctx (wszystkie tryby komentują ten sam zapis). */
function baseCtx(ctx) {
  const c = ctx ?? {};
  return {
    bot: c.botLogName || 'Nieprzyjaciel',
    deck: c.deckTitle || c.deckKey || '(nieznana talia)',
    world: c.world || c.deckTitle || c.deckKey || '(nieznany świat)',
    heroDeck: c.heroDeckTitle || c.heroDeckKey || '(nieznana talia)',
    heroWorld: c.heroWorld || c.heroDeckTitle || c.heroDeckKey || '(nieznany świat)',
    turnNo: c.turnNumber ?? '?',
    history: c.turnText || '(brak zapisu)',
  };
}

/**
 * Tryb I: Nieprzyjaciel opowiada turę w realiach swojego świata.
 * AI-R2: tożsamość (zapis o nim = o nim) + ton (konkrety, mało poetyki).
 */
export function buildLorePrompt(ctx) {
  const { bot, deck, world, heroDeck, heroWorld, turnNo, history } = baseCtx(ctx);
  return [
    `TY jesteś ${bot} — przeciwnikiem Czarodziejki w pojedynku magów.`,
    `Grasz talią „${deck}” ze świata: ${world}.`,
    // Zgłoszenie właściciela 2026-09-29 (AI-R8): prompt NIE niósł talii
    // Czarodziejki w żadnym trybie poza skitem (pola `heroDeck`/`heroWorld`
    // były liczone w baseCtx i przekazywane z main.js, ale nieużywane) —
    // model znał więc tylko talię bota i milczał o talii gracza.
    `Czarodziejka gra talią „${heroDeck}” — jej karty pochodzą ze świata: ${heroWorld}.`,
    `W zapisie partii każde zdanie o ${bot} opisuje CIEBIE (twoje zagrania, twoje stwory, twoje rany) — nie trzeciego gracza. Czarodziejka to twoja przeciwniczka.`,
    '',
    'Poniżej zapis partii (format „Tura N — Imię” + zdarzenia):',
    '',
    history,
    '',
    `Skomentuj OSTATNIĄ turę (nr ${turnNo}) jako ${bot}, w realiach świata ${world}.`,
    'Zasady:',
    '- mów w pierwszej osobie (to TY walczysz z Czarodziejką),',
    `- nawiązuj KONKRETNIE do lore świata ${world}: jego miejsc, frakcji, postaci, stworów i wydarzeń — mniej poetyki i archaizmów, więcej twardych odniesień do świata,`,
    '- opowiedz starcie jako historię o pojedynku z Czarodziejką,',
    `- swoje karty opisuj językiem świata ${world}, a karty Czarodziejki — językiem świata ${heroWorld} (dwa różne światy przy jednym stole),`,
    `- NIE używaj wprost nazw kart Magic: The Gathering ani meta-nazw mechanik, zdolności i słów kluczowych (opisuj zdarzenia językiem świata: ${world}),`,
    `- krótko: do około ${LORE_COMMENT_LIMIT} znaków.`,
  ].join('\n');
}

/**
 * Tryb II: bot-gracz — współczesny, towarzyski gracz MtG.
 * AI-R4: ZAKAZ slangu meta-graczowego + zwięźle, konkretnie, w punktach,
 * bez powtórzeń, z własnymi odczuciami i wrażeniami.
 */
export function buildPlayerPrompt(ctx) {
  const { bot, deck, heroDeck, turnNo, history } = baseCtx(ctx);
  return [
    `Grasz towarzysko w Magic: The Gathering. TY jesteś graczem-botem z talią „${deck}” — naprzeciwko siedzi Czarodziejka (człowiek) z talią „${heroDeck}”.`,
    `W zapisie partii twoje zagrania to te podpisane „${bot}” — ${bot} przy stole to TY, nie trzeci gracz.`,
    '',
    'Poniżej zapis partii (format „Tura N — Imię” + zdarzenia):',
    '',
    history,
    '',
    `Skomentuj OSTATNIĄ turę (nr ${turnNo}) jak współczesny gracz MtG przy stole: po swojemu, z humorem, czasem złośliwie.`,
    'Zasady:',
    '- mów w pierwszej osobie jako gracz („ja”, „moja talia”), o przeciwniczce mów „Czarodziejka” / „ona”,',
    '- ZAKAZ slangu meta-graczowego, zwłaszcza angielskiego (żadnych: deckout, missplay, removal, topdeck, board… — mów po polsku, zwykłymi słowami),',
    '- zwięźle, konkretnie, w punktach, bez powtórzeń,',
    '- odnieś się KONKRETNIE do zagrań z ostatniej tury: kto co zagrał, co poszło nie tak, co ci grozi,',
    '- dodawaj swoje odczucia i wrażenia,',
    '- znasz zasady i próbujesz wygrać, ale jesteś kumplem przy stole, nie mentorem-pro,',
    `- krótko: do około ${PLAYER_COMMENT_LIMIT} znaków.`,
  ].join('\n');
}

/**
 * Tryb III (AI-R4): niezależny obserwator partii — to samo co bot-gracz,
 * ale z boku stołu, w trzeciej osobie. Te same reguły: zakaz slangu,
 * punkty, konkrety, odczucia.
 */
export function buildObserverPrompt(ctx) {
  const { bot, deck, heroDeck, turnNo, history } = baseCtx(ctx);
  return [
    `Jesteś niezależnym obserwatorem towarzyskiej partii Magic: The Gathering. Przy stole: Czarodziejka (człowiek, talia „${heroDeck}”) i gracz-bot z talią „${deck}”.`,
    `W zapisie partii zagrania bota podpisane są „${bot}”.`,
    '',
    'Poniżej zapis partii (format „Tura N — Imię” + zdarzenia):',
    '',
    history,
    '',
    `Skomentuj OSTATNIĄ turę (nr ${turnNo}) jako obserwator: z boku, z humorem, czasem złośliwie.`,
    'Zasady:',
    `- mów w trzeciej osobie („Czarodziejka”, „bot” / „${bot}”),`,
    '- ZAKAZ slangu meta-graczowego, zwłaszcza angielskiego (żadnych: deckout, missplay, removal, topdeck, board… — mów po polsku, zwykłymi słowami),',
    '- zwięźle, konkretnie, w punktach, bez powtórzeń,',
    '- odnieś się KONKRETNIE do zagrań z ostatniej tury: kto co zagrał, co poszło nie tak, komu grozi porażka,',
    '- dodawaj swoje odczucia i wrażenia z przebiegu starcia,',
    `- krótko: do około ${OBSERVER_COMMENT_LIMIT} znaków.`,
  ].join('\n');
}

/**
 * Tryb IV (AI-R4): lore okiem niezależnego obserwatora — te same reguły
 * klimatyczne co lore-bot, ale narracja trzecioosobowa, z boku pojedynku.
 */
export function buildLoreObserverPrompt(ctx) {
  const { bot, deck, world, heroDeck, heroWorld, turnNo, history } = baseCtx(ctx);
  return [
    `Jesteś niezależnym obserwatorem pojedynku magów: Czarodziejka (talia „${heroDeck}” ze świata: ${heroWorld}) mierzy się z ${bot} (talia „${deck}” ze świata: ${world}).`,
    `W zapisie partii zdania o ${bot} opisują jednego z pojedynkujących — twojego obserwowanego, nie trzeciego gracza.`,
    '',
    'Poniżej zapis partii (format „Tura N — Imię” + zdarzenia):',
    '',
    history,
    '',
    `Skomentuj OSTATNIĄ turę (nr ${turnNo}) jako obserwator, w realiach świata ${world}.`,
    'Zasady:',
    '- mów w trzeciej osobie (opisujesz oboje pojedynkujących z boku),',
    `- nawiązuj KONKRETNIE do lore świata ${world}: jego miejsc, frakcji, postaci, stworów i wydarzeń — mniej poetyki i archaizmów, więcej twardych odniesień do świata,`,
    '- opowiedz starcie jako historię o pojedynku Czarodziejki z Nieprzyjacielem,',
    `- NIE używaj wprost nazw kart Magic: The Gathering ani meta-nazw mechanik, zdolności i słów kluczowych (opisuj zdarzenia językiem świata: ${world}),`,
    `- krótko: do około ${LORE_OBSERVER_COMMENT_LIMIT} znaków.`,
  ].join('\n');
}

/**
 * Tryb V (AI-R4): SKIT — scenka dialogowa postaci z kart.
 * Brief DOSŁOWNY od właściciela; AI-R4b: światy w sekcji UWAGA to
 * PRAWDZIWE światy obu talii z partii (nie przykładowe Dominaria/Zendikar).
 */
function skitBrief({ heroWorld, enemyWorld }) {
  return [
    'Jesteś pisarzem literatury fantasy, który na podstawie rozgrywki prowadzonej kartami Magic: the Gathering ma tworzyć ciekawe, mądre, śmieszne, zajmujące fragmenty prozy typu SKIT (podobne do tych z serii gier Tales of…).',
    'Na podstawie logu z rozgrywki W OSTATNIEJ TURZE tury masz wyodrębnić postaci biorące udział i tworzyć interakcje, dialogi między nimi.',
    'Bohaterowie i wątki poruszane w SKITACH mogą powracać w kolejnych skitach jeśli log to uzasadnia.',
    'Każdy fabularny SKIT powinien być poprzedzony nagłówkiem:',
    '',
    '**SKIT: -tytuł-**.',
    '',
    'Tytuł nadajesz sam na podstawie treści SKITA.',
    'Fragment pod nagłówkiem musi być w 100% in-lore światów, z którego pochodzą zagrywane karty.',
    'UWAGA:',
    `Czarodziejka i wszystkie jej karty (czary, kreatury, postaci) pochodzą ze świata ${heroWorld}.`,
    `Nieprzyjaciel i wszystkie jego karty (czary, kreatury, postaci) pochodzą ze świata ${enemyWorld}.`,
    '',
    'Używaj w SKITach postaci z karty wystawionych na stole po obu stronach bitwy, ale NIE używaj nazw użytych kart MtG - postacie nazywaj/opisuj zgodnie z lore świata z którego pochodzą. Wyjątkiem są postaci graczy, których zawsze nazywaj Czarodziejką i Nieprzyjacielem.',
    'SKIT: Czysty dialog postaci obecnych aktualnie w grze (najlepiej między postaciami powołanymi z kart, ale jeśli nie ma innej możliwości także między graczami). Nie używaj w nich meta-języka gry np. statystyk, nazw zdolności, counterów, tokenów itp. Skupiasz się na lore i relacjach!',
    'Skity mają być naturalną rozmową. Mogą dotyczyć przeszłości, filozofii lub drobnych obserwacji, byle były zgodne z charakterem postaci.',
    'Możliwe tematy to ich wzajemne relacje, filozofia, ich podejście do dowolnych tematów, obserwacje dotyczące okolicy, stan fizyczny, psychiczny, także przemyślenia, odniesienia do ich lore np. zwyczaje wyniesione z ich świata, jedzenie, spędzanie wolnego czasu, hobby, zainteresowania, pasje itp. itd.',
    'Rozmowa może dotyczyć tematów codziennego życia, pracy, problemów świata postaci, ich najskrytszych pragnień, kompleksów, traum, ale także tego z czego bywają np. dumne czy co je bawi.',
    'Rozmowa jest w 100% in-character w 100% oparta o lore ich świata, ich przekonaniach, pasjach.',
    'W skicie oczywiście uwzględniaj stosunek postaci do siebie, historię ich znajomości - ale wszystko in-character i z AKCENTEM na postrzeganie rzeczywistości przez lore swojego świata.',
    'WAŻNE! Bezwzględnie wymyślaj zróżnicowane tematy SKITów, bądź oryginalny. Każdy SKIT ma być inny i na inny temat.',
    'Maksymalna długość sekcji SKIT to 250 słów.',
    '',
    'Przykład sekcji SKIT:',
    '',
    '**SKIT: RDZA I SĘPY**',
    '',
    '**Uczestnicy:** Garrek Żelaznoręki, Korveth-7, Corwin Wrończyk',
    '',
    '**Garrek:** [Opiera ciężki młot o ziemię, z trudem łapiąc oddech. Rdzawa krew miesza się ze smarem na jego brodzie. Łypie mrocznie na kruka siedzącego na ramieniu szeptacza] Zdejmij ze mnie te ptasie ślepia, poeto. Jeszcze nie jestem kupą złomu. Ta blacha przetrwała ostrzał artyleryjski u braciaków, więc przetrwa też to cholerne błoto.',
    '',
    '**Corwin:** [Siedzi w cieniu, spokojnie gładząc pióra Szepty. Jego bury płaszcz zlewa się z mrokiem bagien] Krew przyspiesza rdzewienie żelaza, rzeźniku. Wycieka z ciebie olej i życie w równych proporcjach. Moje wrony mają doskonały słuch. Słyszą, jak zębatki w twoim ciele powoli zgrzytają do zatrzymania.',
    '',
    '**Korveth-7:** [Przesuwa się ciężko, stając tak, by jego miedziane ramiona częściowo osłaniały Garreka. Soczewka na jego twarzy migocze słabym, gasnącym światłem] Diagnostyka wskazuje na krytyczne uszkodzenia strukturalne. Jednak funkcjonalność operacyjna zostaje zachowana. Maszyna nie zatrzymuje się, dopóki kryształ nie ulegnie całkowitej dezintegracji. Utrzymamy ten perymetr.',
    '',
    '**Garrek:** [Wybucha chrapliwym kaszlem, wypluwając ciemną ślinę w mech, po czym uśmiecha się krzywo do miedzianego konstrukta] Słyszysz to, ptasiarzu? Ja i ta puszka jedziemy na samych oparach i czystej złośliwości. Ty czekasz, aż ktoś ci rzuci darmowy ochłap prawdy do tego twojego notesiku, a my po prostu odmawiamy zdechnięcia.',
    '',
    '**Corwin:** Nikt z nas nie wybiera momentu, rzeźniku. Ja tylko dbam o to, by to, kim byliście, nie przepadło, gdy upadniecie twarzą w błoto.',
    '',
    '**Garrek:** [Uderza obuchem młota w dłoń, aż w zbroi zadudnią nity] Jeśli szukasz moich ostatnich słów, to możesz je sobie zapisać już teraz: "Nie zdejmiecie mi tych butów". A teraz trzymaj się z dala, zanim przerobię cię na mielonkę razem z twoim latającym inwentarzem.',
  ].join('\n');
}

export function buildSkitPrompt(ctx) {
  const { bot, deck, world, heroDeck, heroWorld, turnNo, history } = baseCtx(ctx);
  return [
    skitBrief({ heroWorld, enemyWorld: world }),
    '',
    '---',
    '',
    `Twoja rozgrywka: Czarodziejka (talia „${heroDeck}”) kontra ${bot} (talia „${deck}”). Komentowana tura: OSTATNIA (nr ${turnNo}).`,
    'Log rozgrywki (format „Tura N — Imię” + zdarzenia):',
    '',
    history,
  ].join('\n');
}

/**
 * Dyspozytor trybów: `modeId` z konfiguracji → budowa promptu.
 * Nieznany tryb = bezpieczny default (lore).
 */
export function buildPromptForMode(modeId, ctx) {
  if (modeId === 'player-bot') return buildPlayerPrompt(ctx);
  if (modeId === 'observer') return buildObserverPrompt(ctx);
  if (modeId === 'lore-observer') return buildLoreObserverPrompt(ctx);
  if (modeId === 'skit') return buildSkitPrompt(ctx);
  return buildLorePrompt(ctx);
}

/**
 * AI-R7 (ciągłość czatu, zlecenie właściciela 2026-09-27): zapytanie jako
 * PRAWDZIWA rozmowa `messages[]` (user/assistant na zmianę), nie jeden
 * prompt. Każda wiadomość usera niesie zapis JEDNEJ tury, a po niej —
 * odpowiedź modelu z tej tury (gdy jest). Dzięki temu model „pamięta”,
 * co wcześniej odpowiadał, i trzyma spójność interpretacyjną.
 *
 * Kształt: user(pełny brief trybu + tura 1), assistant(odp 1),
 * user(krótko: tura 2), assistant(odp 2), …, user(tura N, bez odpowiedzi).
 * Brief i zasady padają RAZ (pierwsza wiadomość) — kolejne user-maszyny
 * to sam materiał z poleceniem w tym samym stylu (pełny brief co turę
 * mnożyłby tokeny i mieszał role). Puste tury wypadają (numeracja po
 * `number`, nie po pozycji). Bieżąca tura (ostatnia) nigdy nie ma
 * odpowiedzi — to ona czeka na komentarz.
 *
 * @param {Array<{number:number,text:string}>} turns — wycinki tur 1..N.
 * @param {Object<number,string>} replies — odpowiedź modelu per tura.
 * @param {Object} ctx — reszta kontekstu trybu (talie/światy).
 */
export function buildChatMessagesForMode(modeId, { turns = [], replies = {}, ...ctx } = {}) {
  const nonEmpty = (turns ?? []).filter((t) => t && String(t.text ?? '').trim());
  if (nonEmpty.length === 0) {
    return [{
      role: 'user',
      content: buildPromptForMode(modeId, { ...ctx, turnNumber: ctx.turnNumber ?? '?', turnText: '(brak zapisu)' }),
    }];
  }
  const followUp = modeId === 'skit'
    ? 'Kolejna tura — kolejny SKIT w tym samym stylu i z tymi samymi zasadami.'
    : 'Kolejna tura — skomentuj ją w tym samym stylu i według tych samych zasad.';
  const messages = [];
  nonEmpty.forEach((t, i) => {
    const content = i === 0
      ? buildPromptForMode(modeId, { ...ctx, turnNumber: t.number, turnText: t.text })
      : [followUp, '', `Tura ${t.number}:`, '', t.text].join('\n');
    messages.push({ role: 'user', content });
    const reply = replies?.[t.number];
    if (typeof reply === 'string' && reply.trim()) messages.push({ role: 'assistant', content: reply });
  });
  return messages;
}
