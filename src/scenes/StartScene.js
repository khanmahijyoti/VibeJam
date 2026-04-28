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

        console.log('[StartScene.create] Game initialization:', {
            gameMode: this.gameMode,
            isCoopMode: this.isCoopMode,
            playroom: {
                isReady: playroomService.isReady(),
                initialized: playroomService.initialized,
                sdkLoaded: !!playroomService.sdk
            }
        });

        if (this.isCoopMode) {
            // Debug: Verify SDK is loaded
            console.log('[StartScene] Co-op mode activated', {
                isReady: playroomService.isReady(),
                isHost: playroomService.isHost(),
                sdkLoaded: !!playroomService.sdk,
                roomCode: getRoomCode()
            });

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
            console.log('[StartScene.create] Single player mode');
            this.continueCreate(null);
        }
    }

    continueCreate(gameInit) {
        this.playroomService = playroomService;

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

                // Check if lobby is full
                const currentPlayerCount = playroomService.getPlayerCount();
                const maxPlayers = playroomService.getMaxPlayers();

                // Update lobby status text
                const playerCountText = currentPlayerCount > maxPlayers ? 
                    `CO-OP (${maxPlayers}/${maxPlayers} - LOBBY FULL!)` : 
                    `CO-OP (${currentPlayerCount}/${maxPlayers})`;
                if (this.coopDebugText) {
                    this.coopDebugText.setText(playerCountText);
                    // Flash red when full
                    if (currentPlayerCount >= maxPlayers) {
                        this.coopDebugText.setColor('#ff4444');
                    } else {
                        this.coopDebugText.setColor('#bdb5a4');
                    }
                }

                // If the lobby is already at max capacity, warn and don't add the player
                if (currentPlayerCount > maxPlayers) {
                    console.warn('[StartScene.onPlayerJoin] Lobby full, rejecting player:', playerState.id);
                    playerState.onQuit(() => {
                        console.log('[StartScene.onPlayerJoin] Rejected player quit:', playerState.id);
                    });
                    return;
                }

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
                    
                    // Update lobby status when player quits
                    const newCount = playroomService.getPlayerCount();
                    const newText = `CO-OP (${newCount}/${maxPlayers})`;
                    if (this.coopDebugText) {
                        this.coopDebugText.setText(newText);
                        this.coopDebugText.setColor('#bdb5a4');
                    }
                });
            });

            this.coopDebugText = this.add.text(20, 20, `CO-OP (1/${playroomService.getMaxPlayers()})`, {
                fontFamily: 'monospace',
                fontSize: '14px',
                color: '#bdb5a4'
            }).setDepth(4000).setScrollFactor(0);

            // Register Direct RPCs for instant interactions
            playroomService.registerRPC('toggleDoor', (data) => {
                const door = this.doorById.get(data.doorId);
                const isMainExitDuringHunt = door
                    && this.interactionSystem.isExitDoor(door)
                    && (this.interactionSystem.huntModeActive || this.ghost?.state === 'HUNT');

                if (door && !door.isLocked && !isMainExitDuringHunt) {
                    // Toggle the door state
                    const newState = !door.isOpen;
                    this.interactionSystem.applyDoorState(door, newState, door.isLocked, { playSfx: true, animate: true });
                    
                    // Host updates the authoritative world state so late-joiners see the correct door state
                    if (playroomService.isHost()) {
                        const updatedState = this.buildAuthoritativeWorldState();
                        playroomService.updateHostSharedState(updatedState);
                    }
                }
            });

            playroomService.registerRPC('toggleLight', (data) => {
                const sw = this.switchById.get(data.switchId);
                if (sw) {
                    const room = this.rooms.find(r => r.name === sw.roomName && r.floorIndex === sw.floorIndex);
                    if (room) {
                        // Toggle the light state
                        const newLitState = !room.isLit;
                        this.interactionSystem.applySwitchState(sw, newLitState, { playSfx: true });
                        
                        // Host updates the authoritative world state so late-joiners see the correct light state
                        if (playroomService.isHost()) {
                            const updatedState = this.buildAuthoritativeWorldState();
                            playroomService.updateHostSharedState(updatedState);
                        }
                    }
                }
            });

            this.hud.setRoomCode(getRoomCode());

            // Register RPC handler for equipment pickup notifications
            playroomService.registerRPC('itemPickedUp', (data) => {
                const pickup = this.pickupById.get(data.itemId);
                if (pickup && !pickup.picked) {
                    pickup.picked = true;
                    if (pickup.visual) {
                        pickup.visual.setVisible(false);
                    }
                    if (pickup.label) {
                        pickup.label.setVisible(false);
                    }
                } else if (!pickup) {
                    console.warn('[StartScene.itemPickedUp RPC] Pickup not found:', data.itemId);
                }
            });

            // Register RPC handler for dropped items
            playroomService.registerRPC('itemDropped', (data) => {
                if (!data || !data.itemDef || !data.x || data.y === undefined || !data.networkId) {
                    return;
                }

                const existingPickup = this.pickupById.get(data.networkId);
                if (existingPickup) {
                    existingPickup.x = data.x;
                    existingPickup.y = data.y;
                    existingPickup.floorIndex = data.floorIndex || 0;
                    existingPickup.rotation = typeof data.itemDef.rotation === 'number' ? data.itemDef.rotation : existingPickup.rotation;
                    existingPickup.itemDef = {
                        id: data.itemDef.id,
                        displayName: data.itemDef.displayName,
                        flashlightOn: data.itemDef.id === 'flashlight' ? !!data.itemDef.flashlightOn : false,
                        uvOn: data.itemDef.id === 'uv' ? !!data.itemDef.uvOn : false
                    };
                    existingPickup.picked = false;
                    existingPickup.flashlightOn = existingPickup.itemDef.id === 'flashlight' ? existingPickup.itemDef.flashlightOn : false;
                    existingPickup.uvOn = existingPickup.itemDef.id === 'uv' ? existingPickup.itemDef.uvOn : false;

                    if (existingPickup.visual) {
                        existingPickup.visual.setPosition(data.x, data.y);
                        existingPickup.visual.setRotation(existingPickup.rotation);
                        existingPickup.visual.floorIndex = existingPickup.floorIndex;
                        existingPickup.visual.setVisible(existingPickup.floorIndex === this.currentFloorIndex);
                    }

                    if (existingPickup.label) {
                        existingPickup.label.setPosition(data.x, data.y - 18);
                        existingPickup.label.setText(existingPickup.itemDef.displayName);
                        existingPickup.label.floorIndex = existingPickup.floorIndex;
                        existingPickup.label.setVisible(existingPickup.floorIndex === this.currentFloorIndex);
                    }

                    return;
                }
                
                // Create the pickup with the same networkId so all clients reference it consistently
                const pickup = this.worldBuilder.createEquipmentPickup(
                    data.x,
                    data.y,
                    data.itemDef,
                    data.floorIndex || 0,
                    data.networkId  // Pass the networkId so it doesn't generate a new one
                );
                
                // Register the created pickup in the map so it can be found by subsequent RPC calls
                if (pickup) {
                    this.pickupById.set(data.networkId, pickup);
                }
            });

            // Register RPC handler for hunt started events
            playroomService.registerRPC('huntStarted', (data) => {
                if (this.ghost && this.ghostController) {
                    // Ensure hunt state is synchronized across all players
                    this.ghost.state = 'HUNT';
                    this.ghost.stateTimer = Phaser.Math.Between(15, 25);
                    this.interactionSystem.setHuntMode(true);
                    this.audioSystem.playSfx('hunt-start');
                    this.audioSystem.playLoop('hunt-loop');
                }
            });

            // Register RPC handler for ghost state updates from host
            playroomService.registerRPC('ghostUpdate', (data) => {
                if (!playroomService.isHost() && this.ghost && this.ghostController) {
                    // Non-host clients receive ghost updates from the host
                    this.ghost.x = data.x;
                    this.ghost.y = data.y;
                    this.ghost.state = data.state || this.ghost.state;
                    this.ghost.floorIndex = data.floorIndex || this.ghost.floorIndex;
                    this.ghost.huntCooldown = data.huntCooldown ?? this.ghost.huntCooldown;
                    this.ghost.stateTimer = data.stateTimer ?? this.ghost.stateTimer;
                    
                    // Update the visual representation
                    if (this.ghostController.ghostVisual) {
                        this.ghostController.ghostVisual.setPosition(data.x, data.y);
                    }
                }
            });

            // Register RPC handler for player ghost selections
            playroomService.registerRPC('playerGhostSelected', (data) => {
                if (data && data.playerId && data.ghostName !== undefined) {
                    if (data.ghostName) {
                        playroomService.setPlayerGhostSelection(data.playerId, data.ghostName);
                    } else {
                        playroomService.playerGhostSelections.delete(data.playerId);
                    }
                }
            });

            // Register RPC handler for game end event (when host exits)
            playroomService.registerRPC('gameEnded', (data) => {
                this.showEndScreen();
            });

            this.hud.setRoomCode(getRoomCode());

            // Bind PlayroomService request methods to this scene so InteractionSystem can call them
            this.requestDoorToggle = (doorId) => playroomService.requestDoorToggle(doorId);
            this.requestLightToggle = (switchId) => playroomService.requestLightToggle(switchId);
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
            if (this.interactionSystem) {
                this.interactionSystem.setDoorCollisionEnabled(
                    d,
                    d.floorIndex === this.currentFloorIndex && !d.isOpen
                );
            }
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
            if (playroomService.isHost()) {
                this.processHostInteractionRequests();
            }

            if (!this._worldSyncFrame) this._worldSyncFrame = 0;
            this._worldSyncFrame++;
            if (this._worldSyncFrame % 30 === 0) {
                this.applyAuthoritativeWorldState(playroomService.getSharedState(), { playSfx: false, animate: false });
            }

            // --------------------------------------------------------
            // 1. REMOTE PLAYERS MOVEMENT (Reading from the network)
            // --------------------------------------------------------
            const remoteStates = playroomService.getRemotePlayerStates();
            
            // Debug: Log remote states every 60 frames
            if (!this._coopDebugFrame) this._coopDebugFrame = 0;
            this._coopDebugFrame++;
            if (this._coopDebugFrame % 60 === 0) {
                console.log('[StartScene.update] Remote player states:', remoteStates.map(p => ({
                    id: p.id,
                    name: p.name,
                    x: p.x,
                    y: p.y,
                    rot: p.rotation.toFixed(2)
                })));
            }

            remoteStates.forEach(remoteState => {
                const sprite = this.playerSprites[remoteState.id];
                if (sprite) {
                    if (typeof remoteState.x === 'number') {
                        sprite.body.x = Phaser.Math.Linear(sprite.body.x, remoteState.x, 0.45);
                        sprite.body.y = Phaser.Math.Linear(sprite.body.y, remoteState.y, 0.45);
                        
                        const rot = remoteState.rotation || 0;
                        sprite.dir.clear();
                        
                        // If remote player has flashlight on, render a flashlight cone
                        if (remoteState.flashlightOn) {
                            // Draw flashlight cone (simple triangle)
                            sprite.dir.fillStyle(0xfff0a8, 0.3);
                            sprite.dir.beginPath();
                            sprite.dir.moveTo(sprite.body.x, sprite.body.y);
                            const coneRange = 60; // Distance of light cone
                            const coneWidth = 0.6; // FOV radians (~70 degrees)
                            const x1 = sprite.body.x + Math.cos(rot - coneWidth / 2) * coneRange;
                            const y1 = sprite.body.y + Math.sin(rot - coneWidth / 2) * coneRange;
                            const x2 = sprite.body.x + Math.cos(rot + coneWidth / 2) * coneRange;
                            const y2 = sprite.body.y + Math.sin(rot + coneWidth / 2) * coneRange;
                            sprite.dir.lineTo(x1, y1);
                            sprite.dir.lineTo(x2, y2);
                            sprite.dir.closePath();
                            sprite.dir.fillPath();
                        }
                        
                        // Direction indicator line (always visible)
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
                } else {
                    console.warn('[StartScene.update] Remote player sprite not found for:', remoteState.id);
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

        if (this.isCoopMode && this.localPlayerSprite) {
            const activeItem = this.inventory[this.activeSlot];
            playroomService.syncLocalPlayerState({
                x: this.localPlayerSprite.x,
                y: this.localPlayerSprite.y,
                rotation: this.localPlayerSprite.rotation,
                activeItem: activeItem ? activeItem.id : null,
                flashlightOn: this.flashlightEnabled,
                sanity: this.sanity
            });
        }

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

        if (!playroomService.isHost()) {
            playroomService.requestDoorToggle(doorId);
            return;
        }

        const door = this.doorById.get(doorId);
        if (!door || door.isLocked) return;

        this.interactionSystem.applyDoorState(door, !door.isOpen, door.isLocked, { playSfx: true, animate: true });
        playroomService.updateHostSharedState(this.buildAuthoritativeWorldState());
        playroomService.callRPC('toggleDoor', {
            doorId,
            isOpen: !!door.isOpen,
            isLocked: !!door.isLocked
        });
    }

    requestLightToggle(switchId) {
        if (!this.isCoopMode || !switchId) return;

        if (!playroomService.isHost()) {
            playroomService.requestLightToggle(switchId);
            return;
        }

        const sw = this.switchById.get(switchId);
        if (!sw) return;

        const room = this.rooms.find(r => r.name === sw.roomName && r.floorIndex === sw.floorIndex);
        if (!room) return;

        this.interactionSystem.applySwitchState(sw, !room.isLit, { playSfx: true });
        playroomService.updateHostSharedState(this.buildAuthoritativeWorldState());
        playroomService.callRPC('toggleLight', {
            switchId,
            isLit: !!room.isLit
        });
    }

    notifyPickup(networkId) {
        if (!this.isCoopMode || !networkId) {
            console.log('[notifyPickup] Skipping - isCoopMode:', this.isCoopMode, 'networkId:', networkId);
            return;
        }
        
        console.log('[notifyPickup] Broadcasting itemPickedUp RPC for networkId:', networkId);
        // Broadcast to ALL players (including self) via RPC so everyone hides the item
        playroomService.callRPC('itemPickedUp', { itemId: networkId }, 'ALL');
    }

    notifyDrop(itemData) {
        if (!this.isCoopMode || !itemData) {
            return;
        }
        
        // Broadcast to ALL players (including self) via RPC so everyone sees the dropped item
        playroomService.callRPC('itemDropped', itemData, 'ALL');
    }

    processHostInteractionRequests() {
        const requests = playroomService.drainHostRequests();
        if (!requests.length) return;

        let didChangeWorld = false;

        for (const request of requests) {
            if (!request || !request.type) continue;

            if (request.type === 'doorToggle') {
                const doorId = request.payload?.doorId;
                const door = this.doorById.get(doorId);
                if (!door || door.isLocked) {
                    continue;
                }

                this.interactionSystem.applyDoorState(door, !door.isOpen, door.isLocked, { playSfx: true, animate: true });
                playroomService.callRPC('toggleDoor', {
                    doorId,
                    isOpen: !!door.isOpen,
                    isLocked: !!door.isLocked
                });
                didChangeWorld = true;
                continue;
            }

            if (request.type === 'lightToggle') {
                const switchId = request.payload?.switchId;
                const sw = this.switchById.get(switchId);
                if (!sw) {
                    continue;
                }

                const room = this.rooms.find(r => r.name === sw.roomName && r.floorIndex === sw.floorIndex);
                if (!room) {
                    continue;
                }

                this.interactionSystem.applySwitchState(sw, !room.isLit, { playSfx: true });
                playroomService.callRPC('toggleLight', {
                    switchId,
                    isLit: !!room.isLit
                });
                didChangeWorld = true;
                continue;
            }
        }

        if (didChangeWorld) {
            playroomService.updateHostSharedState(this.buildAuthoritativeWorldState());
        }
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

    applyAuthoritativeWorldState(worldState, options = {}) {
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
                {
                    playSfx: options.playSfx !== false,
                    animate: options.animate !== false
                }
            );
        }

        for (const [switchId, lightState] of Object.entries(lights)) {
            const sw = this.switchById.get(switchId);
            if (!sw || !lightState) continue;

            this.interactionSystem.applySwitchState(sw, !!lightState.isLit, {
                playSfx: options.playSfx !== false
            });
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
        // In co-op mode, broadcast to all players
        if (this.isCoopMode && playroomService.isHost()) {
            playroomService.callRPC('gameEnded', {});
        }
        
        this.showEndScreen();
    }

    showEndScreen() {
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
