import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, 'src'),
      '@': path.resolve(__dirname, '../../libs/moqtail-ts/src'),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  /*
    server: {
      port: 9444,
      host: '0.0.0.0',
      allowedHosts: ['moq.streaming.university'],
      https: {key: 'key.pem', cert: 'cert.pem'}
    }
  */
})
