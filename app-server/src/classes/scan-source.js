const Constants = require('../constants');
module.exports = (params, batch) => {
  const source = params.source || '';
  if (/flatbed/i.test(source)) {
    return 'flatbed';
  }
  if (/^ADF/i.test(source)) {
    const duplex = /duplex/i.test(`${source} ${params.adfMode || ''}`)
      || [Constants.BATCH_COLLATE_STANDARD, Constants.BATCH_COLLATE_REVERSE].includes(batch);
    return duplex ? 'adf_duplex' : 'adf_simplex';
  }
  return 'unknown';
};
