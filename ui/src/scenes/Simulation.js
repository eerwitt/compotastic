import Phaser, { Scene } from 'phaser';
import { SimulationStatusPanel } from './SimulationStatusPanel';
import { ImageClassificationModal, DEFAULT_IMAGE_PROMPT } from '../modals/ImageClassificationModal';

const DEFAULT_CAT_COUNT = 10;
const DEFAULT_DOG_COUNT = 1;

const DOG_FONT_STYLE = { fontFamily: 'Courier', fontSize: 30, color: '#f5deb3ff', align: 'center', fontStyle: 'bold' };
const DOG_ALERT_POINTER_STYLE = { fontFamily: 'Courier', fontSize: 24, color: '#00ff00', fontStyle: 'bold' };

const CAT_FACE = '^.^';
const CAT_ALERT_SYMBOL = '/!\\';
const CAT_JOB_FACE = '^O^';
const CAT_FONT_STYLE = { fontFamily: 'Courier', fontSize: 32, color: '#e27272ff', fontStyle: 'bold' };
const CAT_JOB_COLOR = '#32cd32ff';
const CAT_MODAL_FONT_STYLE = { fontFamily: 'Courier', fontSize: 20, color: '#f4e1c1ff', align: 'left' };
const DOG_MODAL_FONT_STYLE = { fontFamily: 'Courier', fontSize: 20, color: '#f7f7dcff', align: 'left' };

const CAT_TILE_PADDING_RATIO = 0.2;
const DOG_TILE_PADDING_RATIO = 0.15;
const CAT_SPEED_RANGE = { min: 40, max: 140 };
const DOG_SPEED_RANGE = { min: 25, max: 60 };
const LOOK_INTERVAL_RANGE = { min: 800, max: 2200 };
const GRID_TILE_COUNT = { width: 25, height: 25 };
const GRID_LINE_COLOR = 0x615a3b;
const GRID_LINE_ALPHA = 0.2;
const DOG_TILE_WIDTH = 2;
const DOG_TILE_HEIGHT = 2;
const DOG_MOVE_INTERVAL_RANGE = { min: 2500, max: 6000 };
const DOG_MOVE_PROBABILITY = 0.35;
const MAX_RANDOM_PLACEMENT_ATTEMPTS = 40;

const REWARD_FONT_STYLE = {
    fontFamily: 'Courier',
    fontSize: 24,
    color: '#dcd4a0ff',
    fontStyle: 'bold',
    align: 'center'
};
const REWARD_MODAL_FONT_STYLE = {
    fontFamily: 'Courier',
    fontSize: 20,
    color: '#f8f1b4ff',
    align: 'left'
};
const REWARD_TILE_PADDING_RATIO = 0.45;
const DEMO_POSITIVE_REWARD_COUNT = 4;
const DEMO_NEGATIVE_REWARD_COUNT = 3;
const DEMO_POSITIVE_REWARD_VALUE = 5;
const DEMO_NEGATIVE_REWARD_VALUE = -5;

const CLASSIFICATION_REWARD_VALUES = {
    MOVABLE: 15,
    DANGEROUS: -20,
    IMMOVABLE: -3
};

const CAT_BLINK_INTERVAL_RANGE = { min: 2800, max: 5200 };
const CAT_BLINK_DURATION = 250;
const CAT_MOUTH_INTERVAL_RANGE = { min: 3400, max: 6800 };
const CAT_MOUTH_OPEN_DURATION = 820;
const CAT_ALERT_FLASH_INTERVAL_RANGE = { min: 300, max: 520 };

const DOG_BLINK_INTERVAL_RANGE = { min: 3200, max: 6100 };
const DOG_BLINK_DURATION = 270;
const DOG_TONGUE_INTERVAL_RANGE = { min: 2600, max: 4800 };
const DOG_TONGUE_OUT_DURATION = 2600;
const DOG_EYES_OPEN = 'o.o';
const DOG_EYES_BLINK = '-.-';
const DOG_MOUTH_IDLE = '^';
const DOG_MOUTH_TONGUE = 'U';
const DOG_ASSIST_ASCII = '  +  \n +++ \n+++++\n +++ \n  +  ';
const CAT_BLINK_FACE = '-.-';
const CAT_MOUTH_FACE = '^o^';

function getRandomEventDelay(range, includePhaseOffset = false) {
    const baseInterval = Phaser.Math.Between(range.min, range.max);
    const jitterUpperBound = Math.max(0, Math.floor((range.max - range.min) * 0.5));
    const jitter = jitterUpperBound > 0 ? Phaser.Math.Between(0, jitterUpperBound) : 0;
    const fractionalJitter = Phaser.Math.FloatBetween(0, 1);
    const phaseOffset = includePhaseOffset && range.max > range.min
        ? Phaser.Math.Between(0, range.max - range.min)
        : 0;

    return baseInterval + jitter + fractionalJitter + phaseOffset;
}

function buildDogAscii(eyes, mouth) {
    return `/\\_/\\\n( ${eyes})\n(  ${mouth} )\n----`;
}

const CAT_ATTRIBUTE_PRESETS = [
    { cpu: '68000 8MHz', ram: '512KB' },
    { cpu: 'Z80 4MHz', ram: '128KB' },
    { cpu: 'Pentium 100MHz', ram: '16MB' },
    { cpu: 'PowerPC 233MHz', ram: '64MB' },
    { cpu: 'Athlon XP 1.5GHz', ram: '256MB' },
    { cpu: 'Core 2 Duo 2.0GHz', ram: '2GB' },
    { cpu: 'Xeon 2.4GHz', ram: '8GB' },
    { cpu: 'ARM Cortex-A9 1GHz', ram: '1GB' },
    { cpu: 'MIPS R4000 100MHz', ram: '32MB' },
    { cpu: 'SPARCstation 40MHz', ram: '64MB' }
];

const DIRECTIONS = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 }
];

class Grid {
    constructor(scene, tileCountWidth, tileCountHeight) {
        this.scene = scene;
        this.tileCountWidth = tileCountWidth;
        this.tileCountHeight = tileCountHeight;
        this.tileSize = 1;
        this.pixelWidth = tileCountWidth;
        this.pixelHeight = tileCountHeight;
        this.graphics = scene.add.graphics();
        this.graphics.setDepth(-1);
        this.cells = [];
    }

    updateLayout(viewWidth, viewHeight) {
        const tileSize = Math.max(1, Math.floor(Math.min(
            viewWidth / this.tileCountWidth,
            viewHeight / this.tileCountHeight
        )));

        this.tileSize = tileSize;
        this.pixelWidth = this.tileCountWidth * tileSize;
        this.pixelHeight = this.tileCountHeight * tileSize;

        this.generateCells();
        this.draw();
    }

    generateCells() {
        const cells = [];

        for (let y = 0; y < this.tileCountHeight; y++) {
            const row = [];

            for (let x = 0; x < this.tileCountWidth; x++) {
                const left = x * this.tileSize;
                const top = y * this.tileSize;

                row.push({
                    left,
                    top,
                    right: left + this.tileSize,
                    bottom: top + this.tileSize
                });
            }

            cells.push(row);
        }

        this.cells = cells;
    }

    draw() {
        this.graphics.clear();
        this.graphics.lineStyle(1, GRID_LINE_COLOR, GRID_LINE_ALPHA);

        if (this.cells.length === 0) {
            return;
        }

        for (let y = 0; y < this.cells.length; y++) {
            const row = this.cells[y];

            for (let x = 0; x < row.length; x++) {
                const cell = row[x];

                this.graphics.strokeRect(cell.left, cell.top, this.tileSize, this.tileSize);
            }
        }
    }

    tileToWorld(tileX, tileY) {
        return {
            x: tileX * this.tileSize + this.tileSize / 2,
            y: tileY * this.tileSize + this.tileSize / 2
        };
    }

    containsTile(tileX, tileY) {
        return (
            tileX >= 0 &&
            tileY >= 0 &&
            tileX < this.tileCountWidth &&
            tileY < this.tileCountHeight
        );
    }

    canFitArea(tileX, tileY, width, height) {
        if (width <= 0 || height <= 0) {
            return false;
        }

        const maxTileX = tileX + width - 1;
        const maxTileY = tileY + height - 1;

        return this.containsTile(tileX, tileY) && this.containsTile(maxTileX, maxTileY);
    }

    destroy() {
        this.graphics.destroy();
    }
}

function createAsciiBox(lines) {
    if (!lines || lines.length === 0) {
        return '';
    }

    const innerWidth = lines.reduce((max, line) => Math.max(max, line.length), 0);
    const horizontalBorder = `+${'-'.repeat(innerWidth + 2)}+`;
    const paddedLines = lines.map((line) => `| ${line.padEnd(innerWidth)} |`);

    return [horizontalBorder, ...paddedLines, horizontalBorder].join('\n');
}

function extractCatAlertDetails(attributes) {
    const sanitizedAttributes = (attributes && typeof attributes === 'object')
        ? { ...attributes }
        : {};

    const alertKeys = ['alert', 'alertType', 'alertStatus'];
    let alertMessage = null;

    for (const key of alertKeys) {
        const value = sanitizedAttributes[key];

        if (typeof value === 'string' && value.trim().length > 0) {
            alertMessage = value.trim();
            delete sanitizedAttributes[key];
            break;
        }
    }

    const needsKeys = ['needs', 'need', 'requirement', 'requires'];
    let needsText = null;

    for (const key of needsKeys) {
        const value = sanitizedAttributes[key];

        if (Array.isArray(value)) {
            const joined = value
                .map((item) => (typeof item === 'string' ? item.trim() : String(item)))
                .filter((item) => item.length > 0)
                .join(', ');

            if (joined.length > 0) {
                needsText = joined;
                delete sanitizedAttributes[key];
                break;
            }
        } else if (typeof value === 'string' && value.trim().length > 0) {
            needsText = value.trim();
            delete sanitizedAttributes[key];
            break;
        }
    }

    if (!alertMessage && !needsText) {
        return { sanitizedAttributes, alertDetails: null };
    }

    const summaryParts = [];

    if (alertMessage) {
        summaryParts.push(alertMessage);
    }

    if (needsText) {
        summaryParts.push(`Needs: ${needsText}`);
    }

    return {
        sanitizedAttributes,
        alertDetails: {
            message: alertMessage,
            needsText,
            summary: summaryParts.join(' — ')
        }
    };
}

class Cat {
    constructor(scene, grid, tileX, tileY, attributes, identifier = null) {
        this.scene = scene;
        this.grid = grid;
        this.speed = Phaser.Math.Between(CAT_SPEED_RANGE.min, CAT_SPEED_RANGE.max);
        this.currentFace = CAT_FACE;
        this.text = scene.add.text(0, 0, this.currentFace, CAT_FONT_STYLE);
        this.text.setOrigin(0.5, 0.5);
        this.text.setDepth(5);
        this.text.setInteractive({ useHandCursor: true });
        this.defaultColor = CAT_FONT_STYLE.color;
        this.text.setColor(this.defaultColor);

        const { sanitizedAttributes, alertDetails } = extractCatAlertDetails(attributes);

        this.attributes = sanitizedAttributes;
        this.alertDetails = alertDetails;
        this.alertFlashInterval = Phaser.Math.Between(
            CAT_ALERT_FLASH_INTERVAL_RANGE.min,
            CAT_ALERT_FLASH_INTERVAL_RANGE.max
        );
        this.alertResponder = null;
        this.alertHoldLogged = false;

        if (this.alertDetails) {
            this.isAlertSymbolVisible = true;
            this.currentFace = CAT_ALERT_SYMBOL;
            this.text.setText(this.currentFace);
            this.nextAlertToggleTime = (scene.time.now || 0) + this.alertFlashInterval;
        } else {
            this.isAlertSymbolVisible = false;
            this.nextAlertToggleTime = Number.POSITIVE_INFINITY;
        }

        this.nodeIdentifier = (typeof identifier === 'string' && identifier.trim().length > 0)
            ? identifier.trim()
            : null;
        this.modal = scene.add.text(0, 0, '', CAT_MODAL_FONT_STYLE);
        this.modal.setOrigin(0.5, 1);
        this.modal.setDepth(20);
        this.modal.setVisible(false);

        this.tileX = tileX;
        this.tileY = tileY;

        this.nextLookTime = scene.time.now || 0;
        if (this.hasAlert()) {
            this.nextLookTime = Number.POSITIVE_INFINITY;
        }
        this.isMoving = false;
        this.moveStartTime = 0;
        this.moveDuration = 0;
        this.startPixelX = 0;
        this.startPixelY = 0;
        this.targetTileX = tileX;
        this.targetTileY = tileY;
        this.targetPixelX = 0;
        this.targetPixelY = 0;

        this.isBlinking = false;
        this.blinkEndTime = 0;
        this.nextBlinkTime = scene.time.now || 0;
        this.isMouthOpen = false;
        this.mouthEndTime = 0;
        this.nextMouthOpenTime = scene.time.now || 0;
        this.isPerformingJob = false;

        this.text.on('pointerover', this.showAttributesModal, this);
        this.text.on('pointerout', this.hideAttributesModal, this);

        this.onGridLayoutChanged();
        const initialTime = scene.time.now || 0;
        this.scheduleNextBlink(initialTime, { usePhaseOffset: true });
        this.scheduleNextMouthOpen(initialTime, { usePhaseOffset: true });
        this.movementLog = [];
        this.maxMovementLogEntries = 40;
        this.recordMovementLog(`Initialized at (${this.tileX}, ${this.tileY})`, initialTime);
    }

