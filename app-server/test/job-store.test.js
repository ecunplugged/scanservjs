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
