# Opcjonalne dźwięki kart — `snd/`

Stół po włączeniu dźwięków w belce próbuje najpierw zagrać **MP3 przypisany
numerem karty w kolekcji** (`artId`), np. `snd/12.mp3` albo `snd/422.mp3`.
To nie jest slug karty ani numer kolekcjonerski z druku Scryfall — to numer
z arkusza kolekcji właściciela (ten sam, którego używa tryb ilustracji
`./img/<artId>FOT.png`; zob. [ILUSTRACJE_KART.md](ILUSTRACJE_KART.md)).

Kod: [`src/table/card-sound-player.js`](../../src/table/card-sound-player.js),
testy: [`test/card-sound-mp3.test.js`](../../test/card-sound-mp3.test.js).

## Zachowanie

- Jeśli pliku nie ma, nie da się go odczytać/odtworzyć albo ładowanie przekroczy
  limit, gra dotychczasowy dźwięk syntetyczny **typu i koloru** karty.
- Nie są odtwarzane oba dźwięki naraz.
- Wyłączenie dźwięku, zamknięcie warstwy ilustracji, nowa partia lub następny
  rzut przerywa odczyt/odtwarzanie poprzedniego MP3.
- Dźwięki są domyślnie **OFF**; włącza się je gestem w belce (polityka autoplay
  przeglądarki może wymagać interakcji użytkownika).
- Ukryty rzut przeciwnika pozostaje bez dźwięku ujawniającego kartę.
- Odtwarzacz mediów obsługuje lokalne pliki bez polegania na `fetch(file:)`;
  konkretne ograniczenia dostępu do plików na iPadzie zależą od sposobu
  otwarcia HTML-a przez system/przeglądarkę.

## Układ lokalny

Także przy otwarciu jako `file:` na urządzeniu:

```text
kolekcja/
  mtg-table.html
  snd/
    12.mp3
    422.mp3
```

Jeżeli otwierasz wynik w `repo/dist/mtg-table.html`, szukamy najpierw
`repo/snd/N.mp3`, a potem `repo/dist/snd/N.mp3`. Dla strony na Pages ścieżka
zostaje w jej podkatalogu: `/mtg/snd/12.mp3`, nie `/snd/12.mp3`.

| Otoczenie | Kolejność prób |
|---|---|
| `dist/mtg-table.html` (build) | `../snd/N.mp3`, `snd/N.mp3`, potem absolutne |
| `file:///…/kolekcja/mtg-table.html` | `snd/N.mp3` (obok dokumentu) |
| GitHub Pages | `/mtg/snd/N.mp3` — ścieżka względna w podkatalogu strony |

## Czego NIE trzeba robić

Paczka jest **opcjonalna i ignorowana przez Git** (`snd/` w `.gitignore`);
build nie osadza MP3 w HTML ani nie wysyła ich na Pages. Bez paczki
(np. obecne Pages) działa synteza. Nie trzeba tworzyć manifestu dostępnych
plików ani dopisywać kart w kodzie — wystarczy wrzucić plik o właściwym numerze.
