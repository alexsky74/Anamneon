import { ipcMain } from 'electron';

// Whitelist of allowed IPC channels
const allowedChannels = new Set([
  'auth:login',
  'auth:register',
  'auth:logout',
  'diary:save',
  'diary:getAll',
  'media:upload',
  'media:getAll',
  'files:upload',
  'files:getAll'
]);

// Validate channel name
function isValidChannel(channel: string): boolean {
  return allowedChannels.has(channel);
}

// Setup secure IPC handlers
export function setupSecureIPC() {
  ipcMain.on('message', (_event, { channel }) => {
    if (!isValidChannel(channel)) {
      console.error(`Invalid IPC channel requested: ${channel}`);
      return;
    }
  });
}