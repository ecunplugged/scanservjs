#!/usr/bin/env bash
# Install the ecunplugged/scanservjs fork on Debian 12/13 (amd64 or arm64).
set -Eeuo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
export DEBIAN_FRONTEND=noninteractive
umask 022

repository='https://github.com/ecunplugged/scanservjs.git'
source_ref='master'
offline=false
build_directory=''
package_directory=''
backup_directory=''
migrate_from=''
restart_on_failure=false
unit_migrated=false
dropins_migrated=false

usage() {
  cat <<'HELP'
Aufruf: sudo bash install-debian.sh [--ref BRANCH-ODER-TAG] [--migrate-from PFAD] [--offline]

Installiert alle Abhängigkeiten, baut ecunplugged/scanservjs als Debian-Paket
und aktiviert scanservjs.service für den automatischen Start beim Booten.
Im Normalbetrieb wird der Dienst anschließend gestartet und geprüft.

  --ref NAME   Branch oder Tag des Forks (Standard: master)
  --migrate-from PFAD
               Daten/config einer alten Quellinstallation übernehmen,
               z. B. /opt/scanservjs oder /var/www/scanservjs.
  --offline    Nur für System-Images/Container ohne laufendes systemd:
               Dienst aktivieren, aber noch nicht starten.
  --help       Diese Hilfe anzeigen

Neue Installationen: Port 8080, Anmeldung standardmäßig ausgeschaltet.
Auch für Updates: frischer Download und Neuinstallation bei gleicher Version.
Bestehende config.local.js, Scans und Paperless-Einstellungen bleiben erhalten.
Alte lokale Dienstdateien/Drop-ins werden gesichert und durch den Paketdienst ersetzt.
Node.js 24 wird bei Bedarf über das NodeSource-APT-Repository installiert.
HELP
}

log() { printf '\n[scanservjs] %s\n' "$*"; }
fail() { printf '\nFEHLER: %s\n' "$*" >&2; return 1; }
configure_imagemagick() {
  # Debian's ImageMagick 6 can forbid @file lists, which the PDF pipelines need.
  for policy in /etc/ImageMagick-6/policy.xml /etc/ImageMagick-7/policy.xml; do
    if [[ -f "$policy" ]]; then
      if [[ ! -e "$policy.before-scanservjs" ]]; then cp -a "$policy" "$policy.before-scanservjs"; fi
      sed -i -E \
        -e 's/(domain="coder"[^>]*rights=")[^"]*("[^>]*pattern="PDF")/\1read | write\2/' \
        -e 's/(domain="path"[^>]*rights=")none("[^>]*pattern="@\*")/\1read\2/' \
        "$policy"
    fi
  done
}

cleanup() {
  if [[ -n "$build_directory" ]]; then rm -rf -- "$build_directory"; fi
  if [[ -n "$package_directory" ]]; then rm -rf -- "$package_directory"; fi
}
on_error() {
  local status=$?
  trap - ERR
  # Restore local unit overrides if changing the service or installing the
  # package failed. The old source directory is never changed or removed.
  if "$unit_migrated" && [[ ! -e /etc/systemd/system/scanservjs.service ]]; then
    cp -a "$backup_directory/unit/scanservjs.service" /etc/systemd/system/ || true
  fi
  if "$dropins_migrated" && [[ ! -e /etc/systemd/system/scanservjs.service.d ]]; then
    cp -a "$backup_directory/unit/scanservjs.service.d" /etc/systemd/system/ || true
  fi
  if "$restart_on_failure"; then
    systemctl daemon-reload || true
    systemctl restart scanservjs.service || true
  fi
  printf '\nInstallation fehlgeschlagen (Zeile %s, Exit %s).\n' "$1" "$status" >&2
  if [[ -n "$backup_directory" ]]; then printf 'Sicherung: %s\n' "$backup_directory" >&2; fi
  exit "$status"
}
trap cleanup EXIT
trap 'on_error "$LINENO"' ERR

