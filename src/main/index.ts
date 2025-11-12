import { app, BrowserWindow, session, ipcMain } from 'electron';
import * as path from 'path';
import { setupSecureIPC } from './security';
import { Database } from '../storage/database';
import { handleFileUpload } from './fileHandlers';
import {
  hashPassword,
  verifyPassword,
  encryptText,
  decryptText,
  encryptFile,
  decryptFile,
  setUserEncryptionKey,
  getUserEncryptionKey,
  clearUserEncryptionKey
} from './encryption';

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  const htmlPath = path.join(__dirname, '..', 'index.html');
  console.log('Loading HTML from:', htmlPath);
  
  win.loadFile(htmlPath).catch(err => {
    console.error('Failed to load HTML file:', err);
    console.error('Current directory:', __dirname);
    console.error('Attempted path:', htmlPath);
  });

  // Очищаем localStorage перед закрытием окна
  win.on('close', () => {
    win.webContents.executeJavaScript('localStorage.clear();', true);
  });

  // Open DevTools in development
  win.webContents.openDevTools();
}

const db = new Database();

// Set up IPC handlers for database operations
async function setupIPCHandlers() {
  let mainWindow: BrowserWindow | null = null;

  ipcMain.handle('auth:login', async (_, { email, password }) => {
    try {
      const user = await db.getUserByEmail(email);
      if (!user) {
        return { success: false, error: 'Пользователь не найден' };
      }

      if (!verifyPassword(password, user.password_hash)) {
        return { success: false, error: 'Неверный пароль' };
      }

      // Store encryption key for this session
      setUserEncryptionKey(user.id, password);

      return { success: true, token: user.id };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Ошибка при входе в систему' };
    }
  });

  ipcMain.handle('auth:register', async (_, { email, password, name }) => {
    try {
      const existingUser = await db.getUserByEmail(email);
      if (existingUser) {
        return { success: false, error: 'Пользователь с таким email уже существует' };
      }

      const passwordHash = hashPassword(password);
      const userId = await db.createUser(email, passwordHash, name);

      // Store encryption key for this session
      setUserEncryptionKey(userId, password);

      return { success: true, token: userId };
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, error: 'Ошибка при регистрации' };
    }
  });

  ipcMain.handle('diary:save', async (_, entry) => {
    try {
      console.log('Entry received:', entry);
      
      const userPassword = getUserEncryptionKey(entry.userId);
      if (!userPassword) {
        throw new Error('User not authenticated for encryption');
      }

      // Encrypt title and content
      const encryptedTitle = encryptText(entry.title, userPassword);
      const encryptedContent = encryptText(entry.content, userPassword);

      const encryptedEntry = {
        ...entry,
        title: encryptedTitle,
        content: encryptedContent
      };

      return await db.saveDiaryEntry(encryptedEntry);
    } catch (error) {
      console.error('Error saving diary entry:', error);
      throw error;
    }
  });

  ipcMain.handle('diary:getAll', async (_, { userId }) => {
    try {
      console.log('Getting diary entries for user:', userId);
      const entries = await db.getDiaryEntries(userId);
      
      const userPassword = getUserEncryptionKey(userId);
      if (!userPassword) {
        throw new Error('User not authenticated for decryption');
      }

      // Decrypt all entries
      const decryptedEntries = entries.map(entry => {
        try {
          return {
            ...entry,
            title: decryptText(entry.title, userPassword),
            content: decryptText(entry.content, userPassword)
          };
        } catch (error) {
          console.error('Error decrypting entry:', entry.id, error);
          return {
            ...entry,
            title: '[Ошибка расшифровки]',
            content: '[Не удалось расшифровать содержимое]'
          };
        }
      });

      return decryptedEntries;
    } catch (error) {
      console.error('Error getting diary entries:', error);
      throw error;
    }
  });

  ipcMain.handle('media:upload', async (event, { type, userId }: { type: 'photo' | 'video' | 'audio', userId: string }) => {
    try {
      const user = await db.getUserById(userId);
      if (!user) throw new Error('Unauthorized');

      const userPassword = getUserEncryptionKey(userId);
      if (!userPassword) throw new Error('User not authenticated for encryption');

      const fileTypes: Record<'photo' | 'video' | 'audio', string[]> = {
        photo: ['jpg', 'jpeg', 'png', 'gif'],
        video: ['mp4', 'mov', 'avi'],
        audio: ['mp3', 'wav', 'm4a']
      };

      mainWindow = BrowserWindow.fromWebContents(event.sender);
      if (!mainWindow) return null;

      const result = await handleFileUpload(mainWindow, fileTypes[type]);
      if (!result) return null;

      // Encrypt the file
      const encryptedPath = result.path + '.enc';
      await encryptFile(result.path, encryptedPath, userPassword);
      
      // Delete original unencrypted file
      const fs = require('fs');
      fs.unlinkSync(result.path);

      const now = new Date();
      const title = result.metadata?.title || result.name;
      const encryptedTitle = encryptText(title, userPassword);
      
      const mediaItem = {
        name: encryptedTitle,
        type,
        path: encryptedPath,
        createdAt: now.toISOString(),
        userId: user.id,
        metadata: {
          title: encryptedTitle,
          uploadedAt: now.toISOString()
        }
      };
      
      const id = await db.saveMediaItem(mediaItem);
      
      return { 
        id, 
        ...mediaItem,
        name: title,
        metadata: {
          title: title,
          uploadedAt: now.toISOString()
        }
      };
    } catch (error) {
      console.error('Error in media:upload handler:', error);
      throw error;
    }
  });

  ipcMain.handle('media:getAll', async (_, { userId }) => {
    try {
      const items = await db.getMediaItems(userId);
      
      const userPassword = getUserEncryptionKey(userId);
      if (!userPassword) {
        throw new Error('User not authenticated for decryption');
      }

      // Decrypt metadata
      const decryptedItems = items.map(item => {
        try {
          const metadata = typeof item.metadata === 'string' 
            ? JSON.parse(item.metadata) 
            : item.metadata;
          
          return {
            ...item,
            metadata: {
              ...metadata,
              title: decryptText(metadata.title, userPassword)
            }
          };
        } catch (error) {
          console.error('Error decrypting media item:', item.id, error);
          const originalMetadata = typeof item.metadata === 'string' 
            ? JSON.parse(item.metadata) 
            : item.metadata;
          return {
            ...item,
            metadata: {
              title: '[Ошибка расшифровки]',
              uploadedAt: originalMetadata?.uploadedAt
            }
          };
        }
      });

      return decryptedItems;
    } catch (error) {
      console.error('Error getting media items:', error);
      throw error;
    }
  });

  ipcMain.handle('file:upload', async (event, { userId }) => {
    try {
      console.log('File upload started for user:', userId);
      
      const user = await db.getUserById(userId);
      if (!user) throw new Error('Unauthorized');

      const userPassword = getUserEncryptionKey(userId);
      if (!userPassword) throw new Error('User not authenticated for encryption');

      mainWindow = BrowserWindow.fromWebContents(event.sender);
      if (!mainWindow) return null;

      const result = await handleFileUpload(mainWindow, ['pdf', 'txt', 'docx', 'xlsx']);
      if (!result) return null;

      // Encrypt the file
      const encryptedPath = result.path + '.enc';
      await encryptFile(result.path, encryptedPath, userPassword);
      
      // Delete original unencrypted file
      const fs = require('fs');
      fs.unlinkSync(result.path);

      const encryptedTitle = encryptText(result.metadata?.title || result.name, userPassword);

      const fileItem = {
        name: result.name,
        path: encryptedPath,
        type: result.type as any,
        createdAt: new Date().toISOString(),
        userId: user.id,
        metadata: {
          title: encryptedTitle,
          uploadedAt: new Date().toISOString()
        }
      };
      
      const id = await db.saveFileItem(fileItem);
      
      return { 
        ...fileItem, 
        id,
        metadata: {
          title: result.metadata?.title || result.name,
          uploadedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Error in file:upload handler:', error);
      throw error;
    }
  });

  ipcMain.handle('file:getAll', async (_, { userId }) => {
    try {
      const items = await db.getFileItems(userId);
      
      const userPassword = getUserEncryptionKey(userId);
      if (!userPassword) {
        throw new Error('User not authenticated for decryption');
      }

      // Decrypt metadata
      const decryptedItems = items.map(item => {
        try {
          const metadata = typeof item.metadata === 'string' 
            ? JSON.parse(item.metadata) 
            : item.metadata;
          
          return {
            ...item,
            metadata: {
              ...metadata,
              title: decryptText(metadata.title, userPassword)
            }
          };
        } catch (error) {
          console.error('Error decrypting file item:', item.id, error);
          const originalMetadata = typeof item.metadata === 'string' 
            ? JSON.parse(item.metadata) 
            : item.metadata;
          return {
            ...item,
            metadata: {
              title: '[Ошибка расшифровки]',
              uploadedAt: originalMetadata?.uploadedAt
            }
          };
        }
      });

      return decryptedItems;
    } catch (error) {
      console.error('Error getting file items:', error);
      throw error;
    }
  });

  ipcMain.handle('diary:update', async (_, { id, entry, userId }) => {
    try {
      const userPassword = getUserEncryptionKey(userId);
      if (!userPassword) {
        throw new Error('User not authenticated for encryption');
      }

      // Encrypt title and content
      const encryptedEntry = {
        title: encryptText(entry.title, userPassword),
        content: encryptText(entry.content, userPassword),
        entryMode: entry.entryMode,
        linkedItemType: entry.linkedItemType,
        linkedItemId: entry.linkedItemId,
        createdAt: entry.customDate
      };

      await db.updateDiaryEntry(id, encryptedEntry);
    } catch (error) {
      console.error('Error updating diary entry:', error);
      throw error;
    }
  });

  ipcMain.handle('diary:delete', async (_, { id }) => {
    try {
      await db.deleteDiaryEntry(id);
    } catch (error) {
      console.error('Error deleting diary entry:', error);
      throw error;
    }
  });

  ipcMain.handle('media:delete', async (_, { id }) => {
    try {
      await db.deleteMediaItem(id);
    } catch (error) {
      console.error('Error deleting media item:', error);
      throw error;
    }
  });

  ipcMain.handle('file:delete', async (_, { id }) => {
    try {
      await db.deleteFileItem(id);
    } catch (error) {
      console.error('Error deleting file item:', error);
      throw error;
    }
  });

  ipcMain.handle('file:open', async (_, { path: encryptedPath, userId }) => {
    try {
      const userPassword = getUserEncryptionKey(userId);
      if (!userPassword) {
        throw new Error('User not authenticated for decryption');
      }

      // Create temporary decrypted file
      const path = require('path');
      const os = require('os');
      const fs = require('fs');
      
      const tempDir = os.tmpdir();
      const originalName = path.basename(encryptedPath).replace('.enc', '');
      const tempPath = path.join(tempDir, `anamneon_${Date.now()}_${originalName}`);

      // Decrypt file to temp location
      await decryptFile(encryptedPath, tempPath, userPassword);

      // Open decrypted file
      const { shell } = require('electron');
      await shell.openPath(tempPath);

      // Schedule cleanup after 5 minutes
      setTimeout(() => {
        try {
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
        } catch (err) {
          console.error('Error cleaning up temp file:', err);
        }
      }, 5 * 60 * 1000);

      return true;
    } catch (error) {
      console.error('Error opening file:', error);
      throw error;
    }
  });

  ipcMain.handle('media:updateMetadata', async (_, { id, metadata, userId }) => {
    try {
      const userPassword = getUserEncryptionKey(userId);
      if (!userPassword) {
        throw new Error('User not authenticated for encryption');
      }

      const encryptedMetadata = {
        ...metadata,
        title: encryptText(metadata.title, userPassword)
      };

      await db.updateMediaItem(id, encryptedMetadata);
      return true;
    } catch (error) {
      console.error('Error updating media metadata:', error);
      throw error;
    }
  });

  ipcMain.handle('media:updateDate', async (_, { id, date }) => {
    try {
      await db.updateMediaItemDate(id, date);
      return true;
    } catch (error) {
      console.error('Error updating media date:', error);
      throw error;
    }
  });

  ipcMain.handle('file:updateDate', async (_, { id, date }) => {
    try {
      await db.updateFileItemDate(id, date);
      return true;
    } catch (error) {
      console.error('Error updating file date:', error);
      throw error;
    }
  });

  ipcMain.handle('file:updateMetadata', async (_, { id, metadata, userId }) => {
    try {
      const userPassword = getUserEncryptionKey(userId);
      if (!userPassword) {
        throw new Error('User not authenticated for encryption');
      }

      const encryptedMetadata = {
        ...metadata,
        title: encryptText(metadata.title, userPassword)
      };

      await db.updateFileItem(id, encryptedMetadata);
      return true;
    } catch (error) {
      console.error('Error updating file metadata:', error);
      throw error;
    }
  });

  ipcMain.handle('auth:verifyToken', async (_, { token }) => {
    try {
      const user = await db.getUserById(token);
      return user ? user.id : null;
    } catch (error) {
      console.error('Error verifying token:', error);
      return null;
    }
  });

  ipcMain.handle('auth:getUser', async (_, { userId }) => {
    try {
      const user = await db.getUserById(userId);
      if (user) {
        return {
          id: user.id,
          email: user.email,
          name: user.name || 'Пользователь'
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  });

  ipcMain.handle('auth:updateUser', async (_, { userId, updates }) => {
    try {
      const user = await db.getUserById(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      await db.updateUser(userId, updates);
      return { success: true };
    } catch (error: any) {
      console.error('Error updating user:', error);
      return { success: false, error: error?.message || 'Unknown error' };
    }
  });

  ipcMain.handle('auth:logout', async (_, { userId }) => {
    try {
      // Clear encryption key for this user
      if (userId) {
        clearUserEncryptionKey(userId);
      }

      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        await win.webContents.executeJavaScript('localStorage.clear();', true);
      }
      return { success: true };
    } catch (error) {
      console.error('Error during logout:', error);
      return { success: false, error: 'Ошибка при выходе из системы' };
    }
  });

  // Profile photo handlers
  ipcMain.handle('profile:savePhoto', async (_, { userId, photoData }) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const userDataPath = app.getPath('userData');
      const profilePhotosDir = path.join(userDataPath, 'profile_photos');
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(profilePhotosDir)) {
        fs.mkdirSync(profilePhotosDir, { recursive: true });
      }
      
      const photoPath = path.join(profilePhotosDir, `${userId}.jpg`);
      
      // Remove data:image/jpeg;base64, prefix if present
      const base64Data = photoData.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(photoPath, base64Data, 'base64');
      
      console.log('Profile photo saved to:', photoPath);
      return { success: true };
    } catch (error) {
      console.error('Error saving profile photo:', error);
      return { success: false, error: 'Ошибка при сохранении фото' };
    }
  });

  ipcMain.handle('profile:loadPhoto', async (_, { userId }) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const userDataPath = app.getPath('userData');
      const photoPath = path.join(userDataPath, 'profile_photos', `${userId}.jpg`);
      
      if (fs.existsSync(photoPath)) {
        const photoData = fs.readFileSync(photoPath, 'base64');
        const dataUrl = `data:image/jpeg;base64,${photoData}`;
        console.log('Profile photo loaded from:', photoPath);
        return { success: true, photoData: dataUrl };
      }
      
      return { success: false };
    } catch (error) {
      console.error('Error loading profile photo:', error);
      return { success: false };
    }
  });

  ipcMain.handle('dialog:showConfirm', async (event, { title, message, buttons }) => {
    try {
      const { dialog } = require('electron');
      const mainWindow = BrowserWindow.fromWebContents(event.sender);
      if (!mainWindow) return buttons[1]; // Return "No" if no window

      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: title,
        message: message,
        buttons: buttons,
        defaultId: 1,
        cancelId: 1,
      });
      return buttons[response];
    } catch (error) {
      console.error('Error showing confirm dialog:', error);
      return buttons[1]; // Return "No" on error
    }
  });

  ipcMain.handle('database:backup', async (event) => {
    try {
      const { dialog } = require('electron');
      const fs = require('fs');
      
      const mainWindow = BrowserWindow.fromWebContents(event.sender);
      if (!mainWindow) return { success: false, error: 'No window found' };

      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Сохранить бэкап базы данных',
        defaultPath: `anamneon-backup-${new Date().toISOString().split('T')[0]}.anm`,
        filters: [
          { name: 'Anamneon Backup', extensions: ['anm'] }
        ]
      });

      if (!filePath) {
        return { success: false, cancelled: true };
      }

      // Copy database file
      const dbPath = db.getDatabasePath();
      fs.copyFileSync(dbPath, filePath);

      return { success: true, filePath };
    } catch (error: any) {
      console.error('Error creating backup:', error);
      return { success: false, error: error?.message || 'Unknown error' };
    }
  });

  ipcMain.handle('database:restore', async (event) => {
    try {
      const { dialog } = require('electron');
      const fs = require('fs');
      
      const mainWindow = BrowserWindow.fromWebContents(event.sender);
      if (!mainWindow) return { success: false, error: 'No window found' };

      const { filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Выберите файл бэкапа',
        filters: [
          { name: 'Anamneon Backup', extensions: ['anm'] }
        ],
        properties: ['openFile']
      });

      if (!filePaths || filePaths.length === 0) {
        return { success: false, cancelled: true };
      }

      const backupPath = filePaths[0];
      
      // Show confirmation dialog
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Подтверждение восстановления',
        message: 'Вы уверены, что хотите восстановить бэкап? Текущие данные будут потеряны!',
        buttons: ['Да', 'Нет'],
        defaultId: 1,
        cancelId: 1,
      });

      if (response !== 0) {
        return { success: false, cancelled: true };
      }

      // Close database connection
      await db.close();

      // Replace database file
      const dbPath = db.getDatabasePath();
      fs.copyFileSync(backupPath, dbPath);

      // Reinitialize database
      await db.initialize();

      return { success: true };
    } catch (error: any) {
      console.error('Error restoring backup:', error);
      return { success: false, error: error?.message || 'Unknown error' };
    }
  });

  ipcMain.handle('database:exportForAI', async (event, { userId }) => {
    try {
      const { dialog } = require('electron');
      const fs = require('fs');
      const path = require('path');
      const crypto = require('crypto');
      
      const mainWindow = BrowserWindow.fromWebContents(event.sender);
      if (!mainWindow) return { success: false, error: 'No window found' };

      // Выбор папки для экспорта
      const { filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Выберите папку для экспорта',
        properties: ['openDirectory', 'createDirectory']
      });

      if (!filePaths || filePaths.length === 0) {
        return { success: false, cancelled: true };
      }

      const baseDir = filePaths[0];
      const exportDir = path.join(baseDir, `AnamneonExport_v1_${new Date().toISOString().split('T')[0]}`);
      
      // Создаём структуру папок
      const dirs = [
        exportDir,
        path.join(exportDir, 'diary', 'text'),
        path.join(exportDir, 'diary', 'audio'),
        path.join(exportDir, 'media', 'photo'),
        path.join(exportDir, 'media', 'video'),
        path.join(exportDir, 'files', 'pdf'),
        path.join(exportDir, 'files', 'docx'),
        path.join(exportDir, 'files', 'spreadsheet'),
        path.join(exportDir, 'schema')
      ];

      for (const dir of dirs) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const userPassword = getUserEncryptionKey(userId);
      if (!userPassword) {
        throw new Error('User not authenticated for decryption');
      }

      // Получаем все данные
      const diaryEntries = await db.getDiaryEntries(userId);
      const mediaItems = await db.getMediaItems(userId);
      const fileItems = await db.getFileItems(userId);

      const objectsJsonl: string[] = [];
      let totalCount = 0;

      // Экспорт дневников
      for (const entry of diaryEntries) {
        try {
          const decryptedTitle = decryptText(entry.title, userPassword);
          const decryptedContent = decryptText(entry.content, userPassword);
          
          const dateStr = new Date(entry.createdAt).toISOString().split('T')[0];
          const textFileName = `${dateStr}_${entry.id}.json`;
          const textPath = path.join(exportDir, 'diary', 'text', textFileName);
          
          // Сохраняем текст дневника
          fs.writeFileSync(textPath, JSON.stringify({
            uuid: entry.id,
            date: dateStr,
            title: decryptedTitle,
            content: decryptedContent,
            created_at: entry.createdAt,
            updated_at: entry.updatedAt
          }, null, 2), 'utf-8');

          // Добавляем в objects.jsonl
          const summary = decryptedContent.substring(0, 100) + (decryptedContent.length > 100 ? '...' : '');
          objectsJsonl.push(JSON.stringify({
            uuid: entry.id,
            type: 'diary',
            subtype: 'text',
            date: dateStr,
            text_path: `diary/text/${textFileName}`,
            title: decryptedTitle,
            summary: summary,
            tags: [],
            created_at: entry.createdAt,
            updated_at: entry.updatedAt
          }));
          
          totalCount++;
        } catch (error) {
          console.error('Error exporting diary entry:', entry.id, error);
        }
      }

      // Экспорт медиа
      for (const item of mediaItems) {
        try {
          const metadata = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata;
          const decryptedTitle = decryptText(metadata.title, userPassword);
          
          // Определяем папку по типу
          const mediaTypeDir = item.type === 'photo' ? 'photo' : item.type === 'video' ? 'video' : 'audio';
          // Извлекаем расширение: убираем .enc, затем берём расширение
          const pathWithoutEnc = item.path.replace('.enc', '');
          const ext = path.extname(pathWithoutEnc);
          const fileName = `${item.id}${ext}`;
          const targetPath = path.join(exportDir, 'media', mediaTypeDir, fileName);
          
          // Расшифровываем и копируем файл
          if (fs.existsSync(item.path)) {
            const tempDecrypted = item.path.replace('.enc', '.tmp');
            await decryptFile(item.path, tempDecrypted, userPassword);
            fs.copyFileSync(tempDecrypted, targetPath);
            fs.unlinkSync(tempDecrypted);

            // Вычисляем хэш
            const fileBuffer = fs.readFileSync(targetPath);
            const hashSum = crypto.createHash('sha256');
            hashSum.update(fileBuffer);
            const fileHash = hashSum.digest('hex');

            // Добавляем в objects.jsonl
            const dateStr = new Date(item.createdAt).toISOString().split('T')[0];
            objectsJsonl.push(JSON.stringify({
              uuid: item.id,
              type: 'media',
              subtype: item.type,
              date: dateStr,
              title: decryptedTitle,
              file_path: `media/${mediaTypeDir}/${fileName}`,
              hash: { algo: 'sha256', value: fileHash },
              created_at: item.createdAt,
              updated_at: item.createdAt,
              tags: []
            }));
            
            totalCount++;
          }
        } catch (error) {
          console.error('Error exporting media item:', item.id, error);
        }
      }

      // Экспорт файлов
      for (const item of fileItems) {
        try {
          const metadata = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata;
          const decryptedTitle = decryptText(metadata.title, userPassword);
          
          // Определяем папку по типу файла
          let fileTypeDir = 'other';
          if (item.type === 'pdf') fileTypeDir = 'pdf';
          else if (item.type === 'docx' || item.type === 'txt') fileTypeDir = 'docx';
          else if (item.type === 'spreadsheet') fileTypeDir = 'spreadsheet';
          
          // Извлекаем расширение: убираем .enc, затем берём расширение
          const pathWithoutEnc = item.path.replace('.enc', '');
          const ext = path.extname(pathWithoutEnc);
          const fileName = `${item.id}${ext}`;
          const targetPath = path.join(exportDir, 'files', fileTypeDir, fileName);
          
          // Расшифровываем и копируем файл
          if (fs.existsSync(item.path)) {
            const tempDecrypted = item.path.replace('.enc', '.tmp');
            await decryptFile(item.path, tempDecrypted, userPassword);
            fs.copyFileSync(tempDecrypted, targetPath);
            fs.unlinkSync(tempDecrypted);

            // Вычисляем хэш
            const fileBuffer = fs.readFileSync(targetPath);
            const hashSum = crypto.createHash('sha256');
            hashSum.update(fileBuffer);
            const fileHash = hashSum.digest('hex');

            // Добавляем в objects.jsonl
            const dateStr = new Date(item.createdAt).toISOString().split('T')[0];
            objectsJsonl.push(JSON.stringify({
              uuid: item.id,
              type: 'file',
              subtype: item.type,
              date: dateStr,
              title: decryptedTitle,
              file_path: `files/${fileTypeDir}/${fileName}`,
              hash: { algo: 'sha256', value: fileHash },
              created_at: item.createdAt,
              updated_at: item.createdAt,
              tags: []
            }));
            
            totalCount++;
          }
        } catch (error) {
          console.error('Error exporting file item:', item.id, error);
        }
      }

      // Сохраняем objects.jsonl
      fs.writeFileSync(
        path.join(exportDir, 'objects.jsonl'),
        objectsJsonl.join('\n'),
        'utf-8'
      );

      // Создаём manifest.json
      const manifest = {
        version: '1.0',
        export_date: new Date().toISOString(),
        user_id: userId,
        total_records: totalCount,
        record_types: {
          diary: diaryEntries.length,
          media: mediaItems.length,
          files: fileItems.length
        },
        description: 'Экспорт данных Anamneon для анализа нейросетями'
      };
      
      fs.writeFileSync(
        path.join(exportDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf-8'
      );

      // Создаём схему
      const schema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {
          "uuid": { "type": "string" },
          "type": { "enum": ["diary", "media", "file"] },
          "subtype": { "type": "string" },
          "date": { "type": "string", "format": "date" },
          "title": { "type": "string" },
          "description": { "type": "string" },
          "file_path": { "type": "string" },
          "text_path": { "type": "string" },
          "summary": { "type": "string" },
          "tags": { "type": "array", "items": { "type": "string" } },
          "hash": {
            "type": "object",
            "properties": {
              "algo": { "type": "string" },
              "value": { "type": "string" }
            }
          },
          "created_at": { "type": "string" },
          "updated_at": { "type": "string" }
        },
        "required": ["uuid", "type", "date", "created_at"]
      };
      
      fs.writeFileSync(
        path.join(exportDir, 'schema', 'object.schema.json'),
        JSON.stringify(schema, null, 2),
        'utf-8'
      );

      return { success: true, path: exportDir, count: totalCount };
    } catch (error: any) {
      console.error('Error exporting for AI:', error);
      return { success: false, error: error?.message || 'Unknown error' };
    }
  });
}

app.whenReady().then(async () => {
  // Initialize database
  await db.initialize();

  // Set up security
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"]
      }
    });
  });

  setupSecureIPC();
  await setupIPCHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});