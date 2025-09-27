import Phaser, { Scene } from 'phaser';

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
    constructor(scene, grid, tileX, tileY, attributes) {
        this.scene = scene;
        this.grid = grid;
        this.speed = Phaser.Math.Between(CAT_SPEED_RANGE.min, CAT_SPEED_RANGE.max);
        this.currentFace = CAT_FACE;
        this.text = scene.add.text(0, 0, this.currentFace, CAT_FONT_STYLE);
        this.text.setOrigin(0.5, 0.5);
        this.text.setDepth(5);
        this.text.setInteractive({ useHandCursor: true });

        this.attributes = { ...attributes };
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
        this.scheduleNextBlink(scene.time.now || 0);
        this.scheduleNextMouthOpen(scene.time.now || 0);
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

    scheduleNextBlink(time) {
        this.nextBlinkTime = time + Phaser.Math.Between(
            CAT_BLINK_INTERVAL_RANGE.min,
            CAT_BLINK_INTERVAL_RANGE.max
        );
    }

    scheduleNextMouthOpen(time) {
        this.nextMouthOpenTime = time + Phaser.Math.Between(
            CAT_MOUTH_INTERVAL_RANGE.min,
            CAT_MOUTH_INTERVAL_RANGE.max
        );
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

        const availableDirections = DIRECTIONS.filter((direction) =>
            this.grid.containsTile(this.tileX + direction.x, this.tileY + direction.y)
        );

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
    }
}

class Dog {
    constructor(scene, grid, tileX, tileY) {
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

        this.text.on('pointerover', this.showAttributesModal, this);
        this.text.on('pointerout', this.hideAttributesModal, this);

        this.onGridLayoutChanged();
        this.scheduleNextBlink(scene.time.now || 0);
        this.scheduleNextTongue(scene.time.now || 0);
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
        const lines = [
            `SPD: ${Math.round(this.speed)}`,
        ];

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

    scheduleNextBlink(time) {
        this.nextBlinkTime = time + Phaser.Math.Between(
            DOG_BLINK_INTERVAL_RANGE.min,
            DOG_BLINK_INTERVAL_RANGE.max
        );
    }

    scheduleNextTongue(time) {
        this.nextTongueTime = time + Phaser.Math.Between(
            DOG_TONGUE_INTERVAL_RANGE.min,
            DOG_TONGUE_INTERVAL_RANGE.max
        );
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

            if (this.grid.canFitArea(nextTileX, nextTileY, this.tileWidth, this.tileHeight)) {
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
    constructor() {
        super('Simulation');

        this.cats = [];
        this.dogs = [];
        this.grid = null;

        this.handleResize = this.handleResize.bind(this);
    }

    preload() {
        //  No external assets required for the ASCII cats.
    }

    create() {
        this.cameras.main.setBackgroundColor('#3c341bff');

        this.grid = new Grid(this, GRID_TILE_COUNT.width, GRID_TILE_COUNT.height);
        this.handleResize(this.scale.gameSize);
        this.scale.on('resize', this.handleResize);

        this.events.once('shutdown', () => {
            this.scale.off('resize', this.handleResize);

            if (this.grid) {
                this.grid.destroy();
                this.grid = null;
            }

            this.cats.forEach((cat) => cat.destroy());
            this.dogs.forEach((dog) => dog.destroy());
            this.cats = [];
            this.dogs = [];
        });

        const configuredCatCount = this.registry.get('catCount');
        const catCount = Number.isInteger(configuredCatCount) && configuredCatCount >= 0 ? configuredCatCount : DEFAULT_CAT_COUNT;
        const configuredDogCount = this.registry.get('dogCount');
        const dogCount = Number.isInteger(configuredDogCount) && configuredDogCount >= 0 ? configuredDogCount : DEFAULT_DOG_COUNT;

        const attributePool = Phaser.Utils.Array.Shuffle([...CAT_ATTRIBUTE_PRESETS]);

        for (let i = 0; i < catCount; i++) {
            const tileX = Phaser.Math.Between(0, GRID_TILE_COUNT.width - 1);
            const tileY = Phaser.Math.Between(0, GRID_TILE_COUNT.height - 1);

            const attributeIndex = i % attributePool.length;
            const catAttributes = { ...attributePool[attributeIndex] };

            const cat = new Cat(this, this.grid, tileX, tileY, catAttributes);

            cat.lookAround(this.time.now || 0);
            this.cats.push(cat);
        }

        const canPlaceDog =
            GRID_TILE_COUNT.width >= DOG_TILE_WIDTH && GRID_TILE_COUNT.height >= DOG_TILE_HEIGHT;

        if (canPlaceDog) {
            const maxDogTileX = GRID_TILE_COUNT.width - DOG_TILE_WIDTH;
            const maxDogTileY = GRID_TILE_COUNT.height - DOG_TILE_HEIGHT;

            for (let i = 0; i < dogCount; i++) {
                const tileX = Phaser.Math.Between(0, maxDogTileX);
                const tileY = Phaser.Math.Between(0, maxDogTileY);

                const dog = new Dog(this, this.grid, tileX, tileY);

                this.dogs.push(dog);
            }
        }
    }

    update(time) {
        this.cats.forEach((cat) => cat.update(time));
        this.dogs.forEach((dog) => dog.update(time, this.cats));
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
    }
}
