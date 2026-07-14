<script setup lang="ts">
definePageMeta({ title: 'Settings', breadcrumb: 'Workspace' })
useHead({ title: 'Settings · Francis Web Agency' })

const route = useRoute()
const router = useRouter()

type Section = 'profile' | 'agency' | 'templates' | 'integrations' | 'preferences' | 'portal'
const SECTIONS: { id: Section, label: string, icon: string }[] = [
  { id: 'profile', label: 'Profile', icon: 'i-lucide-user' },
  { id: 'agency', label: 'Agency & Branding', icon: 'i-lucide-building-2' },
  { id: 'templates', label: 'Project Templates', icon: 'i-lucide-list-checks' },
  { id: 'integrations', label: 'Integrations', icon: 'i-lucide-plug' },
  { id: 'preferences', label: 'Preferences', icon: 'i-lucide-sliders-horizontal' },
  { id: 'portal', label: 'Client Portal Access', icon: 'i-lucide-users' }
]
const IDS = SECTIONS.map(s => s.id)

const active = computed<Section>(() => {
  const q = route.query.section
  return (typeof q === 'string' && IDS.includes(q as Section)) ? q as Section : 'profile'
})
function go(id: Section) {
  router.replace({ query: { ...route.query, section: id } })
}
</script>

<template>
  <div class="mx-auto w-full max-w-[1120px]">
    <div class="grid grid-cols-1 items-start gap-7 md:grid-cols-[210px_1fr]">
      <!-- section rail -->
      <nav class="flex gap-1 overflow-x-auto md:sticky md:top-2 md:flex-col md:overflow-visible">
        <button
          v-for="s in SECTIONS"
          :key="s.id"
          type="button"
          class="flex flex-none items-center gap-2.5 rounded-[10px] border px-3 py-2 text-left text-sm transition-colors"
          :class="active === s.id
            ? 'border-primary/25 bg-mist font-semibold text-primary'
            : 'border-transparent text-toned hover:bg-default'"
          @click="go(s.id)"
        >
          <UIcon
            :name="s.icon"
            class="size-[17px] flex-none"
            :class="active === s.id ? 'text-primary' : 'text-muted'"
          />
          <span class="whitespace-nowrap">{{ s.label }}</span>
        </button>
      </nav>

      <!-- active panel -->
      <div class="min-w-0">
        <SettingsProfile v-if="active === 'profile'" />
        <SettingsAgency v-else-if="active === 'agency'" />
        <SettingsProjectTemplates v-else-if="active === 'templates'" />
        <SettingsIntegrations v-else-if="active === 'integrations'" />
        <SettingsPreferences v-else-if="active === 'preferences'" />
        <SettingsPortalAccess v-else-if="active === 'portal'" />
      </div>
    </div>
  </div>
</template>
