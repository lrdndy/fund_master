import { Product } from '@/lib/types';
import { useRouter } from 'next/navigation';

interface ProductListProps {
    products: Product[];
}

export default function ProductList({ products }: ProductListProps) {
    const router = useRouter();

    const handleViewDetail = (productId: number) => {
        router.push(`/products/${productId}`);
    };
    console.log(products);
    // 辅助函数：将 score 转换为数字（处理字符串/undefined 情况）
    const formatScore = (score: number | string | undefined | null): string => {
        if (!score) return '0.00'; // 空值默认显示 0.00
        const num = typeof score === 'number' ? score : parseFloat(score);
        return isNaN(num) ? '0.00' : num.toFixed(2); // 转换失败显示 0.00
    };

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-dark uppercase bg-gray-light">
                <tr>
                    <th className="px-6 py-3 rounded-l-lg">产品名称</th>
                    <th className="px-6 py-3">产品代码</th>
                    <th className="px-6 py-3">周期标签</th>
                    <th className="px-6 py-3">量化类型</th>
                    <th className="px-6 py-3">算法类型</th>
                    <th className="px-6 py-3">策略类型</th>
                    <th className="px-6 py-3">打分</th>
                    <th className="px-6 py-3 rounded-r-lg">操作</th>
                </tr>
                </thead>
                <tbody>
                {products.map((product) => (
                    <tr
                        key={product.id} // 用 product_id 作为唯一 key（绝对唯一）
                        className="bg-white border-b hover:bg-gray-50 cursor-pointer"
                        onClick={() => handleViewDetail(product.id)}
                    >
                        <td className="px-6 py-4 font-medium">{product.product_name}</td>
                        <td className="px-6 py-4">{product.product_code}</td>
                        <td className="px-6 py-4">{product.cycle_name}</td>
                        <td className="px-6 py-4">{product.quant_type_name}</td>
                        <td className="px-6 py-4">{product.algorithm_name}</td>
                        <td className="px-6 py-4">{product.strategy_name}</td>
                        {/* 关键修正：用 formatScore 处理 score 类型 */}
                        <td className="px-6 py-4">{formatScore(product.score)}</td>
                        <td className="px-6 py-4">
                            <button className="text-primary hover:underline">查看详情</button>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}