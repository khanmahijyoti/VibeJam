import { GAME_CONFIG } from '../config/gameConfig.js';

export class EvidenceSystem {
    constructor(scene) {
        this.scene = scene;
        this.ghostRoom = null;
    }

    setGhostRoom(room) {
        this.ghostRoom = room;
    }

    createMark(x, y, rotation, floorIndex) {
        const container = this.scene.add.container(x, y);
        container.setDepth(20);
        container.rotation = rotation;

        const color = 0x39ff14;
        container.add(this.scene.add.ellipse(0, 5, 10, 14, color));
        container.add(this.scene.add.circle(-8, -4, 3, color));
        container.add(this.scene.add.circle(-4, -10, 3, color));
        container.add(this.scene.add.circle(3, -11, 3, color));
        container.add(this.scene.add.circle(8, -7, 3, color));

        container.setAlpha(0);
        container.floorIndex = floorIndex;
        this.scene.fingerprints.push(container);
    }

    createEmfSource(x, y, level, floorIndex, durationMs = null) {
        let finalLevel = level;
        
        // EMF 5 Upgrade Rule: 33% chance if ghost has EMF 5 evidence
        if (level >= 2 && level <= 3) {
            const hasEmf5 = this.scene.ghost && this.scene.ghost.hasEmf5Evidence;
            if (hasEmf5 && Math.random() < 0.33) {
                finalLevel = 5;
            }
        }

        const expiresAt = this.scene.time.now + (durationMs || GAME_CONFIG.evidence.emfSourceDurationMs);
        
        this.scene.emfSources.push({
            x, y, level: finalLevel, floorIndex, expiresAt
        });

        return finalLevel;
    }

    update(activeToolId) {
        const now = this.scene.time.now;
        this.scene.emfSources = this.scene.emfSources.filter(src => now < src.expiresAt);

        if (activeToolId === 'emf') {
            this.updateEmf();
        } else {
            this.scene.audioSystem.stopLoop('emf-5-warning');
            if (activeToolId === 'thermometer') {
                this.updateThermometer();
            }
        }

        this.updateUvMarks(activeToolId);
        this.updateDotsProjectors();
    }

    updateEmf() {
        let emfLevel = 1;
        const ghost = this.scene.ghost;
        const isHuntActive = ghost && ghost.state === 'HUNT';
        let isInterfering = false;

        // Hunt Unreliability: Flicker between 1-4 if ghost is close enough during hunt
        if (isHuntActive && ghost.floorIndex === this.scene.currentFloorIndex) {
            const distToGhost = Phaser.Math.Distance.Between(this.scene.player.x, this.scene.player.y, ghost.x, ghost.y);
            if (distToGhost < 300) { // Approx 10 meters in game scale
                isInterfering = true;
            }
        }

        if (isInterfering && Math.random() < 0.4) {
            emfLevel = Phaser.Math.Between(1, 4);
            this.scene.hud.setEmfLevel(emfLevel);
            this.scene.audioSystem.stopLoop('emf-5-warning'); // Hunt noise overrides EMF 5
            return;
        }

        const range = GAME_CONFIG.evidence.emfRange;

        for (const source of this.scene.emfSources) {
            if (source.floorIndex !== this.scene.currentFloorIndex) continue;

            const dist = Phaser.Math.Distance.Between(
                this.scene.player.x,
                this.scene.player.y,
                source.x,
                source.y
            );

            if (dist < range && source.level > emfLevel) {
                emfLevel = source.level;
            }
        }

        // Ensure we don't show EMF 5 while interfering
        if (isInterfering && emfLevel === 5) {
            emfLevel = 4;
        }

        this.scene.hud.setEmfLevel(emfLevel);

        if (emfLevel === 5 && !isInterfering) {
            this.scene.audioSystem.playLoop('emf-5-warning');
        } else {
            this.scene.audioSystem.stopLoop('emf-5-warning');
        }
    }

    updateThermometer() {
        let targetTemp = this.scene.baseTemp;
        const hasFreezing = this.scene.activeGhostType && this.scene.activeGhostType.evidence.includes('thermometer');

        if (this.ghostRoom && this.scene.currentFloorIndex === this.ghostRoom.floorIndex) {
            const cx = this.ghostRoom.bounds.x + this.ghostRoom.bounds.w / 2;
            const cy = this.ghostRoom.bounds.y + this.ghostRoom.bounds.h / 2;
            const dist = Phaser.Math.Distance.Between(this.scene.player.x, this.scene.player.y, cx, cy);

            const inGhostRoom =
                this.scene.player.x >= this.ghostRoom.bounds.x
                && this.scene.player.x <= this.ghostRoom.bounds.x + this.ghostRoom.bounds.w
                && this.scene.player.y >= this.ghostRoom.bounds.y
                && this.scene.player.y <= this.ghostRoom.bounds.y + this.ghostRoom.bounds.h;

            if (inGhostRoom) {
                if (hasFreezing) {
                    targetTemp = Phaser.Math.Between(-20, 40) / 10; // -2.0C to 4.0C (Freezing)
                } else {
                    targetTemp = Phaser.Math.Between(70, 110) / 10; // 7.0C to 11.0C (Cold but not freezing)
                }
            } else if (dist < 400) {
                const falloff = Math.max(0, Math.min(1, (dist - 100) / 300));
                const edgeTemp = hasFreezing ? 4.0 : 10.0;
                targetTemp = edgeTemp + (falloff * (this.scene.baseTemp - edgeTemp));
            }
        }

        this.scene.currentTemp += (targetTemp - this.scene.currentTemp) * 0.05;
        this.scene.hud.setTemperature(this.scene.currentTemp);
    }

