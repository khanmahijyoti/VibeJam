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

        if (!this.sdk || typeof this.sdk.insertCoin !== 'function') {
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

        await this.sdk.insertCoin(coinConfig);
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
        if (this.sdk) return this.sdk;

        if (window.PlayroomKit) {
            this.sdk = window.PlayroomKit;
            return this.sdk;
        }

        try {
            const mod = await import('https://cdn.jsdelivr.net/npm/playroomkit@latest/+esm');
            this.sdk = mod;
        } catch (error) {
            console.warn('[PlayroomService] Playroom SDK load failed, using fallback mode.', error);
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
        if (this.sdk && typeof this.sdk.isHost === 'function') {
            return !!this.sdk.isHost();
        }

        const me = this.getMyPlayer();
        if (me && me.isHost === true) return true;

        return true;
    }

    getMyPlayer() {
        if (this.sdk) {
            if (typeof this.sdk.myPlayer === 'function') {
                return this.sdk.myPlayer();
            } else if (typeof this.sdk.me === 'function') {
                return this.sdk.me();
            }
        }

        if (!this.localFallbackPlayers.has('local')) {
            this.localFallbackPlayers.set('local', { id: 'local', state: {} });
        }
        return this.localFallbackPlayers.get('local');
    }

    getPlayers() {
        if (this.sdk) {
            if (typeof this.sdk.getPlayers === 'function') {
                return this.sdk.getPlayers() || [];
            } else if (typeof this.sdk.getParticipants === 'function') {
                return this.sdk.getParticipants() || [];
            }
        }

        return Array.from(this.localFallbackPlayers.values());
    }

    onPlayerJoin(callback) {
        if (this.sdk && typeof this.sdk.onPlayerJoin === 'function') {
            this.sdk.onPlayerJoin(callback);
        }
    }

    syncLocalPlayerState(localState = {}) {
        const me = this.getMyPlayer();
        if (!me || typeof me.setState !== 'function') return;

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

            const state = typeof player.getState === 'function'
                ? (player.getState() || {})
                : (player.state || {});

            const displayName = player.name
                || player.nickname
                || player.username
                || player.displayName
                || `Player ${id.slice(-4)}`;

            remotes.push({
                id,
                name: displayName,
                x: state.x ?? 0,
                y: state.y ?? 0,
                rotation: state.rotation ?? 0,
                activeItem: state.activeItem || null,
                flashlightOn: !!state.flashlightOn,
                timestamp: state.timestamp || 0
            });
        }

        return remotes;
    }

    requestDoorToggle(doorId) {
        return this.sendHostRequest('doorToggle', { doorId });
    }

    requestPickup(itemId) {
        return this.sendHostRequest('pickup', { itemId });
    }

    requestPlaceDots(data) {
        return this.sendHostRequest('placeDots', data || {});
    }

    requestLightToggle(switchId) {
        return this.sendHostRequest('lightToggle', { switchId });
    }

    sendHostRequest(type, payload) {
        if (!type) return false;

        const rpcPayload = {
            type,
            payload,
            senderId: this.getMyPlayerId(),
            timestamp: Date.now()
        };

        if (this.sdk && typeof this.sdk.RPC === 'function') {
            this.sdk.RPC('hostRequest', rpcPayload, { target: 'HOST' });
            return true;
        }

        if (this.sdk && typeof this.sdk.rpc === 'function') {
            this.sdk.rpc('hostRequest', rpcPayload, { target: 'HOST' });
            return true;
        }

        if (this.isHost()) {
            this.hostRequestQueue.push(rpcPayload);
            return true;
        }

        return false;
    }

    bindRpcHandlers() {
        if (!this.sdk || this.rpcBound) return;

        if (typeof this.sdk.RPC === 'function') {
            this.sdk.RPC('hostRequest', (packet) => {
                if (!this.isHost()) return;
                this.hostRequestQueue.push(packet);
            });
            this.rpcBound = true;
            return;
        }

        if (typeof this.sdk.rpc === 'function' && typeof this.sdk.onRPC === 'function') {
            this.sdk.onRPC('hostRequest', (packet) => {
                if (!this.isHost()) return;
                this.hostRequestQueue.push(packet);
            });
            this.rpcBound = true;
        }
    }

    drainHostRequests() {
        if (!this.isHost()) return [];
        const drained = this.hostRequestQueue.slice();
        this.hostRequestQueue.length = 0;
        return drained;
    }

    registerRPC(name, handler) {
        if (!this.sdk) return;
        if (this.sdk.RPC && typeof this.sdk.RPC.register === 'function') {
            this.sdk.RPC.register(name, handler);
        }
    }

    callRPC(name, data) {
        if (!this.sdk) return false;
        if (this.sdk.RPC && typeof this.sdk.RPC.call === 'function') {
            this.sdk.RPC.call(name, data, this.sdk.RPC.Mode.ALL);
            return true;
        }
        return false;
    }

    onState(key, handler) {
        if (this.sdk && typeof this.sdk.onState === 'function') {
            this.sdk.onState(key, handler);
        }
    }

    setGlobalState(key, value) {
        if (this.sdk && typeof this.sdk.setState === 'function') {
            this.sdk.setState(key, value);
        } else {
            this.sharedState[key] = value;
        }
    }

    updateHostSharedState(partialState = {}) {
        if (!this.isHost()) return this.sharedState;

        this.sharedState = {
            ...this.sharedState,
            ...partialState
        };

        if (this.sdk && typeof this.sdk.setState === 'function') {
            this.sdk.setState('world', this.sharedState);
        }

        return this.sharedState;
    }

    getSharedState() {
        if (this.sdk && typeof this.sdk.getState === 'function') {
            const worldState = this.sdk.getState('world');
            if (worldState) return worldState;
        }
        return this.sharedState;
    }

    getMyPlayerId() {
        const me = this.getMyPlayer();
        if (!me) return 'unknown';
        return me.id || me.playerId || 'local';
    }

    getRoomCodeFromSdk() {
        if (!this.sdk) return '';
        if (typeof this.sdk.getRoomCode === 'function') return this.sdk.getRoomCode() || '';
        if (typeof this.sdk.roomCode === 'string') return this.sdk.roomCode;

        const modeState = getModeState();
        return modeState.roomCode || '';
    }
}

export const playroomService = new PlayroomService();
