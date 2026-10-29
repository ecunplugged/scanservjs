import Common from './common.js';

// One job for the entire app, also while switching routes or waiting for a batch.
export default class ScanJob {
  constructor({ fetch = Common.fetch, mask = () => {}, chooseBatch = async () => 'cancel' } = {}) {
    this.fetch = fetch;
    this.mask = mask;
    this.chooseBatch = chooseBatch;
    this.busy = false;
    this.error = '';
    this.result = null;
    this.presetId = null;
  }

  async start(input, presetId = null) {
    if (this.busy) {
      throw new Error('A scan is already running');
    }
    this.busy = true;
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
          response = await this.fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request)
          });
        } finally {
          this.mask(-1);
        }
        first = false;
        if (response && Number.isInteger(response.index)) {
          const choice = await this.chooseBatch(response);
          if (choice === 'cancel') {
            return null;
          }
          request.index = choice === 'finish' ? -1 : choice === 'rescan' ? response.index : response.index + 1;
          continue;
        }
        if (!response || !response.file) {
          throw new Error('The server did not return a scanned file');
        }
        this.result = response;
        return response;
      }
    } catch (error) {
      this.error = error.message || String(error);
      throw error;
    } finally {
      this.busy = false;
      this.presetId = null;
    }
  }
}
