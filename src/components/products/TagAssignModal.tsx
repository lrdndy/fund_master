'use client';

import { useMemo, useState } from 'react';
import { productApi } from '@/lib/api';
import type { Product, CustomTag } from '@/lib/types';

interface Props {
    product: Product;
    allTags: CustomTag[];
    onClose: () => void;
    onSaved: () => void;
}

/**
 * 在产品列表行直接弹出，无需进入产品详情页就能给该产品打/取消自定义标签。
 * 走 PATCH /products/<id>/ { custom_tag_ids: [...] }（替换语义；前端在这里维护
 * '当前选中集合'，提交时整体替换）。
 */
export default function TagAssignModal({ product, allTags, onClose, onSaved }: Props) {
    const initialIds = useMemo(() => new Set((product.custom_tags ?? []).map(t => t.id)), [product]);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set(initialIds));
    const [search, setSearch] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const filteredTags = useMemo(() => {
        const kw = search.trim().toLowerCase();
        if (!kw) return allTags;
        return allTags.filter(t => t.tag_name?.toLowerCase().includes(kw));
    }, [allTags, search]);

    const toggle = (id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            await productApi.updateProduct(product.id, {
                custom_tag_ids: Array.from(selectedIds),
            } as Partial<Product>);
            onSaved();
        } catch (e) {
            const err = e as { response?: { data?: Record<string, string[] | string> } };
            const data = err.response?.data;
            if (data && typeof data === 'object') {
                setError(Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('；') || '保存失败');
            } else {
                setError('保存失败');
            }
        } finally {
            setSaving(false);
        }
    };

    const dirty = initialIds.size !== selectedIds.size
        || Array.from(selectedIds).some(id => !initialIds.has(id));

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-gray-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800">给产品打自定义标签</h3>
                            <p className="text-sm text-gray-500 mt-1 truncate max-w-md">{product.product_name}</p>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
                    </div>
                </div>

                <div className="p-5 space-y-3">
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="搜索标签名"
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    />

                    {allTags.length === 0 ? (
                        <div className="text-sm text-gray-400 py-4 text-center">暂无自定义标签，请先去「标签页管理」新建</div>
                    ) : (
                        <div className="max-h-72 overflow-y-auto border border-gray-200 rounded">
                            {filteredTags.length === 0 ? (
                                <div className="text-sm text-gray-400 py-4 text-center">未找到匹配标签</div>
                            ) : (
                                filteredTags.map(tag => {
                                    const checked = selectedIds.has(tag.id);
                                    return (
                                        <label
                                            key={tag.id}
                                            className={`flex items-center gap-2 px-3 py-2 text-sm border-b border-gray-100 cursor-pointer last:border-b-0 ${checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                        >
                                            <input type="checkbox" checked={checked} onChange={() => toggle(tag.id)} />
                                            <span className="flex-1">{tag.tag_name}</span>
                                            {tag.tag_desc && <span className="text-xs text-gray-400">{tag.tag_desc}</span>}
                                        </label>
                                    );
                                })
                            )}
                        </div>
                    )}

                    <div className="text-xs text-gray-500">
                        已选 {selectedIds.size} 个标签；保存后将<span className="text-amber-600 font-medium">替换</span>该产品的全部自定义标签
                    </div>

                    {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
                </div>

                <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded">取消</button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !dirty}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                        {saving ? '保存中...' : '保存'}
                    </button>
                </div>
            </div>
        </div>
    );
}