    setPosition(tileX, tileY) {
        const position = this.grid.tileToWorld(tileX, tileY);

        this.tileX = tileX;
        this.tileY = tileY;

        this.text.setPosition(position.x, position.y);
        this.targetPixelX = position.x;
        this.targetPixelY = position.y;
    }

    scaleToTile() {
        const tileSize = this.grid.tileSize;
        const horizontalPadding = tileSize * CAT_TILE_PADDING_RATIO;
        const verticalPadding = tileSize * CAT_TILE_PADDING_RATIO;
        const maxWidth = tileSize - horizontalPadding;
        const maxHeight = tileSize - verticalPadding;
        const textWidth = this.text.width;
        const textHeight = this.text.height;

        if (textWidth === 0 || textHeight === 0) {
            this.text.setScale(1);
            return;
        }

        const scale = Math.min(maxWidth / textWidth, maxHeight / textHeight);

        this.text.setScale(scale);
    }

    buildModalContent() {
        const lines = [];

        if (this.nodeIdentifier) {
            lines.push(`Node: ${this.nodeIdentifier}`);
        }

        if (this.hasAlert()) {
            lines.push(...this.getAlertModalLines());
        }

        if (this.isPerformingJob) {
            lines.push('Status: Performing job');
        }

        const cpuLabel = typeof this.attributes.cpu === 'string' && this.attributes.cpu.trim().length > 0
            ? this.attributes.cpu
            : 'Unknown';
        const ramLabel = typeof this.attributes.ram === 'string' && this.attributes.ram.trim().length > 0
            ? this.attributes.ram
            : 'Unknown';

        lines.push(`CPU: ${cpuLabel}`);
        lines.push(`RAM: ${ramLabel}`);
        lines.push(`LOC: (${this.tileX}, ${this.tileY})`);

        return createAsciiBox(lines);
    }

    hasAlert() {
        return Boolean(this.alertDetails);
    }

    getAlertStatusText() {
        if (!this.alertDetails) {
            return null;
        }

        if (typeof this.alertDetails.summary === 'string' && this.alertDetails.summary.trim().length > 0) {
            return `ALERT — ${this.alertDetails.summary.trim()}`;
        }

        if (typeof this.alertDetails.message === 'string' && this.alertDetails.message.trim().length > 0) {
            return `ALERT — ${this.alertDetails.message.trim()}`;
        }

        return 'ALERT — Condition detected';
    }

    getAlertModalLines() {
        if (!this.alertDetails) {
            return [];
        }

        const lines = ['STATE: ALERT'];

        if (typeof this.alertDetails.message === 'string' && this.alertDetails.message.trim().length > 0) {
            lines.push(`ALERT: ${this.alertDetails.message}`);
        }

        if (typeof this.alertDetails.needsText === 'string' && this.alertDetails.needsText.trim().length > 0) {
            lines.push(`NEEDS: ${this.alertDetails.needsText}`);
        }

        return lines;
    }

    updateModalPosition() {
        const offset = (this.text.displayHeight / 2) + (this.grid.tileSize * 0.4);
        this.modal.setPosition(this.text.x, this.text.y - offset);
    }

    showAttributesModal() {
        this.modal.setText(this.buildModalContent());
        this.updateModalPosition();
        this.modal.setVisible(true);
    }

    hideAttributesModal() {
        this.modal.setVisible(false);
    }

    scheduleNextBlink(time, options = {}) {
        if (this.isPerformingJob) {
            this.nextBlinkTime = Number.POSITIVE_INFINITY;
            return;
        }

        const { usePhaseOffset = false } = options;
        this.nextBlinkTime = time + getRandomEventDelay(CAT_BLINK_INTERVAL_RANGE, usePhaseOffset);
    }

    scheduleNextMouthOpen(time, options = {}) {
        if (this.isPerformingJob) {
            this.nextMouthOpenTime = Number.POSITIVE_INFINITY;
            return;
        }

        const { usePhaseOffset = false } = options;
        this.nextMouthOpenTime = time + getRandomEventDelay(CAT_MOUTH_INTERVAL_RANGE, usePhaseOffset);
    }

    beginBlink(time) {
        this.isBlinking = true;
        this.blinkEndTime = time + CAT_BLINK_DURATION;
    }

    beginMouthOpen(time) {
        if (this.isPerformingJob) {
            this.isMouthOpen = true;
            this.mouthEndTime = Number.POSITIVE_INFINITY;
            return;
        }

        this.isMouthOpen = true;
        this.mouthEndTime = time + CAT_MOUTH_OPEN_DURATION;
    }

    applyCurrentFace() {
        let targetFace = CAT_FACE;

        if (this.isPerformingJob) {
            targetFace = CAT_JOB_FACE;
        } else if (this.hasAlert()) {
            targetFace = this.isAlertSymbolVisible ? CAT_ALERT_SYMBOL : CAT_FACE;
        } else if (this.isBlinking) {
            targetFace = CAT_BLINK_FACE;
        } else if (this.isMouthOpen) {
            targetFace = CAT_MOUTH_FACE;
        }

        if (this.isPerformingJob) {
            this.text.setColor(CAT_JOB_COLOR);
        } else {
            this.text.setColor(this.defaultColor);
        }

        if (targetFace !== this.currentFace) {
            this.currentFace = targetFace;
            this.text.setText(this.currentFace);
            this.scaleToTile();
        }
    }

    updateFacialAnimations(time) {
        const currentTime = typeof time === 'number' ? time : 0;

        if (this.isPerformingJob) {
            this.isBlinking = false;
            this.isMouthOpen = true;
            this.isAlertSymbolVisible = false;
            this.applyCurrentFace();
            return;
        }

        if (this.isBlinking && currentTime >= this.blinkEndTime) {
            this.isBlinking = false;
            this.scheduleNextBlink(currentTime);
        } else if (!this.isBlinking && currentTime >= this.nextBlinkTime) {
            this.beginBlink(currentTime);
        }

        if (this.isMouthOpen && currentTime >= this.mouthEndTime) {
            this.isMouthOpen = false;
            this.scheduleNextMouthOpen(currentTime);
        } else if (!this.isMouthOpen && currentTime >= this.nextMouthOpenTime) {
            this.beginMouthOpen(currentTime);
        }

        this.updateAlertFlashing(currentTime);
        this.applyCurrentFace();
    }

    updateAlertFlashing(time) {
        if (!this.hasAlert()) {
            this.isAlertSymbolVisible = false;
            return;
        }

        if (time >= this.nextAlertToggleTime) {
            this.isAlertSymbolVisible = !this.isAlertSymbolVisible;
            this.alertFlashInterval = Phaser.Math.Between(
                CAT_ALERT_FLASH_INTERVAL_RANGE.min,
                CAT_ALERT_FLASH_INTERVAL_RANGE.max
            );
            this.nextAlertToggleTime = time + this.alertFlashInterval;
        }
    }

    lookAround(time) {
        if (this.isMoving || this.isPerformingJob) {
            return;
        }

        if (this.hasAlert()) {
            if (!this.alertHoldLogged) {
                this.recordMovementLog('Holding position due to active alert', time);
                this.alertHoldLogged = true;
            }
            this.nextLookTime = Number.POSITIVE_INFINITY;
            return;
        }

        this.recordMovementLog('Scanning for available paths', time);
        const availableDirections = DIRECTIONS.filter((direction) => {
            const nextTileX = this.tileX + direction.x;
            const nextTileY = this.tileY + direction.y;

            if (!this.grid.containsTile(nextTileX, nextTileY)) {
                return false;
            }

            return !this.scene.isTileBlockedForCat(nextTileX, nextTileY, this);
        });

        if (availableDirections.length === 0) {
            this.recordMovementLog(`No movement options from (${this.tileX}, ${this.tileY})`, time);
            this.scheduleNextLook(time);
            return;
        }

        const selectedDirection = Phaser.Utils.Array.GetRandom(availableDirections);

        this.targetTileX = this.tileX + selectedDirection.x;
        this.targetTileY = this.tileY + selectedDirection.y;
        this.recordMovementLog(
            `Planning move toward (${this.targetTileX}, ${this.targetTileY})`,
            time
        );

        const targetPosition = this.grid.tileToWorld(this.targetTileX, this.targetTileY);

        this.startPixelX = this.text.x;
        this.startPixelY = this.text.y;
        this.targetPixelX = targetPosition.x;
        this.targetPixelY = targetPosition.y;

        const distance = Phaser.Math.Distance.Between(
            this.startPixelX,
            this.startPixelY,
            this.targetPixelX,
            this.targetPixelY
        );

        this.moveDuration = distance > 0 ? (distance / this.speed) * 1000 : 0;
        this.moveStartTime = time;
        this.isMoving = true;
        this.nextLookTime = Number.POSITIVE_INFINITY;
        this.recordMovementLog(
            `Started moving toward (${this.targetTileX}, ${this.targetTileY})`,
            time
        );
    }

    update(time) {
        this.updateFacialAnimations(time);

        if (this.isPerformingJob) {
            if (this.modal.visible) {
                this.modal.setText(this.buildModalContent());
                this.updateModalPosition();
            }

            return;
        }

        if (this.isMoving) {
            const elapsed = time - this.moveStartTime;
            const progress = this.moveDuration > 0 ? Phaser.Math.Clamp(elapsed / this.moveDuration, 0, 1) : 1;

            const currentX = Phaser.Math.Linear(this.startPixelX, this.targetPixelX, progress);
            const currentY = Phaser.Math.Linear(this.startPixelY, this.targetPixelY, progress);

            this.text.setPosition(currentX, currentY);

            if (progress >= 1) {
                this.isMoving = false;
                this.setPosition(this.targetTileX, this.targetTileY);
                this.scheduleNextLook(time);
                this.recordMovementLog(
                    `Arrived at (${this.tileX}, ${this.tileY})`,
                    time
                );
            }

            if (this.modal.visible) {
                this.modal.setText(this.buildModalContent());
                this.updateModalPosition();
            }

            return;
        }

        if (time >= this.nextLookTime) {
            this.lookAround(time);
        }

        if (this.modal.visible) {
            this.modal.setText(this.buildModalContent());
            this.updateModalPosition();
        }
    }

    scheduleNextLook(time) {
        if (this.isPerformingJob) {
            this.nextLookTime = Number.POSITIVE_INFINITY;
            return;
        }

        if (this.hasAlert()) {
            this.nextLookTime = Number.POSITIVE_INFINITY;
            return;
        }

        this.nextLookTime = time + Phaser.Math.Between(LOOK_INTERVAL_RANGE.min, LOOK_INTERVAL_RANGE.max);
    }

    assignAlertResponder(dog) {
        this.alertResponder = dog;
    }

    clearAlertResponder(dog = null) {
        if (!dog || this.alertResponder === dog) {
            this.alertResponder = null;
        }
    }

    getAlertResponder() {
        return this.alertResponder;
    }

