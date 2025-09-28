import { Simulation } from './Simulation';

const DEMO_GRID_SIZE = { width: 25, height: 25 };
const DEFAULT_DEMO_STATE = Object.freeze({
    grid: { ...DEMO_GRID_SIZE },
    cats: [
        {
            identifier: 'demo-cat-alpha',
            tileX: 6,
            tileY: 6,
            attributes: { cpu: '68000 8MHz', ram: '512KB', alert: 'Link down on sector 3', needs: 'Fiber patch' }
        },
        {
            identifier: 'demo-cat-bravo',
            tileX: 18,
            tileY: 6,
            attributes: { cpu: 'Pentium 100MHz', ram: '16MB' }
        },
        {
            identifier: 'demo-cat-charlie',
            tileX: 6,
            tileY: 18,
            attributes: { cpu: 'Core 2 Duo 2.0GHz', ram: '2GB', alert: 'Thermal warning', needs: ['Cooling fan', 'Airflow check'] }
        },
        { identifier: 'demo-cat-delta', tileX: 18, tileY: 18, attributes: { cpu: 'ARM Cortex-A9 1GHz', ram: '1GB' } },
        { identifier: 'demo-cat-epsilon', tileX: 12, tileY: 12, attributes: { cpu: 'Xeon 2.4GHz', ram: '8GB' } }
    ],
    dogs: [
        { identifier: 'demo-dog-ranger', tileX: 10, tileY: 3 },
        { identifier: 'demo-dog-scout', tileX: 16, tileY: 14 }
    ],
    rewards: [
        { tileX: 4, tileY: 4, value: 6, attributes: { description: 'Fresh compute batch' } },
        { tileX: 9, tileY: 8, value: 7, attributes: { description: 'Optimized workload bundle' } },
        { tileX: 20, tileY: 5, value: 8, attributes: { description: 'Edge cache warmup' } },
        { tileX: 5, tileY: 17, value: 5, attributes: { description: 'Telemetry backlog' } },
        { tileX: 13, tileY: 20, value: 6, attributes: { description: 'Diagnostics sweep' } },
        { tileX: 21, tileY: 13, value: 5, attributes: { description: 'Firmware verification tasks' } },
        { tileX: 7, tileY: 11, value: -6, attributes: { description: 'Corrupted packet storm', needs: 'Filter update' } },
        { tileX: 15, tileY: 7, value: -7, attributes: { description: 'Faulty workload handoff', needs: 'Rollback assist' } },
        { tileX: 11, tileY: 18, value: -5, attributes: { description: 'Thermal throttling loop', needs: 'Cooling audit' } },
        { tileX: 19, tileY: 15, value: -8, attributes: { description: 'Storage parity failure', needs: 'Parity rebuild' } }
    ]
});

const GO_LIVE_ASCII = [
    '┌────────────────────┐',
    '│  CONNECT TO LIVE!  │',
    '└────────────────────┘'
].join('\n');

const DEMO_MODE_MESSAGE = 'DEMO MODE';
const DEMO_MODE_SPINNER_FRAMES = Object.freeze(['|', '/', '-', '\\']);

export class DemoSimulation extends Simulation {
    constructor() {
        super('DemoSimulation');

        this.goLiveButton = null;
        this.isDemoSimulation = true;
        this.demoModeIndicator = null;
        this.demoModeAnimationEvent = null;
        this.demoModeDisplayChars = null;
        this.demoModeAnimationState = null;
        this.handleConnectionStatusChange = this.handleConnectionStatusChange.bind(this);
        this.repositionGoLiveButton = this.repositionGoLiveButton.bind(this);
    }

    create() {
        const defaultState = this.buildDefaultSimulationState();
        const simulationConfig = JSON.parse(JSON.stringify(defaultState));

        super.create({ simulationConfig });

        this.createGoLiveButton();
        this.updateGoLiveButtonVisibility(Boolean(this.registry.get('wsConnected')));
        this.createDemoModeIndicator();

        this.game.events.on('ws-connected', this.handleConnectionStatusChange);
        this.game.events.on('ws-disconnected', this.handleConnectionStatusChange);
        this.scale.on('resize', this.repositionGoLiveButton);

        this.events.once('shutdown', () => {
            this.game.events.off('ws-connected', this.handleConnectionStatusChange);
            this.game.events.off('ws-disconnected', this.handleConnectionStatusChange);
            this.scale.off('resize', this.repositionGoLiveButton);

            if (this.goLiveButton) {
                this.goLiveButton.destroy();
                this.goLiveButton = null;
            }

            if (this.demoModeAnimationEvent) {
                this.demoModeAnimationEvent.remove();
                this.demoModeAnimationEvent = null;
            }

            if (this.demoModeIndicator) {
                this.demoModeIndicator.destroy();
                this.demoModeIndicator = null;
            }

            this.demoModeDisplayChars = null;
            this.demoModeAnimationState = null;
        });
    }

    buildDefaultSimulationState() {
        return {
            grid: { ...DEMO_GRID_SIZE },
            cats: DEFAULT_DEMO_STATE.cats.map((cat) => ({ ...cat, attributes: { ...cat.attributes } })),
            dogs: DEFAULT_DEMO_STATE.dogs.map((dog) => ({ ...dog })),
            rewards: DEFAULT_DEMO_STATE.rewards.map((reward) => {
                const clone = { ...reward };

                if (reward.attributes && typeof reward.attributes === 'object') {
                    clone.attributes = { ...reward.attributes };
                }

                return clone;
            })
        };
    }

