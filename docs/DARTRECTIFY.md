# Lokale DartRectify-Bildquellen

Die Windows-App DartRectify auf demselben PC starten und https://cams.ingomc.de
öffnen. Der Browser muss lokalen Netzwerkzugriff erlauben. Es gibt keine
Codeeingabe. Im Kamera-Menü Heim oder Gast aus DartRectify wählen. Die letzte
Quellenauswahl wird gespeichert; eine verfügbare App ersetzt niemals eine
gewählte Webcam. Ohne bisherige Auswahl bleiben beide Bereiche leer.

Bei „Browserfreigabe erforderlich“ oben auf **DartRectify verbinden** klicken
und die Browserabfrage bestätigen. Die erste Anfrage wartet bis zu einer Minute
auf diese Entscheidung. „Vom Browser blockiert“ bedeutet, dass der Zugriff
verweigert wurde: links neben der Adresse die Website-Einstellungen öffnen und
den Zugriff auf lokale Apps bzw. das lokale Netzwerk erlauben. Eine Änderung der
Berechtigung startet die Verbindung automatisch neu. Ein laufender lokaler
Server allein kann diese Browserberechtigung nicht ersetzen.

Beim Website-Update übernimmt der neue Service Worker auch bereits geöffnete
Tabs. Dadurch kann ein alter Worker die lokale Anfrage nicht dauerhaft
abfangen und die Chrome-Freigabe verhindern. Nach der Übernahme beginnt die
Erkennung erneut. Bei bereits verweigerter Browserberechtigung bleibt die
Freigabe in den Website-Einstellungen erforderlich.

Die Bilder werden lokal über Port 8731 gelesen und nicht zum Webserver
hochgeladen. Zoom, Position, Maske und Bildfilter werden je Quelle gespeichert;
Perspektive und automatische Entzerrung werden in der Desktop-App eingestellt.
Ein exklusiv belegtes Kameragerät muss dort freigegeben werden, bevor der Browser
es direkt als Webcam verwenden kann.

Entwicklung: DartRectify mit DR_DESKTOP_DEV=ON bauen; Dartcams auf
http://localhost:5173 starten. Nur diese Entwicklungs-Origin wird zusätzlich
für automatische Erkennung freigegeben.

`src/lib/dartrectify/client.js` und `.d.ts` sind gemeinsam übernommene Dateien aus
ingomc/DartRectify, Stand `b13736b` (`web/client.js`, `web/client.d.ts`). Änderungen dort zuerst
testen und beide Dateien gemeinsam aktualisieren. Der Client unterstützt auch
nur ein Heim- oder Gast-Bild und entfernt seine Beobachter beim Abbau.

Bridge-Anfragen sind ausdrücklich vom Service Worker ausgeschlossen. Token
werden nur im Arbeitsspeicher gehalten, niemals in Local Storage oder Cache API.

Prüfstand 29.09.2026: `bun run check` ohne Fehler oder Warnungen,
`bun run test` mit 24 bestandenen Tests und erfolgreicher Produktionsbuild.
Chrome und Edge wurden mit synthetischen und echten Kameraquellen geprüft:
später App-Start, zwei Streams, Bildbearbeitung, gespeicherte Auswahl und
Beschriftungen, Neustart, gemischter Webcam-Betrieb und verweigerter lokaler
Zugriff. Dafür wurden die lokalen Website-Dateien unter der Produktions-Origin
in isolierten Playwright-Profilen bereitgestellt; es fand kein Deployment statt.
Das reproduzierbare Skript liegt in DartRectify unter
`apps/desktop/tests/integration-browser.mjs`. Service-Worker-Cache-Ausschluss
und Cache-Bereinigung haben separate Unit-Tests. Physisches Abziehen einer
Kamera und der sichtbare Freigabedialog bleiben manuell abzunehmen.
