'use client';
import { useState, useEffect } from 'react';
import {
    CycleTag, QuantType, AlgorithmType, StrategyType,
    ApiResponse
} from '@/lib/types';
import { tagApi } from '@/lib/api';
import useProductTags from '@/hooks/useProductTags';

// 标签类型枚举
type TagType = 'cycle' | 'quant' | 'algorithm' | 'strategy';
// 标签表单类型
interface TagFormData {
    name: string;
    desc: string;
}

// 🔥 新增：错误信息安全获取工具函数
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
    // 核心状态
    const [activeTagType, setActiveTagType] = useState<TagType>('cycle');
    const [tags, setTags] = useState<{
        cycles: CycleTag[];
        quants: QuantType[];
        algorithms: AlgorithmType[];
        strategies: StrategyType[];
    }>({ cycles: [], quants: [], algorithms: [], strategies: [] });

    // 操作状态
    const [loading, setLoading] = useState<boolean>(true);
    const [operateLoading, setOperateLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [operateError, setOperateError] = useState<string | null>(null);

    // 弹窗状态
    const [modalOpen, setModalOpen] = useState<boolean>(false);
    const [modalType, setModalType] = useState<'add' | 'edit'>('add');
    const [currentEditTag, setCurrentEditTag] = useState<
        CycleTag | QuantType | AlgorithmType | StrategyType | null
    >(null);

    // 表单状态
    const [formData, setFormData] = useState<TagFormData>({
        name: '',
        desc: ''
    });

    // 权限状态
    const [isAdmin, setIsAdmin] = useState<boolean>(false);
    // 复用标签hooks（和相关性看板一致）
    const { tags: initTags, tagsLoading, tagsError } = useProductTags();

    // 1. 权限校验（仅管理员可访问）
    useEffect(() => {
        const fundIsAdmin = localStorage.getItem('fundIsAdmin');
        setIsAdmin(fundIsAdmin === 'true');

        // 非管理员直接跳转首页
        if (fundIsAdmin !== 'true') {
            window.location.href = '/';
        }
    }, []);

    // 2. 加载标签数据
    useEffect(() => {
        if (!isAdmin) return;

        const loadAllTags = async () => {
            setLoading(true);
            setError(null);
            try {
                // 并行加载所有标签类型数据
                const [
                    cycleRes, quantRes, algRes, strategyRes
                ]: [
                    ApiResponse<CycleTag>,
                    ApiResponse<QuantType>,
                    ApiResponse<AlgorithmType>,
                    ApiResponse<StrategyType>
                ] = await Promise.all([
                    tagApi.getCycles(),
                    tagApi.getQuantTypes(),
                    tagApi.getAlgorithms(),
                    tagApi.getStrategies()
                ]);

                setTags({
                    cycles: cycleRes.results || [],
                    quants: quantRes.results || [],
                    algorithms: algRes.results || [],
                    strategies: strategyRes.results || []
                });
            } catch (err: unknown) {
                // 🔥 修复：替换 any 为 unknown，用工具函数获取错误信息
                setError(`标签数据加载失败：${getErrorMessage(err)}`);
            } finally {
                setLoading(false);
            }
        };

        loadAllTags();
    }, [isAdmin]);

    // 3. 打开新增/编辑弹窗（纯类型安全版）
    // 🔥 修复：替换 tag?: any 为具体的联合类型
    const openModal = (type: 'add' | 'edit', tagType: TagType, tag?: CycleTag | QuantType | AlgorithmType | StrategyType) => {
        setModalType(type);
        setActiveTagType(tagType);
        setOperateError(null);

        // 编辑时填充表单（按类型直接访问属性，无字符串索引）
        if (type === 'edit' && tag) {
            setCurrentEditTag(tag);
            let formName = '';
            let formDesc = '';

            switch (tagType) {
                case 'cycle':
                    // 🔥 修复：类型断言，确保 tag 是 CycleTag
                    formName = (tag as CycleTag).cycle_name;
                    formDesc = (tag as CycleTag).cycle_desc || '';
                    break;
                case 'quant':
                    formName = (tag as QuantType).quant_name;
                    formDesc = (tag as QuantType).quant_desc || '';
                    break;
                case 'algorithm':
                    formName = (tag as AlgorithmType).alg_name;
                    formDesc = (tag as AlgorithmType).alg_desc || '';
                    break;
                case 'strategy':
                    formName = (tag as StrategyType).strategy_name;
                    formDesc = (tag as StrategyType).strategy_desc || '';
                    break;
            }

            setFormData({ name: formName, desc: formDesc });
        } else {
            setCurrentEditTag(null);
            setFormData({ name: '', desc: '' });
        }

        setModalOpen(true);
    };

    // 4. 表单提交（新增/编辑）
    const handleFormSubmit = async () => {
        if (!formData.name.trim()) {
            setOperateError('标签名称不能为空');
            return;
        }

        setOperateLoading(true);
        setOperateError(null);
        try {
            // 根据标签类型执行对应操作
            switch (activeTagType) {
                case 'cycle':
                    if (modalType === 'add') {
                        const newTag = await tagApi.createCycle({
                            cycle_name: formData.name,
                            cycle_desc: formData.desc
                        });
                        setTags(prev => ({ ...prev, cycles: [...prev.cycles, newTag] }));
                    } else if (modalType === 'edit' && currentEditTag) {
                        const updatedTag = await tagApi.updateCycle(currentEditTag.id, {
                            cycle_name: formData.name,
                            cycle_desc: formData.desc
                        });
                        setTags(prev => ({
                            ...prev,
                            cycles: prev.cycles.map(t => t.id === updatedTag.id ? updatedTag : t)
                        }));
                    }
                    break;

                case 'quant':
                    if (modalType === 'add') {
                        const newTag = await tagApi.createQuantType({
                            quant_name: formData.name,
                            quant_desc: formData.desc
                        });
                        setTags(prev => ({ ...prev, quants: [...prev.quants, newTag] }));
                    } else if (modalType === 'edit' && currentEditTag) {
                        const updatedTag = await tagApi.updateQuantType(currentEditTag.id, {
                            quant_name: formData.name,
                            quant_desc: formData.desc
                        });
                        setTags(prev => ({
                            ...prev,
                            quants: prev.quants.map(t => t.id === updatedTag.id ? updatedTag : t)
                        }));
                    }
                    break;

                case 'algorithm':
                    if (modalType === 'add') {
                        const newTag = await tagApi.createAlgorithm({
                            alg_name: formData.name,
                            alg_desc: formData.desc
                        });
                        setTags(prev => ({ ...prev, algorithms: [...prev.algorithms, newTag] }));
                    } else if (modalType === 'edit' && currentEditTag) {
                        const updatedTag = await tagApi.updateAlgorithm(currentEditTag.id, {
                            alg_name: formData.name,
                            alg_desc: formData.desc
                        });
                        setTags(prev => ({
                            ...prev,
                            algorithms: prev.algorithms.map(t => t.id === updatedTag.id ? updatedTag : t)
                        }));
                    }
                    break;

                case 'strategy':
                    if (modalType === 'add') {
                        const newTag = await tagApi.createStrategy({
                            strategy_name: formData.name,
                            strategy_desc: formData.desc
                        });
                        setTags(prev => ({ ...prev, strategies: [...prev.strategies, newTag] }));
                    } else if (modalType === 'edit' && currentEditTag) {
                        const updatedTag = await tagApi.updateStrategy(currentEditTag.id, {
                            strategy_name: formData.name,
                            strategy_desc: formData.desc
                        });
                        setTags(prev => ({
                            ...prev,
                            strategies: prev.strategies.map(t => t.id === updatedTag.id ? updatedTag : t)
                        }));
                    }
                    break;
            }

            setModalOpen(false); // 关闭弹窗
        } catch (err: unknown) {
            // 🔥 修复：替换 any 为 unknown，安全处理错误
            const errorKey =
                activeTagType === 'cycle' ? 'cycle_name' :
                    activeTagType === 'quant' ? 'quant_name' :
                        activeTagType === 'algorithm' ? 'alg_name' : 'strategy_name';

            // 安全获取错误信息
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

    // 5. 删除标签（处理关联保护）
    const handleDelete = async (tagType: TagType, id: number) => {
        if (!confirm('确定要删除该标签吗？删除后无法恢复！')) return;

        setOperateLoading(true);
        setOperateError(null);
        try {
            // 执行删除操作
            switch (tagType) {
                case 'cycle': await tagApi.deleteCycle(id); break;
                case 'quant': await tagApi.deleteQuantType(id); break;
                case 'algorithm': await tagApi.deleteAlgorithm(id); break;
                case 'strategy': await tagApi.deleteStrategy(id); break;
            }

            // 更新本地列表
            setTags(prev => {
                const newTags = { ...prev };
                switch (tagType) {
                    case 'cycle':
                        newTags.cycles = prev.cycles.filter(t => t.id !== id);
                        break;
                    case 'quant':
                        newTags.quants = prev.quants.filter(t => t.id !== id);
                        break;
                    case 'algorithm':
                        newTags.algorithms = prev.algorithms.filter(t => t.id !== id);
                        break;
                    case 'strategy':
                        newTags.strategies = prev.strategies.filter(t => t.id !== id);
                        break;
                }
                return newTags;
            });
        } catch (err: unknown) {
            // 🔥 修复：替换 any 为 unknown，安全处理错误
            let errMsg = '删除失败';
            if (typeof err === 'object' && err !== null && 'response' in err) {
                const response = (err as { response?: { status?: number; data?: { error?: string } } }).response;
                if (response?.status === 400) {
                    errMsg = response.data?.error || '该标签已关联产品，无法删除';
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

    // 非管理员/加载中状态
    if (!isAdmin) return <div className="container mx-auto py-10 text-center">权限验证中...</div>;
    if (loading && tagsLoading) {
        return (
            <div className="container mx-auto py-10 text-center flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
                <span className="text-slate-600">加载标签数据中...</span>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 sm:p-6 bg-slate-50 min-h-screen">
            {/* 页面标题（和相关性看板风格一致） */}
            <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-bold mb-8 text-slate-800 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                标签页管理
            </h1>

            {/* 错误提示（全局加载错误） */}
            {error && (
                <div className="text-red-600 text-sm mb-6 p-3 bg-red-50 rounded-lg border border-red-200 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                </div>
            )}

            {/* 标签类型切换 + 新增按钮区域 */}
            <div className="mb-8 p-5 border border-slate-200 rounded-xl bg-white shadow-md hover:shadow-lg transition-shadow duration-300">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    {/* 标签类型切换 */}
                    <div className="flex flex-wrap gap-2">
                        {[
                            { key: 'cycle', label: '周期标签', icon: '📅' },
                            { key: 'quant', label: '量化类型', icon: '📊' },
                            { key: 'algorithm', label: '算法类型', icon: '🔧' },
                            { key: 'strategy', label: '策略类型', icon: '🎯' }
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

                    {/* 新增按钮 */}
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
                                activeTagType === 'algorithm' ? '算法类型' : '策略类型'
                    }
                    </button>
                </div>
            </div>

            {/* 标签列表区域（纯类型安全版，按类型分支渲染） */}
            <div className="border border-slate-200 rounded-xl bg-white p-5 shadow-md hover:shadow-lg transition-shadow duration-300 mb-8">
                <h2 className="font-semibold mb-4 text-slate-800 flex items-center gap-2 text-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    {
                        activeTagType === 'cycle' ? '周期标签列表' :
                            activeTagType === 'quant' ? '量化类型列表' :
                                activeTagType === 'algorithm' ? '算法类型列表' : '策略类型列表'
                    }
                </h2>

                {loading ? (
                    <div className="flex items-center justify-center h-48 text-slate-500 flex-col gap-2">
                        <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
                        <span>加载中...</span>
                    </div>
                ) : (
                    <div className="space-y-1.5 overflow-y-auto max-h-[500px] pr-1 custom-scrollbar">
                        {(() => {
                            // 按标签类型分支渲染，彻底避免字符串索引
                            switch (activeTagType) {
                                case 'cycle':
                                    return tags.cycles.length === 0 ? (
                                        <div className="flex items-center justify-center h-48 text-slate-500 flex-col gap-2 p-4">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span className="text-sm">暂无周期标签数据</span>
                                        </div>
                                    ) : (
                                        tags.cycles.map((tag) => (
                                            <div
                                                key={tag.id}
                                                className="p-3.5 border rounded-lg flex justify-between items-center transition-all duration-200 hover:bg-slate-50 bg-white border-slate-100 hover:border-slate-200"
                                            >
                                                <div className="flex-1">
                                                    <div className="text-slate-800 font-medium">{tag.cycle_name}</div>
                                                    <div className="text-xs text-slate-500 mt-1">
                                                        {tag.cycle_desc || '无描述'}
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 ml-4">
                                                    <button
                                                        onClick={() => openModal('edit', 'cycle', tag)}
                                                        disabled={operateLoading}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-all duration-200 disabled:bg-slate-100 disabled:text-slate-400"
                                                    >
                                                        编辑
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete('cycle', tag.id)}
                                                        disabled={operateLoading}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-all duration-200 disabled:bg-slate-100 disabled:text-slate-400"
                                                    >
                                                        删除
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    );

                                case 'quant':
                                    return tags.quants.length === 0 ? (
                                        <div className="flex items-center justify-center h-48 text-slate-500 flex-col gap-2 p-4">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span className="text-sm">暂无量化类型数据</span>
                                        </div>
                                    ) : (
                                        tags.quants.map((tag) => (
                                            <div
                                                key={tag.id}
                                                className="p-3.5 border rounded-lg flex justify-between items-center transition-all duration-200 hover:bg-slate-50 bg-white border-slate-100 hover:border-slate-200"
                                            >
                                                <div className="flex-1">
                                                    <div className="text-slate-800 font-medium">{tag.quant_name}</div>
                                                    <div className="text-xs text-slate-500 mt-1">
                                                        {tag.quant_desc || '无描述'}
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 ml-4">
                                                    <button
                                                        onClick={() => openModal('edit', 'quant', tag)}
                                                        disabled={operateLoading}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-all duration-200 disabled:bg-slate-100 disabled:text-slate-400"
                                                    >
                                                        编辑
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete('quant', tag.id)}
                                                        disabled={operateLoading}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-all duration-200 disabled:bg-slate-100 disabled:text-slate-400"
                                                    >
                                                        删除
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    );

                                case 'algorithm':
                                    return tags.algorithms.length === 0 ? (
                                        <div className="flex items-center justify-center h-48 text-slate-500 flex-col gap-2 p-4">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span className="text-sm">暂无算法类型数据</span>
                                        </div>
                                    ) : (
                                        tags.algorithms.map((tag) => (
                                            <div
                                                key={tag.id}
                                                className="p-3.5 border rounded-lg flex justify-between items-center transition-all duration-200 hover:bg-slate-50 bg-white border-slate-100 hover:border-slate-200"
                                            >
                                                <div className="flex-1">
                                                    <div className="text-slate-800 font-medium">{tag.alg_name}</div>
                                                    <div className="text-xs text-slate-500 mt-1">
                                                        {tag.alg_desc || '无描述'}
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 ml-4">
                                                    <button
                                                        onClick={() => openModal('edit', 'algorithm', tag)}
                                                        disabled={operateLoading}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-all duration-200 disabled:bg-slate-100 disabled:text-slate-400"
                                                    >
                                                        编辑
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete('algorithm', tag.id)}
                                                        disabled={operateLoading}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-all duration-200 disabled:bg-slate-100 disabled:text-slate-400"
                                                    >
                                                        删除
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    );

                                case 'strategy':
                                    return tags.strategies.length === 0 ? (
                                        <div className="flex items-center justify-center h-48 text-slate-500 flex-col gap-2 p-4">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span className="text-sm">暂无策略类型数据</span>
                                        </div>
                                    ) : (
                                        tags.strategies.map((tag) => (
                                            <div
                                                key={tag.id}
                                                className="p-3.5 border rounded-lg flex justify-between items-center transition-all duration-200 hover:bg-slate-50 bg-white border-slate-100 hover:border-slate-200"
                                            >
                                                <div className="flex-1">
                                                    <div className="text-slate-800 font-medium">{tag.strategy_name}</div>
                                                    <div className="text-xs text-slate-500 mt-1">
                                                        {tag.strategy_desc || '无描述'}
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 ml-4">
                                                    <button
                                                        onClick={() => openModal('edit', 'strategy', tag)}
                                                        disabled={operateLoading}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-all duration-200 disabled:bg-slate-100 disabled:text-slate-400"
                                                    >
                                                        编辑
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete('strategy', tag.id)}
                                                        disabled={operateLoading}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-all duration-200 disabled:bg-slate-100 disabled:text-slate-400"
                                                    >
                                                        删除
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    );
                            }
                        })()}
                    </div>
                )}
            </div>

            {/* 操作错误提示（删除/编辑/新增失败） */}
            {operateError && (
                <div className="text-red-600 text-sm mb-6 p-3 bg-red-50 rounded-lg border border-red-200 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {operateError}
                </div>
            )}

            {/* 新增/编辑弹窗（和参考页面交互风格一致） */}
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
                                    activeTagType === 'algorithm' ? '算法类型' : '策略类型'
                        }
                        </h2>

                        {/* 表单错误提示 */}
                        {operateError && (
                            <div className="text-red-600 text-xs mb-4 p-2 bg-red-50 rounded-lg border border-red-200">
                                {operateError}
                            </div>
                        )}

                        {/* 表单内容 */}
                        <div className="space-y-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-slate-600 tracking-wide">
                                    标签名称<span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder={`请输入${
                                        activeTagType === 'cycle' ? '周期' :
                                            activeTagType === 'quant' ? '量化' :
                                                activeTagType === 'algorithm' ? '算法' : '策略'
                                    }标签名称`}
                                    className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-all duration-200"
                                    disabled={operateLoading}
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-slate-600 tracking-wide">标签描述</label>
                                <textarea
                                    value={formData.desc}
                                    onChange={(e) => setFormData({ ...formData, desc: e.target.value })}
                                    placeholder={`请输入${
                                        activeTagType === 'cycle' ? '周期' :
                                            activeTagType === 'quant' ? '量化' :
                                                activeTagType === 'algorithm' ? '算法' : '策略'
                                    }标签描述（可选）`}
                                    rows={3}
                                    className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-all duration-200 resize-none"
                                    disabled={operateLoading}
                                />
                            </div>
                        </div>

                        {/* 弹窗按钮 */}
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
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        处理中...
                                    </>
                                ) : (
                                    modalType === 'add' ? '确认新增' : '确认修改'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 自定义滚动条样式（和相关性看板一致） */}
            <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
        </div>
    );
}