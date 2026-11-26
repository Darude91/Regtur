# 📺 Kijkdoos — IPTV voor Android, Windows en web

Gratis films, series en live tv op één plek, plus je eigen IPTV-abonnementen.
Alles blijft zichtbaar: er wordt niets gecontroleerd, verborgen of samengevoegd — elke zender, serie en film staat er zoals de bron hem aanlevert.

**Downloads (Android .apk / Windows .exe):** [Releases → latest](https://github.com/Darude91/Regtur/releases/latest)

## Wat zit erin
- **Films** en **Series** (en **Live TV** zodra er zenders zijn), Netflix-achtige rijen met thumbnails
- **Gratis bronnen:**
  - Internet Archive — duizenden rechtenvrije speelfilms, tv-series en tekenfilms (on demand), met rijen voor **kinder- & familiefilms, animatiefilms, kinder-tv, tekenfilms en sprookjes**, plus de open films van Blender
  - iptv-org — openbaar beschikbare film-, serie-, klassieke, animatie-, **kinder-, familie- en comedykanalen** + Nederlandse zenders (aan/uit te zetten bij ⚙; documentaires, Nederlandstalig en België staan standaard uit)
  - Free-TV — gecureerde lijst legale gratis zenders (standaard uit)
- **Abonnementen:** Xtream Codes (server + gebruikersnaam + wachtwoord) of een M3U-link.
  Films, series (met seizoenen/afleveringen) en zenders worden automatisch ingedeeld.
  Een verlopen of niet-werkend abonnement toont niets.
- **Altijd een plaatje:** posters worden klein (sneller, vooral op Android TV) ingeladen. Ontbreekt er een of laadt hij niet, dan zoekt Kijkdoos er zelf een (iTunes); lukt dat niet, dan staat er een kleurvlak met initialen.
- **Hoogste kwaliteit:** de webspeler kiest bij HLS altijd de variant met de hoogste bitrate, mpv (Windows) start met `--hls-bitrate=max` en een grote buffer, en bij Internet Archive wordt per titel het grootste (= beste) mp4-bestand gekozen. (mpv/MPVNova op Android doen standaard al `hls-bitrate=max`.)
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


## Standaardspeler: mpv
Kijkdoos speelt standaard af in **mpv**:
- **Android (telefoon/tablet):** *mpv for Android* (`is.xyz.mpv`)
- **Android TV / Google TV / Fire TV:** *MPVNova* (`app.mpvnova.player`, [GitHub-releases](https://github.com/Laskco/mpvNova/releases)). De app herkent zelf of het een tv is; staat MPVNova er niet op maar mpv wel, dan wordt mpv gebruikt.
- **Windows:** de meegeleverde `mpv.exe` (in installer en portable .exe); anders een gevonden mpv.
- Is de speler niet geïnstalleerd, dan biedt Kijkdoos de installatiepagina aan of speelt hij met de webspeler.
- **Uitzondering: live tv** opent altijd in de webspeler (Windows én Android), zodat 📅 Gids en ⏪ Terugkijken in de speler beschikbaar zijn. Films en series gaan nog steeds naar mpv. Wil je een zender toch in mpv, gebruik dan de knop ↗ op de zenderpagina.
- Uitzetten of een andere speler kiezen kan bij ⚙ → Speler. De browser-versie blijft de webspeler gebruiken.
- Hervatten, ondertitels (OpenSubtitles) en automatisch de volgende aflevering werken ook met mpv/MPVNova.

## Externe spelers & volgende aflevering
Kies bij ⚙ een externe speler (Windows: VLC, mpv, MPC-HC, PotPlayer…; Android: VLC, mpv, MX Player, Just Player, Kodi…).
Start je een aflevering vanuit een serie, dan gaat de speler automatisch door met de volgende:
- **Windows (VLC/mpv/…):** Kijkdoos geeft een afspeellijst met de gekozen en alle volgende afleveringen mee.
- **Android:** MX Player krijgt de hele lijst; bij VLC, mpv en Just Player start Kijkdoos de volgende aflevering zodra de speler meldt dat de vorige uit is. Geeft een speler dat niet door, dan vraagt Kijkdoos of de volgende mag starten.

## Live TV zappen & afstandsbediening (Android TV)
Start een zender uit een groep, dan zit de hele groep in een zapper:
- **▲ / ▼** (of kanaal +/−, PageUp/PageDown): volgende / vorige zender · **cijfertoetsen**: direct naar zendernummer
- **OK**: zenderlijst openen (kies met ▲ ▼, OK om te schakelen, Terug om te sluiten)
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
- **Ondertitels:** ingebouwde speler zet Nederlands aan, anders Engels (niet als de titel al Nederlands gesproken is). mpv krijgt `--slang=nl,nld,dut,en,eng`, VLC `--sub-language=nl,en`. Op Android bepaalt de externe speler zelf: stel daar in MX/VLC de voorkeurstaal ondertitels in op Nederlands, dan Engels. **mpv for Android en MPVNova** kunnen na het starten niet bevraagd worden: Kijkdoos zet daar direct een Nederlandse OpenSubtitles-ondertitel aan (een Engelse wordt alleen toegevoegd). Voor ingebouwde Nederlandse sporen: zet in de mpv-app bij instellingen → mpv.conf de regel `slang=nl,nld,dut,en,eng`. **Windows-mpv en de webspeler** kijken ~9 s na het starten of er een Nederlands ondertitelspoor is; zo niet, dan wordt de OpenSubtitles-ondertitel toegevoegd en aangezet.

## Ondertitels via OpenSubtitles
Er zit een standaard-API-sleutel in de app; een eigen sleutel kan bij ⚙ → "Ondertitels (OpenSubtitles)". Heeft een stream geen eigen ondertitels, dan zoekt Kijkdoos Nederlands, anders Engels, en zet die aan. Gevonden ondertitels worden lokaal bewaard (telt dus maar één download). Ingebouwde speler: altijd; Windows: mpv/VLC bij losse films en afleveringen; Android: MX Player/Just Player/VLC voor de eerste titel.

## Downloads (offline kijken)
Bij elke film en aflevering staat een **⬇**-knop (bij een serie ook "Hele seizoen downloaden"). Gedownloade titels spelen ook zonder internet, in de ingebouwde én in de externe speler. Overzicht, voortgang, pauzeren/hervatten en verwijderen via de **⬇**-knop bovenin.
- **Windows:** bestanden komen in de app-map (`%APPDATA%\Kijkdoos\downloads`); in het overzicht opent een knop die map. Afgebroken downloads hervatten.
- **Android/Android TV:** opslag in de app-map van het toestel (geen toestemming nodig). Externe spelers krijgen het bestand via een FileProvider (`scripts/patch-android.py` regelt dat). Downloads lopen zolang de app open is; daarna kun je ze hervatten.
- **Browser:** opgeslagen in IndexedDB (handig voor kleine bestanden; vereist CORS of proxy).
- Livezenders en HLS-streams (.m3u8) kunnen niet gedownload worden.

## Casten (telefoon en Windows → tv)
Bij elke film, aflevering en zender staat **📺** (ook in de speler zelf). Er is **geen koppelcode** nodig: de apparaten worden vanzelf gevonden.
- **Android-telefoon/tablet én Android TV:** de knop is altijd te zien. Kies je Chromecast / Google TV / Android TV met Cast in de lijst; de stream speelt dan op de tv en je toestel wordt de afstandsbediening (balk onderin: pauze, ±30 s, ander apparaat, stop). Lukt het niet, dan zegt Kijkdoos waarom (bijv. ontbrekende Google Play-services).
- **Windows:** Kijkdoos zoekt zelf Chromecasts / Google TV's in je netwerk (mDNS) en praat er direct mee via het Cast-protocol — zonder extra programma's. Wordt er niets gevonden: controleer of pc en tv op hetzelfde netwerk zitten en of de Windows-firewall de app toestaat in het privénetwerk.
Positie wordt onthouden en bij een serie gaat de volgende aflevering automatisch door. Cast gebruikt de standaard mediaspeler van Google: .mp4/.m3u8 werken het best; sommige .mkv/.ts-streams kan de tv niet afspelen. Gedownloade bestanden worden vanaf de originele stream gecast.
Techniek: Android `scripts/android/CastPlugin.java` + `CastOptionsProvider.java` (`patch-android.py` voegt `play-services-cast-framework` en de manifest-regel toe); Windows `electron/cast.js`.

## Programmagids & terugkijken (Xtream Codes)
Live-zenders hebben een **📅**-knop (op de kaart, in de speler en met toets G/Info/Guide op de afstandsbediening). De gids toont per dag wat er loopt, met "Nu / Straks". Programma's die de provider heeft opgeslagen krijgen **⏪ Terugkijken**; het huidige programma heeft ook **⏮ Vanaf begin**. Werkt als je provider `tv_archive` aanbiedt (Xtream). De terugkijk-link is `…/timeshift/<gebruiker>/<wachtwoord>/<minuten>/<JJJJ-MM-DD:UU-MM>/<id>.m3u8`; start dat niet, kies dan bij ⚙ "Terugkijken: formaat" voor `ts`. M3U-lijsten zonder Xtream hebben geen gids.
