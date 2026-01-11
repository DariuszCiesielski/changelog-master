/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string;
  readonly VITE_CHANGELOG_CACHE_DURATION: string;
  readonly VITE_VOICE_PREFERENCE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
