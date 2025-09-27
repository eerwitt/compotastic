import { getWebSocketUrl } from '../config';

const RETRY_DELAY_MS = 3000;

class WebSocketManager
{
    constructor (game)
    {
        this.game = game;
        this.events = game.events;
        this.registry = game.registry;
        this.socket = null;
        this.retryHandle = null;
        this.isDestroyed = false;

        this.handleOpen = this.handleOpen.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleError = this.handleError.bind(this);
        this.tryConnect = this.tryConnect.bind(this);

        if (!this.registry.has('wsConnected'))
        {
            this.registry.set('wsConnected', false);
        }

        this.tryConnect();
    }

    tryConnect ()
    {
        if (this.isDestroyed || this.socket)
        {
            return;
        }

        let socket;

        try
        {
            socket = new WebSocket(getWebSocketUrl());
        }
        catch (error)
        {
            this.scheduleRetry();

            return;
        }

        this.socket = socket;
        socket.addEventListener('open', this.handleOpen);
        socket.addEventListener('close', this.handleClose);
        socket.addEventListener('error', this.handleError);
    }

    handleOpen ()
    {
        if (this.isDestroyed)
        {
            return;
        }

        this.clearRetry();
        this.registry.set('wsConnected', true);
        this.events.emit('ws-connected');
    }

    handleClose ()
    {
        if (this.isDestroyed)
        {
            return;
        }

        this.registry.set('wsConnected', false);
        this.events.emit('ws-disconnected');

        this.cleanupSocket();
        this.scheduleRetry();
    }

    handleError ()
    {
        if (this.socket)
        {
            this.socket.close();
        }
    }

    cleanupSocket ()
    {
        if (!this.socket)
        {
            return;
        }

        this.socket.removeEventListener('open', this.handleOpen);
        this.socket.removeEventListener('close', this.handleClose);
        this.socket.removeEventListener('error', this.handleError);
        this.socket = null;
    }

    scheduleRetry ()
    {
        if (this.isDestroyed || this.retryHandle)
        {
            return;
        }

        this.retryHandle = globalThis.setTimeout(() =>
        {
            this.retryHandle = null;
            this.tryConnect();
        }, RETRY_DELAY_MS);
    }

    clearRetry ()
    {
        if (!this.retryHandle)
        {
            return;
        }

        globalThis.clearTimeout(this.retryHandle);
        this.retryHandle = null;
    }

    destroy ()
    {
        this.isDestroyed = true;
        this.clearRetry();

        if (this.socket)
        {
            this.socket.removeEventListener('open', this.handleOpen);
            this.socket.removeEventListener('close', this.handleClose);
            this.socket.removeEventListener('error', this.handleError);
            this.socket.close();
            this.socket = null;
        }
    }
}

let instance = null;

export function ensureWebSocketManager (game)
{
    if (!instance)
    {
        instance = new WebSocketManager(game);
    }

    return instance;
}
