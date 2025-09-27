import Phaser, { Scene } from 'phaser';

const DEFAULT_CAT_COUNT = 10;
const CAT_ASCII = '^.^';
const CAT_FONT_STYLE = { fontFamily: 'Courier', fontSize: 32, color: '#e27272ff' };
const CAT_TILE_PADDING_RATIO = 0.2;
const CAT_SPEED_RANGE = { min: 40, max: 140 };
const LOOK_INTERVAL_RANGE = { min: 800, max: 2200 };
const GRID_TILE_COUNT = { width: 250, height: 250 };
const GRID_LINE_COLOR = 0x615a3b;
const GRID_LINE_ALPHA = 0.2;

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

    destroy() {
        this.graphics.destroy();
    }
}

class Cat {
    constructor(scene, grid, tileX, tileY) {
        this.scene = scene;
        this.grid = grid;
        this.speed = Phaser.Math.Between(CAT_SPEED_RANGE.min, CAT_SPEED_RANGE.max);
        this.text = scene.add.text(0, 0, CAT_ASCII, CAT_FONT_STYLE);
        this.text.setOrigin(0.5, 0.5);

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

        this.onGridLayoutChanged();
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

    onGridLayoutChanged() {
        this.scaleToTile();
        this.setPosition(this.tileX, this.tileY);
        this.isMoving = false;
        this.scheduleNextLook(this.scene.time.now || 0);
    }
}

export class Simulation extends Scene {
    constructor() {
        super('Simulation');

        this.cats = [];
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
        });

        for (let i = 0; i < DEFAULT_CAT_COUNT; i++) {
            const tileX = Phaser.Math.Between(0, GRID_TILE_COUNT.width - 1);
            const tileY = Phaser.Math.Between(0, GRID_TILE_COUNT.height - 1);

            const cat = new Cat(this, this.grid, tileX, tileY);

            cat.lookAround(this.time.now || 0);
            this.cats.push(cat);
        }
    }

    update(time) {
        this.cats.forEach((cat) => cat.update(time));
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
    }
}
