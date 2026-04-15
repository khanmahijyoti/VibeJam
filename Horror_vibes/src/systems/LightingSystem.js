import { GAME_CONFIG } from '../config/gameConfig.js';
import { getSegmentIntersection } from '../utils/geometry.js';

export class LightingSystem {
    constructor(scene) {
        this.scene = scene;
        this.nextRoomFlickerAt = 0;
        this.roomFlickerUntil = 0;
        this.nextFlashInterferenceAt = 0;
        this.flashInterferenceUntil = 0;
    }

    calcRaycastPoints(activeToolId) {
        const resolvedToolId = this.getResolvedActiveToolId(activeToolId);
        const canUseFlashlight = this.scene.hasFlashlightInInventory
            && this.scene.hasFlashlightInInventory()
            && this.scene.flashlightEnabled;
        const usingUvLight = resolvedToolId === 'uv'
            && this.scene.isActiveUvEnabled
            && this.scene.isActiveUvEnabled();
        const shouldProjectBeam = canUseFlashlight || usingUvLight;

        if (!shouldProjectBeam) {
            return [{ x: this.scene.player.x, y: this.scene.player.y }];
        }

        const wallSegments = this.buildWallSegments();

        const rayCount = GAME_CONFIG.lighting.rayCount;
        const fov = GAME_CONFIG.lighting.fieldOfView;
        const angleStep = fov / rayCount;
        const startAngle = this.scene.player.rotation - fov / 2;

        const rayLength = usingUvLight
            ? GAME_CONFIG.lighting.uvRayLength
            : GAME_CONFIG.lighting.defaultRayLength;

        return this.castBeamPoints(this.scene.player.x, this.scene.player.y, startAngle, angleStep, rayCount, rayLength, wallSegments);
    }

    render(points, activeToolId) {
        const resolvedToolId = this.getResolvedActiveToolId(activeToolId);
        const now = this.scene.time.now;
        const canUseFlashlight = this.scene.hasFlashlightInInventory
            && this.scene.hasFlashlightInInventory()
            && this.scene.flashlightEnabled;
        const usingUvLight = resolvedToolId === 'uv'
            && this.scene.isActiveUvEnabled
            && this.scene.isActiveUvEnabled();
        const hasFlashlightBeam = canUseFlashlight || usingUvLight;
        const isHuntActive = this.scene.ghost && this.scene.ghost.state === 'HUNT';
        const isFalseHuntActive = this.scene.falseHuntActive === true;
        const ghost = this.scene.ghost;
        const presence = this.scene.ghostPresence || { band: 'none', distance: Infinity, strength: 0 };

        const isNearPresence = presence.band !== 'none';

        const baseDarkness = GAME_CONFIG.lighting.darknessAlpha;
        const pulse = (Math.sin(now * 0.015) + 1) * 0.5;
        const huntDarkBoost = isHuntActive ? 0.02 : 0;
        const presenceDarkBoost = presence.strength * (0.03 + pulse * 0.025);
        const darkness = Phaser.Math.Clamp(baseDarkness + huntDarkBoost + presenceDarkBoost, 0.85, 0.995);
        this.scene.darknessOverlay.setAlpha(darkness);

        if (now >= this.nextRoomFlickerAt && (isNearPresence || isHuntActive || isFalseHuntActive)) {
            const strength = isHuntActive ? 1 : Math.max(presence.strength, isFalseHuntActive ? 0.35 : 0);
            const triggerChance = isHuntActive ? 0.5 : (0.08 + strength * 0.22);
            if (Math.random() < triggerChance) {
                const baseDuration = isHuntActive ? 130 : 90;
                const jitter = Phaser.Math.Between(0, isHuntActive ? 220 : 140);
                this.roomFlickerUntil = now + baseDuration + jitter;
            }

            const nextMin = isHuntActive ? 80 : 160;
            const nextMax = isHuntActive ? 220 : 360;
            this.nextRoomFlickerAt = now + Phaser.Math.Between(nextMin, nextMax);
        }

        this.scene.lightMaskGraphics.clear();
        
        // Brighter ambient for Van
        this.scene.lightMaskGraphics.fillStyle(0xffffff, 1);

        if (this.scene.vanBounds) {
            this.scene.lightMaskGraphics.fillRect(
                this.scene.vanBounds.x,
                this.scene.vanBounds.y,
                this.scene.vanBounds.w,
                this.scene.vanBounds.h
            );
        }

        // Fully lit ambient for rooms when lights are on
        this.scene.lightMaskGraphics.fillStyle(0xffffff, 1);

        for (const room of this.scene.rooms) {
            if (!room.isLit || room.floorIndex !== this.scene.currentFloorIndex) continue;

            if ((isNearPresence || isHuntActive || isFalseHuntActive) && ghost) {
                const roomCenterX = room.bounds.x + room.bounds.w / 2;
                const roomCenterY = room.bounds.y + room.bounds.h / 2;
                const distToGhost = Phaser.Math.Distance.Between(ghost.x, ghost.y, roomCenterX, roomCenterY);
                const influenceRange = isHuntActive ? 280 : 230;

                if (distToGhost < influenceRange && now < this.roomFlickerUntil) {
                    const flickerSkipChance = isHuntActive ? 0.7 : 0.45;
                    if (Math.random() < flickerSkipChance) {
                        continue;
                    }

                    const shutoffChance = isHuntActive ? 0.03 : 0.008;
                    if (Math.random() < shutoffChance) {
                        room.isLit = false;
                        continue;
                    }
                }
            }

            this.scene.lightMaskGraphics.fillRect(
                room.bounds.x,
                room.bounds.y,
                room.bounds.w,
                room.bounds.h
            );
        }

        if (hasFlashlightBeam && points.length > 1) {
            this.scene.lightMaskGraphics.fillStyle(0xffffff, 1);
            this.scene.lightMaskGraphics.beginPath();
            this.scene.lightMaskGraphics.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                this.scene.lightMaskGraphics.lineTo(points[i].x, points[i].y);
            }
            this.scene.lightMaskGraphics.closePath();
            this.scene.lightMaskGraphics.fillPath();
        }

