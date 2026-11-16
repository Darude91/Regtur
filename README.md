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
