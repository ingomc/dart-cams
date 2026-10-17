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

Die Broadcast-Fläche priorisiert die zwei Kameras. Pro ausgewähltem Board sitzt ein kompaktes Zwei-Zeilen-Scoring oben rechts; die Spielerzeilen zeigen Darts, letzte Aufnahme und Restscore. Bei Liga-Events steht der Mannschaftsstand direkt in den unteren Kameralabels; eine separate Ergebnisleiste entfällt. Die 40 Pixel hohe App-Leiste sitzt am unteren Rand. Rechts stehen die Status-Pills für DartRectify und Live-Scoring nebeneinander, gefolgt von den 28 Pixel hohen Buttons „DartRectify verbinden“ (nur ohne Verbindung) und Einstellungen (Icon mit Beschriftung für Screenreader und Tooltip). Das allgemeine Einstellungen-Panel öffnet darüber; Verbindungshinweise erscheinen oberhalb der unteren Leiste. Die optionale 3K-Ansicht bleibt unter den Kameras und lässt sich weiter in der Höhe verändern. Der Inhalt des externen 3K-Iframes kann von der App nicht gestaltet werden; nur dessen Rahmen und die eigenen Steuerelemente folgen dem Design-System.

Je ein kompaktes Zahnrad neben dem unteren Kameranamen öffnet Quelle, Bezeichnung, Boardzuweisung und Bildeditor. Zusätzliche Kamera-Überschriften entfallen. Das Menü sitzt mit 8 Pixeln Abstand oberhalb des Labels, bei Heim links und bei Gast rechts. Seine verfügbare Höhe berücksichtigt die tatsächliche Labelhöhe; lange Menüs scrollen. Menütitel, Tooltip und zugängliche Button-Beschriftung verwenden den Kameranamen, bei leerer Bezeichnung „Heim“ beziehungsweise „Gast“. Escape und Schließen stellen den Fokus auf das zugehörige Zahnrad zurück. Nur das Zahnrad blendet bei Inaktivität aus; das Label bleibt sichtbar.

Die Labels sind spiegelbildlich angeordnet: Von außen nach innen folgen roter Balken, Logo, Kameraname, gewonnene Spiele/Sätze, Legs in Klammern und Zahnrad. Heim zeigt beispielsweise `▌ Logo Heim 5 (18) ⚙`, Gast `⚙ (14) 3 Gast Logo ▐`. Nur die Reihenfolge wird umgekehrt, nicht Text oder Bild. Spiele/Sätze sind weiß und kräftig; die Legs haben dieselbe Schriftgröße und Grundlinie bei 65 % Deckkraft. Die gesamte Darstellung folgt dem vorhandenen Regler für Kamera-Labels. Nur der Name wird bei Platzmangel gekürzt; Logo, Zahlen und Zahnrad schrumpfen nicht. In einer Einzelansicht bleibt ausschließlich das Label der sichtbaren Kamera erhalten.

Spiele/Sätze und Legs stammen gemeinsam aus dem jüngsten gültigen Datensatz der ausgewählten Liga-Boards (`setsHome`/`setsGuest`, `legsHome`/`legsGuest`); die gemeinsamen Gesamtwerte werden nie über Boards addiert. Ohne gültigen Mannschaftsstand bleibt das Label ohne Zahlen. Fehlende oder ungültige Legs erscheinen als `(–)`, echte Nullwerte als `(0)`. Bei einem unterbrochenen Feed bleiben vorhandene Werte sichtbar und werden im Tooltip sowie für Screenreader als „letzter Stand“ gekennzeichnet. Die vorhandene Verbindungsanzeige bleibt erhalten. Ergebnis, Logo und Kameraname blenden bei Inaktivität nicht aus.

Das zugewiesene Live-Scoring bleibt auch bei geöffneten Kameraeinstellungen an seiner Position sichtbar und reagiert sofort auf die Boardauswahl. Das Einstellungen-Panel darf den Score überdecken.

