const LogFormatter = require('./log-formatter');

const log = require('loglevel').getLogger('Request');

/**
 * @param {number} data
 * @returns {ScanDeviceFeature} feature
 */
function constrainWithFeature(value, feature) {
  return Math.max(Math.min(value || feature.default, feature.limits[1]), feature.limits[0]);
}

/**
 *
 * @param {string[]} list
 * @param {string|string[]} value
 * @param {string} message
 */
function assertContains(list, value, message) {
  if (Array.isArray(value)) {
    value.forEach(v => assertContains(list, v, message));
  } else if (!list.includes(value)) {
    throw new Error(`${message}: '${value}' not in '${list}'`);
  }
}

// Extend acquisition, never the stored preset. The ADF's current Letter area
// must be enlarged through the media options before scanimage receives -x/-y.
function adfA4Params(params, device) {
  const margins = device.settings.adfA4Margins;
  const features = device.features;
  const source = params.source || features['--source'] && features['--source'].default || '';
  if (!margins || !/^ADF/i.test(source)
    || !['--page-width', '--page-height', '-x', '-y'].every(key => features[key])
    || Math.abs(Number(params.width) - 210) >= 0.5 || Math.abs(Number(params.height) - 297) >= 0.5
    || !Number.isFinite(Number(params.width)) || !Number.isFinite(Number(params.height))
    || Number(params.left || 0) !== 0 || Number(params.top || 0) !== 0
    || ![margins.right, margins.bottom].every(value => Number.isFinite(value) && value >= 0)
    || !(margins.right || margins.bottom)) {
    return params;
  }
  const width = constrainWithFeature(210 + margins.right, features['--page-width']);
  const height = constrainWithFeature(297 + margins.bottom, features['--page-height']);
  return { ...params, width, height, pageWidth: width, pageHeight: height,
    // Automatic paper-end detection would undo the extra acquisition length.
    ...(features['--ald'] && features['--ald'].options.includes('no') ? { ald: 'no' } : {}) };
}

module.exports = class Request {
  /**
   * Constructor
   * @param {Context} context
   * @param {ScanRequest} data
   */
  constructor(context, data) {
    Object.assign(this, {
      params: {},
      pipeline: null
    });

    const device = context.getDevice(data.params.deviceId);
    const features = device.features;
    const params = adfA4Params(data.params, device);

    Object.assign(this, {
      params: {
        deviceId: device.id,
        resolution: params.resolution || features['--resolution'].default,
        format: 'tiff',
        isPreview: params.isPreview || false
      },
      filters: data.filters || device.settings.filters.default,
      pipeline: data.pipeline || device.settings.pipeline.default,
      batch: data.batch || device.settings.batchMode.default,
      index: data.index || 1
    });

    assertContains(device.settings['filters'].options, this.filters, 'Invalid filters');
    assertContains(device.settings['pipeline'].options, this.pipeline, 'Invalid pipeline');
    assertContains(device.settings['batchMode'].options, this.batch, 'Invalid batchMode');

    // Fujitsu ADF geometry can be capped by its current (often Letter) media
    // size. --page-width/height are emitted before -x/-y by ScanimageCommand.
    const areaFeature = (axis, pageOption, requestedPage) => {
      const feature = features[axis];
      if (/^ADF/i.test(params.source || features['--source'] && features['--source'].default || '')
        && features[pageOption] && Number.isFinite(Number(requestedPage)) && Number(requestedPage) > 0) {
        const max = constrainWithFeature(Number(requestedPage), features[pageOption]);
        return { ...feature, limits: [feature.limits[0], max] };
      }
      return feature;
    };

    if ('-t' in features) {
      this.params.top = constrainWithFeature(params.top || features['-t'].limits[0], features['-t']);
    }
    if ('-l' in features) {
      this.params.left = constrainWithFeature(params.left || features['-l'].limits[0], features['-l']);
    }
    if ('-x' in features) {
      this.params.width = constrainWithFeature(params.width || features['-x'].limits[1], areaFeature('-x', '--page-width', params.pageWidth));
    }
    if ('-y' in features) {
      this.params.height = constrainWithFeature(params.height || features['-y'].limits[1], areaFeature('-y', '--page-height', params.pageHeight));
    }
    if ('--page-height' in features) {
      this.params.pageHeight = constrainWithFeature(params.pageHeight, features['--page-height']);
    }
    if ('--page-width' in features) {
      this.params.pageWidth = constrainWithFeature(params.pageWidth, features['--page-width']);
    }

    if ('--mode' in features) {
      this.params.mode = typeof params.mode === 'string' && params.mode
        ? params.mode : features['--mode'].default;
      assertContains(features['--mode'].options, this.params.mode, 'Invalid --mode');
    }
    if ('--adf-mode' in features) {
      this.params.adfMode = params.adfMode || features['--adf-mode'].default;
      assertContains(features['--adf-mode'].options, this.params.adfMode, 'Invalid --adf-mode');
    }
    if ('--source' in features) {
      this.params.source = params.source || features['--source'].default;
      assertContains(features['--source'].options, this.params.source, 'Invalid --source');
    }
    if ('--brightness' in features) {
      this.params.brightness = params.brightness || 0;
    }
    if ('--contrast' in features && this.params.mode !== 'Lineart') {
      this.params.contrast = params.contrast || 0;
    }
    if ('--disable-dynamic-lineart' in features) {
      this.params.dynamicLineart = params.dynamicLineart !== undefined
        ? params.dynamicLineart
        : true;
    }
    if ('--ald' in features) {
      this.params.ald = params.ald || features['--ald'].default;
      assertContains(features['--ald'].options, this.params.ald, 'Invalid --ald');
    }

    log.trace(LogFormatter.format().full(this));
  }
};
