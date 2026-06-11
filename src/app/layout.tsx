// RootLayout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/layouts/Navbar';
import Sidebar from '@/components/layouts/Sidebar';
import { BasketProvider } from '@/contexts/BasketContext';
import { SidebarProvider } from '@/contexts/SidebarContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'China Pro Hedgies',
    description: '产品净值管理与相关性分析平台',
};

export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode;
}) {
    return (
        <html lang="zh-CN">
        {/* 用Flex布局包裹整个页面，让Navbar、Sidebar、主内容区形成整体 */}
        <body className={`${inter.className} flex flex-col min-h-screen`}>
        <BasketProvider>
        <SidebarProvider>
            {/* 顶部Navbar（占固定高度） */}
            <Navbar className="border-b border-gray-200" />

            {/* 下方区域：Sidebar + 主内容区（占满剩余高度） */}
            <div className="flex flex-1">
                {/* Sidebar（固定宽度，和Navbar同背景） */}
                <Sidebar />

                {/* 主内容区（占满剩余宽度，浅背景区分区域） */}
                <main className="flex-1 p-4 md:p-6 bg-gray-50">
                    {children}
                </main>
            </div>
        </SidebarProvider>
        </BasketProvider>
        </body>
        </html>
    );
}