export class WorldBuilder {
    constructor(scene) {
        this.scene = scene;
    }

    buildWorld() {
        this.scene.currentFloorIndex = 0;
        this.scene.staticWallSegments = [];
        this.scene.doors = [];
        this.scene.switches = [];
        this.scene.equipmentPickups = [];
        this.scene.rooms = [];
        this.scene.furniture = [];
        this.scene.fingerprints = [];
        this.scene.stairs = [];
        this.scene.nextDoorId = 0;
        this.scene.nextSwitchId = 0;

        this.scene.vanBounds = { x: 620, y: 1080, w: 500, h: 100 };
        this.scene.vanSpawn = { x: 820, y: 1130 };

        this.buildFloor(0);
        this.scene.switchFloor(0);
    }

    buildFloor(floorIndex) {
        this.scene.staticWallSegments.push(
            { x1: 0, y1: 0, x2: this.scene.roomWidth, y2: 0, floorIndex },
            { x1: this.scene.roomWidth, y1: 0, x2: this.scene.roomWidth, y2: this.scene.roomHeight, floorIndex },
            { x1: this.scene.roomWidth, y1: this.scene.roomHeight, x2: 0, y2: this.scene.roomHeight, floorIndex },
            { x1: 0, y1: this.scene.roomHeight, x2: 0, y2: 0, floorIndex }
        );

        const hw = (x1, x2, y) => ({ x: x1, y: y - 10, w: x2 - x1, h: 20 });
        const vw = (y1, y2, x) => ({ x: x - 10, y: y1, w: 20, h: y2 - y1 });

        const wallRects = [
            hw(100, 350, 100),
            hw(450, 1100, 200),
            vw(100, 1050, 100),
            vw(200, 1050, 1100),
            hw(100, 350, 1050),
            hw(450, 1100, 1050),
            hw(350, 360, 1050),
            hw(440, 450, 1050),
            hw(350, 450, 200),
            vw(100, 200, 250),
            vw(100, 200, 350),
            hw(100, 150, 200),
            hw(200, 280, 200),
            hw(330, 350, 200),
            hw(100, 350, 450),
            hw(100, 350, 650),
            hw(100, 250, 800),
            hw(250, 350, 800),
            vw(650, 700, 250),
            vw(750, 800, 250),
            vw(200, 400, 350),
            vw(450, 550, 350),
            vw(600, 650, 350),
            vw(800, 820, 350),
            vw(870, 1050, 350),
            vw(200, 400, 450),
            vw(550, 1050, 450),
            { x: 700, y: 200, w: 80, h: 250 },
            hw(450, 600, 500),
            hw(700, 800, 500),
            hw(900, 1100, 500),
            hw(450, 530, 550),
            hw(610, 700, 550),
            vw(550, 700, 700),
            hw(450, 800, 700),
            hw(880, 1100, 700)
        ];

        wallRects.forEach(rect => {
            const wall = this.scene.add.rectangle(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h, 0x000000);
            wall.setStrokeStyle(2, 0x333333);
            this.scene.physics.add.existing(wall, true);
            this.scene.walls.add(wall);
            wall.floorIndex = floorIndex;

            this.scene.staticWallSegments.push(
                { x1: rect.x, y1: rect.y, x2: rect.x + rect.w, y2: rect.y, floorIndex },
                { x1: rect.x + rect.w, y1: rect.y, x2: rect.x + rect.w, y2: rect.y + rect.h, floorIndex },
                { x1: rect.x + rect.w, y1: rect.y + rect.h, x2: rect.x, y2: rect.y + rect.h, floorIndex },
                { x1: rect.x, y1: rect.y + rect.h, x2: rect.x, y2: rect.y, floorIndex }
            );
        });

        this.scene.rooms.push(
            { name: 'm_bath', bounds: { x: 100, y: 100, w: 150, h: 100 }, isLit: false, floorIndex },
            { name: 'm_closet', bounds: { x: 250, y: 100, w: 100, h: 100 }, isLit: false, floorIndex },
            { name: 'master', bounds: { x: 100, y: 200, w: 250, h: 250 }, isLit: false, floorIndex },
            { name: 'nursery', bounds: { x: 100, y: 450, w: 250, h: 200 }, isLit: false, floorIndex },
            { name: 'bath', bounds: { x: 100, y: 650, w: 150, h: 150 }, isLit: false, floorIndex },
            { name: 'boy_br', bounds: { x: 100, y: 800, w: 250, h: 250 }, isLit: false, floorIndex },
            { name: 'foyer', bounds: { x: 350, y: 550, w: 100, h: 500 }, isLit: true, floorIndex },
            { name: 'hallway', bounds: { x: 350, y: 200, w: 100, h: 350 }, isLit: false, floorIndex },
            { name: 'living', bounds: { x: 450, y: 200, w: 350, h: 300 }, isLit: false, floorIndex },
            { name: 'dining', bounds: { x: 800, y: 200, w: 300, h: 300 }, isLit: false, floorIndex },
            { name: 'kitchen', bounds: { x: 700, y: 500, w: 400, h: 200 }, isLit: false, floorIndex },
            { name: 'utility', bounds: { x: 450, y: 550, w: 250, h: 150 }, isLit: false, floorIndex },
            { name: 'corridor', bounds: { x: 450, y: 500, w: 250, h: 50 }, isLit: false, floorIndex },
            { name: 'garage', bounds: { x: 450, y: 700, w: 650, h: 350 }, isLit: false, floorIndex }
        );

        this.createDoor(360, 1050, 80, 20, 0, 0.5, floorIndex);
        this.createDoor(150, 200, 50, 20, 0, 0.5, floorIndex);
        this.createDoor(280, 200, 50, 20, 0, 0.5, floorIndex);
        this.createDoor(350, 400, 20, 50, 0.5, 0, floorIndex);
        this.createDoor(350, 550, 20, 50, 0.5, 0, floorIndex);
        this.createDoor(250, 700, 20, 50, 0.5, 0, floorIndex);
        this.createDoor(350, 820, 20, 50, 0.5, 0, floorIndex);
        this.createDoor(530, 550, 80, 20, 0, 0.5, floorIndex);
        this.createDoor(800, 700, 80, 20, 0, 0.5, floorIndex);

        this.createSwitch(175, 115, 'm_bath', floorIndex);
        this.createSwitch(300, 115, 'm_closet', floorIndex);
        this.createSwitch(115, 325, 'master', floorIndex);
        this.createSwitch(225, 635, 'nursery', floorIndex);
        this.createSwitch(115, 725, 'bath', floorIndex);
        this.createSwitch(115, 925, 'boy_br', floorIndex);
        this.createSwitch(435, 950, 'foyer', floorIndex);
        this.createSwitch(435, 250, 'hallway', floorIndex);
        this.createSwitch(600, 215, 'living', floorIndex);
        this.createSwitch(1085, 350, 'dining', floorIndex);
        this.createSwitch(1085, 600, 'kitchen', floorIndex);
        this.createSwitch(575, 685, 'utility', floorIndex);
        this.createSwitch(1085, 875, 'garage', floorIndex);

        this.createVanArea(floorIndex);
    }

