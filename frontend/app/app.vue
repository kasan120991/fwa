<script setup lang="ts">
useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

useSeoMeta({
  title: 'Francis Web Agency',
  description: 'Francis Web Agency — internal agency management platform.'
})
</script>

<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
