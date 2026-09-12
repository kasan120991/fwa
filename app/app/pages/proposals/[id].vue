<script setup lang="ts">
// Edit proposal — the same editor in edit mode. A decided proposal (accepted or
// declined) renders read-only here; it's the record of what was agreed.
definePageMeta({ title: 'Edit Proposal', breadcrumb: 'Proposals' })
const route = useRoute()
</script>

<template>
  <ProposalEditor
    mode="edit"
    :proposal-id="route.params.id as string"
  />
</template>
