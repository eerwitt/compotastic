import { Scene } from 'phaser';
import { ensureWebSocketManager } from '../network/WebSocketManager';

export class Boot extends Scene {
    constructor() {
        super('Boot');
    }

    preload() {
        //  The Boot Scene is typically used to load in any assets you require for your Preloader, such as a game logo or background.
        //  The smaller the file size of the assets, the better, as the Boot Scene itself has no preloader.

        this.load.image('preloader', 'assets/preloader.png');
    }

    create() {
        //  A global value to store the highscore in
        this.registry.set('highscore', 0);

        ensureWebSocketManager(this.game);

        if (!this.scene.isActive('ConnectionStatusOverlay')) {
            this.scene.launch('ConnectionStatusOverlay');
        }

        this.scene.start('Preloader');
    }
}
