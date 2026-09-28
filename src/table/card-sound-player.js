import { soundKeyForCard } from './spell-sounds.js';

/**
 * Numer kolekcji (artId) → opcjonalny plik. Nigdy slug/nazwa karty.
 * Pages: zachowujemy podkatalog projektu. Build w dist: paczka w korzeniu
 * repo, z drugim wariantem dla HTML-a i snd skopiowanych razem do dist.
 * HTMLAudioElement obsługuje też file: bez fetch(file:) blokowanego w Safari.
 */
export function cardSoundUrls(artId, baseUrl = '') {
  if (typeof artId !== 'number' && typeof artId !== 'string') return [];
  if (typeof artId === 'string' && !/^\d+$/.test(artId)) return [];
  const id = Number(artId);
  if (!Number.isSafeInteger(id) || id <= 0) return [];
  const path = `snd/${id}.mp3`;
  if (!baseUrl) return [path];
  try {
    const base = new URL(baseUrl);
    if (!['http:', 'https:', 'file:'].includes(base.protocol)) return [];
    const urls = [];
    if (/\/dist\/(?:[^/]*)$/.test(base.pathname)) urls.push(new URL(`../${path}`, base).href);
    urls.push(new URL(path, base).href);
    return [...new Set(urls)];
  } catch {
    return [];
  }
}

/**
 * Opcjonalna paczka MP3 nad dotychczasową syntezą. Bez DOM-u i sieci w core;
 * fabryka mediów i bazowy URL pochodzą ze strony (w testach: fake).
 * playCard nigdy nie odrzuca Promise. Wynik: played-file / wynik syntezy /
 * disabled / cancelled / no-card. Zakończone/nieaktualne odczyty nie grają.
 */
export function createCardSoundPlayer({ syntheticPlayer, createAudio, baseUrl = '', timeoutMs = 1500 } = {}) {
  if (!syntheticPlayer || typeof syntheticPlayer.play !== 'function') {
    throw new TypeError('Odtwarzacz kart wymaga odtwarzacza syntetycznego');
  }
  const limit = Number.isFinite(timeoutMs) ? Math.max(1, timeoutMs) : 1500;
  let generation = 0;
  let cancelCurrent = null;
  const current = (ticket) => ticket === generation && syntheticPlayer.enabled;
  const silence = (audio) => {
    try { audio.pause(); } catch { /* odłączone media */ }
    try { audio.removeAttribute('src'); audio.load(); } catch { /* brak API / już odłączone */ }
  };
  function stop() {
    generation++;
    const cancel = cancelCurrent;
    cancelCurrent = null;
    cancel?.();
  }

  function attempt(url, ticket, onPlaybackError) {
    return new Promise((resolve) => {
      let audio;
      try { audio = typeof createAudio === 'function' ? createAudio() : null; } catch { /* fallback */ }
      if (!audio || typeof audio.play !== 'function' || typeof audio.addEventListener !== 'function') {
        resolve('failed'); return;
      }
      let started = false;
      let disposed = false;
      let settled = false;
      let timer = null;
      const settle = (result) => { if (!settled) { settled = true; resolve(result); } };
      const release = () => {
        if (disposed) return;
        disposed = true;
        if (timer != null) clearTimeout(timer);
        audio.removeEventListener('error', onError);
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('playing', onPlaying);
        if (cancelCurrent === cancel) cancelCurrent = null;
      };
      const cancel = () => { release(); silence(audio); settle('cancelled'); };
      const fail = (reason) => {
        if (disposed) return;
        release(); silence(audio);
        if (started) onPlaybackError();
        else settle(reason);
      };
      const onError = () => fail('failed');
      const onEnded = () => { release(); settle('played-file'); };
      const onPlaying = () => {
        // play() może domknąć się długo po stop/OFF/zmianie karty.
        if (disposed || !current(ticket)) { silence(audio); settle('cancelled'); return; }
        if (started) return;
        started = true;
        if (timer != null) clearTimeout(timer);
        audio.removeEventListener('playing', onPlaying);
        settle('played-file');
      };
      cancelCurrent = cancel;
      audio.addEventListener('error', onError);
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('playing', onPlaying);
      timer = setTimeout(() => fail('timeout'), limit);
      try {
        audio.preload = 'auto';
        audio.src = url;
        // Wywołanie od razu, nie po fetch/HEAD: nie tracimy gestu użytkownika.
        const playing = audio.play();
        if (playing && typeof playing.then === 'function') {
          Promise.resolve(playing).then(onPlaying, (error) => {
            if (disposed) { silence(audio); return; }
            fail(error?.name === 'NotAllowedError' ? 'blocked' : 'failed');
          });
        }
        // Starsze media bez Promise potwierdzają start zdarzeniem playing.
      } catch (error) {
        fail(error?.name === 'NotAllowedError' ? 'blocked' : 'failed');
      }
    });
  }

  const player = {
    get enabled() { return syntheticPlayer.enabled; },
    setEnabled(value) {
      syntheticPlayer.setEnabled(value);
      if (!syntheticPlayer.enabled) stop();
    },
    resume() { return syntheticPlayer.resume(); },
    stop,
    play(key) { stop(); return syntheticPlayer.play(key); },
    async playCard(card) {
      if (!card) return 'no-card';
      if (!player.enabled) return 'disabled';
      stop();
      const ticket = generation;
      const key = soundKeyForCard(card);
      let usedFallback = false;
      const fallback = () => {
        if (!current(ticket)) return 'cancelled';
        if (usedFallback) return 'played';
        usedFallback = true;
        try { return syntheticPlayer.play(key); } catch { return 'no-audio'; }
      };
      try {
        for (const url of cardSoundUrls(card.artId, baseUrl)) {
          if (!current(ticket)) return 'cancelled';
          const result = await attempt(url, ticket, fallback);
          if (!current(ticket) || result === 'cancelled') return 'cancelled';
          if (result === 'played-file') return result;
          // Inna ścieżka nie naprawi blokady autoplay. Nie cache'ujemy jej
          // jako „brak pliku” — następny gest może umożliwić ten sam MP3.
          if (result === 'blocked') break;
        }
      } catch {
        // Brak możliwości odczytu ma ten sam bezpieczny fallback co 404.
      }
      return fallback();
    },
  };
  return player;
}
