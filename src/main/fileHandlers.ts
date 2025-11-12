import { dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { app } from 'electron';

// Create a new directory structure
const createMediaDirectory = async () => {
  const mediaPath = path.join(app.getPath('userData'), 'media');
  try {
    await fs.access(mediaPath);
  } catch {
    await fs.mkdir(mediaPath, { recursive: true });
  }
  return mediaPath;
};

// Handle file uploads
export const handleFileUpload = async (mainWindow: Electron.BrowserWindow, fileTypes: string[]) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Allowed Files', extensions: fileTypes }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const sourcePath = result.filePaths[0];
      const mediaDir = await createMediaDirectory();
      const fileName = path.basename(sourcePath);
      const targetPath = path.join(mediaDir, fileName);

      // Use the filename without extension as the title

      await fs.copyFile(sourcePath, targetPath);
      return {
        path: targetPath,
        name: fileName,
        type: path.extname(fileName).slice(1),
        metadata: {
          title: path.basename(fileName, path.extname(fileName))
        }
      };
    }
    return null;
  } catch (error) {
    console.error('Error during file upload:', error);
    return null;
  }
};