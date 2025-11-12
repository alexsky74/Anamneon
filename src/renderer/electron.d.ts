import { DiaryEntry, FileItem, AuthResponse } from '../shared/types';

declare global {
  interface Window {
  api: {
    dialog: {
      showTitlePrompt: (title: string, defaultValue: string) => Promise<string | null>;
      showMediaFileForm: (title: string, defaultTitle: string, defaultDate?: string, filePath?: string, userId?: string) => Promise<{ title: string; date: string } | null>;
      showDiaryEntryForm: (initialData?: { 
        title: string; 
        content: string;
        entryMode?: 'standalone' | 'linked';
        linkedItemId?: string;
        customDate?: string;
      }, userId?: string) => Promise<{ 
        title: string; 
        content: string; 
        entryMode: 'standalone' | 'linked';
        linkedItemId?: string;
        customDate: string;
      } | null>;
      showConfirmDialog: (options: { title: string; message: string; buttons: string[] }) => Promise<string>;
    };
    auth: {
      login: (credentials: { email: string; password: string }) => Promise<AuthResponse>;
      register: (credentials: { email: string; password: string; name: string }) => Promise<AuthResponse>;
      logout: (userId: string | null) => Promise<{ success: boolean; error?: string }>;
      verifyToken: (token: string) => Promise<string | null>;
      getUser: (userId: string) => Promise<{ id: string; email: string; name: string } | null>;
      updateUser: (userId: string, updates: { name?: string; password?: string }) => Promise<{ success: boolean; error?: string }>;
    };
    profile: {
      savePhoto: (userId: string, photoData: string) => Promise<{ success: boolean; error?: string }>;
      loadPhoto: (userId: string) => Promise<{ success: boolean; photoData?: string }>;
    };
    diary: {
      save: (entry: Omit<DiaryEntry, 'id'>) => Promise<string>;
      getAll: (userId: string) => Promise<DiaryEntry[]>;
      update: (id: string, entry: { 
        title: string; 
        content: string;
        entryMode: 'standalone' | 'linked';
        linkedItemId?: string;
        customDate?: string;
      }, userId: string) => Promise<void>;
      delete: (id: string) => Promise<void>;
    };
    media: {
      upload: (type: 'photo' | 'video' | 'audio', userId: string) => Promise<FileItem | null>;
      getAll: (userId: string) => Promise<FileItem[]>;
      delete: (id: string) => Promise<void>;
      updateMetadata: (id: string, metadata: any, userId: string) => Promise<boolean>;
      updateDate: (id: string, date: string) => Promise<boolean>;
    };
    files: {
      upload: (userId: string) => Promise<FileItem | null>;
      getAll: (userId: string) => Promise<FileItem[]>;
      delete: (id: string) => Promise<void>;
      open: (path: string, userId: string) => Promise<boolean>;
      updateMetadata: (id: string, metadata: any, userId: string) => Promise<boolean>;
      updateDate: (id: string, date: string) => Promise<boolean>;
    };
    database: {
      backup: () => Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }>;
      restore: () => Promise<{ success: boolean; cancelled?: boolean; error?: string }>;
      exportForAI: (userId: string) => Promise<{ success: boolean; path?: string; count?: number; cancelled?: boolean; error?: string }>;
    };
  };
  }
}