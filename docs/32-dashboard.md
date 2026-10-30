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

## Paperless direkt im Dashboard steuern

Ab Version 3.3.3 enthält das Dashboard zwei kompakte Schalter neben **Voreinstellungen verwalten**:

- **Paperless** aus: Neue Scans bleiben ausschließlich lokal unter **Dateien**.
- Übertragung an und **autom. löschen** aus: Scans werden an Paperless gesendet und bleiben zusätzlich lokal erhalten.
- Beide an: Die lokale Datei wird erst nach bestätigtem erfolgreichem Import gelöscht.

Die Auswahl wird sofort serverseitig gespeichert, gilt auch für manuelle Scans
und bleibt nach Neustarts und Updates erhalten. URL und API-Token werden weiterhin
unter **Einstellungen** eingerichtet. Ohne diese Angaben lässt sich die Übertragung
nicht aktivieren. Bei ausgeschalteter Übertragung ist der Löschschalter deaktiviert;
seine bisherige Auswahl bleibt für das spätere Einschalten erhalten.

Während eines laufenden Dashboard-Auftrags sind die Schalter gesperrt. Bereits
an Paperless übergebene Dokumente werden durch das Abschalten nicht zurückgerufen.
Noch offene Importprüfungen ruhen bei ausgeschalteter Übertragung und werden nach
dem Einschalten wieder aufgenommen. Bereits gelöschte Dateien werden nicht wiederhergestellt.

`PATCH /api/v1/paperless` akzeptiert `enabled` und/oder `deleteAfterTransfer`
als Boolean. URL, Token und der jeweils andere Schalter bleiben unverändert.

## Fortschritt und Paperless-Abschluss

Auf dem Dashboard wird der jeweils echte Bearbeitungsschritt angezeigt:

1. Dokumente scannen.
2. Bilder verarbeiten und PDF erstellen.
3. Datei an Paperless übertragen.
4. Import durch Paperless abwarten.

Die Anzeige enthält die Zeit im aktuellen Schritt. Abgeschlossene Schritte sind
mit Häkchen markiert. Eine Prozentangabe wird nicht geschätzt, weil der Scanner
und Paperless keine verlässliche Gesamtdauer liefern.

Die Oberfläche fragt den Auftragsstatus einmal pro Sekunde ab. Die Übertragung
läuft serverseitig außerhalb der Scanner-Sperre. Nach bestätigtem Import endet
der Busy-Zustand; die optionale lokale Löschung bleibt an die Bestätigung gekoppelt.
Unterstützt werden sowohl die ältere Paperless-Antwort (`SUCCESS`,
`related_document`) als auch die aktuelle Antwort (`success`,
`result_data.document_id` bzw. `related_document_ids`).

Jede Paperless-Anfrage hat eine feste Gesamtzeitbegrenzung von 30 Sekunden,
auch wenn bereits Header oder Teile der Antwort eingetroffen sind. Nach rund
zwei Minuten Importprüfung wird ein noch nicht fertiger Import als
**im Hintergrund laufend** angezeigt; eine gerade laufende HTTP-Anfrage kann
noch bis zu 30 Sekunden benötigen. Die lokale Datei bleibt erhalten und der
Busy-Zustand endet. Der vorhandene Hintergrunddienst prüft den Import weiter.
Über **Dateien → Paperless** lässt sich der Status erneut prüfen, ohne einen
bekannten Auftrag nochmals hochzuladen.

Die Browser-Statusabfrage ist ebenfalls zeitlich begrenzt. Bei einem
Verbindungsabbruch kann der Server weiterarbeiten; vor einem erneuten Scan die
Dateiliste bzw. Paperless prüfen. Statusobjekte werden im Arbeitsspeicher
gehalten und sind nach einem Serverneustart nicht mehr verfügbar. Gespeicherte
Paperless-Task-IDs bleiben für die Wiederaufnahme erhalten.

Für API-Clients bleibt das bisherige synchrone Verhalten erhalten. Mit
`async: true` an `POST /api/v1/scan` bzw. `POST /api/v1/presets/:id/scan` wird
sofort HTTP 202 mit `jobId` geliefert. `GET /api/v1/scan-jobs/:id` liefert
`stage`, `done`, `result` und `error`. Bei manuellen Stapeln enthält `result`
weiterhin `index` und gegebenenfalls `image`; nach Fertigstellung `file` und
`paperless`.

API-Grundlage: [Paperless-ngx REST API](https://docs.paperless-ngx.com/api/).

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
