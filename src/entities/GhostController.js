import { getSegmentIntersection } from '../utils/geometry.js';

export class GhostController {
    constructor(scene) {
        this.scene = scene;
        this.ghost = null;
        this.ghostRoom = null;
        this.ghostVisual = null;
        this.pauseFrames = 0;
        this.behaviorDelayTicks = 0;
        this.falseHuntCooldown = 10;
        this.falseHuntEndsAt = 0;

        this.presenceThresholds = {
            far: 360,
            medium: 240,
            close: 150,
            veryClose: 90
        };

        this.audio = null;
        this.lastDetuneAt = 0;
        this.ghostWallCollider = null;
        this.ghostAwake = false;
        
        // For tracking ghost updates for broadcast in co-op
        this._lastBroadcastTime = 0;
        this._broadcastInterval = 100; // Broadcast every 100ms
    }

    setup() {
        this.ghostRoom = this.scene.rooms.find(r => r.name === 'master' && r.floorIndex === 0) || this.scene.rooms[0];
        if (!this.ghostRoom) return;

        const spawnX = this.ghostRoom.bounds.x + this.ghostRoom.bounds.w / 2;
        const spawnY = this.ghostRoom.bounds.y + this.ghostRoom.bounds.h / 2;

        this.ghostVisual = this.scene.add.ellipse(spawnX, spawnY, 20, 30, 0xbbffff, 0.5);
        this.ghostVisual.setAlpha(0);
        this.ghostVisual.setDepth(95);

        this.scene.physics.add.existing(this.ghostVisual);
        this.ghostVisual.body.setAllowGravity(false);
        this.ghostVisual.body.setCircle(10);
        this.ghostVisual.body.setCollideWorldBounds(true);

        this.ghostWallCollider = this.scene.physics.add.collider(
            this.ghostVisual,
            this.scene.walls,
            null,
            (_ghostObj, wallObj) => !this.isDoorCollider(wallObj),
            this
        );

        this.ghost = {
            x: spawnX,
            y: spawnY,
            targetX: spawnX,
            targetY: spawnY,
            room: this.ghostRoom,
            state: 'IDLE',
            stateTimer: 0,
            floorIndex: 0,
            huntCooldown: 30,
            lastKnownPlayerPos: null,
            hasEmf5Evidence: this.scene.activeGhostType && this.scene.activeGhostType.evidence.includes('emf'),
            hasDotsEvidence: this.scene.activeGhostType && this.scene.activeGhostType.evidence.includes('dots')
        };

        this.scene.ghost = this.ghost;
        this.scene.ghostRoom = this.ghostRoom;
        this.scene.ghostVisual = this.ghostVisual;
        this.scene.falseHuntActive = false;
        this.scene.ghostPresence = { band: 'none', distance: Infinity, strength: 0 };

        this.initPresenceAudio();

        this.scene.events.once('shutdown', () => this.teardownPresenceAudio());
        this.scene.events.once('destroy', () => this.teardownPresenceAudio());

        this.scene.time.addEvent({
            delay: 1000,
            callback: () => this.updateAI(),
            loop: true
        });
    }

    getGhostRoom() {
        return this.ghostRoom;
    }

