#!/usr/bin/env bash
# Full installer/update integration test. Runs only inside a disposable container.
set -Eeuo pipefail
if [[ "${1:-}" != --inside-container ]]; then
  debian_version=${1:-12}
  [[ "$debian_version" == 12 || "$debian_version" == 13 ]] || { printf 'Usage: %s [12|13]\n' "$0" >&2; exit 1; }
  project_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
  exec docker run --rm \
    -e SCANSERV_TEST_REF="${SCANSERV_TEST_REF:-master}" \
    -v "$project_root/scripts/install-debian.sh:/installer.sh:ro" \
    -v "$project_root/test/install-debian.integration.sh:/qa.sh:ro" \
    "debian:$debian_version-slim" bash /qa.sh --inside-container
fi
[[ $EUID -eq 0 && -f /.dockerenv && -f /installer.sh ]] \
  || { printf 'The integration test requires its isolated Docker container.\n' >&2; exit 1; }
bash /installer.sh --offline --ref "${SCANSERV_TEST_REF:-master}" > /tmp/first-install.log 2>&1 || { tail -60 /tmp/first-install.log; exit 1; }
printf '\n// Update-test: preserve this configuration.\n' >> /etc/scanservjs/config.local.js
printf 'existing scan\n' > /var/lib/scanservjs/output/preserved.pdf
node <<'JS'
const Store = require('/usr/lib/scanservjs/server/classes/job-store');
const store = new Store('/var/lib/scanservjs/job-settings.json');
store.configure({enabled:false,url:'http://paperless.test',token:'qa-placeholder',deleteAfterTransfer:false});
store.putPreset({name:'Preserved A4',request:{params:{deviceId:'qa',resolution:300,width:210,height:297},filters:[],pipeline:'PDF',batch:'auto'}});
JS
chown scanservjs:users /var/lib/scanservjs/job-settings.json
sha256sum /etc/scanservjs/config.local.js /var/lib/scanservjs/job-settings.json /var/lib/scanservjs/output/preserved.pdf > /tmp/preserved.sha256
mkdir -p /etc/systemd/system/scanservjs.service.d /opt/obsolete-source/data/output /opt/obsolete-source/config
printf '[Unit]\nDescription=Old installation\n[Service]\nExecStart=/opt/obsolete-source/server/server.js\nWorkingDirectory=/opt/obsolete-source\n[Install]\nWantedBy=multi-user.target\n' > /etc/systemd/system/scanservjs.service
printf '[Service]\nExecStart=\nExecStart=/bin/false\n' > /etc/systemd/system/scanservjs.service.d/legacy.conf
printf 'legacy scan\n' > /opt/obsolete-source/data/output/legacy.pdf
printf '// old source must remain untouched\n' > /opt/obsolete-source/config/config.local.js
printf '\nBROKEN_OLD_SOURCE_MARKER\n' >> /usr/lib/scanservjs/server/server.js
bash /installer.sh --offline --ref "${SCANSERV_TEST_REF:-master}" --migrate-from /opt/obsolete-source > /tmp/update-install.log 2>&1 || { tail -60 /tmp/update-install.log; exit 1; }
sha256sum -c /tmp/preserved.sha256
! grep -q BROKEN_OLD_SOURCE_MARKER /usr/lib/scanservjs/server/server.js
test ! -e /etc/systemd/system/scanservjs.service
test ! -e /etc/systemd/system/scanservjs.service.d
find /var/backups -path '*/unit/scanservjs.service' -print | grep -q .
find /var/backups -path '*/unit/scanservjs.service.d/legacy.conf' -print | grep -q .
cmp /opt/obsolete-source/data/output/legacy.pdf /var/lib/scanservjs/output/legacy.pdf
systemctl is-enabled scanservjs.service
systemd-analyze verify /lib/systemd/system/scanservjs.service
apt-get install -y --no-install-recommends shellcheck > /tmp/shellcheck-install.log 2>&1
shellcheck /installer.sh
convert /var/lib/scanservjs/preview/default.jpg /tmp/pipeline.tif
printf '/tmp/pipeline.tif\n' | convert @- /tmp/pipeline.pdf
test -s /tmp/pipeline.pdf
runuser -u scanservjs -- bash -c 'cd /usr/lib/scanservjs; exec /usr/bin/node server/server.js' > /tmp/service.log 2>&1 &
service_pid=$!
trap 'kill "$service_pid" 2>/dev/null || true' EXIT
node <<'JS'
const fs = require('fs');
const assert = require('assert');
(async () => {
  for (let i=0;i<50;i++) {
    try { await fetch('http://127.0.0.1:8080/api/v1/paperless'); break; }
    catch { await new Promise(r=>setTimeout(r,100)); }
  }
  const anonymous = await fetch('http://127.0.0.1:8080/api/v1/paperless');
  assert.equal(anonymous.status,200);
  const defaults = await (await fetch('http://127.0.0.1:8080/api/v1/authentication')).json();
  assert.equal(defaults.enabled,false);
  const configured = await fetch('http://127.0.0.1:8080/api/v1/authentication', {
    method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({enabled:true,username:'scanner',password:'qa-only-password'})
  });
  assert.equal(configured.status,200);
  assert.equal((await fetch('http://127.0.0.1:8080/api/v1/paperless')).status,401);
  const headers = {Authorization:'Basic '+Buffer.from('scanner:qa-only-password').toString('base64')};
  const settings = await (await fetch('http://127.0.0.1:8080/api/v1/paperless',{headers})).json();
  assert.equal(settings.url,'http://paperless.test');
  assert.equal(settings.tokenConfigured,true);
  assert.equal(settings.deleteAfterTransfer,false);
  assert.equal(settings.token,undefined);
  const presets = await (await fetch('http://127.0.0.1:8080/api/v1/presets',{headers})).json();
  assert.equal(presets[0].name,'Preserved A4');
  const disabled = await fetch('http://127.0.0.1:8080/api/v1/authentication', {
    method:'PUT',headers:{...headers,'Content-Type':'application/json'},
    body:JSON.stringify({enabled:false,username:'scanner',password:''})
  });
  assert.equal(disabled.status,200);
  assert.equal((await fetch('http://127.0.0.1:8080/api/v1/paperless')).status,200);
  console.log('Authenticated HTTP service and preserved presets: OK');
})().catch(e=>{console.error(e);process.exit(1);});
JS
printf '\nINSTALL + SAME-VERSION UPDATE + OLD SERVICE MIGRATION + PDF + SHELLCHECK: PASSED\n'
