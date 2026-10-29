# Dashboard, Voreinstellungsverwaltung und optionale Anmeldung

## Dashboard als Startseite

Die Oberfläche startet unter `/#/dashboard`, auch im installierten Web-App-Modus.
Direktlinks, z. B. auf `/#/settings`, bleiben beim Neuladen erhalten.

Für jede gespeicherte Voreinstellung wird ein großer Button angezeigt. Papier
einlegen und den passenden Button antippen: Der Scan startet direkt mit dem
aktuellen gespeicherten Auftrag. Auf dem Dashboard werden anschließend der
Dateiname und gegebenenfalls der Paperless-Status angezeigt. Die Datei ist unter
**Dateien** verfügbar, sofern sie nach dem Import nicht gelöscht wurde.

Während eines Auftrags sind weitere Start-Buttons deaktiviert. Manuelle
Mehrseiten-Aufträge behalten ihre Dialoge für nächste Seite, erneut scannen,
abschließen oder abbrechen. Das gilt auch bei einem Seitenwechsel innerhalb der
Anwendung. Fehler werden als Meldung angezeigt; sie gelten nicht als erfolgreich
abgeschlossener Scan, und die Oberfläche gibt den nächsten Versuch wieder frei.

## Voreinstellungen verwalten

Unter **Voreinstellungen** (`/#/presets`) stehen folgende Aktionen bereit:

- **Neue Voreinstellung**: Namen und Scanoptionen festlegen und speichern.
- **Bearbeiten**: Optionen oder Namen ändern. Die ID bleibt gleich, sodass kein
  zusätzlicher Dashboard-Button durch das Umbenennen entsteht.
- **Voreinstellung löschen**: Eintrag nach Bestätigung entfernen. Bereits
  gescannte Dokumente werden dadurch nicht gelöscht.

Unter **Scannen** bleibt der manuelle Scan möglich. Eine gespeicherte
Voreinstellung kann dort abgerufen und vor dem Start angepasst werden.

## Anmeldung ist optional

Bei Neuinstallationen und älteren Einstellungsdateien ohne Login-Einstellung ist
keine Anmeldung erforderlich. Das gilt auch, wenn eine ältere lokale
`config.local.js` noch die vom früheren Installer erzeugten `config.users`
enthält. Vorhandene Zugangsdaten werden dadurch nicht gelöscht.

Zum Einschalten: **Einstellungen → Anmeldung**, Benutzername und Passwort
festlegen, **Anmeldung erforderlich** aktivieren und speichern. Danach fordert
beim nächsten geschützten Zugriff die Browser-Anmeldung diese Zugangsdaten an.
Ein leeres Passwortfeld behält ein bereits gespeichertes Passwort bei.
Gespeicherte Login-Passwörter werden gesalzen gehasht; weder Passwort noch Hash
werden an den Browser zurückgegeben. Bereits konfigurierte `config.users`
können beim erstmaligen Aktivieren unter dem passenden Benutzernamen ebenfalls
weiterverwendet werden.

Zum Ausschalten denselben Schalter deaktivieren und speichern. Die Auswahl bleibt
bei Neustarts und Updates erhalten. Wenn die Anmeldung ausgeschaltet ist, können
Geräte mit Netzwerkzugriff die Oberfläche einschließlich Einrichtung verwenden.

## Technische Korrekturen am Scan-Ablauf

- Gemeinsamer Scan-Ablauf für manuelle Scans und Dashboard, einschließlich
  Fehlerbehandlung und Mehrseiten-Dialogen.
- HTTP-Fehler werden nicht mehr als erfolgreiche Scan-Antwort weiterverarbeitet.
- Fortschrittsmasken werden auch bei Fehlern zuverlässig freigegeben.
- Der Schalter für dynamisches Lineart schreibt in `dynamicLineart` und nicht
  mehr fälschlich in den Farbmodus; alte boolesche Farbmodus-Werte werden repariert.
- Beim Wechsel zwischen Flachbett und ADF werden aktive Treiberoptionen vor dem
  Scan aktualisiert. Dadurch werden keine deaktivierten ADF-Parameter an das
  Flachbett übergeben.
- Gleichzeitige Scannerzugriffe werden mit HTTP 409 abgewiesen.

Neue API-Endpunkte:

| Methode | Pfad | Zweck |
| --- | --- | --- |
| POST | `/api/v1/presets/:id/scan` | Direkt mit gespeicherter Voreinstellung scannen |
| GET | `/api/v1/authentication` | Login-Status ohne Zugangsdaten lesen |
| PUT | `/api/v1/authentication` | `{enabled, username, password}` speichern |

`POST /api/v1/presets` akzeptiert außerdem optional `id`, um einen bestehenden
Eintrag einschließlich seines Namens zu ändern. Ein Namenskonflikt wird abgewiesen.
