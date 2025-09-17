import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/AnaliticoCDI/',   // <<-- nome EXATO do repositório no GitHub
})
