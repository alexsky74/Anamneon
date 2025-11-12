import React, { useState, useEffect, useRef } from 'react';
import { Login } from './Login';
import DataTable from './DataTable';
import Sidebar from './Sidebar';
import Profile from './Profile';

interface AppState {
  isLoggedIn: boolean;
  userId: string | null;
  userName: string;
  showProfile: boolean;
  profilePhoto: string | null;
}

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    isLoggedIn: false,
    userId: null,
    userName: 'Пользователь',
    showProfile: false,
    profilePhoto: null,
  });

  const dataTableRef = useRef<any>(null);

  // Убираем автовход, чтобы пользователь всегда вводил пароль
  // Это необходимо для установки ключа шифрования в main process
  useEffect(() => {
    // Очищаем токен при загрузке, чтобы требовался повторный вход
    // Но сохраняем profile_photo в localStorage
    localStorage.removeItem('token');
  }, []);

  const handleLogin = async (userId: string) => {
    // Сохраняем токен для возможности использования в этой сессии
    localStorage.setItem('token', userId);
    const user = await window.api.auth.getUser(userId);
    
    // Загружаем фото профиля с диска
    const photoResult = await window.api.profile.loadPhoto(userId);
    const profilePhoto = photoResult.success ? photoResult.photoData || null : null;
    console.log('Loading profile photo for user:', userId, 'Photo found:', !!profilePhoto);
    
    setState({ 
      isLoggedIn: true, 
      userId,
      userName: user?.name || 'Пользователь',
      showProfile: false,
      profilePhoto: profilePhoto
    });
  };

  const handleLogout = async () => {
    await window.api.auth.logout(state.userId);
    localStorage.removeItem('token');
    setState({ isLoggedIn: false, userId: null, userName: 'Пользователь', showProfile: false, profilePhoto: null });
  };

  const handleShowProfile = () => {
    setState(prev => ({ ...prev, showProfile: true }));
  };

  const handleCloseProfile = () => {
    setState(prev => ({ ...prev, showProfile: false }));
  };

  const handleUserDataUpdate = (name: string) => {
    setState(prev => ({ ...prev, userName: name }));
  };

  const handleProfilePhotoUpdate = (photoData: string | null) => {
    setState(prev => ({ ...prev, profilePhoto: photoData }));
  };

  const handleAddDiary = () => {
    if (dataTableRef.current?.handleAddItem) {
      dataTableRef.current.handleAddItem('diary');
    }
  };

  const handleAddFile = () => {
    if (dataTableRef.current?.handleAddItem) {
      dataTableRef.current.handleAddItem('file');
    }
  };

  const handleBackup = async () => {
    try {
      const result = await window.api.database.backup();
      if (result.success) {
        alert('Бэкап успешно создан!');
      } else if (!result.cancelled) {
        alert('Ошибка создания бэкапа: ' + (result.error || 'Неизвестная ошибка'));
      }
    } catch (error) {
      console.error('Error creating backup:', error);
      alert('Ошибка создания бэкапа');
    }
  };

  const handleRestore = async () => {
    try {
      const result = await window.api.database.restore();
      if (result.success) {
        alert('База данных успешно восстановлена! Пожалуйста, перезайдите в приложение.');
        handleLogout();
      } else if (!result.cancelled) {
        alert('Ошибка восстановления: ' + (result.error || 'Неизвестная ошибка'));
      }
    } catch (error) {
      console.error('Error restoring backup:', error);
      alert('Ошибка восстановления базы данных');
    }
  };

  const handleExport = async () => {
    if (dataTableRef.current?.handleExport) {
      await dataTableRef.current.handleExport();
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {!state.isLoggedIn ? (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <Login onLogin={handleLogin} />
        </div>
      ) : (
        <>
          <Sidebar 
            userName={state.userName}
            profilePhoto={state.profilePhoto}
            onAddDiary={handleAddDiary}
            onAddFile={handleAddFile}
            onBackup={handleBackup}
            onRestore={handleRestore}
            onExport={handleExport}
            onProfileClick={handleShowProfile}
          />
          <main className="flex-1 overflow-auto bg-white">
            {state.showProfile ? (
              <Profile 
                userId={state.userId!}
                onLogout={handleLogout}
                onClose={handleCloseProfile}
                onUserDataUpdate={handleUserDataUpdate}
                onProfilePhotoUpdate={handleProfilePhotoUpdate}
              />
            ) : (
              <div className="max-w-7xl mx-auto px-8 py-6">
                <DataTable userId={state.userId!} ref={dataTableRef} />
              </div>
            )}
          </main>
        </>
      )}
    </div>
  );
};

export default App;
