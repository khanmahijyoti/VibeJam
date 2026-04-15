export const GAME_CONFIG = {
    world: {
        width: 1200,
        height: 1200
    },
    player: {
        speed: 200,
        spawn: { x: 400, y: 1100 },
        radius: 16
    },
    camera: {
        zoom: 1.5,
        followLerpX: 0.05,
        followLerpY: 0.05
    },
    evidence: {
        baseTempCelsius: 18.5,
        uvRange: 130,
        uvFieldOfView: Math.PI / 2.5,
        emfRange: 120,
        emfSourceDurationMs: 20000,
        emfLevel5Chance: 0.25
    },
    lighting: {
        darknessAlpha: 0.99,
        rayCount: 120,
        fieldOfView: Math.PI / 3.5,
        defaultRayLength: 600,
        uvRayLength: 160
    },
    sanity: {
        start: 100,
        drainInDarkness: 0.03,
        recoveryInLight: 0.015
    }
};