        if (hasFlashlightBeam && now >= this.nextFlashInterferenceAt && (isNearPresence || isHuntActive || isFalseHuntActive)) {
            const interferenceChance = isHuntActive ? 0.35 : (0.06 + presence.strength * 0.2);
            if (Math.random() < interferenceChance) {
                const duration = isHuntActive
                    ? Phaser.Math.Between(80, 220)
                    : Phaser.Math.Between(50, 150);
                this.flashInterferenceUntil = now + duration;
            }

            const nextMin = isHuntActive ? 60 : 130;
            const nextMax = isHuntActive ? 180 : 320;
            this.nextFlashInterferenceAt = now + Phaser.Math.Between(nextMin, nextMax);
        }

        this.scene.flashlightTint.clear();
        let alpha = usingUvLight ? 0.45 : 0.15;

        if (!hasFlashlightBeam) {
            this.renderDroppedLights();
            return;
        }

        if (now < this.flashInterferenceUntil) {
            if (Math.random() < 0.18) {
                alpha = 0;
            } else {
                alpha *= Phaser.Math.FloatBetween(0.1, 0.45);
            }
        } else if (isHuntActive || isFalseHuntActive) {
            if (Math.random() < 0.25) alpha *= 0.35;
        }

        const baseColor = usingUvLight ? 0x7a20c9 : 0xfff0dd;
        const originX = points[0].x;
        const originY = points[0].y;

        const layers = [
            { scale: 1.0, alphaMult: 0.15 },
            { scale: 0.8, alphaMult: 0.3 },
            { scale: 0.5, alphaMult: 0.4 },
            { scale: 0.25, alphaMult: 0.8 }
        ];

        for (const layer of layers) {
            this.scene.flashlightTint.fillStyle(baseColor, alpha * layer.alphaMult);
            this.scene.flashlightTint.beginPath();
            this.scene.flashlightTint.moveTo(originX, originY);
            for (let i = 1; i < points.length; i++) {
                const px = originX + (points[i].x - originX) * layer.scale;
                const py = originY + (points[i].y - originY) * layer.scale;
                this.scene.flashlightTint.lineTo(px, py);
            }
            this.scene.flashlightTint.closePath();
            this.scene.flashlightTint.fillPath();
        }

