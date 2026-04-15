import { GAME_CONFIG } from '../config/gameConfig.js';
import { GHOST_TYPES } from '../config/ghostTypes.js';
import { GhostController } from '../entities/GhostController.js';
import { PlayerController } from '../entities/PlayerController.js';
import { InteractionSystem } from '../systems/InteractionSystem.js';
import { LightingSystem } from '../systems/LightingSystem.js';
import { EvidenceSystem } from '../systems/EvidenceSystem.js';
import { SanitySystem } from '../systems/SanitySystem.js';
import { AudioSystem } from '../systems/AudioSystem.js';
import { Hud } from '../ui/Hud.js';
import { Journal } from '../ui/Journal.js';
import { WorldBuilder } from '../world/WorldBuilder.js';
import { GAME_MODES, getGameMode, getRoomCode } from '../config/gameMode.js';
import { playroomService } from '../services/PlayroomService.js';

export class StartScene extends Phaser.Scene {
    constructor() {
        super('Start');
    }

    preload() {
        this.audioSystem = new AudioSystem(this);
        this.audioSystem.preload();
    }

    create() {
        this.gameMode = getGameMode();
        this.isCoopMode = this.gameMode === GAME_MODES.COOP && playroomService.isReady();

        if (this.isCoopMode) {
            if (playroomService.isHost()) {
                const gameInit = {
                    ghostTypeIndex: Phaser.Math.Between(0, GHOST_TYPES.length - 1),
                    spawnOffset: Phaser.Math.Between(-10, 10),
                    startSanity: GAME_CONFIG.sanity.start
                };
                playroomService.updateHostSharedState({ gameInit });
                this.continueCreate(gameInit);
            } else {
                this.waitingForInit = true;
                const state = playroomService.getSharedState();
                if (state && state.gameInit) {
                    this.waitingForInit = false;
                    this.continueCreate(state.gameInit);
                } else {
                    const cx = this.scale ? this.scale.width / 2 : 400;
                    const cy = this.scale ? this.scale.height / 2 : 300;
                    this.waitingText = this.add.text(cx, cy, 'Waiting for Host Init...', {
                        fontFamily: 'monospace',
                        fontSize: '24px',
                        color: '#ffffff'
                    }).setOrigin(0.5);
                }
            }
        } else {
            this.continueCreate(null);
        }
    }

