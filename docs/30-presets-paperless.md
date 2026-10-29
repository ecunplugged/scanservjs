# A4, Scan-Voreinstellungen und Paperless-ngx

Dieser Fork von sbs20/scanservjs ergänzt eine direkt sichtbare Papierformatauswahl,
serverseitig gespeicherte Scan-Aufträge und die Paperless-ngx REST-API.
Die neuen Bedienelemente sind auf Deutsch und Englisch verfügbar.

Für eine direkte Debian-Installation einschließlich Updates siehe das
[Installationsskript](31-debian-installer.md).

## Installation auf Raspberry Pi / Linux mit Docker

Die offiziellen `sbs20/scanservjs`-Images enthalten die Änderungen dieses Forks
nicht. Das Image aus diesem Repository bauen (auf einem Pi mit 64-Bit-System
wird ein ARM64-Image erstellt):

```sh
git clone https://github.com/ecunplugged/scanservjs.git
cd scanservjs
docker build --target scanservjs-core -t scanservjs-paperless .
docker run -d --name scanservjs --restart unless-stopped \
  --privileged -p 8080:8080 \
  -v /var/run/dbus:/var/run/dbus \
  -v scanservjs-data:/var/lib/scanservjs \
  scanservjs-paperless
```

Der Aufruf mit USB-Zugriff entspricht der einfachen Upstream-Konfiguration.
Alternativen mit eingeschränkter Gerätefreigabe oder SANE-Netzwerkzugriff stehen
in der [Docker-Anleitung](02-docker.md). Das benannte Datenvolume erhält Scans,
Voreinstellungen, Einrichtung und offene Übertragungen über Containerwechsel
hinweg. Bei einem späteren Update dasselbe Volume weiterverwenden.

Die Oberfläche ist unter `http://<IP-des-Pi>:8080` erreichbar.
Für die direkte Installation ist Node.js 24 wie im Upstream-Build empfohlen.
`npm ci && npm run bootstrap && npm run build` baut den Fork lokal; das
Upstream-Bootstrap-Skript und veröffentlichte Upstream-Debian-Pakete installieren
hingegen nicht diesen Fork.

## 1. A4 auswählen

Im Scanformular steht nun eine sichtbare Auswahl **Papierformat** neben dem
Ausgabeformat (PDF, JPG usw.). A4-Hochformat (210 × 297 mm) war bereits im
Original vorhanden; A4-Querformat (297 × 210 mm) wurde ergänzt. Angeboten werden
nur Formate, die auf die vom Treiber gemeldete Scanfläche passen. Eine Toleranz
von 0,5 mm berücksichtigt Rundungsabweichungen. Bei der Auswahl wird die Fläche
auf das Gerätemaximum begrenzt und der Scanursprung auf links/oben zurückgesetzt.
Auch die vom Treiber unterstützten Seitengrößenparameter werden aktualisiert.
Bei Fujitsu-ADF-Geräten werden die separat gemeldeten Mediengrenzen
berücksichtigt, damit eine anfängliche Letter-Einstellung A4 nicht ausblendet
oder den Scan auf Letter-Höhe abschneidet.

Beim fi-7260 mit A4-breitem Einzug ist A4-Hochformat die passende Einstellung;
Querformat benötigt eine mindestens 297 mm breite Scanfläche.

## Dashboard und Voreinstellungen

Nach dem Öffnen erscheint das Dashboard. Jede gespeicherte Voreinstellung hat
einen großen Button, der den Scan unmittelbar startet. Unter **Voreinstellungen**
können Aufträge angelegt, bearbeitet, umbenannt und gelöscht werden. Änderungen
werden mit derselben ID gespeichert; der Dashboard-Button wird aktualisiert.
[Details zum Dashboard und zur optionalen Anmeldung](32-dashboard.md).

## 2. Scan-Aufträge speichern und abrufen

1. **Voreinstellungen → Neue Voreinstellung** öffnen.
2. Namen, Scanner, Einzug/Duplex, Auflösung, Farbmodus, Papierformat/Ausschnitt,
   Stapelverarbeitung, Filter und Ausgabeformat einstellen und **Speichern** wählen.
3. Im Dashboard den Button mit dem gespeicherten Namen antippen, um direkt zu scannen.
4. Zum Ändern **Voreinstellungen → Bearbeiten** verwenden. Dort können auch
   Namen geändert werden. **Voreinstellung löschen** öffnet einen Bestätigungsdialog.
5. Die Seite **Scannen** bietet weiterhin manuelle Einstellungen und die Möglichkeit,
   eine Voreinstellung zuerst abzurufen und vor dem Start anzupassen.

Die Einstellungen gelten für alle Browser am selben Scanserver und bleiben
nach einem Neustart erhalten. Der Stapelindex wird beim Abrufen auf 1 gesetzt.
Eine Voreinstellung für einen nicht verfügbaren Scanner wird mit einer Meldung
abgewiesen. Nach einem Treiberwechsel können veraltete Optionen eine erneute
Anpassung erfordern; die normale serverseitige Scanvalidierung bleibt aktiv.

## 3. Paperless-ngx einrichten

Unter **Einstellungen → Paperless-ngx einrichten**:

- Basis-URL der Instanz eintragen, z. B. `https://paperless.example.com` oder
  `http://192.168.1.20:8000`. Ein Unterpfad wird unterstützt; nicht `/api/` anhängen.
- API-Token eines Paperless-Benutzers eintragen, der Dokumente hochladen und den
  Importstatus lesen darf. Das Token findet sich im Paperless-Benutzerprofil.
