import { submitImageClassificationRequest } from '../api/imageTasks';
import { loadImageOptions } from '../media/imageOptions';

export const DEFAULT_IMAGE_PROMPT = 'This is an image taken from a robots front facing camera, what is the object found in the foreground and classify if this image is dangerous or capable of being moved by a light weight robot. Respond with one of these words only DANGEROUS, MOVABLE, IMMOVABLE, UNKNOWN';

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
        this.gridContainer = null;
        this.submitButton = null;
        this.cancelButton = null;
        this.closeButton = null;
        this.statusElement = null;
        this.placeholderElement = null;
        this.isBusy = false;
        this.isVisible = false;
        this.selectedImage = null;
        this.tileLocation = { x: null, y: null };

        this.handleOverlayClick = this.handleOverlayClick.bind(this);
        this.handleFormSubmit = this.handleFormSubmit.bind(this);
        this.handleCancel = this.handleCancel.bind(this);
        this.handleOptionClick = this.handleOptionClick.bind(this);
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
        const imageLabel = createElement('span', 'image-modal__label');
        imageLabel.textContent = 'Choose a reference image';
        this.gridContainer = createElement('div', 'image-modal__grid', {
            role: 'listbox'
        });
        this.placeholderElement = createElement('p', 'image-modal__placeholder');
        this.placeholderElement.textContent = 'No images available. Add files to src/assets or define assets/manifest.json to populate this list.';
        imageSection.appendChild(imageLabel);
        imageSection.appendChild(this.gridContainer);
        imageSection.appendChild(this.placeholderElement);

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
        this.gridContainer.addEventListener('click', this.handleOptionClick);
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
        this.selectedImage = null;
        this.statusElement.textContent = '';
        this.statusElement.classList.remove('image-modal__status--error', 'image-modal__status--success');
        this.overlay.classList.add('image-modal-overlay--visible');
        this.isVisible = true;
        this.overlay.focus({ preventScroll: true });

        await this.populateImages();
        this.focusPrompt();
    }

    async populateImages() {
        if (!this.gridContainer) {
            return;
        }

        this.gridContainer.innerHTML = '';

        let options = [];

        try {
            options = await loadImageOptions();
        } catch (error) {
            this.setStatus('Unable to load image options. Please try again.', 'error');
            this.togglePlaceholder(true);
            return;
        }

        const limited = Array.isArray(options) ? options.slice(0, 10) : [];

        if (!limited.length) {
            this.togglePlaceholder(true);
            return;
        }

        this.togglePlaceholder(false);

        limited.forEach((option, index) => {
            if (!option || typeof option.src !== 'string') {
                return;
            }

            const button = createElement('button', 'image-modal__option', {
                type: 'button',
                role: 'option',
                'data-src': option.src,
                'data-label': option.label || '',
                'aria-label': option.label || `Image ${index + 1}`
            });
            const image = createElement('img', 'image-modal__thumbnail', {
                src: option.src,
                alt: option.label || `Image ${index + 1}`
            });
            const caption = createElement('span', 'image-modal__option-label');
            caption.textContent = option.label || `Image ${index + 1}`;

            button.appendChild(image);
            button.appendChild(caption);
            this.gridContainer.appendChild(button);
        });
    }

    focusPrompt() {
        if (!this.promptInput) {
            return;
        }

        this.promptInput.focus({ preventScroll: true });
        this.promptInput.setSelectionRange(this.promptInput.value.length, this.promptInput.value.length);
    }

    togglePlaceholder(shouldShow) {
        if (!this.placeholderElement) {
            return;
        }

        this.placeholderElement.style.display = shouldShow ? 'block' : 'none';
        this.gridContainer.style.display = shouldShow ? 'none' : 'grid';
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

    handleOptionClick(event) {
        const button = event.target.closest('.image-modal__option');

        if (!button || this.isBusy) {
            return;
        }

        const previouslySelected = this.gridContainer.querySelector('.image-modal__option--selected');

        if (previouslySelected) {
            previouslySelected.classList.remove('image-modal__option--selected');
        }

        button.classList.add('image-modal__option--selected');
        this.selectedImage = {
            src: button.getAttribute('data-src'),
            label: button.getAttribute('data-label')
        };
    }

    async handleFormSubmit(event) {
        stopEvent(event);

        if (this.isBusy) {
            return;
        }

        if (!this.selectedImage || !this.selectedImage.src) {
            this.setStatus('Select an image to continue.', 'error');
            return;
        }

        const promptText = this.promptInput.value || '';

        this.setBusy(true);
        this.setStatus('Submitting request…', 'info');

        try {
            const response = await submitImageClassificationRequest({
                imagePath: this.selectedImage.src,
                prompt: promptText,
                tileX: this.tileLocation.x,
                tileY: this.tileLocation.y,
                imageLabel: this.selectedImage.label
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

        if (this.gridContainer) {
            this.gridContainer.classList.toggle('image-modal__grid--disabled', this.isBusy);
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
    }

    destroy() {
        if (!this.overlay) {
            return;
        }

        this.overlay.removeEventListener('click', this.handleOverlayClick);

        if (this.gridContainer) {
            this.gridContainer.removeEventListener('click', this.handleOptionClick);
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

        this.overlay = null;
        this.form = null;
        this.promptInput = null;
        this.gridContainer = null;
        this.submitButton = null;
        this.cancelButton = null;
        this.closeButton = null;
        this.statusElement = null;
        this.placeholderElement = null;
        this.selectedImage = null;
        this.isVisible = false;
        this.isBusy = false;
    }
}
