import React, { useEffect, useState, forwardRef, useImperativeHandle, useMemo, useCallback } from 'react';
import { DiaryEntry, FileItem } from '../shared/types';
import { PencilIcon, DocumentIcon, TrashIcon } from '@heroicons/react/24/outline';

interface DataTableProps {
  userId: string;
}

export interface DataTableRef {
  handleAddItem: (type: ItemType) => Promise<void>;
}

type ItemType = 'diary' | 'file';

interface TableItem {
  id: string;
  type: ItemType;
  date: string;
  title: string;
  originalType: string;
  data: DiaryEntry | FileItem;
}

const DataTable = forwardRef<DataTableRef, DataTableProps>(({ userId }, ref) => {
  const [items, setItems] = useState<TableItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter states
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20); // Show 20 items per page

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const startTime = performance.now();
      
      // Параллельная загрузка всех данных
      const [diaryEntries, fileItems] = await Promise.all([
        window.api.diary.getAll(userId),
        window.api.files.getAll(userId)
      ]);

      console.log('Data loaded in', performance.now() - startTime, 'ms');

      // Быстрое преобразование данных
      const allItems: TableItem[] = [
        ...diaryEntries.map(entry => ({
          id: entry.id,
          type: 'diary' as const,
          date: entry.createdAt,
          title: entry.title,
          originalType: entry.type,
          data: entry
        })),
        ...fileItems.map(item => ({
          id: item.id,
          type: 'file' as const,
          date: item.createdAt,
          title: item.metadata?.title || item.name,
          originalType: item.type,
          data: item
        }))
      ];

      // Сортировка по дате (новые первыми)
      allItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setItems(allItems);
      console.log('Total processing time:', performance.now() - startTime, 'ms');
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Apply filters using useMemo for better performance
  const filteredItems = useMemo(() => {
    let result = items;

    // Filter by date range
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      result = result.filter(item => new Date(item.date) >= fromDate);
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999); // Include the entire end date
      result = result.filter(item => new Date(item.date) <= toDate);
    }

    // Filter by type
    if (typeFilter !== 'all') {
      result = result.filter(item => item.type === typeFilter);
    }

    // Filter by search query (title)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(item => 
        item.title.toLowerCase().includes(query)
      );
    }

    return result;
  }, [items, dateFrom, dateTo, typeFilter, searchQuery]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [dateFrom, dateTo, typeFilter, searchQuery]);

  // Calculate pagination with useMemo
  const { totalPages, startIndex, endIndex, currentItems } = useMemo(() => {
    const total = Math.ceil(filteredItems.length / itemsPerPage);
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const items = filteredItems.slice(start, end);
    
    return {
      totalPages: total,
      startIndex: start,
      endIndex: end,
      currentItems: items
    };
  }, [filteredItems, currentPage, itemsPerPage]);

  const handleAddItem = useCallback(async (type: ItemType) => {
    try {
      let result;
      
      switch (type) {
        case 'diary':
          const diaryEntry = await window.api.dialog.showDiaryEntryForm(undefined, userId);
          if (diaryEntry) {
            const entry: Omit<DiaryEntry, 'id'> = {
              userId,
              title: diaryEntry.title,
              content: diaryEntry.content,
              type: 'text',
              entryMode: diaryEntry.entryMode || 'standalone',
              linkedItemId: diaryEntry.linkedItemId,
              createdAt: diaryEntry.customDate || new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            await window.api.diary.save(entry);
            await loadData();
          }
          break;
          
        case 'file':
          result = await window.api.files.upload(userId);
          if (result) {
            const fileData = await window.api.dialog.showMediaFileForm('Добавление файла', result.metadata?.title || '', result.createdAt);
            if (fileData) {
              const newMetadata = {
                ...result.metadata,
                title: fileData.title
              };
              await window.api.files.updateMetadata(result.id, newMetadata, userId);
              // Обновляем дату создания, если она изменилась
              if (fileData.date !== result.createdAt) {
                await window.api.files.updateDate(result.id, fileData.date);
              }
              await loadData();
            } else {
              // Если пользователь отменил ввод данных, удаляем загруженный файл
              await window.api.files.delete(result.id);
            }
          }
          break;
      }

      if (result || type === 'diary') {
        await loadData();
      }
    } catch (error) {
      console.error('Error adding item:', error);
    }
  }, [userId, loadData]);

  const handleEdit = useCallback(async (item: TableItem) => {
    try {
      if (item.type === 'diary') {
        const diaryEntry = item.data as DiaryEntry;
        const result = await window.api.dialog.showDiaryEntryForm({
          title: diaryEntry.title,
          content: diaryEntry.content,
          entryMode: diaryEntry.entryMode,
          linkedItemId: diaryEntry.linkedItemId,
          customDate: diaryEntry.createdAt
        }, userId);
        
        if (result) {
          await window.api.diary.update(diaryEntry.id, result, userId);
          await loadData();
        }
      } else if (item.type === 'file') {
        const fileItem = item.data as FileItem;
        const result = await window.api.dialog.showMediaFileForm(
          'Редактирование файла', 
          fileItem.metadata?.title || fileItem.name, 
          fileItem.createdAt,
          fileItem.path,
          userId
        );
        
        if (result) {
          const newMetadata = {
            ...fileItem.metadata,
            title: result.title
          };
          await window.api.files.updateMetadata(fileItem.id, newMetadata, userId);
          
          // Обновляем дату, если она изменилась
          if (result.date !== fileItem.createdAt) {
            await window.api.files.updateDate(fileItem.id, result.date);
          }
          
          await loadData();
        }
      }
    } catch (error) {
      console.error('Error editing entry:', error);
    }
  }, [userId, loadData]);

  const handleDelete = useCallback(async (item: TableItem) => {
    try {
      const confirmed = await window.api.dialog.showConfirmDialog({
        title: 'Подтверждение удаления',
        message: 'После удаления запись восстановить невозможно. Удалить?',
        buttons: ['Да', 'Нет']
      });

      if (confirmed !== 'Да') {
        return;
      }

      switch (item.type) {
        case 'diary':
          await window.api.diary.delete(item.id);
          break;
        case 'file':
          await window.api.files.delete(item.id);
          break;
      }
      await loadData();
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  }, [loadData]);

  const handleClearFilters = useCallback(() => {
    setDateFrom('');
    setDateTo('');
    setTypeFilter('all');
    setSearchQuery('');
  }, []);

  const handleExport = useCallback(async () => {
    try {
      // Вызываем IPC для экспорта с выбором папки
      const result = await window.api.database.exportForAI(userId);
      
      if (result.success) {
        alert(`Экспорт завершён успешно!\nПапка: ${result.path}\nЭкспортировано записей: ${result.count}`);
      } else if (!result.cancelled) {
        alert('Ошибка экспорта: ' + (result.error || 'Неизвестная ошибка'));
      }
    } catch (error) {
      console.error('Error exporting data:', error);
      alert('Ошибка при экспорте данных');
    }
  }, [userId]);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    handleAddItem,
    handleExport
  }), [handleAddItem, handleExport]);

  const typeTranslations: Record<ItemType, string> = {
    diary: 'Запись',
    file: 'Файл'
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <div className="animate-pulse text-gray-500 text-lg">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-4 py-5 sm:p-6">
        {/* Filters */}
        <div className="mb-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Фильтры</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Date From */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Дата от
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            {/* Date To */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Дата до
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            {/* Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Тип данных
              </label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as ItemType | 'all')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="all">Все типы</option>
                <option value="diary">Дневник</option>
                <option value="media">Медиа</option>
                <option value="file">Файл</option>
              </select>
            </div>

            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Поиск по названию
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Введите название..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>

          {/* Filter Actions */}
          <div className="flex items-center justify-between pt-2">
            <div className="text-sm text-gray-600">
              Найдено записей: <span className="font-semibold">{filteredItems.length}</span> из {items.length}
            </div>
            {(dateFrom || dateTo || typeFilter !== 'all' || searchQuery) && (
              <button
                onClick={handleClearFilters}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Сбросить фильтры
              </button>
            )}
          </div>
        </div>

        {/* Empty State */}
        {items.length === 0 ? (
          <div className="text-center rounded-lg border-2 border-dashed border-gray-300 p-12">
            <DocumentIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Нет данных</h3>
            <p className="mt-1 text-sm text-gray-500">
              Начните с добавления новой записи, медиафайла или документа.
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
          /* No Results State */
          <div className="text-center rounded-lg border-2 border-dashed border-gray-300 p-12">
            <DocumentIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Ничего не найдено</h3>
            <p className="mt-1 text-sm text-gray-500">
              Попробуйте изменить параметры фильтрации.
            </p>
          </div>
        ) : (
          /* Table */
          <div className="mt-4 flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
              <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                <div className="overflow-hidden shadow-sm ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                  <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                          Дата
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Название
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Тип
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Подтип
                        </th>
                        <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                          <span className="sr-only">Действия</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {currentItems.map((item, itemIdx) => (
                        <tr key={item.id} className={itemIdx % 2 === 0 ? undefined : 'bg-gray-50'}>
                          <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-gray-500 sm:pl-6">
                            {new Date(item.date).toLocaleString()}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm">
                            <div className="font-medium text-gray-900">{item.title || 'Без названия'}</div>
                            {item.type === 'diary' && (item.data as DiaryEntry).entryMode === 'linked' && (
                              <div className="text-xs text-blue-600 mt-1">
                                🔗 Связана с файлом
                              </div>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {typeTranslations[item.type]}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {item.originalType}
                          </td>
                          <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                            <div className="flex justify-end gap-3">
                              <button
                                onClick={() => handleEdit(item)}
                                className="inline-flex items-center rounded-full p-1.5 text-amber-500 hover:text-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
                                title="Редактировать"
                              >
                                <PencilIcon className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => handleDelete(item)}
                                className="inline-flex items-center rounded-full p-1.5 text-red-500 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                                title="Удалить"
                              >
                                <TrashIcon className="h-5 w-5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 mt-4">
                <div className="flex flex-1 justify-between sm:hidden">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Назад
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Вперед
                  </button>
                </div>
                <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700">
                      Показаны записи с <span className="font-medium">{startIndex + 1}</span> по{' '}
                      <span className="font-medium">{Math.min(endIndex, filteredItems.length)}</span> из{' '}
                      <span className="font-medium">{filteredItems.length}</span>
                    </p>
                  </div>
                  <div>
                    <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="sr-only">Предыдущая</span>
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                        </svg>
                      </button>
                      
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                        // Show first page, last page, current page, and pages around current
                        if (
                          page === 1 ||
                          page === totalPages ||
                          (page >= currentPage - 1 && page <= currentPage + 1)
                        ) {
                          return (
                            <button
                              key={page}
                              onClick={() => setCurrentPage(page)}
                              className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                                page === currentPage
                                  ? 'z-10 bg-blue-600 text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                                  : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                              }`}
                            >
                              {page}
                            </button>
                          );
                        } else if (page === currentPage - 2 || page === currentPage + 2) {
                          return (
                            <span
                              key={page}
                              className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300"
                            >
                              ...
                            </span>
                          );
                        }
                        return null;
                      })}

                      <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="sr-only">Следующая</span>
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

DataTable.displayName = 'DataTable';

export default DataTable;
