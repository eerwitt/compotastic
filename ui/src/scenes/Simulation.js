import Phaser, { Scene } from 'phaser';

const DEFAULT_CAT_COUNT = 10;
const CAT_ASCII = '^.^';
const CAT_FONT_STYLE = { fontFamily: 'Courier', fontSize: 32, color: '#e27272ff' };
const CAT_TILE_PADDING_RATIO = 0.2;
const CAT_SPEED_RANGE = { min: 40, max: 140 };
const LOOK_INTERVAL_RANGE = { min: 800, max: 2200 };
const GRID_TILE_COUNT = { width: 250, height: 250 };
const GRID_TILE_SIZE = 32;
const GRID_COLOR = 0x615a3b;
const GRID_ALPHA = 0.2;

const DIRECTIONS = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 }
];

function tileToWorld(tileX, tileY) {
    return {
        x: tileX * GRID_TILE_SIZE + GRID_TILE_SIZE / 2,
        y: tileY * GRID_TILE_SIZE + GRID_TILE_SIZE / 2
    };
}

function isInsideGrid(tileX, tileY) {
    return (
        tileX >= 0 &&
        tileY >= 0 &&
        tileX < GRID_TILE_COUNT.width &&
        tileY < GRID_TILE_COUNT.height
    );
}

class Cat {
    constructor(scene, tileX, tileY) {
        this.scene = scene;
        this.speed = Phaser.Math.Between(CAT_SPEED_RANGE.min, CAT_SPEED_RANGE.max);
        this.text = scene.add.text(0, 0, CAT_ASCII, CAT_FONT_STYLE);
        this.text.setOrigin(0.5, 0.5);
        this.scaleToTile();

        this.tileX = tileX;
        this.tileY = tileY;
        this.setPosition(tileX, tileY);

        this.nextLookTime = scene.time.now || 0;
        this.isMoving = false;
        this.moveStartTime = 0;
        this.moveDuration = 0;
        this.startPixelX = 0;
        this.startPixelY = 0;
        this.targetTileX = tileX;
        this.targetTileY = tileY;
        this.targetPixelX = this.text.x;
        this.targetPixelY = this.text.y;
    }

    setPosition(tileX, tileY) {
        const position = tileToWorld(tileX, tileY);

        this.tileX = tileX;
        this.tileY = tileY;

        this.text.setPosition(position.x, position.y);
        this.targetPixelX = position.x;
        this.targetPixelY = position.y;
    }

    scaleToTile() {
        const horizontalPadding = GRID_TILE_SIZE * CAT_TILE_PADDING_RATIO;
        const verticalPadding = GRID_TILE_SIZE * CAT_TILE_PADDING_RATIO;
        const maxWidth = GRID_TILE_SIZE - horizontalPadding;
        const maxHeight = GRID_TILE_SIZE - verticalPadding;
        const textWidth = this.text.width;
        const textHeight = this.text.height;

        if (textWidth === 0 || textHeight === 0) {
            this.text.setScale(1);
            return;
        }

        const scale = Math.min(maxWidth / textWidth, maxHeight / textHeight);

        this.text.setScale(scale);
    }

    lookAround(time) {
        if (this.isMoving) {
            return;
        }

        const availableDirections = DIRECTIONS.filter((direction) =>
            isInsideGrid(this.tileX + direction.x, this.tileY + direction.y)
        );

        if (availableDirections.length === 0) {
            this.scheduleNextLook(time);
            return;
        }

        const selectedDirection = Phaser.Utils.Array.GetRandom(availableDirections);

        this.targetTileX = this.tileX + selectedDirection.x;
        this.targetTileY = this.tileY + selectedDirection.y;

        const targetPosition = tileToWorld(this.targetTileX, this.targetTileY);

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

            return;
        }

        if (time >= this.nextLookTime) {
            this.lookAround(time);
        }
    }

    scheduleNextLook(time) {
        this.nextLookTime = time + Phaser.Math.Between(LOOK_INTERVAL_RANGE.min, LOOK_INTERVAL_RANGE.max);
    }
}

export class Simulation extends Scene {
    constructor() {
        super('Simulation');

        this.cats = [];
    }

    preload() {
        //  No external assets required for the ASCII cats.
    }

    create() {
        this.cameras.main.setBackgroundColor('#3c341bff');

        this.gridPixelWidth = GRID_TILE_COUNT.width * GRID_TILE_SIZE;
        this.gridPixelHeight = GRID_TILE_COUNT.height * GRID_TILE_SIZE;

        this.physics.world.setBounds(0, 0, this.gridPixelWidth, this.gridPixelHeight);
        this.cameras.main.setBounds(0, 0, this.gridPixelWidth, this.gridPixelHeight);
        this.cameras.main.centerOn(this.gridPixelWidth / 2, this.gridPixelHeight / 2);

        this.drawGrid();

        for (let i = 0; i < DEFAULT_CAT_COUNT; i++) {
            const tileX = Phaser.Math.Between(0, GRID_TILE_COUNT.width - 1);
            const tileY = Phaser.Math.Between(0, GRID_TILE_COUNT.height - 1);

            const cat = new Cat(this, tileX, tileY);

            cat.lookAround(this.time.now || 0);
            this.cats.push(cat);
        }
    }

    update(time) {
        this.cats.forEach((cat) => cat.update(time));
    }

    drawGrid() {
        const graphics = this.add.graphics();
        graphics.lineStyle(1, GRID_COLOR, GRID_ALPHA);

        for (let x = 0; x <= GRID_TILE_COUNT.width; x++) {
            const positionX = x * GRID_TILE_SIZE;
            graphics.lineBetween(positionX, 0, positionX, this.gridPixelHeight);
        }

        for (let y = 0; y <= GRID_TILE_COUNT.height; y++) {
            const positionY = y * GRID_TILE_SIZE;
            graphics.lineBetween(0, positionY, this.gridPixelWidth, positionY);
        }
    }
}
