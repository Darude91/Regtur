#!/usr/bin/env python3
"""Maakt de door `npx cap add android` gegenereerde app geschikt voor Android TV én telefoon.

- Leanback-launcher (verschijnt op het TV-startscherm) naast de gewone launcher
- touchscreen/leanback als optioneel (geen aanraakscherm nodig)
- TV-banner (320x180) en app-iconen
- http-streams toestaan (IPTV)
- Plugin 'ExternalPlayer' (VLC, mpv, MX Player, …) + MainActivity die hem registreert
Idempotent: veilig om meerdere keren te draaien.   Gebruik: python3 scripts/patch-android.py [android-map] [icoon.png]
"""
import json, os, re, subprocess, sys, shutil, pathlib

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'android')
icon = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else 'build/icon.png')
manifest = root / 'app/src/main/AndroidManifest.xml'
res = root / 'app/src/main/res'
cfg = json.loads((root.parent / 'capacitor.config.json').read_text(encoding='utf8'))
app_id = cfg['appId']

s = manifest.read_text(encoding='utf8')

def add_feature(s, name):
    if name in s:
        return s
    tag = f'    <uses-feature android:name="{name}" android:required="false" />\n'
    return re.sub(r'(\n\s*)<application', '\n' + tag.rstrip('\n') + r'\1<application', s, count=1)

s = add_feature(s, 'android.software.leanback')
s = add_feature(s, 'android.hardware.touchscreen')

# Android 11+: zonder <queries> ziet de app de geïnstalleerde spelers niet ("niet geïnstalleerd"-melding)
if '<queries>' not in s:
    pk = ['org.videolan.vlc', 'app.mpvnova.player', 'is.xyz.mpv', 'com.mxtech.videoplayer.ad', 'com.mxtech.videoplayer.pro', 'com.brouken.player',
          'org.xbmc.kodi', 'dev.anilbeesetti.nextplayer', 'com.kmplayer', 'org.courville.nova', 'com.nitroxenon.terrarium']
    q = '    <queries>\n' + ''.join(f'        <package android:name="{x}" />\n' for x in pk) + \
        '        <intent><action android:name="android.intent.action.VIEW" /><data android:mimeType="video/*" /></intent>\n' + \
        '        <intent><action android:name="android.intent.action.VIEW" /><data android:scheme="http" /><data android:mimeType="video/*" /></intent>\n    </queries>\n'
    s = re.sub(r'(\n\s*)<application', '\n' + q.rstrip('\n') + r'\1<application', s, count=1)

if 'LEANBACK_LAUNCHER' not in s:
    s, n = re.subn(r'(<category android:name="android.intent.category.LAUNCHER"\s*/>)',
                   r'\1\n                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />', s, count=1)
    assert n == 1, 'LAUNCHER-categorie niet gevonden in AndroidManifest.xml'

app_attrs = []
if 'usesCleartextTraffic' not in s: app_attrs.append('android:usesCleartextTraffic="true"')
if 'android:banner' not in s: app_attrs.append('android:banner="@drawable/banner"')
if app_attrs:
    s = s.replace('<application', '<application ' + ' '.join(app_attrs), 1)
manifest.write_text(s, encoding='utf8')

# Google Cast: afhankelijkheden + OptionsProvider in het manifest
gradle = root / 'app/build.gradle'
g = gradle.read_text(encoding='utf8')
if 'play-services-cast-framework' not in g:
    g = g.replace('dependencies {', "dependencies {\n    implementation 'com.google.android.gms:play-services-cast-framework:21.5.0'\n    implementation 'androidx.mediarouter:mediarouter:1.7.0'", 1)
    gradle.write_text(g, encoding='utf8')
s = manifest.read_text(encoding='utf8')
if 'OPTIONS_PROVIDER_CLASS_NAME' not in s:
    meta = '        <meta-data android:name="com.google.android.gms.cast.framework.OPTIONS_PROVIDER_CLASS_NAME" android:value="' + app_id + '.CastOptionsProvider" />\n'
    s = s.replace('</application>', meta + '    </application>', 1)
    manifest.write_text(s, encoding='utf8')

# Gedownloade bestanden (app-map op de opslag) delen met externe spelers via de FileProvider van Capacitor
xml = res / 'xml'; xml.mkdir(parents=True, exist_ok=True)
(xml / 'file_paths.xml').write_text('''<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-path name="kd_external" path="." />
    <external-files-path name="kd_files" path="." />
    <files-path name="kd_internal" path="." />
    <cache-path name="kd_cache" path="." />
</paths>
''', encoding='utf8')
s = manifest.read_text(encoding='utf8')
if 'fileprovider' not in s:
    prov = ('        <provider android:name="androidx.core.content.FileProvider" android:authorities="${applicationId}.fileprovider" '
            'android:exported="false" android:grantUriPermissions="true">\n'
            '            <meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/file_paths" />\n        </provider>\n')
    s = s.replace('</application>', prov + '    </application>', 1)
    manifest.write_text(s, encoding='utf8')

# iconen
shutil.rmtree(res / 'mipmap-anydpi-v26', ignore_errors=True)
for d, size in (('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)):
    out = res / f'mipmap-{d}'; out.mkdir(parents=True, exist_ok=True)
    for name in ('ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground'):
        subprocess.run(['convert', str(icon), '-resize', f'{size}x{size}', str(out / f'{name}.png')], check=True)

# TV-banner: donkere achtergrond met het icoon in het midden
dr = res / 'drawable'; dr.mkdir(parents=True, exist_ok=True)
subprocess.run(['convert', '-size', '320x180', 'xc:#0b0d14', '(', str(icon), '-resize', '128x128', ')',
                '-gravity', 'center', '-composite', str(dr / 'banner.png')], check=True)
# Externe-speler-plugin (Java) in het pakket van de app zetten
src = pathlib.Path(__file__).parent / 'android'
jdir = root / 'app/src/main/java' / pathlib.Path(*app_id.split('.'))
jdir.mkdir(parents=True, exist_ok=True)
for name in ('ExternalPlayerPlugin.java', 'CastPlugin.java', 'KdRemotePlugin.java', 'CastOptionsProvider.java', 'MainActivity.java'):
    (jdir / name).write_text((src / name).read_text(encoding='utf8').replace('__PKG__', app_id), encoding='utf8')
print('Android TV-patch + externe-speler-plugin toegepast')
