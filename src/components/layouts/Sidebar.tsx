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
    const { baskets, currentBasketId, setCurrentBasketId, remove } = useBasket();
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
            </div>

            {/* 我的篮子 */}
            <div className="border-t border-gray-200 mt-2 pt-3 px-2">
                <div className="flex items-center justify-between px-2 mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">🧺 我的篮子</h3>
                    <button
                        onClick={() => setEditing('new')}
                        title="新建篮子"
                        className="text-xs text-blue-600 hover:bg-blue-50 rounded px-1.5 py-0.5"
                    >
                        + 新建
                    </button>
                </div>
                {baskets.length === 0 ? (
                    <div className="text-xs text-gray-400 px-2 py-1">暂无篮子</div>
                ) : (
                    <div className="space-y-0.5">
                        {/* "全部" 选项 = 不应用任何篮子 */}
                        <button
                            onClick={() => setCurrentBasketId(null)}
                            className={`w-full text-left px-3 py-1.5 text-xs rounded ${
                                currentBasketId === null ? 'bg-gray-100 text-gray-800 font-medium' : 'text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                            （不应用篮子）
                        </button>
                        {baskets.map(b => {
                            const active = b.id === currentBasketId;
                            return (
                                <div
                                    key={b.id}
                                    onClick={() => setCurrentBasketId(b.id)}
                                    className={`group flex items-center justify-between px-3 py-1.5 rounded cursor-pointer ${
                                        active ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-700 hover:bg-gray-100'
                                    }`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="truncate text-sm">{b.name}</div>
                                        <div className="text-[10px] text-gray-500">{b.product_id_list.length} 产品 · {b.index_id_list.length} 基准</div>
                                    </div>
                                    <div className="ml-1 flex gap-0.5 opacity-0 group-hover:opacity-100">
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
                        })}
                    </div>
                )}
                <p className="text-[10px] text-gray-400 px-2 mt-2 leading-tight">
                    切换篮子会影响其他页面首次进入时的默认选中（已自定义的不覆盖）
                </p>
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
