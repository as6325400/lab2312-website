<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import 'xterm/css/xterm.css'

const termRef = ref<HTMLDivElement>()
let terminal: any = null
let fitAddon: any = null
let ws: WebSocket | null = null

onMounted(async () => {
  const { Terminal } = await import('xterm')
  const { FitAddon } = await import('xterm-addon-fit')

  terminal = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: {
      background: '#1e293b',
      foreground: '#e2e8f0',
      cursor: '#38bdf8',
      selectionBackground: '#334155',
    },
  })

  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.open(termRef.value!)
  fitAddon.fit()

  // Connect WebSocket
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  ws = new WebSocket(`${proto}://${location.host}/ws/terminal`)
  ws.binaryType = 'arraybuffer'

  ws.onopen = () => {
    terminal.writeln('Connecting to bastion...')
    // Send initial size
    ws!.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }))
  }

  ws.onmessage = (event) => {
    if (typeof event.data === 'string') {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'error') {
          terminal.writeln(`\r\n\x1b[31mError: ${msg.message}\x1b[0m`)
          return
        }
      } catch {
        // Not JSON, write as terminal data
      }
      terminal.write(event.data)
    } else {
      terminal.write(new Uint8Array(event.data))
    }
  }

  ws.onclose = () => {
    terminal.writeln('\r\n\x1b[33m[Connection closed]\x1b[0m')
  }

  ws.onerror = () => {
    terminal.writeln('\r\n\x1b[31m[WebSocket error]\x1b[0m')
  }

  // Terminal input -> WebSocket
  terminal.onData((data: string) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data)
    }
  })

  // Handle resize
  terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols, rows }))
    }
  })

  // Window resize handler
  const handleResize = () => fitAddon?.fit()
  window.addEventListener('resize', handleResize)

  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize)
  })
})

onBeforeUnmount(() => {
  ws?.close()
  terminal?.dispose()
})
</script>

<template>
  <div class="h-full flex flex-col">
    <div ref="termRef" class="flex-1 rounded-xl overflow-hidden border border-gray-700" />
  </div>
</template>

<style></style>
