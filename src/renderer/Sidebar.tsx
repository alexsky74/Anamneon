import React from 'react';
import { DocumentTextIcon, DocumentIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, DocumentArrowDownIcon } from '@heroicons/react/24/outline';

interface SidebarProps {
  userName: string;
  profilePhoto: string | null;
  onAddDiary: () => void;
  onAddFile: () => void;
  onBackup: () => void;
  onRestore: () => void;
  onExport: () => void;
  onProfileClick: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ userName, profilePhoto, onAddDiary, onAddFile, onBackup, onRestore, onExport, onProfileClick }) => {
  return (
    <div className="w-64 bg-gradient-to-b from-gray-50 to-white border-r border-gray-200 flex flex-col h-screen">
      {/* Header */}
      <div className="px-6 py-6 border-b border-gray-200/60">
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight" style={{ letterSpacing: '-0.02em' }}>
          Anamneon
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-6 space-y-1">
        <div className="mb-4">
          <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Добавить
          </p>
        </div>
        
        <button
          onClick={onAddDiary}
          className="w-full flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100/80 active:bg-gray-200/80 transition-all duration-150 group"
        >
          <DocumentTextIcon className="w-5 h-5 mr-3 text-gray-500 group-hover:text-blue-600 transition-colors" />
          <span className="group-hover:text-gray-900">Запись</span>
        </button>

        <button
          onClick={onAddFile}
          className="w-full flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100/80 active:bg-gray-200/80 transition-all duration-150 group"
        >
          <DocumentIcon className="w-5 h-5 mr-3 text-gray-500 group-hover:text-blue-600 transition-colors" />
          <span className="group-hover:text-gray-900">Файл</span>
        </button>

        <div className="mt-6 mb-4">
          <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            База данных
          </p>
        </div>

        <button
          onClick={onBackup}
          className="w-full flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100/80 active:bg-gray-200/80 transition-all duration-150 group"
        >
          <ArrowDownTrayIcon className="w-5 h-5 mr-3 text-gray-500 group-hover:text-green-600 transition-colors" />
          <span className="group-hover:text-gray-900">Бэкап</span>
        </button>

        <button
          onClick={onRestore}
          className="w-full flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100/80 active:bg-gray-200/80 transition-all duration-150 group"
        >
          <ArrowUpTrayIcon className="w-5 h-5 mr-3 text-gray-500 group-hover:text-orange-600 transition-colors" />
          <span className="group-hover:text-gray-900">Восстановить</span>
        </button>

        <button
          onClick={onExport}
          className="w-full flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100/80 active:bg-gray-200/80 transition-all duration-150 group"
        >
          <DocumentArrowDownIcon className="w-5 h-5 mr-3 text-gray-500 group-hover:text-purple-600 transition-colors" />
          <span className="group-hover:text-gray-900">Экспорт</span>
        </button>
      </nav>

      {/* User Profile */}
      <div className="px-3 py-4 border-t border-gray-200/60 bg-white">
        <button
          onClick={onProfileClick}
          className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-md hover:bg-gray-100/80 active:bg-gray-200/80 transition-all duration-150"
        >
          <div className="flex-shrink-0">
            {profilePhoto ? (
              <img
                src={profilePhoto}
                alt={userName}
                className="w-9 h-9 rounded-full object-cover shadow-sm"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold text-sm shadow-sm">
                {userName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium text-gray-900 truncate">
              {userName}
            </p>
            <p className="text-xs text-gray-500">
              Профиль
            </p>
          </div>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
