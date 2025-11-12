import React, { useState, useEffect } from 'react';
import { CameraIcon } from '@heroicons/react/24/outline';

interface ProfileProps {
  userId: string;
  onLogout: () => void;
  onClose: () => void;
  onUserDataUpdate: (name: string) => void;
  onProfilePhotoUpdate: (photoData: string | null) => void;
}

interface UserData {
  id: string;
  email: string;
  name: string;
}

const Profile: React.FC<ProfileProps> = ({ userId, onLogout, onClose, onUserDataUpdate, onProfilePhotoUpdate }) => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const user = await window.api.auth.getUser(userId);
        if (user) {
          setUserData(user);
          setEditedName(user.name);
        }
        // Load profile photo from disk
        const photoResult = await window.api.profile.loadPhoto(userId);
        if (photoResult.success && photoResult.photoData) {
          setProfilePhoto(photoResult.photoData);
        }
      } catch (error) {
        console.error('Error loading user data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [userId]);

  const handlePhotoUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64 = event.target?.result as string;
          
          // Resize image to 200x200
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxSize = 200;
            
            // Calculate new dimensions maintaining aspect ratio
            let width = img.width;
            let height = img.height;
            
            if (width > height) {
              if (width > maxSize) {
                height = (height * maxSize) / width;
                width = maxSize;
              }
            } else {
              if (height > maxSize) {
                width = (width * maxSize) / height;
                height = maxSize;
              }
            }
            
            canvas.width = maxSize;
            canvas.height = maxSize;
            const ctx = canvas.getContext('2d');
            
            if (ctx) {
              // Fill background with white
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, maxSize, maxSize);
              
              // Center the image
              const x = (maxSize - width) / 2;
              const y = (maxSize - height) / 2;
              
              ctx.drawImage(img, x, y, width, height);
              
              // Convert to base64 with quality compression
              const resizedBase64 = canvas.toDataURL('image/jpeg', 0.85);
              setProfilePhoto(resizedBase64);
              
              // Сохраняем на диск через IPC
              window.api.profile.savePhoto(userId, resizedBase64).then(result => {
                if (result.success) {
                  console.log('Profile photo saved to disk for user:', userId);
                } else {
                  console.error('Failed to save profile photo:', result.error);
                }
              });
              
              onProfilePhotoUpdate(resizedBase64);
            }
          };
          img.src = base64;
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const handleSaveChanges = async () => {
    if (!userData) return;

    // Validate password if changed
    if (newPassword || confirmPassword) {
      if (newPassword !== confirmPassword) {
        alert('Пароли не совпадают!');
        return;
      }
      if (newPassword.length < 6) {
        alert('Пароль должен содержать минимум 6 символов');
        return;
      }
    }

    setSaving(true);
    try {
      // Update user data
      const result = await window.api.auth.updateUser(userId, {
        name: editedName,
        password: newPassword || undefined
      });

      if (result.success) {
        setUserData({ ...userData, name: editedName });
        onUserDataUpdate(editedName);
        setEditing(false);
        setNewPassword('');
        setConfirmPassword('');
        alert('Данные успешно обновлены!');
      } else {
        alert('Ошибка обновления данных: ' + (result.error || 'Неизвестная ошибка'));
      }
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Ошибка обновления данных');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditedName(userData?.name || '');
    setNewPassword('');
    setConfirmPassword('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-pulse text-gray-500 text-lg">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-gray-900">Профиль</h1>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-sm font-medium"
          >
            Закрыть
          </button>
        </div>

        {/* Profile Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Avatar Section */}
          <div className="bg-gradient-to-br from-blue-400 to-blue-600 px-6 py-12 text-center">
            <button
              onClick={handlePhotoUpload}
              className="relative inline-flex items-center justify-center w-24 h-24 rounded-full bg-white shadow-lg hover:shadow-xl transition-shadow cursor-pointer group"
            >
              {profilePhoto ? (
                <img 
                  src={profilePhoto} 
                  alt="Profile" 
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-4xl font-bold text-blue-600">
                  {userData?.name?.charAt(0).toUpperCase() || 'U'}
                </span>
              )}
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded-full flex items-center justify-center transition-all">
                <CameraIcon className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
            <p className="mt-3 text-white text-sm opacity-75">Нажмите для изменения фото</p>
          </div>

          {/* User Info Section */}
          <div className="px-6 py-8 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-2">
                Имя
              </label>
              {editing ? (
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Введите имя"
                />
              ) : (
                <div className="text-lg font-medium text-gray-900">
                  {userData?.name || 'Не указано'}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-500 mb-2">
                Email (Логин)
              </label>
              <div className="text-lg font-medium text-gray-900">
                {userData?.email || 'Не указано'}
              </div>
            </div>

            {editing && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-2">
                    Новый пароль (оставьте пустым, если не хотите менять)
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Введите новый пароль"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-2">
                    Подтвердите новый пароль
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Повторите новый пароль"
                  />
                </div>
              </>
            )}

            {!editing && (
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-2">
                  Пароль
                </label>
                <div className="text-lg font-medium text-gray-900">
                  ••••••••
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 space-y-3">
            {editing ? (
              <div className="flex gap-3">
                <button
                  onClick={handleSaveChanges}
                  disabled={saving}
                  className="flex-1 px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 active:bg-green-700 font-medium transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </button>
                <button
                  onClick={handleCancelEdit}
                  disabled={saving}
                  className="flex-1 px-4 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 active:bg-gray-700 font-medium transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Отмена
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 active:bg-blue-700 font-medium transition-colors duration-200"
              >
                Редактировать профиль
              </button>
            )}
            
            <button
              onClick={onLogout}
              className="w-full px-4 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 active:bg-red-700 font-medium transition-colors duration-200"
            >
              Выйти
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
