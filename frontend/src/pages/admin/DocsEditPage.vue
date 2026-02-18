<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import MarkdownIt from 'markdown-it'
import markdownItAttrs from 'markdown-it-attrs'
import api from '../../composables/useApi'

const slug = ref('lab-guide')
const docOptions = ref<{ slug: string; title: string }[]>([])
const title = ref('')
const markdown = ref('')
const loading = ref(true)
const saving = ref(false)
const showPreview = ref(false)
const dragOver = ref(false)
const uploading = ref(false)
const textareaRef = ref<HTMLTextAreaElement>()

const md = new MarkdownIt({ html: true, linkify: true, typographer: true }).use(markdownItAttrs)
const renderedHtml = computed(() => md.render(markdown.value))

async function fetchDoc() {
  loading.value = true
  try {
    const { data } = await api.get(`/docs/${slug.value}`)
    title.value = data.title || ''
    markdown.value = data.content_markdown || ''
  } catch {
    // Doc may not exist yet
  } finally {
    loading.value = false
  }
}

async function saveDoc() {
  saving.value = true
  try {
    await api.post(`/admin/docs/${slug.value}`, {
      contentMarkdown: markdown.value,
      title: title.value,
    })
    alert('已儲存！')
  } finally {
    saving.value = false
  }
}

async function handleDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  await uploadFile(file)
}

async function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const file = item.getAsFile()
      if (file) await uploadFile(file)
      return
    }
  }
}

async function uploadFile(file: File) {
  if (!file.type.startsWith('image/')) {
    alert('只允許上傳圖片檔案')
    return
  }
  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await api.post('/admin/uploads', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    // Insert markdown image at cursor
    const textarea = textareaRef.value
    if (textarea) {
      const start = textarea.selectionStart
      const before = markdown.value.slice(0, start)
      const after = markdown.value.slice(start)
      const imgTag = `![${file.name}](${data.url})`
      markdown.value = before + imgTag + after
    } else {
      markdown.value += `\n![${file.name}](${data.url})`
    }
  } catch (e: any) {
    alert('上傳失敗：' + (e.response?.data?.error || e.message))
  } finally {
    uploading.value = false
  }
}

onMounted(async () => {
  try {
    const { data } = await api.get('/docs/list')
    docOptions.value = data
  } catch {}
  fetchDoc()
})
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
      <div class="flex items-center gap-3">
        <h2 class="text-lg font-semibold text-gray-800">編輯文件</h2>
        <select v-model="slug" @change="fetchDoc" class="input-field !w-auto text-sm">
          <option v-for="opt in docOptions" :key="opt.slug" :value="opt.slug">
            {{ opt.title }}
          </option>
        </select>
      </div>
      <div class="flex gap-2">
        <button @click="showPreview = !showPreview" class="btn-secondary">
          {{ showPreview ? '編輯' : '預覽' }}
        </button>
        <button @click="saveDoc" class="btn-primary" :disabled="saving">
          {{ saving ? '儲存中...' : '發布' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="text-center text-gray-500 py-8">載入中...</div>

    <template v-else>
      <div class="card !p-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">標題</label>
        <input v-model="title" type="text" class="input-field" />
      </div>

      <!-- Preview mode -->
      <div v-if="showPreview" class="card">
        <article class="prose prose-slate max-w-none" v-html="renderedHtml" />
      </div>

      <!-- Edit mode -->
      <div
        v-else
        class="card !p-0 relative"
        :class="{ 'ring-2 ring-primary-400': dragOver }"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
        @drop="handleDrop"
      >
        <div v-if="uploading" class="absolute inset-0 bg-white/80 flex items-center justify-center z-10 rounded-xl">
          <span class="text-primary-500">上傳中...</span>
        </div>
        <div v-if="dragOver" class="absolute inset-0 bg-primary-50/80 flex items-center justify-center z-10 rounded-xl border-2 border-dashed border-primary-400">
          <span class="text-primary-500 font-medium">拖放圖片至此上傳</span>
        </div>
        <textarea
          ref="textareaRef"
          v-model="markdown"
          @paste="handlePaste"
          class="w-full h-[60vh] p-4 font-mono text-sm border-0 resize-none focus:outline-none rounded-xl"
          placeholder="在此輸入 Markdown 內容... 可拖放或貼上圖片"
        />
      </div>
    </template>
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
</style>