    clearAlert(time) {
        if (!this.hasAlert()) {
            return;
        }

        this.alertDetails = null;
        this.isAlertSymbolVisible = false;
        this.nextAlertToggleTime = Number.POSITIVE_INFINITY;
        this.currentFace = CAT_FACE;
        this.text.setText(this.currentFace);
        this.scaleToTile();
        this.applyCurrentFace();
        this.alertHoldLogged = false;
        this.clearAlertResponder();

        const timestamp = Number.isFinite(time) ? time : (this.scene?.time?.now || 0);
        this.recordMovementLog('Alert cleared — resuming patrol', timestamp);
        this.scheduleNextLook(timestamp);

        if (this.modal.visible) {
            this.modal.setText(this.buildModalContent());
            this.updateModalPosition();
        }
    }

    onGridLayoutChanged() {
        this.scaleToTile();
        this.setPosition(this.tileX, this.tileY);
        this.isMoving = false;
        if (this.isPerformingJob) {
            this.nextLookTime = Number.POSITIVE_INFINITY;
        } else {
            this.scheduleNextLook(this.scene.time.now || 0);
        }
        if (this.modal.visible) {
            this.modal.setText(this.buildModalContent());
            this.updateModalPosition();
        }
    }

    beginRewardJob(time, rewardMarker = null) {
        if (this.isPerformingJob) {
            return;
        }

        const timestamp = Number.isFinite(time) ? time : (this.scene?.time?.now || 0);
        const valueLabel = rewardMarker && Number.isFinite(rewardMarker.value)
            ? `${rewardMarker.value >= 0 ? '+' : ''}${rewardMarker.value}`
            : 'unknown';

        this.isPerformingJob = true;
        this.isMoving = false;
        this.targetTileX = this.tileX;
        this.targetTileY = this.tileY;
        this.startPixelX = this.text.x;
        this.startPixelY = this.text.y;
        this.targetPixelX = this.text.x;
        this.targetPixelY = this.text.y;
        this.moveDuration = 0;
        this.moveStartTime = timestamp;
        this.nextLookTime = Number.POSITIVE_INFINITY;
        this.isBlinking = false;
        this.blinkEndTime = Number.POSITIVE_INFINITY;
        this.nextBlinkTime = Number.POSITIVE_INFINITY;
        this.isMouthOpen = true;
        this.mouthEndTime = Number.POSITIVE_INFINITY;
        this.nextMouthOpenTime = Number.POSITIVE_INFINITY;
        this.applyCurrentFace();
        this.recordMovementLog(
            `Consuming reward (${valueLabel}) at (${this.tileX}, ${this.tileY})`,
            timestamp
        );

        if (this.modal.visible) {
            this.modal.setText(this.buildModalContent());
            this.updateModalPosition();
        }
    }

    destroy() {
        this.text.destroy();
        this.modal.destroy();
    }

    recordMovementLog(message, time) {
        if (typeof message !== 'string' || message.trim().length === 0) {
            return;
        }

        const now = Number.isFinite(time) ? time : (this.scene?.time?.now || 0);
        const entry = {
            timestamp: now,
            timeLabel: this.formatMovementLogTime(now),
            message: message.trim()
        };

        this.movementLog.push(entry);

        if (this.movementLog.length > this.maxMovementLogEntries) {
            this.movementLog.splice(0, this.movementLog.length - this.maxMovementLogEntries);
        }
    }

    formatMovementLogTime(time) {
        if (!Number.isFinite(time) || time < 0) {
            return '0.0s';
        }

        return `${(time / 1000).toFixed(1)}s`;
    }

    getMovementLog() {
        return this.movementLog.map((entry) => ({ ...entry }));
    }
}

class Dog {
    constructor(scene, grid, tileX, tileY, identifier = null) {
        this.scene = scene;
        this.grid = grid;
        this.tileWidth = DOG_TILE_WIDTH;
        this.tileHeight = DOG_TILE_HEIGHT;
        this.speed = Phaser.Math.Between(DOG_SPEED_RANGE.min, DOG_SPEED_RANGE.max);
        const initialAscii = buildDogAscii(DOG_EYES_OPEN, DOG_MOUTH_IDLE);
        this.text = scene.add.text(0, 0, initialAscii, DOG_FONT_STYLE);
        this.text.setOrigin(0.5, 0.5);
        this.text.setDepth(5);
        this.text.setInteractive({ useHandCursor: true });

        this.modal = scene.add.text(0, 0, '', DOG_MODAL_FONT_STYLE);
        this.modal.setOrigin(0.5, 1);
        this.modal.setDepth(20);
        this.modal.setVisible(false);

        this.tileX = tileX;
        this.tileY = tileY;

        this.isMoving = false;
        this.moveStartTime = 0;
        this.moveDuration = 0;
        this.startPixelX = 0;
        this.startPixelY = 0;
        this.targetTileX = tileX;
        this.targetTileY = tileY;
        this.targetPixelX = 0;
        this.targetPixelY = 0;
        this.nextMoveCheckTime = scene.time.now || 0;

        this.isBlinking = false;
        this.blinkEndTime = 0;
        this.nextBlinkTime = scene.time.now || 0;
        this.isTongueOut = false;
        this.tongueEndTime = 0;
        this.nextTongueTime = scene.time.now || 0;
        this.currentAscii = initialAscii;
        this.alertTarget = null;
        this.alertPointer = scene.add.text(0, 0, '', DOG_ALERT_POINTER_STYLE);
        this.alertPointer.setOrigin(0.5, 0.5);
        this.alertPointer.setDepth(6);
        this.alertPointer.setVisible(false);
        this.alertPathBlocked = false;
        this.nodeIdentifier = (typeof identifier === 'string' && identifier.trim().length > 0)
            ? identifier.trim()
            : null;
        this.currentMoveReason = null;
        this.currentTargetCat = null;
        this.isAssisting = false;
        this.assistTarget = null;
        this.assistEndTime = 0;

        this.text.on('pointerover', this.showAttributesModal, this);
        this.text.on('pointerout', this.hideAttributesModal, this);

        this.onGridLayoutChanged();
        const initialTime = scene.time.now || 0;
        this.scheduleNextBlink(initialTime, { usePhaseOffset: true });
        this.scheduleNextTongue(initialTime, { usePhaseOffset: true });
        this.movementLog = [];
        this.maxMovementLogEntries = 40;
        this.recordMovementLog(
            `Initialized at (${this.tileX}, ${this.tileY}) area ${this.tileWidth}x${this.tileHeight}`,
            initialTime
        );
    }

    computeAreaCenter(tileX, tileY) {
        const topLeft = this.grid.tileToWorld(tileX, tileY);
        const bottomRight = this.grid.tileToWorld(tileX + this.tileWidth - 1, tileY + this.tileHeight - 1);

        return {
            x: (topLeft.x + bottomRight.x) / 2,
            y: (topLeft.y + bottomRight.y) / 2
        };
    }

    setPosition(tileX, tileY) {
        const position = this.computeAreaCenter(tileX, tileY);

        this.tileX = tileX;
        this.tileY = tileY;
        this.targetTileX = tileX;
        this.targetTileY = tileY;

        this.text.setPosition(position.x, position.y);
        this.targetPixelX = position.x;
        this.targetPixelY = position.y;

        this.updateDirectionPointerPosition(position.x, position.y);

        if (this.modal.visible) {
            this.updateModalPosition();
        }
    }

    scaleToTiles() {
        const tileSize = this.grid.tileSize;
        const areaWidth = tileSize * this.tileWidth;
        const areaHeight = tileSize * this.tileHeight;
        const horizontalPadding = areaWidth * DOG_TILE_PADDING_RATIO;
        const verticalPadding = areaHeight * DOG_TILE_PADDING_RATIO;
        const maxWidth = areaWidth - horizontalPadding;
        const maxHeight = areaHeight - verticalPadding;
        const textWidth = this.text.width;
        const textHeight = this.text.height;

        if (textWidth === 0 || textHeight === 0) {
            this.text.setScale(1);
            return;
        }

        const scale = Math.min(maxWidth / textWidth, maxHeight / textHeight);

        this.text.setScale(scale);
    }

    scheduleNextMoveCheck(time) {
        this.nextMoveCheckTime = time + Phaser.Math.Between(DOG_MOVE_INTERVAL_RANGE.min, DOG_MOVE_INTERVAL_RANGE.max);
    }

    beginMovement(tileX, tileY, time, options = {}) {
        const { reason = 'patrol', pointerDirection = null, targetCat = null } = options;
        const targetPosition = this.computeAreaCenter(tileX, tileY);

        this.startPixelX = this.text.x;
        this.startPixelY = this.text.y;
        this.targetTileX = tileX;
        this.targetTileY = tileY;
        this.targetPixelX = targetPosition.x;
        this.targetPixelY = targetPosition.y;
        this.currentMoveReason = reason;
        this.currentTargetCat = targetCat || null;

        const distance = Phaser.Math.Distance.Between(
            this.startPixelX,
            this.startPixelY,
            this.targetPixelX,
            this.targetPixelY
        );

        this.moveDuration = distance > 0 ? (distance / this.speed) * 1000 : 0;
        this.moveStartTime = time;
        this.isMoving = true;
        const logMessage = reason === 'alert'
            ? `Moving to assist alert at (${this.targetTileX}, ${this.targetTileY})`
            : `Started patrol toward (${this.targetTileX}, ${this.targetTileY})`;
        this.recordMovementLog(logMessage, time);

        if (pointerDirection) {
            this.showDirectionPointer(pointerDirection);
        } else {
            this.hideDirectionPointer();
        }
    }

    resolvePointerSymbol(direction) {
        if (!direction || typeof direction !== 'object') {
            return '→';
        }

        const { x = 0, y = 0 } = direction;

        if (Math.abs(x) >= Math.abs(y)) {
            if (x > 0) {
                return '→';
            }

            if (x < 0) {
                return '←';
            }
        }

        if (y < 0) {
            return '↑';
        }

        if (y > 0) {
            return '↓';
        }

        return '→';
    }

    showDirectionPointer(direction) {
        const symbol = this.resolvePointerSymbol(direction);
        this.alertPointer.setText(symbol);
        this.alertPointer.setVisible(true);
        this.updateDirectionPointerPosition(this.text.x, this.text.y);
    }

    hideDirectionPointer() {
        this.alertPointer.setVisible(false);
    }

    setAlertTarget(cat, time) {
        if (this.alertTarget === cat) {
            return;
        }

        const timestamp = Number.isFinite(time) ? time : (this.scene?.time?.now || 0);

        if (this.alertTarget && typeof this.alertTarget.clearAlertResponder === 'function') {
            this.alertTarget.clearAlertResponder(this);
        }

        this.alertTarget = cat || null;
        this.alertPathBlocked = false;

        if (this.alertTarget) {
            this.recordMovementLog(
                `Dispatched to alert at (${this.alertTarget.tileX}, ${this.alertTarget.tileY})`,
                timestamp
            );
            this.nextMoveCheckTime = timestamp;
        } else {
            this.hideDirectionPointer();
        }
    }

    clearAlertTarget(options = {}) {
        const { silent = false, time = null } = options;

        if (!this.alertTarget) {
            return false;
        }

        const timestamp = Number.isFinite(time) ? time : (this.scene?.time?.now || 0);

        if (!silent) {
            this.recordMovementLog('Standing down from alert response', timestamp);
        }

        if (typeof this.alertTarget.clearAlertResponder === 'function') {
            this.alertTarget.clearAlertResponder(this);
        }

        this.alertTarget = null;
        this.alertPathBlocked = false;
        this.hideDirectionPointer();
        return true;
    }

    isRespondingToAlert() {
        return Boolean(this.alertTarget);
    }

    coversTile(tileX, tileY) {
        return (
            tileX >= this.tileX &&
            tileY >= this.tileY &&
            tileX < this.tileX + this.tileWidth &&
            tileY < this.tileY + this.tileHeight
        );
    }

    resolveAlert(time) {
        if (!this.alertTarget) {
            return;
        }

        const timestamp = Number.isFinite(time) ? time : (this.scene?.time?.now || 0);
        const cat = this.alertTarget;

        this.recordMovementLog(
            `Alert resolved for (${cat.tileX}, ${cat.tileY})`,
            timestamp
        );

        if (typeof cat.clearAlert === 'function') {
            cat.clearAlert(timestamp);
        }

        this.clearAlertTarget({ silent: true, time: timestamp });
        this.scheduleNextMoveCheck(timestamp);
    }

    buildModalContent() {
        const lines = [];

        if (this.nodeIdentifier) {
            lines.push(`Node: ${this.nodeIdentifier}`);
        }

        if (this.isAssisting && this.assistTarget) {
            lines.push('Status: Assisting cat');
        }

        lines.push(`SPD: ${Math.round(this.speed)}`);
        lines.push(`SIZE: ${this.tileWidth}x${this.tileHeight}`);
        lines.push(`LOC: (${this.tileX}, ${this.tileY})`);

        return createAsciiBox(lines);
    }

