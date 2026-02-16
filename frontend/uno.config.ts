import { defineConfig, presetUno, presetIcons } from 'unocss'
import transformerDirectives from '@unocss/transformer-directives'

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons({
      scale: 1.2,
      cdn: 'https://esm.sh/',
    }),
  ],
  transformers: [
    transformerDirectives(),
  ],
  theme: {
    colors: {
      primary: {
        50: '#f0f9ff',
        100: '#e0f2fe',
        200: '#bae6fd',
        300: '#7dd3fc',
        400: '#38bdf8',
        500: '#0ea5e9',
        600: '#0284c7',
        700: '#0369a1',
        800: '#075985',
        900: '#0c4a6e',
      },
    },
  },
  shortcuts: {
    'btn': 'px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
    'btn-primary': 'btn bg-primary-500 text-white hover:bg-primary-600',
    'btn-secondary': 'btn bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300',
    'btn-danger': 'btn bg-red-500 text-white hover:bg-red-600',
    'card': 'bg-white rounded-xl shadow-sm border border-gray-200 p-6',
    'input-field': 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
  },
})
