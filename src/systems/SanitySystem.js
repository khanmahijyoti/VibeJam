import { GAME_CONFIG } from '../config/gameConfig.js';
import { playroomService } from '../services/PlayroomService.js';

export class SanitySystem {
    constructor(scene) {
        this.scene = scene;
    }

    update() {
        const roomName = this.getCurrentRoomName();
        this.scene.hud.setRoomName(roomName);

        if (this.isPlayerInVan()) {
            this.scene.sanity = Phaser.Math.Clamp(
                this.scene.sanity + GAME_CONFIG.sanity.recoveryInLight,
                0,
                100
            );
            this.scene.hud.setSanity(this.scene.sanity);
            return;
        }

        const isHuntActive = this.scene.ghost && this.scene.ghost.state === 'HUNT';
        const isLightOn = this.isPlayerInLitRoom();
        let drainRate = isLightOn
            ? -GAME_CONFIG.sanity.recoveryInLight
            : GAME_CONFIG.sanity.drainInDarkness;

        if (isHuntActive) {
            drainRate = GAME_CONFIG.sanity.drainInDarkness + 0.02;
        }

        this.scene.sanity = Phaser.Math.Clamp(this.scene.sanity - drainRate, 0, 100);
        this.scene.hud.setSanity(this.scene.sanity);
    }

    getAverageTeamSanity() {
        if (!this.scene.isCoopMode) {
            return this.scene.sanity;
        }

        const allPlayers = playroomService.getPlayers();
        let totalSanity = 0;
        let validPlayers = 0;

        for (const playerState of allPlayers) {
            const data = typeof playerState.getState === 'function'
                ? playerState.getState('playerData')
                : null;
            const playerSanity = data && data.sanity !== undefined ? data.sanity : 100;
            totalSanity += playerSanity;
            validPlayers++;
        }

        if (validPlayers === 0) {
            return this.scene.sanity;
        }

        return totalSanity / validPlayers;
    }

    getCurrentRoomName() {
        if (this.isPlayerInVan()) {
            return 'INVESTIGATION VAN';
        }

        let currentRoom = 'OUTSIDE';

        for (const room of this.scene.rooms) {
            const insideRoom =
                room.floorIndex === this.scene.currentFloorIndex
                && this.scene.player.x >= room.bounds.x
                && this.scene.player.x <= room.bounds.x + room.bounds.w
                && this.scene.player.y >= room.bounds.y
                && this.scene.player.y <= room.bounds.y + room.bounds.h;

            if (!insideRoom) continue;

            currentRoom = room.name.replace('_', ' ').toUpperCase();
            if (currentRoom === 'M BATH') currentRoom = 'MASTER BATH';
            if (currentRoom === 'M CLOSET') currentRoom = 'MASTER CLOSET';
            break;
        }

        return currentRoom;
    }

    isPlayerInLitRoom() {
        if (this.isPlayerInVan()) {
            return true;
        }

        for (const room of this.scene.rooms) {
            const insideLitRoom =
                room.isLit
                && room.floorIndex === this.scene.currentFloorIndex
                && this.scene.player.x >= room.bounds.x
                && this.scene.player.x <= room.bounds.x + room.bounds.w
                && this.scene.player.y >= room.bounds.y
                && this.scene.player.y <= room.bounds.y + room.bounds.h;

            if (insideLitRoom) return true;
        }

        return false;
    }

    isPlayerInVan() {
        if (!this.scene.vanBounds) return false;

        const van = this.scene.vanBounds;
        return this.scene.player.x >= van.x
            && this.scene.player.x <= van.x + van.w
            && this.scene.player.y >= van.y
            && this.scene.player.y <= van.y + van.h;
    }
}