    updateAI() {
        if (!this.ghost || !this.ghost.room) return;

        // In co-op mode, only the host runs ghost AI
        if (this.scene.isCoopMode && this.scene.playroomService && !this.scene.playroomService.isHost()) {
            return;
        }

        if (!this.ghostAwake) {
            if (this.isPlayerInsideHouse()) {
                this.ghostAwake = true;
            } else {
                this.keepGhostDormant();
                return;
            }
        }

        this.updateFalseHuntState();

        if (this.ghost.huntCooldown > 0) this.ghost.huntCooldown--;
        if (this.falseHuntCooldown > 0) this.falseHuntCooldown--;

        if (
            this.ghost.state !== 'HUNT'
            && this.ghost.state !== 'EVENT'
            && this.falseHuntCooldown <= 0
        ) {
            // In co-op mode, use average sanity; otherwise use local sanity
            const falseHuntSanity = this.scene.sanitySystem.getAverageTeamSanity();
            
            if (falseHuntSanity < 75 && Math.random() < 0.02) {
                this.triggerFalseHunt();
            }
        }

        if (this.ghost.state !== 'HUNT' && this.ghost.huntCooldown <= 0) {
            // In co-op mode, use average sanity; otherwise use local sanity
            const triggerSanity = this.scene.sanitySystem.getAverageTeamSanity();
            
            // Hunt only triggers when average sanity drops below 30%
            if (triggerSanity < 30) {
                const huntChance = triggerSanity < 15 ? 0.08 : 0.03;
                if (Math.random() < huntChance) {
                    this.ghost.state = 'HUNT';
                    this.ghost.stateTimer = Phaser.Math.Between(15, 25);
                    this.ghost.targetX = this.ghost.x;
                    this.ghost.targetY = this.ghost.y;
                    this.ghost.lastKnownPlayerPos = null;
                    this.behaviorDelayTicks = 0;

                    // An EMF level 4 reading is created at the ghost's position where it started a hunt.
                    this.scene.evidenceSystem.createEmfSource(
                        this.ghost.x,
                        this.ghost.y,
                        4,
                        this.ghost.floorIndex,
                        20000
                    );

                    this.scene.interactionSystem.setHuntMode(true);
                    this.scene.audioSystem.playSfx('hunt-start');
                    this.scene.audioSystem.playLoop('hunt-loop');
                    
                    // Broadcast hunt start to all players
                    if (this.scene.playroomService) {
                        this.scene.playroomService.callRPC('huntStarted', {
                            ghostX: this.ghost.x,
                            ghostY: this.ghost.y,
                            averageSanity: triggerSanity
                        });
                    }
                    return;
                }
            }
        }

        if (this.ghost.state === 'HUNT') {
            this.updateHuntState();
            return;
        }

        let interactionChance = 0.15;
        let manifestChance = 0.02;

        // In co-op mode, use average sanity; otherwise use local sanity
        const behaviorSanity = this.scene.sanitySystem.getAverageTeamSanity();

        if (behaviorSanity !== undefined) {
            if (behaviorSanity > 70) {
                interactionChance = 0.05;
                manifestChance = 0.01;
            } else if (behaviorSanity > 30) {
                interactionChance = 0.15;
                manifestChance = 0.03;
            } else {
                interactionChance = 0.35;
                manifestChance = 0.08;
            }
        }

        const traits = this.scene.activeGhostType?.traits;
        if (traits) {
            interactionChance *= traits.interactionRate;
        }

        if (this.behaviorDelayTicks > 0) {
            this.behaviorDelayTicks--;
            this.ghostVisual.floorIndex = this.ghost.floorIndex;
            return;
        }

        if (Math.random() < 0.1) {
            this.behaviorDelayTicks = Phaser.Math.Between(1, 2);
            this.ghostVisual.floorIndex = this.ghost.floorIndex;
            return;
        }

        this.ghost.stateTimer--;
        if (this.ghost.stateTimer <= 0) {
            this.advanceIdleState(manifestChance, interactionChance);
        }

        this.ghostVisual.floorIndex = this.ghost.floorIndex;
    }

