# SCO Dartcams Design-System

Die Oberfläche übernimmt die dunkle Farb- und Formensprache des bereitgestellten Fülltreffer-Styleguides. Der Produktname bleibt **SCO Dartcams**. Es wird kein Vereinslogo aus der Rastergrafik nachgezeichnet.

## Grundlagen

Die zentralen Variablen stehen in `src/lib/styles/tokens.css`; die wiederverwendbaren Bedienelemente in `src/lib/styles/components.css`. Beide Stylesheets werden einmalig im Root-Layout eingebunden.

| Rolle | Wert | Verwendung |
| --- | --- | --- |
| Hintergrund | `#151719` | App und Eingaben |
| Fläche / erhöhte Fläche | `#222426` / `#2B2D30` | Leisten, Panel, Karten |
| Rahmen | `#3A3D40` | Trennung und Konturen |
| Primärrot / aktiv | `#BE0826` / `#98051E` | Primäraktionen und aktive Flächen |
| Roter Textakzent | `#F04C62` | Links und Fokus auf dunklem Grund |
| Text | `#FFFFFF`, `#D1C7CA`, `#A7A0A3` | Primär, sekundär, gedämpft |
| Status | `#2FA36B`, `#E1A52A`, `#D93A4E`, `#5A8DEE` | Live, Warnung, Fehler, Information |

Das Rot `#BE0826` wird mit weißer Schrift für gefüllte Buttons verwendet. Kleine rote Schrift nutzt `#F04C62`, weil das Primärrot auf dem dunklen Hintergrund zu wenig Kontrast bietet. Statusfarben behalten ihre eigene Bedeutung und werden nicht durch Markenrot ersetzt.

**Schriften:** Inter 400/500/600/700 für Bedienung und Fließtext; Oswald 500/600/700 für Überschriften, Kamera-Labels und Score-Zahlen. Die Fontdateien sind über `@fontsource` lokal gebündelt. Abstände folgen dem 8-Pixel-Raster, mit 4 Pixeln für enge Bedienelemente.

## Bausteine

- `.ui-button` mit `--primary`, `--secondary`, `--quiet` und `--small`; Icon-Buttons nutzen `.ui-icon-button`.
- `.ui-field` für Textfelder, Zahlenfelder und Selects; `.ui-range` für Regler.
- `.ui-panel` für zusammengehörige Einstellungen, `.ui-badge` mit Statusvarianten für Live/Offline/Fehler.
- `.ui-label`, `.ui-section-title` und `.ui-help` für eine einheitliche Texthierarchie.

Alle interaktiven Elemente erhalten sichtbare Fokuszustände. Deaktivierte Aktionen bleiben lesbar, wirken aber zurückgenommen. Statusmeldungen enthalten Text und verlassen sich nicht allein auf Farbe.

## Anwendung in der Kameraansicht

Die Broadcast-Fläche priorisiert die zwei Kameras und die Score-Overlays. Die schmale Leiste zeigt den Verbindungsstatus; das rechts einblendbare Panel bündelt die Einstellungen. Die optionale 3K-Ansicht bleibt unter den Kameras und lässt sich weiter in der Höhe verändern. Der Inhalt des externen 3K-Iframes kann von der App nicht gestaltet werden; nur dessen Rahmen und die eigenen Steuerelemente folgen dem Design-System.

Desktop ist die Zielplattform (ab 1024 Pixel Breite). Für neue Bedienelemente zuerst die vorhandenen Tokens und Klassen verwenden; lokale CSS-Werte nur für die besondere Geometrie eines Bausteins ergänzen.
