# 📺 Kijkdoos — IPTV voor Android, Windows en web

Gratis films, series en live tv op één plek, plus je eigen IPTV-abonnementen.
Alleen streams die echt werken worden getoond; de rest blijft verborgen (aan te zetten via ⚙).

**Downloads (Android .apk / Windows .exe):** [Releases → latest](https://github.com/Darude91/Regtur/releases/latest)

## Wat zit erin
- **Films** en **Series** (en **Live TV** zodra er zenders zijn), Netflix-achtige rijen met thumbnails
- **Gratis bronnen:**
  - Internet Archive — duizenden rechtenvrije speelfilms, tv-series en tekenfilms (on demand)
  - iptv-org — openbaar beschikbare film-, serie-, klassieke en animatiekanalen + Nederlandse zenders
- **Abonnementen:** Xtream Codes (server + gebruikersnaam + wachtwoord) of een M3U-link.
  Films, series (met seizoenen/afleveringen) en zenders worden automatisch ingedeeld.
  Een verlopen of niet-werkend abonnement toont niets.
- **Beschikbaarheidscheck:** elke stream wordt op de achtergrond getest; resultaten worden 6 uur onthouden.
- Zoeken, detailpagina's, automatisch volgende aflevering, "Kopieer link" voor VLC.

## Installeren
| Platform | Hoe |
|---|---|
| Android | Download `Kijkdoos.apk` uit Releases en installeer (onbekende bronnen toestaan) |
| Windows | `Kijkdoos-Setup-x.exe` of de portable `.exe` uit Releases |
| Beide (lichtgewicht) | Open de web-versie in Chrome/Edge → *Installeren* / *Toevoegen aan startscherm* |

De Android- en Windows-app hebben geen browserbeperkingen (CORS, http-streams) en tonen dus meer zenders dan de web-versie.

## Web-versie met proxy (optioneel)
Veel IPTV-servers blokkeren browsers. Draai `python3 proxy.py` (bijv. op een Raspberry Pi) en
open `http://<pi-ip>:8090/`, of vul `http://<pi-ip>:8090/proxy?url=` in bij ⚙ → CORS-proxy.

## Zelf bouwen
Elke push naar `main` bouwt via GitHub Actions automatisch de web-versie (Pages), de APK en de EXE.
Lokaal: `npm install && npm start` (Windows-app) of `npx cap add android && npx cap sync && npx cap open android`.

> Kijkdoos levert zelf geen content; het speelt openbare gratis streams en jouw eigen abonnementen af.


## Externe spelers & volgende aflevering
Kies bij ⚙ een externe speler (Windows: VLC, mpv, MPC-HC, PotPlayer…; Android: VLC, mpv, MX Player, Just Player, Kodi…).
Start je een aflevering vanuit een serie, dan gaat de speler automatisch door met de volgende:
- **Windows (VLC/mpv/…):** Kijkdoos geeft een afspeellijst met de gekozen en alle volgende afleveringen mee.
- **Android:** MX Player krijgt de hele lijst; bij VLC, mpv en Just Player start Kijkdoos de volgende aflevering zodra de speler meldt dat de vorige uit is. Geeft een speler dat niet door, dan vraagt Kijkdoos of de volgende mag starten.

## Live TV zappen & afstandsbediening (Android TV)
Start een zender uit een groep, dan zit de hele groep in een zapper:
- **▲ / ▼** (of kanaal +/−, PageUp/PageDown): volgende / vorige zender · **cijfertoetsen**: direct naar zendernummer
- **OK**: zenderlijst openen (kies met ▲ ▼, OK om te schakelen, Terug om te sluiten)
- Zenders die niet werken worden overgeslagen
- Externe speler (Windows): de hele groep gaat als afspeellijst mee; zap met "volgende/vorige" in VLC/mpv
- Menu's en instellingen zijn volledig met de pijltjes en OK te bedienen; TV-modus staat aan op Android TV (⚙ → TV-modus)

## Series per genre
Series staan zowel per categorie van je aanbieder als in genre-rijen (Drama, Romantiek, Thrillers, Misdaad, Actie, …), gebaseerd op de genre-gegevens die de aanbieder per serie meegeeft. Een genre-rij verschijnt vanaf 8 series.

## Categorieën-menu
Bovenin staat naast de taalknop een **☰ Categorieën**-menu: alle categorieën en genres van het huidige tabblad (Films / Series / Live TV), met zoekveld. Kies er één om hem als raster te openen. Genre-rijen staan op Series nu tussen de aanbiedercategorieën verspreid, net als bij Films.

## Laatst gekeken
Het tabblad **Laatst gekeken** toont per soort (films, series, zenders) wat je het laatst hebt afgespeeld (max. 60, alleen op dit apparaat bewaard). Klik een kaart om opnieuw te openen/af te spelen.

## Instellingen/menu's met de afstandsbediening
Zodra een scherm (instellingen, detail, raster, menu) open is, wordt de achtergrond vergrendeld en gaat de focus naar binnen; pijltjes werken dan altijd, ook als TV-modus niet automatisch herkend is. Zet anders in ⚙ "TV-modus" op **Aan**.

## Hervatten & ondertitels
- **Ingebouwde speler:** onthoudt per film/aflevering waar je gebleven bent (ook na een dag of herstart) en springt daar zelf naar toe. Knoppen tonen "⏵ Hervatten (12:34)" en "Van begin af"; afleveringen tonen hun hervat-tijd. Uitgekeken (laatste ~3%) telt als klaar.
- **Externe speler Android:** Kijkdoos geeft de opgeslagen positie mee (MX Player, VLC, Just Player, mpv) en bewaart wat de speler bij stoppen terugmeldt.
- **Externe speler Windows:** mpv start met `--save-position-on-quit`, VLC met `--qt-continue=2` (zelf hervatten).
- **Ondertitels:** ingebouwde speler zet Nederlands aan, anders Engels (niet als de titel al Nederlands gesproken is). mpv krijgt `--slang=nl,nld,dut,en,eng`, VLC `--sub-language=nl,en`. Op Android bepaalt de externe speler zelf: stel daar in MX/VLC/mpv de voorkeurstaal ondertitels in op Nederlands, dan Engels.

## Ondertitels via OpenSubtitles
Er zit een standaard-API-sleutel in de app; een eigen sleutel kan bij ⚙ → "Ondertitels (OpenSubtitles)". Heeft een stream geen eigen ondertitels, dan zoekt Kijkdoos Nederlands, anders Engels, en zet die aan. Gevonden ondertitels worden lokaal bewaard (telt dus maar één download). Ingebouwde speler: altijd; Windows: mpv/VLC bij losse films en afleveringen; Android: MX Player/Just Player/VLC voor de eerste titel.

## Downloads (offline kijken)
Bij elke film en aflevering staat een **⬇**-knop (bij een serie ook "Hele seizoen downloaden"). Gedownloade titels spelen ook zonder internet, in de ingebouwde én in de externe speler. Overzicht, voortgang, pauzeren/hervatten en verwijderen via de **⬇**-knop bovenin.
- **Windows:** bestanden komen in de app-map (`%APPDATA%\Kijkdoos\downloads`); in het overzicht opent een knop die map. Afgebroken downloads hervatten.
- **Android/Android TV:** opslag in de app-map van het toestel (geen toestemming nodig). Externe spelers krijgen het bestand via een FileProvider (`scripts/patch-android.py` regelt dat). Downloads lopen zolang de app open is; daarna kun je ze hervatten.
- **Browser:** opgeslagen in IndexedDB (handig voor kleine bestanden; vereist CORS of proxy).
- Livezenders en HLS-streams (.m3u8) kunnen niet gedownload worden.

## Casten (Android-telefoon → tv)
Bij elke film, aflevering en zender staat **📺** (ook in de speler zelf). Kies je Chromecast / Google TV / Android TV met Cast; de stream speelt dan op de tv en je telefoon wordt de afstandsbediening (balk onderin: pauze, ±30 s, ander apparaat, stop). Positie wordt onthouden en bij een serie gaat de volgende aflevering automatisch door. Gebruikt Google Cast (standaard mediaspeler): .mp4/.m3u8 werken het best; sommige .mkv/.ts-streams kan de tv niet afspelen. Gedownloade bestanden worden vanaf de originele stream gecast. Alleen in de Android-app op telefoon/tablet (niet op de tv zelf, niet in Windows/browser).
Techniek: `scripts/android/CastPlugin.java` + `CastOptionsProvider.java`; `patch-android.py` voegt `play-services-cast-framework` en de manifest-regel toe.

## Programmagids & terugkijken (Xtream Codes)
Live-zenders hebben een **📅**-knop (op de kaart, in de speler en met toets G/Info/Guide op de afstandsbediening). De gids toont per dag wat er loopt, met "Nu / Straks". Programma's die de provider heeft opgeslagen krijgen **⏪ Terugkijken**; het huidige programma heeft ook **⏮ Vanaf begin**. Werkt als je provider `tv_archive` aanbiedt (Xtream). De terugkijk-link is `…/timeshift/<gebruiker>/<wachtwoord>/<minuten>/<JJJJ-MM-DD:UU-MM>/<id>.m3u8`; start dat niet, kies dan bij ⚙ "Terugkijken: formaat" voor `ts`. M3U-lijsten zonder Xtream hebben geen gids.

## Audio & ondertitels (ingebouwde speler)
Volgorde: eerst wat in de stream zelf zit, pas als dat niets oplevert OpenSubtitles (uitzetten kan bij ⚙ → "OpenSubtitles gebruiken").
- **Audio:** gewone titels Engels, anders Nederlands. Kinder-/familie-/animatietitels Nederlands, anders Engels. Nederlandse titels met alleen een Nederlands spoor krijgen dat spoor vanzelf.
- **Ondertitels:** bij Nederlandse audio geen; anders Nederlands, anders Engels.
- Kan de speler de sporen niet zien (zie hieronder), dan wacht OpenSubtitles 9 s en valt alleen in als de audio niet Nederlands/onbekend-NL is.
- **Beperking:** audiosporen kiezen kan in Windows (Chromium met `AudioVideoTracks`) en bij HLS-streams (.m3u8) overal. Een los .mp4/.mkv-bestand in de Android-WebView laat geen sporenkeuze toe; gebruik daar een externe speler (VLC/MX) of laat een native speler (ExoPlayer) inbouwen.
- Externe spelers op Windows: mpv `--alang/--slang`, VLC `--audio-language/--sub-language` met dezelfde voorkeur.

## Afstandsbediening in schermen (instellingen, detail, gids, downloads)
Zodra zo'n scherm opengaat krijgt het meteen de focus; de pagina erachter is vergrendeld én voor focus geblokkeerd (`inert`). Zit de focus toch nog buiten het scherm, dan haalt de eerste pijltoets hem naar binnen. Pijltjes scrollen nooit de achtergrond: als er geen volgend element is, scrolt alleen het open scherm.

**OpenSubtitles staat standaard uit** (⚙ → "OpenSubtitles gebruiken"). Zet het alleen op "Laatste redmiddel" als je het zelf wilt; de eigen audio/ondertitels van de stream gaan altijd voor. Ziet de ingebouwde speler geen sporen (veel .mkv/.mp4), dan krijg je daarvan een melding; gebruik dan een externe speler.

## Ingebouwde speler op Windows (mpv)
De Windows-app levert nu mpv mee (de workflow downloadt het tijdens de build naar `build/mpv`, `extraResources` stopt het in de installer).
De ingebouwde speler is daarmee mpv i.p.v. de browserspeler: echte audio- en ondertitelkeuze (`a` = audio, `s` = ondertitel, `t` = lijst, `n`/`b` = volgende/vorige, of de knoppen in de balk).
Voorkeur: audio Engels (kinderen/Nederlandse titels: Nederlands), ondertitel NL → EN, geen ondertitel als de audio Nederlands is. Positie en "volgende aflevering" komen terug in de app.
Lukt de mpv-download in de build niet, dan valt de app terug op de oude browserspeler. Instelling: ⚙ → Ingebouwde speler.

## mpv ook in de Android-app (telefoon + TV)
De Android-build zoekt tijdens de build `dev.jdtech.mpv:libmpv` op Maven Central en bouwt die in (minSdk wordt 26). `KdMpvActivity` is de speler: knoppen Audio / Ondertitels (D-pad bruikbaar), ⏮ ⏭, ±10 s, onthoudt je positie, volgende aflevering vanzelf. libmpv wordt via reflectie aangesproken: ontbreekt of faalt hij, dan valt de app terug op de browserspeler (nooit een gebroken build/app).

## Nederlandse ondertitel
Zit er in de stream geen Nederlandse ondertitel (en is de audio niet Nederlands), dan haalt de app er altijd een bij OpenSubtitles — ook als er al een Engelse in de stream zit. Is er helemaal geen ondertitel, dan eerst Nederlands, anders Engels. Geldt voor de browserspeler, mpv op Windows en mpv op Android. Instelling: ⚙ → OpenSubtitles.

In de ingebouwde mpv-speler (Windows en Android) wordt de Nederlandse ondertitel pas ~6 seconden na het laden opgehaald, en alleen als er dan nog steeds geen Nederlandse ondertitel in de stream zit (fallback; de eigen sporen gaan altijd voor). Het bestand wordt eerst lokaal opgeslagen en daarna aan mpv toegevoegd. Zoeken doet eerst strikt (zonder SDH, met jaar), daarna ruimer.
