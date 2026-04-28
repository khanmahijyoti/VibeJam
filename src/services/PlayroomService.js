import { COOP_ACTIONS, GAME_MODES, getModeState, setCoopAction, setGameMode, setRoomCode } from '../config/gameMode.js';

class PlayroomService {
    constructor() {
        this.sdk = null;
        this.initialized = false;
        this.rpcBound = false;
        this.localFallbackPlayers = new Map();
        this.hostRequestQueue = [];
        this.sharedState = {
            ghost: null,
            hunts: null,
            doors: {},
            lights: {},
            evidenceEvents: [],
            sanityByPlayer: {}
        };
        
        // Track ghost type selections per player
        this.playerGhostSelections = new Map();
    }

    async initLobby(options = {}) {
        const mode = options.mode || GAME_MODES.COOP;
        const action = options.action || COOP_ACTIONS.NONE;
        const roomCode = (options.roomCode || '').toUpperCase().slice(0, 6);
        const maxPlayers = options.maxPlayers || 4;

        setGameMode(mode);
        setCoopAction(action);
        setRoomCode(roomCode);

        // Reset so a fresh insertCoin is always called
        this.reset();

        await this.ensureSdk();
        
        this.bindRpcHandlers();

        // Get insertCoin from either direct or default export
        let insertCoinFunc = this.sdk?.insertCoin;
        if (!insertCoinFunc && this.sdk?.default) {
            insertCoinFunc = this.sdk.default.insertCoin;
        }
        
        if (!insertCoinFunc || typeof insertCoinFunc !== 'function') {
            console.warn('[PlayroomService.initLobby] SDK not available, using FALLBACK');
            this.initialized = true;
            return { ok: true, fallback: true, roomCode };
        }

        const isJoining = action === COOP_ACTIONS.JOIN && !!roomCode;

        const coinConfig = {
            // Skip Playroom's built-in lobby UI entirely.
            // When joining: we must go directly to the room specified by roomCode.
            // When creating: we want to control the flow ourselves via the returned code.
            skipLobby: true,
            maxPlayers
        };

        if (isJoining) {
            // Pass the room code so Playroom connects to an existing session
            coinConfig.roomCode = roomCode;
        }

        await insertCoinFunc(coinConfig);
        this.initialized = true;

        const resolvedCode = this.getRoomCodeFromSdk() || roomCode;
        if (resolvedCode) {
            setRoomCode(resolvedCode);
        }

        return {
            ok: true,
            fallback: false,
            roomCode: resolvedCode
        };
    }

    async ensureSdk() {
        if (this.sdk) {
            return this.sdk;
        }

        if (window.PlayroomKit) {
            this.sdk = window.PlayroomKit;
            return this.sdk;
        }

        try {
            const mod = await import('https://cdn.jsdelivr.net/npm/playroomkit@latest/+esm');
            this.sdk = mod;
            return this.sdk;
        } catch (error) {
            console.warn('[PlayroomService.ensureSdk] CDN import FAILED', error);
            this.sdk = null;
        }

        return this.sdk;
    }

    isReady() {
        return this.initialized;
    }

    // Call this before re-initializing to allow a clean new session
    reset() {
        this.initialized = false;
        this.rpcBound = false;
        this.hostRequestQueue = [];
        this.sharedState = {
            ghost: null,
            hunts: null,
            doors: {},
            lights: {},
            evidenceEvents: [],
            sanityByPlayer: {}
        };
    }

    isHost() {
        if (this.sdk) {
            // Try primary method
            if (typeof this.sdk.isHost === 'function') {
                return !!this.sdk.isHost();
            }
            // Try alternative method
            if (typeof this.sdk.amIHost === 'function') {
                return !!this.sdk.amIHost();
            }
            // Try default export
            if (this.sdk.default) {
                if (typeof this.sdk.default.isHost === 'function') {
                    return !!this.sdk.default.isHost();
                }
                if (typeof this.sdk.default.amIHost === 'function') {
                    return !!this.sdk.default.amIHost();
                }
            }
        }

        const me = this.getMyPlayer();
        if (me && me.isHost === true) return true;

        const modeState = getModeState();
        if (modeState.coopAction === COOP_ACTIONS.JOIN) return false;
        if (modeState.coopAction === COOP_ACTIONS.CREATE) return true;

        return this.getPlayerCount() <= 1;
    }

