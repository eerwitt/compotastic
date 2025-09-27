import { submitImageClassificationRequest } from '../api/imageTasks';
export const DEFAULT_IMAGE_PROMPT = 'This is an image taken from a robots front facing camera, what is the object found in the foreground and classify if this image is dangerous or capable of being moved by a light weight robot. Respond with one of these words only DANGEROUS, MOVABLE, IMMOVABLE, UNKNOWN';

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

function isValidJpegFile(file) {
    if (!file) {
        return false;
    }

    if (file.type && !isJpegMimeType(file.type)) {
        return false;
    }

    if (typeof file.name === 'string' && file.name.trim().length > 0) {
        return hasJpegExtension(file.name.trim());
    }

    return true;
}

function createElement(tag, className, attributes = {}) {
    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    Object.entries(attributes).forEach(([key, value]) => {
        if (value === undefined || value === null) {
            return;
        }

        element.setAttribute(key, value);
    });

    return element;
}

function stopEvent(event) {
    if (!event) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
}

export class ImageClassificationModal {
    constructor({ defaultPrompt = DEFAULT_IMAGE_PROMPT } = {}) {
        this.defaultPrompt = defaultPrompt;
        this.overlay = null;
        this.form = null;
        this.promptInput = null;
        this.fileInput = null;
        this.previewContainer = null;
        this.previewImage = null;
        this.previewFilename = null;
        this.submitButton = null;
        this.cancelButton = null;
        this.closeButton = null;
        this.statusElement = null;
        this.placeholderElement = null;
        this.isBusy = false;
        this.isVisible = false;
        this.selectedFile = null;
        this.selectedImageUrl = null;
        this.tileLocation = { x: null, y: null };

        this.handleOverlayClick = this.handleOverlayClick.bind(this);
        this.handleFormSubmit = this.handleFormSubmit.bind(this);
        this.handleCancel = this.handleCancel.bind(this);
        this.handleFileChange = this.handleFileChange.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
    }

    ensureElements() {
        if (this.overlay) {
            return;
        }

        this.overlay = createElement('div', 'image-modal-overlay', {
            role: 'dialog',
            'aria-modal': 'true',
            tabindex: '-1'
        });

        const modal = createElement('div', 'image-modal');
        const header = createElement('div', 'image-modal__header');
        const title = createElement('h2', 'image-modal__title');
        title.textContent = 'Classify selected grid node';
        this.closeButton = createElement('button', 'image-modal__close', {
            type: 'button',
            'aria-label': 'Close classification dialog'
        });
        this.closeButton.textContent = '×';

        header.appendChild(title);
        header.appendChild(this.closeButton);

        this.form = createElement('form', 'image-modal__form');
        const promptLabel = createElement('label', 'image-modal__label');
        promptLabel.textContent = 'Describe the classification task';
        this.promptInput = createElement('textarea', 'image-modal__textarea', {
            rows: '5',
            required: 'true'
        });
        this.promptInput.value = this.defaultPrompt;
        promptLabel.appendChild(this.promptInput);

        const imageSection = createElement('div', 'image-modal__images');
        const imageLabel = createElement('label', 'image-modal__label');
        imageLabel.textContent = 'Upload an image to classify';
        this.fileInput = createElement('input', 'image-modal__file-input', {
            type: 'file',
            accept: JPEG_MIME_TYPES.join(',')
        });
        imageLabel.appendChild(this.fileInput);

        this.previewContainer = createElement('div', 'image-modal__preview image-modal__preview--empty');
        this.previewImage = createElement('img', 'image-modal__preview-image', {
            alt: 'Selected image preview'
        });
        this.previewFilename = createElement('span', 'image-modal__preview-filename');
        this.previewImage.style.display = 'none';
        this.previewFilename.style.display = 'none';
        this.placeholderElement = createElement('p', 'image-modal__placeholder');
        this.placeholderElement.textContent = 'No image selected. Choose a file from your device to include it in the request.';

        this.previewContainer.appendChild(this.previewImage);
        this.previewContainer.appendChild(this.previewFilename);
        this.previewContainer.appendChild(this.placeholderElement);

        imageSection.appendChild(imageLabel);
        imageSection.appendChild(this.previewContainer);

        this.statusElement = createElement('p', 'image-modal__status', {
            'aria-live': 'polite'
        });

        const actions = createElement('div', 'image-modal__actions');
        this.cancelButton = createElement('button', 'image-modal__button image-modal__button--ghost', {
            type: 'button'
        });
        this.cancelButton.textContent = 'Cancel';
        this.submitButton = createElement('button', 'image-modal__button image-modal__button--primary', {
            type: 'submit'
        });
        this.submitButton.textContent = 'Send Request';

        actions.appendChild(this.cancelButton);
        actions.appendChild(this.submitButton);

        this.form.appendChild(promptLabel);
        this.form.appendChild(imageSection);
        this.form.appendChild(this.statusElement);
        this.form.appendChild(actions);

        modal.appendChild(header);
        modal.appendChild(this.form);
        this.overlay.appendChild(modal);

        this.overlay.addEventListener('click', this.handleOverlayClick);
        this.fileInput.addEventListener('change', this.handleFileChange);
        this.closeButton.addEventListener('click', this.handleCancel);
        this.cancelButton.addEventListener('click', this.handleCancel);
        this.form.addEventListener('submit', this.handleFormSubmit);
        document.addEventListener('keydown', this.handleKeyDown);

        document.body.appendChild(this.overlay);
    }

