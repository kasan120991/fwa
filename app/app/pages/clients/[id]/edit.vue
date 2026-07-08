<script setup lang="ts">
// Edit client — loads the contacts row and PATCHes changes. Reuses ContactForm
// (the same component that backs the New client page) in edit mode.
const route = useRoute()
</script>

<template>
  <ContactForm mode="edit" :client-id="route.params.id as string" />
</template>
