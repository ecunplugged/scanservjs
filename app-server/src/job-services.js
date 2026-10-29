const application = require('./application');
const JobStore = require('./classes/job-store');
const Paperless = require('./classes/paperless');
const config = application.config();
const store = new JobStore(config.jobSettingsPath, config.authenticationEnabled);
const paperless = new Paperless(store);
let resuming = false;
async function resume() {
  if (resuming) {
    return;
  }
  resuming = true;
  try {
    await paperless.resume(config.outputDirectory, config.thumbnailDirectory);
  } finally {
    resuming = false;
  }
}
// Resume durable pending imports after a restart and after the HTTP poll expires.
setTimeout(resume, 1000).unref();
setInterval(resume, 30000).unref();
module.exports = { store, paperless };