    updateMovement() {
        if (!this.ghost || !this.ghost.room) return;

        if (this.scene.isCoopMode && this.scene.playroomService && !this.scene.playroomService.isHost()) {
            this.ghostAwake = true;
            if (this.ghostVisual?.body) {
                this.ghostVisual.body.setVelocity(0, 0);
            }
            if (this.ghostVisual) {
                this.ghostVisual.setPosition(this.ghost.x, this.ghost.y);
            }
            this.applyGhostFlicker();
            this.updatePresenceEffects();
            return;
        }

        if (!this.ghostAwake) {
            this.keepGhostDormant();
            return;
        }

        this.ghost.x = this.ghostVisual.x;
        this.ghost.y = this.ghostVisual.y;

        let speed = 0;
        if (this.pauseFrames > 0) {
            this.pauseFrames--;
            this.ghostVisual.body.setVelocity(0, 0);
            this.applyGhostFlicker();
            this.updatePresenceEffects();
            return;
        }

        if (this.ghost.state === 'HUNT') {
            speed = 74 + Phaser.Math.Between(0, 20);
            if (Math.random() < 0.01) {
                this.pauseFrames = Phaser.Math.Between(6, 14);
                this.ghostVisual.body.setVelocity(0, 0);
                this.applyGhostFlicker();
                this.updatePresenceEffects();
                return;
            }
        } else if (this.ghost.state === 'ROAM' || this.ghost.state === 'RETURN' || this.ghost.state === 'DOTS') {
            speed = 20;
        }

        const distance = Phaser.Math.Distance.Between(this.ghost.x, this.ghost.y, this.ghost.targetX, this.ghost.targetY);
        if (speed > 0 && distance > 3) {
            const angle = Phaser.Math.Angle.Between(
                this.ghost.x,
                this.ghost.y,
                this.ghost.targetX,
                this.ghost.targetY
            );

            // Smooth speed scaling when close to target to prevent jitter
            const finalSpeed = distance < 10 ? speed * (distance / 10) : speed;

            this.ghostVisual.body.setVelocity(
                Math.cos(angle) * finalSpeed,
                Math.sin(angle) * finalSpeed
            );

            if (this.ghost.state === 'HUNT' && Math.random() < 0.12) {
                this.ghost.targetX += Phaser.Math.Between(-18, 18);
                this.ghost.targetY += Phaser.Math.Between(-18, 18);
            }
        } else {
            this.ghostVisual.body.setVelocity(0, 0);
        }

        this.ghost.x = this.ghostVisual.x;
        this.ghost.y = this.ghostVisual.y;
        this.applyGhostFlicker();
        this.updatePresenceEffects();
        
        // Broadcast ghost state periodically in co-op mode
        this.broadcastGhostState();
    }

    updateHuntState() {
        this.ghost.stateTimer--;

        this.ghostVisual.setDepth(102);

        for (const room of this.scene.rooms) {
            const distToRoomCenter = Phaser.Math.Distance.Between(
                this.ghost.x,
                this.ghost.y,
                room.bounds.x + room.bounds.w / 2,
                room.bounds.y + room.bounds.h / 2
            );

            if (room.isLit && distToRoomCenter < 300 && Math.random() < 0.3) {
                room.isLit = false;
            }
        }

        this.applyGhostFlicker();

        const hasLOS = this.hasLineOfSightToPlayer();
        if (hasLOS) {
            const leadOffset = Math.random() < 0.25
                ? { x: Phaser.Math.Between(-22, 22), y: Phaser.Math.Between(-22, 22) }
                : { x: 0, y: 0 };
            this.ghost.targetX = this.scene.player.x + leadOffset.x;
            this.ghost.targetY = this.scene.player.y + leadOffset.y;
        } else if (this.ghost.lastKnownPlayerPos) {
            this.ghost.targetX = this.ghost.lastKnownPlayerPos.x;
            this.ghost.targetY = this.ghost.lastKnownPlayerPos.y;

            if (
                Phaser.Math.Distance.Between(this.ghost.x, this.ghost.y, this.ghost.targetX, this.ghost.targetY) < 15
            ) {
                this.ghost.lastKnownPlayerPos = null;
            } else if (Math.random() < 0.08) {
                this.ghost.targetX += Phaser.Math.Between(-30, 30);
                this.ghost.targetY += Phaser.Math.Between(-30, 30);
            }
        } else if (
            Phaser.Math.Distance.Between(this.ghost.x, this.ghost.y, this.ghost.targetX, this.ghost.targetY) < 20
        ) {
            // Larger roaming range during search
            this.ghost.targetX = this.ghost.x + Phaser.Math.Between(-250, 250);
            this.ghost.targetY = this.ghost.y + Phaser.Math.Between(-250, 250);
            
            // Boundary clamping
            this.ghost.targetX = Phaser.Math.Clamp(this.ghost.targetX, 100, this.scene.roomWidth - 100);
            this.ghost.targetY = Phaser.Math.Clamp(this.ghost.targetY, 100, this.scene.roomHeight - 100);
        }

        if (this.ghost.stateTimer <= 0) {
            this.ghost.state = 'IDLE';
            this.ghost.stateTimer = 5;
            this.ghost.huntCooldown = 45;
            this.ghostVisual.alpha = 0;
            this.ghostVisual.setVisible(false);
            this.ghostVisual.setDepth(95);
            this.scene.interactionSystem.setHuntMode(false);
            this.scene.audioSystem.stopLoop('hunt-loop');
        }
    }

