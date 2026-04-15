import { GAME_CONFIG } from '../config/gameConfig.js';

export class PlayerController {
    constructor(scene) {
        this.scene = scene;
        this.playerSpeed = GAME_CONFIG.player.speed;
        this.cursors = null;
        this.playerDirLine = null;
    }

    setup() {
        this.scene.player = this.scene.add.circle(
            GAME_CONFIG.player.spawn.x,
            GAME_CONFIG.player.spawn.y,
            GAME_CONFIG.player.radius,
            0xffffff
        );

        this.scene.physics.add.existing(this.scene.player);
        this.scene.player.body.setCollideWorldBounds(true);
        this.scene.player.body.setCircle(GAME_CONFIG.player.radius);
        this.scene.player.setDepth(101);

        this.playerDirLine = this.scene.add.graphics();
        this.playerDirLine.setDepth(101);

        this.cursors = this.scene.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D
        });

        this.scene.input.on('pointermove', pointer => {
            this.scene.mousePointer = pointer;
        });
    }

    update() {
        if (this.scene.player.isDead) {
            this.scene.player.body.setVelocity(0, 0);
            return;
        }

        let moveX = 0;
        let moveY = 0;
        if (this.cursors.left.isDown) moveX = -1;
        else if (this.cursors.right.isDown) moveX = 1;

        if (this.cursors.up.isDown) moveY = -1;
        else if (this.cursors.down.isDown) moveY = 1;

        this.scene.player.body.setVelocity(moveX, moveY);
        if (moveX !== 0 || moveY !== 0) {
            this.scene.player.body.velocity.normalize().scale(this.playerSpeed);
        }

        if (this.scene.mousePointer) {
            const worldPoint = this.scene.cameras.main.getWorldPoint(this.scene.mousePointer.x, this.scene.mousePointer.y);
            this.scene.player.rotation = Phaser.Math.Angle.Between(
                this.scene.player.x,
                this.scene.player.y,
                worldPoint.x,
                worldPoint.y
            );
        }

        this.playerDirLine.clear();
        this.playerDirLine.lineStyle(2, 0xff0000);
        this.playerDirLine.beginPath();
        this.playerDirLine.moveTo(this.scene.player.x, this.scene.player.y);
        this.playerDirLine.lineTo(
            this.scene.player.x + Math.cos(this.scene.player.rotation) * 20,
            this.scene.player.y + Math.sin(this.scene.player.rotation) * 20
        );
        this.playerDirLine.strokePath();

        this.checkGhostCollision();
    }

    checkGhostCollision() {
        if (!this.scene.ghost || !this.scene.ghostVisual) return;
        if (this.scene.ghost.state !== 'HUNT') return;
        if (this.scene.ghost.floorIndex !== this.scene.currentFloorIndex) return;

        const dist = Phaser.Math.Distance.Between(
            this.scene.player.x,
            this.scene.player.y,
            this.scene.ghost.x,
            this.scene.ghost.y
        );

        if (dist <= 28) {
            this.triggerDeath();
        }
    }

    triggerDeath() {
        if (this.scene.player.isDead) return;

        this.scene.player.isDead = true;
        this.scene.player.setTint(0xff0000);
        this.scene.player.body.setVelocity(0, 0);
        this.scene.cameras.main.shake(500, 0.05);
        this.scene.time.delayedCall(700, () => this.scene.scene.restart());
    }
}
