const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const JobStore = require('../src/classes/job-store');
const Paperless = require('../src/classes/paperless');
const FileInfo = require('../src/classes/file-info');

const taskId = '12345678-1234-1234-1234-123456789abc';
describe('Paperless integration', () => {
  let directory, store, paperless, file, thumbnail, server, uploads, polls, mode, base;
  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scanservjs-paperless-'));
    store = new JobStore(path.join(directory, 'settings.json'));
    const filename = path.join(directory, 'scan.pdf');
    fs.writeFileSync(filename, '%PDF-1.4\nscan content');
    file = FileInfo.create(filename);
    fs.writeFileSync(path.join(directory, 'thumbnail.jpg'), 'preview');
    thumbnail = FileInfo.create(path.join(directory, 'thumbnail.jpg'));
    uploads = 0;
    polls = 0;
    mode = 'success';
    server = http.createServer((req, res) => {
      assert.strictEqual(req.headers.authorization, 'Token secret');
      if (req.method === 'POST') {
        uploads++;
        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });
        req.on('end', () => {
          assert(body.includes('name="document"'));
          assert(body.includes('%PDF-1.4'));
          assert.strictEqual(Number(req.headers['content-length']), Buffer.byteLength(body));
          if (mode === 'http-error') {
            res.writeHead(403).end('denied');
          } else if (mode === 'bad-json') {
            res.end('not json');
          } else if (mode === 'redirect') {
            res.writeHead(302, { Location: 'http://elsewhere.test' }).end();
          } else {
            res.end(JSON.stringify(taskId));
          }
        });
      } else {
        polls++;
        assert.strictEqual(req.url, `/paperless/api/tasks/?task_id=${taskId}`);
        let task = { task_id: taskId, status: 'SUCCESS', related_document: '42' };
        if (mode === 'pending' || (mode === 'delayed' && polls === 1)) {
          task.status = 'STARTED';
          task.related_document = null;
        }
        if (mode === 'failure') {
          task.status = 'FAILURE';
        }
        if (mode === 'missing-document') {
          task.related_document = null;
        }
        if (mode === 'wrong-task') {
          task.task_id = 'different';
        }
        if (mode === 'disable-delete') {
          store.data.paperless.deleteAfterTransfer = false;
        }
        if (mode === 'change-file') {
          fs.appendFileSync(file.fullname, 'replacement');
        }
        res.end(JSON.stringify(mode === 'paginated' ? { results: [task] } : [task]));
      }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}/paperless`;
    store.configure({ enabled: true, url: base, token: 'secret', deleteAfterTransfer: false });
    paperless = new Paperless(store, { pollInterval: 2, pollTimeout: 15 });
  });
  afterEach(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('uploads a multipart document and retains the file by default', async () => {
    const result = await paperless.transfer(file, thumbnail);
    assert.strictEqual(result.status, 'success');
    assert.strictEqual(result.documentId, 42);
    assert.strictEqual(result.deleted, false);
    assert(file.exists());
  });
  it('deletes document and thumbnail only after confirmed success', async () => {
    store.data.paperless.deleteAfterTransfer = true;
    const result = await paperless.transfer(file, thumbnail);
    assert.strictEqual(result.deleted, true);
    assert(!file.exists());
    assert(!thumbnail.exists());
  });
  it('waits for success rather than deleting after upload acceptance', async () => {
    mode = 'delayed';
    store.data.paperless.deleteAfterTransfer = true;
    const result = await paperless.transfer(file, thumbnail);
    assert.strictEqual(result.status, 'success');
    assert(polls >= 2);
    assert(!file.exists());
  });
  it('accepts the paginated tasks response', async () => {
    mode = 'paginated';
    assert.strictEqual((await paperless.transfer(file)).status, 'success');
  });
  for (const failure of ['http-error', 'bad-json', 'redirect', 'failure']) {
    it(`retains document and thumbnail on ${failure}`, async () => {
      mode = failure;
      store.data.paperless.deleteAfterTransfer = true;
      await assert.rejects(paperless.transfer(file, thumbnail));
      assert(file.exists());
      assert(thumbnail.exists());
    });
  }
  for (const pending of ['pending', 'missing-document', 'wrong-task']) {
    it(`never deletes for ${pending}`, async () => {
      mode = pending;
      store.data.paperless.deleteAfterTransfer = true;
      assert.strictEqual((await paperless.transfer(file, thumbnail)).status, 'pending');
      assert(file.exists());
    });
  }
  it('resumes a pending task across restarts without a second upload', async () => {
    mode = 'pending';
    await paperless.transfer(file);
    mode = 'success';
    const restored = new Paperless(new JobStore(store.filename), { pollInterval: 2, pollTimeout: 15 });
    assert.strictEqual((await restored.transfer(file)).status, 'success');
    assert.strictEqual(uploads, 1);
  });
  it('finishes and deletes a persisted pending import in the background after restart', async () => {
    mode = 'pending';
    store.data.paperless.deleteAfterTransfer = true;
    await paperless.transfer(file);
    assert(file.exists());
    mode = 'success';
    const restored = new Paperless(new JobStore(store.filename), { pollInterval: 2, pollTimeout: 15 });
    await restored.resume(directory, directory);
    assert(!file.exists());
    assert.strictEqual(uploads, 1);
  });
  it('does not resume a pending import if the local file was replaced', async () => {
    mode = 'pending';
    store.data.paperless.deleteAfterTransfer = true;
    await paperless.transfer(file);
    fs.appendFileSync(file.fullname, 'new scan');
    mode = 'success';
    await paperless.resume(directory, directory);
    assert(file.exists());
    assert.strictEqual(uploads, 1);
  });
  it('does not upload a completed document again', async () => {
    await paperless.transfer(file);
    await paperless.transfer(file);
    assert.strictEqual(uploads, 1);
  });
  it('coalesces simultaneous requests for the same file', async () => {
    await Promise.all([paperless.transfer(file), paperless.transfer(file)]);
    assert.strictEqual(uploads, 1);
  });
  it('honors deletion disabled during an import', async () => {
    mode = 'disable-delete';
    store.data.paperless.deleteAfterTransfer = true;
    assert.strictEqual((await paperless.transfer(file)).deleted, false);
    assert(file.exists());
  });
  it('does not delete a local file modified during the import', async () => {
    mode = 'change-file';
    store.data.paperless.deleteAfterTransfer = true;
    assert.strictEqual((await paperless.transfer(file)).deleted, false);
    assert(file.exists());
  });
  it('does not contact Paperless when disabled', async () => {
    store.data.paperless.enabled = false;
    assert.strictEqual((await paperless.transfer(file)).status, 'disabled');
    assert.strictEqual(uploads, 0);
  });
  it('retains unsupported archive outputs without uploading them', async () => {
    const filename = path.join(directory, 'scan.zip');
    fs.writeFileSync(filename, 'zip');
    await assert.rejects(paperless.transfer(FileInfo.create(filename)));
    assert(fs.existsSync(filename));
    assert.strictEqual(uploads, 0);
  });
  it('retains files on a connection error', async () => {
    store.data.paperless.url = 'http://127.0.0.1:1';
    await assert.rejects(paperless.transfer(file));
    assert(file.exists());
  });
});