    isGhostInDotsZone(ghostX, ghostY, ghostFloorIndex) {
        if (ghostFloorIndex !== this.scene.currentFloorIndex) return false;

        for (const pickup of this.scene.equipmentPickups || []) {
            if (pickup.picked || pickup.floorIndex !== this.scene.currentFloorIndex) continue;
            if (!pickup.itemDef || pickup.itemDef.id !== 'dots') continue;

            const dist = Phaser.Math.Distance.Between(ghostX, ghostY, pickup.x, pickup.y);
            
            // Assuming DOTS project out in a cone or circle.
            // A simple 150px circle is easiest to read from any angle.
            if (dist < 150) {
                // If it's a cone, we'd check angle. Let's do a simple cone check.
                const angleToGhost = Phaser.Math.Angle.Between(pickup.x, pickup.y, ghostX, ghostY);
                const rotation = typeof pickup.rotation === 'number' ? pickup.rotation : -Math.PI / 2;
                const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(angleToGhost - rotation));
                
                if (angleDiff <= Math.PI / 4) { // 90 degree cone
                    return true;
                }
            }
        }
        return false;
    }

    updateDotsProjectors() {
        if (!this.scene.dotsGraphics) {
            this.scene.dotsGraphics = this.scene.add.graphics();
            this.scene.dotsGraphics.setDepth(101); // Above darkness overlay so it's visible in the dark
            this.scene.dotsGraphics.setBlendMode(Phaser.BlendModes.ADD); // Looks more like light
        }
        
        this.scene.dotsGraphics.clear();

        for (const pickup of this.scene.equipmentPickups || []) {
            if (pickup.picked || pickup.floorIndex !== this.scene.currentFloorIndex) continue;
            if (!pickup.itemDef || pickup.itemDef.id !== 'dots') continue;

            const rotation = typeof pickup.rotation === 'number' ? pickup.rotation : -Math.PI / 2;
            
            // Draw subtle green projector cone
            this.scene.dotsGraphics.fillStyle(0x00ff88, 0.15);
            this.scene.dotsGraphics.beginPath();
            this.scene.dotsGraphics.moveTo(pickup.x, pickup.y);
            this.scene.dotsGraphics.arc(
                pickup.x, pickup.y,
                150, 
                rotation - Math.PI / 4, 
                rotation + Math.PI / 4
            );
            this.scene.dotsGraphics.closePath();
            this.scene.dotsGraphics.fillPath();

            // Small glowing dot on the device
            this.scene.dotsGraphics.fillStyle(0x00ff88, 1);
            this.scene.dotsGraphics.fillCircle(pickup.x, pickup.y, 3);
        }
    }

    updateUvMarks(activeToolId) {
        const isUv = activeToolId === 'uv'
            && this.scene.isActiveUvEnabled
            && this.scene.isActiveUvEnabled();
        const uvRange = GAME_CONFIG.evidence.uvRange;
        const halfFov = GAME_CONFIG.evidence.uvFieldOfView / 2;

        const uvSources = [];
        if (isUv) {
            uvSources.push({
                x: this.scene.player.x,
                y: this.scene.player.y,
                rotation: this.scene.player.rotation,
                dropped: false
            });
        }

        for (const pickup of this.scene.equipmentPickups || []) {
            if (pickup.picked || pickup.floorIndex !== this.scene.currentFloorIndex) continue;
            if (!pickup.itemDef || pickup.itemDef.id !== 'uv') continue;
            if (!(pickup.uvOn === true || pickup.itemDef.uvOn === true)) continue;

            uvSources.push({
                x: pickup.x,
                y: pickup.y,
                rotation: typeof pickup.rotation === 'number' ? pickup.rotation : -Math.PI / 2,
                dropped: true
            });
        }

        for (const mark of this.scene.fingerprints) {
            if (mark.floorIndex !== this.scene.currentFloorIndex) {
                mark.alpha = 0;
                continue;
            }

            let targetAlpha = 0;

            for (const source of uvSources) {
                const dist = Phaser.Math.Distance.Between(source.x, source.y, mark.x, mark.y);
                if (dist >= uvRange) continue;

                if (source.dropped) {
                    targetAlpha = Math.max(targetAlpha, 0.9 * (1 - (dist / uvRange)));
                    continue;
                }

                const angleToMark = Phaser.Math.Angle.Between(source.x, source.y, mark.x, mark.y);
                const angleDiff = Phaser.Math.Angle.Wrap(angleToMark - source.rotation);

                if (Math.abs(angleDiff) <= halfFov) {
                    targetAlpha = Math.max(targetAlpha, 0.9 * (1 - (dist / uvRange)));
                }
            }

            mark.alpha += (targetAlpha - mark.alpha) * 0.15;
        }
    }
}
