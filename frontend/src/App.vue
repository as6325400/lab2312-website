<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()
onMounted(() => auth.fetchMe())
</script>

<template>
  <div v-if="auth.loading" class="min-h-screen flex items-center justify-center bg-gray-50">
    <div class="text-gray-400">Loading...</div>
  </div>
  <router-view v-else />
</template>
