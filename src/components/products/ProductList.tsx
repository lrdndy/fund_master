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

    const formatDesc = (desc: string | null | undefined): string => {
        return desc || '—';
    };

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                <tr>
                    <th className="px-6 py-3 rounded-l-lg">产品名称</th>
                    <th className="px-6 py-3">产品代码</th>
                    {/* 🔥 产品描述列加宽，去掉操作栏后空间更充足 */}
                    <th className="px-6 py-3 max-w-[350px]">产品描述</th>
                    <th className="px-6 py-3">周期标签</th>
                    <th className="px-6 py-3">量化类型</th>
                    <th className="px-6 py-3">算法类型</th>
                    <th className="px-6 py-3">策略类型</th>
                    <th className="px-6 py-3">FOF 归属</th>
                    <th className="px-6 py-3">自定义标签</th>
                    <th className="px-6 py-3 rounded-r-lg">打分</th>
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
                        {/* 🔥 产品描述列加宽到 350px，展示更舒适 */}
                        <td className="px-6 py-4 max-w-[350px] whitespace-normal break-words text-gray-600">
                            {formatDesc(product.product_desc)}
                        </td>
                        <td className="px-6 py-4">{product.cycle_name}</td>
                        <td className="px-6 py-4">{product.quant_type_name}</td>
                        <td className="px-6 py-4">{product.algorithm_name}</td>
                        <td className="px-6 py-4">{product.strategy_name}</td>
                        <td className="px-6 py-4">{product.fof_own_name ?? '—'}</td>
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
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}