    updateModalPosition() {
        const offset = (this.text.displayHeight / 2) + (this.grid.tileSize * 0.4);
        this.modal.setPosition(this.text.x, this.text.y - offset);
    }

    showAttributesModal() {
        this.modal.setText(this.buildModalContent());
        this.updateModalPosition();
        this.modal.setVisible(true);
    }

    hideAttributesModal() {
        this.modal.setVisible(false);
    }

    scheduleNextBlink(time, options = {}) {
        const { usePhaseOffset = false } = options;
        this.nextBlinkTime = time + getRandomEventDelay(DOG_BLINK_INTERVAL_RANGE, usePhaseOffset);
    }

    scheduleNextTongue(time, options = {}) {
        const { usePhaseOffset = false } = options;
        this.nextTongueTime = time + getRandomEventDelay(DOG_TONGUE_INTERVAL_RANGE, usePhaseOffset);
    }

    beginBlink(time) {
        this.isBlinking = true;
        this.blinkEndTime = time + DOG_BLINK_DURATION;
    }

    beginTongue(time) {
        this.isTongueOut = true;
        this.tongueEndTime = time + DOG_TONGUE_OUT_DURATION;
    }

    applyFacialFeatures() {
        if (this.isAssisting) {
            if (this.currentAscii !== DOG_ASSIST_ASCII) {
                this.currentAscii = DOG_ASSIST_ASCII;
                this.text.setText(DOG_ASSIST_ASCII);
                this.scaleToTiles();
            }

            return;
        }

        const targetEyes = this.isBlinking ? DOG_EYES_BLINK : DOG_EYES_OPEN;
        const targetMouth = this.isTongueOut ? DOG_MOUTH_TONGUE : DOG_MOUTH_IDLE;
        const ascii = buildDogAscii(targetEyes, targetMouth);

        if (ascii !== this.currentAscii) {
            this.currentAscii = ascii;
            this.text.setText(this.currentAscii);
            this.scaleToTiles();
        }
    }

    updateFacialAnimations(time) {
        const currentTime = typeof time === 'number' ? time : 0;

        if (this.isAssisting) {
            this.applyFacialFeatures();
            return;
        }

        if (this.isBlinking && currentTime >= this.blinkEndTime) {
            this.isBlinking = false;
            this.scheduleNextBlink(currentTime);
        } else if (!this.isBlinking && currentTime >= this.nextBlinkTime) {
            this.beginBlink(currentTime);
        }

        if (this.isTongueOut && currentTime >= this.tongueEndTime) {
            this.isTongueOut = false;
            this.scheduleNextTongue(currentTime);
        } else if (!this.isTongueOut && currentTime >= this.nextTongueTime) {
            this.beginTongue(currentTime);
        }

        this.applyFacialFeatures();
    }

    findClosestCat(cats) {
        if (!cats || cats.length === 0) {
            return null;
        }

        const center = this.computeAreaCenter(this.tileX, this.tileY);
        let closest = null;
        let closestDistance = Number.POSITIVE_INFINITY;

        cats.forEach((cat) => {
            const distance = Phaser.Math.Distance.Between(center.x, center.y, cat.text.x, cat.text.y);

            if (distance < closestDistance) {
                closest = cat;
                closestDistance = distance;
            }
        });

        return closest;
    }

    determineStepToward(cat) {
        if (!cat) {
            return null;
        }

        const dogCenterX = this.tileX + this.tileWidth / 2;
        const dogCenterY = this.tileY + this.tileHeight / 2;
        const catCenterX = cat.tileX + 0.5;
        const catCenterY = cat.tileY + 0.5;

        const diffX = catCenterX - dogCenterX;
        const diffY = catCenterY - dogCenterY;

        const moves = [];

        if (Math.abs(diffX) >= 0.5) {
            moves.push({ x: Math.sign(diffX), y: 0, priority: Math.abs(diffX) });
        }

        if (Math.abs(diffY) >= 0.5) {
            moves.push({ x: 0, y: Math.sign(diffY), priority: Math.abs(diffY) });
        }

        if (moves.length === 0) {
            return null;
        }

        moves.sort((a, b) => b.priority - a.priority);

        for (const move of moves) {
            const nextTileX = this.tileX + move.x;
            const nextTileY = this.tileY + move.y;

            if (this.scene.canDogOccupyArea(nextTileX, nextTileY, this)) {
                return { x: move.x, y: move.y };
            }
        }

        return null;
    }

    findClosestCatNeedingAssistance(cats) {
        if (!cats || cats.length === 0) {
            return null;
        }

        const needingHelp = cats.filter((cat) => this.catNeedsAssistance(cat));

        if (needingHelp.length === 0) {
            return null;
        }

        return this.findClosestCat(needingHelp);
    }

    catNeedsAssistance(cat) {
        if (!cat) {
            return false;
        }

        if (typeof cat.hasAlert === 'function') {
            return cat.hasAlert();
        }

        return Boolean(cat.alertDetails);
    }

    isWithinAssistanceRange(cat) {
        if (!cat) {
            return false;
        }

        const dogCenterX = this.tileX + this.tileWidth / 2;
        const dogCenterY = this.tileY + this.tileHeight / 2;
        const catCenterX = cat.tileX + 0.5;
        const catCenterY = cat.tileY + 0.5;

        return Math.abs(catCenterX - dogCenterX) <= 1 && Math.abs(catCenterY - dogCenterY) <= 1;
    }

    update(time, cats) {
        this.updateFacialAnimations(time);

        if (this.isAssisting) {
            const assistanceActive = this.updateAssistanceState(time);

            if (assistanceActive) {
                if (this.modal.visible) {
                    this.modal.setText(this.buildModalContent());
                    this.updateModalPosition();
                }

                return;
            }
        }

        let hasActiveAlert = false;

        if (this.isRespondingToAlert() && this.alertTarget) {
            const catHasAlert = typeof this.alertTarget.hasAlert === 'function'
                ? this.alertTarget.hasAlert()
                : Boolean(this.alertTarget.alertDetails);

            hasActiveAlert = catHasAlert;

            if (!catHasAlert) {
                const cleared = this.clearAlertTarget({ silent: true, time });
                if (cleared) {
                    const timestamp = Number.isFinite(time) ? time : (this.scene?.time?.now || 0);
                    this.scheduleNextMoveCheck(timestamp);
                }
                hasActiveAlert = false;
            }
        }

        if (this.isMoving) {
            const elapsed = time - this.moveStartTime;
            const progress = this.moveDuration > 0 ? Phaser.Math.Clamp(elapsed / this.moveDuration, 0, 1) : 1;

            const currentX = Phaser.Math.Linear(this.startPixelX, this.targetPixelX, progress);
            const currentY = Phaser.Math.Linear(this.startPixelY, this.targetPixelY, progress);

            this.text.setPosition(currentX, currentY);

            if (this.alertPointer.visible) {
                this.updateDirectionPointerPosition(currentX, currentY);
            }

            if (this.modal.visible) {
                this.modal.setText(this.buildModalContent());
                this.updateModalPosition();
            }

            if (progress >= 1) {
                this.isMoving = false;
                this.setPosition(this.targetTileX, this.targetTileY);
                this.recordMovementLog(
                    `Arrived at (${this.tileX}, ${this.tileY})`,
                    time
                );

                if (
                    hasActiveAlert &&
                    this.alertTarget &&
                    this.coversTile(this.alertTarget.tileX, this.alertTarget.tileY)
                ) {
                    this.resolveAlert(time);
                } else if (this.isRespondingToAlert() && hasActiveAlert) {
                    this.hideDirectionPointer();
                } else if (!this.isRespondingToAlert()) {
                    if (
                        this.currentTargetCat &&
                        this.catNeedsAssistance(this.currentTargetCat) &&
                        this.isWithinAssistanceRange(this.currentTargetCat)
                    ) {
                        this.beginAssistance(this.currentTargetCat, time);
                        return;
                    }

                    this.scheduleNextMoveCheck(time);
                }
            }

            return;
        }

        if (this.alertPointer.visible && !hasActiveAlert && !this.isRespondingToAlert()) {
            this.hideDirectionPointer();
        }

        if (this.modal.visible) {
            this.modal.setText(this.buildModalContent());
            this.updateModalPosition();
        }

        if (this.currentTargetCat && cats && !cats.includes(this.currentTargetCat)) {
            this.currentTargetCat = null;
        }

        if (
            !hasActiveAlert &&
            this.currentTargetCat &&
            this.catNeedsAssistance(this.currentTargetCat) &&
            this.isWithinAssistanceRange(this.currentTargetCat)
        ) {
            this.beginAssistance(this.currentTargetCat, time);
            return;
        }

        if (hasActiveAlert && this.alertTarget) {
            const move = this.determineStepToward(this.alertTarget);

            if (!move) {
                if (!this.alertPathBlocked) {
                    this.recordMovementLog('Alert path blocked — holding position', time);
                    this.alertPathBlocked = true;
                }

                this.hideDirectionPointer();

                return;
            }

            this.alertPathBlocked = false;
            this.beginMovement(this.tileX + move.x, this.tileY + move.y, time, {
                reason: 'alert',
                pointerDirection: move
            });

            return;
        }

        if (time < this.nextMoveCheckTime) {
            return;
        }

        this.scheduleNextMoveCheck(time);
        this.recordMovementLog(
            `Evaluating patrol options from (${this.tileX}, ${this.tileY})`,
            time
        );

        if (!cats || cats.length === 0) {
            this.recordMovementLog('No cats detected — holding position', time);
            return;
        }

        if (Phaser.Math.FloatBetween(0, 1) > DOG_MOVE_PROBABILITY) {
            this.recordMovementLog('Staying put after patrol evaluation', time);
            return;
        }

        const targetCat = this.findClosestCatNeedingAssistance(cats) || this.findClosestCat(cats);

        if (targetCat && this.catNeedsAssistance(targetCat) && this.isWithinAssistanceRange(targetCat)) {
            this.beginAssistance(targetCat, time);
            return;
        }

        const move = this.determineStepToward(targetCat);

        if (!move) {
            if (targetCat && this.catNeedsAssistance(targetCat)) {
                this.beginAssistance(targetCat, time);
            } else {
                this.recordMovementLog('No viable path toward nearest cat', time);
            }
            return;
        }

        this.beginMovement(this.tileX + move.x, this.tileY + move.y, time, {
            reason: 'cat',
            pointerDirection: move,
            targetCat
        });
    }

    onGridLayoutChanged() {
        this.scaleToTiles();
        this.setPosition(this.tileX, this.tileY);
        this.isMoving = false;
        this.scheduleNextMoveCheck(this.scene.time.now || 0);

        if (this.modal.visible) {
            this.modal.setText(this.buildModalContent());
            this.updateModalPosition();
        }
    }

    destroy() {
        this.text.destroy();
        this.modal.destroy();
        this.alertPointer.destroy();
    }

    beginAssistance(cat, time) {
        if (!cat) {
            return;
        }

        const timestamp = Number.isFinite(time) ? time : (this.scene?.time?.now || 0);

        this.isMoving = false;
        this.currentMoveReason = 'assisting';
        this.currentTargetCat = null;
        this.assistTarget = cat;
        this.nextMoveCheckTime = Number.POSITIVE_INFINITY;
        this.hideDirectionPointer();

        this.startPixelX = this.text.x;
        this.startPixelY = this.text.y;
        this.targetPixelX = this.text.x;
        this.targetPixelY = this.text.y;
        this.moveDuration = 0;
        this.moveStartTime = timestamp;

        this.isBlinking = false;
        this.blinkEndTime = Number.POSITIVE_INFINITY;
        this.nextBlinkTime = Number.POSITIVE_INFINITY;
        this.isTongueOut = false;
        this.tongueEndTime = Number.POSITIVE_INFINITY;
        this.nextTongueTime = Number.POSITIVE_INFINITY;

        this.isAssisting = true;
        this.assistEndTime = timestamp + 1500;
        this.applyFacialFeatures();

        this.recordMovementLog(
            `Providing assistance to cat at (${cat.tileX}, ${cat.tileY})`,
            timestamp
        );

        if (this.modal.visible) {
            this.modal.setText(this.buildModalContent());
            this.updateModalPosition();
        }

        if (this.catNeedsAssistance(cat) && typeof cat.clearAlert === 'function') {
            cat.clearAlert(timestamp);
        }
    }

