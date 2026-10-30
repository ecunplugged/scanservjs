const crypto = require('crypto');

// HTTP requests return immediately; progress is independent of a browser connection.
module.exports = class ScanJobs {
  constructor({ scan, transfer }) {
    this.scan = scan;
    this.transfer = transfer;
    this.jobs = new Map();
  }

  start(request) {
    for (const [id, job] of this.jobs) {
      if (job.done && (this.jobs.size >= 100 || Date.now() - job.updatedAt > 3600000)) {
        this.jobs.delete(id);
      }
    }
    if ([...this.jobs.values()].filter(job => !job.done).length >= 10) {
      const error = new Error('Too many active scan jobs');
      error.statusCode = 409;
      throw error;
    }
    const job = { jobId: crypto.randomBytes(16).toString('hex'), stage: 'queued', done: false,
      startedAt: Date.now(), updatedAt: Date.now(), result: null, error: null };
    this.jobs.set(job.jobId, job);
    const progress = stage => {
      if (job.stage !== stage) {
        job.previousStage = job.stage;
      }
      job.stage = stage; job.updatedAt = Date.now();
    };
    // Defer execution until after the 202 response has been constructed.
    Promise.resolve().then(async () => {
      try {
        progress('scanning');
        const result = await this.scan(request, progress);
        job.result = result;
        if (result.file) {
          try {
            result.paperless = await this.transfer(result.file, progress);
          } catch (error) {
            result.paperless = { status: 'error', message: error.message, deleted: false };
          }
          progress(result.paperless.status === 'pending' ? 'pending'
            : result.paperless.status === 'error' ? 'transfer_error' : 'completed');
        } else {
          progress('awaiting_pages');
        }
      } catch (error) {
        job.error = error.message || String(error);
        progress('failed');
      } finally {
        job.done = true;
        job.updatedAt = Date.now();
      }
    });
    return { jobId: job.jobId, stage: job.stage };
  }

  get(id) {
    const job = this.jobs.get(id);
    return job ? { ...job } : null;
  }
};