Neben dem App-Namen links in der unteren Leiste stehen drei kompakte Layout-Icons: beide Kameras 50/50, nur Kamera 1 und nur Kamera 2. Die Einzelansichten nutzen die gesamte Kamerabreite; die andere Kamera und der Breitentrenner sind ausgeblendet. Der 50/50-Button setzt eine manuell verschobene Teilung auf die Mitte zurück. Kameraquellen und Boardzuweisungen bleiben beim Wechsel erhalten. Während der Bildbearbeitung sind die Layout-Buttons deaktiviert.

Beim Öffnen der Einstellungen bleibt der Fokus am auslösenden Button. Ein gefülltes Event-Link-Feld bietet ein Löschen-Kreuz direkt im Feld.

Das allgemeine Panel trägt nur die kompakte Überschrift „Einstellungen“. Einblendungen, DartRectify, Live-Scoring und Ansicht sind zunächst geschlossene Akkordeons; jeweils ein Bereich lässt sich öffnen. Im Inhalt stehen direkt Labels und Bedienelemente ohne Erklärungstexte. Die Akkordeons sind per Tab, Enter und Leertaste bedienbar.

Die schwebende Webcam besteht aus dem horizontal gespiegelten Videobild ohne Kopf- oder Fußleiste. Das Bild lässt sich direkt verschieben; unten rechts sitzt ein Griff zur Größenänderung, der auch auf Pfeiltasten reagiert. Oben rechts liegen Zahnrad und Schließen-Kreuz auf kontrastreichen Flächen. Das Zahnrad öffnet die Kameraauswahl im Bild ohne automatischen Fokus ins Feld; Escape schließt die Auswahl.

Nach 20 Sekunden ohne Maus- oder Tastaturaktivität blenden App-Leiste, Kamera-Zahnräder, Trenner und Webcam-Controls aus. Bewegung, Klick oder Tastaturbedienung zeigt sie wieder. Solange Einstellungen aufgeklappt sind, ein Bild bearbeitet oder ein Element gezogen wird, bleiben die Controls sichtbar. Tastaturfokus bleibt erkennbar. Kamerabilder, Kamera-Bezeichnungen, Scores und Teamstand bleiben sichtbar; beim Ausblenden schrumpft der Kamerazwischenraum von 18 auf 4 Pixel, die App-Leiste von 40 auf 4 Pixel und der Trenner zur Live-Ansicht ebenfalls auf 4 Pixel inklusive Abstand. Dadurch erhalten die Bilder mehr Platz. Aktivität stellt die ursprünglichen Maße wieder her; bei reduzierter Bewegung erfolgt der Wechsel ohne Animation.

In den allgemeinen Einstellungen rechts unten gibt es unter „Einblendungen“ genau zwei Regler: einen für alle Kamera-Labels und einen für das gesamte Live-Scoring beider Kameras (50–200%, Standard 100%). Alle Schriften und Abstände im Scoring skalieren gemeinsam; die Änderungen erscheinen sofort. Namensbreiten nutzen `ch` (Spielernamen bis 12ch, Kamera-Labels bis 24ch) und werden durch die Kamerabreite begrenzt. Verschobene Scoreboards bleiben beim Vergrößern innerhalb des Kamerabilds. „Größen zurücksetzen“ stellt die ursprünglichen Größen wieder her. Die globalen Werte werden unabhängig von Kameraquelle und Event unter `dartCamOverlaySizes` gespeichert; bestehende Speicherkeys bleiben erhalten. Standardwerte und Grenzen stehen in `src/lib/overlaySizes.ts`.

Desktop ist die Zielplattform (ab 1024 Pixel Breite). Für neue Bedienelemente zuerst die vorhandenen Tokens und Klassen verwenden; lokale CSS-Werte nur für die besondere Geometrie eines Bausteins ergänzen.

## Automatische Spielauswahl und Vereinslogos

Unter „Live-Scoring“ ist „Spiel automatisch aus Fülltreffer“ standardmäßig aktiv. Beim Start wird das aktuelle beziehungsweise nächste SCO-Spiel ausgewählt und dessen 3K-Link übernommen. Die kompakte Spielkarte zeigt Paarung, Spieltag und Datum; der Aktualisieren-Button wählt bei Bedarf erneut. Minütliche Hintergrundabfragen behalten das ausgewählte Spiel samt Endstand bei. Ohne Live-Daten lautet der Status „Warte auf Live-Scoring“. Boardzuweisungen werden für noch nicht konfigurierte Plätze automatisch ergänzt, sobald Boards verfügbar sind; gespeicherte Auswahlen einschließlich bewusst ausgeblendeter Scores bleiben erhalten.

