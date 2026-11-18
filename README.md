# 📺 Kijkdoos — IPTV voor Android, Windows en web

Gratis films, series en live tv op één plek, plus je eigen IPTV-abonnementen.

**Downloads (Android .apk / Windows .exe):** [Releases → latest](https://github.com/Darude91/Regtur/releases/latest)

## Wat zit erin
- **Films** en **Series** (en **Live TV** zodra er zenders zijn), Netflix-achtige rijen met thumbnails
- **Gratis bronnen:**
  - Internet Archive — duizenden rechtenvrije speelfilms, tv-series en tekenfilms (on demand)
  - iptv-org — openbaar beschikbare film-, serie-, klassieke en animatiekanalen + Nederlandse zenders
- **Abonnementen:** Xtream Codes (server + gebruikersnaam + wachtwoord) of een M3U-link.
  Films, series (met seizoenen/afleveringen) en zenders worden automatisch ingedeeld.
  Een verlopen of niet-werkend abonnement toont niets.
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

## Versie 24 — Android TV + webspeler
- Android gebruikt weer de ingebouwde webspeler (geen libmpv meer). Nieuw: knop 🔊 in de speler (op TV: pijl omhoog/omlaag of Menu-toets; op toetsenbord a/s) om handmatig een audiospoor of ondertitel te kiezen, Nederlandse/Engelse ondertitel te zoeken, of de stream in een externe speler te openen. hls.js wordt tijdens de build bijgewerkt naar de nieuwste 1.x.
- Beperking: de Android-WebView toont bij veel mkv/mp4-bestanden geen audiosporen; dan is de externe speler (↗) de betrouwbare keuze.
- Externe speler op TV: bij "Vraag elke keer" toont de app nu een eigen keuzelijst (werkt met de afstandsbediening) en onthoudt je keuze.
- Na elke app-update wist de APK de oude WebView-cache/service worker, zodat de TV geen verouderde versie (te grote kaarten, ontbrekende downloadknop) meer kan tonen.

## Versie 25 — halve rollback
- hls.js-update teruggedraaid (weer het meegeleverde bestand).
- "Audiospoor automatisch kiezen" is een instelling; op Android standaard UIT (de stream kiest zelf, zoals eerst), elders aan. Na een handmatige keuze met 🔊 verandert de app het spoor nooit meer zelf.
- Externe speler op Android: geen OpenSubtitles-wachttijd en geen extra ondertitel-extras meer bij het starten; de eigen spelerlijst bevat nu ook bekende, geïnstalleerde spelers (VLC, mpv, MX, Just Player, Kodi…) als de Android-resolver niets teruggeeft.

## Versie 26 — ondertitel-fallback (tv en mobiel)
Na ~8 seconden kijkt de ingebouwde speler opnieuw: zit er dan geen Nederlandse ondertitel in de stream (en is de audio niet Nederlands, en heb je niet zelf iets gekozen), dan haalt hij er een bij OpenSubtitles. Is die er niet, dan blijft een Engelse ondertitel uit de stream staan; zit er helemaal niets in, dan wordt Engels van OpenSubtitles geprobeerd. Heeft de stream zelf al Nederlandse ondertitels, dan wordt die gekozen (anders Engels).

## Versie 27 — ondertitel-fallback ook in externe spelers (Windows)
mpv: de app start hem met een IPC-kanaal; na ~8 s wordt gekeken of er een Nederlandse ondertitel is (en de audio niet Nederlands is). Zo niet, dan wordt er een via OpenSubtitles bijgezet (NL, anders EN) en geselecteerd.
VLC: idem via VLC's HTTP-interface (alleen op 127.0.0.1, met wachtwoord). Werkt niet als VLC al draaide en de nieuwe titel alleen aan de lopende VLC wordt toegevoegd.
Android externe spelers (VLC/mpv/MX): na het starten is er geen verbinding meer met de speler, dus hier kan de ondertitel niet achteraf worden toegevoegd; gebruik de ingebouwde speler of de ondertitelkeuze van de externe speler zelf.

## Versie 28 — ondertitels in sync
- De app berekent de OpenSubtitles-moviehash van het streambestand (eerste + laatste 64 KB, via Range-verzoeken; Windows en Android) en zoekt daarmee de ondertitel die precies bij die versie hoort ("exacte match"). Zonder hash (HLS, server zonder Range, browserversie) kiest hij op populariteit, met voorkeur voor betrouwbare uploaders en zonder slechthorenden/machinevertaling.
- Films (ook in delen) worden nooit meer als aflevering gezocht.
- Handmatig bijsturen: webspeler 🔊 → "Ondertitel eerder/later (±0,5 s)"; mpv: toets z / x; VLC: toets g / h.

## Versie 29 — mpvNova (Android TV) en mpv (telefoon) als standaardspeler
- **Android TV:** films en series starten direct in **mpvNova** (`app.mpvnova.player`, GitHub Releases van Laskco/mpvNova); is die er niet, dan in gewone mpv, anders in de eenvoudige webspeler.
- **Telefoon/tablet:** gewone **mpv** (`is.xyz.mpv`); anders de webspeler. (mpvNova is alleen voor tv.)
- Beide zijn losse apps die je zelf installeert; Kijkdoos vraagt er één keer per sessie naar als ze ontbreken.
- De webspeler is alleen nog terugval (of kies ⚙ → Ingebouwde speler → Eenvoudig).
- Live tv blijft standaard in de webspeler (zappen + programmagids); aan te zetten via ⚙ → "Live tv ook in mpv/mpvNova".
- Audio/ondertitelvoorkeur stel je in mpv/mpvNova zelf in (`alang`/`slang` in mpv.conf); positie en volgende aflevering komen terug in Kijkdoos als de speler dat meldt.

## Versie 30 — ondertitels die beter kloppen
- **Zoeken op TMDB-id:** heeft je Xtream-aanbieder een TMDB-id bij de film/serie, dan zoekt Kijkdoos daarop (bij series op `parent_tmdb_id` + seizoen/aflevering) in plaats van op de titel. Dat voorkomt de verkeerde film of serie bij vertaalde titels, remakes en dubbele namen. Geen id, dan zoals voorheen op titel.
- **Betere keuze tussen kandidaten:** naast moviehash-match, betrouwbare uploader en waardering telt nu ook of de uitgave (BluRay/WEB-DL/HDTV, 1080p/720p) lijkt op de stream; machine- en AI-vertalingen en slechthorenden-versies gaan omlaag.
- **Handmatig wisselen:** in de ingebouwde speler (🔊) staat na het zoeken **🔁 Andere … ondertitel proberen (1/8)**; dat laadt de volgende kandidaat. Samen met ± 0,5 s verschuiven kun je zo een afwijkende uitgave rechtzetten.
- Geldt voor de webspeler en mpv op Windows (automatisch: de beste kandidaat). In mpv/mpvNova op Android kan Kijkdoos geen ondertitel toevoegen.

## Versie 31 — favorieten, streamcontrole verwijderd
- **Verwijderd:** de instelling "Streams controleren" (en alles wat erbij hoorde: achtergrondtests, "controleren…"-label, verbergen van kapotte streams). Alles uit de index wordt gewoon getoond. Alleen als afspelen echt mislukt, onthoudt de app dat even voor het zappen (die zender wordt overgeslagen).
- **Nieuw: ★ Favorieten.** Eigen tabblad met je favoriete films, series en zenders (alleen op dit apparaat bewaard).
  - Toevoegen: ☆ rechtsonder op een kaart (muis/aanraking), de knop **☆ Favoriet** in het detailscherm, of in de speler 🔊-menu → **☆ Aan favorieten toevoegen** (werkt met de afstandsbediening, ook voor live tv).
  - Favoriete zenders zappen als groep: start er één, dan zap je met ▲/▼ door je favorieten.

## Versie 32 — afspelen op een ander apparaat (telefoon → tv/pc)
Naast Google Cast (alleen Chromecast/Google TV, alleen mp4/m3u8) kan Kijkdoos nu een titel sturen naar een **andere Kijkdoos**: de tv of pc speelt hem zelf af, met jouw speler (Android TV: mpvNova; Windows: mpv), dus ook mkv/ts.
- **Ontvanger (tv of pc):** ⚙ → *Ontvanger* aanzetten. Je ziet daar de koppelcode (4 cijfers) en het IP-adres. Kijkdoos moet open staan op dat apparaat.
- **Zender (telefoon of pc):** tik op 📺 bij een film, aflevering of zender → kies het apparaat. Eerste keer: *Apparaten zoeken in je netwerk* (of IP-adres handmatig) en de koppelcode invullen; daarna staat het apparaat in de lijst.
- Doorgegeven worden: stream, titel, hervatpositie en bij series de volgende afleveringen (de ontvanger gaat zelf door).
- Techniek: HTTP op poort 8765 in het lokale netwerk (`/kd/info`, `/kd/play`), alleen met de koppelcode (`X-KD-Code`), maximaal 8 foute pogingen per minuut, alleen http(s)-streams. `KdRemotePlugin.java` (Android), `electron/remote.js` (Windows).
- Let op: de stream-URL (bij Xtream met je inloggegevens) gaat onversleuteld over je eigen netwerk. Gebruik dit alleen op een netwerk dat je vertrouwt. Afstandsbediening vanaf de telefoon (pauze/seek) zit er niet in; de ontvanger bedien je met zijn eigen afstandsbediening.