    hasLineOfSightToPlayer() {
        if (this.ghost.floorIndex !== this.scene.currentFloorIndex) return false;

        const distToPlayer = Phaser.Math.Distance.Between(
            this.ghost.x,
            this.ghost.y,
            this.scene.player.x,
            this.scene.player.y
        );
        if (distToPlayer >= 400) return false;

        for (const segment of this.scene.staticWallSegments) {
            if (segment.floorIndex !== this.scene.currentFloorIndex) continue;
            if (
                getSegmentIntersection(
                    this.ghost.x,
                    this.ghost.y,
                    this.scene.player.x,
                    this.scene.player.y,
                    segment.x1,
                    segment.y1,
                    segment.x2,
                    segment.y2
                )
            ) {
                return false;
            }
        }

        for (const door of this.scene.doors) {
            if (door.floorIndex !== this.scene.currentFloorIndex || door.isOpen) continue;

            const tl = door.getTopLeft();
            const tr = door.getTopRight();
            const bl = door.getBottomLeft();
            const br = door.getBottomRight();

            const doorSegments = [
                [tl.x, tl.y, tr.x, tr.y],
                [tr.x, tr.y, br.x, br.y],
                [br.x, br.y, bl.x, bl.y],
                [bl.x, bl.y, tl.x, tl.y]
            ];

            for (const [x1, y1, x2, y2] of doorSegments) {
                if (
                    getSegmentIntersection(
                        this.ghost.x,
                        this.ghost.y,
                        this.scene.player.x,
                        this.scene.player.y,
                        x1,
                        y1,
                        x2,
                        y2
                    )
                ) {
                    return false;
                }
            }
        }

        this.ghost.lastKnownPlayerPos = { x: this.scene.player.x, y: this.scene.player.y };
        return true;
    }

