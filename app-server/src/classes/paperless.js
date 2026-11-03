const fs = require('fs');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const path = require('path');
const { URL } = require('url');

module.exports = class Paperless {
  constructor(store, options = {}) {
    this.store = store;
    this.pollInterval = options.pollInterval || 2000;
    this.pollTimeout = options.pollTimeout || 120000;
    this.active = new Map();
    this.statusCache = new Map();
    this.requestTimeout = options.requestTimeout || 30000;
  }

  request(settings, endpoint, upload) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let response;
      let timer;
      const finish = (error, value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (error) {
          reject(error);
        } else {
          resolve(value);
        }
      };
      const url = new URL(`${settings.url}/${endpoint}`);
      const boundary = `scanservjs-${crypto.randomBytes(16).toString('hex')}`;
      const head = upload ? Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${encodeURIComponent(path.basename(upload))}"\r\nContent-Type: application/octet-stream\r\n\r\n`) : null;
      const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
      const headers = { Authorization: `Token ${settings.token}`, Accept: 'application/json' };
      if (upload) {
        headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
        headers['Content-Length'] = head.length + fs.statSync(upload).size + tail.length;
      }
      const req = (url.protocol === 'https:' ? https : http).request(url, {
        method: upload ? 'POST' : 'GET', headers
      }, res => {
        response = res;
        let body = '';
        res.setEncoding('utf8');
        res.on('error', () => finish(new Error('Paperless response interrupted; local file retained')));
        res.on('aborted', () => finish(new Error('Paperless response interrupted; local file retained')));
        res.on('data', chunk => {
          body += chunk;
          if (body.length > 1024 * 1024) {
            req.destroy(new Error('Paperless response too large'));
          }
        });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            finish(new Error(`Paperless HTTP ${res.statusCode}; local file retained`));
            return;
          }
          try {
            finish(null, JSON.parse(body));
          } catch (error) {
            finish(new Error('Invalid Paperless response; local file retained'));
          }
        });
      });
      // Clear the wall-clock deadline only when the whole response settles,
      // never on ClientRequest.close while the response body is still incomplete.
      timer = setTimeout(() => {
        finish(new Error('Paperless request timed out; local file retained'));
        req.destroy();
        if (response) {
          response.destroy();
        }
      }, this.requestTimeout);
      req.on('error', () => finish(new Error('Paperless connection failed; local file retained')));
      if (upload) {
        req.write(head);
        const stream = fs.createReadStream(upload);
        stream.on('error', error => req.destroy(error));
        req.on('close', () => stream.destroy());
        stream.on('end', () => req.end(tail));
        stream.pipe(req, { end: false });
      } else {
        req.end();
      }
    });
  }

  async fingerprint(filename) {
    const digest = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(filename)) {
      digest.update(chunk);
    }
    return digest.digest('hex');
  }

  status(record) {
    if (!record) {
      return { status: 'not_sent' };
    }
    return { status: record.documentId ? 'success' : record.failed ? 'failed' : 'pending',
      uploadedAt: record.uploadedAt || null, completedAt: record.completedAt || null,
      documentId: record.documentId || null, deleted: Boolean(record.deleted) };
  }

  async fileStatus(file) {
    const records = Object.values(this.store.data.transfers).filter(record => record.filename === file.fullname);
    if (!records.length) {
      return this.status(null);
    }
    const stat = fs.statSync(file.fullname);
    const signature = `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    let cached = this.statusCache.get(file.fullname);
    if (!cached || cached.signature !== signature) {
      cached = { signature, fingerprint: await this.fingerprint(file.fullname) };
      if (this.statusCache.size >= 500) {
        this.statusCache.clear();
      }
      this.statusCache.set(file.fullname, cached);
    }
    const fingerprint = cached.fingerprint;
    return this.status(records.filter(record => record.fingerprint === fingerprint)
      .sort((a, b) => String(b.completedAt || b.uploadedAt || '').localeCompare(String(a.completedAt || a.uploadedAt || '')))[0]);
  }

  rename(filename, destination) {
    if (this.active.has(filename)) {
      throw new Error('Wait for the Paperless transfer before renaming this file');
    }
    for (const [key, record] of Object.entries(this.store.data.transfers)) {
      if (record.filename === filename) {
        record.filename = destination;
        const next = crypto.createHash('sha256').update(`${record.url}\n${destination}\n${record.fingerprint}`).digest('hex');
        delete this.store.data.transfers[key];
        this.store.data.transfers[next] = record;
      }
    }
    for (const scan of this.store.data.history) {
      if (scan.filename === filename) {
        scan.filename = destination;
        scan.name = path.basename(destination);
      }
    }
    this.store.save();
  }

  transfer(file, thumbnail, onProgress = () => {}) {
    if (this.active.has(file.fullname)) {
      return this.active.get(file.fullname);
    }
    const task = this.send(file, thumbnail, onProgress).catch(async error => {
      const scan = this.store.data.history.find(item => item.filename === file.fullname);
      if (scan && !['success', 'failed'].includes(scan.paperless.status) && file.exists()
        && scan.fingerprint === await this.fingerprint(file.fullname)) {
        scan.paperless = { ...scan.paperless, status: 'error' };
        this.store.save();
      }
      throw error;
    }).finally(() => this.active.delete(file.fullname));
    this.active.set(file.fullname, task);
    return task;
  }

  async resume(outputDirectory, thumbnailDirectory) {
    const FileInfo = require('./file-info');
    for (const record of Object.values(this.store.data.transfers)) {
      if (record.documentId || record.failed || record.url !== this.store.data.paperless.url
        || !record.filename || path.dirname(path.resolve(record.filename)) !== path.resolve(outputDirectory)
        || !fs.existsSync(record.filename)) {
        continue;
      }
      try {
        // Only resume the exact file associated with the persisted task.
        const digest = crypto.createHash('sha256');
        for await (const chunk of fs.createReadStream(record.filename)) {
          digest.update(chunk);
        }
        if (digest.digest('hex') !== record.fingerprint) {
          continue;
        }
        const file = FileInfo.create(record.filename);
        await this.transfer(file, FileInfo.unsafe(thumbnailDirectory, file.name));
      } catch (error) {
        // A later timer tick retries connection errors. Local files stay intact.
      }
    }
  }

  async send(file, thumbnail, onProgress = () => {}) {
    const settings = { ...this.store.data.paperless };
    if (!settings.enabled && !Object.values(this.store.data.transfers).some(record => record.filename === file.fullname
      && record.url === settings.url && !record.documentId && !record.failed)) {
      return { status: 'disabled', deleted: false };
    }
    if (!['.pdf', '.png', '.jpg', '.jpeg', '.tif', '.tiff', '.txt'].includes(file.extension.toLowerCase())) {
      throw new Error('Paperless: choose PDF or a supported single-file format; local file retained');
    }
    const stat = fs.statSync(file.fullname);
    if (!stat.isFile() || fs.lstatSync(file.fullname).isSymbolicLink()) {
      throw new Error('Paperless requires a regular file');
    }
    const digest = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(file.fullname)) {
      digest.update(chunk);
    }
    const fingerprint = digest.digest('hex');
    const key = crypto.createHash('sha256').update(`${settings.url}\n${file.fullname}\n${fingerprint}`).digest('hex');
    let record = this.store.data.transfers[key];
    if (!record) {
      if (!settings.enabled) {
        return { status: 'disabled', deleted: false };
      }
      onProgress('uploading');
      const taskId = await this.request(settings, 'api/documents/post_document/', file.fullname);
      if (typeof taskId !== 'string' || !/^[a-f0-9-]{32,36}$/i.test(taskId)) {
        throw new Error('Paperless did not return a task ID; local file retained');
      }
      record = { taskId, filename: file.fullname, url: settings.url, fingerprint, uploadedAt: new Date().toISOString() };
      this.store.data.transfers[key] = record;
      this.store.scanTransfer(file.fullname, fingerprint, this.status(record));
      this.store.save();
    }
    onProgress('paperless_processing');
    const deadline = Date.now() + this.pollTimeout;
    while (!record.documentId && Date.now() < deadline) {
      const result = await this.request(settings, `api/tasks/?task_id=${encodeURIComponent(record.taskId)}`);
      const tasks = Array.isArray(result) ? result : result.results;
      const task = Array.isArray(tasks) && tasks.find(t => t.task_id === record.taskId);
      const state = task && String(task.status).toUpperCase();
      const documentId = task && (task.related_document
        || task.result_data && task.result_data.document_id
        || Array.isArray(task.related_document_ids) && task.related_document_ids[0]);
      if (state === 'SUCCESS' && /^[1-9]\d*$/.test(String(documentId))) {
        record.documentId = Number(documentId);
        record.completedAt = new Date().toISOString();
        this.store.scanTransfer(file.fullname, fingerprint, this.status(record));
        this.store.save();
        break;
      }
      if (task && ['FAILURE', 'REVOKED'].includes(state)) {
        // Keep the task ID: a retry must never silently create another document.
        record.failed = true;
        this.store.scanTransfer(file.fullname, fingerprint, this.status(record));
        this.store.save();
        throw new Error('Paperless import failed; local file retained. Check the task in Paperless.');
      }
      await new Promise(resolve => setTimeout(resolve, this.pollInterval));
    }
    if (!record.documentId) {
      return { status: 'pending', taskId: record.taskId, deleted: false };
    }
    onProgress('cleanup');
    let deleted = false;
    // Recheck the setting and file identity before a destructive operation.
    if (this.store.data.paperless.enabled && this.store.data.paperless.deleteAfterTransfer
      && this.store.data.paperless.url === settings.url) {
      const current = fs.statSync(file.fullname);
      if (current.ino === stat.ino && current.size === stat.size && current.mtimeMs === stat.mtimeMs) {
        fs.unlinkSync(file.fullname);
        deleted = true;
        if (thumbnail && fs.existsSync(thumbnail.fullname)) {
          fs.unlinkSync(thumbnail.fullname);
        }
      }
    }
    record.deleted = deleted;
    this.store.scanTransfer(file.fullname, fingerprint, this.status(record));
    this.store.save();
    return this.status(record);
  }
};
