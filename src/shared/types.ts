export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  error?: string;
}

export interface DiaryEntry {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'audio';
  entryMode: 'standalone' | 'linked'; // Самостоятельная или связанная
  linkedItemId?: string; // ID связанного файла
  createdAt: string;
  updatedAt: string;
  userId: string;
}

export interface FileItem {
  id: string;
  userId: string;
  name: string;
  path: string;
  type: 'photo' | 'video' | 'audio' | 'pdf' | 'txt' | 'docx' | 'spreadsheet';
  createdAt: string;
  metadata?: {
    title?: string;
    description?: string;
  };
}

// Для обратной совместимости (будет удалено после миграции)
export type MediaItem = FileItem;