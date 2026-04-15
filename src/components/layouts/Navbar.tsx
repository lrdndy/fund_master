// Navbar.tsx
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface NavbarProps {
    className?: string;
}

export default function Navbar({ className = '' }: NavbarProps) {
    const router = useRouter();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [token, setToken] = useState<string | null>(null);
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        const storedToken = localStorage.getItem('fundAdminToken');
        Promise.resolve().then(() => {
            setIsClient(true);
            setToken(storedToken);
        });
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('fundAdminToken');
        localStorage.removeItem('username');
        setToken(null);
        router.push('/login');
    };

    const goHome = () => {
        router.push('/');
    };

    return (
        <nav className={`bg-white px-4 py-3 md:px-6 h-16 flex items-center ${className}`}>
            <div className="flex w-full items-center justify-between">
                {/* Logo 可点击回主页 */}
                <div
                    onClick={goHome}
                    className="cursor-pointer transition-colors hover:text-blue-600"
                >
                    <h1 className="text-xl font-bold text-blue-800">China Pro Hedgie ♟️ 🎲 🀄</h1>
                </div>

                {/* 用户区域 */}
                <div className="flex items-center space-x-4">
                    {!isClient ? (
                        <button className="opacity-0 pointer-events-none">登录</button>
                    ) : token ? (
                        <div className="relative">
                            <button
                                onClick={() => setIsMenuOpen(!isMenuOpen)}
                                className="flex items-center space-x-2 text-sm font-medium text-gray-700"
                            >
                                <span>管理员</span>
                                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                            {isMenuOpen && (
                                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-10 border border-gray-200">
                                    <button
                                        onClick={handleLogout}
                                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                    >
                                        退出登录
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <button
                            onClick={() => router.push('/login')}
                            className="bg-blue-600 text-white px-3 py-1 rounded text-sm"
                        >
                            登录
                        </button>
                    )}
                </div>
            </div>
        </nav>
    );
}