    async open({ tileX, tileY } = {}) {
        this.ensureElements();

        if (this.isBusy) {
            return;
        }

        if (this.isVisible) {
            this.focusPrompt();
            return;
        }

        this.tileLocation = {
            x: Number.isFinite(tileX) ? tileX : null,
            y: Number.isFinite(tileY) ? tileY : null
        };

        this.promptInput.value = this.defaultPrompt;
        this.resetSelectedImage();
        this.statusElement.textContent = '';
        this.statusElement.classList.remove('image-modal__status--error', 'image-modal__status--success');
        this.overlay.classList.add('image-modal-overlay--visible');
        this.isVisible = true;
        this.overlay.focus({ preventScroll: true });

        this.focusPrompt();
    }

    focusPrompt() {
        if (!this.promptInput) {
            return;
        }

        this.promptInput.focus({ preventScroll: true });
        this.promptInput.setSelectionRange(this.promptInput.value.length, this.promptInput.value.length);
    }

    togglePlaceholder(shouldShow) {
        if (!this.placeholderElement || !this.previewContainer) {
            return;
        }

        this.placeholderElement.style.display = shouldShow ? 'block' : 'none';
        this.previewContainer.classList.toggle('image-modal__preview--empty', shouldShow);
        if (this.previewFilename) {
            this.previewFilename.style.display = shouldShow ? 'none' : 'block';
        }
    }

    handleOverlayClick(event) {
        if (event.target === this.overlay && !this.isBusy) {
            this.close();
        }
    }

    handleKeyDown(event) {
        if (!this.isVisible) {
            return;
        }

        if (event.key === 'Escape' && !this.isBusy) {
            stopEvent(event);
            this.close();
        }
    }

    handleCancel(event) {
        stopEvent(event);

        if (!this.isBusy) {
            this.close();
        }
    }

    handleFileChange(event) {
        if (this.isBusy) {
            if (this.fileInput) {
                this.fileInput.value = '';
            }
            return;
        }

        const input = event && event.target ? event.target : null;
        const files = input && input.files ? input.files : null;
        const file = files && files.length > 0 ? files[0] : null;

        if (!file) {
            if (this.fileInput) {
                this.fileInput.value = '';
            }
            return;
        }

        if (!isValidJpegFile(file)) {
            this.setStatus('Only JPEG (.jpg) images are supported.', 'error');
            if (this.fileInput) {
                this.fileInput.value = '';
            }
            return;
        }

        this.resetSelectedImage();
        this.selectedFile = file;
        const label = typeof file.name === 'string' && file.name.trim().length > 0
            ? file.name.trim()
            : 'Uploaded image';

        this.selectedImageUrl = URL.createObjectURL(file);

        if (this.previewImage) {
            this.previewImage.src = this.selectedImageUrl;
            this.previewImage.style.display = 'block';
        }

        if (this.previewFilename) {
            this.previewFilename.textContent = label;
            this.previewFilename.style.display = 'block';
        }

        this.togglePlaceholder(false);
        this.setStatus('', 'info');
    }

