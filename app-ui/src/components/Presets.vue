<template>
  <div class="mx-auto" style="max-width: 1100px;">
    <div class="d-flex align-center flex-wrap ga-3 mb-6">
      <h1 class="text-h4">{{ $t('jobs.manage') }}</h1>
      <v-spacer />
      <v-btn to="/dashboard" variant="text">{{ $t('dashboard.title') }}</v-btn>
      <v-btn to="/presets/new" color="primary">{{ $t('jobs.new') }}</v-btn>
    </div>
    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>
    <v-progress-linear v-if="loading" indeterminate />
    <v-alert v-if="!loading && !presets.length" type="info">{{ $t('dashboard.empty') }}</v-alert>
    <v-card v-for="preset in presets" :key="preset.id" class="mb-4 pa-4" variant="outlined">
      <div class="d-flex flex-wrap align-center ga-3">
        <div>
          <h2 class="text-h6">{{ preset.name }}</h2>
          <p class="text-body-2 text-medium-emphasis">{{ summary(preset) }}</p>
        </div>
        <v-spacer />
        <v-btn :to="`/presets/${preset.id}/edit`" variant="tonal">{{ $t('jobs.edit') }}</v-btn>
        <v-btn color="error" variant="text" @click="deleting = preset">{{ $t('jobs.delete') }}</v-btn>
      </div>
    </v-card>
    <v-dialog :model-value="Boolean(deleting)" max-width="480" @update:model-value="deleting = null">
      <v-card :title="$t('jobs.delete')">
        <v-card-text>{{ $t('jobs.confirm-delete', [deleting ? deleting.name : '']) }}</v-card-text>
        <v-card-actions>
          <v-btn :disabled="removing" @click="deleting = null">{{ $t('jobs.cancel') }}</v-btn>
          <v-spacer />
          <v-btn color="error" :loading="removing" @click="remove">{{ $t('jobs.delete') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script>
import Common from '../classes/common.js';
import presetSummary from '../classes/preset-summary.js';
export default {
  name: 'Presets',
  data() {
    return { presets: [], loading: false, error: '', deleting: null, removing: false };
  },
  mounted() {
    this.load();
  },
  methods: {
    summary(preset) {
      return presetSummary(preset, key => this.$t(key));
    },
    async load() {
      this.loading = true;
      this.error = '';
      try {
        this.presets = await Common.fetch('api/v1/presets');
      } catch (error) {
        this.error = error.message;
      } finally {
        this.loading = false;
      }
    },
    async remove() {
      if (!this.deleting || this.removing) {
        return;
      }
      this.removing = true;
      try {
        await Common.fetch(`api/v1/presets/${encodeURIComponent(this.deleting.id)}`, { method: 'DELETE' });
        this.deleting = null;
        await this.load();
      } catch (error) {
        this.error = error.message;
      } finally {
        this.removing = false;
      }
    }
  }
};
</script>
