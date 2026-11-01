const assert = require('assert');
const Application = require('../src/application');
const Context = require('../src/classes/context');
const Device = require('../src/classes/device');
const FileInfo = require('../src/classes/file-info');
const Request = require('../src/classes/request');
const UserOptions = require('../src/classes/user-options');

const config = Application.config();

describe('Request', () => {
  it('scanimage-a1.txt', () => {
    const file = FileInfo.create('test/resource/scanimage-a1.txt');
    const device = Device.from(file.toText());
    const context = new Context(config, [device], new UserOptions());
    const request = new Request(context, {
      params: {
        deviceId: 'plustek:libusb:001:008',
        top: -1,
        left: -20,
        width: 400,
        height: 400,
        resolution: '150',
        mode: 'Color',
        brightness: 0,
        contrast: 0,
        dynamicLineart: true
      },
      pipeline: config.pipelines[0].description
    });

    assert.strictEqual(request.params.deviceId, 'plustek:libusb:001:008');
    assert.strictEqual(request.params.mode, 'Color');
    assert.strictEqual(request.params.resolution, '150');
    assert.strictEqual(request.params.left, 0);
    assert.strictEqual(request.params.top, 0);
    assert.strictEqual(request.params.width, 215);
    assert.strictEqual(request.params.height, 297);
    assert.strictEqual(request.params.brightness, 0);
    assert.strictEqual(request.params.contrast, 0);
    assert.strictEqual(request.params.dynamicLineart, undefined);
  });

  it('scanimage-a1-defaults.txt', () => {
    const file = FileInfo.create('test/resource/scanimage-a1.txt');
    const device = Device.from(file.toText());
    const context = new Context(config, [device], new UserOptions());
    const request = new Request(context, {
      params: {
        deviceId: 'plustek:libusb:001:008',
        mode: 'Color',
        brightness: 0,
        contrast: 0,
        dynamicLineart: true
      },
      pipeline: config.pipelines[0].description
    });

    assert.strictEqual(request.params.deviceId, 'plustek:libusb:001:008');
    assert.strictEqual(request.params.mode, 'Color');
    assert.strictEqual(request.params.resolution, 50);
    assert.strictEqual(request.params.left, 0);
    assert.strictEqual(request.params.top, 0);
    assert.strictEqual(request.params.width, 215);
    assert.strictEqual(request.params.height, 297);
    assert.strictEqual(request.params.brightness, 0);
    assert.strictEqual(request.params.contrast, 0);
    assert.strictEqual(request.params.dynamicLineart, undefined);
  });

  it('scanimage-a2.txt', () => {
    const file = FileInfo.create('test/resource/scanimage-a2.txt');
    const device = Device.from(file.toText());
    const context = new Context(config, [device], new UserOptions());
    const request = new Request(context, {
      params: {
        deviceId: 'epson2:libusb:001:029',
        top: -1,
        left: -20,
        width: 400,
        height: 400,
        resolution: '150',
        mode: 'Color',
        brightness: 0,
        contrast: 0,
        dynamicLineart: true
      },
      pipeline: config.pipelines[0].description
    });

    assert.strictEqual(request.params.deviceId, 'epson2:libusb:001:029');
    assert.strictEqual(request.params.mode, 'Color');
    assert.strictEqual(request.params.resolution, '150');
    assert.strictEqual(request.params.left, 0);
    assert.strictEqual(request.params.top, 0);
    assert.strictEqual(request.params.width, 215.9);
    assert.strictEqual(request.params.height, 297.1);
    assert.strictEqual(request.params.brightness, undefined);
    assert.strictEqual(request.params.contrast, undefined);
    assert.strictEqual(request.params.dynamicLineart, undefined);
  });

  it('scanimage-a8.txt', () => {
    const file = FileInfo.create('test/resource/scanimage-a8.txt');
    const device = Device.from(file.toText());
    const context = new Context(config, [device], new UserOptions());
    const request = new Request(context, {
      params: {
        deviceId: 'umax1220u:libusb:001:004',
        top: -1,
        left: -20,
        width: 400,
        height: 400,
        resolution: '150',
        mode: 'Color',
        brightness: 0,
        contrast: 0,
        dynamicLineart: true
      },
      pipeline: config.pipelines[0].description
    });

    assert.strictEqual(request.params.deviceId, 'umax1220u:libusb:001:004');
    assert.strictEqual(request.params.mode, undefined);
    assert.strictEqual(request.params.resolution, '150');
    assert.strictEqual(request.params.left, 0);
    assert.strictEqual(request.params.top, 0);
    assert.strictEqual(request.params.width, 228.6);
    assert.strictEqual(request.params.height, 298);
    assert.strictEqual(request.params.brightness, undefined);
    assert.strictEqual(request.params.contrast, undefined);
    assert.strictEqual(request.params.dynamicLineart, undefined);
  });

  it('scanimage-a10.txt', () => {
    const file = FileInfo.create('test/resource/scanimage-a10.txt');
    const device = Device.from(file.toText());
    const context = new Context(config, [device], new UserOptions());
    const request = new Request(context, {
      params: {
        top: -1,
        left: -20,
        width: 400,
        height: 400,
        resolution: '150',
        mode: 'Color',
        brightness: 0,
        contrast: 0,
        dynamicLineart: true
      },
      pipeline: config.pipelines[0].description
    });

    assert.strictEqual(request.params.deviceId, 'epjitsu:libusb:001:003');
    assert.strictEqual(request.params.mode, 'Color');
    assert.strictEqual(request.params.resolution, '150');
    assert.strictEqual(request.params.left, undefined);
    assert.strictEqual(request.params.top, 0);
    assert.strictEqual(request.params.width, undefined);
    assert.strictEqual(request.params.height, undefined);
    assert.strictEqual(request.params.pageWidth, 215.8);
    assert.strictEqual(request.params.pageHeight, 292);
    assert.strictEqual(request.params.brightness, 0);
    assert.strictEqual(request.params.contrast, 0);
    assert.strictEqual(request.params.dynamicLineart, undefined);
  });

});