    advanceIdleState(manifestChance, interactionChance) {
        if (this.ghost.state === 'EVENT') {
            this.scene.tweens.add({ targets: this.ghostVisual, alpha: 0, duration: 300 });
        }

        const cx = this.ghost.room.bounds.x + this.ghost.room.bounds.w / 2;
        const cy = this.ghost.room.bounds.y + this.ghost.room.bounds.h / 2;
        const distToRoom = Phaser.Math.Distance.Between(this.ghost.x, this.ghost.y, cx, cy);

        if (distToRoom > 250) {
            this.ghost.state = 'RETURN';
            this.ghost.stateTimer = Phaser.Math.Between(3, 6);
            this.ghost.targetX = cx + Phaser.Math.Between(-20, 20);
            this.ghost.targetY = cy + Phaser.Math.Between(-20, 20);
            return;
        }

        const rand = Math.random();
        if (rand < manifestChance) {
            this.ghost.state = 'EVENT';
            this.ghost.stateTimer = Phaser.Math.Between(1, 3);
            this.scene.tweens.add({ targets: this.ghostVisual, alpha: 0.6, duration: 300 });
            this.ghostVisual.setVisible(true);
            this.ghostVisual.setDepth(102);
            this.scene.audioSystem.playSfx('ghost-manifest');

            this.scene.evidenceSystem.createEmfSource(
                this.ghost.x, 
                this.ghost.y, 
                4, 
                this.ghost.floorIndex, 
                25000
            );

            if (this.scene.sanity) {
                this.scene.sanity = Phaser.Math.Clamp(
                    this.scene.sanity - Phaser.Math.Between(3, 7),
                    0,
                    100
                );
            }
            return;
        }

        if (rand < manifestChance + interactionChance) {
            this.ghost.state = 'INTERACT';
            this.ghost.stateTimer = 1;

            const roll = Phaser.Math.Between(1, 100);
            const level = Math.random() < 0.3 ? 3 : 2;

            let interactX = this.ghost.x;
            let interactY = this.ghost.y;

            if (roll > 80 && this.ghost.room.isLit) {
                this.ghost.room.isLit = false;
                const sw = this.scene.switches.find(s => s.roomName === this.ghost.room.name);
                if (sw) {
                    sw.fillColor = 0xff0000;
                    interactX = sw.x;
                    interactY = sw.y;
                }
            } else if (roll > 70 && roll <= 85) {
                let closestObj = null;
                let minDist = 120;

                for (const door of this.scene.doors) {
                    if (door.floorIndex !== this.ghost.floorIndex) continue;
                    const doorDist = Phaser.Math.Distance.Between(this.ghost.x, this.ghost.y, door.x, door.y);
                    if (doorDist < minDist) {
                        minDist = doorDist;
                        closestObj = { x: door.x, y: door.y, rot: door.rotation };
                    }
                }

                for (const sw of this.scene.switches) {
                    if (sw.floorIndex !== this.ghost.floorIndex) continue;
                    const switchDist = Phaser.Math.Distance.Between(this.ghost.x, this.ghost.y, sw.x, sw.y);
                    if (switchDist < minDist) {
                        minDist = switchDist;
                        closestObj = { x: sw.x, y: sw.y, rot: 0 };
                    }
                }

                if (!closestObj) {
                    closestObj = {
                        x: this.ghost.x + Phaser.Math.Between(-15, 15),
                        y: this.ghost.y + Phaser.Math.Between(-15, 15),
                        rot: Math.random() * Math.PI
                    };
                }

                interactX = closestObj.x;
                interactY = closestObj.y;

                const hasUv = this.scene.activeGhostType && this.scene.activeGhostType.evidence.includes('uv');
                if (hasUv) {
                    this.scene.evidenceSystem.createMark(closestObj.x, closestObj.y, closestObj.rot, this.ghost.floorIndex);
                    if (this.scene.fingerprints.length > 20) {
                        const oldMark = this.scene.fingerprints.shift();
                        if (oldMark) oldMark.destroy();
                    }
                }
            }

            this.scene.evidenceSystem.createEmfSource(
                interactX, 
                interactY, 
                level, 
                this.ghost.floorIndex, 
                Phaser.Math.Between(15000, 20000)
            );
            return;
        }

        if (Math.random() < 0.5) {
            this.ghost.state = 'ROAM';
            this.ghost.stateTimer = Phaser.Math.Between(2, 5);
            
            // Pick a random target within current room or occasionally a nearby room
            const currentRoom = this.ghost.room;
            if (currentRoom && Math.random() < 0.8) {
                this.ghost.targetX = Phaser.Math.Between(currentRoom.bounds.x + 20, currentRoom.bounds.x + currentRoom.bounds.w - 20);
                this.ghost.targetY = Phaser.Math.Between(currentRoom.bounds.y + 20, currentRoom.bounds.y + currentRoom.bounds.h - 20);
            } else {
                const targetRoom = this.scene.rooms[Phaser.Math.Between(0, this.scene.rooms.length - 1)];
                this.ghost.targetX = Phaser.Math.Between(targetRoom.bounds.x + 20, targetRoom.bounds.x + targetRoom.bounds.w - 20);
                this.ghost.targetY = Phaser.Math.Between(targetRoom.bounds.y + 20, targetRoom.bounds.y + targetRoom.bounds.h - 20);
            }

            if (Math.random() < 0.2) {
                this.pauseFrames = Phaser.Math.Between(5, 12);
            }
        } else {
            const dotsRate = this.scene.activeGhostType?.traits?.dotsRate || 1.0;
            if (Math.random() < (0.2 * dotsRate) && this.ghost.hasDotsEvidence) {
                this.ghost.state = 'DOTS';
                this.ghost.stateTimer = Phaser.Math.Between(4, 7);
                
                const currentRoom = this.ghost.room;
                if (currentRoom) {
                    this.ghost.targetX = Phaser.Math.Between(currentRoom.bounds.x + 20, currentRoom.bounds.x + currentRoom.bounds.w - 20);
                    this.ghost.targetY = Phaser.Math.Between(currentRoom.bounds.y + 20, currentRoom.bounds.y + currentRoom.bounds.h - 20);
                }
            } else {
                this.ghost.state = 'IDLE';
                this.ghost.stateTimer = Phaser.Math.Between(1, 4);
            }
        }
    }

