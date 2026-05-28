'use client';
import dynamic from 'next/dynamic';

// 动态加载净值管理组件（ssr:false）：
// - echarts(~1MB) 进入独立异步 chunk，首页/相关性等页面 bundle 不再背它
// - 本页先出框架 + loading 占位，大组件异步加载，TTFB 更快
const NetValuesManagementPage = dynamic(
    () => import('@/components/products/NetValuesManagementPage'),
    {
        ssr: false,
        loading: () => (
            <div className="flex items-center justify-center py-24 text-gray-500 gap-3">
                <span className="w-5 h-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
                净值管理加载中…
            </div>
        ),
    },
);

export default function NetValuesClient() {
    return <NetValuesManagementPage />;
}
