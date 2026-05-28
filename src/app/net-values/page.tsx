// app/net-values/page.tsx —— server component，保留 metadata；
// 大组件 + echarts 通过 NetValuesClient 动态加载（见该文件）
import NetValuesClient from './NetValuesClient';

export const metadata = {
    title: '净值管理 - 多产品趋势对比',
    description: '查看并对比多个产品的净值趋势，选择基准产品进行数据分析',
};

export default function NetValuesPage() {
    return (
        <main>
            <NetValuesClient />
        </main>
    );
}