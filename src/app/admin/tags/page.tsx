'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    CycleTag, QuantType, AlgorithmType, StrategyType, FofOwnTag, CustomTag, CustomTagProduct,
} from '@/lib/types';
import { tagApi, productApi } from '@/lib/api';
import useProductTags from '@/hooks/useProductTags';
import useAuth from '@/hooks/useAuth';

type TagType = 'cycle' | 'quant' | 'algorithm' | 'strategy' | 'fof' | 'custom';

interface TagFormData {
    name: string;
    desc: string;
    permission?: 'public' | 'private';
}

const getErrorMessage = (err: unknown): string => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'object' && err !== null && 'message' in err) {
        return String((err as { message?: string }).message);
    }
    if (typeof err === 'object' && err !== null && 'response' in err) {
        const response = (err as { response?: { data?: unknown } }).response;
        if (response?.data && typeof response.data === 'object' && response.data !== null) {
            return Object.values(response.data).flat().join('；');
        }
    }
    return '操作失败，请重试';
};

export default function AdminTagManager() {
    const router = useRouter();
    const [activeTagType, setActiveTagType] = useState<TagType>('custom');
    const [tags, setTags] = useState<{
        cycles: CycleTag[];
        quants: QuantType[];
        algorithms: AlgorithmType[];
        strategies: StrategyType[];
        fofOwnTags: FofOwnTag[];
        customTags: CustomTag[];
    }>({
        cycles: [],
        quants: [],
        algorithms: [],
        strategies: [],
        fofOwnTags: [],
        customTags: [],
    });

    const [loading, setLoading] = useState<boolean>(true);
    const [operateLoading, setOperateLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [operateError, setOperateError] = useState<string | null>(null);

    const [modalOpen, setModalOpen] = useState<boolean>(false);
    const [modalType, setModalType] = useState<'add' | 'edit'>('add');

    // 🔥 修复：明确联合类型，禁用 any
    type AllTagTypes = CycleTag | QuantType | AlgorithmType | StrategyType | FofOwnTag | CustomTag;
    const [currentEditTag, setCurrentEditTag] = useState<AllTagTypes | null>(null);

    // 🔥 修复：类型明确，禁用 any
    const [selectedParent, setSelectedParent] = useState<CustomTag | null>(null);

    // 产品管理 modal
    const [productModalOpen, setProductModalOpen] = useState(false);
    const [productModalTag, setProductModalTag] = useState<CustomTag | null>(null);
    const [tagProducts, setTagProducts] = useState<CustomTagProduct[]>([]);
    const [allProducts, setAllProducts] = useState<{ id: number; product_name: string }[]>([]);
    const [productModalLoading, setProductModalLoading] = useState(false);
    const [productSearch, setProductSearch] = useState('');

    const [formData, setFormData] = useState<TagFormData>({
        name: '',
        desc: '',
        permission: 'public',
    });

    const { hasWritePermission, loading: authLoading } = useAuth();
    const { tags: initTags, tagsLoading, tagsError } = useProductTags();

    useEffect(() => {
        // 🔥 修复：布尔值类型匹配（undefined → false）
        if (!authLoading && hasWritePermission === false) {
            window.location.href = '/';
        }
    }, [authLoading, hasWritePermission]);

    useEffect(() => {
        if (!hasWritePermission || !initTags) return;
        setTags({
            cycles: initTags.cycles ?? [],
            quants: initTags.quantTypes ?? [],
            algorithms: initTags.algorithms ?? [],
            strategies: initTags.strategies ?? [],
            fofOwnTags: initTags.fofOwnTags ?? [],
            customTags: initTags.customTags ?? [],
        });
        setLoading(false);
    }, [initTags, hasWritePermission]);

    // 🔥 修复：移除所有 any，严格类型
    const openModal = (
        type: 'add' | 'edit',
        tagType: TagType,
        tag?: AllTagTypes,
        parentTag?: CustomTag
    ) => {
        setModalType(type);
        setActiveTagType(tagType);
        setOperateError(null);
        setSelectedParent(parentTag ?? null);

        if (type === 'edit' && tag) {
            setCurrentEditTag(tag);
            let formName = '';
            let formDesc = '';
            let perm: 'public' | 'private' = 'public';

            switch (tagType) {
                case 'cycle':
                    formName = (tag as CycleTag).cycle_name;
                    formDesc = (tag as CycleTag).cycle_desc ?? '';
                    break;
                case 'quant':
                    formName = (tag as QuantType).quant_name;
                    formDesc = (tag as QuantType).quant_desc ?? '';
                    break;
                case 'algorithm':
                    formName = (tag as AlgorithmType).alg_name;
                    formDesc = (tag as AlgorithmType).alg_desc ?? '';
                    break;
                case 'strategy':
                    formName = (tag as StrategyType).strategy_name;
                    formDesc = (tag as StrategyType).strategy_desc ?? '';
                    break;
                case 'fof':
                    formName = (tag as FofOwnTag).fof_name;
                    formDesc = (tag as FofOwnTag).fof_desc ?? '';
                    break;
                case 'custom':
                    formName = (tag as CustomTag).tag_name;
                    formDesc = (tag as CustomTag).tag_desc ?? '';
                    perm = (tag as CustomTag).permission;
                    break;
            }
            setFormData({ name: formName, desc: formDesc, permission: perm });
        } else {
            setCurrentEditTag(null);
            setFormData({ name: '', desc: '', permission: 'public' });
        }
        setModalOpen(true);
    };

    // 🔥 修复：严格类型，无 any
    const renderTreeTags = (list: CustomTag[], level: number) => {
        return list.map(tag => (
            <div key={tag.id}>
                <div
                    className="p-3 border rounded-lg flex justify-between items-center hover:bg-slate-50"
                    style={{ paddingLeft: `${level * 16 + 12}px` }}
                >
                    <div className="flex-1">
                        <div className="text-slate-800 font-medium flex items-center gap-2">
                            {level > 0 && <span className="text-slate-400">↳</span>}
                            {tag.tag_name}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                tag.permission === 'public' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                            }`}>
                                {tag.permission === 'public' ? '公共' : '私密'}
                            </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                            路径：{tag.full_path}
                            {tag.username && <span className="ml-2">创建人：{tag.username}</span>}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => router.push(`/net-values?custom=${tag.id}`)}
                            className="px-3 py-1.5 text-xs bg-emerald-50 text-emerald-700 rounded border border-emerald-200 hover:bg-emerald-100"
                            title={`把'${tag.tag_name}'下的所有产品填进产品对比页`}
                        >
                            对比
                        </button>
                        <button
                            onClick={() => openProductModal(tag)}
                            className="px-3 py-1.5 text-xs bg-amber-50 text-amber-700 rounded border border-amber-200 hover:bg-amber-100"
                            title={`管理'${tag.tag_name}'下的产品`}
                        >
                            产品
                        </button>
                        <button
                            onClick={() => openModal('add', 'custom', undefined, tag)}
                            disabled={operateLoading}
                            className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded border"
                        >
                            新增子标签
                        </button>
                        <button
                            onClick={() => openModal('edit', 'custom', tag)}
                            disabled={operateLoading}
                            className="px-3 py-1.5 text-xs bg-blue-50 text-blue-600 rounded border"
                        >
                            编辑
                        </button>
                        <button
                            onClick={() => handleDelete('custom', tag.id)}
                            disabled={operateLoading}
                            className="px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded border"
                        >
                            删除
                        </button>
                    </div>
                </div>
                {tag.children && tag.children.length > 0 && renderTreeTags(tag.children, level + 1)}
            </div>
        ));
    };

    const handleFormSubmit = async () => {
        if (!formData.name.trim()) {
            setOperateError('标签名称不能为空');
            return;
        }
        setOperateLoading(true);
        setOperateError(null);
        try {
            switch (activeTagType) {
                case 'cycle':
                    if (modalType === 'add') {
                        const newTag = await tagApi.createCycle({ cycle_name: formData.name, cycle_desc: formData.desc });
                        setTags(prev => ({ ...prev, cycles: [...prev.cycles, newTag] }));
                    } else if (modalType === 'edit' && currentEditTag) {
                        const updatedTag = await tagApi.updateCycle(currentEditTag.id, { cycle_name: formData.name, cycle_desc: formData.desc });
                        setTags(prev => ({ ...prev, cycles: prev.cycles.map(t => t.id === updatedTag.id ? updatedTag : t) }));
                    }
                    break;
                case 'quant':
                    if (modalType === 'add') {
                        const newTag = await tagApi.createQuantType({ quant_name: formData.name, quant_desc: formData.desc });
                        setTags(prev => ({ ...prev, quants: [...prev.quants, newTag] }));
                    } else if (modalType === 'edit' && currentEditTag) {
                        const updatedTag = await tagApi.updateQuantType(currentEditTag.id, { quant_name: formData.name, quant_desc: formData.desc });
                        setTags(prev => ({ ...prev, quants: prev.quants.map(t => t.id === updatedTag.id ? updatedTag : t) }));
                    }
                    break;
                case 'algorithm':
                    if (modalType === 'add') {
                        const newTag = await tagApi.createAlgorithm({ alg_name: formData.name, alg_desc: formData.desc });
                        setTags(prev => ({ ...prev, algorithms: [...prev.algorithms, newTag] }));
                    } else if (modalType === 'edit' && currentEditTag) {
                        const updatedTag = await tagApi.updateAlgorithm(currentEditTag.id, { alg_name: formData.name, alg_desc: formData.desc });
                        setTags(prev => ({ ...prev, algorithms: prev.algorithms.map(t => t.id === updatedTag.id ? updatedTag : t) }));
                    }
                    break;
                case 'strategy':
                    if (modalType === 'add') {
                        const newTag = await tagApi.createStrategy({ strategy_name: formData.name, strategy_desc: formData.desc });
                        setTags(prev => ({ ...prev, strategies: [...prev.strategies, newTag] }));
                    } else if (modalType === 'edit' && currentEditTag) {
                        const updatedTag = await tagApi.updateStrategy(currentEditTag.id, { strategy_name: formData.name, strategy_desc: formData.desc });
                        setTags(prev => ({ ...prev, strategies: prev.strategies.map(t => t.id === updatedTag.id ? updatedTag : t) }));
                    }
                    break;
                case 'fof':
                    if (modalType === 'add') {
                        const newTag = await tagApi.createFofOwnTag({ fof_name: formData.name, fof_desc: formData.desc });
                        setTags(prev => ({ ...prev, fofOwnTags: [...prev.fofOwnTags, newTag] }));
                    } else if (modalType === 'edit' && currentEditTag) {
                        const updatedTag = await tagApi.updateFofOwnTag(currentEditTag.id, { fof_name: formData.name, fof_desc: formData.desc });
                        setTags(prev => ({ ...prev, fofOwnTags: prev.fofOwnTags.map(t => t.id === updatedTag.id ? updatedTag : t) }));
                    }
                    break;
                case 'custom':
                    const params = {
                        tag_name: formData.name,
                        tag_desc: formData.desc,
                        permission: formData.permission!,
                        parent: selectedParent?.id ?? null
                    };
                    if (modalType === 'add') {
                        const newTag = await tagApi.createCustomTag(params);
                        setTags(prev => ({ ...prev, customTags: [...prev.customTags, newTag] }));
                    } else if (modalType === 'edit' && currentEditTag) {
                        const updatedTag = await tagApi.updateCustomTag((currentEditTag as CustomTag).id, params);
                        setTags(prev => ({
                            ...prev,
                            customTags: prev.customTags.map(t => t.id === updatedTag.id ? updatedTag : t)
                        }));
                    }
                    break;
            }
            setModalOpen(false);
        } catch (err: unknown) {
            const errorKey =
                activeTagType === 'cycle' ? 'cycle_name' :
                    activeTagType === 'quant' ? 'quant_name' :
                        activeTagType === 'algorithm' ? 'alg_name' :
                            activeTagType === 'fof' ? 'fof_name' :
                                activeTagType === 'custom' ? 'tag_name' : 'strategy_name';

            let errMsg = '操作失败';
            if (typeof err === 'object' && err !== null && 'response' in err) {
                const response = (err as { response?: { data?: Record<string, unknown> } }).response;
                if (response?.data && typeof response.data === 'object') {
                    errMsg = String(response.data[errorKey] || getErrorMessage(err));
                }
            } else {
                errMsg = getErrorMessage(err);
            }
            setOperateError(errMsg);
        } finally {
            setOperateLoading(false);
        }
    };

    const handleDelete = async (tagType: TagType, id: number) => {
        if (!confirm('确定要删除该标签吗？删除后无法恢复！')) return;
        setOperateLoading(true);
        setOperateError(null);
        try {
            switch (tagType) {
                case 'cycle': await tagApi.deleteCycle(id); break;
                case 'quant': await tagApi.deleteQuantType(id); break;
                case 'algorithm': await tagApi.deleteAlgorithm(id); break;
                case 'strategy': await tagApi.deleteStrategy(id); break;
                case 'fof': await tagApi.deleteFofOwnTag(id); break;
                case 'custom': await tagApi.deleteCustomTag(id); break;
            }
            setTags(prev => {
                const newTags = { ...prev };
                switch (tagType) {
                    case 'cycle': newTags.cycles = prev.cycles.filter(t => t.id !== id); break;
                    case 'quant': newTags.quants = prev.quants.filter(t => t.id !== id); break;
                    case 'algorithm': newTags.algorithms = prev.algorithms.filter(t => t.id !== id); break;
                    case 'strategy': newTags.strategies = prev.strategies.filter(t => t.id !== id); break;
                    case 'fof': newTags.fofOwnTags = prev.fofOwnTags.filter(t => t.id !== id); break;
                    case 'custom': newTags.customTags = prev.customTags.filter(t => t.id !== id); break;
                }
                return newTags;
            });
        } catch (err: unknown) {
            let errMsg = '删除失败';
            if (typeof err === 'object' && err !== null && 'response' in err) {
                const response = (err as { response?: { status?: number; data?: { error?: string } } }).response;
                if (response?.status === 400) {
                    errMsg = response.data?.error ?? '该标签已关联产品，无法删除';
                } else {
                    errMsg = getErrorMessage(err);
                }
            } else {
                errMsg = getErrorMessage(err);
            }
            setOperateError(errMsg);
        } finally {
            setOperateLoading(false);
        }
    };

    // 打开产品管理 modal
    const openProductModal = useCallback(async (tag: CustomTag) => {
        setProductModalTag(tag);
        setProductSearch('');
        setProductModalOpen(true);
        setProductModalLoading(true);
        try {
            const [prodRes, tagProdRes] = await Promise.all([
                productApi.getProducts({ page_size: '2000', lite: '1' }),
                tagApi.getCustomTagProducts(tag.id),
            ]);
            setAllProducts(prodRes.results ?? []);
            setTagProducts(tagProdRes.results ?? []);
        } catch {
            setOperateError('加载产品数据失败');
        } finally {
            setProductModalLoading(false);
        }
    }, []);

    const isTagProduct = useCallback((productId: number) => {
        return tagProducts.some(tp => tp.product === productId);
    }, [tagProducts]);

    const toggleTagProduct = useCallback(async (productId: number) => {
        if (!productModalTag) return;
        const existing = tagProducts.find(tp => tp.product === productId);
        try {
            if (existing) {
                await tagApi.deleteCustomTagProduct(existing.id);
                setTagProducts(prev => prev.filter(tp => tp.id !== existing.id));
            } else {
                const newRel = await tagApi.createCustomTagProduct(productModalTag.id, productId);
                setTagProducts(prev => [...prev, newRel]);
            }
        } catch {
            setOperateError('操作失败');
        }
    }, [productModalTag, tagProducts]);

    if (authLoading) return <div className="container mx-auto py-10 text-center">权限验证中...</div>;
    if (hasWritePermission === false) return <div className="container mx-auto py-10 text-center">无权限访问</div>;
    if (loading || tagsLoading) {
        return (
            <div className="container mx-auto py-10 text-center flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
                <span className="text-slate-600">加载标签数据中...</span>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 sm:p-6 bg-slate-50 min-h-screen">
            <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-bold mb-8 text-slate-800 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                标签管理
            </h1>

            {error && (
                <div className="text-red-600 text-sm mb-6 p-3 bg-red-50 rounded-lg border border-red-200 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                </div>
            )}

            <div className="mb-8 p-5 border border-slate-200 rounded-xl bg-white shadow-md hover:shadow-lg transition-shadow duration-300">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap gap-2">
                        {[
                            { key: 'custom', label: '自定义标签', icon: '✨' },
                            { key: 'cycle', label: '周期标签', icon: '📅' },
                            { key: 'quant', label: '量化类型', icon: '📊' },
                            { key: 'algorithm', label: '算法类型', icon: '🔧' },
                            { key: 'strategy', label: '策略类型', icon: '🎯' },
                            { key: 'fof', label: 'FOF归属', icon: '🏷️' },
                        ].map(item => (
                            <button
                                key={item.key}
                                onClick={() => setActiveTagType(item.key as TagType)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                                    activeTagType === item.key
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                            >
                                <span>{item.icon}</span>
                                {item.label}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => openModal('add', activeTagType)}
                        disabled={operateLoading}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 active:bg-green-800 transition-all duration-200 flex items-center gap-2 shadow-md disabled:bg-slate-300"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        新增{
                        activeTagType === 'cycle' ? '周期标签' :
                            activeTagType === 'quant' ? '量化类型' :
                                activeTagType === 'algorithm' ? '算法类型' :
                                    activeTagType === 'fof' ? 'FOF归属' :
                                        activeTagType === 'custom' ? '自定义标签' : '策略类型'
                    }
                    </button>
                </div>
            </div>

            <div className="border border-slate-200 rounded-xl bg-white p-5 shadow-md hover:shadow-lg transition-shadow duration-300 mb-8">
                <h2 className="font-semibold mb-4 text-slate-800 flex items-center gap-2 text-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    {
                        activeTagType === 'cycle' ? '周期标签列表' :
                            activeTagType === 'quant' ? '量化类型列表' :
                                activeTagType === 'algorithm' ? '算法类型列表' :
                                    activeTagType === 'fof' ? 'FOF归属标签列表' :
                                        activeTagType === 'custom' ? '自定义标签列表' : '策略类型列表'
                    }
                </h2>

                <div className="space-y-1.5 overflow-y-auto max-h-[500px] pr-1 custom-scrollbar">
                    {activeTagType === 'cycle' && (
                        tags.cycles.length === 0 ? (
                            <EmptyTip text="暂无周期标签数据" />
                        ) : (
                            tags.cycles.map(tag => (
                                <TagItem
                                    key={tag.id}
                                    name={tag.cycle_name}
                                    desc={tag.cycle_desc}
                                    onEdit={() => openModal('edit', 'cycle', tag)}
                                    onDelete={() => handleDelete('cycle', tag.id)}
                                    disabled={operateLoading}
                                />
                            ))
                        )
                    )}
                    {activeTagType === 'quant' && (
                        tags.quants.length === 0 ? (
                            <EmptyTip text="暂无量化类型数据" />
                        ) : (
                            tags.quants.map(tag => (
                                <TagItem
                                    key={tag.id}
                                    name={tag.quant_name}
                                    desc={tag.quant_desc}
                                    onEdit={() => openModal('edit', 'quant', tag)}
                                    onDelete={() => handleDelete('quant', tag.id)}
                                    disabled={operateLoading}
                                />
                            ))
                            )
                        )}
                    {activeTagType === 'algorithm' && (
                        tags.algorithms.length === 0 ? (
                            <EmptyTip text="暂无算法类型数据" />
                        ) : (
                            tags.algorithms.map(tag => (
                                <TagItem
                                    key={tag.id}
                                    name={tag.alg_name}
                                    desc={tag.alg_desc}
                                    onEdit={() => openModal('edit', 'algorithm', tag)}
                                    onDelete={() => handleDelete('algorithm', tag.id)}
                                    disabled={operateLoading}
                                />
                            ))
                        )
                        )}
                    {activeTagType === 'strategy' && (
                        tags.strategies.length === 0 ? (
                            <EmptyTip text="暂无策略类型数据" />
                        ) : (
                            tags.strategies.map(tag => (
                                <TagItem
                                    key={tag.id}
                                    name={tag.strategy_name}
                                    desc={tag.strategy_desc}
                                    onEdit={() => openModal('edit', 'strategy', tag)}
                                    onDelete={() => handleDelete('strategy', tag.id)}
                                    disabled={operateLoading}
                                />
                            ))
                        )
                        )}
                    {activeTagType === 'fof' && (
                        tags.fofOwnTags.length === 0 ? (
                            <EmptyTip text="暂无FOF归属标签数据" />
                        ) : (
                            tags.fofOwnTags.map(tag => (
                                <TagItem
                                    key={tag.id}
                                    name={tag.fof_name}
                                    desc={tag.fof_desc}
                                    onEdit={() => openModal('edit', 'fof', tag)}
                                    onDelete={() => handleDelete('fof', tag.id)}
                                    disabled={operateLoading}
                                />
                            ))
                        )
                        )}
                    {activeTagType === 'custom' && (
                        tags.customTags.length === 0 ? (
                            <EmptyTip text="暂无自定义标签数据" />
                        ) : (
                            <div className="space-y-1">
                                {renderTreeTags(tags.customTags, 0)}
                            </div>
                        )
                        )}
                </div>
            </div>

            {operateError && (
                <div className="text-red-600 text-sm mb-6 p-3 bg-red-50 rounded-lg border border-red-200 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {operateError}
                </div>
            )}

            {modalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-2xl">
                        <h2 className="text-xl font-bold mb-5 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={modalType === 'add' ? "M12 6v6m0 0v6m0-6h6m-6 0H6" : "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"} />
                            </svg>
                            {modalType === 'add' ? '新增' : '编辑'}{
                            activeTagType === 'cycle' ? '周期标签' :
                                activeTagType === 'quant' ? '量化类型' :
                                    activeTagType === 'algorithm' ? '算法类型' :
                                        activeTagType === 'fof' ? 'FOF归属' :
                                            activeTagType === 'custom' ? '自定义标签' : '策略类型'
                        }
                        </h2>

                        {operateError && <div className="text-red-600 text-xs mb-4 p-2 bg-red-50 rounded-lg border border-red-200">{operateError}</div>}

                        <div className="space-y-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-slate-600 tracking-wide">
                                    标签名称<span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="请输入标签名称"
                                    className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-all duration-200"
                                    disabled={operateLoading}
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-slate-600 tracking-wide">标签描述</label>
                                <textarea
                                    value={formData.desc}
                                    onChange={(e) => setFormData({ ...formData, desc: e.target.value })}
                                    placeholder="请输入描述（可选）"
                                    rows={3}
                                    className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-all duration-200 resize-none"
                                    disabled={operateLoading}
                                />
                            </div>

                            {activeTagType === 'custom' && (
                                <>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-semibold text-slate-600 tracking-wide">可见权限</label>
                                        <div className="flex gap-3">
                                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="permission"
                                                    value="public"
                                                    checked={formData.permission === 'public'}
                                                    onChange={() => setFormData(prev => ({ ...prev, permission: 'public' }))}
                                                    disabled={operateLoading}
                                                    className="accent-blue-600"
                                                />
                                                公共（全员可见）
                                            </label>
                                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                                <input
                                                    type="radio"
                                                    value="private"
                                                    checked={formData.permission === 'private'}
                                                    onChange={() => setFormData(prev => ({ ...prev, permission: 'private' }))}
                                                    disabled={operateLoading}
                                                    className="accent-blue-600"
                                                />
                                                私密（仅自己可见）
                                            </label>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-semibold text-slate-600 tracking-wide">父标签（可选）</label>
                                        <select
                                            className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                            value={selectedParent?.id ?? ''}
                                            onChange={(e) => {
                                                const val = Number(e.target.value);
                                                const parent = val ? tags.customTags.find(t => t.id === val) ?? null : null;
                                                setSelectedParent(parent);
                                            }}
                                            disabled={operateLoading}
                                        >
                                            <option value="">根目录（无父标签）</option>
                                            {tags.customTags.map(t => (
                                                <option
                                                    key={t.id}
                                                    value={t.id}
                                                    disabled={currentEditTag?.id === t.id}
                                                >
                                                    {t.full_path}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="flex gap-3 justify-end mt-6">
                            <button
                                onClick={() => setModalOpen(false)}
                                disabled={operateLoading}
                                className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-100 transition-all duration-200 disabled:bg-slate-50 disabled:text-slate-400"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleFormSubmit}
                                disabled={operateLoading}
                                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 active:bg-blue-800 transition-all duration-200 shadow-md disabled:bg-slate-300 flex items-center gap-2"
                            >
                                {operateLoading ? (
                                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>处理中...</>
                                ) : (
                                    modalType === 'add' ? '确认新增' : '确认修改'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 3px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}</style>

            {/* 产品管理 modal */}
            {productModalOpen && productModalTag && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl w-full max-w-3xl p-6 shadow-2xl max-h-[85vh] flex flex-col">
                        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                            </svg>
                            管理产品 - {productModalTag.tag_name}
                        </h2>

                        <div className="flex-1 grid grid-cols-2 gap-4 min-h-0 mt-3">
                            {/* 已选产品 */}
                            <div className="flex flex-col border border-slate-200 rounded-lg overflow-hidden">
                                <div className="bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 border-b border-slate-200 flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    已选产品
                                    <span className="text-xs font-normal text-amber-600 ml-auto">{tagProducts.length} 个</span>
                                </div>
                                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                    {productModalLoading ? (
                                        <div className="flex items-center justify-center h-20 text-slate-400 text-xs">加载中...</div>
                                    ) : tagProducts.length === 0 ? (
                                        <div className="flex items-center justify-center h-20 text-slate-400 text-xs">暂无已选产品</div>
                                    ) : (
                                        tagProducts.map(tp => (
                                            <div key={tp.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-50 text-sm text-amber-900">
                                                <span>{tp.product_name}</span>
                                                <button
                                                    onClick={() => toggleTagProduct(tp.product)}
                                                    className="text-red-400 hover:text-red-600 text-lg leading-none ml-2"
                                                    title="移除"
                                                >×</button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* 可选产品 */}
                            <div className="flex flex-col border border-slate-200 rounded-lg overflow-hidden">
                                <div className="bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 border-b border-slate-200">
                                    可选产品
                                </div>
                                <div className="px-3 pt-2">
                                    <input
                                        type="text"
                                        value={productSearch}
                                        onChange={e => setProductSearch(e.target.value)}
                                        placeholder="搜索添加..."
                                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                    />
                                </div>
                                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                    {productModalLoading ? (
                                        <div className="flex items-center justify-center h-20 text-slate-400 text-xs">加载中...</div>
                                    ) : allProducts.length === 0 ? (
                                        <div className="flex items-center justify-center h-20 text-slate-400 text-xs">暂无产品</div>
                                    ) : (
                                        allProducts
                                            .filter(p => !productSearch || p.product_name.toLowerCase().includes(productSearch.toLowerCase()))
                                            .filter(p => !isTagProduct(p.id))
                                            .map(p => (
                                                <div key={p.id}
                                                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-blue-50 cursor-pointer text-sm text-slate-700 transition"
                                                    onClick={() => toggleTagProduct(p.id)}
                                                >
                                                    <span>{p.product_name}</span>
                                                    <span className="text-blue-500 text-xs font-medium">+ 添加</span>
                                                </div>
                                            ))
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end mt-4 pt-3 border-t border-slate-100">
                            <button
                                onClick={() => setProductModalOpen(false)}
                                className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-100 transition"
                            >
                                关闭
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// 子组件：空提示
function EmptyTip({ text }: { text: string }) {
    return (
        <div className="flex items-center justify-center h-48 text-slate-500 flex-col gap-2 p-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm">{text}</span>
        </div>
    );
}

// 子组件：标签行
function TagItem({
                     name, desc, onEdit, onDelete, disabled
                 }: {
    name: string;
    desc?: string | null;
    onEdit: () => void;
    onDelete: () => void;
    disabled: boolean;
}) {
    return (
        <div className="p-3.5 border rounded-lg flex justify-between items-center transition-all duration-200 hover:bg-slate-50 bg-white border-slate-100 hover:border-slate-200">
            <div className="flex-1">
                <div className="text-slate-800 font-medium">{name}</div>
                <div className="text-xs text-slate-500 mt-1">{desc ?? '无描述'}</div>
            </div>
            <div className="flex gap-2 ml-4">
                <button onClick={onEdit} disabled={disabled} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-all disabled:opacity-50">编辑</button>
                <button onClick={onDelete} disabled={disabled} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-all disabled:opacity-50">删除</button>
            </div>
        </div>
    );
}