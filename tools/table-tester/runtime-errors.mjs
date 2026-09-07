/**
 * M348/F10: wyjątki skryptów i odrzucone Promise nie są normalnym odrzuceniem
 * komendy przez engine. Rejestrujemy je od beforeParse, także podczas startu
 * artefaktu. Nie wyciszamy domyślnego raportowania przeglądarki/jsdom.
 */
export function observeRuntimeErrors(window, records) {
  const messageOf = (value) => String(value?.message ?? value ?? 'Nieznany błąd JavaScript');
  window.addEventListener('error', (event) => {
    records.push({
      type: 'error',
      message: messageOf(event.error ?? event.message),
      source: event.filename ?? null,
      line: event.lineno ?? null,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    records.push({ type: 'unhandledrejection', message: messageOf(event.reason) });
  });
}
