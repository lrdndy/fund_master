import { ProductNetValue } from '@/lib/types';

interface NetValueTableProps {
    netValues: ProductNetValue[];
    loading: boolean;
}

export default function NetValueTable({ netValues, loading }: NetValueTableProps) {
    if (loading) {
        return (
            <div className="flex justify-center py-10">
                <span className="text-gray-500">加载净值数据中...</span>
            </div>
        );
    }

    if (netValues.length === 0) {
        return (
            <div className="flex justify-center py-10 text-gray-500">
                暂无该产品的净值数据
            </div>
        );
    }

    // 格式化日期（YYYY-MM-DD → MM-DD）
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return `${date.getMonth() + 1}-${date.getDate().toString().padStart(2, '0')}`;
    };

    return (
        <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-dark uppercase bg-gray-light">
                <tr>
                    <th className="px-4 py-3 rounded-l-lg">日期</th>
                    <th className="px-4 py-3">净值</th>
                    <th className="px-4 py-3">数据来源</th>
                    <th className="px-4 py-3 rounded-r-lg">状态</th>
                </tr>
                </thead>
                <tbody>
                {netValues.map((item) => (
                    <tr key={item.id} className="bg-white border-b hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{formatDate(item.net_value_date)}</td>
                        <td className="px-4 py-3">{item.net_value.toFixed(4)}</td>
                        <td className="px-4 py-3">{item.data_source || '未知'}</td>
                        <td className="px-4 py-3">
                <span className={`px-2 py-1 rounded text-xs ${item.is_valid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {item.is_valid ? '有效' : '无效'}
                </span>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}