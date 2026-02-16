<script setup lang="ts">
import { ref, onMounted } from 'vue'
import MarkdownIt from 'markdown-it'
import { useBrandingStore } from '../stores/branding'
import api from '../composables/useApi'

const branding = useBrandingStore()
const content = ref('')
const title = ref('')
const loading = ref(true)
const error = ref('')

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})

onMounted(async () => {
  if (!branding.loaded) branding.fetch()
  try {
    const { data } = await api.get('/docs/public/about')
    title.value = data.title
    content.value = data.content_markdown || ''
  } catch (e: any) {
    error.value = e.response?.data?.error || '載入失敗'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col items-center p-4">
    <div class="w-full max-w-2xl mt-8">
      <!-- Branding header -->
      <div class="text-center mb-6">
        <div v-if="branding.siteLogo" class="inline-flex w-16 h-16 rounded-2xl overflow-hidden mb-4">
          <img :src="branding.siteLogo" alt="Logo" class="w-full h-full object-cover" />
        </div>
        <div v-else class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-500 text-white text-2xl font-bold mb-4">
          {{ branding.siteInitial }}
        </div>
        <h1 class="text-2xl font-bold text-gray-900">{{ branding.siteName }}</h1>
      </div>

      <!-- Content -->
      <div v-if="loading" class="text-center text-gray-500 py-12">載入中...</div>
      <div v-else-if="error" class="card text-red-500">{{ error }}</div>
      <div v-else class="card">
        <article class="prose prose-slate max-w-none" v-html="md.render(content)" />
      </div>

      <!-- Back to login -->
      <div class="text-center mt-6">
        <router-link to="/login" class="text-primary-500 hover:text-primary-700 text-sm">
          ← 返回登入
        </router-link>
      </div>
    </div>
  </div>
</template>

<style>
.prose {
  line-height: 1.8;
  color: #334155;
}
.prose h1 { font-size: 2em; font-weight: 700; margin-top: 0; margin-bottom: 0.5em; color: #0f172a; }
.prose h2 { font-size: 1.5em; font-weight: 600; margin-top: 1.5em; margin-bottom: 0.5em; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.3em; }
.prose h3 { font-size: 1.25em; font-weight: 600; margin-top: 1.2em; margin-bottom: 0.4em; color: #1e293b; }
.prose p { margin-top: 0.75em; margin-bottom: 0.75em; }
.prose code { background: #f1f5f9; padding: 0.2em 0.4em; border-radius: 0.25em; font-size: 0.9em; }
.prose pre { background: #1e293b; color: #e2e8f0; padding: 1em; border-radius: 0.5em; overflow-x: auto; }
.prose pre code { background: none; padding: 0; color: inherit; }
.prose img { max-width: 100%; border-radius: 0.5em; margin: 1em 0; }
.prose a { color: #0ea5e9; text-decoration: none; }
.prose a:hover { text-decoration: underline; }
.prose ul, .prose ol { margin: 0.75em 0; padding-left: 1.5em; }
.prose li { margin: 0.25em 0; }
.prose blockquote { border-left: 4px solid #0ea5e9; padding-left: 1em; margin: 1em 0; color: #64748b; }
</style>
