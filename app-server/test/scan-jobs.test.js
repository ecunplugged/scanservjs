const assert = require('assert');
const ScanJobs = require('../src/classes/scan-jobs');
const flush = () => new Promise(resolve => setImmediate(resolve));

describe('Background scan job progress', () => {
  it('returns immediately and exposes scan, PDF, upload and import milestones', async () => {
    let releaseScan, releaseTransfer;
    const scans = new Promise(resolve => {
      releaseScan = resolve;
    });
    const transfers = new Promise(resolve => {
      releaseTransfer = resolve;
    });
    let report;
    const registry = new ScanJobs({
      scan: async (request, progress) => {
        report = progress; await scans; return { file: { name: 'scan.pdf' } };
      },
      transfer: async (file, progress) => {
        report = progress; progress('uploading'); return transfers;
      }
    });
    const { jobId } = registry.start({});
    assert.strictEqual(registry.get(jobId).done, false);
    await flush();
    assert.strictEqual(registry.get(jobId).stage, 'scanning');
    report('processing');
    assert.strictEqual(registry.get(jobId).stage, 'processing');
    releaseScan();
    await flush();
    assert.strictEqual(registry.get(jobId).stage, 'uploading');
    report('paperless_processing');
    assert.strictEqual(registry.get(jobId).stage, 'paperless_processing');
    releaseTransfer({ status: 'success', documentId: 42, deleted: false });
    await flush();
    assert.strictEqual(registry.get(jobId).stage, 'completed');
    assert.strictEqual(registry.get(jobId).done, true);
  });
  it('finishes a long import as pending instead of blocking the UI forever', async () => {
    const registry = new ScanJobs({ scan: async () => ({ file: { name: 'scan.pdf' } }),
      transfer: async () => ({ status: 'pending', deleted: false, taskId: 'qa' }) });
    const { jobId } = registry.start({});
    await flush();
    const job = registry.get(jobId);
    assert.strictEqual(job.stage, 'pending');
    assert.strictEqual(job.done, true);
    assert.strictEqual(job.result.paperless.deleted, false);
  });
  it('retains the finished file and ends the job on transfer failure', async () => {
    const registry = new ScanJobs({ scan: async () => ({ file: { name: 'scan.pdf' } }),
      transfer: async () => {
        throw new Error('Paperless HTTP 503');
      } });
    const { jobId } = registry.start({});
    await flush();
    assert.strictEqual(registry.get(jobId).stage, 'transfer_error');
    assert.strictEqual(registry.get(jobId).done, true);
    assert.strictEqual(registry.get(jobId).result.file.name, 'scan.pdf');
  });
  it('ends failed scans and supports manual-page responses', async () => {
    const registry = new ScanJobs({ scan: async () => {
      throw new Error('No paper');
    }, transfer: async () => {} });
    const { jobId } = registry.start({});
    await flush();
    assert.strictEqual(registry.get(jobId).error, 'No paper');
    assert.strictEqual(registry.get(jobId).done, true);
    registry.scan = async () => ({ index: 1, image: 'preview' });
    const next = registry.start({});
    await flush();
    assert.strictEqual(registry.get(next.jobId).stage, 'awaiting_pages');
  });
});