Der automatische Link ist schreibgeschützt. Wird der Switch ausgeschaltet, stehen Texteingabe, Löschen-Kreuz und „Verbinden“ wieder zur Verfügung. Ein Ausfall der Spielauswahl unterbricht bestehendes Scoring nicht; bei einem Neustart wird der letzte bekannte Kontext beziehungsweise Event verwendet und in den Einstellungen als Ersatzstand kenntlich gemacht. `dartScoringAutomatic` speichert den Modus, `dartScoringAutoContext` den validierten Kontext; `dartScoringEventUrl` und `dartScoringBoards:<event>` bleiben bestehen.

Fülltreffer liefert ausschließlich Spielmetadaten und absolute Logo-Adressen. Logo-Pflege bleibt in Dartstory; die Zuordnung erfolgt über 3K-Teilnehmer-IDs. Auf der Außenseite neben Heim/Gast erscheint das passende Logo mit 24 Pixeln Grundgröße, proportional zur globalen Labelgröße. Das Bild wird vollständig und unverzerrt dargestellt. Fehlende oder nicht ladbare Logos entfallen ohne Platzhalter; Kameranamen und ihre Bearbeitung bleiben unverändert. Logo und Label bleiben auch bei ausgeblendeten Controls sichtbar.

## Bildprofile und Speicherung

Der Start erfolgt mit beiden Boards. Die drei Layout-Presets verwenden getrennte Bildprofile; eine manuell verschobene Zweiteilung bleibt im Profil `split`. Der Bildeditor zeigt zunächst einen Entwurf. Erst „Übernehmen“ speichert ihn über das typisierte `settingsApply`-Ereignis von `CameraView`; Abbrechen und Escape verwerfen ihn.

| Speicher | Geltungsbereich | Bildwerte |
| --- | --- | --- |
| `dartCamLayoutSettings`, Version 1 | Layout (`split`, `cam1`, `cam2`), Kameraplatz und Quelle | Maskenstatus, Radius, weiche Kante, Zoom, Position, Drehung, Achsenskalierung und manuelle Perspektivkorrekturen |
| `dartCamSettings` | Kameraquelle, gemeinsam für alle Layouts und Kameraplätze | Helligkeit, Kontrast, Sättigung, Schärfe und automatische Scheibenkalibrierung |

Beim ersten Laden werden vorhandene Bildwerte unabhängig in alle drei Layouts und beide Kameraplätze übernommen. Die alten Geometriewerte im Quellenspeicher bleiben als Migrationsbasis erhalten. Neu ausgewählte Quellen erhalten ebenfalls alle drei Profile vor der ersten Änderung. Ein Layout- oder Quellenwechsel kombiniert das entsprechende Bildprofil mit den gemeinsamen Quellwerten. Bereits entzerrte DartRectify-Bilder behalten ihre Einschränkungen für Perspektive, Achsenskalierung und automatische Kalibrierung.

Kameraquellen, Bezeichnungen, Boardzuweisungen und globale Schriftgrößen behalten ihre bisherigen Speicher und gelten unabhängig vom Bildprofil. Während einer Bildbearbeitung sind die Layout-Buttons gesperrt.

## Livestream zu Owncast

Der Qualitätshinweis nennt **1080p / 25 fps · Video bis 3 Mbit/s · ohne Ton**. Es wird keine Audiospur aufgenommen oder künstlich erzeugt. Aufnahme, Sendebilder und Encoder verwenden ein gemeinsames Profil. Ein veralteter Helfer zeigt einen konkreten Update-Hinweis statt einen vermeintlichen Full-HD-Stream zu starten. Owncast codiert serverseitig **1080p · 25 FPS** mit 2,5 Mbit/s und **720p · Sparsam** mit 1,2 Mbit/s für schwächere Zuschauerverbindungen; die Qualitätsauswahl liegt im Zuschauerplayer.

