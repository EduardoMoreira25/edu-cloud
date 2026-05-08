import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/cloud/',
  
  // Tell Vite to copy the favicon.ico from public folder 
  // into the build output automatically.
  assetsInclude: ['public/**/*'], 
  
  // Optional: If you want to ensure the file is copied specifically
  // (Vite usually handles this if the file exists in 'public', 
  // but explicit config prevents errors).
})
