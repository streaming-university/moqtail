import { AppSettings } from './types/AppSettins'

declare global {
  interface Window {
    appSettings: AppSettings
  }
}
