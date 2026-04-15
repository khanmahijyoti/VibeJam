export class InteractionSystem {
    constructor(scene) {
        this.scene = scene;
        this.huntModeActive = false;
        this.exitDoorPoint = { x: 360, y: 1050 };
    }

    updateCurrentStairTarget() {
        this.scene.currentStairTarget = null;
        this.scene.currentPickupTarget = null;
        this.scene.currentExitTarget = null;

        let stairDist = 80;
        let pickupDist = 70;
        let exitDist = 80;

        for (const pickup of this.scene.equipmentPickups) {
            if (pickup.picked || pickup.floorIndex !== this.scene.currentFloorIndex) continue;

            const dist = Phaser.Math.Distance.Between(
                this.scene.player.x,
                this.scene.player.y,
                pickup.x,
                pickup.y
            );

            if (dist < pickupDist) {
                pickupDist = dist;
                this.scene.currentPickupTarget = pickup;
            }
        }

        for (const stair of this.scene.stairs) {
            if (stair.floorIndex !== this.scene.currentFloorIndex) continue;

            const dist = Phaser.Math.Distance.Between(
                this.scene.player.x,
                this.scene.player.y,
                stair.x,
                stair.y
            );

            if (dist < stairDist) {
                this.scene.currentStairTarget = stair;
                break;
            }
        }

        if (this.scene.vanExit && this.scene.vanExit.floorIndex === this.scene.currentFloorIndex) {
            const dist = Phaser.Math.Distance.Between(
                this.scene.player.x,
                this.scene.player.y,
                this.scene.vanExit.x,
                this.scene.vanExit.y
            );
            if (dist < exitDist) {
                this.scene.currentExitTarget = this.scene.vanExit;
            }
        }

        if (this.scene.currentPickupTarget) {
            if (this.findFirstEmptySlot() === -1) {
                this.scene.hud.setInteractionPrompt(`[E] Swap (${this.scene.activeSlot + 1}) with ${this.scene.currentPickupTarget.itemDef.displayName}`, true);
            } else {
                this.scene.hud.setInteractionPrompt(`[E] Pick Up ${this.scene.currentPickupTarget.itemDef.displayName}`, true);
            }
        } else if (this.scene.currentExitTarget) {
            if (!this.scene.journal || !this.scene.journal.guessedGhost) {
                this.scene.hud.setInteractionPrompt('Select a ghost in Journal to leave', true);
            } else {
                this.scene.hud.setInteractionPrompt('[E] Leave Area', true);
            }
        } else if (this.scene.currentStairTarget) {
            this.scene.hud.setInteractionPrompt('[E] Use Stairs', true);
        } else {
            this.scene.hud.setInteractionPrompt('', false);
        }
    }

    handleInteraction() {
        if (this.scene.currentExitTarget) {
            if (this.scene.journal && this.scene.journal.guessedGhost) {
                this.scene.triggerEndGame();
            }
            return;
        }

        if (this.scene.currentPickupTarget) {
            this.tryPickupEquipment(this.scene.currentPickupTarget);
            return;
        }

        if (this.scene.currentStairTarget) {
            this.scene.switchFloor(this.scene.currentStairTarget.targetFloor);
            this.scene.player.setPosition(
                this.scene.currentStairTarget.targetX,
                this.scene.currentStairTarget.targetY
            );
            return;
        }

        let closestItem = null;
        let itemType = '';
        let minDist = 120;

        for (const door of this.scene.doors) {
            if (door.floorIndex !== this.scene.currentFloorIndex) continue;

            const dist = Phaser.Math.Distance.Between(
                this.scene.player.x,
                this.scene.player.y,
                door.collider.x,
                door.collider.y
            );

            if (dist < minDist) {
                minDist = dist;
                closestItem = door;
                itemType = 'door';
            }
        }

        for (const sw of this.scene.switches) {
            if (sw.floorIndex !== this.scene.currentFloorIndex) continue;

            const dist = Phaser.Math.Distance.Between(
                this.scene.player.x,
                this.scene.player.y,
                sw.x,
                sw.y
            );

            if (dist < minDist) {
                minDist = dist;
                closestItem = sw;
                itemType = 'switch';
            }
        }

        if (!closestItem) return;
        if (itemType === 'door') this.handleDoorInteraction(closestItem);
        if (itemType === 'switch') this.handleSwitchInteraction(closestItem);
    }

    handleDoorInteraction(door) {
        if (!door) return;

        if (this.scene.isCoopMode && this.scene.requestDoorToggle) {
            this.scene.requestDoorToggle(door.networkId);
            return;
        }

        this.toggleDoor(door);
    }

    handleSwitchInteraction(sw) {
        if (!sw) return;

        if (this.scene.isCoopMode && this.scene.requestLightToggle) {
            this.scene.requestLightToggle(sw.networkId);
            return;
        }

        this.toggleSwitch(sw);
    }

    toggleDoor(door) {
        if (this.huntModeActive) {
            return;
        }

        if (door.isLocked) return;

        this.applyDoorState(door, !door.isOpen, door.isLocked, { playSfx: true });
    }

    applyDoorState(door, isOpen, isLocked, options = {}) {
        if (!door || !door.collider || !door.collider.body) return;

        const playSfx = options.playSfx !== false;
        const shouldAnimate = options.animate !== false;

        if (typeof isLocked === 'boolean') {
            door.isLocked = isLocked;
        }

        if (door.isOpen === isOpen) {
            if (door.isOpen) {
                door.collider.body.checkCollision.none = true;
            } else {
                door.collider.body.checkCollision.none = false;
            }
            return;
        }

        door.isOpen = !!isOpen;
        if (door.isOpen) {
            if (playSfx) {
                this.scene.audioSystem.playSfx('door-open', {
                    detune: Phaser.Math.Between(-150, 150)
                });
            }
            door.collider.body.checkCollision.none = true;
            if (shouldAnimate) {
                this.scene.tweens.add({ targets: door, rotation: Math.PI / 2, duration: 250 });
            } else {
                door.rotation = Math.PI / 2;
            }
        } else {
            if (playSfx) {
                this.scene.audioSystem.playSfx('door-close', {
                    detune: Phaser.Math.Between(-150, 150)
                });
            }
            door.collider.body.checkCollision.none = false;
            if (shouldAnimate) {
                this.scene.tweens.add({ targets: door, rotation: 0, duration: 250 });
            } else {
                door.rotation = 0;
            }
        }
    }

    toggleSwitch(sw) {
        const room = this.scene.rooms.find(
            r => r.name === sw.roomName && r.floorIndex === this.scene.currentFloorIndex
        );

        if (!room) return;
        this.applySwitchState(sw, !room.isLit, { playSfx: true });
    }

    applySwitchState(sw, isLit, options = {}) {
        if (!sw) return;

        const room = this.scene.rooms.find(
            r => r.name === sw.roomName && r.floorIndex === sw.floorIndex
        );

        if (!room) return;

        if (room.isLit === isLit) {
            sw.fillColor = room.isLit ? 0x00ff00 : 0xff0000;
            return;
        }

        room.isLit = !!isLit;
        sw.fillColor = room.isLit ? 0x00ff00 : 0xff0000;

        if (options.playSfx !== false) {
            this.scene.audioSystem.playSfx('switch-toggle');
        }
    }

    setHuntMode(active) {
        this.huntModeActive = active;

        if (active) {
            for (const door of this.scene.doors) {
                if (door.isOpen) {
                    door.isOpen = false;
                    door.collider.body.checkCollision.none = false;
                    this.scene.tweens.add({ targets: door, rotation: 0, duration: 120 });
                }

                door.isLocked = this.isExitDoor(door);
            }
            return;
        }

        for (const door of this.scene.doors) {
            door.isLocked = false;
        }
    }

    isExitDoor(door) {
        return Math.abs(door.x - this.exitDoorPoint.x) < 1 && Math.abs(door.y - this.exitDoorPoint.y) < 1;
    }

    findFirstEmptySlot() {
        for (let i = 0; i < this.scene.inventory.length; i++) {
            if (!this.scene.inventory[i]) return i;
        }
        return -1;
    }

    tryPickupEquipment(pickup) {
        if (!pickup || pickup.picked) return;

        const slotIndex = this.findFirstEmptySlot();
        if (slotIndex === -1) {
            this.swapWithActiveSlot(pickup);
            return;
        }

        this.scene.inventory[slotIndex] = {
            id: pickup.itemDef.id,
            displayName: pickup.itemDef.displayName,
            flashlightOn: pickup.itemDef.id === 'flashlight' ? !!pickup.itemDef.flashlightOn : false,
            uvOn: pickup.itemDef.id === 'uv' ? !!pickup.itemDef.uvOn : false
        };

        pickup.picked = true;
        if (this.scene.isCoopMode && pickup.networkId) {
            this.scene.notifyPickup(pickup.networkId);
        }
        this.scene.audioSystem.playSfx('item-pickup');
        if (pickup.visual) pickup.visual.setVisible(false);
        if (pickup.label) pickup.label.setVisible(false);
        this.scene.currentPickupTarget = null;

        this.syncSceneFlashlightStateFromInventory();
        this.scene.updateInventoryUI();
    }

    swapWithActiveSlot(pickup) {
        const activeSlot = this.scene.activeSlot;
        const activeItem = this.scene.inventory[activeSlot];
        if (!activeItem) return;

        const pickedItem = pickup.itemDef;
        this.scene.inventory[activeSlot] = {
            id: pickedItem.id,
            displayName: pickedItem.displayName,
            flashlightOn: pickedItem.id === 'flashlight' ? !!pickedItem.flashlightOn : false,
            uvOn: pickedItem.id === 'uv' ? !!pickedItem.uvOn : false
        };

        pickup.itemDef = {
            id: activeItem.id,
            displayName: activeItem.displayName,
            flashlightOn: activeItem.id === 'flashlight' ? !!activeItem.flashlightOn : false,
            uvOn: activeItem.id === 'uv' ? !!activeItem.uvOn : false
        };
        pickup.flashlightOn = pickup.itemDef.id === 'flashlight' ? !!pickup.itemDef.flashlightOn : false;
        pickup.uvOn = pickup.itemDef.id === 'uv' ? !!pickup.itemDef.uvOn : false;
        this.updatePickupVisual(pickup);

        this.scene.audioSystem.playSfx('item-pickup', { detune: 200 });
        this.syncSceneFlashlightStateFromInventory();
        this.scene.updateInventoryUI();
    }

    dropActiveItem() {
        let activeSlot = this.scene.activeSlot;
        let activeItem = this.scene.inventory[activeSlot];

        if (!activeItem) {
            for (let i = 0; i < this.scene.inventory.length; i++) {
                if (this.scene.inventory[i]) {
                    activeSlot = i;
                    activeItem = this.scene.inventory[i];
                    this.scene.activeSlot = i;
                    break;
                }
            }
        }

        if (!activeItem) return;

        const dropDist = 26;
        const dropX = Phaser.Math.Clamp(
            this.scene.player.x + Math.cos(this.scene.player.rotation) * dropDist,
            20,
            this.scene.roomWidth - 20
        );
        const dropY = Phaser.Math.Clamp(
            this.scene.player.y + Math.sin(this.scene.player.rotation) * dropDist,
            20,
            this.scene.roomHeight - 20
        );

        this.scene.worldBuilder.createEquipmentPickup(
            dropX,
            dropY,
            {
                id: activeItem.id,
                displayName: activeItem.displayName,
                flashlightOn: activeItem.id === 'flashlight' ? !!activeItem.flashlightOn : false,
                uvOn: activeItem.id === 'uv' ? !!activeItem.uvOn : false,
                rotation: this.scene.player.rotation
            },
            this.scene.currentFloorIndex
        );

        this.scene.inventory[activeSlot] = null;
        this.syncSceneFlashlightStateFromInventory();
        this.scene.updateInventoryUI();
    }

    updatePickupVisual(pickup) {
        if (!pickup || !pickup.visual || !pickup.label) return;

        const colorByItem = {
            flashlight: 0xfff0a8,
            uv: 0xb05eff,
            emf: 0x5cff8b,
            thermometer: 0x8ad8ff,
            dots: 0x2ecc71
        };

        pickup.visual.fillColor = colorByItem[pickup.itemDef.id] || 0xffffff;
        pickup.flashlightOn = pickup.itemDef.id === 'flashlight' ? !!pickup.itemDef.flashlightOn : false;
        pickup.uvOn = pickup.itemDef.id === 'uv' ? !!pickup.itemDef.uvOn : false;
        if (typeof pickup.rotation === 'number') {
            pickup.visual.setRotation(pickup.rotation);
        }
        pickup.label.setText(pickup.itemDef.displayName);
    }

    syncSceneFlashlightStateFromInventory() {
        let foundFlashlight = false;
        for (const item of this.scene.inventory) {
            if (item && item.id === 'flashlight') {
                foundFlashlight = true;
                this.scene.flashlightEnabled = !!item.flashlightOn;
                break;
            }
        }

        if (!foundFlashlight) {
            this.scene.flashlightEnabled = false;
        }

        if (this.scene.setInventoryFlashlightState) {
            this.scene.setInventoryFlashlightState(this.scene.flashlightEnabled);
        }
    }
}
