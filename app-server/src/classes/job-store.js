const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

// Shared by all browsers. Tokens never leave the server through the API.
module.exports = class JobStore {
  constructor(filename, authenticationEnabled = false) {
    this.filename = filename;
    this.data = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : {
      presets: [], paperless: { enabled: false, url: '', token: '', deleteAfterTransfer: false }, transfers: {}
    };
    if (!this.data.authentication) {
      this.data.authentication = { enabled: authenticationEnabled, username: 'scanner', salt: '', hash: '' };
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.filename), { recursive: true });
    const temporary = `${this.filename}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, this.filename);
  }

  authentication(users = {}) {
    const auth = this.data.authentication;
    return { enabled: auth.enabled, username: auth.username,
      passwordConfigured: Boolean(auth.hash || users[auth.username]) };
  }

  async configureAuthentication(input, users = {}) {
    if (typeof input.enabled !== 'boolean' || typeof input.username !== 'string'
      || !input.username.trim() || input.username.length > 80 || /[:\r\n]/.test(input.username)
      || typeof input.password !== 'string' || input.password.length > 1024) {
      throw new Error('Invalid login settings');
    }
    const previous = this.data.authentication;
    const auth = { ...previous, enabled: input.enabled, username: input.username.trim() };
    if (auth.username !== previous.username) {
      auth.hash = '';
      auth.salt = '';
    }
    if (input.password) {
      auth.salt = crypto.randomBytes(16).toString('hex');
      auth.hash = (await scrypt(input.password, auth.salt, 64)).toString('hex');
    }
    if (auth.enabled && !auth.hash && !users[auth.username]) {
      throw new Error('Set a password before enabling login');
    }
    this.data.authentication = auth;
    try {
      this.save();
    } catch (error) {
      this.data.authentication = previous;
      throw error;
    }
    return this.authentication(users);
  }

  async authorize(username, password, users = {}) {
    const auth = this.data.authentication;
    if (username !== auth.username) {
      return false;
    }
    if (auth.hash) {
      const derived = await scrypt(password, auth.salt, 64);
      const expected = Buffer.from(auth.hash, 'hex');
      return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
    }
    const expected = Buffer.from(users[username] || '');
    const actual = Buffer.from(password);
    return expected.length > 0 && actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }

  settings() {
    const { token, ...settings } = this.data.paperless;
    return { ...settings, tokenConfigured: Boolean(token) };
  }

  configureFlags(input) {
    if (!input || !Object.keys(input).length
      || Object.keys(input).some(key => !['enabled', 'deleteAfterTransfer'].includes(key)
        || typeof input[key] !== 'boolean')) {
      throw new Error('Invalid Paperless switches');
    }
    return this.configure({ ...this.data.paperless, ...input });
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
    const previous = this.data.paperless;
    this.data.paperless = { enabled: input.enabled, url, token, deleteAfterTransfer: input.deleteAfterTransfer };
    try {
      this.save();
    } catch (error) {
      this.data.paperless = previous;
      throw error;
    }
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
    const existing = input.id
      ? this.data.presets.find(p => p.id === input.id)
      : this.data.presets.find(p => p.name === name);
    if (input.id && !existing) {
      throw new Error('Preset no longer exists');
    }
    if (this.data.presets.some(p => p.name === name && (!existing || p.id !== existing.id))) {
      throw new Error('A preset with this name already exists');
    }
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