    createVanArea(floorIndex) {
        const van = this.scene.vanBounds;

        const vanPad = this.scene.add.rectangle(van.x + van.w / 2, van.y + van.h / 2, van.w, van.h, 0x1f2630, 0.85);
        vanPad.setStrokeStyle(2, 0x3e4f66);
        vanPad.floorIndex = floorIndex;

        const vanLabel = this.scene.add.text(van.x + 12, van.y + 8, 'INVESTIGATION VAN', {
            fontSize: '14px',
            fontFamily: 'Arial',
            color: '#b8d5ff',
            fontStyle: 'bold'
        });
        vanLabel.floorIndex = floorIndex;

        this.createEquipmentPickup(700, 1135, { id: 'flashlight', displayName: 'Flashlight' }, floorIndex);
        this.createEquipmentPickup(790, 1135, { id: 'uv', displayName: 'UV Light' }, floorIndex);
        this.createEquipmentPickup(880, 1135, { id: 'emf', displayName: 'EMF Reader' }, floorIndex);
        this.createEquipmentPickup(970, 1135, { id: 'thermometer', displayName: 'Thermometer' }, floorIndex);
        this.createEquipmentPickup(1060, 1135, { id: 'dots', displayName: 'DOTS Projector' }, floorIndex);

        // Van Exit Interactive Object (moved to far left of van)
        const exitObj = this.scene.add.rectangle(640, 1160, 24, 24, 0x4444ff);
        exitObj.setStrokeStyle(2, 0x111111);
        exitObj.setDepth(90);
        this.scene.vanExit = { x: 640, y: 1160, visual: exitObj, floorIndex: floorIndex };

        const exitLabel = this.scene.add.text(640, 1140, 'EXIT', {
            fontSize: '12px',
            fontFamily: 'monospace',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(90);
    }

    createEquipmentPickup(x, y, itemDef, floorIndex = 0) {
        const normalizedItemDef = {
            id: itemDef.id,
            displayName: itemDef.displayName,
            flashlightOn: itemDef.id === 'flashlight' ? !!itemDef.flashlightOn : false,
            uvOn: itemDef.id === 'uv' ? !!itemDef.uvOn : false
        };

        const colorByItem = {
            flashlight: 0xfff0a8,
            uv: 0xb05eff,
            emf: 0x5cff8b,
            thermometer: 0x8ad8ff,
            dots: 0x2ecc71
        };

        const body = this.scene.add.rectangle(x, y, 24, 14, colorByItem[normalizedItemDef.id] || 0xffffff, 1);
        body.setStrokeStyle(2, 0x111111);
        body.setDepth(92);
        body.floorIndex = floorIndex;

        const rotation = typeof itemDef.rotation === 'number' ? itemDef.rotation : -Math.PI / 2;
        body.setRotation(rotation);

        const label = this.scene.add.text(x, y - 18, itemDef.displayName, {
            fontSize: '10px',
            fontFamily: 'Arial',
            color: '#e8eefc'
        });
        label.setOrigin(0.5, 1);
        label.setDepth(92);
        label.floorIndex = floorIndex;

        this.scene.equipmentPickups.push({
            x,
            y,
            floorIndex,
            rotation,
            flashlightOn: normalizedItemDef.id === 'flashlight' ? normalizedItemDef.flashlightOn : false,
            uvOn: normalizedItemDef.id === 'uv' ? normalizedItemDef.uvOn : false,
            itemDef: normalizedItemDef,
            visual: body,
            label,
            picked: false,
            networkId: `item_${floorIndex}_${this.scene.nextEquipmentId++}`
        });
    }

    createDoor(x, y, w, h, pivotX = 0, pivotY = 0.5, floorIndex = 0) {
        const visual = this.scene.add.rectangle(x, y, w, h, 0x5a3a22);
        visual.setOrigin(pivotX, pivotY);

        const cx = x + (pivotX === 0 ? w / 2 : (pivotX === 1 ? -w / 2 : 0));
        const cy = y + (pivotY === 0 ? h / 2 : (pivotY === 1 ? -h / 2 : 0));

        const collider = this.scene.add.rectangle(cx, cy, w, h);
        this.scene.physics.add.existing(collider, true);
        this.scene.walls.add(collider);

        visual.collider = collider;
        visual.isOpen = false;
        visual.isLocked = false;
        visual.floorIndex = floorIndex;
        visual.networkId = `door_${floorIndex}_${this.scene.nextDoorId++}`;
        collider.floorIndex = floorIndex;

        this.scene.doors.push(visual);
    }

    createSwitch(x, y, roomName, floorIndex = 0) {
        const room = this.scene.rooms.find(r => r.name === roomName && r.floorIndex === floorIndex);
        const color = (room && room.isLit) ? 0x00ff00 : 0xff0000;
        const sw = this.scene.add.rectangle(x, y, 16, 16, color);
        sw.setStrokeStyle(2, 0x000000);
        sw.setDepth(90);
        sw.roomName = roomName;
        sw.floorIndex = floorIndex;
        sw.networkId = `switch_${floorIndex}_${this.scene.nextSwitchId++}`;
        this.scene.switches.push(sw);
    }
}
