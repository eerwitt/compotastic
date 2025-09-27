import { Simulation } from './Simulation';

const DEMO_GRID_SIZE = { width: 25, height: 25 };
const DEFAULT_DEMO_STATE = Object.freeze({
    grid: { ...DEMO_GRID_SIZE },
    cats: [
        { tileX: 6, tileY: 6, attributes: { cpu: '68000 8MHz', ram: '512KB' } },
        { tileX: 18, tileY: 6, attributes: { cpu: 'Pentium 100MHz', ram: '16MB' } },
        { tileX: 6, tileY: 18, attributes: { cpu: 'Core 2 Duo 2.0GHz', ram: '2GB' } },
        { tileX: 18, tileY: 18, attributes: { cpu: 'ARM Cortex-A9 1GHz', ram: '1GB' } },
        { tileX: 12, tileY: 12, attributes: { cpu: 'Xeon 2.4GHz', ram: '8GB' } }
    ],
    dogs: [
        { tileX: 10, tileY: 3 },
        { tileX: 16, tileY: 14 }
    ]
});

const GO_LIVE_ASCII = [
    '┌────────────────────┐',
    '│  CONNECT TO LIVE!  │',
    '│      ▶▶▶▶▶▶       │',
    '└────────────────────┘'
].join('\n');

export class DemoSimulation extends Simulation {
    constructor() {
        super('DemoSimulation');

        this.goLiveButton = null;
        this.handleConnectionStatusChange = this.handleConnectionStatusChange.bind(this);
        this.repositionGoLiveButton = this.repositionGoLiveButton.bind(this);
    }

    create() {
        const defaultState = this.buildDefaultSimulationState();
        const simulationConfig = JSON.parse(JSON.stringify(defaultState));

        super.create({ simulationConfig });

        this.createGoLiveButton();
        this.updateGoLiveButtonVisibility(Boolean(this.registry.get('wsConnected')));

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
        });
    }

    buildDefaultSimulationState() {
        return {
            grid: { ...DEMO_GRID_SIZE },
            cats: DEFAULT_DEMO_STATE.cats.map((cat) => ({ ...cat, attributes: { ...cat.attributes } })),
            dogs: DEFAULT_DEMO_STATE.dogs.map((dog) => ({ ...dog }))
        };
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
        if (!this.goLiveButton) {
            return;
        }

        const size = this.scale.gameSize || { width: 0, height: 0 };
        const padding = 16;
        const x = Math.max(size.width - this.goLiveButton.width - padding, padding);
        const y = Math.max(size.height - this.goLiveButton.height - padding, padding);

        this.goLiveButton.setPosition(x, y);
    }
}
