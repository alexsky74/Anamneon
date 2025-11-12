import { contextBridge, ipcRenderer } from 'electron';
import { DiaryEntry } from '../shared/types';

// Функция для создания модального диалога для текстовой записи
const createDiaryEntryModal = async (initialData?: { 
  title: string; 
  content: string;
  entryMode?: 'standalone' | 'linked';
  linkedItemType?: 'media' | 'file';
  linkedItemId?: string;
  customDate?: string;
}, userId?: string): Promise<{ 
  title: string; 
  content: string; 
  entryMode: 'standalone' | 'linked';
  linkedItemType?: 'media' | 'file';
  linkedItemId?: string;
  customDate: string;
} | null> => {
  // Загружаем список медиа и файлов для выбора
  let linkableItems: Array<{ id: string; title: string; date: string; type: 'media' | 'file' }> = [];
  try {
    if (userId) {
      const [mediaItems, fileItems] = await Promise.all([
        ipcRenderer.invoke('media:getAll', { userId }),
        ipcRenderer.invoke('file:getAll', { userId })
      ]);
      
      console.log('Loaded media items:', mediaItems.length);
      console.log('Loaded file items:', fileItems.length);
      
      linkableItems = [
        ...mediaItems.map((item: any) => ({
          id: item.id,
          title: item.metadata?.title || 'Без названия',
          date: item.createdAt,
          type: 'media' as const
        })),
        ...fileItems.map((item: any) => ({
          id: item.id,
          title: item.metadata?.title || item.name,
          date: item.createdAt,
          type: 'file' as const
        }))
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      console.log('Total linkable items:', linkableItems.length);
    }
  } catch (error) {
    console.error('Error loading linkable items:', error);
  }

  return new Promise((resolve) => {

    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
    `;

    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        resolve(null);
        document.body.removeChild(modal);
      }
    });

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      padding: 20px;
      border-radius: 8px;
      min-width: 500px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    `;

    dialog.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    // Выбор режима записи
    const modeLabel = document.createElement('label');
    modeLabel.textContent = 'Вид записи';
    modeLabel.style.cssText = `
      display: block;
      margin-bottom: 5px;
      font-weight: bold;
    `;

    const modeContainer = document.createElement('div');
    modeContainer.style.cssText = `
      display: flex;
      gap: 15px;
      margin-bottom: 15px;
    `;

    const standaloneRadio = document.createElement('input');
    standaloneRadio.type = 'radio';
    standaloneRadio.name = 'entryMode';
    standaloneRadio.value = 'standalone';
    standaloneRadio.checked = !initialData?.entryMode || initialData.entryMode === 'standalone';
    standaloneRadio.id = 'standalone';

    const standaloneLabel = document.createElement('label');
    standaloneLabel.htmlFor = 'standalone';
    standaloneLabel.textContent = 'Самостоятельная';
    standaloneLabel.style.cursor = 'pointer';

    const linkedRadio = document.createElement('input');
    linkedRadio.type = 'radio';
    linkedRadio.name = 'entryMode';
    linkedRadio.value = 'linked';
    linkedRadio.checked = initialData?.entryMode === 'linked';
    linkedRadio.id = 'linked';

    const linkedLabel = document.createElement('label');
    linkedLabel.htmlFor = 'linked';
    linkedLabel.textContent = 'Связанная';
    linkedLabel.style.cursor = 'pointer';

    modeContainer.appendChild(standaloneRadio);
    modeContainer.appendChild(standaloneLabel);
    modeContainer.appendChild(linkedRadio);
    modeContainer.appendChild(linkedLabel);

    // Выбор связанного элемента
    const linkedItemContainer = document.createElement('div');
    linkedItemContainer.style.cssText = `
      margin-bottom: 15px;
      display: none;
    `;

    const linkedItemLabel = document.createElement('label');
    linkedItemLabel.textContent = 'Связать с медиа/файлом';
    linkedItemLabel.style.cssText = `
      display: block;
      margin-bottom: 5px;
      font-weight: bold;
    `;

    const linkedItemSelect = document.createElement('select');
    linkedItemSelect.style.cssText = `
      width: 100%;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      background-color: white;
      appearance: auto;
      -webkit-appearance: menulist;
      -moz-appearance: menulist;
    `;

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    if (linkableItems.length === 0) {
      defaultOption.textContent = 'Нет загруженных медиа и файлов';
      linkedItemSelect.disabled = true;
    } else {
      defaultOption.textContent = '-- Выберите элемент --';
    }
    linkedItemSelect.appendChild(defaultOption);

    console.log('Adding linkable items to select:', linkableItems.length);
    linkableItems.forEach(item => {
      const option = document.createElement('option');
      option.value = JSON.stringify({ type: item.type, id: item.id });
      const typeLabel = item.type === 'media' ? 'Медиа' : 'Файл';
      const date = new Date(item.date).toLocaleDateString();
      option.textContent = `[${typeLabel}] ${item.title} (${date})`;
      linkedItemSelect.appendChild(option);
      console.log('Added option:', option.textContent);
    });

    console.log('Total options in select:', linkedItemSelect.options.length);

    // Устанавливаем начальное значение селекта, если запись связанная
    if (initialData?.entryMode === 'linked' && initialData.linkedItemType && initialData.linkedItemId) {
      const initialValue = JSON.stringify({ 
        type: initialData.linkedItemType, 
        id: initialData.linkedItemId 
      });
      linkedItemSelect.value = initialValue;
      console.log('Setting initial linked item:', initialValue);
    }

    // Добавляем подсказку, если элементов нет
    let noItemsHint: HTMLDivElement | null = null;
    if (linkableItems.length === 0) {
      noItemsHint = document.createElement('div');
      noItemsHint.style.cssText = `
        margin-top: 5px;
        padding: 8px;
        background-color: #fff3cd;
        border: 1px solid #ffc107;
        border-radius: 4px;
        color: #856404;
        font-size: 12px;
      `;
      noItemsHint.textContent = 'Сначала загрузите медиа или файл, чтобы создать связанную запись';
    }

    linkedItemContainer.appendChild(linkedItemLabel);
    linkedItemContainer.appendChild(linkedItemSelect);
    if (noItemsHint) {
      linkedItemContainer.appendChild(noItemsHint);
    }

    // Переключение видимости селекта связанного элемента
    const toggleLinkedItemVisibility = () => {
      console.log('Toggle visibility called. Linked radio checked:', linkedRadio.checked);
      if (linkedRadio.checked) {
        linkedItemContainer.style.display = 'block';
        console.log('Showing linked item container with', linkedItemSelect.options.length, 'options');
      } else {
        linkedItemContainer.style.display = 'none';
      }
    };

    standaloneRadio.addEventListener('change', toggleLinkedItemVisibility);
    linkedRadio.addEventListener('change', toggleLinkedItemVisibility);

    // Устанавливаем начальную видимость
    toggleLinkedItemVisibility();

    const titleLabel = document.createElement('label');
    titleLabel.textContent = 'Заголовок';
    titleLabel.style.cssText = `
      display: block;
      margin-bottom: 5px;
      font-weight: bold;
    `;

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = initialData?.title || '';
    titleInput.style.cssText = `
      width: 100%;
      padding: 8px;
      margin-bottom: 15px;
      box-sizing: border-box;
      border: 1px solid #ddd;
      border-radius: 4px;
    `;

    const contentLabel = document.createElement('label');
    contentLabel.textContent = 'Текст записи';
    contentLabel.style.cssText = `
      display: block;
      margin-bottom: 5px;
      font-weight: bold;
    `;

    const contentTextarea = document.createElement('textarea');
    contentTextarea.value = initialData?.content || '';
    contentTextarea.style.cssText = `
      width: 100%;
      height: 200px;
      padding: 8px;
      margin-bottom: 15px;
      box-sizing: border-box;
      border: 1px solid #ddd;
      border-radius: 4px;
      resize: vertical;
    `;

    // Поле для выбора даты
    const dateLabel = document.createElement('label');
    dateLabel.textContent = 'Дата записи';
    dateLabel.style.cssText = `
      display: block;
      margin-bottom: 5px;
      font-weight: bold;
    `;

    const dateInput = document.createElement('input');
    dateInput.type = 'datetime-local';
    // Устанавливаем дату из initialData или текущую дату и время
    if (initialData?.customDate) {
      const date = new Date(initialData.customDate);
      date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
      dateInput.value = date.toISOString().slice(0, 16);
    } else {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      dateInput.value = now.toISOString().slice(0, 16);
    }
    dateInput.style.cssText = `
      width: 100%;
      padding: 8px;
      margin-bottom: 15px;
      box-sizing: border-box;
      border: 1px solid #ddd;
      border-radius: 4px;
    `;

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    `;

    const okButton = document.createElement('button');
    okButton.textContent = 'Сохранить';
    okButton.style.cssText = `
      padding: 8px 16px;
      background-color: #28a745;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    `;
    okButton.addEventListener('click', () => {
      if (titleInput.value.trim()) {
        const entryMode = linkedRadio.checked ? 'linked' : 'standalone';
        let linkedItemType: 'media' | 'file' | undefined;
        let linkedItemId: string | undefined;

        if (entryMode === 'linked') {
          if (!linkedItemSelect.value) {
            linkedItemSelect.style.borderColor = 'red';
            alert('Для связанной записи необходимо выбрать медиа или файл');
            return;
          }
          try {
            const parsed = JSON.parse(linkedItemSelect.value);
            linkedItemType = parsed.type;
            linkedItemId = parsed.id;
          } catch (e) {
            console.error('Error parsing linked item:', e);
            alert('Ошибка при выборе элемента');
            return;
          }
        }

        resolve({
          title: titleInput.value.trim(),
          content: contentTextarea.value.trim(),
          entryMode,
          linkedItemType,
          linkedItemId,
          customDate: dateInput.value ? new Date(dateInput.value).toISOString() : new Date().toISOString()
        });
        document.body.removeChild(modal);
      } else {
        titleInput.style.borderColor = 'red';
      }
    });

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Отмена';
    cancelButton.style.cssText = `
      padding: 8px 16px;
      background-color: #dc3545;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    `;
    cancelButton.addEventListener('click', () => {
      resolve(null);
      document.body.removeChild(modal);
    });

    buttonContainer.appendChild(okButton);
    buttonContainer.appendChild(cancelButton);

    dialog.appendChild(modeLabel);
    dialog.appendChild(modeContainer);
    dialog.appendChild(linkedItemContainer);
    dialog.appendChild(titleLabel);
    dialog.appendChild(titleInput);
    dialog.appendChild(contentLabel);
    dialog.appendChild(contentTextarea);
    dialog.appendChild(dateLabel);
    dialog.appendChild(dateInput);
    dialog.appendChild(buttonContainer);
    modal.appendChild(dialog);

    document.body.appendChild(modal);
    titleInput.focus();

    // Обработка клавиш
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        resolve(null);
        document.body.removeChild(modal);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
  });
};

// Функция для создания модального диалога выбора названия
const createTitleModal = (title: string, defaultValue: string = ''): Promise<string | null> => {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
    `;
    
    // Обработчик клика по фону для закрытия
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        resolve(null);
        document.body.removeChild(modal);
      }
    });

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      padding: 20px;
      border-radius: 8px;
      min-width: 300px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    `;
    
    // Предотвращаем закрытие при клике на сам диалог
    dialog.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    const titleEl = document.createElement('h3');
    titleEl.textContent = title;
    titleEl.style.marginBottom = '15px';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = defaultValue;
    input.style.cssText = `
      width: 100%;
      padding: 8px;
      margin-bottom: 15px;
      box-sizing: border-box;
    `;

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    `;

    const okButton = document.createElement('button');
    okButton.textContent = 'OK';
    okButton.style.cssText = `
      padding: 8px 16px;
      background-color: #28a745;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    `;
    okButton.addEventListener('click', () => {
      resolve(input.value || defaultValue);
      document.body.removeChild(modal);
    });

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Отмена';
    cancelButton.style.cssText = `
      padding: 8px 16px;
      background-color: #dc3545;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    `;
    cancelButton.addEventListener('click', () => {
      resolve(null);
      document.body.removeChild(modal);
    });

    // Добавляем обработчик клавиши Enter для поля ввода
    input.addEventListener('keyup', (event) => {
      if (event.key === 'Enter') {
        resolve(input.value || defaultValue);
        document.body.removeChild(modal);
      }
      if (event.key === 'Escape') {
        resolve(null);
        document.body.removeChild(modal);
      }
    });

    buttonContainer.appendChild(okButton);
    buttonContainer.appendChild(cancelButton);

    dialog.appendChild(titleEl);
    dialog.appendChild(input);
    dialog.appendChild(buttonContainer);
    modal.appendChild(dialog);

    document.body.appendChild(modal);
    input.focus();
  });
};

