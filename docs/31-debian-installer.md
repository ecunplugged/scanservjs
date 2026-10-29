# Debian: automatische Installation und Updates

Das Skript `scripts/install-debian.sh` installiert diesen Fork auf Debian 12/13
mit amd64 oder arm64, z. B. einem Raspberry Pi mit einem 64-Bit-Debian-System.
Im normalen Betrieb wird ein laufendes systemd vorausgesetzt.

## Installieren oder aktualisieren

```sh
curl -fsSL https://raw.githubusercontent.com/ecunplugged/scanservjs/master/scripts/install-debian.sh \
  -o install-scanservjs-debian.sh
sudo bash install-scanservjs-debian.sh
```

Zum Aktualisieren dieselben beiden Befehle erneut ausführen. Dadurch wird auch
das Installationsskript selbst auf den neuesten Stand gebracht. Ein altes lokales
Git-Checkout wird weder verwendet noch geändert: Jeder Lauf lädt den aktuellen
`master`-Zweig in ein neues Build-Verzeichnis. Der ausgecheckte Commit wird in
`/etc/scanservjs/installed-commit` festgehalten.

Das Skript:

1. Installiert Node.js 24, npm, Compilerwerkzeuge, SANE, ImageMagick,
   Ghostscript und Tesseract mit deutschen/englischen Sprachdaten.
   Wenn Node.js 24 fehlt, wird das offizielle NodeSource-APT-Repository verwendet.
2. Baut und testet den Fork unter einem separaten Build-Benutzer ohne Root-Rechte.
   Bei einem Build-Fehler bleibt ein vorhandener Dienst weiter in Betrieb.
3. Hält einen vorhandenen Dienst erst nach erfolgreichem Build an und sichert
   Konfiguration, Paperless-/Voreinstellungsdatei sowie lokale systemd-Dienstdateien.
4. Installiert das erzeugte Debian-Paket ausdrücklich erneut, auch wenn die
   Paketversionsnummer gegenüber dem letzten Lauf gleich geblieben ist.
5. Aktiviert `scanservjs.service` für den Systemstart, startet ihn neu und prüft
   seinen Status. Der Dienst läuft als Benutzer `scanservjs`, nicht als root.

Bei einer neuen Installation ist die Oberfläche unter
`http://<IP-des-Debian-Rechners>:8080` erreichbar. Der Benutzername ist `scanner`.
Ein zufälliges Passwort wird am Ende angezeigt und zusätzlich unter
`/etc/scanservjs/install-credentials.txt` gespeichert (nur für root lesbar).
Diese Zugangsdaten gelten für die lokale Weboberfläche; die Paperless-Zugangsdaten
werden anschließend in der Oberfläche eingerichtet.

Bestehende `config.local.js` und Zugangsdaten werden nicht ersetzt.
Voreinstellungen und Paperless-Einrichtung bleiben in
`/var/lib/scanservjs/job-settings.json`, Scans in
`/var/lib/scanservjs/output/` erhalten. Die Sicherungen unter
`/var/backups/scanservjs-install.*` enthalten Konfiguration und Importstatus;
sie sind keine vollständige zusätzliche Kopie aller Scans.

## Ältere Quellinstallation übernehmen

Wenn ein älterer Dienst direkt aus einem ausgecheckten Repository läuft,
seinen bisherigen Installationsordner mitgeben:

```sh
sudo bash install-scanservjs-debian.sh --migrate-from /opt/scanservjs
```

Erwartet werden dort `data/` und/oder `config/`. Die Daten werden an den
Standardort übernommen, ohne bestehende Zieldateien zu überschreiben.
Eine dort vorhandene `config/config.local.js` wird übernommen, sofern am neuen
Ziel noch keine existiert. Die Originalquellen und Originaldaten werden erhalten.
Der bekannte alte Ort `/var/www/scanservjs` wird automatisch erkannt, wenn am
neuen Ort noch keine Ausgabedateistruktur existiert.

Eine lokale `/etc/systemd/system/scanservjs.service` und vorhandene Drop-ins
werden gesichert und durch den Paketdienst ersetzt. So verweisen
`ExecStart` und `WorkingDirectory` nach dem Update nicht mehr auf alte Quellen.
Vorhandene Autostart-Verknüpfungen werden auf den Paketdienst umgestellt.
Individuelle Dienstanpassungen, Umgebungsvariablen und Konfigurationen aus v2
müssen vor der Migration geprüft und bei Bedarf an die aktuelle Konfiguration
angepasst werden; sie werden nicht automatisch in ein neues Format übersetzt.

Scheitert die Paket-/Dienstumstellung, versucht das Skript, gesicherte lokale
Dienstdateien wiederherzustellen und einen zuvor laufenden Dienst erneut zu
starten. Das ersetzt keinen vollständigen Rollback eines bereits ersetzten
Debian-Pakets. Die Sicherungsverzeichnisse bleiben erhalten.

## Weitere Optionen

```sh
# Bestimmten Branch oder Tag statt master installieren:
sudo bash install-scanservjs-debian.sh --ref mein-tag

# Für ein System-Image ohne laufendes systemd:
sudo bash install-scanservjs-debian.sh --offline

# Hilfe:
bash install-scanservjs-debian.sh --help
```

`--offline` aktiviert den Autostart für den nächsten Boot, startet im Container
aber keinen Dienst. Auf einem normal laufenden Debian-System diese Option
weglassen. Ein bereits angeschlossener Scanner ist für die Installation nicht
zwingend erforderlich; im Normalbetrieb wird die Erkennung abschließend geprüft.

Status und Protokoll:

```sh
sudo systemctl status scanservjs --no-pager
sudo journalctl -u scanservjs -n 100 --no-pager
```

Die Standardkonfiguration ist für das eigene LAN vorgesehen; für externen Zugriff
einen HTTPS-Zugang einrichten. Das Skript öffnet keine Firewall und konfiguriert
keine Portweiterleitung. Die ImageMagick-Regeln werden für PDF-Ausgabe und die
von scanservjs verwendeten Dateilisten angepasst; vorhandene Regeln werden vor
der zusätzlichen Anpassung in `policy.xml.before-scanservjs` gesichert.

Details zu A4, Scan-Aufträgen und Paperless stehen in
[Einrichtung der Fork-Funktionen](30-presets-paperless.md).

## Installer prüfen

Mit Docker lassen sich Neuinstallation und anschließendes Update in einem
isolierten Debian-Container prüfen:

```sh
bash test/install-debian.integration.sh 12
bash test/install-debian.integration.sh 13
```

Der Test prüft unter anderem:

- Installation aller Abhängigkeiten und Build des Forks;
- erneute Installation bei gleicher Versionsnummer;
- unveränderte Scans, Konfiguration, Voreinstellungen und Paperless-Zugangsdaten;
- Übernahme eines alten Datenordners und Sicherung alter Dienstdateien/Drop-ins;
- aktivierten systemd-Autostart und gültige Dienstdefinition;
- PDF-Pipeline sowie HTTP-Zugriff mit Authentifizierung als Dienstbenutzer;
- Bash-Syntax und ShellCheck.

Im Container wird die Offline-Installation verwendet. Ein tatsächlicher
Systemneustart und der USB-Scannerzugriff werden damit nicht simuliert.
