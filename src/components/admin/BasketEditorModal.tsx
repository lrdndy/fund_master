'use client';

import { useEffect, useMemo, useState } from 'react';
import { productApi, benchmarkApi } from '@/lib/api';
import { useBasket } from '@/contexts/BasketContext';
import type { Basket, Product, BenchmarkIndex } from '@/lib/types';

interface Props {
    initial: Basket | null;
    onClose: () => void;
}

export default function BasketEditorModal({ initial, onClose }: Props) {
    const { create, update } = useBasket();
    const isEdit = !!initial;

    const [name, setName] = useState(initial?.name ?? '');
    const [description, setDescription] = useState(initial?.description ?? '');
    const [productIds, setProductIds] = useState<number[]>(initial?.product_id_list ?? []);
    const [indexIds, setIndexIds] = useState<number[]>(initial?.index_id_list ?? []);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 候选数据源
    const [products, setProducts] = useState<Product[]>([]);
    const [benchmarks, setBenchmarks] = useState<BenchmarkIndex[]>([]);
    const [productSearch, setProductSearch] = useState('');

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const [pRes, bRes] = await Promise.all([
                    productApi.getProducts({}),
                    benchmarkApi.getBenchmarks(),
                ]);
                if (cancelled) return;
                setProducts(pRes.results ?? []);
                setBenchmarks(bRes.results ?? []);
            } catch (e) {
                console.error(e);
            }
        };
        void load();
        return () => { cancelled = true; };
    }, []);

    const filteredProducts = useMemo(() => {
        const kw = productSearch.trim().toLowerCase();
        if (!kw) return products;
        return products.filter(p =>
            p.product_name?.toLowerCase().includes(kw) ||
            p.product_code?.toLowerCase().includes(kw),
        );
    }, [products, productSearch]);

    const toggleProduct = (id: number) => {
        setProductIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };
    const toggleIndex = (id: number) => {
        setIndexIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const handleSave = async () => {
        if (!name.trim()) return setError('请输入篮子名称');
        setSaving(true);
        setError(null);
        try {
            const payload = {
                name: name.trim(),
                description: description.trim() || undefined,
                product_ids: productIds,
                index_ids: indexIds,
            };
            if (isEdit && initial) await update(initial.id, payload);
            else await create(payload);
            onClose();
        } catch (e) {
            const err = e as { response?: { data?: Record<string, string[] | string> } };
            const data = err.response?.data;
            if (data && typeof data === 'object') {
                const msg = Object.entries(data)
                    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
                    .join('；');
                setError(msg || '保存失败');
            } else {
                setError('保存失败');
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
                <div className="p-5 border-b border-gray-200 flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-gray-800">{isEdit ? '编辑篮子' : '新建篮子'}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* 基本信息 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">名称 *</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="如 中证500增强组 / 美林时钟测试组"
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                            <input
                                type="text"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="可选"
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                            />
                        </div>
                    </div>

                    {/* 产品成员 */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium text-gray-700">产品成员（已选 {productIds.length}）</label>
                            <input
                                type="text"
                                value={productSearch}
                                onChange={e => setProductSearch(e.target.value)}
                                placeholder="搜索名称 / 代码"
                                className="px-2 py-1 border border-gray-300 rounded text-xs w-48"
                            />
                        </div>
                        <div className="border border-gray-200 rounded max-h-60 overflow-y-auto">
                            {filteredProducts.length === 0 ? (
                                <div className="p-4 text-center text-sm text-gray-400">未找到匹配产品</div>
                            ) : (
                                filteredProducts.map(p => {
                                    const checked = productIds.includes(p.id);
                                    return (
                                        <label
                                            key={p.id}
                                            className={`flex items-center gap-2 px-3 py-2 text-sm border-b border-gray-100 cursor-pointer ${checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                        >
                                            <input type="checkbox" checked={checked} onChange={() => toggleProduct(p.id)} />
                                            <span className="flex-1">{p.product_name}</span>
                                            <span className="text-xs text-gray-400 font-mono">{p.product_code}</span>
                                        </label>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* 基准成员 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">基准指数成员（已选 {indexIds.length}）</label>
                        {benchmarks.length === 0 ? (
                            <div className="text-xs text-gray-400">暂无可选基准</div>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {benchmarks.map(b => {
                                    const checked = indexIds.includes(b.id);
                                    return (
                                        <label
                                            key={b.id}
                                            className={`px-2.5 py-1 rounded-full text-xs cursor-pointer border ${checked ? 'bg-blue-50 text-blue-700 border-blue-400' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
                                        >
                                            <input type="checkbox" className="hidden" checked={checked} onChange={() => toggleIndex(b.id)} />
                                            {b.index_short_name || b.index_name}
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
                </div>

                <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded">取消</button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                        {saving ? '保存中...' : (isEdit ? '保存' : '创建')}
                    </button>
                </div>
            </div>
        </div>
    );
}
