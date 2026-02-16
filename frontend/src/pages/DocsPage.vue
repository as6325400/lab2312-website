<script setup lang="ts">
import { ref, inject, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import MarkdownIt from 'markdown-it'
import api from '../composables/useApi'

const route = useRoute()
const setPageTitle = inject<(t: string) => void>('setPageTitle', () => {})
const content = ref('')
const title = ref('')
const loading = ref(true)
const error = ref('')

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})

async function fetchDoc() {
  loading.value = true
  error.value = ''
  try {
    const slug = route.params.slug as string
    const { data } = await api.get(`/docs/${slug}`)
    title.value = data.title
    setPageTitle(data.title || '')
    content.value = data.content_markdown || ''
  } catch (e: any) {
    error.value = e.response?.data?.error || '載入失敗'
  } finally {
    loading.value = false
  }
}

onMounted(fetchDoc)
watch(() => route.params.slug, fetchDoc)
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <div v-if="loading" class="text-center text-gray-500 py-12">載入中...</div>
    <div v-else-if="error" class="card text-red-500">{{ error }}</div>
    <div v-else class="card">
      <h1 v-if="title" class="text-2xl font-bold text-gray-900 mb-4 pb-3 border-b border-gray-200">{{ title }}</h1>
      <article class="prose prose-slate max-w-none" v-html="md.render(content)" />
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
.prose table { width: 100%; border-collapse: collapse; margin: 1em 0; }
.prose th, .prose td { border: 1px solid #e2e8f0; padding: 0.5em 0.75em; text-align: left; }
.prose th { background: #f8fafc; font-weight: 600; }
.prose ul, .prose ol { margin: 0.75em 0; padding-left: 1.5em; }
.prose li { margin: 0.25em 0; }
.prose blockquote { border-left: 4px solid #0ea5e9; padding-left: 1em; margin: 1em 0; color: #64748b; }
.prose a { color: #0ea5e9; text-decoration: none; }
.prose a:hover { text-decoration: underline; }
</style>
