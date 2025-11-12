import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { app } from 'electron';
import path from 'path';
import { DiaryEntry, FileItem } from '../shared/types';
import crypto from 'crypto';

export class Database {
  private db: any;
  private dbPath: string = '';

  getDatabasePath(): string {
    return this.dbPath;
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
    }
  }

  async initialize() {
    try {
      this.dbPath = path.join(app.getPath('userData'), 'anamneon.db');
      console.log('Initializing database at:', this.dbPath);
      
      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database
      });

      await this.createTables();
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Error initializing database:', error);
      throw error;
    }
  }

  private async createTables() {
    try {
      // Create tables one by one with error handling
      const tables = [
        'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT, created_at TEXT NOT NULL)',
        `CREATE TABLE IF NOT EXISTS diary_entries (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          type TEXT CHECK(type IN ('text', 'audio')) NOT NULL,
          entry_mode TEXT CHECK(entry_mode IN ('standalone', 'linked')) DEFAULT 'standalone' NOT NULL,
          linked_item_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          encrypted_content BLOB,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )`,
        `CREATE TABLE IF NOT EXISTS files (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          path TEXT NOT NULL,
          type TEXT CHECK(type IN ('photo', 'video', 'audio', 'pdf', 'txt', 'docx', 'spreadsheet')) NOT NULL,
          created_at TEXT NOT NULL,
          metadata TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )`
      ];

      for (const sql of tables) {
        await this.db.exec(sql).catch((err: Error) => {
          console.error('Error creating table:', err);
          throw err;
        });
      }

      // Migrate existing tables to new structure
      await this.migrateToFilesTable();
    } catch (error) {
      console.error('Error in createTables:', error);
      throw error;
    }
  }

  private async migrateToFilesTable() {
    try {
      // Check if old tables exist
      const tables = await this.db.all("SELECT name FROM sqlite_master WHERE type='table'");
      const tableNames = tables.map((t: any) => t.name);
      
      const hasMediaItems = tableNames.includes('media_items');
      const hasFileItems = tableNames.includes('file_items');
      const hasFiles = tableNames.includes('files');
      
      // Migrate data from old tables to new files table
      if ((hasMediaItems || hasFileItems) && !hasFiles) {
        console.log('Creating files table for migration...');
        await this.db.exec(`
          CREATE TABLE files (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            path TEXT NOT NULL,
            type TEXT CHECK(type IN ('photo', 'video', 'audio', 'pdf', 'txt', 'docx', 'spreadsheet')) NOT NULL,
            created_at TEXT NOT NULL,
            metadata TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
          )
        `);
      }
      
      if (hasMediaItems) {
        console.log('Migrating data from media_items to files...');
        await this.db.exec(`
          INSERT INTO files (id, user_id, name, path, type, created_at, metadata)
          SELECT id, user_id, title, path, type, created_at, metadata FROM media_items
        `);
        console.log('Dropping old media_items table...');
        await this.db.exec('DROP TABLE media_items');
      }
      
      if (hasFileItems) {
        console.log('Migrating data from file_items to files...');
        await this.db.exec(`
          INSERT INTO files (id, user_id, name, path, type, created_at, metadata)
          SELECT id, user_id, name, path, type, created_at, metadata FROM file_items
        `);
        console.log('Dropping old file_items table...');
        await this.db.exec('DROP TABLE file_items');
      }
      
      // Remove linked_item_type from diary_entries if exists
      const diaryTableInfo = await this.db.all('PRAGMA table_info(diary_entries)');
      const hasLinkedItemType = diaryTableInfo.some((col: any) => col.name === 'linked_item_type');
      
      if (hasLinkedItemType) {
        console.log('Removing linked_item_type column from diary_entries...');
        // SQLite doesn't support DROP COLUMN, so we need to recreate the table
        await this.db.exec(`
          CREATE TABLE diary_entries_new (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            type TEXT CHECK(type IN ('text', 'audio')) NOT NULL,
            entry_mode TEXT CHECK(entry_mode IN ('standalone', 'linked')) DEFAULT 'standalone' NOT NULL,
            linked_item_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            encrypted_content BLOB,
            FOREIGN KEY (user_id) REFERENCES users(id)
          );
          
          INSERT INTO diary_entries_new (id, user_id, title, content, type, entry_mode, linked_item_id, created_at, updated_at, encrypted_content)
          SELECT id, user_id, title, content, type, entry_mode, linked_item_id, created_at, updated_at, encrypted_content FROM diary_entries;
          
          DROP TABLE diary_entries;
          
          ALTER TABLE diary_entries_new RENAME TO diary_entries;
        `);
      }
      
      console.log('Migration to files table completed successfully');
    } catch (error) {
      console.error('Error in migrateToFilesTable:', error);
      // Don't throw - migration might have already been done
    }
  }

  // User methods
  async createUser(email: string, passwordHash: string, name?: string): Promise<string> {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    
    await this.db.run(
      'INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, email, passwordHash, name || null, createdAt]
    );
    return id;
  }

  async getUserByEmail(email: string): Promise<any> {
    return this.db.get('SELECT * FROM users WHERE email = ?', [email]);
  }

  async getUserById(id: string): Promise<any> {
    return this.db.get('SELECT * FROM users WHERE id = ?', [id]);
  }

  async updateUser(id: string, updates: { name?: string; password?: string }): Promise<void> {
    const { hashPassword } = require('../main/encryption');
    
    if (updates.password) {
      // Hash the new password
      const passwordHash = hashPassword(updates.password);
      await this.db.run(
        'UPDATE users SET name = ?, password_hash = ? WHERE id = ?',
        [updates.name || null, passwordHash, id]
      );
    } else if (updates.name !== undefined) {
      // Only update name
      await this.db.run(
        'UPDATE users SET name = ? WHERE id = ?',
        [updates.name || null, id]
      );
    }
  }

  // Diary methods
  async saveDiaryEntry(entry: Omit<DiaryEntry, 'id'>): Promise<string> {
    const id = crypto.randomUUID();
    console.log('Saving diary entry to database:', {
      id,
      userId: entry.userId,
      content: entry.content,
      type: entry.type,
      entryMode: entry.entryMode,
      linkedItemId: entry.linkedItemId,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    });
    
    await this.db.run(
      'INSERT INTO diary_entries (id, user_id, title, content, type, entry_mode, linked_item_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, entry.userId, entry.title, entry.content, entry.type, entry.entryMode, entry.linkedItemId || null, entry.createdAt, entry.updatedAt]
    );
    return id;
  }

  async getDiaryEntries(userId: string): Promise<DiaryEntry[]> {
    console.log('Fetching diary entries from database for user:', userId);
    const entries = await this.db.all('SELECT * FROM diary_entries WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    console.log('Retrieved diary entries:', entries);
    return entries.map((entry: any) => ({
      id: entry.id,
      userId: entry.user_id,
      title: entry.title,
      content: entry.content,
      type: entry.type,
      entryMode: entry.entry_mode || 'standalone',
      linkedItemId: entry.linked_item_id || undefined,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at
    }));
  }

  async updateDiaryEntry(id: string, entry: { 
    title: string; 
    content: string;
    entryMode?: 'standalone' | 'linked';
    linkedItemId?: string;
    createdAt?: string;
  }): Promise<void> {
    const updatedAt = new Date().toISOString();
    console.log('Updating diary entry:', { id, ...entry, updatedAt });
    
    if (entry.createdAt) {
      // Обновляем с изменением даты создания
      await this.db.run(
        'UPDATE diary_entries SET title = ?, content = ?, entry_mode = ?, linked_item_id = ?, created_at = ?, updated_at = ? WHERE id = ?',
        [entry.title, entry.content, entry.entryMode || 'standalone', entry.linkedItemId || null, entry.createdAt, updatedAt, id]
      );
    } else {
      // Обновляем без изменения даты создания
      await this.db.run(
        'UPDATE diary_entries SET title = ?, content = ?, entry_mode = ?, linked_item_id = ?, updated_at = ? WHERE id = ?',
        [entry.title, entry.content, entry.entryMode || 'standalone', entry.linkedItemId || null, updatedAt, id]
      );
    }
  }

  // File methods (объединенные media и file)
  async saveFileItem(item: Omit<FileItem, 'id'>): Promise<string> {
    const id = crypto.randomUUID();
    const metadata = {
      ...item.metadata,
      uploadedAt: new Date().toISOString()
    };
    
    await this.db.run(
      'INSERT INTO files (id, user_id, name, path, type, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, item.userId, item.name, item.path, item.type, item.createdAt, JSON.stringify(metadata)]
    );
    return id;
  }

  async getFileItems(userId: string): Promise<FileItem[]> {
    console.log('Fetching file items from database for user:', userId);
    const items: any[] = await this.db.all(
      'SELECT * FROM files WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    console.log('Retrieved file items:', items);
    return items.map((item: any) => ({
      id: item.id,
      userId: item.user_id,
      name: item.name,
      path: item.path,
      type: item.type,
      createdAt: item.created_at,
      metadata: item.metadata ? JSON.parse(item.metadata) : {}
    }));
  }

  // Delete methods
  async deleteDiaryEntry(id: string): Promise<void> {
    console.log('Deleting diary entry:', id);
    await this.db.run('DELETE FROM diary_entries WHERE id = ?', [id]);
  }

  async deleteFileItem(id: string): Promise<void> {
    console.log('Deleting file item:', id);
    await this.db.run('DELETE FROM files WHERE id = ?', [id]);
  }

  async updateFileItem(id: string, metadata: any): Promise<void> {
    console.log('Updating file item metadata:', { id, metadata });
    await this.db.run(
      'UPDATE files SET name = ?, metadata = ? WHERE id = ?',
      [metadata.title, JSON.stringify(metadata), id]
    );
  }

  async updateFileItemDate(id: string, date: string): Promise<void> {
    console.log('Updating file item date:', { id, date });
    await this.db.run(
      'UPDATE files SET created_at = ? WHERE id = ?',
      [date, id]
    );
  }

  // Deprecated methods for backward compatibility
  async saveMediaItem(item: Omit<FileItem, 'id'>): Promise<string> {
    return this.saveFileItem(item);
  }

  async getMediaItems(userId: string): Promise<FileItem[]> {
    return this.getFileItems(userId);
  }

  async deleteMediaItem(id: string): Promise<void> {
    return this.deleteFileItem(id);
  }

  async updateMediaItem(id: string, metadata: any): Promise<void> {
    return this.updateFileItem(id, metadata);
  }

  async updateMediaItemDate(id: string, date: string): Promise<void> {
    return this.updateFileItemDate(id, date);
  }
}