    resetSelectedImage() {
        this.revokeSelectedImageUrl();
        this.selectedFile = null;

        if (this.fileInput) {
            this.fileInput.value = '';
        }

        if (this.previewImage) {
            this.previewImage.removeAttribute('src');
            this.previewImage.style.display = 'none';
        }

        if (this.previewFilename) {
            this.previewFilename.textContent = '';
            this.previewFilename.style.display = 'none';
        }

        this.togglePlaceholder(true);
    }

    revokeSelectedImageUrl() {
        if (this.selectedImageUrl) {
            URL.revokeObjectURL(this.selectedImageUrl);
            this.selectedImageUrl = null;
        }
    }

    async handleFormSubmit(event) {
        stopEvent(event);

        if (this.isBusy) {
            return;
        }

        if (!this.selectedFile) {
            this.setStatus('Upload an image to continue.', 'error');
            return;
        }

        if (!isValidJpegFile(this.selectedFile)) {
            this.setStatus('Only JPEG (.jpg) images are supported.', 'error');
            return;
        }

        const promptText = this.promptInput.value || '';

        this.setBusy(true);
        this.setStatus('Submitting request…', 'info');

        try {
            const response = await submitImageClassificationRequest({
                file: this.selectedFile,
                prompt: promptText,
                tileX: this.tileLocation.x,
                tileY: this.tileLocation.y,
                imageLabel: this.selectedFile && this.selectedFile.name ? this.selectedFile.name : ''
            });

            const taskId = response && typeof response.task_id === 'string' ? response.task_id : null;
            const successMessage = taskId
                ? `Request submitted! Task ID: ${taskId}`
                : 'Request submitted successfully.';

            this.setStatus(successMessage, 'success');
            setTimeout(() => this.close(), 1200);
        } catch (error) {
            const message = error && typeof error.message === 'string'
                ? error.message
                : 'Failed to submit the image classification request.';
            this.setStatus(message, 'error');
        } finally {
            this.setBusy(false);
        }
    }

    setBusy(isBusy) {
        this.isBusy = Boolean(isBusy);

        if (this.submitButton) {
            this.submitButton.disabled = this.isBusy;
        }

        if (this.cancelButton) {
            this.cancelButton.disabled = this.isBusy;
        }

        if (this.closeButton) {
            this.closeButton.disabled = this.isBusy;
        }

        if (this.promptInput) {
            this.promptInput.disabled = this.isBusy;
        }

        if (this.fileInput) {
            this.fileInput.disabled = this.isBusy;
        }

        if (this.previewContainer) {
            this.previewContainer.classList.toggle('image-modal__preview--disabled', this.isBusy);
        }
    }

    setStatus(message, variant = 'info') {
        if (!this.statusElement) {
            return;
        }

        this.statusElement.textContent = message || '';
        this.statusElement.classList.remove('image-modal__status--error', 'image-modal__status--success');

        if (variant === 'error') {
            this.statusElement.classList.add('image-modal__status--error');
        } else if (variant === 'success') {
            this.statusElement.classList.add('image-modal__status--success');
        }
    }

    isOpen() {
        return Boolean(this.isVisible);
    }

    close() {
        if (!this.overlay || !this.isVisible) {
            return;
        }

        this.overlay.classList.remove('image-modal-overlay--visible');
        this.isVisible = false;
        this.setBusy(false);
        this.resetSelectedImage();
    }

    destroy() {
        if (!this.overlay) {
            return;
        }

        this.overlay.removeEventListener('click', this.handleOverlayClick);

        if (this.fileInput) {
            this.fileInput.removeEventListener('change', this.handleFileChange);
        }

        if (this.closeButton) {
            this.closeButton.removeEventListener('click', this.handleCancel);
        }

        if (this.cancelButton) {
            this.cancelButton.removeEventListener('click', this.handleCancel);
        }

        if (this.form) {
            this.form.removeEventListener('submit', this.handleFormSubmit);
        }

        document.removeEventListener('keydown', this.handleKeyDown);

        if (this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }

        this.revokeSelectedImageUrl();

        this.overlay = null;
        this.form = null;
        this.promptInput = null;
        this.fileInput = null;
        this.previewContainer = null;
        this.previewImage = null;
        this.previewFilename = null;
        this.submitButton = null;
        this.cancelButton = null;
        this.closeButton = null;
        this.statusElement = null;
        this.placeholderElement = null;
        this.selectedFile = null;
        this.isVisible = false;
        this.isBusy = false;
    }
}
