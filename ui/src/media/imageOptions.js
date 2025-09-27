const STATIC_IMAGE_MODULES = import.meta.glob('../assets/**/*.{jpg,jpeg}', {
    eager: true,
    import: 'default'
});

function hasJpegExtension(value) {
    if (typeof value !== 'string') {
        return false;
    }

    const lower = value.toLowerCase();
    return lower.endsWith('.jpg') || lower.endsWith('.jpeg');
}

function sanitizeOption(entry, fallbackIndex = 0) {
    if (!entry) {
        return null;
    }

    if (typeof entry === 'string') {
        if (!hasJpegExtension(entry.split('?')[0])) {
            return null;
        }

        return {
            id: `static-${fallbackIndex}`,
            src: entry,
            label: `Image ${fallbackIndex + 1}`
        };
    }

    if (typeof entry === 'object') {
        const candidateSrc = typeof entry.src === 'string' ? entry.src : null;
        const candidatePath = typeof entry.path === 'string' ? entry.path : null;
        const candidateUrl = typeof entry.url === 'string' ? entry.url : null;
        const src = candidateSrc || candidatePath || candidateUrl;

        if (!src || !hasJpegExtension(src.split('?')[0])) {
            return null;
        }

        const labelCandidates = [entry.label, entry.title, entry.name];
        const firstLabel = labelCandidates.find((value) => typeof value === 'string' && value.trim().length > 0);
        const label = firstLabel || '';

        return {
            id: typeof entry.id === 'string' && entry.id.trim().length > 0
                ? entry.id.trim()
                : `static-${fallbackIndex}`,
            src,
            label: label.trim().length > 0 ? label.trim() : `Image ${fallbackIndex + 1}`
        };
    }

    return null;
}

function getBundledOptions() {
    const entries = Object.entries(STATIC_IMAGE_MODULES || {});

    return entries.map(([path, url], index) => {
        const normalizedLabel = path
            .split('/')
            .filter((segment) => segment.trim().length > 0)
            .pop() || `Image ${index + 1}`;

        return {
            id: `bundled-${index}`,
            src: url,
            label: normalizedLabel
        };
    });
}

function getGlobalOptions() {
    if (typeof window === 'undefined') {
        return [];
    }

    const globalOptions = window.COMPOTASTIC_IMAGE_OPTIONS;

    if (!Array.isArray(globalOptions)) {
        return [];
    }

    return globalOptions
        .map((entry, index) => sanitizeOption(entry, index))
        .filter((option) => option && typeof option.src === 'string');
}

async function fetchManifestOptions(manifestPath = 'assets/manifest.json') {
    try {
        const response = await fetch(manifestPath, { cache: 'no-store' });

        if (!response.ok) {
            return [];
        }

        const payload = await response.json();

        if (Array.isArray(payload)) {
            return payload
                .map((entry, index) => sanitizeOption(entry, index))
                .filter((option) => option && typeof option.src === 'string');
        }

        if (payload && Array.isArray(payload.images)) {
            return payload.images
                .map((entry, index) => sanitizeOption(entry, index))
                .filter((option) => option && typeof option.src === 'string');
        }
    } catch (error) {
        // Swallow errors silently so UI can continue functioning without manifest.
    }

    return [];
}

function dedupeBySource(options) {
    const seen = new Set();
    const deduped = [];

    options.forEach((option) => {
        if (!option || typeof option.src !== 'string') {
            return;
        }

        const key = option.src;

        if (seen.has(key)) {
            return;
        }

        seen.add(key);
        deduped.push(option);
    });

    return deduped;
}

let cachedOptionsPromise = null;

export async function loadImageOptions({ refresh = false } = {}) {
    if (!cachedOptionsPromise || refresh) {
        cachedOptionsPromise = (async () => {
            const bundled = getBundledOptions();
            const globals = getGlobalOptions();
            const manifest = await fetchManifestOptions();
            const combined = dedupeBySource([...bundled, ...globals, ...manifest]);

            if (combined.length === 0) {
                return [];
            }

            return combined.sort((a, b) => {
                const labelA = typeof a.label === 'string' ? a.label.toLowerCase() : '';
                const labelB = typeof b.label === 'string' ? b.label.toLowerCase() : '';

                if (labelA < labelB) {
                    return -1;
                }

                if (labelA > labelB) {
                    return 1;
                }

                return 0;
            });
        })();
    }

    return cachedOptionsPromise;
}
