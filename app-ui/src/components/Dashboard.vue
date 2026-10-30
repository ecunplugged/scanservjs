<template>
  <div class="dashboard mx-auto">
    <div class="d-flex align-center flex-wrap ga-3 mb-6">
      <div>
        <h1 class="text-h4 mb-2">{{ $t('dashboard.title') }}</h1>
        <p class="text-body-1 text-medium-emphasis">{{ $t('dashboard.description') }}</p>
      </div>
      <v-spacer />
      <v-btn to="/presets" variant="outlined">{{ $t('dashboard.manage') }}</v-btn>
      <v-btn to="/scan" variant="text">{{ $t('dashboard.manual') }}</v-btn>
    </div>

    <v-alert v-if="loadError" type="error" class="mb-4">
      {{ loadError }} <v-btn variant="text" @click="load">{{ $t('dashboard.retry') }}</v-btn>
    </v-alert>
    <v-progress-linear v-if="loading" indeterminate class="mb-4" />
    <v-card v-if="scanJob.stage !== 'idle'" class="pa-5 mb-6 progress-card" variant="outlined" role="status" aria-live="polite">
      <h2 class="text-h6 mb-2">{{ $t('progress.title') }}</h2>
      <div class="progress-status">{{ $t(`progress.${scanJob.stage}`) }}</div>
      <p v-if="scanJob.busy" class="mt-2">{{ $t('progress.elapsed', [elapsed]) }}</p>
      <v-progress-linear v-if="scanJob.busy && scanJob.stage !== 'awaiting_pages'" indeterminate color="primary" class="mt-4" />
      <ol class="progress-steps mt-4">
        <li v-for="(step, index) in steps" :key="step" :class="{ active: stepIndex === index, done: stepIndex > index }">
          <span>{{ stepIndex > index ? '✓' : index + 1 }}</span> {{ $t(`progress.${step}`) }}
        </li>
      </ol>
      <p v-if="scanJob.stage === 'pending'" class="mt-4">{{ $t('progress.pending-help') }}</p>
    </v-card>
    <v-alert v-if="scanJob.result" :type="resultType" class="mb-6">
      {{ $t('dashboard.completed') }} {{ scanJob.result.file.name }}
      <div v-if="scanJob.result.paperless && scanJob.result.paperless.status !== 'disabled'" class="mt-2">
        {{ scanJob.result.paperless.message || $t(`paperless.${scanJob.result.paperless.status}`) }}
      </div>
      <v-btn to="/files" variant="text">{{ $t('navigation.files') }}</v-btn>
    </v-alert>
    <v-card v-if="!loading && !presets.length" variant="outlined" class="pa-8 text-center">
      <h2 class="text-h6 mb-3">{{ $t('dashboard.empty') }}</h2>
      <v-btn to="/presets/new" color="primary">{{ $t('jobs.new') }}</v-btn>
    </v-card>

    <v-row>
      <v-col v-for="(preset, index) in presets" :key="preset.id" cols="12" sm="6" lg="4">
        <v-btn class="scan-tile pa-6" block height="auto" variant="tonal"
          :color="colors[index % colors.length]" :disabled="scanJob.busy"
          :loading="scanJob.busy && scanJob.presetId === preset.id" @click="start(preset)">
          <span class="d-flex flex-column align-start text-left w-100">
            <v-icon :icon="mdiScanner" size="36" class="mb-4" />
            <span class="text-h5 font-weight-bold tile-title">{{ preset.name }}</span>
            <span class="text-body-2 mt-3 tile-details">{{ details(preset) }}</span>
            <span class="tile-action text-body-1 mt-5 font-weight-bold">{{ $t('dashboard.start') }} →</span>
          </span>
        </v-btn>
      </v-col>
    </v-row>
  </div>
</template>

<script>
import { mdiScanner } from '@mdi/js';
import Common from '../classes/common.js';
import presetSummary from '../classes/preset-summary.js';

export default {
  name: 'Dashboard',
  inject: ['scanJob'],
  data() {
    return { now: Date.now(), ticker: null, presets: [], loading: false, loadError: '', mdiScanner,
      colors: ['primary', 'teal', 'deep-purple', 'indigo', 'blue-grey', 'green'] };
  },
  computed: {
    steps() {
      return this.scanJob.result && this.scanJob.result.paperless && this.scanJob.result.paperless.status === 'disabled'
        ? ['scanning', 'processing'] : ['scanning', 'processing', 'uploading', 'paperless_processing'];
    },
    stepIndex() {
      if (this.scanJob.stage === 'completed') {
        return this.steps.length;
      }
      if (['pending', 'cleanup'].includes(this.scanJob.stage)) {
        return 3;
      }
      if (['transfer_error', 'failed'].includes(this.scanJob.stage)) {
        return this.scanJob.lastWorkStage === 'cleanup' ? 3 : this.steps.indexOf(this.scanJob.lastWorkStage);
      }
      return this.steps.indexOf(this.scanJob.stage);
    },
    elapsed() {
      return Math.max(0, Math.floor((this.now - this.scanJob.stageStartedAt) / 1000));
    },
    resultType() {
      return this.scanJob.stage === 'transfer_error' ? 'error' : this.scanJob.stage === 'pending' ? 'warning' : 'success';
    }
  },
  mounted() {
    this.load();
    this.ticker = setInterval(() => {
      this.now = Date.now();
    }, 1000);
  },
  beforeUnmount() {
    clearInterval(this.ticker);
  },
  methods: {
    async load() {
      this.loading = true;
      this.loadError = '';
      try {
        this.presets = await Common.fetch('api/v1/presets');
      } catch (error) {
        this.loadError = error.message;
      } finally {
        this.loading = false;
      }
    },
    details(preset) {
      return presetSummary(preset, key => this.$t(key));
    },
    async start(preset) {
      try {
        await this.scanJob.start(preset.request, preset.id);
      } catch {
        // The shared job exposes the server error in the app's persistent alert.
      }
    }
  }
};
</script>

<style scoped>
.progress-status { font-size: 1.35rem; font-weight: 600; }
.progress-steps { display: flex; flex-wrap: wrap; gap: 20px; list-style: none; padding: 0; }
.progress-steps li { opacity: 0.55; }
.progress-steps li.active { opacity: 1; font-weight: 700; }
.progress-steps li.done { opacity: 1; color: rgb(var(--v-theme-success)); }
.progress-steps li span { margin-right: 5px; }
.dashboard { max-width: 1440px; padding: 16px 8px; }
.scan-tile { min-height: 240px; border-radius: 18px; text-transform: none; letter-spacing: normal; }
.scan-tile :deep(.v-btn__content) { width: 100%; white-space: normal; }
.tile-title, .tile-details, .tile-action { color: rgb(var(--v-theme-on-surface)); overflow-wrap: anywhere; }
.tile-title { font-size: clamp(1.4rem, 2vw, 1.8rem); line-height: 1.25; font-weight: 700; }
.tile-details { font-size: 0.95rem; line-height: 1.5; opacity: 0.85; }
.tile-action { font-size: 1rem; }
.scan-tile :deep(.v-icon) { color: rgb(var(--v-theme-on-surface)); opacity: 0.85; }
</style>