    updateAssistanceState(time) {
        if (!this.isAssisting) {
            return false;
        }

        const currentTime = Number.isFinite(time) ? time : (this.scene?.time?.now || 0);

        if (currentTime >= this.assistEndTime) {
            this.isAssisting = false;
            this.assistEndTime = 0;
            this.assistTarget = null;
            this.nextMoveCheckTime = currentTime + Phaser.Math.Between(
                DOG_MOVE_INTERVAL_RANGE.min,
                DOG_MOVE_INTERVAL_RANGE.max
            );
            this.scheduleNextBlink(currentTime);
            this.scheduleNextTongue(currentTime);
            this.currentAscii = '';
            this.applyFacialFeatures();
            return false;
        }

        return true;
    }

    updateDirectionPointerPosition(x, y) {
        if (!this.alertPointer.visible) {
            return;
        }

        const offset = (this.text.displayHeight / 2) + (this.grid.tileSize * 0.25);
        this.alertPointer.setPosition(x, y - offset);
    }

    recordMovementLog(message, time) {
        if (typeof message !== 'string' || message.trim().length === 0) {
            return;
        }

        const now = Number.isFinite(time) ? time : (this.scene?.time?.now || 0);
        const entry = {
            timestamp: now,
            timeLabel: this.formatMovementLogTime(now),
            message: message.trim()
        };

        this.movementLog.push(entry);

        if (this.movementLog.length > this.maxMovementLogEntries) {
            this.movementLog.splice(0, this.movementLog.length - this.maxMovementLogEntries);
        }
    }

    formatMovementLogTime(time) {
        if (!Number.isFinite(time) || time < 0) {
            return '0.0s';
        }

        return `${(time / 1000).toFixed(1)}s`;
    }

    getMovementLog() {
        return this.movementLog.map((entry) => ({ ...entry }));
    }
}

class RewardMarker {
    constructor(scene, grid, tileX, tileY, value, attributes = null) {
        this.scene = scene;
        this.grid = grid;
        this.tileX = tileX;
        this.tileY = tileY;
        this.value = Number.isFinite(value) ? Math.trunc(value) : 0;
        this.attributes = this.sanitizeAttributes(attributes);

        this.text = scene.add.text(0, 0, '', REWARD_FONT_STYLE);
        this.text.setOrigin(0.5, 0.5);
        this.text.setDepth(3);
        this.text.setInteractive({ useHandCursor: true });

        this.modal = scene.add.text(0, 0, '', REWARD_MODAL_FONT_STYLE);
        this.modal.setOrigin(0.5, 1);
        this.modal.setDepth(18);
        this.modal.setVisible(false);

        this.text.on('pointerover', this.showModal, this);
        this.text.on('pointerout', this.hideModal, this);

        this.updateAppearance();
        this.onGridLayoutChanged();
    }

    sanitizeAttributes(attributes) {
        const sanitized = {};

        if (attributes && typeof attributes === 'object') {
            Object.entries(attributes).forEach(([key, value]) => {
                if (typeof key !== 'string' || key.trim().length === 0) {
                    return;
                }

                const label = key.trim();
                let resolvedValue;

                if (Array.isArray(value)) {
                    resolvedValue = value.map((item) => String(item)).join(', ');
                } else if (typeof value === 'boolean') {
                    resolvedValue = value ? 'Yes' : 'No';
                } else if (value === null || value === undefined) {
                    resolvedValue = 'Unknown';
                } else {
                    resolvedValue = String(value);
                }

                sanitized[label] = resolvedValue;
            });
        }

        const hasTypeAttribute = Object.keys(sanitized).some((key) => key.toLowerCase() === 'type');

        if (!hasTypeAttribute) {
            sanitized.Type = this.value >= 0 ? 'Reward' : 'Punishment';
        }

        return sanitized;
    }

    updateAppearance() {
        const ascii = this.buildAscii();
        const color = this.resolveColor();

        this.text.setText(ascii);
        this.text.setColor(color);
        this.scaleToTile();
    }

    buildAscii() {
        if (this.value > 0) {
            return `+${this.value}`;
        }

        if (this.value < 0) {
            return `${this.value}`;
        }

        return '0';
    }

    resolveColor() {
        if (this.value > 0) {
            return '#7cfc00';
        }

        if (this.value < 0) {
            return '#ff6b6b';
        }

        return REWARD_FONT_STYLE.color;
    }

    setPosition(tileX, tileY) {
        const position = this.grid.tileToWorld(tileX, tileY);

        this.tileX = tileX;
        this.tileY = tileY;
        this.text.setPosition(position.x, position.y);

        if (this.modal.visible) {
            this.updateModalPosition();
        }
    }

    scaleToTile() {
        const tileSize = this.grid.tileSize;
        const padding = tileSize * REWARD_TILE_PADDING_RATIO;
        const maxWidth = Math.max(1, tileSize - padding);
        const maxHeight = Math.max(1, tileSize - padding);
        const textWidth = this.text.width || 1;
        const textHeight = this.text.height || 1;
        const scale = Math.min(maxWidth / textWidth, maxHeight / textHeight);

        this.text.setScale(scale);
    }

    onGridLayoutChanged() {
        this.scaleToTile();
        this.setPosition(this.tileX, this.tileY);
    }

    updateModalPosition() {
        const offset = (this.text.displayHeight / 2) + (this.grid.tileSize * 0.35);
        this.modal.setPosition(this.text.x, this.text.y - offset);
    }

    buildModalContent() {
        const lines = [];
        const valueLabel = this.value > 0 ? `+${this.value}` : `${this.value}`;

        lines.push(`VALUE: ${valueLabel}`);

        Object.entries(this.attributes).forEach(([key, value]) => {
            lines.push(`${key.toUpperCase()}: ${value}`);
        });

        lines.push(`LOC: (${this.tileX}, ${this.tileY})`);

        return createAsciiBox(lines);
    }

    showModal() {
        this.modal.setText(this.buildModalContent());
        this.updateModalPosition();
        this.modal.setVisible(true);
    }

    hideModal() {
        this.modal.setVisible(false);
    }

    destroy() {
        this.text.destroy();
        this.modal.destroy();
    }
}

export class Simulation extends Scene {
    constructor(sceneKey = 'Simulation') {
        super(sceneKey);

        this.cats = [];
        this.dogs = [];
        this.grid = null;
        this.waitingText = null;
        this.shouldReceiveRemoteUpdates = false;
        this.isWaitingForData = false;
        this.statusPanel = null;
        this.highlightGraphics = null;
        this.activeHighlight = null;
        this.nextStatusPanelUpdateTime = 0;
        this.lastSimulationUpdate = null;
        this.isDemoSimulation = false;
        this.rewardMarkers = [];
        this.imageModal = null;

        this.handleResize = this.handleResize.bind(this);
        this.handleSimulationData = this.handleSimulationData.bind(this);
        this.handleNodeHover = this.handleNodeHover.bind(this);
        this.handleNodeHoverEnd = this.handleNodeHoverEnd.bind(this);
        this.handleGridPointerUp = this.handleGridPointerUp.bind(this);
        this.handleClassificationTaskComplete = this.handleClassificationTaskComplete.bind(this);
        this.handleClassificationTaskError = this.handleClassificationTaskError.bind(this);
    }

    preload() {
        //  No external assets required for the ASCII cats.
    }

    create(data = {}) {
        this.cameras.main.setBackgroundColor('#3c341bff');

        this.shouldReceiveRemoteUpdates = Boolean(data?.waitForRemoteData);

        const initialConfig = this.normalizeSimulationConfig(data?.simulationConfig);
        const initialGridWidth = initialConfig?.grid?.width ?? GRID_TILE_COUNT.width;
        const initialGridHeight = initialConfig?.grid?.height ?? GRID_TILE_COUNT.height;

        this.updateGridDimensions(initialGridWidth, initialGridHeight);
        this.scale.on('resize', this.handleResize);

        this.highlightGraphics = this.add.graphics();
        this.highlightGraphics.setDepth(40);
        this.highlightGraphics.setVisible(false);

        this.statusPanel = new SimulationStatusPanel(this, {
            onNodeHover: this.handleNodeHover,
            onNodeHoverEnd: this.handleNodeHoverEnd,
            isDemo: this.isDemoSimulation
        });

        this.imageModal = new ImageClassificationModal({
            defaultPrompt: DEFAULT_IMAGE_PROMPT,
            onClassificationComplete: this.handleClassificationTaskComplete,
            onClassificationError: this.handleClassificationTaskError
        });
        this.input.on('pointerup', this.handleGridPointerUp, this);

        if (initialConfig) {
            this.applySimulationConfig(initialConfig);
        } else if (this.shouldReceiveRemoteUpdates) {
            this.enterWaitingForDataState();
        } else {
            this.populateRandom();
        }

        if (this.shouldReceiveRemoteUpdates) {
            this.game.events.on('simulation-data', this.handleSimulationData, this);
        }

        this.events.once('shutdown', () => {
            this.scale.off('resize', this.handleResize);

            if (this.grid) {
                this.grid.destroy();
                this.grid = null;
            }

            this.clearAnimals();
            this.exitWaitingForDataState();

            if (this.statusPanel) {
                this.statusPanel.destroy();
                this.statusPanel = null;
            }

            if (this.highlightGraphics) {
                this.highlightGraphics.destroy();
                this.highlightGraphics = null;
            }

            this.activeHighlight = null;

            if (this.input) {
                this.input.off('pointerup', this.handleGridPointerUp, this);
            }

            if (this.imageModal) {
                this.imageModal.destroy();
                this.imageModal = null;
            }

            if (this.shouldReceiveRemoteUpdates) {
                this.game.events.off('simulation-data', this.handleSimulationData, this);
            }

            this.shouldReceiveRemoteUpdates = false;
        });
    }

    normalizeSimulationConfig(rawConfig) {
        if (!rawConfig || typeof rawConfig !== 'object') {
            return null;
        }

        const gridSource = (typeof rawConfig.grid === 'object' && rawConfig.grid !== null)
            ? rawConfig.grid
            : rawConfig;

        const widthCandidate = gridSource?.width;
        const heightCandidate = gridSource?.height;

        const width = Number.isInteger(widthCandidate) && widthCandidate > 0
            ? widthCandidate
            : GRID_TILE_COUNT.width;
        const height = Number.isInteger(heightCandidate) && heightCandidate > 0
            ? heightCandidate
            : GRID_TILE_COUNT.height;

        const cats = Array.isArray(rawConfig.cats)
            ? rawConfig.cats.map((entry) => this.normalizeCatEntry(entry))
            : [];
        const dogs = Array.isArray(rawConfig.dogs)
            ? rawConfig.dogs.map((entry) => this.normalizeDogEntry(entry))
            : [];
        const rewards = Array.isArray(rawConfig.rewards)
            ? rawConfig.rewards
                .map((entry) => this.normalizeRewardEntry(entry))
                .filter((entry) => Number.isInteger(entry.tileX) && Number.isInteger(entry.tileY))
            : [];

        return {
            grid: { width, height },
            cats,
            dogs,
            rewards
        };
    }

    normalizeCatEntry(entry) {
        if (!entry || typeof entry !== 'object') {
            return { tileX: null, tileY: null, attributes: null, identifier: null };
        }

        const tileX = this.extractTileCoordinate(entry, 'x');
        const tileY = this.extractTileCoordinate(entry, 'y');
        const identifier = this.extractIdentifier(entry);
        let attributes = (entry.attributes && typeof entry.attributes === 'object')
            ? { ...entry.attributes }
            : null;

        if (!attributes) {
            attributes = this.deriveAttributesFromNode(entry);
        }

        if (typeof entry.alert === 'string' && entry.alert.trim().length > 0) {
            attributes = attributes ? { ...attributes, alert: entry.alert.trim() } : { alert: entry.alert.trim() };
        }

        const needsCandidate = entry.needs ?? entry.need ?? entry.requirement ?? entry.requires;

        if (Array.isArray(needsCandidate)) {
            const needsList = needsCandidate
                .map((item) => (typeof item === 'string' ? item.trim() : String(item)))
                .filter((item) => item.length > 0);

            if (needsList.length > 0) {
                attributes = attributes ? { ...attributes, needs: needsList } : { needs: needsList };
            }
        } else if (typeof needsCandidate === 'string' && needsCandidate.trim().length > 0) {
            attributes = attributes ? { ...attributes, needs: needsCandidate.trim() } : { needs: needsCandidate.trim() };
        }

        return { tileX, tileY, attributes, identifier };
    }

