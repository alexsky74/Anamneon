import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  submitTitle: (title: string) => {
    ipcRenderer.send('submit-title', title);
  }
});