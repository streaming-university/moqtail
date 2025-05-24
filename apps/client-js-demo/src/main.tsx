import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { PostHogProvider } from 'posthog-js/react'

const posthog_host = window.appSettings.posthog_host
const posthog_code = window.appSettings.posthog_code

const options = {
  api_host: posthog_host,
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {import.meta.env.DEV ? (
      <App />
    ) : (
      <PostHogProvider apiKey={posthog_code} options={options}>
        <App />
      </PostHogProvider>
    )}
  </StrictMode>,
)
