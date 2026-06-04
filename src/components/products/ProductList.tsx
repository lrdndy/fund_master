'use client';
import { Product, CustomTag } from '@/lib/types';
import { useState } from 'react';
import TagAssignModal from './TagAssignModal';

interface ProductListProps {
    products: Product[];
    /** 当前排序值，对齐 ProductFilterParams.ordering：'-return_1m' | 'return_1m' | '' */
    ordering?: string;
    /** 点击列头切换排序时回调；不传则列头不可点 */
    onOrderingChange?: (ordering: string) => void;
    /** 在篮子里的产品 ID，行会加左侧蓝条 + 浅蓝背景做视觉标记 */
    highlightIds?: number[];
    /** 给标签 modal 用的全量标签字典 */
    customTags?: CustomTag[];
    /** 标签更新后，让父组件刷新产品列表 */
    onProductUpdated?: () => void;
}

export default function ProductList({ products, ordering = '', onOrderingChange, highlightIds, customTags = [], onProductUpdated }: ProductListProps) {
    const highlightSet = new Set(highlightIds ?? []);
    const [tagEditing, setTagEditing] = useState<Product | null>(null);

    // 三态切换：none -> desc -> asc -> none
    const cycleReturn1mOrdering = () => {
        if (!onOrderingChange) return;
        const next = ordering === '-return_1m' ? 'return_1m' : ordering === 'return_1m' ? '' : '-return_1m';
        onOrderingChange(next);
    };

    const return1mArrow =
        ordering === '-return_1m' ? '↓' : ordering === 'return_1m' ? '↑' : '⇅';

    // 行点击：新窗口打开，避免主页面回退后丢失搜索/筛选
    const handleViewDetail = (productId: number, e: React.MouseEvent) => {
        // Cmd/Ctrl-click 浏览器原生新窗口；普通点击我们也用 window.open 走新窗口
        e.preventDefault();
        window.open(`/products/${productId}`, '_blank', 'noopener,noreferrer');
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
                        最近一月收益率 <span className={ordering.includes('return_1m') ? 'text-blue-600' : 'text-gray-400'}>{return1mArrow}</span>
                        <div className="text-[10px] font-normal text-gray-400 mt-0.5 normal-case">窗口：今天往前 30 天</div>
                    </th>
                    <th className="px-6 py-3">最新净值日期</th>
                    <th className="px-6 py-3 rounded-r-lg">打分</th>
                </tr>
                </thead>
                <tbody>
                {products.map((product) => {
                    const ret = formatReturn(product.return_1m);
                    const inBasket = highlightSet.has(product.id);
                    return (
                        <tr
                            key={product.id}
                            className={`border-b cursor-pointer ${inBasket ? 'bg-blue-50/60 hover:bg-blue-100/70 shadow-[inset_3px_0_0_0_#3b82f6]' : 'bg-white hover:bg-gray-50'}`}
                            onClick={(e) => handleViewDetail(product.id, e)}
                        >
                            <td className="px-6 py-4">
                                <div className="font-medium text-gray-800 flex items-center gap-1.5">
                                    {product.product_name}
                                    {inBasket && <span title="该产品在当前选中的篮子里" className="text-[10px] text-blue-600 px-1.5 py-0.5 bg-blue-100 rounded">🧺</span>}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">{product.product_code}</div>
                            </td>
                            <td className="px-6 py-4 max-w-[350px] whitespace-normal break-words text-gray-600">
                                {formatDesc(product.product_desc)}
                            </td>
                            <td className="px-6 py-4">{product.cycle_name}</td>
                            <td className="px-6 py-4">{product.quant_type_name}</td>
                            <td className="px-6 py-4">{product.algorithm_name}</td>
                            <td className="px-6 py-4">{product.strategy_name}</td>
                            <td className="px-6 py-4">{product.fof_own_name ?? '—'}</td>
                            {/* 自定义标签列：双击或点 ✎ 直接编辑，无需进详情页 */}
                            <td
                                className="px-6 py-4"
                                onDoubleClick={(e) => { e.stopPropagation(); setTagEditing(product); }}
                                title="双击编辑标签"
                            >
                                <div className="group/tags flex items-center gap-1 flex-wrap">
                                    {product.custom_tags?.length ? (
                                        product.custom_tags.map((tag) => (
                                            <span
                                                key={tag.id}
                                                className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs"
                                            >
                                                {tag.tag_name}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-gray-400">—</span>
                                    )}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setTagEditing(product); }}
                                        className="text-gray-300 hover:text-blue-600 ml-0.5 text-[10px] leading-none transition-colors"
                                        title="编辑标签"
                                    >
                                        ✎
                                    </button>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <div className={`font-medium ${ret.cls}`}>{ret.text}</div>
                                {product.return_1m_start_date && product.return_1m_end_date && (
                                    <div className="text-[10px] text-gray-400 mt-0.5 font-mono whitespace-nowrap">
                                        {product.return_1m_start_date.slice(5)} → {product.return_1m_end_date.slice(5)}
                                    </div>
                                )}
                            </td>
                            <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{product.latest_nv_date ?? '—'}</td>
                            <td className="px-6 py-4">{formatScore(product.score)}</td>
                        </tr>
                    );
                })}
                </tbody>
            </table>

            {tagEditing && (
                <TagAssignModal
                    product={tagEditing}
                    allTags={customTags}
                    onClose={() => setTagEditing(null)}
                    onSaved={() => {
                        setTagEditing(null);
                        onProductUpdated?.();
                    }}
                />
            )}
        </div>
    );
}
