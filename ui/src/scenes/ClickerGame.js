import { Scene } from 'phaser';
import { getWebSocketUrl } from '../config';

export class ClickerGame extends Scene
{
    constructor ()
    {
        super('ClickerGame');

        this.initialCoinCount = 32;
    }

    create ()
    {
        this.score = 0;

        this.coins = [];

        this.socket = null;
        this.timer = null;

        const textStyle = { fontFamily: 'Arial Black', fontSize: 38, color: '#ffffff', stroke: '#000000', strokeThickness: 8 };

        this.add.image(512, 384, 'background');

        this.scoreText = this.add.text(32, 32, 'Coins: 0', textStyle).setDepth(1);
        this.timeText = this.add.text(1024 - 32, 32, 'Time: 10', textStyle).setOrigin(1, 0).setDepth(1);

        this.physics.world.setBounds(0, -400, 1024, 768 + 310);

        this.input.on('gameobjectdown', (pointer, gameObject) => this.clickCoin(gameObject));

        this.events.once('shutdown', () => this.closeSocket());
        this.events.once('destroy', () => this.closeSocket());

        this.connectToApi();
    }

    connectToApi ()
    {
        const url = getWebSocketUrl();

        let socket;

        try
        {
            socket = new WebSocket(url);
        }
        catch (error)
        {
            console.error('Failed to initialise the WebSocket connection.', error);
            return;
        }

        this.socket = socket;

        socket.addEventListener('open', () =>
        {
            console.info(`Connected to WebSocket at ${url}`);
            this.startGame();
        });

        socket.addEventListener('close', (event) =>
        {
            console.info('WebSocket connection closed.', event);
        });

        socket.addEventListener('error', (event) =>
        {
            console.error('WebSocket error encountered.', event);
        });
    }

    startGame ()
    {
        this.startTimer();

        for (let i = 0; i < this.initialCoinCount; i++)
        {
            this.dropCoin();
        }
    }

    startTimer ()
    {
        if (this.timer)
        {
            this.timer.remove();
        }

        this.timer = this.time.addEvent({ delay: 10000, callback: () => this.gameOver() });
    }

    closeSocket ()
    {
        if (this.socket)
        {
            this.socket.close();
            this.socket = null;
        }
    }

    dropCoin ()
    {
        const x = Phaser.Math.Between(128, 896);
        const y = Phaser.Math.Between(0, -400);

        const coin = this.physics.add.sprite(x, y, 'coin').play('rotate');

        coin.setVelocityX(Phaser.Math.Between(-400, 400));
        coin.setCollideWorldBounds(true);
        coin.setBounce(0.9);
        coin.setInteractive();

        this.coins.push(coin);
    }

    clickCoin (coin)
    {
        //  Disable the coin from being clicked
        coin.disableInteractive();

        //  Stop it from moving
        coin.setVelocity(0, 0);

        //  Play the 'vanish' animation
        coin.play('vanish');

        coin.once('animationcomplete-vanish', () => coin.destroy());

        //  Add 1 to the score
        this.score++;

        //  Update the score text
        this.scoreText.setText('Coins: ' + this.score);

        //  Drop a new coin
        this.dropCoin();
    }

    update ()
    {
        if (this.timer)
        {
            this.timeText.setText('Time: ' + Math.ceil(this.timer.getRemainingSeconds()));
        }
    }

    gameOver ()
    {
        this.coins.forEach((coin) => {

            if (coin.active)
            {
                coin.setVelocity(0, 0);

                coin.play('vanish');
            }

        });

        this.input.off('gameobjectdown');

        //  Save our highscore to the registry
        const highscore = this.registry.get('highscore');

        if (this.score > highscore)
        {
            this.registry.set('highscore', this.score);
        }

        //  Swap to the GameOver scene after a 2 second delay
        this.time.delayedCall(2000, () => this.scene.start('GameOver'));
    }
}
