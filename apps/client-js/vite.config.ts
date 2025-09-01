import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  worker: { plugins: () => [tsconfigPaths()] },
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
