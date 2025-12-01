// API base URL - uses environment variable in production, empty string for local dev (proxied)
export const API_URL = import.meta.env.VITE_API_URL || '';
