/**
 * MTG Table — AI log do Dokumentu Google (OpenRouter, AI-R5).
 *
 * CO TO ROBI: odbiera POST-y z aplikacji (komentarze AI po turach)
 * i dopisuje je NA KOŃCU karty o nazwie trybu (`lore-bot`, `player-bot`,
 * `observer`, `lore-observer`, `skit`, `talkshow`, `zly-i-dobry`). Każdy wpis: linia metadanych
 * (tura, model, długość, czas, partia) + treść komentarza + rozdzielnik.
 * Pierwszy zapis gameId W DANEJ KARCIE dokumentu poprzedza nagłówek:
 * podział strony + H1 „⚔️ Nowa partia: X vs Y” (łatwe szukanie początków).
 *
 * KARTY ZAKŁADASZ RĘCZNIE (raz, 2 minuty): ani Apps Script, ani Docs API
 * nie potrafią tworzyć kart programowo — skrypt tylko je znajduje po
 * tytule i dopisuje. Gdy karty dla trybu nie ma, wpis ląduje w pierwszej
 * karcie z nagłówkiem ostrzeżenia (nic nie ginie) — załóż kartę, a kolejne
 * wpisy pójdą już do niej.
 *
 * WDROŻENIE (pełna instrukcja: `docs/ai-appscript/INSTRUKCJA.md`):
 * 1. Nowy Dokument Google (np. „MTG AI log”), skopiuj jego ID z adresu
 *    (fragment między `/document/d/` a `/edit`) i wklej niżej do DOC_ID.
 * 2. W dokumencie utwórz 7 kart o DOKŁADNIE takich tytułach:
 *    `lore-bot`, `player-bot`, `observer`, `lore-observer`, `skit`,
 *    `talkshow`, `zly-i-dobry`.
 * 3. Rozszerzenia → Aplikacje Apps Script → wklej TEN plik → zapisz.
 * 4. Wdróż → Nowe wdrożenie → „Aplikacja internetowa”, „Uruchom jako: Ja”,
 *    „Dostęp: Każdy” → skopiuj URL (`…/exec`).
 * 5. URL wklej w aplikacji: „Konfiguracja AI” → „AppScript URL”.
 * 6. Test: włącz AI, dograj turę — wpis ląduje na końcu karty trybu.
 */

// ⬇️⬇️⬇️ WSTAW TU ID SWOJEGO DOKUMENTU (krok 1) ⬇️⬇️⬇️
const DOC_ID = 'WSTAW-ID-DOKUMENTU';

/** Nazwa karty = tryb; czyścimy i przycinamy dla bezpieczeństwa. */
function tabNameFor(mode) {
  const clean = String(mode || 'lore-bot').replace(/[\\/?*[\]:]/g, '-').trim().slice(0, 60);
  return clean || 'lore-bot';
}

/** Karta o danym tytule, także zagnieżdżona, albo null. */
function findTabByTitle(doc, title) {
  function find(tabs) {
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      if (tab.getTitle() === title) return tab;
      const nested = typeof tab.getChildTabs === 'function' ? find(tab.getChildTabs()) : null;
      if (nested) return nested;
    }
    return null;
  }
  return find(doc.getTabs());
}

/**
 * Dokument jest źródłem prawdy, nie ulotny stan przeglądarki ani flaga tury.
 * Meta istniejących wpisów zawiera gameId; porównujemy całe zakończenie linii,
 * bez regexu z danych klienta. Działa przy retry, odświeżeniu i przeplataniu
 * partii. Lock obejmuje sprawdzenie ORAZ zapis, osobno dla wybranej karty.
 */
function startsGameSection(body, p) {
  const gameId = String(p.gameId ?? '');
  if (!gameId) return p.newGame === true || Number(p.turn) === 1; // starsze klienty bez ID
  const suffix = ' · partia ' + gameId + ' ──';
  return !String(body.getText()).split(/\r?\n/).some(function (line) {
    return line.indexOf('── Tura ') === 0 && line.endsWith(suffix);
  });
}

/**
 * Nagłówek NOWEJ partii (zlecenie właściciela — łatwe szukanie początków
 * partii): podział strony (nowa strona) + nagłówek H1 z matchupem.
 * Wołane dla pierwszego zapisu gameId w tej karcie dokumentu. Nawet stary
 * klient z newGame:false nie gubi nagłówka. Na pustej karcie podziału nie stawiamy (pusta
 * pierwsza strona byłaby śmieciem).
 */
function appendGameHeader(body, p) {
  var decks = String((p && p.decks) || '').trim() || 'talie nieznane';
  try {
    var empty = body.getText ? String(body.getText()).trim() === '' : false;
    if (!empty) body.appendPageBreak();
  } catch (e) {
    body.appendPageBreak();
  }
  body.appendParagraph('⚔️ Nowa partia: ' + decks)
    .setHeading(DocumentApp.ParagraphHeading.HEADING1);
}

/** Dopisuje wpis na końcu ciała karty: meta + akapity + rozdzielnik. */
function appendEntry(body, p) {
  const meta = '── Tura ' + Number(p.turn ?? 0)
    + ' · ' + String(p.model ?? '')
    + ' · ' + Number(p.chars ?? 0) + ' zn.'
    + ' · ' + String(p.tsClient ?? '')
    + ' · partia ' + String(p.gameId ?? '') + ' ──';
  body.appendParagraph(meta).setHeading(DocumentApp.ParagraphHeading.NORMAL);
  const chunks = String(p.response ?? '').split(/\r?\n\r?\n/);
  for (let i = 0; i < chunks.length; i++) {
    const text = chunks[i].trim();
    if (text) body.appendParagraph(text).setHeading(DocumentApp.ParagraphHeading.NORMAL);
  }
  body.appendHorizontalRule();
}

function doPost(e) {
  let doc = null;
  try {
    const p = JSON.parse(e.postData.contents);
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      doc = DocumentApp.openById(DOC_ID);
      const name = tabNameFor(p.mode);
      const tab = findTabByTitle(doc, name);
      let body;
      let warning = null;
      if (tab) {
        body = tab.asDocumentTab().getBody();
      } else {
        // Fallback: brak karty = pierwsza karta + nagłówek (nic nie ginie).
        const tabs = doc.getTabs();
        const first = tabs.length > 0 ? tabs[0].asDocumentTab().getBody() : doc.getBody();
        body = first;
        warning = '⚠️ Brak karty „' + name + '” — wpis dopisany tutaj';
      }
      if (startsGameSection(body, p)) appendGameHeader(body, p);
      if (warning) body.appendParagraph(warning).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      appendEntry(body, p);
    } finally {
      try { if (doc) doc.saveAndClose(); } catch (e2) { /* zamknięcie best-effort */ }
      lock.releaseLock();
    }
  } catch (err) {
    Logger.log('[mtg-ai] doPost nieudany: ' + err);
  }
  return ContentService.createTextOutput('ok');
}
