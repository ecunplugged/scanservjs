<template>
  <section class="scan-history" aria-live="polite">
    <h2 class="text-subtitle-1 font-weight-bold mb-2">{{ $t('history.title') }}</h2>
    <p v-if="error" class="text-error">{{ error }}</p>
    <p v-else-if="!scans.length" class="text-body-2 text-medium-emphasis">{{ $t('history.empty') }}</p>
    <ol v-else class="history-list">
      <li v-for="scan in scans" :key="scan.id" :title="scan.name">
        <div class="history-line">
<time :datetime="scan.scannedAt">{{ dateTime(scan.scannedAt) }}</time>
          <span>{{ $t('history.pages', [scan.pageCount]) }} · {{ $t(`history.${scan.source}`) }} · {{ megabytes(scan.size) }} MB</span>
</div>
        <div class="history-detail">
<span class="history-name">{{ scan.name }}</span>
          <span :class="{ 'text-success': scan.paperless.status === 'success' }">Paperless: {{ $t(`history.${scan.paperless.status}`) }}</span>
</div>
      </li>
    </ol>
  </section>
</template>

<script>
import { dateTime, megabytes } from '../classes/scan-display.js';
export default {
  name: 'ScanHistory',
  inject: ['scanJob'],
  data: () => ({ scans: [], error: '', ticker: null, pending: false, active: true }),
  watch: {
    'scanJob.stage'() {
      this.load();
    }
  },
  mounted() {
    this.load();
    this.ticker = setInterval(this.load, 5000);
  },
  beforeUnmount() {
    this.active = false;
    clearInterval(this.ticker);
  },
  methods: {
    dateTime, megabytes,
    async load() {
      if (this.pending) {
        return;
      }
      this.pending = true;
      try {
        const scans = await this.scanJob.fetchBounded('api/v1/scan-history', { cache: 'no-store' });
        if (this.active) {
          this.scans = scans; this.error = '';
        }
      } catch (error) {
        if (this.active) {
          this.error = error.message;
        }
      } finally {
        this.pending = false;
      }
    }
  }
};
</script>

<style scoped>
.scan-history { min-width: 0; }
.history-list { list-style: none; padding: 0; font-size: 0.8rem; }
.history-list li { padding: 6px 0; border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12); }
.history-line, .history-detail { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.history-line time { font-variant-numeric: tabular-nums; }
.history-detail { margin-top: 2px; opacity: 0.75; }
.history-name { max-width: 230px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
</style>
