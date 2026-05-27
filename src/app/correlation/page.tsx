'use client';
import { useState, useEffect, useRef } from 'react';
import { Product, ProductCorrelation, ProductFilterParams, ApiResponse, BenchmarkIndex, BenchmarkNetValuePoint, ProductNetValue } from '@/lib/types';
import { productApi, correlationApi, benchmarkApi } from '@/lib/api';
import useProductTags from '@/hooks/useProductTags';
import { calculateCorrelation } from '@/lib/metrics';
import { useBasket } from '@/contexts/BasketContext';

type EntityKey = string; // 'p:<id>' / 'i:<id>'
const pKey = (id: number): EntityKey => `p:${id}`;
const iKey = (id: number): EntityKey => `i:${id}`;
const parseKey = (k: EntityKey): { kind: 'p' | 'i'; id: number } => {
    const [kind, idStr] = k.split(':');
    return { kind: kind as 'p' | 'i', id: Number(idStr) };
};
interface NetPoint { date: string; value: number }

// 封装安全的数字格式化函数
const formatCorrelationValue = (value: number | null): string => {
    if (value === null || isNaN(value) || typeof value !== 'number') {
        return "无数据";
    }
    return value.toFixed(4);
};

export default function CorrelationBoard() {
    // 本地存储常量（持久化已选产品 + 基准）
    const STORAGE_KEY = 'correlation_selected_product_ids';
    const INDEX_STORAGE_KEY = 'correlation_selected_index_ids';

    // 篮子上下文：初次进入页面（localStorage 没有本页选中记录时）用篮子预填
    const { baskets, currentBasket, currentBasketId, setCurrentBasketId, loading: basketLoading } = useBasket();
    const initedRef = useRef(false);

    // 核心状态
    const [allProducts, setAllProducts] = useState<Product[]>([]);
    const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
    const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
    const [correlationData, setCorrelationData] = useState<ProductCorrelation[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [queryLoading, setQueryLoading] = useState<boolean>(false);
    const [productError, setProductError] = useState<string | null>(null);
    const [correlationError, setCorrelationError] = useState<string | null>(null);

    // 基准指数相关 state
    const [benchmarks, setBenchmarks] = useState<BenchmarkIndex[]>([]);
    const [selectedIndexIds, setSelectedIndexIds] = useState<number[]>([]);
    // 涉及基准的相关性走前端实时算（后端 ProductCorrelation 只覆盖产品 vs 产品）；
    // key 为两端实体的 'p:id' / 'i:id' 拼成的排序后字符串，统一查找
    const [crossCorr, setCrossCorr] = useState<Record<string, { corr: number; start: string; end: string; count: number }>>({});

    // 🔥 修复：新增 custom 和 fof_own 筛选字段
    const [filters, setFilters] = useState<ProductFilterParams>({
        search: '',
        cycle: '',
        quant_type: '',
        algorithm: '',
        strategy: '',
        fof_own: '',
        custom: '',
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

                // 2. 从本地存储恢复已选产品ID；没有则尝试用篮子预填
                const savedIds = localStorage.getItem(STORAGE_KEY);
                if (savedIds) {
                    try {
                        const parsedIds = JSON.parse(savedIds) as number[];
                        const validIds = parsedIds.filter(id => products.some(p => p.id === id));
                        setSelectedProductIds(validIds);
                    } catch {
                        setSelectedProductIds([]);
                    }
                } else if (currentBasket && currentBasket.product_id_list.length > 0) {
                    const valid = currentBasket.product_id_list.filter(id => products.some(p => p.id === id));
                    setSelectedProductIds(valid);
                }

                // 3. 加载基准列表 + 恢复已选基准（没有则用篮子预填）
                try {
                    const bRes = await benchmarkApi.getBenchmarks();
                    const blist = bRes.results ?? [];
                    setBenchmarks(blist);
                    const savedIdx = localStorage.getItem(INDEX_STORAGE_KEY);
                    if (savedIdx) {
                        try {
                            const ids = JSON.parse(savedIdx) as number[];
                            setSelectedIndexIds(ids.filter(id => blist.some(b => b.id === id)));
                        } catch {}
                    } else if (currentBasket && currentBasket.index_id_list.length > 0) {
                        setSelectedIndexIds(currentBasket.index_id_list.filter(id => blist.some(b => b.id === id)));
                    }
                } catch (e) {
                    console.error('基准列表加载失败', e);
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

        // 等 BasketProvider 完成加载后只跑一次（用 ref 防重复，避免 effect 内 setState 触发 set-state-in-effect）
        if (!initedRef.current && !basketLoading) {
            initedRef.current = true;
            void initPage();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [basketLoading]);

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
                if (filters.fof_own) params.fof_own = filters.fof_own; // 🔥 新增
                if (filters.custom) params.custom = filters.custom; // 🔥 新增
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

    useEffect(() => {
        localStorage.setItem(INDEX_STORAGE_KEY, JSON.stringify(selectedIndexIds));
    }, [selectedIndexIds]);

    const toggleIndex = (id: number) => {
        setSelectedIndexIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };
    const clearIndexes = () => setSelectedIndexIds([]);

    // 应用篮子：用篮子里的产品 + 基准指数替换当前已选；
    // 之后用户仍可在产品列表 / 基准 chip 区追加非篮子的对象
    const applyBasket = () => {
        if (!currentBasket) return;
        const valid = allProducts.map(p => p.id);
        setSelectedProductIds(currentBasket.product_id_list.filter(id => valid.includes(id)));
        // 基准列表 selector 在矩阵区上方已加载到 benchmarks state，这里直接 set；
        // 即便 benchmarks 尚未加载，setSelectedIndexIds 后下次加载完会自然 filter 出有效项
        setSelectedIndexIds(currentBasket.index_id_list);
    };

    // 2. 筛选条件变更处理
    const handleFilterChange = (name: keyof ProductFilterParams, value: string) => {
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    // 🔥 修复：重置时包含 custom 和 fof_own
    const handleResetFilter = () => {
        setFilters({
            search: '',
            cycle: '',
            quant_type: '',
            algorithm: '',
            strategy: '',
            fof_own: '',
            custom: '',
        });
    };

    // 3. 产品选择/取消逻辑
    const handleToggleProduct = (productId: number) => {
        setSelectedProductIds(prev =>
            prev.includes(productId)
                ? prev.filter(id => id !== productId)
                : [...prev, productId]
        );
    };

    // 4. 移除单个已选产品
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

    // 5. 查询相关性数据
    // 产品-产品走后端预计算（correlationApi.getCorrelationsByProducts）；
    // 涉及基准的对（基准-基准、基准-产品）前端实时算 Pearson —— 因为后端 ProductCorrelation
    // 表只覆盖产品对；扩出 BenchmarkCorrelation 表的代价较高，选前端算保持简洁。
    const handleQueryCorrelation = async () => {
        const total = selectedProductIds.length + selectedIndexIds.length;
        if (total < 2) {
            setCorrelationError('请至少选择 2 个对象（产品 + 基准合计）');
            return;
        }

        setQueryLoading(true);
        setCorrelationError(null);
        try {
            // (1) 后端拿产品-产品相关性（>=2 个产品才有意义）
            const productCorrPromise: Promise<{ results: ProductCorrelation[] }> = selectedProductIds.length >= 2
                ? correlationApi.getCorrelationsByProducts(selectedProductIds)
                : Promise.resolve({ results: [] });

            // (2) 并行拉所有 selected 实体的净值
            const productNvPromises: Array<Promise<[number, NetPoint[]]>> = selectedProductIds.map(async pid => {
                const r = await productApi.getNetValuesByProductId(pid);
                const pts: NetPoint[] = (r.results ?? [])
                    .filter((v: ProductNetValue) => v.net_value_date && v.cumulative_unit_net_value != null)
                    .map((v: ProductNetValue) => ({ date: v.net_value_date!.trim(), value: Number(v.cumulative_unit_net_value) }))
                    .filter(p => Number.isFinite(p.value) && p.value > 0);
                return [pid, pts] as [number, NetPoint[]];
            });
            const indexNvPromises: Array<Promise<[number, NetPoint[]]>> = selectedIndexIds.map(async iid => {
                const r = await benchmarkApi.getBenchmarkNetValues(iid);
                const pts: NetPoint[] = (r.results ?? [])
                    .filter((v: BenchmarkNetValuePoint) => v.net_value_date && v.close_price != null)
                    .map((v: BenchmarkNetValuePoint) => ({ date: v.net_value_date.trim(), value: Number(v.close_price) }))
                    .filter(p => Number.isFinite(p.value) && p.value > 0);
                return [iid, pts] as [number, NetPoint[]];
            });

            const [productCorrRes, productNvs, indexNvs] = await Promise.all([
                productCorrPromise,
                Promise.all(productNvPromises),
                Promise.all(indexNvPromises),
            ]);

            setCorrelationData(productCorrRes.results ?? []);

            // (3) 前端实时算"涉及基准"的对
            const productNvMap = new Map(productNvs);
            const indexNvMap = new Map(indexNvs);
            const cross: typeof crossCorr = {};
            const getNv = (k: EntityKey) => {
                const { kind, id } = parseKey(k);
                return kind === 'p' ? productNvMap.get(id) : indexNvMap.get(id);
            };
            const allKeys: EntityKey[] = [
                ...selectedProductIds.map(pKey),
                ...selectedIndexIds.map(iKey),
            ];
            for (let i = 0; i < allKeys.length; i++) {
                for (let j = i + 1; j < allKeys.length; j++) {
                    const a = allKeys[i], b = allKeys[j];
                    // 纯产品对走后端，跳过
                    if (a.startsWith('p:') && b.startsWith('p:')) continue;
                    const aNv = getNv(a), bNv = getNv(b);
                    if (!aNv || !bNv) continue;
                    const r = calculateCorrelation(aNv, bNv);
                    cross[`${a}|${b}`] = r;
                }
            }
            setCrossCorr(cross);

            const hasAnyCorr = (productCorrRes.results?.length ?? 0) > 0 || Object.keys(cross).length > 0;
            if (!hasAnyCorr) setCorrelationError('未查询到任何相关性数据');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : '未知错误';
            setCorrelationError(`查询相关性失败：${message}`);
            setCorrelationData([]);
            setCrossCorr({});
        } finally {
            setQueryLoading(false);
        }
    };

    // 6. 实体名称（产品 / 基准统一处理）
    const getProductName = (productId: number): string => {
        const product = allProducts.find(p => p.id === productId);
        return product ? `${product.product_name} (ID: ${product.id})` : `产品${productId} (ID: ${productId})`;
    };
    const getIndexName = (indexId: number): string => {
        const b = benchmarks.find(x => x.id === indexId);
        return b ? `[指数] ${b.index_short_name || b.index_name}` : `[指数] #${indexId}`;
    };
    const getEntityName = (k: EntityKey): string => {
        const { kind, id } = parseKey(k);
        return kind === 'p' ? getProductName(id) : getIndexName(id);
    };

    // 7. 取相关系数：产品-产品查 correlationData，否则查 crossCorr
    const getEntityCorr = (a: EntityKey, b: EntityKey): number | null => {
        if (a === b) return 1;
        const aIsP = a.startsWith('p:');
        const bIsP = b.startsWith('p:');
        if (aIsP && bIsP) {
            const aid = parseKey(a).id, bid = parseKey(b).id;
            let item = correlationData.find(c => c.product1 === aid && c.product2 === bid);
            if (!item) item = correlationData.find(c => c.product1 === bid && c.product2 === aid);
            if (!item || item.correlation_coefficient === null || isNaN(item.correlation_coefficient)) return null;
            return item.correlation_coefficient;
        }
        const k1 = `${a}|${b}`, k2 = `${b}|${a}`;
        const r = crossCorr[k1] ?? crossCorr[k2];
        return r ? r.corr : null;
    };

    // 全部已选实体 keys（用于矩阵的行/列）
    const allEntityKeys: EntityKey[] = [
        ...selectedProductIds.map(pKey),
        ...selectedIndexIds.map(iKey),
    ];

    return (
        <div className="container mx-auto p-4 sm:p-6 bg-slate-50 min-h-screen">
            {/* 页面标题 */}
            <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-bold mb-8 text-slate-800 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10" />
                </svg>
                产品相关性看板
            </h1>

            {/* 应用篮子条 */}
            <div className="mb-4 flex items-center flex-wrap gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
                <span className="text-sm font-semibold text-slate-700">🧺 篮子</span>
                <select
                    value={currentBasketId ?? ''}
                    onChange={e => setCurrentBasketId(e.target.value ? Number(e.target.value) : null)}
                    className="px-2 py-1 border border-slate-300 rounded text-sm bg-white"
                >
                    <option value="">未选择</option>
                    {baskets.map(b => (
                        <option key={b.id} value={b.id}>
                            {b.name}（{b.product_id_list.length} 产品 + {b.index_id_list.length} 基准）
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    onClick={applyBasket}
                    disabled={!currentBasket}
                    className={`px-3 py-1 text-sm rounded ${currentBasket ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                >
                    应用到本页（替换已选）
                </button>
                <span className="text-xs text-slate-500">应用后仍可在下方产品列表 / 基准 chip 区继续追加非篮子的对象</span>
            </div>

            {/* 1. 筛选区域 */}
            <div className="mb-8 p-5 border border-slate-200 rounded-xl bg-white shadow-md hover:shadow-lg transition-shadow duration-300">
                {/* 🔥 修复：从 5 列改为 7 列布局 */}
                <div className="grid grid-cols-1 md:grid-cols-7 gap-4 mb-5">
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

                    {/* 策略类型 */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-600 tracking-wide">策略类型</label>
                        {tagsLoading ? (
                            <div className="flex items-center justify-center px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-500 bg-slate-50 animate-pulse">加载中...</div>
                        ) : tagsError ? (
                            <div className="text-xs text-red-600 p-2 bg-red-50 rounded-lg">{tagsError}</div>
                        ) : (
                            <select
                                value={filters.strategy}
                                onChange={(e) => handleFilterChange('strategy', e.target.value)}
                                className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-all duration-200 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%236b7280%22%20strokeLinecap%3D%22round%22%20strokeLinejoin%3D%22round%22%20strokeWidth%3D%221.5%22%20d%3D%22M6%208l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[right_0.75rem_center] bg-no-repeat pr-8"
                            >
                                <option value="">全部</option>
                                {tags.strategies.map((strategy) => (
                                    <option key={strategy.id} value={strategy.id.toString()} className="py-2">{strategy.strategy_name}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* 🔥 新增：FOF 归属筛选 */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-600 tracking-wide">FOF 归属</label>
                        {tagsLoading ? (
                            <div className="flex items-center justify-center px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-500 bg-slate-50 animate-pulse">加载中...</div>
                        ) : tagsError ? (
                            <div className="text-xs text-red-600 p-2 bg-red-50 rounded-lg">{tagsError}</div>
                        ) : (
                            <select
                                value={filters.fof_own}
                                onChange={(e) => handleFilterChange('fof_own', e.target.value)}
                                className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-all duration-200 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%236b7280%22%20strokeLinecap%3D%22round%22%20strokeLinejoin%3D%22round%22%20strokeWidth%3D%221.5%22%20d%3D%22M6%208l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[right_0.75rem_center] bg-no-repeat pr-8"
                            >
                                <option value="">全部</option>
                                {tags.fofOwnTags?.map((fof) => (
                                    <option key={fof.id} value={fof.id.toString()} className="py-2">{fof.fof_name}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* 🔥 新增：自定义标签筛选 + 重置按钮 */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-600 tracking-wide">自定义标签</label>
                        <div className="flex gap-2.5">
                            {tagsLoading ? (
                                <div className="flex-1 flex items-center justify-center px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-500 bg-slate-50 animate-pulse">加载中...</div>
                            ) : tagsError ? (
                                <div className="flex-1 text-xs text-red-600 p-2 bg-red-50 rounded-lg">{tagsError}</div>
                            ) : (
                                <select
                                    value={filters.custom}
                                    onChange={(e) => handleFilterChange('custom', e.target.value)}
                                    className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-all duration-200 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%236b7280%22%20strokeLinecap%3D%22round%22%20strokeLinejoin%3D%22round%22%20strokeWidth%3D%221.5%22%20d%3D%22M6%208l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[right_0.75rem_center] bg-no-repeat pr-8"
                                >
                                    <option value="">全部</option>
                                    {tags.customTags?.map((tag) => (
                                        <option key={tag.id} value={tag.id.toString()} className="py-2">{tag.tag_name}</option>
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

                    {/* 基准指数多选 */}
                    <div className="mt-5">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-medium text-slate-700">对比基准指数（{selectedIndexIds.length} 个）</div>
                            {selectedIndexIds.length > 0 && (
                                <button onClick={clearIndexes} className="text-xs text-slate-500 hover:text-red-600 underline">清空</button>
                            )}
                        </div>
                        {benchmarks.length === 0 ? (
                            <div className="text-xs text-slate-400">暂无可选基准</div>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {benchmarks.map(b => {
                                    const checked = selectedIndexIds.includes(b.id);
                                    return (
                                        <label
                                            key={b.id}
                                            className={`px-2.5 py-1 rounded-full text-xs cursor-pointer border ${checked ? 'bg-blue-50 text-blue-700 border-blue-400' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}
                                        >
                                            <input type="checkbox" className="hidden" checked={checked} onChange={() => toggleIndex(b.id)} />
                                            {b.index_short_name || b.index_name}
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                        <p className="text-xs text-slate-400 mt-2">基准与产品 / 基准与基准的相关性在前端实时计算，按日期对齐取交集</p>
                    </div>

                    {/* 查询按钮 */}
                    <button
                        onClick={handleQueryCorrelation}
                        disabled={queryLoading || (selectedProductIds.length + selectedIndexIds.length) < 2}
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

            {/* 3. 相关性矩阵（产品 + 基准混合） */}
            {allEntityKeys.length >= 2 && (
                <div className="border border-slate-200 rounded-xl bg-white p-5 shadow-md hover:shadow-lg transition-shadow duration-300 overflow-x-auto">
                    <h2 className="font-semibold mb-5 text-slate-800 flex items-center gap-2 text-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 0 012-2h2a2 2 0 012 2v10" />
                        </svg>
                        相关性矩阵
                        <span className="text-xs text-slate-400 font-normal ml-2">{selectedProductIds.length} 产品 + {selectedIndexIds.length} 基准</span>
                    </h2>

                    {queryLoading ? (
                        <div className="flex items-center justify-center h-64 text-slate-500 flex-col gap-2">
                            <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
                            <span>正在计算相关性...</span>
                        </div>
                    ) : (correlationData.length > 0 || Object.keys(crossCorr).length > 0) ? (
                        <table className="min-w-full border-collapse">
                            <thead>
                            <tr className="bg-white">
                                <th className="border border-gray-300 p-2 text-left">名称</th>
                                {allEntityKeys.map(k => (
                                    <th key={k} className="border border-gray-300 p-2 text-xs">{getEntityName(k)}</th>
                                ))}
                            </tr>
                            </thead>
                            <tbody>
                            {allEntityKeys.map((rowKey, rowIndex) => (
                                <tr key={rowKey} className="bg-white">
                                    <td className="border border-gray-300 p-2 font-medium text-xs">{getEntityName(rowKey)}</td>
                                    {allEntityKeys.map((colKey, colIndex) => {
                                        if (rowIndex > colIndex) {
                                            return <td key={colKey} className="border border-gray-300 p-2 bg-white"></td>;
                                        }
                                        const value = getEntityCorr(rowKey, colKey);
                                        const bgColor = value === null
                                            ? 'bg-gray-100'
                                            : value >= 0.8 ? 'bg-red-100'
                                            : value >= 0.5 ? 'bg-orange-100'
                                            : value >= 0   ? 'bg-yellow-50'
                                            : value >= -0.5 ? 'bg-blue-50'
                                            : 'bg-blue-100';
                                        return (
                                            <td key={colKey} className={`border border-gray-300 p-2 text-center ${bgColor}`}>
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