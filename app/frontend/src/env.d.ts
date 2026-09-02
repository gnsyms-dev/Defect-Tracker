/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL for the API.
   *
   * Defaults to the RELATIVE '/api/v1' so dev goes through Vite's proxy and
   * production can be served same-origin behind a reverse proxy. Only set an
   * absolute URL for a genuinely cross-origin deployment -- and note that would
   * also require fixing the backend's CORS origin handling.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
