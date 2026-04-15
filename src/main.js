import { MenuScene } from './scenes/MenuScene.js';
import { StartScene } from './scenes/StartScene.js';

const config = {
    type: Phaser.AUTO,
    title: 'Horror',
    parent: 'game-container',
    width: 1280,
    height: 720,
    backgroundColor: '#050505',
    pixelArt: false,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: [
        MenuScene,
        StartScene
    ],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
}

new Phaser.Game(config);
