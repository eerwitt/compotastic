import Phaser, { Scene } from 'phaser';

const CELL_SIZE = 16;
const GRID_WIDTH = 40;
const GRID_HEIGHT = 30;

const UP = 0;
const DOWN = 1;
const LEFT = 2;
const RIGHT = 3;

class Food extends Phaser.GameObjects.Image
{
    constructor (scene, x, y)
    {
        super(scene, x * CELL_SIZE, y * CELL_SIZE, 'food');

        this.setOrigin(0);

        this.total = 0;

        scene.add.existing(this);
    }

    eat ()
    {
        this.total++;
    }
}

class Snake
{
    constructor (scene, x, y)
    {
        this.scene = scene;
        this.headPosition = new Phaser.Geom.Point(x, y);

        this.body = scene.add.group();

        this.head = this.body.create(x * CELL_SIZE, y * CELL_SIZE, 'body');
        this.head.setOrigin(0);

        this.alive = true;

        this.speed = 100;

        this.moveTime = 0;

        this.tail = new Phaser.Geom.Point(x, y);

        this.heading = RIGHT;
        this.direction = RIGHT;
    }

    update (time)
    {
        if (time >= this.moveTime)
        {
            return this.move(time);
        }

        return true;
    }

    faceLeft ()
    {
        if (this.direction === UP || this.direction === DOWN)
        {
            this.heading = LEFT;
        }
    }

    faceRight ()
    {
        if (this.direction === UP || this.direction === DOWN)
        {
            this.heading = RIGHT;
        }
    }

    faceUp ()
    {
        if (this.direction === LEFT || this.direction === RIGHT)
        {
            this.heading = UP;
        }
    }

    faceDown ()
    {
        if (this.direction === LEFT || this.direction === RIGHT)
        {
            this.heading = DOWN;
        }
    }

    move (time)
    {
        switch (this.heading)
        {
            case LEFT:
                this.headPosition.x = Phaser.Math.Wrap(this.headPosition.x - 1, 0, GRID_WIDTH);
                break;

            case RIGHT:
                this.headPosition.x = Phaser.Math.Wrap(this.headPosition.x + 1, 0, GRID_WIDTH);
                break;

            case UP:
                this.headPosition.y = Phaser.Math.Wrap(this.headPosition.y - 1, 0, GRID_HEIGHT);
                break;

            case DOWN:
                this.headPosition.y = Phaser.Math.Wrap(this.headPosition.y + 1, 0, GRID_HEIGHT);
                break;

            default:
                break;
        }

        this.direction = this.heading;

        Phaser.Actions.ShiftPosition(
            this.body.getChildren(),
            this.headPosition.x * CELL_SIZE,
            this.headPosition.y * CELL_SIZE,
            1,
            this.tail
        );

        const hitBody = Phaser.Actions.GetFirst(this.body.getChildren(), { x: this.head.x, y: this.head.y }, 1);

        if (hitBody)
        {
            this.alive = false;

            return false;
        }

        this.moveTime = time + this.speed;

        return true;
    }

    grow ()
    {
        const newPart = this.body.create(this.tail.x, this.tail.y, 'body');

        newPart.setOrigin(0);
    }

    collideWithFood (food)
    {
        if (this.head.x === food.x && this.head.y === food.y)
        {
            this.grow();

            food.eat();

            if (this.speed > 20 && food.total % 5 === 0)
            {
                this.speed -= 5;
            }

            return true;
        }

        return false;
    }

    updateGrid (grid)
    {
        this.body.children.each((segment) =>
        {
            const bx = segment.x / CELL_SIZE;
            const by = segment.y / CELL_SIZE;

            grid[by][bx] = false;
        });

        return grid;
    }
}

export class ClickerGame extends Scene
{
    constructor ()
    {
        super('ClickerGame');

        this.gameOverHandled = false;
    }

    preload ()
    {
        this.load.setBaseURL('https://cdn.phaserfiles.com/v385');
        this.load.image('food', 'assets/games/snake/food.png');
        this.load.image('body', 'assets/games/snake/body.png');
    }

    create ()
    {
        this.cameras.main.setBackgroundColor('#bfcc00');

        this.food = new Food(this, 3, 4);

        this.snake = new Snake(this, 8, 8);

        this.cursors = this.input.keyboard.createCursorKeys();

        this.gameOverHandled = false;
    }

    update (time)
    {
        if (!this.snake.alive)
        {
            if (!this.gameOverHandled)
            {
                this.handleGameOver();
            }

            return;
        }

        if (this.cursors.left.isDown)
        {
            this.snake.faceLeft();
        }
        else if (this.cursors.right.isDown)
        {
            this.snake.faceRight();
        }
        else if (this.cursors.up.isDown)
        {
            this.snake.faceUp();
        }
        else if (this.cursors.down.isDown)
        {
            this.snake.faceDown();
        }

        if (this.snake.update(time) && this.snake.collideWithFood(this.food))
        {
            if (!this.repositionFood())
            {
                this.handleGameOver();
            }
        }
    }

    repositionFood ()
    {
        const testGrid = [];

        for (let y = 0; y < GRID_HEIGHT; y++)
        {
            testGrid[y] = [];

            for (let x = 0; x < GRID_WIDTH; x++)
            {
                testGrid[y][x] = true;
            }
        }

        this.snake.updateGrid(testGrid);

        const validLocations = [];

        for (let y = 0; y < GRID_HEIGHT; y++)
        {
            for (let x = 0; x < GRID_WIDTH; x++)
            {
                if (testGrid[y][x])
                {
                    validLocations.push({ x, y });
                }
            }
        }

        if (validLocations.length > 0)
        {
            const pos = Phaser.Math.RND.pick(validLocations);

            this.food.setPosition(pos.x * CELL_SIZE, pos.y * CELL_SIZE);

            return true;
        }

        return false;
    }

    handleGameOver ()
    {
        this.gameOverHandled = true;

        const totalFood = this.food.total;
        const highscore = this.registry.get('highscore');

        if (typeof highscore === 'number')
        {
            if (totalFood > highscore)
            {
                this.registry.set('highscore', totalFood);
            }
        }
        else
        {
            this.registry.set('highscore', totalFood);
        }

        this.time.delayedCall(1000, () => this.scene.start('GameOver'));
    }
}