    getMyPlayer() {
        if (this.sdk) {
            // Try primary method names
            if (typeof this.sdk.myPlayer === 'function') {
                return this.sdk.myPlayer();
            }
            // Try alternative method name used in some versions
            if (typeof this.sdk.me === 'function') {
                return this.sdk.me();
            }
            // Try default export
            if (this.sdk.default) {
                if (typeof this.sdk.default.myPlayer === 'function') {
                    return this.sdk.default.myPlayer();
                }
                if (typeof this.sdk.default.me === 'function') {
                    return this.sdk.default.me();
                }
            }
        }

        if (!this.localFallbackPlayers.has('local')) {
            this.localFallbackPlayers.set('local', { id: 'local', state: {}, setState: () => {}, getState: () => ({}) });
        }
        return this.localFallbackPlayers.get('local');
    }

    getPlayers() {
        if (this.sdk) {
            // Try primary method name
            if (typeof this.sdk.getPlayers === 'function') {
                const players = this.sdk.getPlayers() || [];
                
                // Debug log every 120 frames to see if player list changes
                if (!this._getPlayers_frameCount) this._getPlayers_frameCount = 0;
                this._getPlayers_frameCount++;
                if (this._getPlayers_frameCount % 120 === 0) {
                    console.log('[PlayroomService.getPlayers] SDK.getPlayers() returned:', players.length, 'players');
                }
                
                return players;
            }

            // Try alternative method name used in some versions
            if (typeof this.sdk.getParticipants === 'function') {
                const players = this.sdk.getParticipants() || [];
                
                if (!this._getPlayers_frameCount) this._getPlayers_frameCount = 0;
                this._getPlayers_frameCount++;
                if (this._getPlayers_frameCount % 120 === 0) {
                    console.log('[PlayroomService.getPlayers] SDK.getParticipants() returned:', players.length, 'players');
                }
                
                return players;
            }

            // Try default export
            if (this.sdk.default) {
                if (typeof this.sdk.default.getPlayers === 'function') {
                    const players = this.sdk.default.getPlayers() || [];
                    
                    if (!this._getPlayers_frameCount) this._getPlayers_frameCount = 0;
                    this._getPlayers_frameCount++;
                    if (this._getPlayers_frameCount % 120 === 0) {
                        console.log('[PlayroomService.getPlayers] SDK.default.getPlayers() returned:', players.length, 'players');
                    }
                    
                    return players;
                }

                if (typeof this.sdk.default.getParticipants === 'function') {
                    const players = this.sdk.default.getParticipants() || [];
                    
                    if (!this._getPlayers_frameCount) this._getPlayers_frameCount = 0;
                    this._getPlayers_frameCount++;
                    if (this._getPlayers_frameCount % 120 === 0) {
                        console.log('[PlayroomService.getPlayers] SDK.default.getParticipants() returned:', players.length, 'players');
                    }
                    
                    return players;
                }
            }
        }

        const fallback = Array.from(this.localFallbackPlayers.values());
        if (!this._getPlayers_frameCount) this._getPlayers_frameCount = 0;
        this._getPlayers_frameCount++;
        if (this._getPlayers_frameCount % 120 === 0) {
            console.log('[PlayroomService.getPlayers] Using fallback, returning:', fallback.length, 'players');
        }
        return fallback;
    }

    getPlayerCount() {
        return this.getPlayers().length;
    }

    getMaxPlayers() {
        // Try to get maxPlayers from SDK
        if (this.sdk?.getMaxPlayers && typeof this.sdk.getMaxPlayers === 'function') {
            return this.sdk.getMaxPlayers();
        }
        if (this.sdk?.default?.getMaxPlayers && typeof this.sdk.default.getMaxPlayers === 'function') {
            return this.sdk.default.getMaxPlayers();
        }
        // Default to 4 if we can't get from SDK
        return 4;
    }

    isLobbyFull() {
        return this.getPlayerCount() >= this.getMaxPlayers();
    }

    setPlayerGhostSelection(playerId, ghostType) {
        this.playerGhostSelections.set(playerId, ghostType);
    }

    getPlayerGhostSelection(playerId) {
        return this.playerGhostSelections.get(playerId) || null;
    }

    allPlayersHaveSelectedGhost() {
        const players = this.getPlayers();
        
        // Check if each player has a ghost selection
        for (const player of players) {
            const playerId = player.id || player.playerId || 'unknown';
            const ghostSelection = this.getPlayerGhostSelection(playerId);
            
            if (!ghostSelection) {
                return false;
            }
        }
        
        return true;
    }

