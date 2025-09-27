import { Scene } from 'phaser';

export class ConnectionStatusOverlay extends Scene
{
    constructor ()
    {
        super('ConnectionStatusOverlay');
    }

    create ()
    {
        const style = {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#00ff00',
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            padding: { x: 8, y: 4 }
        };

        this.statusText = this.add.text(this.scale.width - 16, this.scale.height - 16, 'connected', style)
            .setOrigin(1, 1)
            .setScrollFactor(0)
            .setDepth(1000)
            .setVisible(false);

        this.scale.on('resize', this.handleResize, this);
        this.events.once('shutdown', this.handleShutdown, this);
        this.events.once('destroy', this.handleShutdown, this);

        this.game.events.on('ws-connected', this.handleConnected, this);
        this.game.events.on('ws-disconnected', this.handleDisconnected, this);

        if (this.registry.get('wsConnected'))
        {
            this.handleConnected();
        }
    }

    handleResize (gameSize)
    {
        this.statusText.setPosition(gameSize.width - 16, gameSize.height - 16);
    }

    handleConnected ()
    {
        if (!this.statusText)
        {
            return;
        }

        this.statusText.setVisible(true);
    }

    handleDisconnected ()
    {
        if (!this.statusText)
        {
            return;
        }

        this.statusText.setVisible(false);
    }

    handleShutdown ()
    {
        this.scale.off('resize', this.handleResize, this);
        this.game.events.off('ws-connected', this.handleConnected, this);
        this.game.events.off('ws-disconnected', this.handleDisconnected, this);
    }
}
