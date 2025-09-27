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
const LOG_TITLE_STYLE = {
    fontFamily: 'Courier',
    fontSize: 15,
    color: '#f7f7dc'
};
const LOG_CONTENT_STYLE = {
    fontFamily: 'Courier',
    fontSize: 13,
    color: '#c9c3a0',
    lineSpacing: 4,
    wordWrap: {
        width: MIN_PANEL_WIDTH - (PANEL_PADDING * 2),
        useAdvancedWrap: false
    }
};
const HINT_STYLE = {
    fontFamily: 'Courier',
    fontSize: 12,
    color: '#b8b089'
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
        this.isSuspended = false;
        this.nodeEntries = new Map();
        this.sortedEntries = [];
        this.panelWidth = MIN_PANEL_WIDTH;
        this.panelHeight = 0;
        this.selectedNodeId = null;
        this.selectedNodeName = '';
        this.selectedLogLines = [];

        this.background = scene.add.graphics();
        this.titleText = scene.add.text(0, 0, 'Simulation Status', TITLE_STYLE).setOrigin(0, 0);
        this.summaryText = scene.add.text(0, 0, '', SUMMARY_STYLE).setOrigin(0, 0);
        this.toggleText = scene.add.text(0, 0, '', TOGGLE_STYLE).setOrigin(0, 0);
        this.logHintText = scene.add.text(0, 0, 'Click a node to toggle activity log', HINT_STYLE)
            .setOrigin(0, 0)
            .setVisible(false);
        this.logTitleText = scene.add.text(0, 0, '', LOG_TITLE_STYLE)
            .setOrigin(0, 0)
            .setVisible(false);
        this.logContentText = scene.add.text(0, 0, '', LOG_CONTENT_STYLE)
            .setOrigin(0, 0)
            .setVisible(false);
        this.logContentText.setLineSpacing(4);

        this.toggleText.setInteractive({ useHandCursor: true });
        this.toggleText.on('pointerup', () => {
            this.isExpanded = !this.isExpanded;
            this.updateToggleText();
            this.updateLayout();
            if (!this.isExpanded) {
                this.clearSelectedNodeLog();
                this.updateNodeEntryColors();
                if (this.onNodeHoverEnd) {
                    this.onNodeHoverEnd();
                }
            }
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

        this.container.add([this.logHintText, this.logTitleText, this.logContentText]);

        this.container.setDepth(2500);
        this.container.setScrollFactor(0);

        this.updateToggleText();
        this.updateLayout();
    }

    setSuspended(isSuspended) {
        const shouldSuspend = Boolean(isSuspended);

        if (this.isSuspended === shouldSuspend) {
            return;
        }

        this.isSuspended = shouldSuspend;

        if (this.container && typeof this.container.setVisible === 'function') {
            this.container.setVisible(!shouldSuspend);
        }
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
        this.logHintText.destroy();
        this.logTitleText.destroy();
        this.logContentText.destroy();
        this.container.destroy();
    }

    update(data) {
        if (this.isSuspended) {
            return;
        }

        const safeData = data || {};
        this.isDemo = Boolean(safeData.isDemo);

        this.updateSummary(safeData);
        this.updateNodes(Array.isArray(safeData.nodes) ? safeData.nodes : []);
        this.refreshSelectedNodeLog();
        this.updateToggleText(safeData.nodes?.length || 0);
        this.updateLayout();
    }

    updateSummary(data) {
        if (!this.summaryText || typeof this.summaryText.setText !== 'function') {
            return;
        }

        const grid = data.grid || {};
        const catCount = this.coerceNonNegativeInteger(data.catCount, 0);
        const dogCount = this.coerceNonNegativeInteger(data.dogCount, 0);
        const totalNodes = this.coerceNonNegativeInteger(data.totalNodes, catCount + dogCount);
        const activeNodes = this.coerceNonNegativeInteger(data.activeNodes, 0);
        const gridWidth = this.coerceNonNegativeInteger(grid.width, 0);
        const gridHeight = this.coerceNonNegativeInteger(grid.height, 0);

        const summaryLines = [
            this.resolveModeLabel(data),
            `Grid: ${gridWidth} × ${gridHeight}`,
            `Population: ${catCount} cats / ${dogCount} dogs`,
            this.resolveActivityLine(totalNodes, activeNodes),
            this.resolveLastUpdateLine(data)
        ];

        if (data.waitingForData && !this.isDemo) {
            summaryLines.push('Status: awaiting remote data');
        }

        const sanitizedLines = summaryLines.filter((line) => typeof line === 'string' && line.trim().length > 0);

        if (sanitizedLines.length === 0) {
            sanitizedLines.push('Status: unavailable');
        }

        this.summaryText.setText(sanitizedLines);
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
            this.applyNodeEntryColor(entry);
            seen.add(nodeId);
        });

        Array.from(this.nodeEntries.entries()).forEach(([nodeId, entry]) => {
            if (!seen.has(nodeId)) {
                if (this.selectedNodeId === nodeId) {
                    this.clearSelectedNodeLog();
                }
                entry.text.destroy();
                this.nodeEntries.delete(nodeId);
            }
        });

        this.sortedEntries = Array.from(this.nodeEntries.values()).sort((a, b) => a.order - b.order);
        this.updateNodeEntryColors();
    }

    createNodeEntry(nodeId) {
        const text = this.scene.add.text(0, 0, '', NODE_STYLE).setOrigin(0, 0);

        text.on('pointerover', () => {
            const entry = this.nodeEntries.get(nodeId);

            if (!entry) {
                return;
            }

            entry.isHovered = true;
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

            entry.isHovered = false;
            const isSelected = this.selectedNodeId === nodeId;
            text.setColor(isSelected ? NODE_HOVER_COLOR : NODE_STYLE.color);

            if (!isSelected && this.onNodeHoverEnd) {
                this.onNodeHoverEnd(entry.data);
            }
        });

        text.on('pointerup', () => {
            this.handleNodeLogToggle(nodeId);
        });

        this.container.add(text);

        return {
            id: nodeId,
            text,
            data: null,
            order: 0,
            isHovered: false
        };
    }

    handleNodeLogToggle(nodeId) {
        if (!nodeId) {
            return;
        }

        if (!this.isExpanded) {
            this.isExpanded = true;
            this.updateToggleText();
        }

        const wasSelected = this.selectedNodeId === nodeId;
        const entry = this.nodeEntries.get(nodeId);
        const entryData = entry?.data;

        if (wasSelected) {
            this.clearSelectedNodeLog();

            if (this.onNodeHoverEnd && entryData) {
                this.onNodeHoverEnd(entryData);
            }
        } else {
            this.selectedNodeId = nodeId;
            this.refreshSelectedNodeLog();

            if (this.onNodeHover && entryData) {
                this.onNodeHover(entryData);
            }
        }

        this.updateNodeEntryColors();
        this.updateLayout();
    }

    clearSelectedNodeLog() {
        this.selectedNodeId = null;
        this.selectedNodeName = '';
        this.selectedLogLines = [];

        this.logTitleText.setText('');
        this.logContentText.setText('');
        this.logTitleText.setVisible(false);
        this.logContentText.setVisible(false);
    }

    refreshSelectedNodeLog() {
        if (!this.selectedNodeId) {
            this.clearSelectedNodeLog();
            return;
        }

        const entry = this.nodeEntries.get(this.selectedNodeId);

        if (!entry || !entry.data) {
            this.clearSelectedNodeLog();
            return;
        }

        this.selectedNodeName = entry.data.name || entry.data.id || this.selectedNodeId;
        this.selectedLogLines = this.buildLogLines(entry.data);

        const title = `Activity Log — ${this.selectedNodeName}`;
        this.logTitleText.setText(title);
        this.logContentText.setText(this.selectedLogLines);
        const shouldShow = this.isExpanded;
        this.logTitleText.setVisible(shouldShow);
        this.logContentText.setVisible(shouldShow);
    }

    buildLogLines(nodeData) {
        const entries = Array.isArray(nodeData?.logEntries) ? nodeData.logEntries : [];

        if (entries.length === 0) {
            return ['(No recent activity recorded)'];
        }

        return entries.map((entry) => {
            const rawMessage = typeof entry?.message === 'string' ? entry.message.trim() : '';
            const message = rawMessage.length > 0 ? rawMessage : 'Status updated';
            const rawTimeLabel = typeof entry?.timeLabel === 'string' ? entry.timeLabel.trim() : '';
            const timeLabel = rawTimeLabel.length > 0
                ? rawTimeLabel
                : this.formatLogTimestamp(entry?.timestamp);

            return `• [${timeLabel}] ${message}`;
        });
    }

    formatLogTimestamp(timestamp) {
        if (!Number.isFinite(timestamp)) {
            return '0.0s';
        }

        const seconds = Math.max(0, timestamp) / 1000;
        return `${seconds.toFixed(1)}s`;
    }

    applyNodeEntryColor(entry) {
        if (!entry || !entry.text || entry.isHovered) {
            return;
        }

        const isSelected = this.selectedNodeId === entry.id;
        entry.text.setColor(isSelected ? NODE_HOVER_COLOR : NODE_STYLE.color);
    }

    updateNodeEntryColors() {
        this.nodeEntries.forEach((entry) => {
            this.applyNodeEntryColor(entry);
        });
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
            const shouldShowNodes = this.isExpanded;
            entry.text.setVisible(shouldShowNodes);

            if (shouldShowNodes) {
                entry.text.setInteractive({ useHandCursor: true });
            } else {
                entry.text.disableInteractive();
            }
        });

        const nodesHeight = this.isExpanded ? (this.sortedEntries.length * NODE_LINE_SPACING) : 0;
        let contentBottom = nodesStartY + nodesHeight;

        const shouldShowLog = this.isExpanded && Boolean(this.selectedNodeId);

        if (shouldShowLog) {
            this.logTitleText.setVisible(true);
            this.logContentText.setVisible(true);

            this.logTitleText.setPosition(PANEL_PADDING, contentBottom + SECTION_SPACING);
            this.logContentText.setPosition(
                PANEL_PADDING,
                this.logTitleText.y + this.logTitleText.height + (SECTION_SPACING / 2)
            );

            contentBottom = this.logContentText.y + this.logContentText.height;
        } else {
            this.logTitleText.setVisible(false);
            this.logContentText.setVisible(false);
        }

        const requiredHeight = contentBottom + PANEL_PADDING;
        const maxContentWidth = Math.max(
            MIN_PANEL_WIDTH,
            this.titleText.width + (PANEL_PADDING * 2),
            this.summaryText.width + (PANEL_PADDING * 2),
            this.toggleText.width + (PANEL_PADDING * 2),
            this.logHintText.visible ? this.logHintText.width + (PANEL_PADDING * 2) : 0,
            this.logTitleText.visible ? this.logTitleText.width + (PANEL_PADDING * 2) : 0,
            this.logContentText.visible ? this.logContentText.width + (PANEL_PADDING * 2) : 0,
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
        let nodesStartY = this.toggleText.y + this.toggleText.height + SECTION_SPACING;

        if (this.isExpanded) {
            this.logHintText.setVisible(true);
            this.logHintText.setPosition(PANEL_PADDING, nodesStartY);
            nodesStartY = this.logHintText.y + this.logHintText.height + SECTION_SPACING;
        } else {
            this.logHintText.setVisible(false);
        }

        return nodesStartY;
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

    coerceNonNegativeInteger(value, fallback = 0) {
        if (Number.isInteger(value)) {
            return Math.max(0, value);
        }

        const parsed = Number.parseInt(value, 10);

        if (!Number.isNaN(parsed)) {
            return Math.max(0, parsed);
        }

        if (Number.isInteger(fallback)) {
            return Math.max(0, fallback);
        }

        const fallbackParsed = Number.parseInt(fallback, 10);

        if (!Number.isNaN(fallbackParsed)) {
            return Math.max(0, fallbackParsed);
        }

        return 0;
    }
}