Der kompakte Button **Stream** in der unteren Leiste öffnet das Akkordeon **Livestream** mit Sendesymbol. Dort stehen Helferstatus, Zuschauer-Link, RTMP-Server, maskierter Stream-Key, die Sendebild-Auswahl, Start/Stop und der kopierbare Zuschauer-Link. Beim Start schließt das Panel; die Browserfreigabe hebt den aktuellen Tab hervor. Ein laufender Stream zeigt unten **Stop** mit Stoppsymbol in Markenrot und die drei kompakten Schalter **Start / Live / Pause**. Während des Verbindens steht dort **Abbrechen**; Fehler öffnen den Livestream-Bereich mit einer konkreten Meldung. Der Status „Sendet …“ erscheint erst nach Encoder-Fortschritt zum Server.

Die Sendebild-Schalter verwenden Outline-Icons, verständliche Beschriftungen und `aria-pressed`; die aktuelle Auswahl ist rot hervorgehoben. Bei wenig Platz zeigt die Leiste nur die beschrifteten Icons mit Tooltip. Dieselbe Auswahl steht in den Einstellungen mit Vorschau der beiden SCO-Motive. Standard und Zustand nach Stop sind **Startbild**. **Live** sendet das gerenderte Tab-Bild einschließlich geöffneter Menüs; **Startbild** und **Pause** senden ausschließlich das jeweilige Motiv. Die eigenen Kameras bleiben in allen Szenen sichtbar. Umschalten unterbricht weder Recorder noch Stream-Verbindung.

Firefox verwendet eine Fensteraufnahme; der Status fordert dort zur Wahl des Dartcams-Fensters auf. Ein kurzer Hinweis erklärt Vollbild und die Sichtbarkeit von Fensterleisten bzw. Tabwechseln. Liefert Firefox keinen Quellentyp, öffnet sich das Panel mit einer lokalen Aufnahmevorschau, **Dieses Fenster streamen** und **Abbrechen**. Erst die Bestätigung startet die Übertragung. Erkannte Bildschirmquellen werden abgewiesen. Chrome/Edge verwenden die Tab-Aufnahme.

Die Controls nutzen dieselben Fokus- und Idle-Regeln wie die übrige Leiste. Stoppen ist zusätzlich über die sichtbare Freigabeanzeige des Browsers möglich. Kamera-/Scoringlogik und gespeicherte Bildprofile bleiben unabhängig. Der Stream-Key liegt ausschließlich im lokalen Helfer bis zu dessen Neustart. Einrichtung und Grenzen: [Livestream-Anleitung](docs/LIVESTREAM.md).

## Bewegung

Die Kameraauswahl der schwebenden Webcam bietet „Geräte aktualisieren“, um die Geräteliste ohne Seitenreload neu zu laden und bei Bedarf die Kamera-Freigabe anzufragen. „Bild spiegeln“ schaltet die horizontale Spiegelung ein oder aus; standardmäßig ist sie aktiv, der Button zeigt den Zustand rot an. Startfehler erscheinen direkt im Webcam-Menü. Beim Wechseln oder Schließen werden verspätet gelieferte Streams beendet.

Nur wechselnde Restscore-Zahlen nutzen `TextMorph` aus `torph/svelte`: 180 ms, `ease-out`, ohne Skalierung oder Federbewegung. Unveränderte Werte animieren nicht; der erste Stand und ein Spieler- oder Matchwechsel erscheinen sofort. Fehlende Werte bleiben ein statischer Gedankenstrich; die Siegeranzeige bei 0 erscheint direkt. `prefers-reduced-motion` wird respektiert. Namen, Average, Legs, Teamstand bleiben ohne Texteffekte. Neue letzte Aufnahmen leuchten kurz weiß auf und verblassen innerhalb von 1,8 Sekunden zum gedämpften Textgrau; auch aufeinanderfolgende gleiche Würfe werden bei geändertem Dartzähler oder Restscore hervorgehoben.

Die Einstellungs-Akkordeons verwenden `SettingsSection`: passende Outline-Icons, tastaturbedienbare Überschriften mit `aria-expanded` und eine 200-ms-Höhenanimation beim Öffnen und Schließen. Jeweils ein Bereich bleibt offen; reduzierte Bewegung deaktiviert die Animation.
