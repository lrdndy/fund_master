import { Product } from '@/lib/types';
import { useRouter } from 'next/navigation';

interface ProductListProps {
    products: Product[];
    /** 当前排序值，对齐 ProductFilterParams.ordering：'-return_1m' | 'return_1m' | '' */
    ordering?: string;
    /** 点击列头切换排序时回调；不传则列头不可点 */
    onOrderingChange?: (ordering: string) => void;
}

export default function ProductList({ products, ordering = '', onOrderingChange }: ProductListProps) {
    const router = useRouter();

    // 三态切换：none -> desc -> asc -> none
    const cycleReturn1mOrdering = () => {
        if (!onOrderingChange) return;
        const next = ordering === '-return_1m' ? 'return_1m' : ordering === 'return_1m' ? '' : '-return_1m';
        onOrderingChange(next);
    };

    const return1mArrow =
        ordering === '-return_1m' ? '↓' : ordering === 'return_1m' ? '↑' : '⇅';

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

    const formatReturn = (ret: number | null | undefined): { text: string; cls: string } => {
        if (ret === null || ret === undefined || Number.isNaN(ret)) {
            return { text: '—', cls: 'text-gray-400' };
        }
        const pct = ret * 100;
        const sign = pct > 0 ? '+' : '';
        const cls = pct > 0 ? 'text-red-600' : pct < 0 ? 'text-green-600' : 'text-gray-600';
        return { text: `${sign}${pct.toFixed(2)}%`, cls };
    };

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                <tr>
                    <th className="px-6 py-3 rounded-l-lg">产品名称 / 代码</th>
                    {/* 🔥 产品描述列加宽，去掉操作栏后空间更充足 */}
                    <th className="px-6 py-3 max-w-[350px]">产品描述</th>
                    <th className="px-6 py-3">周期标签</th>
                    <th className="px-6 py-3">量化类型</th>
                    <th className="px-6 py-3">算法类型</th>
                    <th className="px-6 py-3">策略类型</th>
                    <th className="px-6 py-3">FOF 归属</th>
                    <th className="px-6 py-3">自定义标签</th>
                    <th
                        className={`px-6 py-3 select-none ${onOrderingChange ? 'cursor-pointer hover:bg-gray-200' : ''}`}
                        onClick={onOrderingChange ? cycleReturn1mOrdering : undefined}
                        title={onOrderingChange ? '点击切换排序：降序 / 升序 / 默认' : undefined}
                    >
                        近一月收益率 <span className={ordering.includes('return_1m') ? 'text-blue-600' : 'text-gray-400'}>{return1mArrow}</span>
                    </th>
                    <th className="px-6 py-3 rounded-r-lg">打分</th>
                </tr>
                </thead>
                <tbody>
                {products.map((product) => {
                    const ret = formatReturn(product.return_1m);
                    return (
                        <tr
                            key={product.id}
                            className="bg-white border-b hover:bg-gray-50 cursor-pointer"
                            onClick={() => handleViewDetail(product.id)}
                        >
                            <td className="px-6 py-4">
                                <div className="font-medium text-gray-800">{product.product_name}</div>
                                <div className="text-xs text-gray-500 mt-0.5">{product.product_code}</div>
                            </td>
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
                            <td className={`px-6 py-4 font-medium ${ret.cls}`}>{ret.text}</td>
                            <td className="px-6 py-4">{formatScore(product.score)}</td>
                        </tr>
                    );
                })}
                </tbody>
            </table>
        </div>
    );
}