- **Scans automatisch an Paperless senden** einschalten.
- Optional **Lokale Datei nach bestätigtem Paperless-Import löschen** einschalten.
  Die Löschfunktion ist anfangs ausgeschaltet.
- **Speichern** wählen. Ein leeres Tokenfeld behält das gespeicherte Token bei.

Der Pi muss die Paperless-Adresse erreichen können. `localhost` innerhalb des
Docker-Containers bezeichnet diesen Container, nicht einen anderen Rechner.

Die Einrichtung gilt serverweit. API-Tokens werden nicht an den Browser
zurückgegeben und nicht im HTTP-Anfragelog protokolliert. Sie liegen mit
Dateirechten `0600` in `data/job-settings.json` (installiert bzw. im Docker-Volume:
`/var/lib/scanservjs/job-settings.json`). Die Datei enthält auch die Voreinstellungen
und Importzuordnungen und gehört nicht ins Git-Repository. Backups entsprechend
schützen. Zugriff auf die Oberfläche bedeutet auch Zugriff auf die Einrichtung:
für Mehrbenutzerbetrieb die vorhandene [Authentifizierung](10-configuration.md)
unter **Einstellungen → Anmeldung** oder über einen authentifizierten Reverse Proxy einrichten.

## Übertragungs- und Löschverhalten

- Fertige Scans werden automatisch mit dem Multipart-Feld `document` an
  `/api/documents/post_document/` gesendet. Für mehrseitige Aufträge PDF wählen.
  ZIP-Archive aus mehreren einzelnen Ausgabedateien werden nicht importiert.
- Eine HTTP-200-Antwort allein löst **keine Löschung** aus. Die erhaltene
  Task-ID wird gespeichert und `/api/tasks/?task_id=…` abgefragt. Erst
  `SUCCESS` mit zugehöriger Dokument-ID gilt als bestätigter Import.
- Danach werden bei aktivierter Löschoption die lokale Ausgabedatei und ihr
  vorhandenes Thumbnail gelöscht. Die Vorschau folgt dem bestehenden
  scanservjs-Verhalten und bleibt bis zum nächsten Scan bzw. manuellen Löschen.
- Schlägt die Übertragung/Verarbeitung fehl, bleiben Datei und Thumbnail lokal.
  Der Scan selbst gilt weiterhin als abgeschlossen; die Oberfläche meldet den
  Paperless-Fehler separat.
- Läuft die Verarbeitung länger als zwei Minuten, endet die HTTP-Anfrage mit
  `pending`. Der Server prüft offene Importe weiter im Hintergrund (alle 30
  Sekunden) und setzt sie nach einem Neustart fort. Bekannte fehlgeschlagene
  Tasks werden nicht automatisch erneut hochgeladen.
- In der Dateiliste prüft die Schaltfläche **Paperless** einen bekannten Import
  erneut oder sendet eine noch nicht übertragene Datei. Identische Dateien am
  selben Pfad und zur selben Instanz werden anhand ihres SHA-256-Fingerprints
  einem bestehenden Task zugeordnet. Gleichzeitig ausgelöste Übertragungen
  derselben Datei werden zusammengeführt.
- Eine lokal veränderte oder ersetzte Datei wird nicht aufgrund eines älteren
  Imports gelöscht. Umbenannte Dateien werden nicht automatisch einem alten
  Task zugeordnet.
- Verbindungsabbrüche genau zwischen der serverseitigen Uploadannahme und dem
  Empfang/Speichern der Task-ID lassen sich ohne Idempotenzunterstützung der
  Gegenstelle nicht eindeutig auflösen. Vor manuellem erneutem Senden in
  Paperless prüfen. Ein als Duplikat abgelehnter Import führt zu keiner Löschung.

Die Integration richtet sich an Paperless-ngx und andere Systeme mit derselben
Upload-/Task-API, nicht an beliebige Dokumentenmanagementsysteme.

API-Grundlage: [Paperless-ngx REST API](https://docs.paperless-ngx.com/api/).

## REST-Endpunkte

Alle Endpunkte verwenden die bestehende scanservjs-Authentifizierung.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| GET | `/api/v1/presets` | Voreinstellungen auflisten |
| POST | `/api/v1/presets` | `{name, request}` speichern/aktualisieren |
| DELETE | `/api/v1/presets/:id` | Voreinstellung löschen |
| GET | `/api/v1/paperless` | Einrichtung lesen; nur `tokenConfigured`, kein Token |
| PUT | `/api/v1/paperless` | `{enabled, url, token, deleteAfterTransfer}` speichern |
| POST | `/api/v1/files/:name/paperless` | Datei senden / vorhandenen Task erneut prüfen |

`POST /api/v1/scan` enthält zusätzlich `paperless` mit `status` (`disabled`,
`success`, `pending`, `error`), `deleted` und gegebenenfalls `documentId`,
`taskId` oder `message`.

## Prüfung

Die neuen Tests decken Persistenz, Tokenbehandlung, Multipart-Upload,
Taskstatus, verzögerte Verarbeitung, Fehler, deaktivierte Löschung, veränderte
Dateien, Wiederaufnahme und parallele Anfragen mit einem lokalen Paperless-Mock
ab. Ausführen unter Linux mit Node.js 24 und ImageMagick:

```sh
npm ci
npm run bootstrap
npm run lint
npm test
npm run build
```

Ein physischer fi-7260 und eine echte Paperless-Instanz sind für die abschließende
Prüfung vor Ort erforderlich.
