<template>
  <div>
    <div class="text-h5 mb-4">{{ $t('settings.title') }}</div>
    <v-card class="pa-4 mb-6" :title="$t('authentication.title')">
      <v-card-text>
        <v-switch v-model="authentication.enabled" :label="$t('authentication.enabled')" />
        <v-text-field v-model="authentication.username" :label="$t('authentication.username')" autocomplete="username" />
        <v-text-field v-model="authentication.password" type="password" autocomplete="new-password"
          :label="$t('authentication.password')" :hint="authentication.passwordConfigured ? $t('authentication.password-saved') : ''" persistent-hint />
        <p class="mb-4">{{ $t('authentication.description') }}</p>
        <v-btn :disabled="!authenticationLoaded" @click="saveAuthentication">{{ $t('jobs.save') }}</v-btn>
      </v-card-text>
    </v-card>
    <v-card class="pa-4 mb-6" :title="$t('paperless.title')">
      <v-card-text>
        <v-switch v-model="paperless.enabled" :label="$t('paperless.enabled')" />
        <v-text-field v-model="paperless.url" :label="$t('paperless.url')" placeholder="https://paperless.example.com" />
        <v-text-field v-model="paperless.token" type="password" autocomplete="new-password"
          :label="$t('paperless.token')" :hint="paperless.tokenConfigured ? $t('paperless.token-saved') : ''" persistent-hint />
        <v-switch v-model="paperless.deleteAfterTransfer" :label="$t('paperless.delete')" />
        <p class="mb-4">{{ $t('paperless.description') }}</p>
        <v-btn :disabled="!paperlessLoaded" @click="savePaperless">{{ $t('jobs.save') }}</v-btn>
      </v-card-text>
    </v-card>
    <settings-section>
      <template #title>{{ $t('settings.behaviour-ui') }}</template>
      <template #items>
        <settings-item>
          <template #description>
            {{ $t('settings.theme:description') }}
          </template>
          <template #action>
            <div style="max-width: 10rem;">
              <v-select v-model="settings.theme" :label="$t('settings.theme')" :items="themes" item-title="text" @update:model-value="reload" />
            </div>
          </template>
        </settings-item>
        <settings-item>
          <template #description>
            {{ $t('settings.color:description') }}
          </template>
          <template #action>
            <div style="max-width: 10rem;">
              <v-menu offset-y>
                <template #activator="{ props }">
                  <v-btn v-bind="props">{{ $t('settings.color') }}</v-btn>
                </template>
                <v-list>
                  <v-list-item v-for="item in colors" :key="item.value" :class="`bg-${item.value}`"
                    min-height="36px"
                    :title="item.text"
                    @click="settings.appColor = item.value; reload()" />
                </v-list>
              </v-menu>
            </div>
          </template>
        </settings-item>
        <settings-item>
          <template #description>
            {{ $t('settings.locale:description') }}
          </template>
          <template #action>
            <div style="max-width: 10rem;">
              <v-select v-model="settings.locale" :label="$t('settings.locale')"
                :items="locales" item-title="text"
                item-value="value" @update:model-value="reload" />
            </div>
          </template>
        </settings-item>
        <settings-item>
          <template #description>
            {{ $t('settings.show-files-after-scan:description') }}
          </template>
          <template #action>
            <div style="max-width: 10rem;">
              <v-switch v-model="settings.showFilesAfterScan" />
            </div>
          </template>
        </settings-item>
      </template>
    </settings-section>

    <settings-section>
      <template #title>{{ $t('settings.devices') }}</template>
      <template #items>
        <settings-item>
          <template #description>
            {{ $t('settings.reset:description') }}
          </template>
          <template #action>
            <v-btn color="warning" class="ml-1 mb-1" @click="reset">{{ $t('settings.reset') }} <v-icon class="ml-2" :icon="mdiRefresh" /></v-btn>
          </template>
        </settings-item>

        <settings-item>
          <template #description>
            {{ $t('settings.clear-storage:description') }}
          </template>
          <template #action>
            <v-btn color="warning" class="ml-1 mb-1" @click="reset">{{ $t('settings.clear-storage') }} <v-icon class="ml-2" :icon="mdiDelete" /></v-btn>
          </template>
        </settings-item>
      </template>
    </settings-section>
  </div>
</template>

<script>
import { mdiDelete, mdiRefresh } from '@mdi/js';
import Common from '../classes/common';
import Constants from '../classes/constants';
import Storage from '../classes/storage';

import SettingsSection from './SettingsSection.vue';
import SettingsItem from './SettingsItem.vue';

const storage = Storage.instance();

export default {
  name: 'Settings',

  components: {
    SettingsSection,
    SettingsItem
  },
  inject: ['requestMask'],

  emits: ['mask', 'notify'],

  setup() {
    return {
      mdiDelete,
      mdiRefresh,
    };
  },

  data() {
    return {
      settings: storage.settings,
      authenticationLoaded: false,
      authentication: { enabled: false, username: 'scanner', password: '' },
      paperlessLoaded: false,
      paperless: { enabled: false, url: '', token: '', deleteAfterTransfer: false }
    };
  },

  computed: {
    colors() {
      return Constants.Colors.map(c => {
        return {
          text: this.$t(`colors.${c}`),
          value: c
        };
      });
    },

    locales() {
      return Constants.Locales.map(l => {
        return {
          text: this.$t(`locales.${l}`),
          value: l
        };
      });
    },

    themes() {
      return Object.keys(Constants.Themes).map(t => {
        return {
          text: this.$t(`settings.theme:${Constants.Themes[t]}`),
          value: Constants.Themes[t]
        };
      });
    }
  },

  watch: {
    settings: {
      handler(settings) {
        storage.settings = settings;
      },
      deep: true
    }
  },

  async mounted() {
    try {
      this.authentication = { ...await Common.fetch('api/v1/authentication'), password: '' };
      this.authenticationLoaded = true;
    } catch (error) {
      this.$emit('notify', { type: 'e', message: error.message });
    }
    try {
      this.paperless = { ...await Common.fetch('api/v1/paperless'), token: '' };
      this.paperlessLoaded = true;
    } catch (error) {
      this.$emit('notify', { type: 'e', message: error });
    }
  },

  methods: {
    async saveAuthentication() {
      this.requestMask(1);
      try {
        this.authentication = { ...await Common.fetch('api/v1/authentication', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.authentication)
        }), password: '' };
        this.$emit('notify', { type: 'i', message: this.$t('jobs.saved') });
      } catch (error) {
        this.$emit('notify', { type: 'e', message: error.message });
      } finally {
        this.requestMask(-1);
      }
    },

    async savePaperless() {
      this.requestMask(1);
      try {
        this.paperless = { ...await Common.fetch('api/v1/paperless', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.paperless)
        }), token: '' };
        this.$emit('notify', { type: 'i', message: this.$t('jobs.saved') });
      } catch (error) {
        this.$emit('notify', { type: 'e', message: error });
      } finally {
        this.requestMask(-1);
      }
    },

    clearStorage() {
      storage.request = null;
    },

    reload() {
      location.href = `?anticache=${Date.now()}${location.hash}`;
    },

    reset() {
      this.requestMask(1);
      Common.fetch('api/v1/context', {
        method: 'DELETE'
      }).then(() => {
        this.requestMask(-1);
      }).catch(error => {
        this.$emit('notify', { type: 'e', message: error });
        this.requestMask(-1);
      });
    }
  }
};
</script>

<style>

</style>
