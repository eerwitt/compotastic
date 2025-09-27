const DEFAULT_WS_URL = 'ws://localhost:8001/ws';

export function getWebSocketUrl() {
    const configuredUrl = import.meta.env.VITE_WS_URL;

    if (configuredUrl && configuredUrl.trim().length > 0) {
        return configuredUrl;
    }

    return DEFAULT_WS_URL;
}