    getMissingGhostSelections() {
        const players = this.getPlayers();
        const missing = [];
        
        for (const player of players) {
            const playerId = player.id || player.playerId || 'unknown';
            const ghostSelection = this.getPlayerGhostSelection(playerId);
            
            if (!ghostSelection) {
                const playerName = player.name || player.nickname || `Player ${playerId.slice(-4)}`;
                missing.push(playerName);
            }
        }
        
        return missing;
    }

    onPlayerJoin(callback) {
        const onPlayerJoinFunc = this.sdk?.onPlayerJoin || this.sdk?.default?.onPlayerJoin;
        if (typeof onPlayerJoinFunc === 'function') {
            onPlayerJoinFunc(callback);
        }
    }

    syncLocalPlayerState(localState = {}) {
        const me = this.getMyPlayer();
        if (!me) {
            console.warn('[PlayroomService.syncLocalPlayerState] No player found');
            return;
        }
        
        if (typeof me.setState !== 'function') {
            console.warn('[PlayroomService.syncLocalPlayerState] Player has no setState method');
            return;
        }

        const payload = {
            x: localState.x ?? 0,
            y: localState.y ?? 0,
            rotation: localState.rotation ?? 0,
            activeItem: localState.activeItem || null,
            flashlightOn: !!localState.flashlightOn,
            sanity: localState.sanity ?? 100
        };

        // THE FIX: Initialize with impossible values so the first frame ALWAYS triggers an update
        if (!this._lastLocalState) {
            this._lastLocalState = { 
                x: -9999, 
                y: -9999, 
                rotation: -9999, 
                activeItem: null, 
                flashlightOn: null, 
                sanity: -1 
            };
        }
        
        const hasChanged = 
            Math.abs(this._lastLocalState.x - payload.x) > 0.5 ||
            Math.abs(this._lastLocalState.y - payload.y) > 0.5 ||
            Math.abs(this._lastLocalState.rotation - payload.rotation) > 0.1 ||
            this._lastLocalState.activeItem !== payload.activeItem ||
            this._lastLocalState.flashlightOn !== payload.flashlightOn ||
            this._lastLocalState.sanity !== payload.sanity;

        if (hasChanged) {
            // Push the data to the server
            me.setState('playerData', payload);
            
            // Update the cache so we can compare against it next frame
            this._lastLocalState = { ...payload };
        }
    }

    getRemotePlayerStates() {
        const players = this.getPlayers();
        const me = this.getMyPlayer();
        const myId = me && (me.id || me.playerId || 'local');
        const remotes = [];

        for (const player of players) {
            const id = player.id || player.playerId || 'unknown';
            if (id === myId) continue;

            // FIX: getState() requires a key argument. Use 'playerData' to get per-participant state
            const state = typeof player.getState === 'function'
                ? (player.getState('playerData') || {})
                : (player.state || {});

            const displayName = player.name
                || player.nickname
                || player.username
                || player.displayName
                || `Player ${id.slice(-4)}`;

            const remoteData = {
                id,
                name: displayName,
                x: state.x ?? 0,
                y: state.y ?? 0,
                rotation: state.rotation ?? 0,
                activeItem: state.activeItem || null,
                flashlightOn: !!state.flashlightOn,
                sanity: state.sanity ?? 100,
                timestamp: state.timestamp || 0
            };

            remotes.push(remoteData);
        }

        return remotes;
    }

    getAverageSanity(localSanity = 100) {
        const remotes = this.getRemotePlayerStates();
        const sanitySumWithLocal = remotes.reduce((sum, p) => sum + (p.sanity ?? 100), 0) + localSanity;
        const totalPlayers = remotes.length + 1;
        const averageSanity = sanitySumWithLocal / totalPlayers;
        return averageSanity;
    }

    requestDoorToggle(doorId) {
        // Use direct RPC broadcast instead of queuing to host
        // This ensures instant synchronization for all players
        return this.callRPC('toggleDoor', { doorId });
    }

    requestPickup(itemId) {
        return this.sendHostRequest('pickup', { itemId });
    }

    requestPlaceDots(data) {
        return this.sendHostRequest('placeDots', data || {});
    }

    requestLightToggle(switchId) {
        // Use direct RPC broadcast instead of queuing to host
        // This ensures instant synchronization for all players
        return this.callRPC('toggleLight', { switchId });
    }

