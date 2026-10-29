const assert = require('assert');
const { pathToFileURL } = require('url');
const path = require('path');
let ScanJob;
const input = { params: { deviceId: 'qa', resolution: 300 }, batch: 'none', pipeline: 'PDF', filters: [], index: 8 };

describe('Shared scan button workflow', () => {
  before(async () => {
    ScanJob = (await import(pathToFileURL(path.resolve('../app-ui/src/classes/scan-job.js')))).default;
  });
  it('sends a fresh first-pass request and returns the scanned file', async () => {
    const masks = [];
    const job = new ScanJob({ mask: n => masks.push(n), fetch: async (url, options) => {
      assert.strictEqual(url, 'api/v1/scan');
      assert.strictEqual(JSON.parse(options.body).index, 1);
      return { file: { name: 'result.pdf' } };
    } });
    assert.strictEqual((await job.start(input)).file.name, 'result.pdf');
    assert.strictEqual(input.index, 8);
    assert.strictEqual(job.busy, false);
    assert.deepStrictEqual(masks, [1, -1]);
  });
  it('keeps scan errors visible, releases the mask and never reports completion', async () => {
    const masks = [];
    const job = new ScanJob({ mask: n => masks.push(n), fetch: async () => {
      throw new Error('Scanner disconnected');
    } });
    await assert.rejects(job.start(input), /Scanner disconnected/);
    assert.strictEqual(job.error, 'Scanner disconnected');
    assert.strictEqual(job.result, null);
    assert.strictEqual(job.busy, false);
    assert.deepStrictEqual(masks, [1, -1]);
  });
  it('rejects invalid success responses instead of showing a completed scan', async () => {
    const job = new ScanJob({ fetch: async () => ({ message: 'failure' }) });
    await assert.rejects(job.start(input), /scanned file/);
    assert.strictEqual(job.result, null);
  });
  it('starts a dashboard scan directly through the saved preset endpoint', async () => {
    const job = new ScanJob({ fetch: async url => {
      assert.strictEqual(url, 'api/v1/presets/preset-1/scan');
      return { file: { name: 'preset.pdf' } };
    } });
    await job.start(input, 'preset-1');
  });
  it('continues manual batches and finishes them without blocking the dialog', async () => {
    const masks = [];
    const indices = [];
    let pass = 0;
    const job = new ScanJob({ mask: n => masks.push(n),
      fetch: async (url, options) => {
        const index = JSON.parse(options.body).index;
        indices.push(index);
        return index < 0 ? { file: { name: 'batch.pdf' } } : { index, image: 'preview' };
      },
      chooseBatch: async () => {
        assert.strictEqual(masks.reduce((a, b) => a + b, 0), 0);
        return ++pass === 1 ? 'next' : 'finish';
      }
    });
    await job.start(input);
    assert.deepStrictEqual(indices, [1, 2, -1]);
    assert.strictEqual(job.busy, false);
  });
  it('does not send another request when the user cancels a manual batch', async () => {
    let requests = 0;
    const job = new ScanJob({ fetch: async () => {
      requests++; return { index: 1 };
    }, chooseBatch: async () => 'cancel' });
    assert.strictEqual(await job.start(input), null);
    assert.strictEqual(requests, 1);
    assert.strictEqual(job.busy, false);
    assert.strictEqual(job.error, '');
  });
  it('rejects double clicks and permits the next job after a failure', async () => {
    let release;
    const pending = new Promise(resolve => {
      release = resolve;
    });
    const job = new ScanJob({ fetch: async () => pending });
    const running = job.start(input);
    await assert.rejects(job.start(input), /already running/);
    release({ file: { name: 'first.pdf' } });
    await running;
    await job.start(input);
  });
});
