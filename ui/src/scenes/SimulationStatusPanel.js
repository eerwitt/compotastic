const PANEL_PADDING = 16;
const OUTER_MARGIN = 12;
const SECTION_SPACING = 8;
const NODE_LINE_SPACING = 18;
const MIN_PANEL_WIDTH = 260;
const BACKGROUND_COLOR = 0x000000;
const BACKGROUND_ALPHA = 0.62;
const TITLE_STYLE = {
    fontFamily: 'Courier',
    fontSize: 20,
    color: '#f7f7dc'
};
const SUMMARY_STYLE = {
    fontFamily: 'Courier',
    fontSize: 14,
    color: '#f7f7dc'
};
const TOGGLE_STYLE = {
    fontFamily: 'Courier',
    fontSize: 14,
    color: '#dcd4a0'
};
const NODE_STYLE = {
    fontFamily: 'Courier',
    fontSize: 13,
    color: '#dcd4a0'
};
const NODE_HOVER_COLOR = '#fff6b0';
const DEMO_ACTIVITY_LEVELS = ['~82% simulated load', '~71% simulated load', '~64% simulated load'];
const DEMO_STATUS_MESSAGES = [
    'Relaying canned telemetry',
    'Synthesizing mesh chatter',
    'Simulated packet routing',
    'Pretending to optimize paths'
];

function formatTime(timestamp) {
    if (!timestamp) {
        return null;
    }

    try {
        const date = new Date(timestamp);

        if (Number.isNaN(date.getTime())) {
            return null;
        }

        return date.toLocaleTimeString([], { hour12: false });
    } catch (error) {
        return null;
    }
}

export class SimulationStatusPanel {
    constructor(scene, { onNodeHover, onNodeHoverEnd, isDemo = false } = {}) {
        this.scene = scene;
        this.onNodeHover = onNodeHover;
        this.onNodeHoverEnd = onNodeHoverEnd;
        this.isDemo = Boolean(isDemo);
        this.isExpanded = false;
        this.nodeEntries = new Map();
        this.sortedEntries = [];
        this.panelWidth = MIN_PANEL_WIDTH;
        this.panelHeight = 0;

        this.background = scene.add.graphics();
        this.titleText = scene.add.text(0, 0, 'Simulation Status', TITLE_STYLE).setOrigin(0, 0);
        this.summaryText = scene.add.text(0, 0, '', SUMMARY_STYLE).setOrigin(0, 0);
        this.toggleText = scene.add.text(0, 0, '', TOGGLE_STYLE).setOrigin(0, 0);

        this.toggleText.setInteractive({ useHandCursor: true });
        this.toggleText.on('pointerup', () => {
            this.isExpanded = !this.isExpanded;
            this.updateToggleText();
            this.updateLayout();
        });

        this.toggleText.on('pointerover', () => {
            this.toggleText.setColor('#fff6b0');
        });

        this.toggleText.on('pointerout', () => {
            this.toggleText.setColor(TOGGLE_STYLE.color);
        });

        this.container = scene.add.container(OUTER_MARGIN, OUTER_MARGIN, [
            this.background,
            this.titleText,
            this.summaryText,
            this.toggleText
        ]);

        this.container.setDepth(2500);
        this.container.setScrollFactor(0);

        this.updateToggleText();
        this.updateLayout();
    }

    destroy() {
        this.nodeEntries.forEach((entry) => {
            entry.text.destroy();
        });

        this.nodeEntries.clear();
        this.sortedEntries = [];
        this.background.destroy();
        this.titleText.destroy();
        this.summaryText.destroy();
        this.toggleText.destroy();
        this.container.destroy();
    }

    update(data) {
        const safeData = data || {};
        this.isDemo = Boolean(safeData.isDemo);

        this.updateSummary(safeData);
        this.updateNodes(Array.isArray(safeData.nodes) ? safeData.nodes : []);
        this.updateToggleText(safeData.nodes?.length || 0);
        this.updateLayout();
    }