// Функция для создания модального диалога с названием и датой для медиа/файлов
const createMediaFileModal = (title: string, defaultTitle: string = '', defaultDate?: string, filePath?: string, userId?: string): Promise<{ title: string; date: string } | null> => {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
    `;
    
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        resolve(null);
        document.body.removeChild(modal);
      }
    });

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      padding: 20px;
      border-radius: 8px;
      min-width: 400px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    `;
    
    dialog.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    const titleEl = document.createElement('h3');
    titleEl.textContent = title;
    titleEl.style.cssText = `
      margin-top: 0;
      margin-bottom: 15px;
    `;

    const titleLabel = document.createElement('label');
    titleLabel.textContent = 'Название';
    titleLabel.style.cssText = `
      display: block;
      margin-bottom: 5px;
      font-weight: bold;
    `;

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = defaultTitle;
    titleInput.style.cssText = `
      width: 100%;
      padding: 8px;
      margin-bottom: 15px;
      box-sizing: border-box;
      border: 1px solid #ddd;
      border-radius: 4px;
    `;

    const dateLabel = document.createElement('label');
    dateLabel.textContent = 'Дата';
    dateLabel.style.cssText = `
      display: block;
      margin-bottom: 5px;
      font-weight: bold;
    `;

    const dateInput = document.createElement('input');
    dateInput.type = 'datetime-local';
    if (defaultDate) {
      const date = new Date(defaultDate);
      date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
      dateInput.value = date.toISOString().slice(0, 16);
    } else {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      dateInput.value = now.toISOString().slice(0, 16);
    }
    dateInput.style.cssText = `
      width: 100%;
      padding: 8px;
      margin-bottom: 15px;
      box-sizing: border-box;
      border: 1px solid #ddd;
      border-radius: 4px;
    `;

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      justify-content: space-between;
      gap: 10px;
    `;

    // Левая часть с кнопкой просмотра
    const leftButtons = document.createElement('div');
    leftButtons.style.cssText = `
      display: flex;
      gap: 10px;
    `;

    // Правая часть с кнопками Сохранить и Отмена
    const rightButtons = document.createElement('div');
    rightButtons.style.cssText = `
      display: flex;
      gap: 10px;
    `;

    // Кнопка просмотра (только если есть путь к файлу)
    if (filePath && userId) {
      const viewButton = document.createElement('button');
      viewButton.textContent = 'Просмотреть';
      viewButton.style.cssText = `
        padding: 8px 16px;
        background-color: #17a2b8;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      `;
      viewButton.addEventListener('click', async () => {
        try {
          await ipcRenderer.invoke('file:open', { path: filePath, userId });
        } catch (error) {
          console.error('Error opening file:', error);
        }
      });
      leftButtons.appendChild(viewButton);
    }

    const okButton = document.createElement('button');
    okButton.textContent = 'Сохранить';
    okButton.style.cssText = `
      padding: 8px 16px;
      background-color: #28a745;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    `;
    okButton.addEventListener('click', () => {
      if (titleInput.value.trim()) {
        resolve({
          title: titleInput.value.trim(),
          date: dateInput.value ? new Date(dateInput.value).toISOString() : new Date().toISOString()
        });
        document.body.removeChild(modal);
      } else {
        titleInput.style.borderColor = 'red';
      }
    });

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Отмена';
    cancelButton.style.cssText = `
      padding: 8px 16px;
      background-color: #dc3545;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    `;
    cancelButton.addEventListener('click', () => {
      resolve(null);
      document.body.removeChild(modal);
    });

    rightButtons.appendChild(okButton);
    rightButtons.appendChild(cancelButton);

    buttonContainer.appendChild(leftButtons);
    buttonContainer.appendChild(rightButtons);

    dialog.appendChild(titleEl);
    dialog.appendChild(titleLabel);
    dialog.appendChild(titleInput);
    dialog.appendChild(dateLabel);
    dialog.appendChild(dateInput);
    dialog.appendChild(buttonContainer);
    modal.appendChild(dialog);

    document.body.appendChild(modal);
    titleInput.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        resolve(null);
        document.body.removeChild(modal);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
  });
};

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
    dialog: {
      showTitlePrompt: (title: string, defaultValue: string) => createTitleModal(title, defaultValue),
      showMediaFileForm: (title: string, defaultTitle: string, defaultDate?: string, filePath?: string, userId?: string) => createMediaFileModal(title, defaultTitle, defaultDate, filePath, userId),
      showDiaryEntryForm: (initialData?: { 
        title: string; 
        content: string;
        entryMode?: 'standalone' | 'linked';
        linkedItemType?: 'media' | 'file';
        linkedItemId?: string;
        customDate?: string;
      }, userId?: string) => createDiaryEntryModal(initialData, userId),
      showConfirmDialog: (options: { title: string; message: string; buttons: string[] }) =>
        ipcRenderer.invoke('dialog:showConfirm', options)
    },
    auth: {
      login: (credentials: { email: string; password: string }) =>
        ipcRenderer.invoke('auth:login', credentials),
      register: (credentials: { email: string; password: string; name: string }) =>
        ipcRenderer.invoke('auth:register', credentials),
      logout: (userId: string | null) => ipcRenderer.invoke('auth:logout', { userId }),
      verifyToken: (token: string) =>
        ipcRenderer.invoke('auth:verifyToken', { token }),
      getUser: (userId: string) =>
        ipcRenderer.invoke('auth:getUser', { userId }),
      updateUser: (userId: string, updates: { name?: string; password?: string }) =>
        ipcRenderer.invoke('auth:updateUser', { userId, updates })
    },
    profile: {
      savePhoto: (userId: string, photoData: string) =>
        ipcRenderer.invoke('profile:savePhoto', { userId, photoData }),
      loadPhoto: (userId: string) =>
        ipcRenderer.invoke('profile:loadPhoto', { userId })
    },
    diary: {
      save: (entry: Omit<DiaryEntry, 'id'>) => 
        ipcRenderer.invoke('diary:save', entry),
      getAll: (userId: string) => 
        ipcRenderer.invoke('diary:getAll', { userId }),
      update: (id: string, entry: { title: string; content: string }, userId: string) =>
        ipcRenderer.invoke('diary:update', { id, entry, userId }),
      delete: (id: string) =>
        ipcRenderer.invoke('diary:delete', { id })
    },
    media: {
      upload: (type: 'photo' | 'video' | 'audio', userId: string) => 
        ipcRenderer.invoke('media:upload', { type, userId }),
      getAll: (userId: string) => 
        ipcRenderer.invoke('media:getAll', { userId }),
      delete: (id: string) =>
        ipcRenderer.invoke('media:delete', { id }),
      updateMetadata: (id: string, metadata: any, userId: string) =>
        ipcRenderer.invoke('media:updateMetadata', { id, metadata, userId }),
      updateDate: (id: string, date: string) =>
        ipcRenderer.invoke('media:updateDate', { id, date })
    },
    files: {
      upload: (userId: string) => 
        ipcRenderer.invoke('file:upload', { userId }),
      getAll: (userId: string) => 
        ipcRenderer.invoke('file:getAll', { userId }),
      delete: (id: string) =>
        ipcRenderer.invoke('file:delete', { id }),
      open: (path: string, userId: string) =>
        ipcRenderer.invoke('file:open', { path, userId }),
      updateMetadata: (id: string, metadata: any, userId: string) =>
        ipcRenderer.invoke('file:updateMetadata', { id, metadata, userId }),
      updateDate: (id: string, date: string) =>
        ipcRenderer.invoke('file:updateDate', { id, date })
    },
    database: {
      backup: () => ipcRenderer.invoke('database:backup'),
      restore: () => ipcRenderer.invoke('database:restore'),
      exportForAI: (userId: string) => ipcRenderer.invoke('database:exportForAI', { userId })
    }
  }
);