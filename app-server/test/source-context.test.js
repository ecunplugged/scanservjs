const assert = require('assert');
const fs = require('fs');
const path = require('path');
const application = require('../src/application');
const Device = require('../src/classes/device');
const Context = require('../src/classes/context');
const Process = require('../src/classes/process');
const UserOptions = require('../src/classes/user-options');

describe('Fujitsu source switching before scanning', () => {
  let originalContext, originalExecute, context, command;
  beforeEach(() => {
    originalContext = application.context;
    originalExecute = Process.execute;
    const fixture = fs.readFileSync(path.join(__dirname, 'resource/scanimage-a12-adf.txt'), 'utf8');
    context = new Context(application.config(), [Device.from(fixture)], new UserOptions());
    application.context = async () => context;
    Process.execute = async value => {
      command = value;
      return fs.readFileSync(path.join(__dirname, 'resource/scanimage-a12-flatbed.txt'), 'utf8');
    };
    command = null;
  });
  afterEach(() => {
    application.context = originalContext;
    Process.execute = originalExecute;
  });
  it('refreshes Flatbed options instead of submitting inactive ADF page flags', async () => {
    const refreshed = await application.contextForSource({ deviceId: context.devices[0].id, source: 'Flatbed' });
    const device = refreshed.getDevice();
    assert(!device.features['--page-width']);
    assert(!device.features['--page-height']);
    assert(command.includes('--source Flatbed'));
    assert(command.indexOf('--source') < command.indexOf('-A'));
    assert(context.getDevice().features['--page-height']);
    assert.strictEqual(device.settings, context.getDevice().settings);
  });
  it('uses the cached context for the same source and rejects invalid sources', async () => {
    const result = await application.contextForSource({ source: 'ADF Front' });
    assert.strictEqual(result, context);
    assert.strictEqual(command, null);
    await assert.rejects(application.contextForSource({ source: 'Invalid' }), /Invalid scan source/);
    assert.strictEqual(command, null);
  });
});