    applyGhostFlicker() {
        if (this.ghost.floorIndex !== this.scene.currentFloorIndex) {
            this.ghostVisual.setVisible(false);
            return;
        }

        // --- DOTS STATE RENDERING ---
        if (this.ghost.state === 'DOTS') {
            const inDotsZone = this.scene.evidenceSystem.isGhostInDotsZone(this.ghost.x, this.ghost.y, this.ghost.floorIndex);
            this.ghostVisual.setVisible(inDotsZone);
            
            if (inDotsZone) {
                this.ghostVisual.fillColor = 0x00ff88; // DOTS green color
                this.ghostVisual.alpha = Phaser.Math.FloatBetween(0.6, 0.9);
                this.ghostVisual.setDepth(102); // Draw above darkness
                this.ghostVisual.setBlendMode(Phaser.BlendModes.ADD);
            } else {
                // Reset color back to default just in case, though it's hidden
                this.ghostVisual.fillColor = 0xbbffff;
                this.ghostVisual.setDepth(95);
                this.ghostVisual.setBlendMode(Phaser.BlendModes.NORMAL);
            }
            return;
        }

        // Reset color if coming out of DOTS state
        this.ghostVisual.fillColor = 0xbbffff;
        this.ghostVisual.setDepth(95);
        this.ghostVisual.setBlendMode(Phaser.BlendModes.NORMAL);

        const isVisibleState = this.ghost.state === 'HUNT' || this.ghost.state === 'EVENT' || this.scene.falseHuntActive;
        if (!isVisibleState) {
            this.ghostVisual.setVisible(false);
            return;
        }

        if (this.ghost.state === 'HUNT' || this.ghost.state === 'EVENT' || this.scene.falseHuntActive) {
            const playerRoom = this.getRoomAt(this.scene.player.x, this.scene.player.y, this.scene.currentFloorIndex);
            const ghostRoom = this.getRoomAt(this.ghost.x, this.ghost.y, this.ghost.floorIndex);

            const sameRoom = playerRoom && ghostRoom && playerRoom.name === ghostRoom.name;
            const dist = Phaser.Math.Distance.Between(this.scene.player.x, this.scene.player.y, this.ghost.x, this.ghost.y);
            
            // During hunt/event, only hide if player is in a different room AND far away, or if LOS logic dictates
            // This prevents "snapping" out of existence when stepping across a room threshold.
            if (!sameRoom && dist > 180 && !this.scene.falseHuntActive) {
                this.ghostVisual.setVisible(false);
                return;
            }
        }

        const visibleChance = this.ghost.state === 'HUNT' ? 0.8 : 0.62;
        const isVisible = Math.random() < visibleChance;
        this.ghostVisual.setVisible(isVisible);
        if (isVisible) {
            if (this.ghost.state === 'HUNT') {
                this.ghostVisual.alpha = Phaser.Math.FloatBetween(0.45, 0.95);
            } else {
                this.ghostVisual.alpha = Phaser.Math.FloatBetween(0.3, 0.7);
            }
        }
    }

