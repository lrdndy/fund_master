// Sidebar.tsx
'use client';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
    const router = useRouter();
    const pathname = usePathname();

    const menuItems = [
        { label: '产品管理', path: '/', icon: '📊' },
        { label: '添加产品', path: '/products/new', icon: '➕' },
        { label: '净值管理', path: '/net-values', icon: '📈' },
        { label: '相关性看板', path: '/correlation', icon: '🔗' },
        { label: '标签页管理', path: '/admin/tags', icon: '🧰' },
        { label: '基准管理', path: '/admin/benchmarks', icon: '📐' },
    ];

    return (
    <aside className="w-64 bg-white border-r border-gray-200">
        {/* 侧边栏标题（和Navbar分隔线统一） */}
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
                            ? 'bg-blue-100 text-blue-800 font-medium' // 和Navbar Logo颜色统一
                            : 'text-gray-700 hover:bg-gray-100'
                    }`}
                >
                    <span className="w-5 h-5 flex items-center justify-center">{item.icon}</span>
                    <span>{item.label}</span>
                </button>
            ))}
        </div>
    </aside>
);
}