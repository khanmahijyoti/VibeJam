export class Hud {
    constructor(scene, inventory) {
        this.scene = scene;
        this.inventory = inventory;

        this.uiContainer = scene.add.container(20, 20);
        this.uiContainer.setDepth(1000);

        this.slotVisuals = [];
        for (let i = 0; i < this.inventory.length; i++) {
            const item = this.inventory[i];
            const bg = scene.add.rectangle(i * 120, 0, 110, 40, 0x222222, 0.9).setOrigin(0, 0);
            const txt = scene.add.text(i * 120 + 10, 12, `${i + 1}: ${item ? item.displayName : 'Empty'}`, {
                fontSize: '14px',
                fontFamily: 'Arial',
                color: '#aaaaaa'
            });
            this.slotVisuals.push({ bg, txt });
            this.uiContainer.add([bg, txt]);
        }

        // --- Visual EMF Reader Setup ---
        this.emfContainer = scene.add.container(0, 0);
        this.emfContainer.setDepth(1000);
        this.emfContainer.setVisible(false);

        // Reader Body
        const emfBg = scene.add.rectangle(0, 0, 60, 240, 0x1a1a1a, 0.95);
        emfBg.setStrokeStyle(2, 0x333333);
        const emfLabel = scene.add.text(0, -100, 'EMF', {
            fontSize: '14px',
            fontFamily: 'monospace',
            color: '#888888',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        
        this.emfContainer.add([emfBg, emfLabel]);
        
        this.emfLights = [];
        // Lights (from bottom to top generally, or top to bottom. Let's do level 1 at bottom)
        const lightColors = [0x0088ff, 0x00ff00, 0xffff00, 0xff8800, 0xff0000];
        // Y positions from bottom (-1 level) up to top (5 level)
        const lightYOffsets = [70, 35, 0, -35, -70];

        for (let i = 0; i < 5; i++) {
            // Dim inactive light
            const lightBg = scene.add.circle(0, lightYOffsets[i], 10, lightColors[i], 0.15);
            // Glowing active light
            const lightGlow = scene.add.circle(0, lightYOffsets[i], 10, lightColors[i], 1);
            lightGlow.setVisible(false);
            
            // Subtle pulse tween for active lights
            scene.tweens.add({
                targets: lightGlow,
                alpha: { from: 1, to: 0.6 },
                duration: 150 + Math.random() * 100,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });

            this.emfContainer.add([lightBg, lightGlow]);
            this.emfLights.push({ bg: lightBg, glow: lightGlow });
        }
        // -------------------------------

        this.thermoText = scene.add.text(20, 70, 'Temp: 18.5C', {
            fontSize: '18px',
            fontFamily: 'Arial',
            color: '#ffffff',
            fontStyle: 'bold'
        });
        this.thermoText.setDepth(1000);
        this.thermoText.setVisible(false);

        this.uvText = scene.add.text(20, 70, 'UV Lamp: OFF', {
            fontSize: '18px',
            fontFamily: 'Arial',
            color: '#b05eff',
            fontStyle: 'bold'
        });
        this.uvText.setDepth(1000);
        this.uvText.setVisible(false);

        const gameWide = scene.sys.game.config.width;
        this.roomNameText = scene.add.text(gameWide / 2, 20, 'OUTSIDE', {
            fontSize: '22px',
            fontFamily: 'Arial',
            color: '#ffffff',
            fontStyle: 'bold',
            align: 'center'
        });
        this.roomNameText.setOrigin(0.5, 0);
        this.roomNameText.setDepth(1000);

        this.sanityText = scene.add.text(gameWide - 20, 20, 'Sanity: 100%', {
            fontSize: '20px',
            fontFamily: 'Arial',
            color: '#ffffff',
            fontStyle: 'bold'
        });
        this.sanityText.setOrigin(1, 0);
        this.sanityText.setDepth(1000);

        this.roomCodeText = scene.add.text(gameWide - 20, 50, '', {
            fontSize: '18px',
            fontFamily: 'monospace',
            color: '#aaaaaa',
            fontStyle: 'bold'
        });
        this.roomCodeText.setOrigin(1, 0);
        this.roomCodeText.setDepth(1000);
        this.roomCodeText.setVisible(false);

        this.huntText = scene.add.text(gameWide / 2, 50, 'HUNT', {
            fontSize: '20px',
            fontFamily: 'Arial',
            color: '#ff5555',
            fontStyle: 'bold',
            align: 'center'
        });
        this.huntText.setOrigin(0.5, 0);
        this.huntText.setDepth(1000);
        this.huntText.setVisible(false);

        this.stairPromptText = scene.add.text(0, 0, '', {
            fontSize: '18px',
            fontFamily: 'Arial',
            color: '#ffff00',
            fontStyle: 'bold',
            align: 'center'
        });
        this.stairPromptText.setOrigin(0.5, 0.5);
        this.stairPromptText.setDepth(1001);
        this.stairPromptText.setVisible(false);
    }

    setActiveSlot(activeSlot) {
        for (let i = 0; i < this.slotVisuals.length; i++) {
            const visual = this.slotVisuals[i];
            const item = this.inventory[i];
            if (i === activeSlot) {
                visual.bg.setStrokeStyle(3, 0xffcc00);
                visual.txt.setColor('#ffffff');
                visual.txt.setFontStyle('bold');
            } else {
                visual.bg.setStrokeStyle(1, 0x555555);
                visual.txt.setColor('#aaaaaa');
                visual.txt.setFontStyle('normal');
            }
            visual.txt.setText(`${i + 1}: ${item ? item.displayName : 'Empty'}`);
        }
    }

    setToolReadout(toolId, state = {}) {
        this.emfContainer.setVisible(toolId === 'emf');
        this.thermoText.setVisible(toolId === 'thermometer');
        this.uvText.setVisible(toolId === 'uv');

        if (toolId === 'uv') {
            const isOn = !!state.uvOn;
            this.uvText.setText(`UV Lamp: ${isOn ? 'ON' : 'OFF'}`);
            this.uvText.setColor(isOn ? '#b05eff' : '#666666');
        }
    }

    setEmfLevel(level) {
        // Level logic: level 1 = 1st light, level 2 = 2 lights, etc.
        // We ensure level clamps to 1..5 for the EMF tool if active.
        const maxLevel = Math.max(1, Math.min(5, level));
        
        for (let i = 0; i < 5; i++) {
            const isActive = i < maxLevel;
            // The glow is visible if this level is reached
            this.emfLights[i].glow.setVisible(isActive);
            
            // To support future hunt interference (random flicker),
            // you could conditionally override this in a future update loop,
            // e.g., if (this.huntInterferenceActive) { ... random true/false ... }
        }
    }

    setTemperature(tempCelsius) {
        this.thermoText.setText(`Temp: ${tempCelsius.toFixed(1)}C`);
        if (tempCelsius < 5) this.thermoText.setColor('#00ffff');
        else if (tempCelsius < 15) this.thermoText.setColor('#88ccff');
        else this.thermoText.setColor('#ffffff');
    }

    setRoomName(roomName) {
        this.roomNameText.setText(roomName);
    }

    setSanity(sanityValue) {
        this.sanityText.setText(`Sanity: ${Math.floor(sanityValue)}%`);
    }

    setRoomCode(code) {
        if (code) {
            this.roomCodeText.setText(`ROOM: ${code}`);
            this.roomCodeText.setVisible(true);
        } else {
            this.roomCodeText.setVisible(false);
        }
    }

    setStairPromptVisible(visible) {
        if (!visible) {
            this.setInteractionPrompt('', false);
        }
    }

    setInteractionPrompt(text, visible) {
        this.stairPromptText.setText(text);
        this.stairPromptText.setVisible(visible);
    }

    setHuntActive(active) {
        this.huntText.setVisible(active);
    }

    layout(camera) {
        const invZoom = 1 / camera.zoom;

        this.uiContainer.setPosition(camera.worldView.x + 20 * invZoom, camera.worldView.y + 20 * invZoom);
        this.uiContainer.setScale(invZoom);

        this.emfContainer.setPosition(camera.worldView.right - 40 * invZoom, camera.worldView.centerY);
        this.emfContainer.setScale(invZoom);

        this.thermoText.setPosition(camera.worldView.x + 20 * invZoom, camera.worldView.y + 70 * invZoom);
        this.thermoText.setScale(invZoom);

        this.uvText.setPosition(camera.worldView.x + 20 * invZoom, camera.worldView.y + 70 * invZoom);
        this.uvText.setScale(invZoom);

        this.roomNameText.setPosition(camera.worldView.centerX, camera.worldView.y + 20 * invZoom);
        this.roomNameText.setScale(invZoom);

        this.sanityText.setPosition(camera.worldView.right - 20 * invZoom, camera.worldView.y + 20 * invZoom);
        this.sanityText.setScale(invZoom);

        this.roomCodeText.setPosition(camera.worldView.right - 20 * invZoom, camera.worldView.y + 45 * invZoom);
        this.roomCodeText.setScale(invZoom);

        this.huntText.setPosition(camera.worldView.centerX, camera.worldView.y + 52 * invZoom);
        this.huntText.setScale(invZoom);
    }

    layoutStairPrompt(camera) {
        const invZoom = 1 / camera.zoom;
        this.stairPromptText.setPosition(camera.worldView.centerX, camera.worldView.y + camera.worldView.height - 50 * invZoom);
        this.stairPromptText.setScale(invZoom);
    }
}
