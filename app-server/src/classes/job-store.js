const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Shared by all browsers. Tokens never leave the server through the API.
module.exports = class JobStore {
  constructor(filename) {
    this.filename = filename;
    this.data = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : {
      presets: [], paperless: { enabled: false, url: '', token: '', deleteAfterTransfer: false }, transfers: {}
    };
  }

  save() {
    fs.mkdirSync(path.dirname(this.filename), { recursive: true });
    const temporary = `${this.filename}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, this.filename);
  }

  settings() {
    const { token, ...settings } = this.data.paperless;
    return { ...settings, tokenConfigured: Boolean(token) };
  }

  configure(input) {
    if (typeof input.enabled !== 'boolean' || typeof input.deleteAfterTransfer !== 'boolean'
      || typeof input.url !== 'string' || typeof input.token !== 'string') {
      throw new Error('Invalid Paperless settings');
    }
    const url = input.url.trim().replace(/\/+$/, '');
    if (url) {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new Error('Use a Paperless HTTP(S) base URL without credentials, query or fragment');
      }
    }
    const token = input.token.trim() || this.data.paperless.token;
    if (/[\r\n]/.test(token) || (input.enabled && (!url || !token))) {
      throw new Error('Paperless URL and API token are required');
    }
    this.data.paperless = { enabled: input.enabled, url, token, deleteAfterTransfer: input.deleteAfterTransfer };
    this.save();
    return this.settings();
  }

  putPreset(input) {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80
      || !input.request || typeof input.request.params !== 'object' || !input.request.params
      || !Array.isArray(input.request.filters) || typeof input.request.pipeline !== 'string'
      || typeof input.request.batch !== 'string') {
      throw new Error('Invalid scan preset');
    }
    const params = {};
    const allowed = ['deviceId', 'resolution', 'source', 'adfMode', 'mode', 'dynamicLineart',
      'top', 'left', 'width', 'height', 'pageWidth', 'pageHeight', 'brightness', 'contrast'];
    for (const key of allowed) {
      const value = input.request.params[key];
      if (['string', 'number', 'boolean'].includes(typeof value)) {
        params[key] = value;
      }
    }
    const request = { params, filters: input.request.filters.filter(f => typeof f === 'string'),
      pipeline: input.request.pipeline, batch: input.request.batch, index: 1 };
    if (JSON.stringify(request).length > 16000) {
      throw new Error('Preset too large');
    }
    const name = input.name.trim();
    const existing = this.data.presets.find(p => p.name === name);
    const preset = { id: existing ? existing.id : crypto.randomBytes(16).toString('hex'), name, request };
    if (existing) {
      this.data.presets.splice(this.data.presets.indexOf(existing), 1, preset);
    } else {
      if (this.data.presets.length >= 100) {
        throw new Error('Maximum 100 presets');
      }
      this.data.presets.push(preset);
    }
    this.save();
    return preset;
  }

  deletePreset(id) {
    this.data.presets = this.data.presets.filter(p => p.id !== id);
    this.save();
  }
};
