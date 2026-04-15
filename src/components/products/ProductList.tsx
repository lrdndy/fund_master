//src/components/products/ProductList.tsx
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

    const formatScore = (score: number | string | null | undefined): string => {
        if (!score) return '0.00';
        const num = typeof score === 'number' ? score : parseFloat(score);
        return Number.isNaN(num) ? '0.00' : num.toFixed(2);
    };

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                <tr>
                    <th className="px-6 py-3 rounded-l-lg">产品名称</th>
                    <th className="px-6 py-3">产品代码</th>
                    <th className="px-6 py-3">周期标签</th>
                    <th className="px-6 py-3">量化类型</th>
                    <th className="px-6 py-3">算法类型</th>
                    <th className="px-6 py-3">策略类型</th>
                    <th className="px-6 py-3">FOF 归属</th>
                    {/* 🔥 新增：自定义标签列 */}
                    <th className="px-6 py-3">自定义标签</th>
                    <th className="px-6 py-3">打分</th>
                    <th className="px-6 py-3 rounded-r-lg">操作</th>
                </tr>
                </thead>
                <tbody>
                {products.map((product) => (
                    <tr
                        key={product.id}
                        className="bg-white border-b hover:bg-gray-50 cursor-pointer"
                        onClick={() => handleViewDetail(product.id)}
                    >
                        <td className="px-6 py-4 font-medium">{product.product_name}</td>
                        <td className="px-6 py-4">{product.product_code}</td>
                        <td className="px-6 py-4">{product.cycle_name}</td>
                        <td className="px-6 py-4">{product.quant_type_name}</td>
                        <td className="px-6 py-4">{product.algorithm_name}</td>
                        <td className="px-6 py-4">{product.strategy_name}</td>
                        <td className="px-6 py-4">{product.fof_own_name ?? '—'}</td>
                        {/* 🔥 新增：自定义标签展示（支持多个标签，用逗号分隔） */}
                        <td className="px-6 py-4">
                            {product.custom_tags?.length ? (
                                <div className="flex flex-wrap gap-1">
                                    {product.custom_tags.map((tag) => (
                                        <span
                                            key={tag.id}
                                            className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs"
                                        >
                                            {tag.tag_name}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                '—'
                            )}
                        </td>
                        <td className="px-6 py-4">{formatScore(product.score)}</td>
                        <td className="px-6 py-4">
                            <button
                                type="button"
                                className="text-blue-600 hover:underline"
                                onClick={(e) => {
                                    e.stopPropagation(); // 防止触发行点击
                                    handleViewDetail(product.id);
                                }}
                            >
                                查看详情
                            </button>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}