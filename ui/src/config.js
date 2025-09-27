const DEFAULT_WS_URL = 'ws://localhost:8001/ws';
const DEFAULT_API_BASE_URL = 'http://localhost:8000';

export function getWebSocketUrl() {
    const configuredUrl = import.meta.env.VITE_WS_URL;

    if (configuredUrl && configuredUrl.trim().length > 0) {
        return configuredUrl;
    }

    return DEFAULT_WS_URL;
}

export function getApiBaseUrl() {
    const configuredUrl = import.meta.env.VITE_API_BASE_URL;

    if (configuredUrl && configuredUrl.trim().length > 0) {
        return configuredUrl;
    }

    return DEFAULT_API_BASE_URL;
}
