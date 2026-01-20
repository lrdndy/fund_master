// app/net-values/page.tsx
// 无需添加 "use client"，因为核心组件已标记为客户端组件，服务端页面可直接引入客户端组件
import NetValuesManagementPage from '@/components/products/NetValuesManagementPage';

// 页面元数据配置（可选，用于浏览器标签页、SEO 等）
export const metadata = {
    title: '净值管理 - 多产品趋势对比',
    description: '查看并对比多个产品的净值趋势，选择基准产品进行数据分析',
};

// 导出默认页面组件（Next.js App Router 必选）
export default function NetValuesPage() {
    // 可在此添加页面级逻辑：如权限校验、布局包裹、数据预取等
    return (
        <main>
            {/* 引入核心净值管理组件 */}
            <NetValuesManagementPage />
        </main>
    );
}