    triggerFalseHunt() {
        this.falseHuntCooldown = Phaser.Math.Between(16, 28);
        this.falseHuntEndsAt = this.scene.time.now + Phaser.Math.Between(1500, 2800);
        this.scene.falseHuntActive = true;

        const playerRoom = this.getRoomAt(this.scene.player.x, this.scene.player.y, this.scene.currentFloorIndex);
        let targetRoom = playerRoom;

        // If player is outside or we want variety, pick a random interior room
        if (!targetRoom || Math.random() < 0.3) {
            const interiorRooms = this.scene.rooms.filter(r => r.floorIndex === this.scene.currentFloorIndex);
            targetRoom = interiorRooms[Phaser.Math.Between(0, interiorRooms.length - 1)];
        }

        if (targetRoom) {
            this.ghost.x = Phaser.Math.Between(targetRoom.bounds.x + 20, targetRoom.bounds.x + targetRoom.bounds.w - 20);
            this.ghost.y = Phaser.Math.Between(targetRoom.bounds.y + 20, targetRoom.bounds.y + targetRoom.bounds.h - 20);
            this.ghost.targetX = this.ghost.x;
            this.ghost.targetY = this.ghost.y;
            this.ghostVisual.setPosition(this.ghost.x, this.ghost.y);
            this.ghostVisual.setDepth(102);
        }
    }

    updateFalseHuntState() {
        if (!this.scene.falseHuntActive) return;

        if (this.scene.time.now >= this.falseHuntEndsAt) {
            this.scene.falseHuntActive = false;
            if (this.ghost.state !== 'HUNT' && this.ghost.state !== 'EVENT') {
                this.ghostVisual.setVisible(false);
                this.ghostVisual.setAlpha(0);
                this.ghostVisual.setDepth(95);
            }
        }
    }

    updatePresenceEffects() {
        if (!this.ghost || !this.scene.player) return;

        if (this.ghost.floorIndex !== this.scene.currentFloorIndex || this.scene.player.isDead) {
            this.scene.ghostPresence = { band: 'none', distance: Infinity, strength: 0 };
            this.updatePresenceAudio('none', 0);
            return;
        }

        const distance = Phaser.Math.Distance.Between(
            this.ghost.x,
            this.ghost.y,
            this.scene.player.x,
            this.scene.player.y
        );

        const strength = Phaser.Math.Clamp(1 - (distance / this.presenceThresholds.far), 0, 1);

        let band = 'none';
        if (distance <= this.presenceThresholds.veryClose) band = 'very_close';
        else if (distance <= this.presenceThresholds.close) band = 'close';
        else if (distance <= this.presenceThresholds.medium) band = 'medium';
        else if (distance <= this.presenceThresholds.far) band = 'far';

        this.scene.ghostPresence = { band, distance, strength };
        this.updatePresenceAudio(band, strength);
    }

    initPresenceAudio() {
        const ctx = this.scene.sound && this.scene.sound.context;
        if (!ctx) return;

        const resumeAudio = () => {
            if (ctx.state === 'suspended') {
                ctx.resume();
            }
        };

        this.scene.input.once('pointerdown', resumeAudio);
        this.scene.input.once('keydown', resumeAudio);

        const master = ctx.createGain();
        master.gain.value = 0;
        master.connect(ctx.destination);

        const humOsc = ctx.createOscillator();
        humOsc.type = 'sine';
        humOsc.frequency.value = 52;
        const humGain = ctx.createGain();
        humGain.gain.value = 0;
        humOsc.connect(humGain);
        humGain.connect(master);

        const whisperOsc = ctx.createOscillator();
        whisperOsc.type = 'triangle';
        whisperOsc.frequency.value = 118;
        const whisperGain = ctx.createGain();
        whisperGain.gain.value = 0;
        whisperOsc.connect(whisperGain);
        whisperGain.connect(master);

        const heartbeatOsc = ctx.createOscillator();
        heartbeatOsc.type = 'sine';
        heartbeatOsc.frequency.value = 46;
        const heartbeatGain = ctx.createGain();
        heartbeatGain.gain.value = 0;
        heartbeatOsc.connect(heartbeatGain);
        heartbeatGain.connect(master);

        humOsc.start();
        whisperOsc.start();
        heartbeatOsc.start();

        this.audio = {
            ctx,
            master,
            humOsc,
            humGain,
            whisperOsc,
            whisperGain,
            heartbeatOsc,
            heartbeatGain
        };
    }

