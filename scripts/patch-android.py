#!/usr/bin/env python3
"""Maakt de door `npx cap add android` gegenereerde app geschikt voor Android TV én telefoon.

- Leanback-launcher (verschijnt op het TV-startscherm) naast de gewone launcher
- touchscreen/leanback als optioneel (geen aanraakscherm nodig)
- TV-banner (320x180) en app-iconen
- http-streams toestaan (IPTV)
- Plugin 'ExternalPlayer' (VLC, mpv, MX Player, …) + MainActivity die hem registreert
Idempotent: veilig om meerdere keren te draaien.   Gebruik: python3 scripts/patch-android.py [android-map] [icoon.png]
"""
import json, re, subprocess, sys, shutil, pathlib

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'android')
icon = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else 'build/icon.png')
manifest = root / 'app/src/main/AndroidManifest.xml'
res = root / 'app/src/main/res'

s = manifest.read_text(encoding='utf8')

def add_feature(s, name):
    if name in s:
        return s
    tag = f'    <uses-feature android:name="{name}" android:required="false" />\n'
    return re.sub(r'(\n\s*)<application', '\n' + tag.rstrip('\n') + r'\1<application', s, count=1)

s = add_feature(s, 'android.software.leanback')
s = add_feature(s, 'android.hardware.touchscreen')

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
cfg = json.loads((root.parent / 'capacitor.config.json').read_text(encoding='utf8'))
app_id = cfg['appId']
src = pathlib.Path(__file__).parent / 'android'
jdir = root / 'app/src/main/java' / pathlib.Path(*app_id.split('.'))
jdir.mkdir(parents=True, exist_ok=True)
for name in ('ExternalPlayerPlugin.java', 'MainActivity.java'):
    (jdir / name).write_text((src / name).read_text(encoding='utf8').replace('__PKG__', app_id), encoding='utf8')
print('Android TV-patch + externe-speler-plugin toegepast')