    updateSummary(data) {
        const grid = data.grid || { width: 0, height: 0 };
        const catCount = Number.isInteger(data.catCount) ? data.catCount : 0;
        const dogCount = Number.isInteger(data.dogCount) ? data.dogCount : 0;
        const totalNodes = Number.isInteger(data.totalNodes) ? data.totalNodes : (catCount + dogCount);
        const activeNodes = Number.isInteger(data.activeNodes) ? data.activeNodes : 0;

        const modeLabel = this.resolveModeLabel(data);
        const gridLine = `Grid: ${grid.width} × ${grid.height}`;
        const populationLine = `Population: ${catCount} cats / ${dogCount} dogs`;
        const activityLine = this.resolveActivityLine(totalNodes, activeNodes);
        const lastUpdateLine = this.resolveLastUpdateLine(data);

        const summaryLines = [modeLabel, gridLine, populationLine, activityLine, lastUpdateLine];

        if (data.waitingForData && !this.isDemo) {
            summaryLines.push('Status: awaiting remote data');
        }

        this.summaryText.setText(summaryLines.join('\n'));
    }

    resolveModeLabel(data) {
        if (this.isDemo) {
            return 'Mode: Demo (simulated telemetry)';
        }

        if (data.mode === 'LIVE') {
            return data.waitingForData
                ? 'Mode: Live (synchronizing...)'
                : 'Mode: Live (connected)';
        }

        if (data.mode === 'LOCAL') {
            return 'Mode: Local sandbox';
        }

        return 'Mode: Simulation';
    }

    resolveActivityLine(totalNodes, activeNodes) {
        if (this.isDemo) {
            const index = totalNodes % DEMO_ACTIVITY_LEVELS.length;
            return `Mesh Activity: ${DEMO_ACTIVITY_LEVELS[index]}`;
        }

        if (totalNodes <= 0) {
            return 'Mesh Activity: no nodes';
        }

        const clampedActive = Math.max(0, Math.min(totalNodes, activeNodes));
        return `Mesh Activity: ${clampedActive}/${totalNodes} nodes active`;
    }

    resolveLastUpdateLine(data) {
        if (this.isDemo) {
            return 'Last Update: simulated stream';
        }

        if (data.waitingForData) {
            return 'Last Update: pending';
        }

        const formatted = formatTime(data.lastUpdatedAt);

        if (!formatted) {
            return 'Last Update: unavailable';
        }

        return `Last Update: ${formatted}`;
    }

    updateNodes(nodes) {
        const seen = new Set();

        nodes.forEach((node, index) => {
            const nodeId = node?.id || `node-${index}`;

            if (!this.nodeEntries.has(nodeId)) {
                this.nodeEntries.set(nodeId, this.createNodeEntry(nodeId));
            }

            const entry = this.nodeEntries.get(nodeId);

            entry.data = node;
            entry.order = index;
            entry.text.setText(this.formatNodeLine(node, index));
            seen.add(nodeId);
        });

        Array.from(this.nodeEntries.entries()).forEach(([nodeId, entry]) => {
            if (!seen.has(nodeId)) {
                entry.text.destroy();
                this.nodeEntries.delete(nodeId);
            }
        });

        this.sortedEntries = Array.from(this.nodeEntries.values()).sort((a, b) => a.order - b.order);
    }

    createNodeEntry(nodeId) {
        const text = this.scene.add.text(0, 0, '', NODE_STYLE).setOrigin(0, 0);

        text.on('pointerover', () => {
            const entry = this.nodeEntries.get(nodeId);

            if (!entry) {
                return;
            }

            text.setColor(NODE_HOVER_COLOR);

            if (this.onNodeHover) {
                this.onNodeHover(entry.data);
            }
        });

        text.on('pointerout', () => {
            const entry = this.nodeEntries.get(nodeId);

            if (!entry) {
                return;
            }

            text.setColor(NODE_STYLE.color);

            if (this.onNodeHoverEnd) {
                this.onNodeHoverEnd(entry.data);
            }
        });

        this.container.add(text);

        return {
            id: nodeId,
            text,
            data: null,
            order: 0
        };
    }