describe('Fujitsu A4 media geometry', () => {
  const makeRequest = (fixture, params, margins = { right: 0, bottom: 0 }) => {
    const device = Device.from(FileInfo.create(`test/resource/${fixture}`).toText());
    const context = new Context({ ...config, adfA4Margins: margins }, [device], new UserOptions());
    return new Request(context, { params: { deviceId: device.id, ...params } });
  };

  it('preserves A4 height on fi-7260 ADF despite cached Letter scan-area limits', () => {
    const request = makeRequest('scanimage-a12-adf.txt', {
      source: 'ADF Duplex', pageWidth: 210, pageHeight: 297, width: 210, height: 297
    });
    assert.strictEqual(request.params.width, 210);
    assert.strictEqual(request.params.height, 297);
    assert.strictEqual(request.params.pageHeight, 297);
    const Command = require('../src/classes/scanimage-command');
    const command = new Command(config);
    command.scanimage._version = '1.0.31';
    const text = command.scan(request);
    assert(text.includes('--page-height 297'));
    assert(text.includes('-y 297'));
    assert(text.indexOf('--page-height') < text.indexOf('-y'));
  });

  for (const source of ['ADF Front', 'ADF Back', 'ADF Duplex']) {
    it(`extends existing A4 presets for ${source} to the driver's width limit and 307 mm height`, () => {
      const params = { source, pageWidth: 210, pageHeight: 297, width: 210, height: 297, left: 0, top: 0 };
      const request = makeRequest('scanimage-a12-adf.txt', params, config.adfA4Margins);
      assert.strictEqual(request.params.width, 224.8);
      assert.strictEqual(request.params.pageWidth, 224.8);
      assert.strictEqual(request.params.height, 307);
      assert.strictEqual(request.params.pageHeight, 307);
      assert.strictEqual(request.params.ald, 'no');
      assert.strictEqual(params.width, 210);
      assert.strictEqual(params.height, 297);
      const Command = require('../src/classes/scanimage-command');
      const command = new Command(config);
      command.scanimage._version = '1.0.31';
      const text = command.scan(request);
      assert(text.includes('--page-width 224.8 --page-height 307 -l 0 -t 0 -x 224.8 -y 307'));
      const repeated = makeRequest('scanimage-a12-adf.txt', request.params, config.adfA4Margins);
      assert.strictEqual(repeated.params.width, request.params.width);
      assert.strictEqual(repeated.params.height, request.params.height);
    });
  }

  it('uses configured margins and applies the bottom margin without a width margin', () => {
    const request = makeRequest('scanimage-a12-adf.txt', {
      source: 'ADF Front', width: 210, height: 297
    }, { right: 0, bottom: 20 });
    assert.strictEqual(request.params.width, 210);
    assert.strictEqual(request.params.height, 317);
  });

  it('does not enlarge a crop, another format, the flatbed, or another scanner', () => {
    const margins = { right: 15, bottom: 20 };
    for (const params of [
      { source: 'ADF Front', width: 100, height: 150 },
      { source: 'ADF Front', width: 210, height: 297, left: 5 },
      { source: 'ADF Front', width: 210, height: 297, top: 5 },
    ]) {
      const request = makeRequest('scanimage-a12-adf.txt', { pageWidth: 210, pageHeight: 297, ...params }, margins);
      assert.strictEqual(request.params.width, params.width);
      assert.strictEqual(request.params.height, params.height);
    }
    const flatbed = makeRequest('scanimage-a12-flatbed.txt', { source: 'Flatbed', width: 210, height: 297 }, margins);
    assert(flatbed.params.width <= 210);
    assert(flatbed.params.height <= 297);
    const device = Device.from(FileInfo.create('test/resource/scanimage-a12-adf.txt').toText());
    device.id = 'fujitsu:fi-7160:example';
    const context = new Context({ ...config, adfA4Margins: margins }, [device], new UserOptions());
    const request = new Request(context, { params: { width: 210, height: 297, pageWidth: 210, pageHeight: 297 } });
    assert.strictEqual(request.params.width, 210);
    assert.strictEqual(request.params.height, 297);
  });

  it('still bounds ADF dimensions by the requested media', () => {
    const request = makeRequest('scanimage-a12-adf.txt', {
      source: 'ADF Front', pageWidth: 210, pageHeight: 297, width: 400, height: 400
    });
    assert.strictEqual(request.params.width, 210);
    assert.strictEqual(request.params.height, 297);
  });

  it('keeps physical flatbed limits for near-A4 devices', () => {
    const request = makeRequest('scanimage-a12-flatbed.txt', {
      source: 'Flatbed', pageWidth: 210, pageHeight: 297, width: 210, height: 297
    });
    assert(request.params.height <= 297);
    assert(request.params.height > 296);
  });
});

describe('Legacy dynamic-lineart form regression', () => {
  it('repairs a boolean mode stored by the old dynamic-lineart selector', () => {
    const device = Device.from(FileInfo.create('test/resource/scanimage-a12-adf.txt').toText());
    const context = new Context(config, [device], new UserOptions());
    const request = new Request(context, { params: { deviceId: device.id, mode: true } });
    assert.strictEqual(request.params.mode, device.features['--mode'].default);
  });
});
