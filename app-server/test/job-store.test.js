const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const JobStore = require('../src/classes/job-store');
const Config = require('../src/classes/config');

const request = { params: { deviceId: 'fujitsu', resolution: 300, source: 'ADF Duplex', width: 210, height: 297 },
  filters: [], pipeline: 'PDF', batch: 'auto', index: 7 };

describe('Scan job settings', () => {
  let directory, store;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scanservjs-jobs-'));
    store = new JobStore(path.join(directory, 'settings.json'));
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  it('includes A4 portrait and landscape in the paper sizes', () => {
    const config = new Config({ afterConfig() {} });
    assert(config.paperSizes.some(p => p.name.startsWith('A4') && p.dimensions.x === 210 && p.dimensions.y === 297));
    assert(config.paperSizes.some(p => p.name.startsWith('A4') && p.dimensions.x === 297 && p.dimensions.y === 210));
  });

  it('persists named presets across restarts and resets the batch index', () => {
    store.putPreset({ name: 'Invoices', request });
    const restored = new JobStore(store.filename);
    assert.strictEqual(restored.data.presets[0].request.params.source, 'ADF Duplex');
    assert.strictEqual(restored.data.presets[0].request.index, 1);
  });

  it('replaces a named preset and supports deletion', () => {
    const original = store.putPreset({ name: 'Invoices', request });
    store.putPreset({ name: ' Invoices ', request: { ...request, params: { resolution: 600 } } });
    assert.strictEqual(store.data.presets.length, 1);
    assert.strictEqual(store.data.presets[0].id, original.id);
    assert.strictEqual(store.data.presets[0].request.params.resolution, 600);
    store.deletePreset(original.id);
    assert.deepStrictEqual(new JobStore(store.filename).data.presets, []);
  });

  it('rejects malformed presets and does not persist unrelated fields', () => {
    assert.throws(() => store.putPreset({ name: '', request }));
    assert.throws(() => store.putPreset({ name: 'x', request: {} }));
    const preset = store.putPreset({ name: 'x', request: { ...request, token: 'secret', params: { token: 'secret' } } });
    assert(!JSON.stringify(preset).includes('secret'));
  });

  it('defaults to disabled integration and disabled deletion', () => {
    assert.strictEqual(store.settings().enabled, false);
    assert.strictEqual(store.settings().deleteAfterTransfer, false);
  });

  it('keeps tokens server-side and retains them when saving an empty token', () => {
    const settings = { enabled: true, url: 'https://paperless.test/subpath/', token: 'secret', deleteAfterTransfer: false };
    store.configure(settings);
    assert(!JSON.stringify(store.settings()).includes('secret'));
    assert.strictEqual(store.settings().tokenConfigured, true);
    store.configure({ ...settings, token: '' });
    assert.strictEqual(new JobStore(store.filename).data.paperless.token, 'secret');
    assert.strictEqual(fs.statSync(store.filename).mode & 0o777, 0o600);
  });

  it('rejects unsafe URLs, invalid settings and missing credentials', () => {
    const settings = { enabled: true, url: 'https://paperless.test', token: 'secret', deleteAfterTransfer: false };
    for (const url of ['file:///etc/passwd', 'http://user:pass@test', 'http://test?secret=x', 'http://test#x']) {
      assert.throws(() => store.configure({ ...settings, url }));
    }
    assert.throws(() => store.configure({ ...settings, token: '' }));
    assert.throws(() => store.configure({ ...settings, token: 'abc\r\nx' }));
    assert.throws(() => store.configure({ ...settings, deleteAfterTransfer: 'true' }));
  });
});

describe('Optional login and preset editing', () => {
  let directory, store;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scanservjs-login-'));
    store = new JobStore(path.join(directory, 'settings.json'));
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  it('defaults to no login, including an existing settings file without authentication', () => {
    assert.strictEqual(store.authentication().enabled, false);
    store.save();
    const legacy = JSON.parse(fs.readFileSync(store.filename));
    delete legacy.authentication;
    fs.writeFileSync(store.filename, JSON.stringify(legacy));
    assert.strictEqual(new JobStore(store.filename).authentication().enabled, false);
  });
  it('requires credentials before enabling login', async () => {
    await assert.rejects(store.configureAuthentication({ enabled: true, username: 'scanner', password: '' }));
    assert.strictEqual(store.authentication().enabled, false);
  });
  it('hashes passwords, persists login and never returns the hash', async () => {
    const result = await store.configureAuthentication({ enabled: true, username: 'scanner', password: 'qa-secret-value' });
    assert.strictEqual(result.enabled, true);
    assert.strictEqual(result.passwordConfigured, true);
    assert(!JSON.stringify(result).includes('hash'));
    assert(!fs.readFileSync(store.filename, 'utf8').includes('qa-secret-value'));
    const restored = new JobStore(store.filename);
    assert.strictEqual(await restored.authorize('scanner', 'qa-secret-value'), true);
    assert.strictEqual(await restored.authorize('scanner', 'wrong'), false);
    assert.strictEqual(await restored.authorize('other', 'qa-secret-value'), false);
    await restored.configureAuthentication({ enabled: false, username: 'scanner', password: '' });
    assert.strictEqual(new JobStore(store.filename).authentication().enabled, false);
  });
  it('can opt in using existing config.users credentials', async () => {
    const users = { scanner: 'legacy-secret' };
    await store.configureAuthentication({ enabled: true, username: 'scanner', password: '' }, users);
    assert.strictEqual(await store.authorize('scanner', 'legacy-secret', users), true);
  });
  it('renames and edits a preset without creating another dashboard button', () => {
    const original = store.putPreset({ name: 'Old name', request });
    const updated = store.putPreset({ id: original.id, name: 'New name', request: { ...request, params: { ...request.params, resolution: 600 } } });
    assert.strictEqual(updated.id, original.id);
    assert.strictEqual(store.data.presets.length, 1);
    assert.strictEqual(updated.name, 'New name');
    assert.strictEqual(updated.request.params.resolution, 600);
  });
  it('rejects renaming onto another preset and editing a deleted preset', () => {
    const first = store.putPreset({ name: 'First', request });
    const second = store.putPreset({ name: 'Second', request });
    assert.throws(() => store.putPreset({ id: second.id, name: 'First', request }));
    store.deletePreset(first.id);
    assert.throws(() => store.putPreset({ id: first.id, name: 'Restored', request }));
  });
});