    formatNodeLine(node, index) {
        if (!node) {
            return '- Unknown node';
        }

        const label = node.name || node.id || `Node ${index + 1}`;
        const typeLabel = node.type ? node.type.toUpperCase() : 'NODE';
        const location = Number.isInteger(node.tileX) && Number.isInteger(node.tileY)
            ? `(${node.tileX}, ${node.tileY})`
            : '(unknown)';
        const status = this.resolveNodeStatus(node, index);
        const areaSuffix = (Number.isInteger(node.tileWidth) && Number.isInteger(node.tileHeight) && (node.tileWidth > 1 || node.tileHeight > 1))
            ? ` area ${node.tileWidth}x${node.tileHeight}`
            : '';

        return `- ${label} [${typeLabel}] — ${status} @ ${location}${areaSuffix}`;
    }

    resolveNodeStatus(node, index) {
        if (this.isDemo) {
            const demoIndex = index % DEMO_STATUS_MESSAGES.length;
            return DEMO_STATUS_MESSAGES[demoIndex];
        }

        if (typeof node.displayStatus === 'string' && node.displayStatus.trim().length > 0) {
            return node.displayStatus;
        }

        if (typeof node.status === 'string' && node.status.trim().length > 0) {
            return node.status;
        }

        return 'Idle';
    }

    updateToggleText(nodeCount = 0) {
        const arrow = this.isExpanded ? '▾' : '▸';
        const label = this.isDemo
            ? 'Mesh Nodes (simulated)'
            : `Mesh Nodes (${nodeCount})`;

        this.toggleText.setText(`${arrow} ${label}`);
    }

    updateLayout() {
        const nodesStartY = this.layoutStaticSections();

        this.sortedEntries.forEach((entry, index) => {
            const targetY = nodesStartY + (index * NODE_LINE_SPACING);

            entry.text.setPosition(PANEL_PADDING, targetY);
            entry.text.setVisible(this.isExpanded);

            if (this.isExpanded) {
                entry.text.setInteractive({ useHandCursor: true });
            } else {
                entry.text.disableInteractive();
            }
        });

        const nodesHeight = this.isExpanded ? (this.sortedEntries.length * NODE_LINE_SPACING) : 0;
        const requiredHeight = nodesStartY + nodesHeight + PANEL_PADDING;
        const maxContentWidth = Math.max(
            MIN_PANEL_WIDTH,
            this.titleText.width + (PANEL_PADDING * 2),
            this.summaryText.width + (PANEL_PADDING * 2),
            this.toggleText.width + (PANEL_PADDING * 2),
            ...this.sortedEntries.map((entry) => entry.text.width + (PANEL_PADDING * 2))
        );

        this.panelWidth = maxContentWidth;
        this.panelHeight = requiredHeight;

        this.background.clear();
        this.background.fillStyle(BACKGROUND_COLOR, BACKGROUND_ALPHA);
        this.background.fillRoundedRect(0, 0, this.panelWidth, this.panelHeight, 12);

        this.positionContainer();
    }

    layoutStaticSections() {
        this.titleText.setPosition(PANEL_PADDING, PANEL_PADDING);
        this.summaryText.setPosition(
            PANEL_PADDING,
            this.titleText.y + this.titleText.height + SECTION_SPACING
        );
        this.toggleText.setPosition(
            PANEL_PADDING,
            this.summaryText.y + this.summaryText.height + SECTION_SPACING
        );

        return this.toggleText.y + this.toggleText.height + SECTION_SPACING;
    }

    positionContainer() {
        const gameSize = this.scene.scale?.gameSize || { width: 0, height: 0 };
        const x = OUTER_MARGIN;
        const y = Math.max(OUTER_MARGIN, gameSize.height - this.panelHeight - OUTER_MARGIN);

        this.container.setPosition(x, y);
    }

    handleResize(gameSize) {
        if (!gameSize) {
            return;
        }

        this.positionContainer();
    }
}

