import { getApiBaseUrl } from '../config';

const JPEG_MIME_TYPES = ['image/jpeg', 'image/jpg'];

function isJpegMimeType(value) {
    if (typeof value !== 'string') {
        return false;
    }

    const lower = value.toLowerCase();
    return JPEG_MIME_TYPES.includes(lower);
}

function hasJpegExtension(name) {
    if (typeof name !== 'string') {
        return false;
    }

    const lower = name.toLowerCase();
    return lower.endsWith('.jpg') || lower.endsWith('.jpeg');
}

function ensureJpegFilename(name) {
    const fallback = `image-${Date.now()}.jpg`;

    if (typeof name !== 'string') {
        return fallback;
    }

    const trimmed = name.trim();

    if (trimmed.length === 0) {
        return fallback;
    }

    const lower = trimmed.toLowerCase();

    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
        return trimmed;
    }

    if (!lower.includes('.')) {
        return `${trimmed}.jpg`;
    }

    throw new Error('Only .jpg image files are supported.');
}

function validateJpegBlob(blob, filename) {
    const candidateType = blob && typeof blob.type === 'string' ? blob.type : '';

    if (candidateType && !isJpegMimeType(candidateType)) {
        throw new Error('Only JPEG (.jpg) images are supported.');
    }

    if (!hasJpegExtension(filename)) {
        throw new Error('Only .jpg image files are supported.');
    }
}

function normalizePrompt(prompt) {
    if (typeof prompt !== 'string') {
        return '';
    }

    return prompt.trim();
}

function buildMetadata({ prompt, tileX, tileY, imagePath, imageLabel, filename }) {
    return {
        prompt,
        tile: {
            x: Number.isFinite(tileX) ? tileX : null,
            y: Number.isFinite(tileY) ? tileY : null
        },
        image: {
            path: imagePath,
            label: typeof imageLabel === 'string' ? imageLabel : '',
            filename
        },
        source: 'phaser-grid-selection',
        createdAt: new Date().toISOString()
    };
}

async function loadImageBlob(imagePath) {
    const response = await fetch(imagePath, { cache: 'no-store' });

    if (!response.ok) {
        throw new Error(`Unable to load image asset (${response.status} ${response.statusText}).`);
    }

    const headerType = response.headers && typeof response.headers.get === 'function'
        ? response.headers.get('content-type')
        : null;

    if (headerType && !isJpegMimeType(headerType)) {
        throw new Error('Only JPEG (.jpg) image assets are supported.');
    }

    const blob = await response.blob();

    if (blob && blob.type && !isJpegMimeType(blob.type)) {
        throw new Error('Only JPEG (.jpg) image assets are supported.');
    }

    return blob;
}

function deriveFilename(imagePath) {
    if (typeof imagePath !== 'string' || imagePath.trim().length === 0) {
        return ensureJpegFilename('');
    }

    const segments = imagePath.split('/').filter((segment) => segment.trim().length > 0);

    if (segments.length === 0) {
        return ensureJpegFilename('');
    }

    const lastSegment = segments[segments.length - 1];
    const stripped = typeof lastSegment === 'string'
        ? lastSegment.split('?')[0].split('#')[0]
        : '';

    return ensureJpegFilename(stripped);
}

function ensureFile(blob, filename) {
    const safeName = ensureJpegFilename(filename);
    validateJpegBlob(blob, safeName);

    try {
        return new File([blob], safeName, { type: 'image/jpeg' });
    } catch (error) {
        return new Blob([blob], { type: 'image/jpeg', endings: 'transparent' });
    }
}

function buildTasksUrl() {
    const baseUrl = getApiBaseUrl();
    const trimmed = typeof baseUrl === 'string' ? baseUrl.trim() : '';
    const normalized = trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;

    return `${normalized || 'http://localhost:8001'}/tasks`;
}

function isFileLike(candidate) {
    if (!candidate) {
        return false;
    }

    if (candidate instanceof Blob) {
        return true;
    }

    const size = typeof candidate.size === 'number' ? candidate.size : null;
    const slice = typeof candidate.slice === 'function';

    return Number.isFinite(size) && slice;
}

export async function submitImageClassificationRequest({
    file,
    imagePath,
    prompt,
    tileX,
    tileY,
    imageLabel
}) {
    const sanitizedPrompt = normalizePrompt(prompt);

    if (!sanitizedPrompt) {
        throw new Error('Please provide a description for the image classification request.');
    }

    const hasUpload = isFileLike(file);
    const trimmedPath = typeof imagePath === 'string' ? imagePath.trim() : '';

    if (!hasUpload && trimmedPath.length === 0) {
        throw new Error('Please select or upload an image before submitting.');
    }

    let fileLike = null;
    let filename = '';
    let metadataPath = '';

    if (hasUpload) {
        fileLike = file;
        const candidateName = typeof file.name === 'string' ? file.name : null;
        if (file && file.type && !isJpegMimeType(file.type)) {
            throw new Error('Only JPEG (.jpg) images are supported.');
        }

        filename = ensureJpegFilename(candidateName || '');
        if (!hasJpegExtension(filename)) {
            throw new Error('Only .jpg image files are supported.');
        }
        metadataPath = '';
    } else {
        const blob = await loadImageBlob(trimmedPath);
        filename = deriveFilename(trimmedPath);
        fileLike = ensureFile(blob, filename);
        metadataPath = trimmedPath;
    }

    const normalizedFilename = ensureJpegFilename(filename);
    const normalizedLabel = typeof imageLabel === 'string' && imageLabel.trim().length > 0
        ? imageLabel.trim()
        : normalizedFilename;
    const metadata = buildMetadata({
        prompt: sanitizedPrompt,
        tileX,
        tileY,
        imagePath: metadataPath,
        imageLabel: normalizedLabel,
        filename: normalizedFilename
    });

    const formData = new FormData();
    formData.append('metadata', JSON.stringify(metadata));

    if (fileLike instanceof Blob) {
        formData.append('file', fileLike, normalizedFilename);
    } else {
        formData.append('file', fileLike, normalizedFilename);
    }

    const response = await fetch(buildTasksUrl(), {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        let message = 'Failed to submit image classification request.';

        try {
            const payload = await response.json();

            if (payload && typeof payload.detail === 'string' && payload.detail.trim().length > 0) {
                message = payload.detail.trim();
            }
        } catch (jsonError) {
            try {
                const text = await response.text();

                if (typeof text === 'string' && text.trim().length > 0) {
                    message = text.trim();
                }
            } catch (textError) {
                // Ignore secondary parsing errors and keep the default message.
            }
        }

        throw new Error(message);
    }

    try {
        return await response.json();
    } catch (error) {
        return {};
    }
}