    continueCreate(gameInit) {

        this.roomWidth = GAME_CONFIG.world.width;
        this.roomHeight = GAME_CONFIG.world.height;

        this.physics.world.setBounds(0, 0, this.roomWidth, this.roomHeight);
        this.add.grid(this.roomWidth / 2, this.roomHeight / 2, this.roomWidth, this.roomHeight, 50, 50, 0x111111, 1, 0x222222, 0.5);

        this.walls = this.physics.add.staticGroup();
        this.furnitureGroup = this.physics.add.staticGroup();

        this.worldBuilder = new WorldBuilder(this);
        this.buildWorld();

        this.playerController = new PlayerController(this);
        this.playerController.setup();
        
        let spawnX = GAME_CONFIG.player.spawn.x;
        let spawnY = GAME_CONFIG.player.spawn.y;
        if (this.vanSpawn) {
            spawnX = this.vanSpawn.x;
            spawnY = this.vanSpawn.y;
        }
        
        if (gameInit) {
            spawnX += gameInit.spawnOffset;
        }

        this.player.setPosition(spawnX, spawnY);

        this.physics.add.collider(this.player, this.walls);
        this.physics.add.collider(this.player, this.furnitureGroup);

        this.cameras.main.setBounds(0, 0, this.roomWidth, this.roomHeight);
        this.cameras.main.startFollow(
            this.player,
            true,
            GAME_CONFIG.camera.followLerpX,
            GAME_CONFIG.camera.followLerpY
        );
        this.cameras.main.setZoom(GAME_CONFIG.camera.zoom);

        this.darknessOverlay = this.add.rectangle(this.roomWidth / 2, this.roomHeight / 2, this.roomWidth, this.roomHeight, 0x000000);
        this.darknessOverlay.setAlpha(GAME_CONFIG.lighting.darknessAlpha);
        this.darknessOverlay.setDepth(100);

        this.lightMaskGraphics = this.add.graphics();
        this.lightMaskGraphics.setVisible(false);

        const mask = new Phaser.Display.Masks.BitmapMask(this, this.lightMaskGraphics);
        mask.invertAlpha = true;
        this.darknessOverlay.setMask(mask);

        this.flashlightTint = this.add.graphics();
        this.flashlightTint.setDepth(100);
        this.flashlightTint.setBlendMode(Phaser.BlendModes.ADD);

        this.sepiaOverlay = this.add.rectangle(this.roomWidth / 2, this.roomHeight / 2, this.roomWidth, this.roomHeight, 0x2b1d0f);
        this.sepiaOverlay.setAlpha(0.45);
        this.sepiaOverlay.setBlendMode(Phaser.BlendModes.MULTIPLY);
        this.sepiaOverlay.setDepth(105);

        this.vignetteOverlay = this.add.graphics();
        this.vignetteOverlay.setDepth(110);
        this.vignetteOverlay.setScrollFactor(0);
        this.drawVignette(this.cameras.main.width, this.cameras.main.height);

        this.interactionSystem = new InteractionSystem(this);
        this.lightingSystem = new LightingSystem(this);
        this.evidenceSystem = new EvidenceSystem(this);
        this.sanitySystem = new SanitySystem(this);

        this.setupInventory();

        if (gameInit) {
            this.sanity = gameInit.startSanity;
        } else {
            this.sanity = GAME_CONFIG.sanity.start;
        }

        // --- ROUND SETUP ---
        if (gameInit) {
            this.activeGhostType = GHOST_TYPES[gameInit.ghostTypeIndex];
        } else {
            this.activeGhostType = GHOST_TYPES[Phaser.Math.Between(0, GHOST_TYPES.length - 1)];
        }
        console.log(`[Round Setup] Ghost Type: ${this.activeGhostType.name}`);
        console.log(`[Round Setup] Evidence: ${this.activeGhostType.evidence.join(', ')}`);

        this.ghostController = new GhostController(this);
        this.ghostController.setup();
        this.ghostRoom = this.ghostController.getGhostRoom();
        this.evidenceSystem.setGhostRoom(this.ghostRoom);

        this.interactKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.interactKey.on('down', () => {
            if (!this.isJournalOpen) this.interactionSystem.handleInteraction();
        });

        this.dropKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G);
        this.flashlightToggleKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);

        this.isJournalOpen = false;
        this.isGameEnded = false;
        this.journal = new Journal(this);
        this.journalKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J);
        this.journalKey.on('down', () => {
            if (!this.isGameEnded) this.journal.toggle();
        });

        this.flashlightEnabled = false;

        if (this.isCoopMode) {
            this.playerSprites = {}; // Matching user pattern
            this.doorById = new Map();
            this.switchById = new Map();
            this.pickupById = new Map();
            this.buildWorldInteractionMaps();

            if (playroomService.isHost()) {
                const initialState = this.buildAuthoritativeWorldState();
                playroomService.updateHostSharedState(initialState);
            } else {
                this.applyAuthoritativeWorldState(playroomService.getSharedState());
            }
            
            this.localPlayerSprite = this.player;

            // onPlayerJoin Dictionary Pattern
            playroomService.onPlayerJoin((playerState) => {
                const isMe = playerState.id === playroomService.getMyPlayerId();
                if (isMe) return;

                const startX = gameInit ? (820 + gameInit.spawnOffset) : 820;
                const startY = 1130;

                const body = this.add.circle(startX, startY, 14, 0xeb4034, 0.95).setDepth(101);
                const dir = this.add.graphics().setDepth(101);
                const pName = typeof playerState.getProfile === 'function' ? playerState.getProfile().name : playerState.id;
                const label = this.add.text(startX, startY - 20, pName, {
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: '#ff8a80',
                    backgroundColor: '#00000066'
                }).setOrigin(0.5, 1).setDepth(102);

                this.playerSprites[playerState.id] = { body, dir, label };

                playerState.onQuit(() => {
                    const visuals = this.playerSprites[playerState.id];
                    if (visuals) {
                        visuals.body.destroy();
                        visuals.dir.destroy();
                        visuals.label.destroy();
                        delete this.playerSprites[playerState.id];
                    }
                });
            });

            this.coopDebugText = this.add.text(20, 20, 'CO-OP', {
                fontFamily: 'monospace',
                fontSize: '14px',
                color: '#bdb5a4'
            }).setDepth(4000).setScrollFactor(0);

            // Register Direct RPCs for instant interactions
            playroomService.registerRPC('toggleDoor', (data) => {
                const door = this.doorById.get(data.doorId);
                if (door && !door.isLocked) {
                    this.interactionSystem.applyDoorState(door, !door.isOpen, door.isLocked, { playSfx: true, animate: true });
                }
            });

            playroomService.registerRPC('toggleLight', (data) => {
                const sw = this.switchById.get(data.switchId);
                if (sw) {
                    const room = this.rooms.find(r => r.name === sw.roomName && r.floorIndex === sw.floorIndex);
                    if (room) {
                        this.interactionSystem.applySwitchState(sw, !room.isLit, { playSfx: true });
                    }
                }
            });

            this.hud.setRoomCode(getRoomCode());

            // Global State Equipment Sync
            playroomService.onState('equipmentState', (newState) => {
                if (!newState) return;
                for (const [itemId, state] of Object.entries(newState)) {
                    const pickup = this.pickupById.get(itemId);
                    if (pickup && state.picked && !pickup.picked) {
                        pickup.picked = true;
                        if (pickup.visual) pickup.visual.setVisible(false);
                        if (pickup.label) pickup.label.setVisible(false);
                    }
                }
            });
        }
    }

    drawVignette(cw, ch) {
        this.vignetteOverlay.clear();
        
        // Top edge
        this.vignetteOverlay.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.8, 0.8, 0, 0);
        this.vignetteOverlay.fillRect(0, 0, cw, ch * 0.3);
        
        // Bottom edge
        this.vignetteOverlay.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.8, 0.8);
        this.vignetteOverlay.fillRect(0, ch * 0.7, cw, ch * 0.3);
        
        // Left edge
        this.vignetteOverlay.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.8, 0, 0.8, 0);
        this.vignetteOverlay.fillRect(0, 0, cw * 0.3, ch);
        
        // Right edge
        this.vignetteOverlay.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.8, 0, 0.8);
        this.vignetteOverlay.fillRect(cw * 0.7, 0, cw * 0.3, ch);
    }

    buildWorld() {
        this.scene.nextDoorId = 0;
        this.scene.nextSwitchId = 0;
        this.scene.nextEquipmentId = 0;
        this.worldBuilder.buildWorld();
    }

    switchFloor(targetFloor) {
        this.currentFloorIndex = targetFloor;
        this.audioSystem.playSfx('stair-transition');

        const toggleVisibility = item => {
            const isActive = item.floorIndex === this.currentFloorIndex;
            if (item.visual) item.visual.setVisible(isActive);
            else if (item.setVisible) item.setVisible(isActive);

            if (item.collider && item.collider.body) item.collider.body.checkCollision.none = !isActive;
            else if (item.body) item.body.checkCollision.none = !isActive;
            else if (item.visual && item.visual.body) item.visual.body.checkCollision.none = !isActive;
        };

        this.walls.getChildren().forEach(w => toggleVisibility(w));
        this.doors.forEach(d => {
            toggleVisibility(d);
            if (d.collider) d.collider.body.checkCollision.none = (d.floorIndex !== this.currentFloorIndex) || d.isOpen;
        });
        this.switches.forEach(s => toggleVisibility(s));
        this.furniture.forEach(f => toggleVisibility(f));
        this.stairs.forEach(s => toggleVisibility(s));
        this.equipmentPickups.forEach(p => {
            const visible = p.floorIndex === this.currentFloorIndex && !p.picked;
            if (p.visual) p.visual.setVisible(visible);
            if (p.label) p.label.setVisible(visible);
        });

        if (this.ghostVisual) {
            this.ghostVisual.setVisible(this.ghostVisual.floorIndex === this.currentFloorIndex);
        }
    }

    setupInventory() {
        this.inventory = [null, null, null];
        this.activeSlot = 0;
        this.emfSources = [];
        this.baseTemp = GAME_CONFIG.evidence.baseTempCelsius;
        this.currentTemp = this.baseTemp;

        this.input.keyboard.on('keydown-ONE', () => { if (!this.isJournalOpen) this.switchSlot(0); });
        this.input.keyboard.on('keydown-TWO', () => { if (!this.isJournalOpen) this.switchSlot(1); });
        this.input.keyboard.on('keydown-THREE', () => { if (!this.isJournalOpen) this.switchSlot(2); });

        this.hud = new Hud(this, this.inventory);

        this.updateInventoryUI();
    }

    switchSlot(index) {
        if (this.activeSlot === index) return;
        this.activeSlot = index;
        this.updateInventoryUI();
    }

    updateInventoryUI() {
        this.hud.setActiveSlot(this.activeSlot);
        const activeItem = this.inventory[this.activeSlot];
        const activeId = activeItem ? activeItem.id : null;
        this.hud.setToolReadout(activeId, activeItem || {});
    }

    update() {
        if (this.waitingForInit) {
            const state = playroomService.getSharedState();
            if (state && state.gameInit) {
                this.waitingForInit = false;
                if (this.waitingText) this.waitingText.destroy();
                this.continueCreate(state.gameInit);
            }
            return;
        }

        if (this.isGameEnded) {
            const cam = this.cameras.main;
            const invZoom = 1 / cam.zoom;
            this.endContainer.setPosition(cam.worldView.centerX, cam.worldView.centerY);
            this.endContainer.setScale(invZoom);

            if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
                this.scene.restart();
            }
            return;
        }

        if (this.isJournalOpen) {
            const activeItem = this.inventory[this.activeSlot];
            const activeTool = activeItem ? activeItem.id : null;
            
            const points = this.lightingSystem.calcRaycastPoints(activeTool);
            this.lightingSystem.render(points, activeTool);

            const cam = this.cameras.main;
            this.hud.layout(cam);
            this.journal.layout(cam);
            return;
        }

        if (Phaser.Input.Keyboard.JustDown(this.dropKey)) {
            this.interactionSystem.dropActiveItem();
        }

        if (!this.hasFlashlightInInventory()) {
            this.flashlightEnabled = false;
            this.setInventoryFlashlightState(false);
        }

        if (Phaser.Input.Keyboard.JustDown(this.flashlightToggleKey)) {
            const activeItem = this.inventory[this.activeSlot];
            if (activeItem && activeItem.id === 'uv') {
                activeItem.uvOn = !activeItem.uvOn;
                this.audioSystem.playSfx('flashlight-click', { detune: activeItem.uvOn ? 100 : -100 });
                this.updateInventoryUI();
            } else if (activeItem && activeItem.id === 'flashlight' && this.hasFlashlightInInventory()) {
                this.flashlightEnabled = !this.flashlightEnabled;
                this.setInventoryFlashlightState(this.flashlightEnabled);
                this.audioSystem.playSfx('flashlight-click', { detune: this.flashlightEnabled ? 0 : -200 });
                this.updateInventoryUI();
            }
        }

        this.playerController.update();

        if (this.isCoopMode) {
            // --------------------------------------------------------
            // 1. YOUR LOCAL MOVEMENT (Broadcasting to the network)
            // --------------------------------------------------------
            if (this.localPlayerSprite) {
                const activeItem = this.inventory[this.activeSlot];
                
                // Pass everything to our throttled service
                playroomService.syncLocalPlayerState({
                    x: this.localPlayerSprite.x,
                    y: this.localPlayerSprite.y,
                    rotation: this.localPlayerSprite.rotation,
                    activeItem: activeItem ? activeItem.id : null,
                    flashlightOn: this.flashlightEnabled,
                    sanity: this.sanity // Pass sanity here instead of calling setState separately!
                });
            }

            // --------------------------------------------------------
            // 2. REMOTE PLAYERS MOVEMENT (Reading from the network)
            // --------------------------------------------------------
            const allPlayers = playroomService.getPlayers();
            allPlayers.forEach(playerState => {
                if (playerState.id === playroomService.getMyPlayerId()) return;

                const sprite = this.playerSprites[playerState.id];
                if (sprite) {
                    // Read from the new combined 'playerData' key instead of 'position'
                    const networkPos = typeof playerState.getState === 'function' 
                        ? (playerState.getState('playerData') || {}) 
                        : {};

                    if (networkPos && typeof networkPos.x === 'number') {
                        sprite.body.x = Phaser.Math.Linear(sprite.body.x, networkPos.x, 0.45);
                        sprite.body.y = Phaser.Math.Linear(sprite.body.y, networkPos.y, 0.45);
                        
                        const rot = networkPos.rotation || 0;
                        sprite.dir.clear();
                        sprite.dir.lineStyle(2, 0x1f9ecc, 1);
                        sprite.dir.beginPath();
                        sprite.dir.moveTo(sprite.body.x, sprite.body.y);
                        sprite.dir.lineTo(
                            sprite.body.x + Math.cos(rot) * 18,
                            sprite.body.y + Math.sin(rot) * 18
                        );
                        sprite.dir.strokePath();

                        sprite.label.setPosition(sprite.body.x, sprite.body.y - 20);
                    }
                }
            });

            if (this.coopDebugText) {
                const modeLabel = playroomService.isHost() ? 'HOST' : 'CLIENT';
                this.coopDebugText.setText(`CO-OP ${modeLabel} | Remote: ${Object.keys(this.playerSprites).length}`);
            }
        }

        const activeItem = this.inventory[this.activeSlot];
        const activeTool = activeItem ? activeItem.id : null;
        this.interactionSystem.updateCurrentStairTarget();

        const points = this.lightingSystem.calcRaycastPoints(activeTool);
        this.lightingSystem.render(points, activeTool);

        this.evidenceSystem.update(activeTool);

        const cam = this.cameras.main;
        this.hud.layout(cam);
        this.sanitySystem.update();
        this.hud.setHuntActive(this.ghost && this.ghost.state === 'HUNT');

        this.ghostController.updateMovement();

        if (this.currentStairTarget || this.currentExitTarget || this.currentPickupTarget) {
            this.hud.layoutStairPrompt(cam);
        }
    }

    hasFlashlightInInventory() {
        for (const item of this.inventory) {
            if (item && item.id === 'flashlight') return true;
        }
        return false;
    }

    // Removed syncRemotePlayerVisuals (now handled by onPlayerJoin and update loop)

    buildWorldInteractionMaps() {
        this.doorById.clear();
        this.switchById.clear();
        this.pickupById = new Map();

        for (const door of this.doors) {
            if (door.networkId) {
                this.doorById.set(door.networkId, door);
            }
        }

        for (const sw of this.switches) {
            if (sw.networkId) {
                this.switchById.set(sw.networkId, sw);
            }
        }

        for (const p of this.equipmentPickups) {
            if (p.networkId) {
                this.pickupById.set(p.networkId, p);
            }
        }
    }

    requestDoorToggle(doorId) {
        if (!this.isCoopMode || !doorId) return;
        playroomService.callRPC('toggleDoor', { doorId });
    }

    requestLightToggle(switchId) {
        if (!this.isCoopMode || !switchId) return;
        playroomService.callRPC('toggleLight', { switchId });
    }

    notifyPickup(networkId) {
        if (!this.isCoopMode || !networkId) return;
        const state = playroomService.getSharedState();
        const equipmentState = state.equipmentState || {};
        equipmentState[networkId] = { picked: true };
        playroomService.setGlobalState('equipmentState', equipmentState);
    }

    // Deprecated for instant events
    processHostInteractionRequests() {
    }

    buildAuthoritativeWorldState() {
        const doors = {};
        for (const door of this.doors) {
            if (!door.networkId) continue;
            doors[door.networkId] = {
                isOpen: !!door.isOpen,
                isLocked: !!door.isLocked,
                floorIndex: door.floorIndex
            };
        }

        const lights = {};
        for (const sw of this.switches) {
            if (!sw.networkId) continue;
            const room = this.rooms.find(r => r.name === sw.roomName && r.floorIndex === sw.floorIndex);
            lights[sw.networkId] = {
                isLit: room ? !!room.isLit : false,
                roomName: sw.roomName,
                floorIndex: sw.floorIndex
            };
        }

        return { doors, lights };
    }

    applyAuthoritativeWorldState(worldState) {
        if (!worldState) return;

        const doors = worldState.doors || {};
        const lights = worldState.lights || {};

        for (const [doorId, doorState] of Object.entries(doors)) {
            const door = this.doorById.get(doorId);
            if (!door || !doorState) continue;

            this.interactionSystem.applyDoorState(
                door,
                !!doorState.isOpen,
                !!doorState.isLocked,
                { playSfx: true, animate: true }
            );
        }

        for (const [switchId, lightState] of Object.entries(lights)) {
            const sw = this.switchById.get(switchId);
            if (!sw || !lightState) continue;

            this.interactionSystem.applySwitchState(sw, !!lightState.isLit, { playSfx: true });
        }
    }

    setInventoryFlashlightState(isOn) {
        for (const item of this.inventory) {
            if (item && item.id === 'flashlight') {
                item.flashlightOn = isOn;
            }
        }
    }

    isActiveUvEnabled() {
        const activeItem = this.inventory[this.activeSlot];
        return !!(activeItem && activeItem.id === 'uv' && activeItem.uvOn === true);
    }

    triggerEndGame() {
        this.isGameEnded = true;
        this.audioSystem.stopLoop('hunt-loop');
        this.audioSystem.stopLoop('emf-5-warning');
        
        // Hide journal if open
        if (this.isJournalOpen) {
            this.journal.toggle();
        }

        this.endContainer = this.add.container(0, 0);
        this.endContainer.setDepth(3000);

        const bg = this.add.rectangle(0, 0, 800, 600, 0x000000, 0.95);
        bg.setStrokeStyle(4, 0x555555);

        const guessed = this.journal.guessedGhost ? this.journal.guessedGhost.name : 'Unknown';
        const actual = this.activeGhostType.name;
        const isCorrect = (guessed === actual);

        const titleText = this.add.text(0, -150, 'INVESTIGATION COMPLETE', { 
            fontSize: '32px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold' 
        }).setOrigin(0.5);
        
        const guessText = this.add.text(0, -50, `You Guessed: ${guessed}`, { 
            fontSize: '24px', fontFamily: 'monospace', color: '#aaaaaa' 
        }).setOrigin(0.5);
        
        const actualText = this.add.text(0, 0, `Actual Ghost: ${actual}`, { 
            fontSize: '24px', fontFamily: 'monospace', color: '#ffffff' 
        }).setOrigin(0.5);

        const resultColor = isCorrect ? '#00ff00' : '#ff0000';
        const resultString = isCorrect ? 'SUCCESS' : 'INCORRECT';
        const resultText = this.add.text(0, 80, resultString, { 
            fontSize: '40px', fontFamily: 'monospace', color: resultColor, fontStyle: 'bold' 
        }).setOrigin(0.5);

        const restartText = this.add.text(0, 180, 'Press SPACE to Restart', { 
            fontSize: '20px', fontFamily: 'monospace', color: '#ffff00', fontStyle: 'bold' 
        }).setOrigin(0.5);

        this.endContainer.add([bg, titleText, guessText, actualText, resultText, restartText]);

        this.restartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    }
}
