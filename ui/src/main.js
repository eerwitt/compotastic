import { Boot } from './scenes/Boot';
import { Simulation } from './scenes/Simulation';
import { Game } from 'phaser';
import { GameOver } from './scenes/GameOver';
import { MainMenu } from './scenes/MainMenu';
import { Preloader } from './scenes/Preloader';
import { ConnectionStatusOverlay } from './scenes/ConnectionStatusOverlay';

//  Find out more information about the Game Config at: https://newdocs.phaser.io/docs/3.70.0/Phaser.Types.Core.GameConfig
const computeSquareSize = () => Math.min(window.innerHeight, window.innerWidth);

const config = {
    type: Phaser.AUTO,
    width: computeSquareSize(),
    height: computeSquareSize(),
    parent: 'game-container',
    backgroundColor: '#028af8',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: {}
        }
    },
    scene: [
        Boot,
        Preloader,
        MainMenu,
        Simulation,
        GameOver,
        ConnectionStatusOverlay
    ]
};

const game = new Game(config);

const resizeGame = () => {
    const size = computeSquareSize();

    game.scale.setGameSize(size, size);
};

window.addEventListener('resize', resizeGame);

export default game;
