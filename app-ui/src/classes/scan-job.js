import Common from './common.js';

// One job for the entire app, also while switching routes or waiting for a batch.
export default class ScanJob {
  constructor({ fetch = Common.fetch, mask = () => {}, chooseBatch = async () => 'cancel',
    pollInterval = 1000, requestTimeout = 15000, jobTimeout = 600000 } = {}) {
    this.fetch = fetch;
    this.pollInterval = pollInterval;
    this.requestTimeout = requestTimeout;
    this.jobTimeout = jobTimeout;
    this.stage = 'idle';
    this.lastWorkStage = 'idle';
    this.stageStartedAt = 0;
    this.startedAt = 0;
    this.jobId = null;
    this.mask = mask;
    this.chooseBatch = chooseBatch;
    this.busy = false;
    this.error = '';
    this.result = null;
    this.presetId = null;
  }

  setStage(stage) {
    if (['scanning', 'processing', 'uploading', 'paperless_processing', 'cleanup'].includes(stage)) {
      this.lastWorkStage = stage;
    }
    if (this.stage !== stage) {
      this.stageStartedAt = Date.now();
    }
    this.stage = stage;
  }

  async fetchBounded(url, options) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        this.fetch(url, { ...options, signal: controller.signal }),
        new Promise((resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error('Status request timed out. The server may still be processing the job.'));
          }, this.requestTimeout);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async waitForJob(response) {
    this.jobId = response.jobId;
    const deadline = Date.now() + this.jobTimeout;
    while (Date.now() < deadline) {
      const job = await this.fetchBounded(`api/v1/scan-jobs/${encodeURIComponent(this.jobId)}`, { cache: 'no-store' });
      if (job.done && job.previousStage) {
        this.lastWorkStage = job.previousStage;
      }
      this.setStage(job.stage);
      if (job.error) {
        throw new Error(job.error);
      }
      if (job.done) {
        return job.result;
      }
      await new Promise(resolve => setTimeout(resolve, this.pollInterval));
    }
    throw new Error('Scan job status timed out. Check the local files and Paperless before scanning again.');
  }

  async start(input, presetId = null) {
    if (this.busy) {
      throw new Error('A scan is already running');
    }
    this.busy = true;
    this.startedAt = Date.now();
    this.jobId = null;
    this.lastWorkStage = 'idle';
    this.setStage('queued');
    this.error = '';
    this.result = null;
    this.presetId = presetId;
    try {
      const request = Common.clone(input);
      request.index = 1;
      let first = true;
      while (true) {
        let response;
        this.mask(1);
        try {
          const url = first && presetId ? `api/v1/presets/${encodeURIComponent(presetId)}/scan` : 'api/v1/scan';
          response = await this.fetchBounded(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request, async: true })
          });
        } finally {
          this.mask(-1);
        }
        if (response && response.jobId) {
          response = await this.waitForJob(response);
        }
        first = false;
        if (response && Number.isInteger(response.index)) {
          this.setStage('awaiting_pages');
          const choice = await this.chooseBatch(response);
          if (choice === 'cancel') {
            this.setStage('cancelled');
            return null;
          }
          request.index = choice === 'finish' ? -1 : choice === 'rescan' ? response.index : response.index + 1;
          continue;
        }
        if (!response || !response.file) {
          throw new Error('The server did not return a scanned file');
        }
        this.setStage(response.paperless && response.paperless.status === 'pending' ? 'pending'
          : response.paperless && response.paperless.status === 'error' ? 'transfer_error' : 'completed');
        this.result = response;
        return response;
      }
    } catch (error) {
      this.setStage('failed');
      this.error = error.message || String(error);
      throw error;
    } finally {
      this.busy = false;
      this.presetId = null;
    }
  }
}
