// Sidebar.tsx
'use client';
import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';
import { useBasket } from '@/contexts/BasketContext';
import BasketEditorModal from '@/components/admin/BasketEditorModal';
import type { Basket } from '@/lib/types';

export default function Sidebar() {
    const router = useRouter();
    const pathname = usePathname();
    const { baskets, currentBaskets, currentBasketIds, toggleBasket, clearBasketSelection, remove } = useBasket();
    const [editing, setEditing] = useState<Basket | 'new' | null>(null);

    const menuItems = [
        { label: '产品管理', path: '/', icon: '📊' },
        { label: '添加产品', path: '/products/new', icon: '➕' },
        { label: '净值管理', path: '/net-values', icon: '📈' },
        { label: '相关性看板', path: '/correlation', icon: '🔗' },
        { label: '标签页管理', path: '/admin/tags', icon: '🧰' },
        { label: '基准管理', path: '/admin/benchmarks', icon: '📐' },
    ];

    const handleDelete = async (b: Basket, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm(`确认删除篮子「${b.name}」？此为软删除，可在后台恢复。`)) return;
        try {
            await remove(b.id);
        } catch (err) {
            console.error(err);
            alert('删除失败');
        }
    };

    return (
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200">
                <h3 className="font-semibold text-gray-800">功能菜单</h3>
            </div>

            <div className="p-2 space-y-1">
                {menuItems.map((item) => (
                    <button
                        key={item.path}
                        onClick={() => router.push(item.path)}
                        className={`flex items-center w-full space-x-3 px-3 py-2 rounded-md transition-colors text-left ${
                            pathname === item.path
                                ? 'bg-blue-100 text-blue-800 font-medium'
                                : 'text-gray-700 hover:bg-gray-100'
                        }`}
                    >
                        <span className="w-5 h-5 flex items-center justify-center">{item.icon}</span>
                        <span>{item.label}</span>
                    </button>
                ))}

                {/* 我的篮子：主菜单只是一个入口；hover 弹出二级面板 */}
                <div className="relative group">
                    <button
                        type="button"
                        className="flex items-center w-full space-x-3 px-3 py-2 rounded-md text-left text-gray-700 hover:bg-gray-100 group-hover:bg-gray-100"
                    >
                        <span className="w-5 h-5 flex items-center justify-center">🧺</span>
                        <span className="flex-1 truncate">我的篮子</span>
                        {currentBaskets.length > 0 ? (
                            <span className="text-[10px] text-blue-600 truncate max-w-[80px]">
                                {currentBaskets.length === 1 ? currentBaskets[0].name : `已选 ${currentBaskets.length} 个`}
                            </span>
                        ) : (
                            <span className="text-xs text-gray-300">›</span>
                        )}
                    </button>

                    {/* 二级面板：left-full 紧贴；pl-2 是 'hit bridge'，鼠标穿过 2px 间距不会丢 hover */}
                    <div className="hidden group-hover:block absolute left-full top-0 pl-2 z-50">
                        <div className="w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-semibold text-gray-800">
                                    我的篮子
                                    {currentBaskets.length > 0 && <span className="ml-1 text-[10px] text-blue-600">已选 {currentBaskets.length}</span>}
                                </h4>
                                <div className="flex gap-1">
                                    {currentBaskets.length > 0 && (
                                        <button
                                            onClick={clearBasketSelection}
                                            title="清空选中"
                                            className="text-xs text-gray-500 hover:bg-gray-100 rounded px-2 py-0.5"
                                        >
                                            清空
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setEditing('new')}
                                        title="新建篮子"
                                        className="text-xs text-blue-600 hover:bg-blue-50 rounded px-2 py-0.5"
                                    >
                                        + 新建
                                    </button>
                                </div>
                            </div>

                            <div className="max-h-80 overflow-y-auto space-y-0.5">
                                {baskets.length === 0 ? (
                                    <div className="text-xs text-gray-400 px-3 py-2">暂无篮子，点上方「+ 新建」</div>
                                ) : (
                                    baskets.map(b => {
                                        const active = currentBasketIds.includes(b.id);
                                        return (
                                            <div
                                                key={b.id}
                                                onClick={() => toggleBasket(b.id)}
                                                className={`group/item flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer ${
                                                    active ? 'bg-blue-50 text-blue-800' : 'text-gray-700 hover:bg-gray-100'
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    readOnly
                                                    checked={active}
                                                    className="pointer-events-none"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="truncate text-sm">{b.name}</div>
                                                    <div className="text-[10px] text-gray-500">{b.product_id_list.length} 产品 · {b.index_id_list.length} 基准</div>
                                                </div>
                                                <div className="flex gap-0.5 opacity-0 group-hover/item:opacity-100">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setEditing(b); }}
                                                        title="编辑"
                                                        className="text-xs text-gray-500 hover:text-blue-600 px-1"
                                                    >
                                                        ✎
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleDelete(b, e)}
                                                        title="删除"
                                                        className="text-xs text-gray-500 hover:text-red-600 px-1"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <p className="text-[10px] text-gray-400 mt-2 pt-2 border-t border-gray-100 leading-tight">
                                可多选；多个篮子的产品/基准会被合并去重。其他页面有「应用篮子」按钮，首次进入也会自动预填默认对比
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {editing && (
                <BasketEditorModal
                    initial={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                />
            )}
        </aside>
    );
}
