export const GAME_MODES = {
    SINGLE: 'single',
    COOP: 'coop'
};

export const COOP_ACTIONS = {
    NONE: 'none',
    CREATE: 'create',
    JOIN: 'join'
};

let selectedGameMode = GAME_MODES.SINGLE;
let selectedCoopAction = COOP_ACTIONS.NONE;
let selectedRoomCode = '';

export function setGameMode(mode) {
    if (mode !== GAME_MODES.SINGLE && mode !== GAME_MODES.COOP) {
        return;
    }
    selectedGameMode = mode;

    if (mode === GAME_MODES.SINGLE) {
        selectedCoopAction = COOP_ACTIONS.NONE;
        selectedRoomCode = '';
    }
}

export function getGameMode() {
    return selectedGameMode;
}

export function setCoopAction(action) {
    if (action !== COOP_ACTIONS.NONE && action !== COOP_ACTIONS.CREATE && action !== COOP_ACTIONS.JOIN) {
        return;
    }
    selectedCoopAction = action;
}

export function getCoopAction() {
    return selectedCoopAction;
}

export function setRoomCode(code) {
    selectedRoomCode = (code || '').toUpperCase().slice(0, 6);
}

export function getRoomCode() {
    return selectedRoomCode;
}

export function clearCoopState() {
    selectedCoopAction = COOP_ACTIONS.NONE;
    selectedRoomCode = '';
}

export function getModeState() {
    return {
        gameMode: selectedGameMode,
        coopAction: selectedCoopAction,
        roomCode: selectedRoomCode
    };
}
