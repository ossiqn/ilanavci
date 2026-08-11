const { contextBridge, ipcRenderer } = require('electron');

const validSendChannels = [
  'window:minimize',
  'window:maximize',
  'window:close'
];

const validInvokeChannels = [
  'watcher:create', 'watcher:list', 'watcher:delete', 'watcher:toggle', 'watcher:update',
  'alert:list', 'alert:markRead', 'alert:markAllRead', 'alert:count', 'alert:delete',
  'listing:list', 'listing:detail', 'listing:sellerHistory',
  'stats:dashboard',
  'scan:now', 'scan:start', 'scan:stop', 'scan:status',
  'settings:get', 'settings:set',
  'telegram:test',
  'credit:info',
  'shell:openExternal'
];

const validReceiveChannels = [
  'scan:update',
  'scan:error',
  'alert:new',
  'show:credits',
  'sound:play'
];

contextBridge.exposeInMainWorld('bridge', {
  send: (channel, ...args) => {
    if (validSendChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },
  invoke: (channel, ...args) => {
    if (validInvokeChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error('Invalid channel: ' + channel));
  },
  on: (channel, callback) => {
    if (validReceiveChannels.includes(channel)) {
      const handler = (_, ...args) => callback(...args);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    }
  }
});