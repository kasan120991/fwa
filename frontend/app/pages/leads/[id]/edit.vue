<script setup lang="ts">
// Edit lead — loads the contacts row and PATCHes changes. Reuses ContactForm in
// lead mode (the same component that backs the client form).
const route = useRoute()
</script>

<template>
  <ContactForm kind="lead" mode="edit" :client-id="route.params.id as string" />
</template>
