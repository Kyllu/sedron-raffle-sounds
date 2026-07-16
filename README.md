# Sedron Raffle — Sound Overlay 🔊

Nakładka do przeglądarki dodająca **dźwięk podczas losowań** na [raffle.sedron.pl](https://raffle.sedron.pl/):

- **dźwięk napięcia** (np. werbel) grający w trakcie losowania,
- **fanfara / „ta‑da"** dokładnie w momencie pokazania zwycięzcy,
- działa zarówno dla **koła fortuny**, jak i **losowania z listy**,
- dźwięki do wyboru z **wbudowanej biblioteki** lub **wgraj własny plik**.

Nie wymaga dostępu do kodu strony — wszystko dzieje się lokalnie w Twojej przeglądarce.

---

## Instalacja

1. Zainstaluj rozszerzenie **Tampermonkey** (Chrome / Edge / Brave / Firefox) z oficjalnego sklepu przeglądarki.
2. Otwórz plik `sedron-raffle-sounds.user.js` — najprościej: przeciągnij go na kartę przeglądarki, albo w panelu Tampermonkey wybierz **Utwórz nowy skrypt**, wklej całą zawartość pliku i zapisz (Ctrl+S).
3. Wejdź na `https://raffle.sedron.pl/`. W prawym dolnym rogu pojawi się przycisk **🔊** — to nakładka.

## Obsługa

1. Kliknij **🔊**, aby otworzyć panel.
2. Ustaw dwa dźwięki:
   - **Napięcie** (podczas losowania) — z biblioteki (Werbel / **Bębny (epicki)** / Tykanie / Narastanie) albo **Wgraj własny plik**,
   - **Zwycięzca** (fanfara) — z biblioteki (Ta‑da / Fanfara / Airhorn / Moneta) albo własny plik.
3. Dla każdego: suwak **głośności**, przełącznik **on/off** i przycisk **Test** (napięcie zapętla — kliknij ponownie, by zatrzymać).
4. **Dotyczy: Koło / Lista** — możesz włączyć dźwięk tylko dla wybranej formy losowania.
5. Ustawienia zapisują się automatycznie (przeżywają odświeżenie strony).

Wbudowane dźwięki są **generowane** przez przeglądarkę (Web Audio) — nie ma plików ani problemów licencyjnych. Własne pliki (MP3/OGG/WAV, do 2 MB) wgrywasz sam.

### Gotowe dźwięki z internetu (za darmo, legalnie)

Chcesz „prawdziwy" nagrany dźwięk (np. orkiestrowy werbel, teleturniejowe napięcie)? Ściągnij CC0/darmowy klip i wgraj go w panelu (**Wgraj własny plik**):

- **Pixabay** — `pixabay.com/sound-effects/` — darmowe, bez podpisów. Szukaj: `drum roll`, `suspense`, `tension`, `game show`, `riser`.
- **Mixkit** — `mixkit.co/free-sound-effects/` — darmowe (licencja Mixkit). Podobne hasła.
- **Freesound** — `freesound.org` — ustaw filtr licencji na **CC0**.

Wskazówki: bierz krótki klip (kilka–kilkanaście sekund), format **MP3**, do 2 MB. Dźwięk napięcia najlepiej brzmi, gdy da się go **zapętlić** (np. „drum roll loop"), bo gra tak długo, jak trwa losowanie.

## OBS — ważne ⚠️

Nakładka **nie zadziała** jako „Browser Source" w OBS (OBS nie ładuje rozszerzeń). Dlatego:

1. Uruchamiaj losowanie w **zwykłej karcie przeglądarki** (tej z Tampermonkey).
2. W OBS przechwyć ją: **Window Capture** (obraz) + **Application Audio Capture** (dźwięk, Windows 10 2004+/11) wskazując proces przeglądarki — albo **Desktop Audio**.
3. Zrób próbne losowanie i sprawdź poziomy na mikserze OBS.

## Ograniczenia

- **Kręcenie z komendy czatu** (`!spin`): przeglądarka może zablokować dźwięk, dopóki raz nie klikniesz strony / nie otworzysz panelu w danej sesji. To zabezpieczenie przeglądarki (autoplay), nie błąd — wystarczy kliknąć stronę raz na starcie.
- Jeśli używasz „trybu" strony, który sam gra muzykę na kole — wyłącz **Napięcie → Koło**, żeby dźwięki się nie nakładały.
- Nakładka rozpoznaje losowanie po elementach strony; przy większej przebudowie `raffle.sedron.pl` skrypt może wymagać aktualizacji.

## Pomysły na później (v2)

- Większa biblioteka dźwięków, tryb ciemny/jasny panelu, skróty klawiszowe.
- Auto‑aktualizacja przez `@updateURL`/`@downloadURL` (wymaga hostowania pliku, np. na GitHub/GreasyFork) — ułatwia dzielenie się z innymi streamerami.
- Wersja jako pełne rozszerzenie (sklep Chrome) dla instalacji jednym kliknięciem.