    createDemoModeIndicator() {
        if (this.demoModeIndicator) {
            this.demoModeIndicator.destroy();
            this.demoModeIndicator = null;
        }

        if (this.demoModeAnimationEvent) {
            this.demoModeAnimationEvent.remove();
            this.demoModeAnimationEvent = null;
        }

        this.demoModeDisplayChars = Array.from(DEMO_MODE_MESSAGE);
        this.initializeDemoModeAnimationState();

        this.demoModeIndicator = this.add.text(0, 0, DEMO_MODE_MESSAGE, {
            fontFamily: 'Courier',
            fontSize: 18,
            color: '#00ff00'
        });

        this.demoModeIndicator.setDepth(2000);
        this.demoModeIndicator.setScrollFactor(0);
        this.demoModeIndicator.setOrigin(1, 0);
        this.demoModeIndicator.setPadding(8, 8, 8, 8);
        this.demoModeIndicator.setText(this.demoModeDisplayChars.join(''));

        this.demoModeAnimationEvent = this.time.addEvent({
            delay: 120,
            loop: true,
            callback: this.animateDemoModeIndicator,
            callbackScope: this
        });

        this.repositionGoLiveButton();
    }

    createGoLiveButton() {
        if (this.goLiveButton) {
            this.goLiveButton.destroy();
            this.goLiveButton = null;
        }

        this.goLiveButton = this.add.text(0, 0, GO_LIVE_ASCII, {
            fontFamily: 'Courier',
            fontSize: 18,
            color: '#00ff00',
            align: 'center'
        });

        this.goLiveButton.setDepth(2000);
        this.goLiveButton.setScrollFactor(0);
        this.goLiveButton.setOrigin(0, 0);
        this.goLiveButton.setPadding(8, 8, 8, 8);
        this.goLiveButton.setInteractive({ useHandCursor: true });

        this.goLiveButton.on('pointerover', () => {
            this.goLiveButton.setColor('#7CFC00');
        });

        this.goLiveButton.on('pointerout', () => {
            this.goLiveButton.setColor('#00ff00');
        });

        this.goLiveButton.on('pointerup', () => {
            this.scene.start('Simulation', { waitForRemoteData: true });
        });

        this.repositionGoLiveButton();
    }

    initializeDemoModeAnimationState() {
        if (!Array.isArray(this.demoModeDisplayChars) || this.demoModeDisplayChars.length === 0) {
            this.demoModeDisplayChars = Array.from(DEMO_MODE_MESSAGE);
        }

        this.demoModeAnimationState = {
            charIndex: this.findNextDemoModeCharIndex(-1),
            symbolIndex: 0
        };
    }

    findNextDemoModeCharIndex(previousIndex) {
        const messageLength = DEMO_MODE_MESSAGE.length;

        if (messageLength === 0) {
            return -1;
        }

        for (let offset = 1; offset <= messageLength; offset += 1) {
            const candidateIndex = (previousIndex + offset) % messageLength;

            if (DEMO_MODE_MESSAGE[candidateIndex] !== ' ') {
                return candidateIndex;
            }
        }

        return -1;
    }

    animateDemoModeIndicator() {
        if (!this.demoModeIndicator || !this.demoModeAnimationState || !this.demoModeDisplayChars) {
            return;
        }

        const { charIndex, symbolIndex } = this.demoModeAnimationState;

        if (charIndex === -1) {
            return;
        }

        if (symbolIndex < DEMO_MODE_SPINNER_FRAMES.length) {
            this.demoModeDisplayChars[charIndex] = DEMO_MODE_SPINNER_FRAMES[symbolIndex];
            this.demoModeAnimationState.symbolIndex += 1;
        } else {
            this.demoModeDisplayChars[charIndex] = DEMO_MODE_MESSAGE[charIndex];
            this.demoModeAnimationState.symbolIndex = 0;
            this.demoModeAnimationState.charIndex = this.findNextDemoModeCharIndex(charIndex);
        }

        this.demoModeIndicator.setText(this.demoModeDisplayChars.join(''));
    }

    updateGoLiveButtonVisibility(isConnected) {
        if (!this.goLiveButton) {
            return;
        }

        if (isConnected) {
            this.goLiveButton.setVisible(true);
            this.goLiveButton.setActive(true);
            this.goLiveButton.setInteractive({ useHandCursor: true });
        } else {
            this.goLiveButton.setVisible(false);
            this.goLiveButton.setActive(false);
            this.goLiveButton.disableInteractive();
        }
    }

    handleConnectionStatusChange() {
        const isConnected = Boolean(this.registry.get('wsConnected'));

        this.updateGoLiveButtonVisibility(isConnected);
    }

    repositionGoLiveButton() {
        const size = this.scale.gameSize || { width: 0, height: 0 };
        const padding = 16;

        if (this.goLiveButton) {
            const x = Math.max(size.width - this.goLiveButton.width - padding, padding);
            const y = Math.max(size.height - this.goLiveButton.height - padding, padding);

            this.goLiveButton.setPosition(x, y);
        }

        if (this.demoModeIndicator) {
            const indicatorX = Math.max(size.width - padding, padding);
            const indicatorY = padding;

            this.demoModeIndicator.setPosition(indicatorX, indicatorY);
        }
    }
}
