'use client';
import { useState, useEffect } from 'react';
import { Product, ProductCorrelation, ProductFilterParams, ApiResponse } from '@/lib/types';
import { productApi, correlationApi } from '@/lib/api';
import useProductTags from '@/hooks/useProductTags';

// 封装安全的数字格式化函数
const formatCorrelationValue = (value: number | null): string => {
    if (value === null || isNaN(value) || typeof value !== 'number') {
        return "无数据";
    }
    return value.toFixed(4);
};

export default function CorrelationBoard() {
    // 本地存储常量（持久化已选产品）
    const STORAGE_KEY = 'correlation_selected_product_ids';

    // 核心状态
    const [allProducts, setAllProducts] = useState<Product[]>([]);
    const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
    // 从本地存储初始化已选产品
    const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
    const [correlationData, setCorrelationData] = useState<ProductCorrelation[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [queryLoading, setQueryLoading] = useState<boolean>(false);
    const [productError, setProductError] = useState<string | null>(null);
    const [correlationError, setCorrelationError] = useState<string | null>(null);

    // 筛选状态（和净值管理一致）
    const [filters, setFilters] = useState<ProductFilterParams>({
        search: '',
        cycle: '',
        quant_type: '',
        algorithm: '',
        strategy: '',
    });

    // 标签数据（复用净值管理的hooks）
    const { tags, tagsLoading, tagsError } = useProductTags();

    // ==============================================
    // 🔥 1. 页面首次加载：加载全量产品 + 恢复本地已选产品（只执行1次）
    // ==============================================
    useEffect(() => {
        const initPage = async () => {
            try {
                setLoading(true);
                // 1. 加载所有产品
                const res: ApiResponse<Product> = await productApi.getProducts({ is_valid: 'true' });
                const products = res.results || [];
                setAllProducts(products);
                setFilteredProducts(products);

                // 2. 从本地存储恢复已选产品ID
                const savedIds = localStorage.getItem(STORAGE_KEY);
                if (savedIds) {
                    try {
                        const parsedIds = JSON.parse(savedIds) as number[];
                        // 校验：只保留存在的产品ID
                        const validIds = parsedIds.filter(id => products.some(p => p.id === id));
                        setSelectedProductIds(validIds);
                    } catch (e) {
                        setSelectedProductIds([]);
                    }
                }

                setProductError(null);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : '未知错误';
                setProductError(`产品加载失败：${message}`);
                setAllProducts([]);
                setFilteredProducts([]);
            } finally {
                setLoading(false);
            }
        };

        initPage();
    }, []);

    // ==============================================
    // 🔥 2. 筛选/搜索：仅更新产品列表，绝不修改已选产品（核心修复）
    // ==============================================
    useEffect(() => {
        const filterProducts = async () => {
            // 首次加载已执行，这里只处理筛选
            if (allProducts.length === 0) return;

            try {
                setLoading(true);
                const params: Record<string, string> = { is_valid: 'true' };
                if (filters.cycle) params.cycle = filters.cycle;
                if (filters.quant_type) params.quant_type = filters.quant_type;
                if (filters.algorithm) params.algorithm = filters.algorithm;
                if (filters.strategy) params.strategy = filters.strategy;
                if (filters.search) params.search = filters.search;

                const res: ApiResponse<Product> = await productApi.getProducts(params);
                const products = res.results || [];
                // 🔥 只更新筛选后的列表，已选产品ID完全不动！
                setFilteredProducts(products);
                setProductError(null);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : '未知错误';
                setProductError(`筛选失败：${message}`);
            } finally {
                setLoading(false);
            }
        };

        const timer = setTimeout(filterProducts, 300);
        return () => clearTimeout(timer);
    }, [filters, allProducts]);

    // ==============================================
    // 🔥 3. 持久化保存：手动修改已选产品后，自动存本地
    // ==============================================
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedProductIds));
    }, [selectedProductIds]);

    // 2. 筛选条件变更处理
    const handleFilterChange = (name: keyof ProductFilterParams, value: string) => {
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    // 3. 重置筛选条件
    const handleResetFilter = () => {
        setFilters({ search: '', cycle: '', quant_type: '', algorithm: '', strategy: '' });
    };

    // 4. 产品选择/取消逻辑
    const handleToggleProduct = (productId: number) => {
        setSelectedProductIds(prev =>
            prev.includes(productId)
                ? prev.filter(id => id !== productId)
                : [...prev, productId]
        );
    };

    // 5. 移除单个已选产品
    const handleRemoveProduct = (productId: number) => {
        setSelectedProductIds(prev => prev.filter(id => id !== productId));
    };

    // ========== 批量操作函数 ==========
    // 清空所有已选产品
    const handleClearSelected = () => {
        setSelectedProductIds([]);
    };

    // 全选当前筛选后的产品
    const handleSelectAll = () => {
        if (filteredProducts.length === 0) return;
        const allIds = filteredProducts.map(p => p.id);
        setSelectedProductIds(allIds);
    };

    // 反选当前筛选后的产品
    const handleInvertSelect = () => {
        if (filteredProducts.length === 0) return;
        const allIds = filteredProducts.map(p => p.id);
        const newSelectedIds = allIds.filter(id => !selectedProductIds.includes(id));
        setSelectedProductIds(newSelectedIds);
    };

    // 6. 查询相关性数据
    const handleQueryCorrelation = async () => {
        if (selectedProductIds.length < 2) {
            setCorrelationError("请至少选择2个产品");
            return;
        }

        setQueryLoading(true);
        setCorrelationError(null);
        try {
            const res = await correlationApi.getCorrelationsByProducts(selectedProductIds);
            console.log("后端返回的原始数据：", res);
            console.log("相关性数据列表：", res.results);
            res.results.forEach(item => {
                console.log(`product1: ${item.product1}, product2: ${item.product2}, 系数: ${item.correlation_coefficient}`);
            });
            setCorrelationData(res.results);
            if (res.results.length === 0) {
                setCorrelationError("未查询到相关性数据");
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : '未知错误';
            setCorrelationError(`查询相关性失败：${message}`);
            setCorrelationData([]);
        } finally {
            setQueryLoading(false);
        }
    };

    // 7. 辅助函数：获取产品名称
    const getProductName = (productId: number): string => {
        const product = allProducts.find(p => p.id === productId);
        return product ? `${product.product_name} (ID: ${product.id})` : `产品${productId} (ID: ${productId})`;
    };

    // 8. 辅助函数：获取相关系数
    const getCorrelationValue = (productAId: number, productBId: number): number | null => {
        let item = correlationData.find(c => c.product1 === productAId && c.product2 === productBId);
        if (!item) {
            item = correlationData.find(c => c.product1 === productBId && c.product2 === productAId);
        }
        if (!item || item.correlation_coefficient === null || isNaN(item.correlation_coefficient)) {
            return null;
        }
        return item.correlation_coefficient;
    };

    return (
        <div className="container mx-auto p-4 sm:p-6 bg-slate-50 min-h-screen">
            {/* 页面标题 */}
            <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-bold mb-8 text-slate-800 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10" />
                </svg>
                产品相关性看板
            </h1>

            {/* 1. 筛选区域 */}
            <div className="mb-8 p-5 border border-slate-200 rounded-xl bg-white shadow-md hover:shadow-lg transition-shadow duration-300">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-5">
                    {/* 产品名称搜索 */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-600 tracking-wide">产品名称</label>
                        <input
                            type="text"
                            value={filters.search}
                            onChange={(e) => handleFilterChange('search', e.target.value)}
                            placeholder="输入产品名称关键词"
                            className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-all duration-200"
                        />
                    </div>

                    {/* 周期标签 */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-600 tracking-wide">周期标签</label>
                        {tagsLoading ? (
                            <div className="flex items-center justify-center px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-500 bg-slate-50 animate-pulse">加载中...</div>
                        ) : tagsError ? (
                            <div className="text-xs text-red-600 p-2 bg-red-50 rounded-lg">{tagsError}</div>
                        ) : (
                            <select
                                value={filters.cycle}
                                onChange={(e) => handleFilterChange('cycle', e.target.value)}
                                className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-all duration-200 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%236b7280%22%20strokeLinecap%3D%22round%22%20strokeLinejoin%3D%22round%22%20strokeWidth%3D%221.5%22%20d%3D%22M6%208l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[right_0.75rem_center] bg-no-repeat pr-8"
                            >
                                <option value="">全部</option>
                                {tags.cycles.map((cycle) => (
                                    <option key={cycle.id} value={cycle.id.toString()} className="py-2">{cycle.cycle_name}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* 量化类型 */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-600 tracking-wide">量化类型</label>
                        {tagsLoading ? (
                            <div className="flex items-center justify-center px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-500 bg-slate-50 animate-pulse">加载中...</div>
                        ) : tagsError ? (
                            <div className="text-xs text-red-600 p-2 bg-red-50 rounded-lg">{tagsError}</div>
                        ) : (
                            <select
                                value={filters.quant_type}
                                onChange={(e) => handleFilterChange('quant_type', e.target.value)}
                                className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-all duration-200 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%236b7280%22%20strokeLinecap%3D%22round%22%20strokeLinejoin%3D%22round%22%20strokeWidth%3D%221.5%22%20d%3D%22M6%208l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[right_0.75rem_center] bg-no-repeat pr-8"
                            >
                                <option value="">全部</option>
                                {tags.quantTypes.map((type) => (
                                    <option key={type.id} value={type.id.toString()} className="py-2">{type.quant_name}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* 算法类型 */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-600 tracking-wide">算法类型</label>
                        {tagsLoading ? (
                            <div className="flex items-center justify-center px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-500 bg-slate-50 animate-pulse">加载中...</div>
                        ) : tagsError ? (
                            <div className="text-xs text-red-600 p-2 bg-red-50 rounded-lg">{tagsError}</div>
                        ) : (
                            <select
                                value={filters.algorithm}
                                onChange={(e) => handleFilterChange('algorithm', e.target.value)}
                                className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-all duration-200 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%236b7280%22%20strokeLinecap%3D%22round%22%20strokeLinejoin%3D%22round%22%20strokeWidth%3D%221.5%22%20d%3D%22M6%208l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[right_0.75rem_center] bg-no-repeat pr-8"
                            >
                                <option value="">全部</option>
                                {tags.algorithms.map((alg) => (
                                    <option key={alg.id} value={alg.id.toString()} className="py-2">{alg.alg_name}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* 策略类型 + 重置按钮 */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-600 tracking-wide">策略类型</label>
                        <div className="flex gap-2.5">
                            {tagsLoading ? (
                                <div className="flex-1 flex items-center justify-center px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-500 bg-slate-50 animate-pulse">加载中...</div>
                            ) : tagsError ? (
                                <div className="flex-1 text-xs text-red-600 p-2 bg-red-50 rounded-lg">{tagsError}</div>
                            ) : (
                                <select
                                    value={filters.strategy}
                                    onChange={(e) => handleFilterChange('strategy', e.target.value)}
                                    className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-all duration-200 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%236b7280%22%20strokeLinecap%3D%22round%22%20strokeLinejoin%3D%22round%22%20strokeWidth%3D%221.5%22%20d%3D%22M6%208l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[right_0.75rem_center] bg-no-repeat pr-8"
                                >
                                    <option value="">全部</option>
                                    {tags.strategies.map((strategy) => (
                                        <option key={strategy.id} value={strategy.id.toString()} className="py-2">{strategy.strategy_name}</option>
                                    ))}
                                </select>
                            )}
                            <button
                                onClick={handleResetFilter}
                                className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200 active:bg-slate-300 transition-all duration-200 flex items-center justify-center gap-1 shadow-sm"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                重置
                            </button>
                        </div>
                    </div>
                </div>

                {/* 错误提示 */}
                {productError && (
                    <div className="text-red-600 text-sm mt-3 p-3 bg-red-50 rounded-lg border border-red-200 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        {productError}
                    </div>
                )}
            </div>

            {/* 2. 产品选择 + 已选产品区域 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {/* 产品列表 */}
                <div className="col-span-2 border border-slate-200 rounded-xl bg-white p-5 shadow-md hover:shadow-lg transition-shadow duration-300">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="font-semibold text-slate-800 flex items-center gap-2 text-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                            产品列表
                        </h2>
                        {/* 批量选择按钮 */}
                        {!loading && filteredProducts.length > 0 && (
                            <div className="flex gap-2">
                                <button
                                    onClick={handleSelectAll}
                                    className="px-3 py-1.5 bg-green-50 text-green-600 rounded-lg text-xs font-medium hover:bg-green-100 border border-green-200 transition-all duration-200"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    全选
                                </button>
                                <button
                                    onClick={handleInvertSelect}
                                    className="px-3 py-1.5 bg-purple-50 text-purple-600 rounded-lg text-xs font-medium hover:bg-purple-100 border border-purple-200 transition-all duration-200"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    反选
                                </button>
                            </div>
                        )}
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center h-48 text-slate-500 flex-col gap-2">
                            <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
                            <span>加载中...</span>
                        </div>
                    ) : productError ? (
                        <div className="flex items-center justify-center h-48 text-red-600 flex-col gap-2 p-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{productError}</span>
                        </div>
                    ) : filteredProducts.length === 0 ? (
                        <div className="flex items-center justify-center h-48 text-slate-500 flex-col gap-2 p-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-sm">暂无符合条件的产品</span>
                        </div>
                    ) : (
                        <div className="space-y-1.5 overflow-y-auto max-h-[400px] pr-1 custom-scrollbar">
                            {filteredProducts.map(product => {
                                const isSelected = selectedProductIds.includes(product.id);
                                return (
                                    <div
                                        key={product.id}
                                        className={`p-3.5 border rounded-lg flex justify-between items-center transition-all duration-200 hover:bg-slate-50 ${
                                            isSelected
                                                ? 'bg-blue-50 border-blue-200 shadow-sm'
                                                : 'bg-white border-slate-100 hover:border-slate-200'
                                        }`}
                                    >
                                        <span className="text-slate-800 font-medium">{product.product_name}</span>
                                        <button
                                            onClick={() => handleToggleProduct(product.id)}
                                            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                                                isSelected
                                                    ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                                                    : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'
                                            }`}
                                        >
                                            {isSelected ? '取消选择' : '选择产品'}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 已选产品 */}
                <div className="col-span-1 border border-slate-200 rounded-xl bg-white p-5 shadow-md hover:shadow-lg transition-shadow duration-300">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="font-semibold text-slate-800 flex items-center gap-2 text-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            已选产品（{selectedProductIds.length}个）
                        </h2>
                        {/* 清空已选按钮 */}
                        {selectedProductIds.length > 0 && (
                            <button
                                onClick={handleClearSelected}
                                className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 border border-red-200 transition-all duration-200 flex items-center gap-1"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                清空已选
                            </button>
                        )}
                    </div>

                    <div className="min-h-[120px] border-2 border-dashed border-slate-200 rounded-lg p-4 bg-slate-50 flex flex-wrap gap-2.5 content-start">
                        {selectedProductIds.length > 0 ? (
                            selectedProductIds.map(productId => (
                                <div key={productId} className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-blue-50 text-blue-700 text-sm border border-blue-200 shadow-sm hover:shadow transition-shadow">
                                    <span className="font-medium">{getProductName(productId).split(' (')[0]}</span>
                                    <button
                                        onClick={() => handleRemoveProduct(productId)}
                                        className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs hover:bg-slate-300 active:bg-slate-400 transition-colors"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm flex-col gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                <span>未选择产品</span>
                            </div>
                        )}
                    </div>

                    {/* 查询按钮 */}
                    <button
                        onClick={handleQueryCorrelation}
                        disabled={queryLoading || selectedProductIds.length < 2}
                        className="w-full mt-6 px-5 py-3 bg-blue-600 text-white rounded-lg disabled:bg-slate-300 hover:bg-blue-700 active:bg-blue-800 transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-2 font-medium"
                    >
                        {queryLoading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                查询中...
                            </>
                        ) : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                </svg>
                                查询相关性
                            </>
                        )}
                    </button>

                    {/* 相关性查询错误提示 */}
                    {correlationError && (
                        <div className="text-red-600 text-sm mt-3 p-2 bg-red-50 rounded-lg border border-red-200 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {correlationError}
                        </div>
                    )}
                </div>
            </div>

            {/* 3. 相关性矩阵 */}
            {selectedProductIds.length >= 2 && (
                <div className="border border-slate-200 rounded-xl bg-white p-5 shadow-md hover:shadow-lg transition-shadow duration-300 overflow-x-auto">
                    <h2 className="font-semibold mb-5 text-slate-800 flex items-center gap-2 text-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10" />
                        </svg>
                        产品相关性矩阵
                    </h2>

                    {queryLoading ? (
                        <div className="flex items-center justify-center h-64 text-slate-500 flex-col gap-2">
                            <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
                            <span>正在计算相关性...</span>
                        </div>
                    ) : correlationData.length > 0 ? (
                        <table className="min-w-full border-collapse">
                            <thead>
                            <tr className="bg-white">
                                <th className="border border-gray-300 p-2 text-left">产品</th>
                                {selectedProductIds.map(productId => (
                                    <th key={productId} className="border border-gray-300 p-2">
                                        {getProductName(productId)}
                                    </th>
                                ))}
                            </tr>
                            </thead>
                            <tbody>
                            {selectedProductIds.map((rowProductId, rowIndex) => (
                                <tr key={rowProductId} className="bg-white">
                                    <td className="border border-gray-300 p-2 font-medium">
                                        {getProductName(rowProductId)}
                                    </td>
                                    {selectedProductIds.map((colProductId, colIndex) => {
                                        if (rowIndex > colIndex) {
                                            return <td key={colProductId} className="border border-gray-300 p-2 bg-white"></td>;
                                        }
                                        const value = getCorrelationValue(rowProductId, colProductId);
                                        const bgColor = value === null
                                            ? 'bg-gray-100'
                                            : value >= 0.8
                                                ? 'bg-red-100'
                                                : value >= 0.5
                                                    ? 'bg-orange-100'
                                                    : value >= 0
                                                        ? 'bg-yellow-50'
                                                        : value >= -0.5
                                                            ? 'bg-blue-50'
                                                            : 'bg-blue-100';

                                        return (
                                            <td
                                                key={colProductId}
                                                className={`border border-gray-300 p-2 text-center ${bgColor}`}
                                            >
                                                {formatCorrelationValue(value)}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    ) : !queryLoading && correlationError ? (
                        <div className="flex items-center justify-center h-64 text-red-600 flex-col gap-2 p-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-lg">{correlationError}</span>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-64 text-slate-500 flex-col gap-2 p-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <span className="text-lg">请点击&ldquo;查询相关性&ldquo;按钮生成矩阵</span>
                        </div>
                    )}
                </div>
            )}

            {/* 自定义滚动条样式 */}
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