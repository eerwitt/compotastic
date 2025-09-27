import Phaser, { Scene } from 'phaser';
import { SimulationStatusPanel } from './SimulationStatusPanel';

const DEFAULT_CAT_COUNT = 10;
const DEFAULT_DOG_COUNT = 1;

const DOG_FONT_STYLE = { fontFamily: 'Courier', fontSize: 30, color: '#f5deb3ff', align: 'center', fontStyle: 'bold' };

const CAT_FACE = '^.^';
const CAT_FONT_STYLE = { fontFamily: 'Courier', fontSize: 32, color: '#e27272ff', fontStyle: 'bold' };
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

const CAT_BLINK_INTERVAL_RANGE = { min: 2800, max: 5200 };
const CAT_BLINK_DURATION = 250;
const CAT_MOUTH_INTERVAL_RANGE = { min: 3400, max: 6800 };
const CAT_MOUTH_OPEN_DURATION = 820;

const DOG_BLINK_INTERVAL_RANGE = { min: 3200, max: 6100 };
const DOG_BLINK_DURATION = 270;
const DOG_TONGUE_INTERVAL_RANGE = { min: 2600, max: 4800 };
const DOG_TONGUE_OUT_DURATION = 2600;
const DOG_EYES_OPEN = 'o.o';
const DOG_EYES_BLINK = '-.-';
const DOG_MOUTH_IDLE = '^';
const DOG_MOUTH_TONGUE = 'U';
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

        this.attributes = { ...attributes };
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

        this.text.on('pointerover', this.showAttributesModal, this);
        this.text.on('pointerout', this.hideAttributesModal, this);

        this.onGridLayoutChanged();
        const initialTime = scene.time.now || 0;
        this.scheduleNextBlink(initialTime, { usePhaseOffset: true });
        this.scheduleNextMouthOpen(initialTime, { usePhaseOffset: true });
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
        const lines = [
            `CPU: ${this.attributes.cpu}`,
            `RAM: ${this.attributes.ram}`,
            `LOC: (${this.tileX}, ${this.tileY})`
        ];

        if (this.nodeIdentifier) {
            lines.unshift(`Node: ${this.nodeIdentifier}`);
        }

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
        this.nextBlinkTime = time + getRandomEventDelay(CAT_BLINK_INTERVAL_RANGE, usePhaseOffset);
    }

    scheduleNextMouthOpen(time, options = {}) {
        const { usePhaseOffset = false } = options;
        this.nextMouthOpenTime = time + getRandomEventDelay(CAT_MOUTH_INTERVAL_RANGE, usePhaseOffset);
    }

    beginBlink(time) {
        this.isBlinking = true;
        this.blinkEndTime = time + CAT_BLINK_DURATION;
    }

    beginMouthOpen(time) {
        this.isMouthOpen = true;
        this.mouthEndTime = time + CAT_MOUTH_OPEN_DURATION;
    }

    applyCurrentFace() {
        const targetFace = this.isBlinking
            ? CAT_BLINK_FACE
            : (this.isMouthOpen ? CAT_MOUTH_FACE : CAT_FACE);

        if (targetFace !== this.currentFace) {
            this.currentFace = targetFace;
            this.text.setText(this.currentFace);
            this.scaleToTile();
        }
    }

    updateFacialAnimations(time) {
        const currentTime = typeof time === 'number' ? time : 0;

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

        this.applyCurrentFace();
    }

    lookAround(time) {
        if (this.isMoving) {
            return;
        }

        const availableDirections = DIRECTIONS.filter((direction) => {
            const nextTileX = this.tileX + direction.x;
            const nextTileY = this.tileY + direction.y;

            if (!this.grid.containsTile(nextTileX, nextTileY)) {
                return false;
            }

            return !this.scene.isTileBlockedForCat(nextTileX, nextTileY, this);
        });

        if (availableDirections.length === 0) {
            this.scheduleNextLook(time);
            return;
        }

        const selectedDirection = Phaser.Utils.Array.GetRandom(availableDirections);

        this.targetTileX = this.tileX + selectedDirection.x;
        this.targetTileY = this.tileY + selectedDirection.y;

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
    }

    update(time) {
        this.updateFacialAnimations(time);

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
        this.nextLookTime = time + Phaser.Math.Between(LOOK_INTERVAL_RANGE.min, LOOK_INTERVAL_RANGE.max);
    }

    onGridLayoutChanged() {
        this.scaleToTile();
        this.setPosition(this.tileX, this.tileY);
        this.isMoving = false;
        this.scheduleNextLook(this.scene.time.now || 0);
        if (this.modal.visible) {
            this.modal.setText(this.buildModalContent());
            this.updateModalPosition();
        }
    }

    destroy() {
        this.text.destroy();
        this.modal.destroy();
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
        this.nodeIdentifier = (typeof identifier === 'string' && identifier.trim().length > 0)
            ? identifier.trim()
            : null;

        this.text.on('pointerover', this.showAttributesModal, this);
        this.text.on('pointerout', this.hideAttributesModal, this);

        this.onGridLayoutChanged();
        const initialTime = scene.time.now || 0;
        this.scheduleNextBlink(initialTime, { usePhaseOffset: true });
        this.scheduleNextTongue(initialTime, { usePhaseOffset: true });
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

    beginMovement(tileX, tileY, time) {
        const targetPosition = this.computeAreaCenter(tileX, tileY);

        this.startPixelX = this.text.x;
        this.startPixelY = this.text.y;
        this.targetTileX = tileX;
        this.targetTileY = tileY;
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
    }

    buildModalContent() {
        const lines = [];

        if (this.nodeIdentifier) {
            lines.push(`Node: ${this.nodeIdentifier}`);
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

    update(time, cats) {
        this.updateFacialAnimations(time);

        if (this.isMoving) {
            const elapsed = time - this.moveStartTime;
            const progress = this.moveDuration > 0 ? Phaser.Math.Clamp(elapsed / this.moveDuration, 0, 1) : 1;

            const currentX = Phaser.Math.Linear(this.startPixelX, this.targetPixelX, progress);
            const currentY = Phaser.Math.Linear(this.startPixelY, this.targetPixelY, progress);

            this.text.setPosition(currentX, currentY);

            if (this.modal.visible) {
                this.modal.setText(this.buildModalContent());
                this.updateModalPosition();
            }

            if (progress >= 1) {
                this.isMoving = false;
                this.setPosition(this.targetTileX, this.targetTileY);
                this.scheduleNextMoveCheck(time);
            }

            return;
        }

        if (this.modal.visible) {
            this.modal.setText(this.buildModalContent());
            this.updateModalPosition();
        }

        if (time < this.nextMoveCheckTime) {
            return;
        }

        this.scheduleNextMoveCheck(time);

        if (!cats || cats.length === 0) {
            return;
        }

        if (Phaser.Math.FloatBetween(0, 1) > DOG_MOVE_PROBABILITY) {
            return;
        }

        const targetCat = this.findClosestCat(cats);
        const move = this.determineStepToward(targetCat);

        if (!move) {
            return;
        }

        this.beginMovement(this.tileX + move.x, this.tileY + move.y, time);
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

        this.handleResize = this.handleResize.bind(this);
        this.handleSimulationData = this.handleSimulationData.bind(this);
        this.handleNodeHover = this.handleNodeHover.bind(this);
        this.handleNodeHoverEnd = this.handleNodeHoverEnd.bind(this);
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

        return {
            grid: { width, height },
            cats,
            dogs
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
    }

    clearAnimals() {
        this.cats.forEach((cat) => cat.destroy());
        this.dogs.forEach((dog) => dog.destroy());

        this.cats = [];
        this.dogs = [];
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

        this.lastSimulationUpdate = Date.now();
        this.refreshStatusPanel();
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
            isActive: this.isCatActive(cat)
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
            isActive: this.isDogActive(dog)
        };
    }

    determineCatStatus(cat) {
        if (!cat) {
            return 'Idle';
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
        return Boolean(cat && (cat.isMoving || cat.isMouthOpen));
    }

    isDogActive(dog) {
        return Boolean(dog && (dog.isMoving || dog.isTongueOut));
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

    update(time) {
        this.cats.forEach((cat) => cat.update(time));
        this.dogs.forEach((dog) => dog.update(time, this.cats));

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

        this.positionWaitingText();
        if (this.statusPanel) {
            this.statusPanel.handleResize(gameSize || this.scale.gameSize);
        }

        this.applyActiveHighlight();
    }
}