    deriveAttributesFromNode(entry) {
        if (!entry || typeof entry !== 'object') {
            return null;
        }

        const efficiency = entry.compute_efficiency_flops_per_milliamp;
        const battery = entry.battery_level;
        const identifier = typeof entry.identifier === 'string'
            ? entry.identifier
            : null;

        let cpuText = null;

        if (typeof efficiency === 'number' && Number.isFinite(efficiency)) {
            const formatted = Math.round(efficiency).toLocaleString();
            cpuText = `${formatted} FLOPs/mA`;
        } else if (identifier) {
            cpuText = `Node ${identifier}`;
        }

        let ramText = null;

        if (typeof battery === 'number' && Number.isFinite(battery)) {
            const clamped = Math.max(0, Math.min(100, Math.round(battery)));
            ramText = `${clamped}% battery`;
        }

        if (!cpuText && !ramText) {
            return null;
        }

        return {
            cpu: cpuText || 'Unknown CPU',
            ram: ramText || 'Battery unavailable'
        };
    }

    normalizeDogEntry(entry) {
        if (!entry || typeof entry !== 'object') {
            return { tileX: null, tileY: null, identifier: null };
        }

        const tileX = this.extractTileCoordinate(entry, 'x');
        const tileY = this.extractTileCoordinate(entry, 'y');
        const identifier = this.extractIdentifier(entry);

        return { tileX, tileY, identifier };
    }

    normalizeRewardEntry(entry) {
        if (!entry || typeof entry !== 'object') {
            return { tileX: null, tileY: null, value: 0, attributes: null };
        }

        const tileX = this.extractTileCoordinate(entry, 'x');
        const tileY = this.extractTileCoordinate(entry, 'y');
        const valueCandidate = [entry.value, entry.reward, entry.amount]
            .find((candidate) => typeof candidate === 'number' && Number.isFinite(candidate));
        const value = Number.isFinite(valueCandidate)
            ? Math.trunc(valueCandidate)
            : 0;
        const attributes = (entry.attributes && typeof entry.attributes === 'object')
            ? { ...entry.attributes }
            : null;

        return { tileX, tileY, value, attributes };
    }

    extractTileCoordinate(entry, axis) {
        const axisKey = axis.toLowerCase();
        const tileKey = `tile${axis.toUpperCase()}`;

        if (Number.isInteger(entry[tileKey])) {
            return entry[tileKey];
        }

        if (Number.isInteger(entry[axisKey])) {
            return entry[axisKey];
        }

        if (entry.position && Number.isInteger(entry.position[axisKey])) {
            return entry.position[axisKey];
        }

        if (entry.location && Number.isInteger(entry.location[axisKey])) {
            return entry.location[axisKey];
        }

        return null;
    }

    extractIdentifier(entry) {
        if (!entry || typeof entry !== 'object') {
            return null;
        }

        const candidates = [
            entry.identifier,
            entry.id,
            entry.name,
            entry.node_identifier,
            entry.nodeId
        ];

        for (const candidate of candidates) {
            if (typeof candidate === 'string' && candidate.trim().length > 0) {
                return candidate.trim();
            }
        }

        return null;
    }

    resolveIdentifier(candidate, prefix, index) {
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
            return candidate.trim();
        }

        const safePrefix = typeof prefix === 'string' && prefix.trim().length > 0
            ? prefix.trim()
            : 'node';
        const suffix = Number.isInteger(index) && index > 0
            ? index
            : 1;

