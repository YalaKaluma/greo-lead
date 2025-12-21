import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // Build output configuration
  build: {
    // Output to /app/static (one level up from frontend/)
    outDir: '../static',
    
    // Clear output directory before build
    emptyOutDir: true,
    
    // Generate manifest for asset tracking
    manifest: true,
    
    // Optimize bundle
    minify: 'terser',
    
    rollupOptions: {
      output: {
        // Place assets in /assets subfolder
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      }
    }
  },
  
  // Development server configuration
  server: {
    port: 5173,
    proxy: {
      // Proxy API requests to FastAPI backend during development
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  },
  
  // Path resolution
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    }
  }
})
