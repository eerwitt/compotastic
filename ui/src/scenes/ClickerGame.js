import Phaser, { Scene } from 'phaser';

const DEFAULT_CAT_COUNT = 10;
const CAT_ASCII = '=^.^=';
const CAT_FONT_STYLE = { fontFamily: 'Courier', fontSize: 32, color: '#000000' };
const CAT_SPEED_RANGE = { min: 40, max: 140 };
const LOOK_INTERVAL_RANGE = { min: 800, max: 2200 };

class Cat
{
    constructor (scene, x, y)
    {
        this.scene = scene;
        this.text = scene.add.text(x, y, CAT_ASCII, CAT_FONT_STYLE);
        this.text.setOrigin(0, 0);

        scene.physics.add.existing(this.text);

        this.body = this.text.body;

        this.body.setAllowGravity(false);
        this.body.setCollideWorldBounds(true);
        this.body.setBounce(1, 1);
        this.body.setImmovable(false);

        this.body.setSize(this.text.width, this.text.height);

        this.nextLookTime = scene.time.now || 0;
    }

    setPosition (x, y)
    {
        this.text.setPosition(x, y);

        if (this.body)
        {
            this.body.reset(x, y);
        }
    }

    lookAround (time)
    {
        const speed = Phaser.Math.Between(CAT_SPEED_RANGE.min, CAT_SPEED_RANGE.max);
        const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);

        const velocityX = Math.cos(angle) * speed;
        const velocityY = Math.sin(angle) * speed;

        this.body.setVelocity(velocityX, velocityY);

        this.nextLookTime = time + Phaser.Math.Between(LOOK_INTERVAL_RANGE.min, LOOK_INTERVAL_RANGE.max);
    }

    update (time)
    {
        if (time >= this.nextLookTime)
        {
            this.lookAround(time);
        }
    }
}

export class ClickerGame extends Scene
{
    constructor ()
    {
        super('ClickerGame');

        this.cats = [];
    }

    preload ()
    {
        //  No external assets required for the ASCII cats.
    }

    create ()
    {
        this.cameras.main.setBackgroundColor('#bfcc00');

        this.catsGroup = this.physics.add.group();

        for (let i = 0; i < DEFAULT_CAT_COUNT; i++)
        {
            const cat = new Cat(this, 0, 0);

            const x = Phaser.Math.Between(0, Math.max(0, this.scale.width - cat.body.width));
            const y = Phaser.Math.Between(0, Math.max(0, this.scale.height - cat.body.height));

            cat.setPosition(x, y);
            cat.lookAround(this.time.now || 0);

            this.catsGroup.add(cat.text);
            this.cats.push(cat);
        }

        this.physics.add.collider(this.catsGroup, this.catsGroup);
    }

    update (time)
    {
        this.cats.forEach((cat) => cat.update(time));
    }
}