    updatePresenceAudio(band, strength) {
        if (!this.audio) return;

        const now = this.scene.time.now;

        const targetMaster = band === 'none' ? 0 : (0.025 + strength * 0.11);
        const humTarget = band === 'none' ? 0 : (0.006 + strength * 0.03);
        const whisperTarget = (band === 'medium' || band === 'close' || band === 'very_close')
            ? (0.002 + strength * 0.022)
            : 0;

        const isVeryClose = band === 'very_close';
        const isClose = band === 'close' || isVeryClose;
        const pulseRate = isVeryClose ? 0.05 : 0.03;
        const pulse = (Math.sin(now * pulseRate) + 1) * 0.5;
        const heartbeatTarget = isClose ? (0.003 + pulse * 0.03 * strength) : 0;

        if (now - this.lastDetuneAt > 600) {
            this.lastDetuneAt = now;
            this.audio.whisperOsc.detune.value = Phaser.Math.Between(-8, 8);
        }

        this.audio.master.gain.value += (targetMaster - this.audio.master.gain.value) * 0.06;
        this.audio.humGain.gain.value += (humTarget - this.audio.humGain.gain.value) * 0.06;
        this.audio.whisperGain.gain.value += (whisperTarget - this.audio.whisperGain.gain.value) * 0.08;
        this.audio.heartbeatGain.gain.value += (heartbeatTarget - this.audio.heartbeatGain.gain.value) * 0.12;
    }

    teardownPresenceAudio() {
        if (!this.audio) return;

        try {
            this.audio.humOsc.stop();
            this.audio.whisperOsc.stop();
            this.audio.heartbeatOsc.stop();
        } catch (e) {
            // no-op
        }

        this.audio.humOsc.disconnect();
        this.audio.whisperOsc.disconnect();
        this.audio.heartbeatOsc.disconnect();
        this.audio.humGain.disconnect();
        this.audio.whisperGain.disconnect();
        this.audio.heartbeatGain.disconnect();
        this.audio.master.disconnect();

        this.audio = null;
    }

    isPlayerInsideHouse() {
        if (!this.scene.player) return false;

        for (const room of this.scene.rooms) {
            if (room.floorIndex !== this.scene.currentFloorIndex) continue;

            const insideRoom =
                this.scene.player.x >= room.bounds.x
                && this.scene.player.x <= room.bounds.x + room.bounds.w
                && this.scene.player.y >= room.bounds.y
                && this.scene.player.y <= room.bounds.y + room.bounds.h;

            if (insideRoom) return true;
        }

        return false;
    }

    keepGhostDormant() {
        if (this.ghostVisual && this.ghostVisual.body) {
            this.ghostVisual.body.setVelocity(0, 0);
        }
        if (this.ghostVisual) {
            this.ghostVisual.setVisible(false);
            this.ghostVisual.setAlpha(0);
        }

        this.scene.falseHuntActive = false;
        this.scene.ghostPresence = { band: 'none', distance: Infinity, strength: 0 };
        this.updatePresenceAudio('none', 0);
    }

    isDoorCollider(colliderObj) {
        for (const door of this.scene.doors) {
            if (door.collider === colliderObj) {
                return true;
            }
        }
        return false;
    }

    getRoomAt(x, y, floorIndex) {
        for (const room of this.scene.rooms) {
            if (room.floorIndex !== floorIndex) continue;

            const inside =
                x >= room.bounds.x
                && x <= room.bounds.x + room.bounds.w
                && y >= room.bounds.y
                && y <= room.bounds.y + room.bounds.h;

            if (inside) return room;
        }

        return null;
    }

    broadcastGhostState() {
        // Only broadcast from host in co-op mode
        if (!this.scene.isCoopMode || !this.scene.playroomService || !this.scene.playroomService.isHost()) {
            return;
        }

        const now = Date.now();
        if (now - this._lastBroadcastTime < this._broadcastInterval) {
            return;
        }

        this._lastBroadcastTime = now;

        if (!this.ghost) return;

        // Broadcast ghost state to all clients
        this.scene.playroomService.callRPC('ghostUpdate', {
            x: this.ghost.x,
            y: this.ghost.y,
            state: this.ghost.state,
            floorIndex: this.ghost.floorIndex,
            huntCooldown: this.ghost.huntCooldown,
            stateTimer: this.ghost.stateTimer
        });
    }
}
