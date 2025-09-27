import { getApiBaseUrl } from '../config';

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

    return response.blob();
}

function deriveFilename(imagePath) {
    if (typeof imagePath !== 'string' || imagePath.trim().length === 0) {
        return `image-${Date.now()}`;
    }

    const segments = imagePath.split('/').filter((segment) => segment.trim().length > 0);

    if (segments.length === 0) {
        return `image-${Date.now()}`;
    }

    const lastSegment = segments[segments.length - 1];

    return lastSegment || `image-${Date.now()}`;
}

function ensureFile(blob, filename) {
    const safeName = filename && filename.trim().length > 0 ? filename : `image-${Date.now()}`;
    const mimeType = blob.type && blob.type.length > 0 ? blob.type : 'application/octet-stream';

    try {
        return new File([blob], safeName, { type: mimeType });
    } catch (error) {
        return new Blob([blob], { type: mimeType, endings: 'transparent' });
    }
}

function buildTasksUrl() {
    const baseUrl = getApiBaseUrl();
    const trimmed = typeof baseUrl === 'string' ? baseUrl.trim() : '';
    const normalized = trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;

    return `${normalized || 'http://localhost:8000'}/tasks`;
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
        filename = candidateName && candidateName.trim().length > 0
            ? candidateName.trim()
            : deriveFilename(trimmedPath);
        metadataPath = '';
    } else {
        const blob = await loadImageBlob(trimmedPath);
        filename = deriveFilename(trimmedPath);
        fileLike = ensureFile(blob, filename);
        metadataPath = trimmedPath;
    }

    const normalizedFilename = filename && filename.trim().length > 0
        ? filename.trim()
        : `image-${Date.now()}`;
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
