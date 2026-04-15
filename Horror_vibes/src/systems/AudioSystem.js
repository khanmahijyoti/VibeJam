export class AudioSystem {
    constructor(scene) {
        this.scene = scene;
        this.loops = new Map();
        
        // Sound configuration / manifest
        this.sounds = {
            sfx: {
                // Doors
                'door-open': { path: 'assets/audio/world/door-opening.mp3', volume: 0.5 },
                'door-close': { path: 'assets/audio/world/door-close.mp3', volume: 0.5 },
                'flashlight-click': { path: 'assets/audio/world/flashlight-clicking-on.mp3', volume: 0.4 },
                'emf-5-warning': { path: 'assets/audio/world/warning.mp3', volume: 0.5 },
                
                // Interaction
                'item-pickup': { path: null, volume: 0.4 },      // Placeholder
                'switch-toggle': { path: null, volume: 0.3 },    // Placeholder
                'stair-transition': { path: null, volume: 0.5 }, // Placeholder
                
                // Ghost
                'ghost-manifest': { path: null, volume: 0.6 },   // Placeholder
                'hunt-start': { path: null, volume: 0.7 }        // Placeholder
            },
            loops: {
                'ambient-low': { path: null, volume: 0.2 },      // Placeholder
                'hunt-loop': { path: null, volume: 0.4 }         // Placeholder
            }
        };
    }

    preload() {
        // Load SFX
        for (const [key, config] of Object.entries(this.sounds.sfx)) {
            if (config.path) {
                this.scene.load.audio(key, config.path);
            }
        }

        // Load Loops
        for (const [key, config] of Object.entries(this.sounds.loops)) {
            if (config.path) {
                this.scene.load.audio(key, config.path);
            }
        }
    }

    playSfx(key, customConfig = {}) {
        if (!this.scene.cache.audio.exists(key)) {
            console.warn(`AudioSystem: Sound key "${key}" not found or not loaded.`);
            return null;
        }

        const defaultConfig = this.sounds.sfx[key] || {};
        const playConfig = {
            volume: customConfig.volume !== undefined ? customConfig.volume : (defaultConfig.volume || 1),
            detune: customConfig.detune !== undefined ? customConfig.detune : 0,
            ...customConfig
        };

        return this.scene.sound.play(key, playConfig);
    }

    playLoop(key, customConfig = {}) {
        if (!this.scene.cache.audio.exists(key)) {
            console.warn(`AudioSystem: Loop key "${key}" not found or not loaded.`);
            return null;
        }

        if (this.loops.has(key)) {
            return this.loops.get(key);
        }

        const defaultConfig = this.sounds.loops[key] || {};
        const loopConfig = {
            volume: customConfig.volume !== undefined ? customConfig.volume : (defaultConfig.volume || 1),
            loop: true,
            ...customConfig
        };

        const sound = this.scene.sound.add(key, loopConfig);
        sound.play();
        this.loops.set(key, sound);
        return sound;
    }

    stopLoop(key) {
        if (this.loops.has(key)) {
            const sound = this.loops.get(key);
            sound.stop();
            sound.destroy();
            this.loops.delete(key);
        }
    }

    setLoopVolume(key, volume) {
        if (this.loops.has(key)) {
            this.loops.get(key).setVolume(volume);
        }
    }
}
