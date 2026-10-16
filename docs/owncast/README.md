# SCO-Pausenbilder für Owncast

Die Motive liegen unter `static/stream-slates/` und sind gemeinsam gestaltet:

| Datei | Verwendung |
| --- | --- |
| `offline-v1.png` | „Bis zum nächsten Anwurf“ – reguläre Offline-Anzeige |
| `start-v1.png` | „Gleich geht’s los“ – angekündigter Sendestart |
| `pause-v1.png` | „Kurze Spielpause“ – kurze Unterbrechung |
| `offline-v1.mpegts` | Achtsekündiger Abspann für den Owncast-Player; H.264, 720p/30 fps, AAC-Stille |

## Owncast 0.3.0

Die PNGs werden auf dem Owncast-Server nach `/app/data/public/sco/` kopiert. Owncast stellt sie über `/public/sco/<Dateiname>` bereit. Das bestehende Docker-Volume `owncast-data` bewahrt sie über Neustarts und Deployments hinweg auf.

Unter **Server Setup → General → Offline Message** wird `offline-message.html` eingesetzt. Unter **Appearance → Custom CSS** wird `appearance.css` verwendet. Für ein anderes Offline-Motiv im HTML den Dateinamen und den Alternativtext gemeinsam ändern. Das Standbild verschwindet automatisch, wenn Owncast wieder live ist.

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

Eine Umschaltung auf Pausenbilder innerhalb eines weiterlaufenden Dartcams-Streams ist ein separates Feature; die hier installierten Owncast-Offline-Bilder greifen, wenn kein Stream ankommt.