    sendHostRequest(type, payload) {
        if (!type) return false;

        const rpcPayload = {
            type,
            payload,
            senderId: this.getMyPlayerId(),
            timestamp: Date.now()
        };

        const RpcObj = this.sdk?.RPC || this.sdk?.default?.RPC;
        const RpcFunc = this.sdk?.RPC || this.sdk?.default?.RPC;
        const rpcFunc = this.sdk?.rpc || this.sdk?.default?.rpc;

        // Prefer the same RPC API shape used everywhere else in this project.
        // We broadcast the request and let only the host enqueue/process it.
        if (RpcObj && RpcObj.call && typeof RpcObj.call === 'function') {
            RpcObj.call('hostRequest', rpcPayload, RpcObj.Mode.ALL);
            return true;
        }

        if (typeof RpcFunc === 'function') {
            RpcFunc('hostRequest', rpcPayload, { target: 'HOST' });
            return true;
        }

        if (typeof rpcFunc === 'function') {
            rpcFunc('hostRequest', rpcPayload, { target: 'HOST' });
            return true;
        }

        if (this.isHost()) {
            this.hostRequestQueue.push(rpcPayload);
            return true;
        }

        return false;
     }

    registerRPC(name, handler) {
        if (!this.sdk && !this.sdk?.default) return;
        
        const RpcObj = this.sdk?.RPC || this.sdk?.default?.RPC;
        if (RpcObj && RpcObj.register && typeof RpcObj.register === 'function') {
            RpcObj.register(name, handler);
        }
    }

    callRPC(name, data, mode = 'ALL') {
        if (!this.sdk && !this.sdk?.default) return false;
        
        const RpcObj = this.sdk?.RPC || this.sdk?.default?.RPC;
        if (RpcObj && RpcObj.call && typeof RpcObj.call === 'function') {
            // Convert mode string to RpcObj.Mode value
            const rpcMode = RpcObj.Mode[mode] || RpcObj.Mode.ALL;
            RpcObj.call(name, data, rpcMode);
            return true;
        }
        return false;
    }

    drainHostRequests() {
        if (!this.isHost()) return [];
        const drained = this.hostRequestQueue.slice();
        this.hostRequestQueue.length = 0;
        return drained;
    }

    onState(key, handler) {
        const onStateFunc = this.sdk?.onState || this.sdk?.default?.onState;
        if (typeof onStateFunc === 'function') {
            onStateFunc(key, handler);
        }
    }


    setGlobalState(key, value) {
        const setStateFunc = this.sdk?.setState || this.sdk?.default?.setState;
        if (typeof setStateFunc === 'function') {
            setStateFunc(key, value);
        } else {
            this.sharedState[key] = value;
        }
    }

    updateHostSharedState(partialState = {}) {
        if (!this.isHost()) {
            return this.sharedState;
        }

        this.sharedState = {
            ...this.sharedState,
            ...partialState
        };

        const setStateFunc = this.sdk?.setState || this.sdk?.default?.setState;
        if (typeof setStateFunc === 'function') {
            setStateFunc('world', this.sharedState);
        } else {
            console.warn('[PlayroomService.updateHostSharedState] setState function not found');
        }

        return this.sharedState;
    }

    getSharedState() {
        const getStateFunc = this.sdk?.getState || this.sdk?.default?.getState;
        if (typeof getStateFunc === 'function') {
            const worldState = getStateFunc('world');
            if (worldState) return worldState;
        }
        return this.sharedState;
    }

    bindRpcHandlers() {
        if (this.rpcBound) {
            return;
        }

        // Register RPC for handling host requests from clients
        this.registerRPC('hostRequest', (data) => {
            if (this.isHost() && this.hostRequestQueue) {
                this.hostRequestQueue.push(data);
            }
        });

        // Register RPC for ghost state updates
        this.registerRPC('ghostUpdate', (data) => {
            this.sharedState.ghost = data;
        });

        // Register RPC for hunt updates
        this.registerRPC('huntUpdate', (data) => {
            this.sharedState.hunts = data;
        });

        // Subscribe to global state changes
        this.onState('world', (state) => {
            if (state) {
                this.sharedState = { ...state };
            }
        });

        this.rpcBound = true;
    }

    getMyPlayerId() {
        const me = this.getMyPlayer();
        if (!me) return 'unknown';
        return me.id || me.playerId || 'local';
    }

    getRoomCodeFromSdk() {
        if (!this.sdk) return '';
        
        const getRoomCodeFunc = this.sdk.getRoomCode || this.sdk.default?.getRoomCode;
        if (typeof getRoomCodeFunc === 'function') return getRoomCodeFunc() || '';
        if (typeof this.sdk.roomCode === 'string') return this.sdk.roomCode;
        if (typeof this.sdk.default?.roomCode === 'string') return this.sdk.default.roomCode;

        const modeState = getModeState();
        return modeState.roomCode || '';
    }
}


export const playroomService = new PlayroomService();
