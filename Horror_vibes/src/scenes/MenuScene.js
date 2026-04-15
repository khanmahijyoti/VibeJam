import {
    GAME_MODES,
    COOP_ACTIONS,
    setGameMode,
    setCoopAction,
    setRoomCode,
    clearCoopState
} from '../config/gameMode.js';
import { playroomService } from '../services/PlayroomService.js';

export class MenuScene extends Phaser.Scene {
    constructor() {
        super('Menu');
    }

    create() {
        const { width, height } = this.scale;
        this.width = width;
        this.height = height;
        this.currentView = 'main';
        this.joinCodeValue = '';
        this.createCodeValue = '';
        this.createCodeText = null;
        this.joinResponseText = null;
        this.createResponseText = null;
        this.coopBusy = false;

        this.input.keyboard.on('keydown', this.handleJoinInput, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.input.keyboard.off('keydown', this.handleJoinInput, this);
        });

        this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x050505);
        this.add.rectangle(width * 0.5, height * 0.5, width * 0.86, height * 0.78, 0x121212, 0.96).setStrokeStyle(2, 0x37322b);

        this.add.text(width * 0.5, height * 0.27, 'HORROR VIBES', {
            fontFamily: 'monospace',
            fontSize: '44px',
            color: '#d8d0c0',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.subtitleText = this.add.text(width * 0.5, height * 0.35, 'Select Game Mode', {
            fontFamily: 'monospace',
            fontSize: '20px',
            color: '#9b9388'
        }).setOrigin(0.5);

        this.panelContainer = this.add.container(0, 0);

        this.showMainMenu();
    }

    clearPanel() {
        this.panelContainer.removeAll(true);
        this.joinCodeText = null;
        this.createCodeText = null;
        this.joinResponseText = null;
        this.createResponseText = null;
    }

    showMainMenu() {
        this.currentView = 'main';
        setGameMode(GAME_MODES.SINGLE);
        clearCoopState();
        this.clearPanel();
        this.subtitleText.setText('Select Game Mode');

        this.panelContainer.add(this.createButton(this.width * 0.5, this.height * 0.5, 'Single Player', () => {
            setGameMode(GAME_MODES.SINGLE);
            this.scene.start('Start');
        }));

        this.panelContainer.add(this.createButton(this.width * 0.5, this.height * 0.63, 'Co-op', () => {
            setGameMode(GAME_MODES.COOP);
            clearCoopState();
            this.showCoopMenu();
        }));
    }

    showCoopMenu() {
        this.currentView = 'coop';
        this.clearPanel();
        this.subtitleText.setText('Co-op Lobby Options');

        this.panelContainer.add(this.createButton(this.width * 0.5, this.height * 0.48, 'Create Lobby', () => {
            this.startCoopSession(COOP_ACTIONS.CREATE, '', this.subtitleText);
        }));

        this.panelContainer.add(this.createButton(this.width * 0.5, this.height * 0.58, 'Join with Code', () => {
            this.openJoinWithCode();
        }));

        this.panelContainer.add(this.createButton(this.width * 0.5, this.height * 0.68, 'Back', () => {
            clearCoopState();
            this.showMainMenu();
        }, 240));
    }

    // Removed openCreateLobby

    openJoinWithCode() {
        this.currentView = 'join';
        this.clearPanel();
        this.subtitleText.setText('Join with Code');

        setGameMode(GAME_MODES.COOP);
        setCoopAction(COOP_ACTIONS.JOIN);
        setRoomCode('');
        this.joinCodeValue = '';

        const panel = this.add.rectangle(this.width * 0.5, this.height * 0.56, 620, 280, 0x181818, 0.98)
            .setStrokeStyle(2, 0x6a645b);

        const instruction = this.add.text(this.width * 0.5, this.height * 0.47, 'Type room code (4-6 letters/numbers)', {
            fontFamily: 'monospace',
            fontSize: '18px',
            color: '#b8b0a1'
        }).setOrigin(0.5);

        this.joinCodeText = this.add.text(this.width * 0.5, this.height * 0.56, '------', {
            fontFamily: 'monospace',
            fontSize: '44px',
            color: '#f8edd7',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.joinResponseText = this.add.text(this.width * 0.5, this.height * 0.64, '', {
            fontFamily: 'monospace',
            fontSize: '16px',
            color: '#c9c2b3'
        }).setOrigin(0.5);

        this.panelContainer.add([panel, instruction, this.joinCodeText, this.joinResponseText]);
        this.panelContainer.add(this.createButton(this.width * 0.43, this.height * 0.74, 'Submit', () => {
            this.submitJoinCode();
        }, 210));
        this.panelContainer.add(this.createButton(this.width * 0.57, this.height * 0.74, 'Back', () => {
            setCoopAction(COOP_ACTIONS.NONE);
            setRoomCode('');
            this.showCoopMenu();
        }, 210));
    }

    createButton(x, y, label, onClick, width = 320) {
        const bg = this.add.rectangle(x, y, width, 62, 0x171717, 1)
            .setStrokeStyle(2, 0x6a645b)
            .setInteractive({ useHandCursor: true });

        const text = this.add.text(x, y, label, {
            fontFamily: 'monospace',
            fontSize: '26px',
            color: '#e8decb'
        }).setOrigin(0.5);

        bg.on('pointerover', () => {
            bg.setFillStyle(0x26231f, 1);
            text.setColor('#fff5df');
        });

        bg.on('pointerout', () => {
            bg.setFillStyle(0x171717, 1);
            text.setColor('#e8decb');
        });

        bg.on('pointerdown', onClick);

        return [bg, text];
    }

    handleJoinInput(event) {
        if (this.currentView !== 'join' || !this.joinCodeText) return;

        if (event.keyCode === Phaser.Input.Keyboard.KeyCodes.BACKSPACE) {
            this.joinCodeValue = this.joinCodeValue.slice(0, -1);
            this.refreshJoinCodeText();
            return;
        }

        if (event.keyCode === Phaser.Input.Keyboard.KeyCodes.ENTER) {
            this.submitJoinCode();
            return;
        }

        if (!event.key || event.key.length !== 1) return;
        if (!/^[a-zA-Z0-9]$/.test(event.key)) return;
        if (this.joinCodeValue.length >= 6) return;

        this.joinCodeValue += event.key.toUpperCase();
        this.refreshJoinCodeText();
    }

    refreshJoinCodeText() {
        if (!this.joinCodeText) return;

        const padded = (this.joinCodeValue + '------').slice(0, 6);
        this.joinCodeText.setText(padded);

        if (this.joinResponseText) {
            this.joinResponseText.setText('');
        }
    }

    submitJoinCode() {
        if (this.currentView !== 'join' || !this.joinResponseText) return;

        const code = this.joinCodeValue.trim();
        if (code.length < 4) {
            this.joinResponseText.setText('Enter at least 4 characters');
            return;
        }

        const finalCode = code.slice(0, 6).toUpperCase();
        setCoopAction(COOP_ACTIONS.JOIN);
        setRoomCode(finalCode);
        this.startCoopSession(COOP_ACTIONS.JOIN, finalCode, this.joinResponseText);
    }

    async startCoopSession(action, roomCode, statusText) {
        if (this.coopBusy) return;
        this.coopBusy = true;

        if (statusText) {
            statusText.setText('Opening Playroom lobby...');
        }

        try {
            const result = await playroomService.initLobby({
                mode: GAME_MODES.COOP,
                action,
                roomCode,
                maxPlayers: 4
            });

            if (result && result.fallback) {
                if (statusText) {
                    statusText.setText('Playroom unavailable on this device');
                }
                return;
            }

            if (action === COOP_ACTIONS.CREATE) {
                const resolvedCode = (result && result.roomCode) ? result.roomCode : '------';
                setRoomCode(resolvedCode);
                this.scene.start('Start');
                return;
            }

            if (statusText) {
                statusText.setText('Connected. Starting game...');
            }

            this.scene.start('Start');
        } catch (error) {
            console.warn('[MenuScene] Failed to initialize co-op lobby', error);
            if (statusText) {
                statusText.setText('Could not open lobby. Please try again.');
            }
        } finally {
            this.coopBusy = false;
        }
    }

}