        return `${safePrefix}-${suffix}`;
    }

    applySimulationConfig(config) {
        if (!config) {
            return;
        }

        this.exitWaitingForDataState();
        this.updateGridDimensions(config.grid?.width, config.grid?.height);
        this.rebuildAnimalsFromConfig(config);
        this.lastSimulationUpdate = Date.now();
        this.refreshStatusPanel();
    }

    updateGridDimensions(widthCandidate, heightCandidate) {
        const width = Number.isInteger(widthCandidate) && widthCandidate > 0
            ? widthCandidate
            : GRID_TILE_COUNT.width;
        const height = Number.isInteger(heightCandidate) && heightCandidate > 0
            ? heightCandidate
            : GRID_TILE_COUNT.height;

        if (
            this.grid &&
            this.grid.tileCountWidth === width &&
            this.grid.tileCountHeight === height
        ) {
            this.handleResize(this.scale.gameSize);

            return;
        }

        if (this.grid) {
            this.grid.destroy();
        }

        this.grid = new Grid(this, width, height);
        this.handleResize(this.scale.gameSize);
    }

    rebuildAnimalsFromConfig(config) {
        this.clearAnimals();

        if (!this.grid) {
            return;
        }

        const attributePool = Phaser.Utils.Array.Shuffle([...CAT_ATTRIBUTE_PRESETS]);

        let catIndex = 0;
        config.cats.forEach((catEntry) => {
            if (!Number.isInteger(catEntry.tileX) || !Number.isInteger(catEntry.tileY)) {
                return;
            }

            if (!this.grid.containsTile(catEntry.tileX, catEntry.tileY)) {
                return;
            }

            if (this.isTileBlockedForCat(catEntry.tileX, catEntry.tileY)) {
                return;
            }

            const defaultAttributes = attributePool.length > 0
                ? attributePool[catIndex % attributePool.length]
                : CAT_ATTRIBUTE_PRESETS[0];

            const catAttributes = catEntry.attributes
                ? { ...defaultAttributes, ...catEntry.attributes }
                : { ...defaultAttributes };

            const identifier = this.resolveIdentifier(catEntry.identifier, 'cat', catIndex + 1);
            const cat = new Cat(this, this.grid, catEntry.tileX, catEntry.tileY, catAttributes, identifier);

            cat.lookAround(this.time.now || 0);
            this.cats.push(cat);
            catIndex += 1;
        });

        let dogIndex = 0;
        config.dogs.forEach((dogEntry) => {
            if (!Number.isInteger(dogEntry.tileX) || !Number.isInteger(dogEntry.tileY)) {
                return;
            }

            if (!this.canDogOccupyArea(dogEntry.tileX, dogEntry.tileY)) {
                return;
            }

            const identifier = this.resolveIdentifier(dogEntry.identifier, 'dog', dogIndex + 1);
            const dog = new Dog(this, this.grid, dogEntry.tileX, dogEntry.tileY, identifier);

            this.dogs.push(dog);
            dogIndex += 1;
        });

        if (Array.isArray(config.rewards) && config.rewards.length > 0) {
            this.buildRewardMarkers(config.rewards);
        } else if (this.isDemoSimulation) {
            this.generateDemoRewards();
        }
    }

    clearAnimals() {
        this.cats.forEach((cat) => cat.destroy());
        this.dogs.forEach((dog) => dog.destroy());
        this.rewardMarkers.forEach((reward) => reward.destroy());

        this.cats = [];
        this.dogs = [];
        this.rewardMarkers = [];
        this.activeHighlight = null;
        this.clearNodeHighlight();
    }

    populateRandom() {
        this.exitWaitingForDataState();
        this.clearAnimals();

        if (!this.grid) {
            return;
        }

        const configuredCatCount = this.registry.get('catCount');
        const catCount = Number.isInteger(configuredCatCount) && configuredCatCount >= 0
            ? configuredCatCount
            : DEFAULT_CAT_COUNT;
        const configuredDogCount = this.registry.get('dogCount');
        const dogCount = Number.isInteger(configuredDogCount) && configuredDogCount >= 0
            ? configuredDogCount
            : DEFAULT_DOG_COUNT;

        const attributePool = Phaser.Utils.Array.Shuffle([...CAT_ATTRIBUTE_PRESETS]);

        for (let i = 0; i < catCount; i++) {
            let tileX = null;
            let tileY = null;

            for (let attempt = 0; attempt < MAX_RANDOM_PLACEMENT_ATTEMPTS; attempt++) {
                const candidateX = Phaser.Math.Between(0, this.grid.tileCountWidth - 1);
                const candidateY = Phaser.Math.Between(0, this.grid.tileCountHeight - 1);

                if (!this.isTileBlockedForCat(candidateX, candidateY)) {
                    tileX = candidateX;
                    tileY = candidateY;
                    break;
                }
            }

            if (tileX === null || tileY === null) {
                break;
            }

            const attributeIndex = i % attributePool.length;
            const catAttributes = { ...attributePool[attributeIndex] };

            const identifier = this.resolveIdentifier(null, 'sim-cat', i + 1);
            const cat = new Cat(this, this.grid, tileX, tileY, catAttributes, identifier);

            cat.lookAround(this.time.now || 0);
            this.cats.push(cat);
        }

        const canPlaceDog = this.grid.canFitArea(0, 0, DOG_TILE_WIDTH, DOG_TILE_HEIGHT);

        if (canPlaceDog) {
            const maxDogTileX = this.grid.tileCountWidth - DOG_TILE_WIDTH;
            const maxDogTileY = this.grid.tileCountHeight - DOG_TILE_HEIGHT;

            for (let i = 0; i < dogCount; i++) {
                let tileX = null;
                let tileY = null;

                for (let attempt = 0; attempt < MAX_RANDOM_PLACEMENT_ATTEMPTS; attempt++) {
                    const candidateX = Phaser.Math.Between(0, maxDogTileX);
                    const candidateY = Phaser.Math.Between(0, maxDogTileY);

                    if (this.canDogOccupyArea(candidateX, candidateY)) {
                        tileX = candidateX;
                        tileY = candidateY;
                        break;
                    }
                }

                if (tileX === null || tileY === null) {
                    break;
                }

                const identifier = this.resolveIdentifier(null, 'sim-dog', i + 1);
                const dog = new Dog(this, this.grid, tileX, tileY, identifier);

                this.dogs.push(dog);
            }
        }

        if (!this.shouldReceiveRemoteUpdates) {
            this.generateDemoRewards();
        }

        this.lastSimulationUpdate = Date.now();
        this.refreshStatusPanel();
    }

    buildRewardMarkers(entries) {
        entries.forEach((rewardEntry) => {
            const tileX = Number.isInteger(rewardEntry.tileX) ? rewardEntry.tileX : null;
            const tileY = Number.isInteger(rewardEntry.tileY) ? rewardEntry.tileY : null;

            if (tileX === null || tileY === null) {
                return;
            }

            if (!this.grid.containsTile(tileX, tileY)) {
                return;
            }

            const value = Number.isFinite(rewardEntry.value)
                ? Math.trunc(rewardEntry.value)
                : 0;
            const attributes = rewardEntry.attributes && typeof rewardEntry.attributes === 'object'
                ? { ...rewardEntry.attributes }
                : null;

            const marker = new RewardMarker(this, this.grid, tileX, tileY, value, attributes);
            this.rewardMarkers.push(marker);
        });
    }

    upsertRewardMarker(entry) {
        if (!this.grid) {
            return false;
        }

        const normalized = this.normalizeRewardEntry(entry);
        const tileX = Number.isInteger(normalized.tileX) ? normalized.tileX : null;
        const tileY = Number.isInteger(normalized.tileY) ? normalized.tileY : null;

        if (tileX === null || tileY === null) {
            return false;
        }

        if (!this.grid.containsTile(tileX, tileY)) {
            return false;
        }

        const attributes = normalized.attributes && typeof normalized.attributes === 'object'
            ? { ...normalized.attributes }
            : null;

        const existingIndex = this.rewardMarkers.findIndex((reward) => (
            reward.tileX === tileX && reward.tileY === tileY
        ));

        if (existingIndex >= 0) {
            const existing = this.rewardMarkers[existingIndex];
            existing.destroy();
            this.rewardMarkers.splice(existingIndex, 1);
        }

        const marker = new RewardMarker(this, this.grid, tileX, tileY, normalized.value, attributes);
        this.rewardMarkers.push(marker);
        return true;
    }

    generateDemoRewards() {
        if (!this.grid) {
            return;
        }

        for (let i = 0; i < DEMO_POSITIVE_REWARD_COUNT; i++) {
            this.spawnDemoReward(DEMO_POSITIVE_REWARD_VALUE);
        }

        for (let i = 0; i < DEMO_NEGATIVE_REWARD_COUNT; i++) {
            this.spawnDemoReward(DEMO_NEGATIVE_REWARD_VALUE);
        }
    }

    spawnDemoReward(value) {
        if (!this.grid) {
            return false;
        }

        const attempts = Math.max(1, Math.floor(MAX_RANDOM_PLACEMENT_ATTEMPTS / 2));

        for (let attempt = 0; attempt < attempts; attempt++) {
            const candidateX = Phaser.Math.Between(0, this.grid.tileCountWidth - 1);
            const candidateY = Phaser.Math.Between(0, this.grid.tileCountHeight - 1);

            if (!this.grid.containsTile(candidateX, candidateY)) {
                continue;
            }

            if (this.isTileOccupiedByDog(candidateX, candidateY)) {
                continue;
            }

            const alreadyHasReward = this.rewardMarkers.some((reward) => (
                reward.tileX === candidateX && reward.tileY === candidateY
            ));

            if (alreadyHasReward) {
                continue;
            }

            const marker = new RewardMarker(this, this.grid, candidateX, candidateY, value);
            this.rewardMarkers.push(marker);
            return true;
        }

        return false;
    }

    isTileOccupiedByCat(tileX, tileY, ignoreCat = null) {
        return this.cats.some((cat) => {
            if (cat === ignoreCat) {
                return false;
            }

            if (cat.tileX === tileX && cat.tileY === tileY) {
                return true;
            }

            if (cat.isMoving && cat.targetTileX === tileX && cat.targetTileY === tileY) {
                return true;
            }

            return false;
        });
    }

    doesAreaOverlapDog(tileX, tileY, width, height, ignoreDog = null) {
        const areaMinX = tileX;
        const areaMinY = tileY;
        const areaMaxX = tileX + width - 1;
        const areaMaxY = tileY + height - 1;

        return this.dogs.some((dog) => {
            if (dog === ignoreDog) {
                return false;
            }

            const dogMinX = dog.tileX;
            const dogMinY = dog.tileY;
            const dogMaxX = dogMinX + dog.tileWidth - 1;
            const dogMaxY = dogMinY + dog.tileHeight - 1;

            const overlapsCurrent = !(
                areaMaxX < dogMinX ||
                areaMinX > dogMaxX ||
                areaMaxY < dogMinY ||
                areaMinY > dogMaxY
            );

            if (overlapsCurrent) {
                return true;
            }

            if (!dog.isMoving) {
                return false;
            }

            const targetMinX = dog.targetTileX;
            const targetMinY = dog.targetTileY;
            const targetMaxX = targetMinX + dog.tileWidth - 1;
            const targetMaxY = targetMinY + dog.tileHeight - 1;

            return !(
                areaMaxX < targetMinX ||
                areaMinX > targetMaxX ||
                areaMaxY < targetMinY ||
                areaMinY > targetMaxY
            );
        });
    }

    isTileOccupiedByDog(tileX, tileY, ignoreDog = null) {
        return this.doesAreaOverlapDog(tileX, tileY, 1, 1, ignoreDog);
    }

    isTileBlockedForCat(tileX, tileY, ignoreCat = null) {
        if (!this.grid || !this.grid.containsTile(tileX, tileY)) {
            return true;
        }

        if (this.isTileOccupiedByCat(tileX, tileY, ignoreCat)) {
            return true;
        }

        return this.isTileOccupiedByDog(tileX, tileY);
    }

    canDogOccupyArea(tileX, tileY, dog = null) {
        if (!this.grid || !this.grid.canFitArea(tileX, tileY, DOG_TILE_WIDTH, DOG_TILE_HEIGHT)) {
            return false;
        }

        for (let y = tileY; y < tileY + DOG_TILE_HEIGHT; y++) {
            for (let x = tileX; x < tileX + DOG_TILE_WIDTH; x++) {
                if (this.isTileOccupiedByCat(x, y)) {
                    return false;
                }
            }
        }

        return !this.doesAreaOverlapDog(tileX, tileY, DOG_TILE_WIDTH, DOG_TILE_HEIGHT, dog);
    }

    enterWaitingForDataState() {
        if (this.isWaitingForData) {
            return;
        }

        this.isWaitingForData = true;

        this.waitingText = this.add.text(0, 0, 'Awaiting simulation data...\nSyncing with server.', {
            fontFamily: 'Courier',
            fontSize: 24,
            color: '#f7f7dcff',
            align: 'center'
        });

        this.waitingText.setDepth(1000);
        this.waitingText.setScrollFactor(0);
        this.waitingText.setOrigin(0.5, 0.5);
        this.positionWaitingText();
        this.refreshStatusPanel();
    }

    exitWaitingForDataState() {
        this.isWaitingForData = false;

        if (this.waitingText) {
            this.waitingText.destroy();
            this.waitingText = null;
        }
    }

    positionWaitingText() {
        if (!this.waitingText) {
            return;
        }

        const size = this.scale.gameSize || { width: 0, height: 0 };

        this.waitingText.setPosition(size.width / 2, size.height / 2);
    }

    handleSimulationData(payload) {
        if (!this.shouldReceiveRemoteUpdates) {
            return;
        }

        const config = this.normalizeSimulationConfig(payload);

        if (!config) {
            return;
        }

        this.applySimulationConfig(config);
    }

    handleClassificationTaskComplete({ status, tileX, tileY } = {}) {
        if (!status || typeof status !== 'object') {
            return;
        }

        const result = status.result && typeof status.result === 'object'
            ? status.result
            : {};

        const rewardEntry = result.reward && typeof result.reward === 'object'
            ? { ...result.reward }
            : null;

        const classification = typeof result.classification === 'string'
            ? result.classification
            : null;

        const normalizedClassification = this.normalizeClassificationLabel(
            rewardEntry && typeof rewardEntry.classification === 'string'
                ? rewardEntry.classification
                : classification
        );

        let targetReward = rewardEntry;

        if (!targetReward && normalizedClassification) {
            const fallbackValue = this.resolveClassificationRewardValue(normalizedClassification);

            if (fallbackValue !== null) {
                targetReward = {
                    tileX: Number.isInteger(tileX) ? tileX : null,
                    tileY: Number.isInteger(tileY) ? tileY : null,
                    value: fallbackValue,
                    attributes: {
                        classification: normalizedClassification,
                        source: 'OpenAI vision classifier'
                    }
                };
            }
        }

        if (!targetReward) {
            return;
        }

        const normalizedReward = this.normalizeRewardEntry(targetReward);

        if (!Number.isInteger(normalizedReward.tileX) || !Number.isInteger(normalizedReward.tileY)) {
            return;
        }

        if (!this.grid || !this.grid.containsTile(normalizedReward.tileX, normalizedReward.tileY)) {
            return;
        }

        const attributes = normalizedReward.attributes && typeof normalizedReward.attributes === 'object'
            ? { ...normalizedReward.attributes }
            : {};

        if (normalizedClassification && !Object.keys(attributes).some((key) => key.toLowerCase() === 'classification')) {
            attributes.classification = normalizedClassification;
        }

        if (!Object.keys(attributes).some((key) => key.toLowerCase() === 'source')) {
            attributes.source = 'OpenAI vision classifier';
        }

        normalizedReward.attributes = Object.keys(attributes).length > 0 ? attributes : null;

        const added = this.upsertRewardMarker(normalizedReward);

        if (added) {
            this.refreshStatusPanel();
        }
    }

    handleClassificationTaskError(details = {}) {
        const message = typeof details.message === 'string' && details.message.trim().length > 0
            ? details.message.trim()
            : 'Image classification request failed.';

        console.warn('Image classification task failed:', message, details);
    }

    normalizeClassificationLabel(value) {
        if (typeof value !== 'string') {
            return null;
        }

        const trimmed = value.trim();

        if (trimmed.length === 0) {
            return null;
        }

        const upper = trimmed.toUpperCase();

        if (Object.prototype.hasOwnProperty.call(CLASSIFICATION_REWARD_VALUES, upper)) {
            return upper;
        }

        const match = upper.match(/(DANGEROUS|MOVABLE|IMMOVABLE)/);
        return match ? match[1] : null;
    }

    resolveClassificationRewardValue(classification) {
        const normalized = this.normalizeClassificationLabel(classification);

        if (!normalized) {
            return null;
        }

        return CLASSIFICATION_REWARD_VALUES[normalized] ?? null;
    }

    buildStatusPanelData() {
        if (!this.statusPanel) {
            return null;
        }

        const grid = this.grid
            ? { width: this.grid.tileCountWidth, height: this.grid.tileCountHeight }
            : { width: GRID_TILE_COUNT.width, height: GRID_TILE_COUNT.height };
        const nodes = this.collectNodeEntries();
        const totalNodes = nodes.length;
        let activeNodes = nodes.reduce((sum, node) => sum + (node.isActive ? 1 : 0), 0);

        if (this.isDemoSimulation && totalNodes > 0) {
            activeNodes = Math.max(1, Math.min(totalNodes, Math.round(totalNodes * 0.72)));
        }

        const mode = this.isDemoSimulation
            ? 'DEMO'
            : (this.shouldReceiveRemoteUpdates ? 'LIVE' : 'LOCAL');

        return {
            grid,
            catCount: this.cats.length,
            dogCount: this.dogs.length,
            totalNodes,
            activeNodes,
            mode,
            lastUpdatedAt: this.lastSimulationUpdate,
            waitingForData: this.isWaitingForData,
            nodes,
            isDemo: this.isDemoSimulation
        };
    }

    collectNodeEntries() {
        const nodes = [];

        this.cats.forEach((cat, index) => {
            const entry = this.buildCatNodeEntry(cat, index);

            if (entry) {
                nodes.push(entry);
            }
        });

        this.dogs.forEach((dog, index) => {
            const entry = this.buildDogNodeEntry(dog, index);

            if (entry) {
                nodes.push(entry);
            }
        });

        return nodes;
    }

    buildCatNodeEntry(cat, index) {
        if (!cat) {
            return null;
        }

        const status = this.determineCatStatus(cat);
        const identifier = cat.nodeIdentifier || `cat-${index + 1}`;
        const name = cat.nodeIdentifier || `Cat ${index + 1}`;

        return {
            id: identifier,
            name,
            type: 'cat',
            tileX: cat.tileX,
            tileY: cat.tileY,
            tileWidth: 1,
            tileHeight: 1,
            status,
            displayStatus: status,
            isActive: this.isCatActive(cat),
            logEntries: typeof cat.getMovementLog === 'function' ? cat.getMovementLog() : []
        };
    }

    buildDogNodeEntry(dog, index) {
        if (!dog) {
            return null;
        }

        const status = this.determineDogStatus(dog);
        const identifier = dog.nodeIdentifier || `dog-${index + 1}`;
        const name = dog.nodeIdentifier || `Dog ${index + 1}`;

        return {
            id: identifier,
            name,
            type: 'dog',
            tileX: dog.tileX,
            tileY: dog.tileY,
            tileWidth: dog.tileWidth,
            tileHeight: dog.tileHeight,
            status,
            displayStatus: status,
            isActive: this.isDogActive(dog),
            logEntries: typeof dog.getMovementLog === 'function' ? dog.getMovementLog() : []
        };
    }

    determineCatStatus(cat) {
        if (!cat) {
            return 'Idle';
        }

        if (typeof cat.hasAlert === 'function' && cat.hasAlert()) {
            const alertStatus = typeof cat.getAlertStatusText === 'function'
                ? cat.getAlertStatusText()
                : null;

            if (typeof alertStatus === 'string' && alertStatus.trim().length > 0) {
                return alertStatus;
            }

            return 'ALERT — Condition detected';
        }

        if (cat.isPerformingJob) {
            return 'Performing job';
        }

        if (cat.isMoving) {
            return 'Relocating across mesh';
        }

        if (cat.isMouthOpen) {
            return 'Transmitting diagnostics';
        }

        if (cat.isBlinking) {
            return 'Scanning sector';
        }

        return 'Standing by';
    }

    determineDogStatus(dog) {
        if (!dog) {
            return 'Idle';
        }

        if (typeof dog.isRespondingToAlert === 'function' && dog.isRespondingToAlert()) {
            const targetCat = dog.alertTarget;
            const fallbackLabel = targetCat
                ? `cat at (${targetCat.tileX}, ${targetCat.tileY})`
                : 'alerted cat';
            const targetLabel = targetCat && typeof targetCat.nodeIdentifier === 'string'
                ? targetCat.nodeIdentifier
                : fallbackLabel;
            return `Responding to ${targetLabel}`;
        }

        if (dog.isMoving) {
            return 'Patrolling network routes';
        }

        if (dog.isTongueOut) {
            return 'Cooling radio hardware';
        }

        if (dog.isBlinking) {
            return 'Monitoring traffic';
        }

        return 'Stationed';
    }

    isCatActive(cat) {
        const hasAlert = Boolean(cat && typeof cat.hasAlert === 'function' && cat.hasAlert());

        return Boolean(cat && (cat.isMoving || cat.isMouthOpen || hasAlert));
    }

    isDogActive(dog) {
        const isAlertResponse = Boolean(dog && typeof dog.isRespondingToAlert === 'function' && dog.isRespondingToAlert());

        return Boolean(dog && (dog.isMoving || dog.isTongueOut || isAlertResponse));
    }

    refreshStatusPanel() {
        if (!this.statusPanel) {
            return;
        }

        const shouldSuspendPanel = (
            this.shouldReceiveRemoteUpdates &&
            this.isWaitingForData &&
            !this.isDemoSimulation
        );

        if (typeof this.statusPanel.setSuspended === 'function') {
            this.statusPanel.setSuspended(shouldSuspendPanel);
        }

        if (shouldSuspendPanel) {
            return;
        }

        const panelData = this.buildStatusPanelData();

        if (panelData) {
            this.statusPanel.update(panelData);
            this.updateActiveHighlightFromNodes(panelData.nodes);
        }
    }

    findClosestAvailableDog(cat, candidates) {
        if (!cat || !Array.isArray(candidates) || candidates.length === 0) {
            return null;
        }

        const targetPosition = this.grid
            ? this.grid.tileToWorld(cat.tileX, cat.tileY)
            : { x: cat.tileX, y: cat.tileY };
        let closestDog = null;
        let closestDistance = Number.POSITIVE_INFINITY;

        candidates.forEach((dog) => {
            if (!dog || typeof dog.computeAreaCenter !== 'function') {
                return;
            }

            const dogCenter = dog.computeAreaCenter(dog.tileX, dog.tileY);
            const distance = Phaser.Math.Distance.Between(targetPosition.x, targetPosition.y, dogCenter.x, dogCenter.y);

            if (distance < closestDistance) {
                closestDog = dog;
                closestDistance = distance;
            }
        });

        return closestDog;
    }

    manageDemoAlerts(time) {
        if (!this.isDemoSimulation || this.cats.length === 0 || this.dogs.length === 0) {
            return;
        }

        const timestamp = Number.isFinite(time) ? time : (this.time?.now || 0);
        const availableDogs = this.dogs.filter((dog) => (
            dog && typeof dog.isRespondingToAlert === 'function' && !dog.isRespondingToAlert()
        ));

        this.cats.forEach((cat) => {
            if (!cat || typeof cat.hasAlert !== 'function') {
                return;
            }

            if (!cat.hasAlert()) {
                const responder = typeof cat.getAlertResponder === 'function' ? cat.getAlertResponder() : null;

                if (responder && typeof responder.clearAlertTarget === 'function') {
                    const cleared = responder.clearAlertTarget({ silent: true, time: timestamp });

                    if (cleared && typeof responder.scheduleNextMoveCheck === 'function') {
                        responder.scheduleNextMoveCheck(timestamp);
                    }
                }

                if (typeof cat.clearAlertResponder === 'function') {
                    cat.clearAlertResponder();
                }

                return;
            }

            const currentResponder = typeof cat.getAlertResponder === 'function' ? cat.getAlertResponder() : null;

            if (
                currentResponder &&
                typeof currentResponder.isRespondingToAlert === 'function' &&
                currentResponder.isRespondingToAlert() &&
                currentResponder.alertTarget === cat
            ) {
                return;
            }

            if (currentResponder && typeof cat.clearAlertResponder === 'function') {
                cat.clearAlertResponder();
            }

            const assignedDog = this.findClosestAvailableDog(cat, availableDogs);

            if (!assignedDog) {
                return;
            }

            if (typeof assignedDog.setAlertTarget === 'function') {
                assignedDog.setAlertTarget(cat, timestamp);
            }

            if (typeof cat.assignAlertResponder === 'function') {
                cat.assignAlertResponder(assignedDog);
            }

            const index = availableDogs.indexOf(assignedDog);

            if (index >= 0) {
                availableDogs.splice(index, 1);
            }
        });

        this.dogs.forEach((dog) => {
            if (!dog || typeof dog.isRespondingToAlert !== 'function' || !dog.isRespondingToAlert()) {
                return;
            }

            const targetCat = dog.alertTarget;
            const catHasAlert = targetCat && typeof targetCat.hasAlert === 'function'
                ? targetCat.hasAlert()
                : Boolean(targetCat?.alertDetails);

            if (!catHasAlert) {
                const cleared = dog.clearAlertTarget({ silent: true, time: timestamp });

                if (cleared && typeof dog.scheduleNextMoveCheck === 'function') {
                    dog.scheduleNextMoveCheck(timestamp);
                }

                if (targetCat && typeof targetCat.clearAlertResponder === 'function') {
                    targetCat.clearAlertResponder(dog);
                }
            }
        });
    }

    handleNodeHover(nodeData) {
        if (!nodeData) {
            return;
        }

        this.activeHighlight = {
            id: typeof nodeData.id === 'string' ? nodeData.id : null,
            tileX: Number.isInteger(nodeData.tileX) ? nodeData.tileX : null,
            tileY: Number.isInteger(nodeData.tileY) ? nodeData.tileY : null,
            tileWidth: Number.isInteger(nodeData.tileWidth) ? Math.max(1, nodeData.tileWidth) : 1,
            tileHeight: Number.isInteger(nodeData.tileHeight) ? Math.max(1, nodeData.tileHeight) : 1,
            type: nodeData.type
        };

        this.drawHighlight(this.activeHighlight);
    }

    handleNodeHoverEnd() {
        this.activeHighlight = null;
        this.clearNodeHighlight();
    }

    async handleGridPointerUp(pointer, currentlyOver = []) {
        if (!this.grid || !pointer) {
            return;
        }

        if (this.imageModal && this.imageModal.isOpen()) {
            return;
        }

        if (Array.isArray(currentlyOver) && currentlyOver.length > 0) {
            const hasInteractiveTarget = currentlyOver.some((target) => target && target.input && target.input.enabled);

            if (hasInteractiveTarget) {
                return;
            }
        }

        const nativeEvent = pointer.event;

        if (nativeEvent && typeof nativeEvent.button === 'number' && nativeEvent.button !== 0) {
            return;
        }

        const worldX = typeof pointer.worldX === 'number' ? pointer.worldX : NaN;
        const worldY = typeof pointer.worldY === 'number' ? pointer.worldY : NaN;

        if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
            return;
        }

        if (worldX < 0 || worldY < 0) {
            return;
        }

        if (worldX >= this.grid.pixelWidth || worldY >= this.grid.pixelHeight) {
            return;
        }

        const tileX = Math.floor(worldX / this.grid.tileSize);
        const tileY = Math.floor(worldY / this.grid.tileSize);

        if (!Number.isInteger(tileX) || !Number.isInteger(tileY)) {
            return;
        }

        if (!this.grid.containsTile(tileX, tileY)) {
            return;
        }

        if (this.isTileBlockedForCat(tileX, tileY)) {
            return;
        }

        try {
            await this.imageModal.open({ tileX, tileY });
        } catch (error) {
            console.warn('Failed to open image classification modal', error);
        }
    }

    drawHighlight(nodeData) {
        if (!this.highlightGraphics || !this.grid) {
            return;
        }

        const tileX = Number.isInteger(nodeData?.tileX) ? nodeData.tileX : null;
        const tileY = Number.isInteger(nodeData?.tileY) ? nodeData.tileY : null;

        if (tileX === null || tileY === null) {
            this.clearNodeHighlight();
            return;
        }

        const tileWidth = Number.isInteger(nodeData.tileWidth) && nodeData.tileWidth > 0
            ? nodeData.tileWidth
            : 1;
        const tileHeight = Number.isInteger(nodeData.tileHeight) && nodeData.tileHeight > 0
            ? nodeData.tileHeight
            : 1;
        const color = nodeData.type === 'dog' ? 0xffd37d : 0x7cb7ff;
        const left = tileX * this.grid.tileSize;
        const top = tileY * this.grid.tileSize;
        const width = tileWidth * this.grid.tileSize;
        const height = tileHeight * this.grid.tileSize;

        this.highlightGraphics.clear();
        this.highlightGraphics.lineStyle(2, color, 0.95);
        this.highlightGraphics.strokeRect(left, top, width, height);
        this.highlightGraphics.fillStyle(color, 0.25);
        this.highlightGraphics.fillRect(left, top, width, height);
        this.highlightGraphics.setVisible(true);
    }

    clearNodeHighlight() {
        if (!this.highlightGraphics) {
            return;
        }

        this.highlightGraphics.clear();
        this.highlightGraphics.setVisible(false);
    }

    applyActiveHighlight() {
        if (!this.activeHighlight) {
            this.clearNodeHighlight();
            return;
        }

        this.drawHighlight(this.activeHighlight);
    }

    updateActiveHighlightFromNodes(nodes) {
        if (!this.activeHighlight) {
            return;
        }

        if (!Array.isArray(nodes) || nodes.length === 0) {
            this.handleNodeHoverEnd();
            return;
        }

        if (this.activeHighlight.id) {
            const match = nodes.find((node) => node.id === this.activeHighlight.id);

            if (!match) {
                this.handleNodeHoverEnd();
                return;
            }

            this.activeHighlight.tileX = Number.isInteger(match.tileX) ? match.tileX : this.activeHighlight.tileX;
            this.activeHighlight.tileY = Number.isInteger(match.tileY) ? match.tileY : this.activeHighlight.tileY;
            this.activeHighlight.tileWidth = Number.isInteger(match.tileWidth) && match.tileWidth > 0
                ? match.tileWidth
                : this.activeHighlight.tileWidth;
            this.activeHighlight.tileHeight = Number.isInteger(match.tileHeight) && match.tileHeight > 0
                ? match.tileHeight
                : this.activeHighlight.tileHeight;
            this.activeHighlight.type = match.type;
        }

        this.applyActiveHighlight();
    }

    handleRewardConsumption(time) {
        if (this.rewardMarkers.length === 0 || this.cats.length === 0) {
            return;
        }

        const remainingMarkers = [];

        this.rewardMarkers.forEach((marker) => {
            const matchingCat = this.cats.find((cat) => (
                cat.tileX === marker.tileX &&
                cat.tileY === marker.tileY
            ));

            if (matchingCat && typeof matchingCat.beginRewardJob === 'function') {
                matchingCat.beginRewardJob(time, marker);
                marker.destroy();
            } else {
                remainingMarkers.push(marker);
            }
        });

        this.rewardMarkers = remainingMarkers;
    }

    update(time) {
        if (this.isDemoSimulation) {
            this.manageDemoAlerts(time);
        }

        this.cats.forEach((cat) => cat.update(time));
        this.dogs.forEach((dog) => dog.update(time, this.cats));

        this.handleRewardConsumption(time);

        if (typeof time === 'number' && time >= this.nextStatusPanelUpdateTime) {
            this.refreshStatusPanel();
            this.nextStatusPanelUpdateTime = time + 500;
        }
    }

    handleResize(gameSize) {
        if (!this.grid) {
            return;
        }

        const { width, height } = gameSize || this.scale.gameSize;

        this.grid.updateLayout(width, height);

        this.physics.world.setBounds(0, 0, this.grid.pixelWidth, this.grid.pixelHeight);
        this.cameras.main.setBounds(0, 0, this.grid.pixelWidth, this.grid.pixelHeight);
        this.cameras.main.centerOn(this.grid.pixelWidth / 2, this.grid.pixelHeight / 2);

        this.cats.forEach((cat) => cat.onGridLayoutChanged());
        this.dogs.forEach((dog) => dog.onGridLayoutChanged());
        this.rewardMarkers.forEach((reward) => reward.onGridLayoutChanged());

        this.positionWaitingText();
        if (this.statusPanel) {
            this.statusPanel.handleResize(gameSize || this.scale.gameSize);
        }

        this.applyActiveHighlight();
    }
}
