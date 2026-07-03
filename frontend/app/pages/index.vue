<script setup lang="ts">
// No dashboard yet this phase — send the root to the login screen.
definePageMeta({
  middleware: () => navigateTo('/login')
})
</script>

<template>
  <div />
</template>
