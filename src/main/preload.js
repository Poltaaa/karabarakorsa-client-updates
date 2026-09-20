'use strict';
// ---------------------------------------------------------------------------
// preload.js - Guvenli IPC koprusu (contextIsolation: true)
// ---------------------------------------------------------------------------
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    patch: (p) => ipcRenderer.invoke('config:patch', p),
    reset: () => ipcRenderer.invoke('config:reset'),
    openFolder: () => ipcRenderer.invoke('config:open-folder')
  },
  versions: () => ipcRenderer.invoke('versions:list'),
  msLogin: () => ipcRenderer.invoke('auth:microsoft'),
  openLog: () => ipcRenderer.invoke('log:open'),
  appInfo: () => ipcRenderer.invoke('app:info'),
  bot: {
    connect: (accountId) => ipcRenderer.invoke('bot:connect', accountId),
    disconnect: (slot) => ipcRenderer.invoke('bot:disconnect', slot),
    state: (slot) => ipcRenderer.invoke('bot:state', slot),
    chat: (message, slot) => ipcRenderer.invoke('bot:chat', { message, slot }),
    spamStart: (slot) => ipcRenderer.invoke('bot:spam-start', slot),
    spamStop: (slot) => ipcRenderer.invoke('bot:spam-stop', slot),
    spamMany: (payload) => ipcRenderer.invoke('bot:spam-many', payload),
    antiAfk: (enabled, slot) => ipcRenderer.invoke('bot:antiafk', { enabled, slot }),
    runJoin: (slot) => ipcRenderer.invoke('bot:run-join', slot),
    macroStart: (slot) => ipcRenderer.invoke('macro:start', slot),
    macroStop: (slot) => ipcRenderer.invoke('macro:stop', slot),
    macroPeek: (slot, silent) => ipcRenderer.invoke('macro:peek', { slot, silent: !!silent }),
    screenClick: (slot, index, button) => ipcRenderer.invoke('macro:screen-click', { slot, index, button }),
    ping: (payload) => ipcRenderer.invoke('bot:ping', payload),
    sneak: (on) => ipcRenderer.invoke('bot:sneak', on),
    physics: (on) => ipcRenderer.invoke('bot:physics', on),
    slots: () => ipcRenderer.invoke('bot:slots'),
    setActive: (slot) => ipcRenderer.invoke('bot:active', slot),
    chatHistory: (slot) => ipcRenderer.invoke('chat:history', slot),
    players: (slot) => ipcRenderer.invoke('bot:players', slot),
    tabComplete: (query, slot) => ipcRenderer.invoke('bot:tab-complete', { query, slot })
  },
  accounts: {
    add: (a) => ipcRenderer.invoke('accounts:add', a),
    update: (a) => ipcRenderer.invoke('accounts:update', a),
    remove: (id) => ipcRenderer.invoke('accounts:remove', id),
    select: (id) => ipcRenderer.invoke('accounts:select', id),
    reorder: (ids) => ipcRenderer.invoke('accounts:reorder', ids)
  },
  dialog: {
    submit: (index, values, slot) => ipcRenderer.invoke('dialog:submit', { index, values, slot }),
    cancel: (slot) => ipcRenderer.invoke('dialog:cancel', slot),
    cancelAuto: (slot) => ipcRenderer.invoke('dialog:cancel-auto', slot),
    command: (template, values, slot) => ipcRenderer.invoke('dialog:command', { template, values, slot })
  },
  tor: { status: () => ipcRenderer.invoke('tor:status'), start: (o) => ipcRenderer.invoke('tor:start', o), stop: () => ipcRenderer.invoke('tor:stop'), newIdentity: () => ipcRenderer.invoke('tor:new-identity'), setCountry: (c) => ipcRenderer.invoke('tor:set-country', c) },
  proxies: {
    add: (p) => ipcRenderer.invoke('proxies:add', p),
    remove: (id) => ipcRenderer.invoke('proxies:remove', id),
    select: (id) => ipcRenderer.invoke('proxies:select', id)
  },
  logs: {
    all: () => ipcRenderer.invoke('logs:all'),
    clear: () => ipcRenderer.invoke('logs:clear'),
    export: () => ipcRenderer.invoke('logs:export')
  },
  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    maximize: () => ipcRenderer.invoke('win:maximize'),
    close: () => ipcRenderer.invoke('win:close')
  },
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  update: {
    state: () => ipcRenderer.invoke('update:state'),
    install: () => ipcRenderer.invoke('update:install')
  },
  diag: (msg) => ipcRenderer.invoke('diag', msg),
  on: (channel, cb) => {
    const allowed = ['log', 'status', 'chat', 'metrics', 'spam-state', 'macro-state', 'msa-done', 'notice',
      'win-state', 'dialog', 'dialog-close', 'screen-open', 'screen-close', 'config-changed', 'slots', 'refresh',
      'update-state', 'update-progress', 'update-downloaded', 'update-error'];
    if (!allowed.includes(channel)) return () => {};
    const handler = (_e, data) => cb(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  }
});
