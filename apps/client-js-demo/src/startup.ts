import { AppSettings } from './types/AppSettings'

declare global {
  interface Window {
    appSettings: AppSettings
  }
}
