# Dartcams → Owncast

Der Button **Stream** in der unteren Leiste öffnet **Einstellungen → Livestream**. Ein lokaler Helfer überträgt den freigegebenen Dartcams-Tab per FFmpeg zu Owncast. Kamera-Overlays, Labels und die schwebende Webcam sind Bestandteil des Tab-Bilds. Während eines Streams werden auch geöffnete Einstellungen mitgesendet.

## Auf dem sendenden Computer

Voraussetzungen: Desktop-Chrome oder Edge, [Bun](https://bun.sh/) und [FFmpeg](https://ffmpeg.org/download.html) im PATH. Die Webapp allein kann kein RTMP senden. Auf einem anderen Rechner muss der Helfer dort ebenfalls laufen.

Im Dartcams-Projekt:

```sh
bun run stream:helper
```

1. Dartcams öffnen, **Stream → Helfer verbinden**. Falls der Browser fragt, den Zugriff auf das lokale Netzwerk erlauben.
2. Zuschauer-Link und RTMP-Server eintragen. Der RTMP-Server endet auf `/live`, ohne Key, zum Beispiel `rtmp://server:1935/live`.
3. Den vorhandenen Owncast-Stream-Key aus **Owncast Admin → Configuration → Server Setup → Stream Keys** in das Passwortfeld übertragen und **Verbindung übernehmen** drücken.
4. **Livestream starten**, dann in der Browserfreigabe den **Dartcams-Tab** wählen. Ganze Bildschirme und Fenster werden abgelehnt. Der Browser verlangt diese Freigabe bei jedem neuen Start.
5. Zuschauer-Link weitergeben. **LIVE / Stop** unten, **Stream stoppen** im Panel oder die Browseraktion **Freigabe beenden** beendet die Übertragung. Tab schließen oder neu laden beendet sie ebenfalls.

**720p, 30 Bilder/s, H.264, ca. 3 Mbit/s, mit stummer AAC-Spur.** Mikrofon und Systemton werden nicht erfasst. Das Bild behält sein Seitenverhältnis; abweichende Formate erhalten schwarze Ränder. Owncast puffert zusätzlich, daher sieht ein Zuschauer das Bild zeitversetzt.

Der Stream-Key wird nur im Arbeitsspeicher des Helfers gehalten, nie in `localStorage`, Konsole oder Repository. Nach einem Neustart des Helfers muss er erneut eingetragen werden. Ein Reload von Dartcams genügt: erneut verbinden, dann ist der bereits laufende Helfer samt Konfiguration wieder verfügbar. Eine Browserabfrage zum Speichern des Passworts ist nicht erforderlich.

## Owncast / Dokploy

Owncast nimmt RTMP standardmäßig auf TCP **1935** entgegen. `expose` allein veröffentlicht diesen Port nicht. Für den Owncast-Dienst wird in Docker Compose benötigt:

```yaml
ports:
  - "1935:1935"
```

Die Weboberfläche kann weiterhin über den vorhandenen HTTP-Reverse-Proxy laufen; der RTMP-Eingang benötigt einen erreichbaren TCP-Port. Hinter einer zusätzlichen Firewall muss derselbe Port freigegeben sein. Nur ein Publisher kann gleichzeitig senden.

Der Zuschauer-Link hat keinen zusätzlichen Passwortschutz. Personen mit Zugriff auf den Link können zuschauen und ihn weitergeben. Der Stream-Key berechtigt zum Senden und gehört nicht in den Zuschauer-Link.

## Lokaler Helfer

- Bindet ausschließlich an `127.0.0.1:8732`.
- Erlaubte Browser-Ursprünge: `https://cams.ingomc.de`, `https://ingomc.github.io` und HTTP auf localhost/Loopback für Entwicklung. Zusätzliche eigene Ursprünge können ausdrücklich über `DARTCAMS_STREAM_ORIGINS` als kommagetrennte Liste gesetzt werden.
- Discovery liefert ein zufälliges Sitzungstoken. Konfiguration und WebSocket-Publishing benötigen dieses Token; fremde Origins und Hostnamen werden abgewiesen. Der Owncast-Key wird nie zurückgeliefert.
- Konfiguration ist während eines Streams gesperrt. Beim Wechsel des RTMP-Ziels muss der Key neu eingegeben werden.
- Unbestätigte WebSockets laufen nach fünf Sekunden ab. Start ohne Encoder-Fortschritt nach 25 Sekunden und fehlende Bilddaten nach 30 Sekunden führen zum Abbruch. Puffer sind begrenzt; ein langsamer Encoder baut keinen unbegrenzten Rückstau auf.
- Bei Abbruch werden Recorder, Capture-Tracks, WebSocket und FFmpeg beendet. Ein neuer Stream braucht einen erneuten ausdrücklichen Start; keine automatische Freigabe oder Wiederverbindung.
- FFmpeg-Meldungen werden nicht roh protokolliert, da sie die RTMP-Adresse einschließlich Key enthalten können.

Quellen: [Owncast Broadcasting](https://owncast.online/docs/broadcasting/), [Browser-Tab-Freigabe](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia).