        this.renderDroppedLights();
    }

    getResolvedActiveToolId(fallbackToolId) {
        const slotItem = this.scene.inventory && this.scene.inventory[this.scene.activeSlot];
        if (slotItem && slotItem.id) {
            return slotItem.id;
        }
        return fallbackToolId || null;
    }

    buildWallSegments() {
        let wallSegments = this.scene.staticWallSegments.filter(
            segment => segment.floorIndex === this.scene.currentFloorIndex
        );

        for (const door of this.scene.doors) {
            if (door.floorIndex !== this.scene.currentFloorIndex || door.isOpen) continue;

            const tl = door.getTopLeft();
            const tr = door.getTopRight();
            const bl = door.getBottomLeft();
            const br = door.getBottomRight();

            wallSegments.push(
                { x1: tl.x, y1: tl.y, x2: tr.x, y2: tr.y, isDoor: true },
                { x1: tr.x, y1: tr.y, x2: br.x, y2: br.y, isDoor: true },
                { x1: br.x, y1: br.y, x2: bl.x, y2: bl.y, isDoor: true },
                { x1: bl.x, y1: bl.y, x2: tl.x, y2: tl.y, isDoor: true }
            );
        }

        const expansion = 0.5;
        wallSegments = wallSegments.map(segment => {
            const segAngle = Math.atan2(segment.y2 - segment.y1, segment.x2 - segment.x1);
            const cosE = Math.cos(segAngle) * expansion;
            const sinE = Math.sin(segAngle) * expansion;

            return {
                x1: segment.x1 - cosE,
                y1: segment.y1 - sinE,
                x2: segment.x2 + cosE,
                y2: segment.y2 + sinE,
                isDoor: segment.isDoor
            };
        });

        return wallSegments;
    }

    castBeamPoints(originX, originY, startAngle, angleStep, rayCount, rayLength, wallSegments) {
        const points = [{ x: originX, y: originY }];
        const epsilon = 0.0001;

        for (let i = 0; i <= rayCount; i++) {
            const baseAngle = startAngle + i * angleStep;
            const anglesGroup = [baseAngle - epsilon, baseAngle, baseAngle + epsilon];

            for (const angle of anglesGroup) {
                const endX = originX + Math.cos(angle) * rayLength;
                const endY = originY + Math.sin(angle) * rayLength;

                let closestIntersect = null;
                let minT = 1;
                let hitDoor = false;

                for (const segment of wallSegments) {
                    const intersect = getSegmentIntersection(
                        originX,
                        originY,
                        endX,
                        endY,
                        segment.x1,
                        segment.y1,
                        segment.x2,
                        segment.y2
                    );

                    if (!intersect) continue;

                    const dist = Phaser.Math.Distance.Between(originX, originY, intersect.x, intersect.y);
                    const t = dist / rayLength;
                    if (t < minT) {
                        minT = t;
                        closestIntersect = intersect;
                        hitDoor = segment.isDoor === true;
                    }
                }

                if (!closestIntersect) {
                    points.push({
                        x: Math.round(endX * 100) / 100,
                        y: Math.round(endY * 100) / 100
                    });
                    continue;
                }

                let cx = closestIntersect.x;
                let cy = closestIntersect.y;
                if (hitDoor) {
                    cx += Math.cos(angle) * 15;
                    cy += Math.sin(angle) * 15;
                }

                points.push({
                    x: Math.round(cx * 100) / 100,
                    y: Math.round(cy * 100) / 100
                });
            }
        }

        return points;
    }

    renderDroppedLights() {
        if (!this.scene.equipmentPickups || this.scene.equipmentPickups.length === 0) return;

        const wallSegments = this.buildWallSegments();
        const rayCount = 28;
        const fov = GAME_CONFIG.lighting.fieldOfView;
        const angleStep = fov / rayCount;

        for (const pickup of this.scene.equipmentPickups) {
            if (pickup.picked || pickup.floorIndex !== this.scene.currentFloorIndex) continue;
            if (!pickup.itemDef) continue;

            const pickupFlashlightOn = pickup.flashlightOn === true || pickup.itemDef.flashlightOn === true;
            const pickupUvOn = pickup.uvOn === true || pickup.itemDef.uvOn === true;

            let lightColor = 0xfff0dd;
            let rayLength = GAME_CONFIG.lighting.defaultRayLength * 0.7;

            if (pickup.itemDef.id === 'flashlight' && pickupFlashlightOn) {
                lightColor = 0xfff0dd;
            } else if (pickup.itemDef.id === 'uv' && pickupUvOn) {
                lightColor = 0x7a20c9;
                rayLength = GAME_CONFIG.lighting.uvRayLength;
            } else {
                continue;
            }

            const startAngle = pickup.rotation - fov / 2;
            const dropPoints = this.castBeamPoints(
                pickup.x,
                pickup.y,
                startAngle,
                angleStep,
                rayCount,
                rayLength,
                wallSegments
            );

            if (dropPoints.length < 2) continue;

            this.scene.lightMaskGraphics.fillStyle(0xffffff, 1);
            this.scene.lightMaskGraphics.beginPath();
            this.scene.lightMaskGraphics.moveTo(dropPoints[0].x, dropPoints[0].y);
            for (let i = 1; i < dropPoints.length; i++) {
                this.scene.lightMaskGraphics.lineTo(dropPoints[i].x, dropPoints[i].y);
            }
            this.scene.lightMaskGraphics.closePath();
            this.scene.lightMaskGraphics.fillPath();

            const originX = dropPoints[0].x;
            const originY = dropPoints[0].y;
            const baseAlpha = pickup.itemDef.id === 'uv' ? 0.35 : 0.12;

            const layers = [
                { scale: 1.0, alphaMult: 0.15 },
                { scale: 0.8, alphaMult: 0.3 },
                { scale: 0.5, alphaMult: 0.4 },
                { scale: 0.25, alphaMult: 0.8 }
            ];

            for (const layer of layers) {
                this.scene.flashlightTint.fillStyle(lightColor, baseAlpha * layer.alphaMult);
                this.scene.flashlightTint.beginPath();
                this.scene.flashlightTint.moveTo(originX, originY);
                for (let i = 1; i < dropPoints.length; i++) {
                    const px = originX + (dropPoints[i].x - originX) * layer.scale;
                    const py = originY + (dropPoints[i].y - originY) * layer.scale;
                    this.scene.flashlightTint.lineTo(px, py);
                }
                this.scene.flashlightTint.closePath();
                this.scene.flashlightTint.fillPath();
            }
        }
    }
}