while (($#)); do
  case "$1" in
    --ref)
      [[ $# -ge 2 ]] || fail '--ref benötigt einen Branch oder Tag.'
      source_ref=$2
      shift 2
      ;;
    --migrate-from)
      [[ $# -ge 2 ]] || fail '--migrate-from benötigt ein Installationsverzeichnis.'
      migrate_from=$2
      shift 2
      ;;
    --offline) offline=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unbekannte Option: $1" ;;
  esac
done
[[ "$source_ref" =~ ^[[:alnum:]][[:alnum:]._/-]*$ ]] || fail 'Ungültiger Branch/Tag.'
[[ $EUID -eq 0 ]] || fail 'Bitte mit sudo bash install-debian.sh ausführen.'
[[ -r /etc/os-release ]] || fail 'Keine Debian-Versionsinformation gefunden.'
# shellcheck source=/dev/null
. /etc/os-release
[[ "${ID:-}" == debian && "${VERSION_ID:-}" =~ ^(12|13)$ ]] \
  || fail 'Unterstützt werden Debian 12 und 13.'
architecture=$(dpkg --print-architecture)
[[ "$architecture" == amd64 || "$architecture" == arm64 ]] \
  || fail 'Benötigt wird ein 64-Bit-System: amd64 oder arm64.'
if "$offline"; then
  [[ ! -d /run/systemd/system ]] || fail '--offline ist nur ohne laufendes systemd zulässig.'
else
  if [[ ! -d /run/systemd/system ]] || ! command -v systemctl >/dev/null; then
    fail 'Kein laufendes systemd. Für System-Images gibt es --offline.'
  fi
  systemctl show-environment >/dev/null
fi
if [[ -n "$migrate_from" ]]; then
  [[ "$migrate_from" == /* && -d "$migrate_from" ]] || fail '--migrate-from benötigt ein bestehendes absolutes Verzeichnis.'
  migrate_from=$(realpath -- "$migrate_from")
  [[ -d "$migrate_from/data" || -d "$migrate_from/config" ]] || fail 'Im alten Installationsverzeichnis fehlen data/ und config/.'
elif [[ -d /var/www/scanservjs/data && ! -d /var/lib/scanservjs/output ]]; then
  migrate_from=/var/www/scanservjs
fi
# Serialize installations, including APT changes and metadata backups.
exec 9>/run/lock/scanservjs-install.lock
flock -n 9 || fail 'Eine andere scanservjs-Installation läuft bereits.'

log 'System- und Scanner-Abhängigkeiten installieren'
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl gnupg git build-essential python3 pkg-config \
  xz-utils openssl adduser util-linux systemd \
  sane-utils sane-airscan imagemagick ghostscript \
  tesseract-ocr tesseract-ocr-deu tesseract-ocr-eng

# The upstream tests already exercise PDF output. Configure it before building.
configure_imagemagick

if [[ ! -x /usr/bin/node ]] || [[ "$(/usr/bin/node -p 'process.versions.node.split(".")[0]')" != 24 ]] \
  || [[ ! -x /usr/bin/npm ]]; then
  log 'Node.js 24 über das offizielle NodeSource-Repository einrichten'
  package_directory=$(mktemp -d /var/tmp/scanservjs-package.XXXXXXXX)
  curl --fail --silent --show-error --location --retry 3 \
    https://deb.nodesource.com/setup_24.x -o "$package_directory/nodesource-setup.sh"
  bash "$package_directory/nodesource-setup.sh"
  apt-get install -y --no-install-recommends nodejs
fi
[[ "$(/usr/bin/node -p 'process.versions.node.split(".")[0]')" == 24 ]] \
  || fail 'Node.js 24 konnte nicht systemweit installiert werden.'
/usr/bin/npm --version

# npm install/build scripts execute under a separate unprivileged identity.
if ! id scanservjs-build >/dev/null 2>&1; then
  useradd --system --user-group --home-dir /var/cache/scanservjs-build \
    --no-create-home --shell /usr/sbin/nologin scanservjs-build
fi
[[ "$(id -u scanservjs-build)" != 0 ]] || fail 'Ungültiger Build-Benutzer.'
install -d -m 700 -o scanservjs-build -g "$(id -gn scanservjs-build)" /var/cache/scanservjs-build
build_directory=$(mktemp -d /var/tmp/scanservjs-build.XXXXXXXX)
chown "scanservjs-build:$(id -gn scanservjs-build)" "$build_directory"

log "Fork herunterladen und bauen (Branch/Tag: $source_ref)"
runuser -u scanservjs-build -- git clone --depth 1 --branch "$source_ref" \
  -- "$repository" "$build_directory/source"
source_commit=$(runuser -u scanservjs-build -- git -C "$build_directory/source" rev-parse HEAD)
# Variables in this script body intentionally expand only in the child Bash.
# shellcheck disable=SC2016
runuser -u scanservjs-build -- bash -Eeuo pipefail -c '
  cd "$1/source"
  export npm_config_cache="$1/npm-cache"
  npm ci
  npm run bootstrap
  npm run lint
  npm test
  npm run build
  ./makedeb.sh
' bash "$build_directory"

package_version=$(/usr/bin/node -p "require(process.argv[1]).version" "$build_directory/source/package.json")
package_file="$build_directory/source/debian/scanservjs_${package_version}-1_all.deb"
[[ -s "$package_file" ]] || fail 'Das Debian-Paket fehlt nach dem Build.'
# Give APT's _apt user read access without opening the build account's directory.
if [[ -z "$package_directory" ]]; then
  package_directory=$(mktemp -d /var/tmp/scanservjs-package.XXXXXXXX)
fi
chmod 755 "$package_directory"
install -m 644 "$package_file" "$package_directory/scanservjs.deb"

if ! "$offline" && systemctl is-active --quiet scanservjs; then
  log 'Vorhandenen Dienst für das Update anhalten'
  restart_on_failure=true
  systemctl stop scanservjs
fi
if [[ -d /etc/scanservjs || -d /var/lib/scanservjs || -n "$migrate_from"
  || -e /etc/systemd/system/scanservjs.service || -L /etc/systemd/system/scanservjs.service
  || -d /etc/systemd/system/scanservjs.service.d ]]; then
  install -d -m 755 /var/backups
  backup_directory=$(mktemp -d /var/backups/scanservjs-install.XXXXXXXX)
  chmod 700 "$backup_directory"
  if [[ -d /etc/scanservjs ]]; then cp -a /etc/scanservjs "$backup_directory/config"; fi
  if [[ -f /var/lib/scanservjs/job-settings.json ]]; then
    cp -a /var/lib/scanservjs/job-settings.json "$backup_directory/job-settings.json"
  fi
  if [[ -n "$migrate_from" && -d "$migrate_from/config" ]]; then
    cp -a "$migrate_from/config" "$backup_directory/legacy-config"
  fi
  # Local /etc units override the package's /lib unit, even after apt reinstall.
  # Archive them so ExecStart/WorkingDirectory cannot keep pointing at old sources.
  install -d -m 700 "$backup_directory/unit"
  if [[ -e /etc/systemd/system/scanservjs.service || -L /etc/systemd/system/scanservjs.service ]]; then
    cp -a /etc/systemd/system/scanservjs.service "$backup_directory/unit/"
    rm -f /etc/systemd/system/scanservjs.service
    unit_migrated=true
  fi
  if [[ -d /etc/systemd/system/scanservjs.service.d ]]; then
    cp -a /etc/systemd/system/scanservjs.service.d "$backup_directory/unit/"
    rm -rf /etc/systemd/system/scanservjs.service.d
    dropins_migrated=true
  fi
  log "Bestehende Einrichtung und lokale Dienstdateien gesichert: $backup_directory"
fi

# Create a default configuration before the package can start the service.
install -d -m 755 /etc/scanservjs
if [[ -n "$migrate_from" ]]; then
  log "Alte Installation übernehmen: $migrate_from (Original bleibt unverändert)"
  if [[ ! -e /etc/scanservjs/config.local.js && -f "$migrate_from/config/config.local.js" ]]; then
    install -m 640 -o root -g users "$migrate_from/config/config.local.js" /etc/scanservjs/config.local.js
  fi
  if [[ -d "$migrate_from/data" && "$(realpath "$migrate_from/data")" != /var/lib/scanservjs ]]; then
    install -d -m 755 /var/lib/scanservjs
    cp -an "$migrate_from/data/." /var/lib/scanservjs/
  fi
fi
if [[ ! -e /etc/scanservjs/config.local.js ]]; then
  install -m 640 /dev/null /etc/scanservjs/config.local.js
  chown root:users /etc/scanservjs/config.local.js
  cat > /etc/scanservjs/config.local.js <<CONFIG
module.exports = {
  afterConfig(config) {
    config.host = '0.0.0.0';
    config.port = 8080;
    config.ocrLanguage = 'deu+eng';
    config.authenticationEnabled = false;
    config.users = {};
  }
};
CONFIG

else
  log 'Vorhandene config.local.js bleibt unverändert (auch Port und Anmeldung).'
fi

log 'Debian-Paket installieren'
apt-get -o Dpkg::Options::=--force-confold install -y --reinstall --no-install-recommends \
  "$package_directory/scanservjs.deb"
# Also fix group membership if a service user already existed before installation.
for scanner_group in scanner lp; do
  if getent group "$scanner_group" >/dev/null; then
    usermod -aG "$scanner_group" scanservjs
  fi
done

configure_imagemagick

printf '%s\n' "$source_commit" > /etc/scanservjs/installed-commit
log 'Autostart aktivieren'
if "$offline"; then
  systemctl enable --force scanservjs.service
  log 'Offline-Installation abgeschlossen. Der Dienst startet beim nächsten systemd-Boot.'
else
  systemctl daemon-reload
  systemctl enable --force scanservjs.service
  systemctl restart scanservjs.service
  sleep 2
  if ! systemctl is-active --quiet scanservjs.service; then
    journalctl -u scanservjs.service -n 50 --no-pager >&2 || true
    fail 'Der Dienst startet nicht. Bitte die obigen Meldungen prüfen.'
  fi
  log 'Dienst läuft und startet künftig automatisch.'
fi

# Scanner absence must not prevent headless installation before USB is attached.
if ! "$offline"; then
  log 'Scanner-Erkennung als Dienstbenutzer'
  timeout 20s runuser -u scanservjs -- scanimage -L || true
fi
restart_on_failure=false
log "Installiert: $repository ($source_commit)"
printf 'Standardadresse bei Neuinstallation: http://<IP-DEINES-DEBIAN-RECHNERS>:8080\n'
printf 'Anmeldung ist standardmäßig aus; bei Bedarf unter Einstellungen aktivieren.\n'
printf 'Vorhandene Port-/Host-Einstellungen aus config.local.js bleiben erhalten.\n'
printf 'Paperless-URL, API-Token und Löschoption anschließend in der Weboberfläche einrichten.\n'
printf 'Logs: journalctl -u scanservjs -n 100 --no-pager\n'
