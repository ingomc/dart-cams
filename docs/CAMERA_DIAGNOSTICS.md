# Kamera-Diagnose

Unter **Einstellungen → Kamera-Diagnose** kann das Protokoll der letzten zehn
Minuten als JSON-Datei heruntergeladen und hier im Chat angehängt werden. Die
Aufzeichnung läuft automatisch. Sie bleibt nach einem Neuladen der Webapp im
Browser erhalten. Wenn Browser-Speicher gesperrt oder voll ist, zeigt die App
das an und hält die Ereignisse bis zum Neuladen im Arbeitsspeicher.

Das Protokoll enthält Zeitstempel, Kamerabereich und strukturierte Ereignisse:
Quellen- und Gerätewechsel, Browserberechtigungsfehler, Start und Ende von
Videostreams, Track-Mute und -Ende, Videoereignisse sowie alle zehn Sekunden
einen Zustandswert aktiver Kameras. Für DartRectify werden Verbindungswechsel,
Fehler, Boardstatus und Stichproben aus der vorhandenen Status-API festgehalten.
So lässt sich erkennen, ob ein Ausfall bei Gerätezugriff, Bildlieferung oder
lokaler Bridge beginnt.

Es werden keine Kamerabilder, DartRectify-Sitzungstoken, Geräte-IDs oder
3K-Event-Links gespeichert. Kameramodellnamen und beim Export der Browsertyp
können enthalten sein. Die
Webapp sendet das Protokoll an keinen Server; der Download ist der einzige
Weitergabeweg. Die interne Protokollierung der separaten Windows-App gehört
nicht zu diesem Export.
