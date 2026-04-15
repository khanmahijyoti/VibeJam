import { GHOST_TYPES } from '../config/ghostTypes.js';

export class Journal {
    constructor(scene) {
        this.scene = scene;
        this.isOpen = false;
        this.checkedEvidence = new Set();
        this.selectedGhost = null;
        this.guessedGhost = null;

        this.container = scene.add.container(0, 0);
        this.container.setDepth(2000); // Above everything else
        this.container.setVisible(false);

        this.buildUI();
    }

    buildUI() {
        // Base Panel
        const bg = this.scene.add.rectangle(0, 0, 800, 500, 0x111111, 0.95);
        bg.setStrokeStyle(4, 0x555555);
        this.container.add(bg);

        // Title
        const title = this.scene.add.text(0, -220, 'INVESTIGATION JOURNAL', {
            fontSize: '28px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5);
        this.container.add(title);

        // Left Panel - Evidence
        const evTitle = this.scene.add.text(-350, -160, 'EVIDENCE CHECKLIST', {
            fontSize: '20px', fontFamily: 'monospace', color: '#aaaaaa', fontStyle: 'bold'
        }).setOrigin(0, 0.5);
        this.container.add(evTitle);

        const evidenceTypes = [
            { id: 'emf', label: 'EMF Level 5' },
            { id: 'thermometer', label: 'Freezing Temperatures' },
            { id: 'uv', label: 'Ultraviolet (Prints)' },
            { id: 'dots', label: 'DOTS Projector' }
        ];

        this.checkboxes = {};
        
        let startY = -110;
        for (const ev of evidenceTypes) {
            // Checkbox rect
            const box = this.scene.add.rectangle(-340, startY, 20, 20, 0x000000);
            box.setStrokeStyle(2, 0x888888);
            box.setInteractive({ useHandCursor: true });
            
            // Check mark (hidden initially)
            const tick = this.scene.add.text(-340, startY, 'X', {
                fontSize: '20px', color: '#00ff00', fontStyle: 'bold'
            }).setOrigin(0.5).setVisible(false);

            // Label
            const lbl = this.scene.add.text(-310, startY, ev.label, {
                fontSize: '18px', fontFamily: 'monospace', color: '#ffffff'
            }).setOrigin(0, 0.5);

            box.on('pointerdown', () => this.toggleEvidence(ev.id));

            this.checkboxes[ev.id] = { box, tick, lbl };
            this.container.add([box, tick, lbl]);

            startY += 45;
        }

        // Right Panel - Ghosts
        const ghostTitle = this.scene.add.text(50, -160, 'GHOST TYPES', {
            fontSize: '20px', fontFamily: 'monospace', color: '#aaaaaa', fontStyle: 'bold'
        }).setOrigin(0, 0.5);
        this.container.add(ghostTitle);

        this.ghostListItems = [];
        let ghostY = -110;
        for (const ghost of GHOST_TYPES) {
            const txt = this.scene.add.text(50, ghostY, ghost.name, {
                fontSize: '18px', fontFamily: 'monospace', color: '#ffffff'
            }).setOrigin(0, 0.5);
            
            txt.setInteractive({ useHandCursor: true });
            txt.on('pointerover', () => txt.setColor('#ffff00'));
            txt.on('pointerout', () => this.updateGhostListFilter());
            txt.on('pointerdown', () => this.selectGhost(ghost));

            this.ghostListItems.push({ text: txt, data: ghost });
            this.container.add(txt);
            ghostY += 35;
        }

        // Divider
        const divider = this.scene.add.rectangle(0, 0, 4, 400, 0x444444);
        this.container.add(divider);

        // Ghost Details Panel
        this.detailsTitle = this.scene.add.text(50, 40, '', {
            fontSize: '22px', fontFamily: 'monospace', color: '#00ff00', fontStyle: 'bold'
        }).setOrigin(0, 0);
        
        this.detailsDesc = this.scene.add.text(50, 70, '', {
            fontSize: '16px', fontFamily: 'monospace', color: '#dddddd', wordWrap: { width: 300 }
        }).setOrigin(0, 0);
        
        this.detailsEv = this.scene.add.text(50, 160, '', {
            fontSize: '16px', fontFamily: 'monospace', color: '#ffaaaa'
        }).setOrigin(0, 0);

        this.container.add([this.detailsTitle, this.detailsDesc, this.detailsEv]);
        
        // Instructional text
        const closeHint = this.scene.add.text(0, 220, "Press 'J' to Close", {
            fontSize: '14px', fontFamily: 'monospace', color: '#666666'
        }).setOrigin(0.5);
        this.container.add(closeHint);
    }

    toggleEvidence(id) {
        if (this.checkedEvidence.has(id)) {
            this.checkedEvidence.delete(id);
            this.checkboxes[id].tick.setVisible(false);
        } else {
            this.checkedEvidence.add(id);
            this.checkboxes[id].tick.setVisible(true);
        }
        this.updateGhostListFilter();
    }

    updateGhostListFilter() {
        for (const item of this.ghostListItems) {
            const ghost = item.data;
            
            // Check if this ghost has ALL the currently checked evidence
            let hasAllEvidence = true;
            for (const evId of this.checkedEvidence) {
                if (!ghost.evidence.includes(evId)) {
                    hasAllEvidence = false;
                    break;
                }
            }

            // Dim out ghosts that don't match the selected evidence
            item.text.setAlpha(hasAllEvidence ? 1.0 : 0.25);

            // Highlight the guessed ghost
            if (this.guessedGhost === ghost) {
                item.text.setColor('#00ff00');
            } else {
                item.text.setColor('#ffffff');
            }
        }
    }

    selectGhost(ghost) {
        // Toggle the guessed ghost on click
        if (this.guessedGhost === ghost) {
            this.guessedGhost = null;
        } else {
            this.guessedGhost = ghost;
        }
        
        this.selectedGhost = ghost;
        
        this.updateGhostListFilter();

        this.detailsTitle.setText(ghost.name);
        this.detailsDesc.setText(ghost.description || 'No known lore.');
        
        const evNames = ghost.evidence.map(e => {
            if (e === 'emf') return 'EMF Level 5';
            if (e === 'thermometer') return 'Freezing Temp';
            if (e === 'uv') return 'Ultraviolet';
            if (e === 'dots') return 'DOTS Projector';
            return e;
        }).join('\n- ');
        
        this.detailsEv.setText(`REQUIRED EVIDENCE:\n- ${evNames}`);
    }

    toggle() {
        this.isOpen = !this.isOpen;
        this.scene.isJournalOpen = this.isOpen;
        this.container.setVisible(this.isOpen);
    }

    layout(camera) {
        if (!this.isOpen) return;
        const invZoom = 1 / camera.zoom;
        this.container.setPosition(camera.worldView.centerX, camera.worldView.centerY);
        this.container.setScale(invZoom);
    }
}
