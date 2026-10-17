# SCO-Pausenbilder für Owncast

## Logo und Browser-Icons

Unter **General → Logo** wird `branding/sco-logo-512.png` verwendet: das einzelne SCO-Schild aus dem Original-Icon-Satz von [sc-oberfuellbach.de](https://www.sc-oberfuellbach.de/). Unter **Favicon** wird `branding/sco-favicon.ico` hochgeladen; die ICO-Datei enthält mehrere Auflösungen. `sco-icon-192.png` und `sco-apple-touch-icon.png` bewahren die weiteren Originalgrößen im Projekt auf.

`branding.js` wird zusätzlich unter **Custom Scripting** eingesetzt. Es versioniert die Favicon-Adresse, ergänzt das SCO-Logo als Touch-Icon sowie den Seitennamen und die rote Browser-Akzentfarbe. Der vorhandene Inhalt des Feldes bleibt erhalten; das Skript wird einmal angehängt. Es benötigt keine Zugangsdaten und sendet keine Daten. Die App-Icons des vorhandenen Owncast-Manifests verwenden ebenfalls `/favicon.ico`.

Bei einem späteren Logo-Wechsel die Dateien in Owncast hochladen und die Versionsnummer `sco-brand` in `appearance.css` sowie `branding.js` gemeinsam ändern. Owncast liefert die Bilder mit langem Browser-Cache aus; eine neue Adresse lädt die aktuelle Datei sofort. Danach nur die Zuschauer-Seite neu laden.

## Pausenbilder

Die Motive liegen unter `static/stream-slates/` und sind gemeinsam gestaltet:

| Datei | Verwendung |
| --- | --- |
| `offline-v1.png` | „Bis zum nächsten Anwurf“ – reguläre Offline-Anzeige |
| `start-v1.png` | „Gleich geht’s los“ – angekündigter Sendestart |
| `pause-v1.png` | „Kurze Spielpause“ – kurze Unterbrechung |
| `offline-v1.mpegts` | Achtsekündiger Abspann für den Owncast-Player; H.264, 720p/30 fps, AAC-Stille |

## Owncast 0.3.0

Die PNGs werden auf dem Owncast-Server nach `/app/data/public/sco/` kopiert. Owncast stellt sie über `/public/sco/<Dateiname>` bereit. Das bestehende Docker-Volume `owncast-data` bewahrt sie über Neustarts und Deployments hinweg auf.

Unter **Configuration → General → General → Offline Message** wird `offline-message.html` eingesetzt. Im danebenliegenden Tab **Appearance → Customize your page styling with CSS** wird `appearance.css` verwendet. Für ein anderes Offline-Motiv im HTML den Dateinamen und den Alternativtext gemeinsam ändern. Das Standbild verschwindet automatisch, wenn Owncast wieder live ist.

Die Start-/Stoppmeldungen im Chat erhalten über `#owncast-chat-action-message-text` eine helle Fläche, dunkle Schrift und einen roten Rand. Vorder- und Hintergrund werden gemeinsam gesetzt, da Owncast diese Meldungen sonst mit der dunklen Palette-0-Farbe und dem ebenfalls dunklen Chat-Text kombiniert. Die Regel gilt auch im eingebetteten Chat. CSS-Änderungen speichern und anschließend nur die Zuschauer-Seite neu laden; der sendende Dartcams-Tab und der Stream können weiterlaufen.

Die Offline-Nachricht ändert ausschließlich die Zuschauer-Webseite. Owncast hängt beim Stream-Ende außerdem einen achtsekündigen MPEG-TS-Clip an die HLS-Playlist an. `offline-v1.mpegts` wird dafür nach `/app/data/branding/offline-v2.ts` kopiert. Die Startanweisung aus `compose.yaml` kopiert diesen persistent gespeicherten Clip beim Containerstart nach `/app/static/offline-v2.ts`. Owncast 0.3.0 verwendet diese Datei anstelle der eingebauten Standard-Animation. Es ist kein eigener Owncast-Build nötig.

Quellen: [Owncast Static Files](https://github.com/owncast/owncast/blob/v0.3.0/static/static.go), [Offline-Playlist](https://github.com/owncast/owncast/blob/v0.3.0/services/stream/offline.go), [Website-Konfiguration](https://owncast.online/docs/configuration/website/).

## Neues Motiv einsetzen

1. Bild mit einem neuen Dateinamen bereitstellen, damit Browser keine alte Version aus dem Cache zeigen.
2. Datei im persistenten öffentlichen Verzeichnis speichern und die Offline-Nachricht anpassen.
3. Bei geändertem Abspann den Clip neu erzeugen und die beiden oben genannten Clip-Dateien ersetzen. Während eines laufenden Streams keine HLS-Dateien ändern.
4. Die Originalanimation und vorherige Einstellungen vor dem Austausch sichern. Zum Zurücksetzen die Originaldatei wiederherstellen und die vorherige Offline-Nachricht/CSS einsetzen.

Clip erzeugen (im Repository-Root; FFmpeg erforderlich):

```sh
ffmpeg -hide_banner -y -loop 1 -framerate 30 \
  -i static/stream-slates/offline-v1.png \
  -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 \
  -t 8 \
  -vf 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1' \
  -c:v libx264 -preset medium -tune stillimage -profile:v high \
  -pix_fmt yuv420p -crf 18 -r 30 -g 60 -keyint_min 60 -sc_threshold 0 \
  -c:a aac -b:a 128k -ar 48000 -ac 2 -mpegts_flags +resend_headers \
  -f mpegts static/stream-slates/offline-v1.mpegts
```

Die Videospur dauert exakt acht Sekunden. Die Containerdauer kann durch AAC-Encoder-Verzögerung geringfügig länger ausfallen.

Während eines laufenden Dartcams-Streams wechseln die Schalter **Start / Live / Pause** unten neben **Stop** zwischen den Sendebildern. Die eigene Kameraansicht bleibt dabei sichtbar. Siehe [Livestream-Anleitung](../LIVESTREAM.md). Die Owncast-Offline-Bilder greifen, wenn kein Stream ankommt.
