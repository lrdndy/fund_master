//src/components/products/NetValuesManagementPage.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import type { EChartOption } from 'echarts';
import type { CSSProperties } from 'react';
import { productApi } from '@/lib/api';
import useProductTags from '@/hooks/useProductTags';
import type { Product, ProductNetValue, ApiResponse, NetValueApiResponse, ProductFilterParams } from '@/lib/types';

// ====================== 1. 类型扩展与定义 ======================
declare module 'echarts' {
    interface EChartOption {
        noDataLoadingOption?: {
            text?: string;
            textStyle?: {
                color?: string;
                fontSize?: number;
            };
        };
    }
}

interface ValidNetValue {
    date: string;
    value: number;
}

interface ChartProductData {
    id: number;
    name: string;
    isBenchmark: boolean;
    netValues: ValidNetValue[];
}

// ====================== 2. 工具函数 ======================
const formatDate = (rawDate: string): string => {
    try {
        const date = new Date(rawDate);
        if (isNaN(date.getTime())) return rawDate;
        return `${date.getMonth() + 1}-${date.getDate().toString().padStart(2, '0')}`;
    } catch {
        return rawDate;
    }
};

const debounce = (fn: () => void, delay: number): (() => void) => {
    let timer: NodeJS.Timeout | null = null;
    return () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(fn, delay);
    };
};

const getSeriesStyle = (isBenchmark: boolean, index: number) => {
    const benchmarkStyle = {
        lineColor: '#888888',
        itemColor: '#666666',
        lineType: 'dashed' as const,
        lineWidth: 2,
    };
    const compareStyles = [
        { lineColor: '#3b82f6', itemColor: '#1e40af', lineType: 'solid' as const, lineWidth: 2.5 },
        { lineColor: '#10b981', itemColor: '#059669', lineType: 'solid' as const, lineWidth: 2.5 },
        { lineColor: '#f59e0b', itemColor: '#d97706', lineType: 'solid' as const, lineWidth: 2.5 },
        { lineColor: '#ef4444', itemColor: '#dc2626', lineType: 'solid' as const, lineWidth: 2.5 },
    ];
    return isBenchmark ? benchmarkStyle : compareStyles[index % compareStyles.length];
};

// ====================== 3. 样式配置 ======================
const STYLES: Record<string, CSSProperties> = {
    container: { padding: '16px', marginBottom: '24px', backgroundColor: '#f9fafb', minHeight: '100vh' },
    title: { fontSize: '24px', fontWeight: '600', color: '#1f2937', marginBottom: '24px' },
    filterCard: { border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', backgroundColor: '#ffffff', marginBottom: '16px' },
    filterGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }, // 🔥 修复：7列布局（新增custom）
    filterItem: { display: 'flex', flexDirection: 'column', gap: '4px' },
    filterLabel: { fontSize: '12px', fontWeight: '500', color: '#4b5563' },
    filterInput: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', color: '#1f2937' },
    filterSelect: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', color: '#1f2937', backgroundColor: '#fff' },
    resetBtn: { padding: '8px 16px', border: 'none', borderRadius: '6px', backgroundColor: '#f3f4f6', color: '#4b5563', fontSize: '14px', cursor: 'pointer', marginTop: '20px' },
    productArea: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '24px' },
    productListCard: { border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', backgroundColor: '#ffffff', maxHeight: '400px', overflowY: 'auto', minHeight: '200px' },
    productListItem: { padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '6px', marginBottom: '8px', cursor: 'pointer', transition: 'background-color 0.2s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    productListItemHover: { backgroundColor: '#f9fafb' },
    productListItemActive: { backgroundColor: '#eff6ff', border: '1px solid #3b82f6' },
    selectedProductCard: { border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', backgroundColor: '#ffffff', minHeight: '200px' },
    selectedBox: { marginBottom: '16px' },
    selectedTitle: { fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '8px' },
    tagContainer: { display: 'flex', flexWrap: 'wrap', gap: '8px', minHeight: '40px', border: '1px dashed #d1d5db', borderRadius: '6px', padding: '8px', backgroundColor: '#f9fafb' },
    productTag: { display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '16px', fontSize: '12px', fontWeight: '500' },
    benchmarkTag: { backgroundColor: '#f3f4f6', color: '#1f2937', border: '1px solid #d1d5db' },
    compareTag: { backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' },
    tagCloseBtn: { width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#e5e7eb', color: '#6b7280', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', lineHeight: '1' },
    legendPanel: { width: '100%', border: '1px solid #e5e7eb', borderBottom: 'none', borderTopLeftRadius: '8px', borderTopRightRadius: '8px', backgroundColor: '#ffffff', overflow: 'hidden', transition: 'height 0.3s ease', height: '36px', minHeight: '36px' },
    legendToggleBtn: { width: '100%', padding: '8px 16px', border: 'none', backgroundColor: 'transparent', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '14px', color: '#374151' },
    legendList: { padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '8px' },
    legendItem: { display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#374151' },
    legendColorMarker: { width: '12px', height: '12px', marginRight: '8px', borderRadius: '2px' },
    chartContainer: { width: '100%', height: '400px', border: '1px solid #e5e7eb', borderTopLeftRadius: '0', borderTopRightRadius: '0', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px', backgroundColor: '#ffffff', padding: '16px', boxSizing: 'border-box', position: 'relative', minHeight: '400px' },
    chartDom: { width: '100%', height: '100%', zIndex: 1 },
    placeholder: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', backgroundColor: '#f9fafb', borderRadius: '4px', position: 'absolute', top: '16px', left: '16px', right: '16px', bottom: '16px', zIndex: 2 },
    emptyText: { fontSize: '14px', color: '#9ca3af', textAlign: 'center', marginTop: '8px' },
};

// ====================== 4. 核心组件 ======================
export default function NetValuesManagementPage() {
    // 本地存储常量
    const STORAGE_KEYS = {
        BENCHMARK_ID: 'selected_benchmark_id',
        COMPARE_IDS: 'selected_compare_ids'
    };

    // 核心状态
    const [allProducts, setAllProducts] = useState<Product[]>([]);
    const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
    const [selectedBenchmark, setSelectedBenchmark] = useState<Product | null>(null);
    const [selectedCompares, setSelectedCompares] = useState<Product[]>([]);
    const [chartProductList, setChartProductList] = useState<ChartProductData[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [chartLoading, setChartLoading] = useState(false);
    const [productError, setProductError] = useState<string | null>(null);
    const [chartError, setChartError] = useState<string | null>(null);
    const [legendVisible, setLegendVisible] = useState<boolean>(false);

    // 🔥 修复：新增 custom 自定义标签筛选字段
    const [filters, setFilters] = useState<ProductFilterParams>({
        search: '',
        cycle: '',
        quant_type: '',
        algorithm: '',
        strategy: '',
        fof_own: '',
        custom: '', // 🔥 新增
    });

    const { tags, tagsLoading, tagsError } = useProductTags();
    const chartRef = useRef<HTMLDivElement>(null);
    const echartsInstance = useRef<echarts.ECharts | null>(null);
    const debouncedResize = useRef<() => void>(() => {});

    // ====================== 5. 初始化 ECharts ======================
    useEffect(() => {
        let retryCount = 0;
        const maxRetries = 3;
        const initECharts = () => {
            if (chartRef.current) {
                try {
                    echartsInstance.current = echarts.init(chartRef.current);
                    debouncedResize.current = debounce(() => echartsInstance.current?.resize(), 200);
                    window.addEventListener('resize', debouncedResize.current);
                    return;
                } catch (err) {
                    console.error('ECharts 初始化失败：', err);
                    setChartError('图表初始化失败，请刷新');
                    return;
                }
            }
            if (retryCount < maxRetries) {
                retryCount++;
                setTimeout(initECharts, 100);
            } else {
                setChartError('图表容器渲染失败，请刷新');
            }
        };
        const initTimer = setTimeout(initECharts, 50);
        return () => {
            clearTimeout(initTimer);
            window.removeEventListener('resize', debouncedResize.current);
            echartsInstance.current?.dispose();
        };
    }, []);

    // ====================== 首次加载：从本地恢复选中产品 ======================
    useEffect(() => {
        const initSelectedProducts = async () => {
            try {
                const res: ApiResponse<Product> = await productApi.getProducts({});
                const products = res.results || [];
                setAllProducts(products);
                setFilteredProducts(products);

                if (products.length === 0) return;

                const savedBenchId = localStorage.getItem(STORAGE_KEYS.BENCHMARK_ID);
                const savedCompareIds = localStorage.getItem(STORAGE_KEYS.COMPARE_IDS);

                let bench: Product | null = null;
                let compares: Product[] = [];

                if (savedBenchId) {
                    const id = Number(savedBenchId);
                    bench = products.find(p => p.id === id) || null;
                }
                if (savedCompareIds) {
                    try {
                        const ids = JSON.parse(savedCompareIds) as number[];
                        compares = products.filter(p => ids.includes(p.id));
                    } catch {}
                }

                if (!bench) {
                    bench = products[0];
                    compares = products.slice(1, 3);
                }

                setSelectedBenchmark(bench);
                setSelectedCompares(compares);
            } catch (err) {
                setProductError('产品初始化失败');
            }
        };

        initSelectedProducts();
    }, []);

    // ====================== 筛选/搜索：只更新列表 ======================
    useEffect(() => {
        const filterProducts = async () => {
            setLoading(true);
            try {
                const params: Record<string, string> = {};
                if (filters.cycle) params.cycle = filters.cycle;
                if (filters.quant_type) params.quant_type = filters.quant_type;
                if (filters.algorithm) params.algorithm = filters.algorithm;
                if (filters.strategy) params.strategy = filters.strategy;
                if (filters.fof_own) params.fof_own = filters.fof_own;
                if (filters.custom) params.custom = filters.custom; // 🔥 新增
                if (filters.search) params.search = filters.search;

                const res: ApiResponse<Product> = await productApi.getProducts(params);
                const products = res.results || [];
                setFilteredProducts(products);
                setProductError(null);
            } catch (err) {
                setProductError('筛选失败');
            } finally {
                setLoading(false);
            }
        };

        const timer = setTimeout(filterProducts, 300);
        return () => clearTimeout(timer);
    }, [filters]);

    // ====================== 持久化保存：手动修改后自动存本地 ======================
    useEffect(() => {
        if (selectedBenchmark) {
            localStorage.setItem(STORAGE_KEYS.BENCHMARK_ID, selectedBenchmark.id.toString());
        } else {
            localStorage.removeItem(STORAGE_KEYS.BENCHMARK_ID);
        }
        const compareIds = selectedCompares.map(p => p.id);
        localStorage.setItem(STORAGE_KEYS.COMPARE_IDS, JSON.stringify(compareIds));
    }, [selectedBenchmark, selectedCompares]);

    // ====================== 加载【累计单位净值】数据（核心修改） ======================
    useEffect(() => {
        if (!selectedBenchmark && selectedCompares.length === 0) {
            setChartProductList([]);
            return;
        }

        const loadNetValues = async () => {
            try {
                setChartLoading(true);
                const chartDataList: ChartProductData[] = [];

                // 基准产品：加载累计单位净值
                if (selectedBenchmark) {
                    const res: NetValueApiResponse<ProductNetValue> = await productApi.getNetValuesByProductId(selectedBenchmark.id);
                    const validNetValues = res.results?.filter((item: ProductNetValue) => {
                        const val = Number(item.cumulative_unit_net_value);
                        return !!item.net_value_date && !isNaN(val) && val >= 0;
                    }).map((item: ProductNetValue) => ({
                        date: item.net_value_date.trim(),
                        value: Number(item.cumulative_unit_net_value),
                    })).sort((a: ValidNetValue, b: ValidNetValue) => new Date(a.date).getTime() - new Date(b.date).getTime()) || [];

                    if (validNetValues.length > 0) {
                        chartDataList.push({
                            id: selectedBenchmark.id,
                            name: selectedBenchmark.product_name || `产品${selectedBenchmark.id}`,
                            isBenchmark: true,
                            netValues: validNetValues,
                        });
                    }
                }

                // 对比产品：加载累计单位净值
                for (const product of selectedCompares) {
                    const res: NetValueApiResponse<ProductNetValue> = await productApi.getNetValuesByProductId(product.id);
                    const validNetValues = res.results?.filter((item: ProductNetValue) => {
                        const val = Number(item.cumulative_unit_net_value);
                        return !!item.net_value_date && !isNaN(val) && val >= 0;
                    }).map((item: ProductNetValue) => ({
                        date: item.net_value_date.trim(),
                        value: Number(item.cumulative_unit_net_value),
                    })).sort((a: ValidNetValue, b: ValidNetValue) => new Date(a.date).getTime() - new Date(b.date).getTime()) || [];

                    if (validNetValues.length > 0) {
                        chartDataList.push({
                            id: product.id,
                            name: product.product_name || `产品${product.id}`,
                            isBenchmark: false,
                            netValues: validNetValues,
                        });
                    }
                }

                setChartProductList(chartDataList);
                setChartError(chartDataList.length === 0 ? '暂无有效累计净值数据，请选择其他产品' : null);
            } catch (err) {
                setChartError('累计净值加载失败，请刷新');
                setChartProductList([]);
            } finally {
                setChartLoading(false);
            }
        };

        loadNetValues();
    }, [selectedBenchmark, selectedCompares]);

    // ====================== 更新图表 ======================
    useEffect(() => {
        if (!chartRef.current || !echartsInstance.current || chartLoading || chartProductList.length === 0) {
            return;
        }

        try {
            const allDates = new Set<string>();
            chartProductList.forEach(p => p.netValues.forEach(nv => allDates.add(nv.date)));

            const sortedDates = Array.from(allDates).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
            const xAxisData = sortedDates.map(formatDate);

            if (xAxisData.length === 0) {
                setChartError('暂无有效日期数据');
                return;
            }

            const series = chartProductList.map((product, index) => {
                const style = getSeriesStyle(product.isBenchmark, index);
                const seriesName = product.isBenchmark ? `[基准] ${product.name}` : product.name;

                const yData = sortedDates.map((dateStr) => {
                    const match = product.netValues.find(nv => nv.date === dateStr);
                    return match ? match.value : undefined;
                });

                return {
                    name: seriesName,
                    type: 'line' as const,
                    data: yData,
                    smooth: true,
                    lineStyle: { color: style.lineColor, width: style.lineWidth, type: style.lineType },
                    itemStyle: { color: style.itemColor, border: '2px solid #fff' },
                    symbol: 'circle' as const,
                    symbolSize: 4,
                    showSymbol: false,
                    emphasis: { itemStyle: { color: style.itemColor, border: '3px solid #fff' } },
                    areaStyle: product.isBenchmark ? undefined : {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: `${style.lineColor}20` },
                            { offset: 1, color: `${style.lineColor}00` },
                        ]),
                    },
                };
            });

            const chartOption: EChartOption = {
                title: { text: '多产品累计单位净值趋势对比', left: 'center' as const, textStyle: { fontSize: 16, color: '#1f2937' } },
                legend: { show: false },
                tooltip: {
                    trigger: 'axis' as const,
                    axisPointer: { type: 'line' as const, lineStyle: { color: '#e5e7eb', width: 1 } },
                    backgroundColor: 'rgba(255,255,255,0.9)',
                    borderColor: '#e5e7eb',
                    borderWidth: 1,
                    padding: 10,
                },
                grid: { left: '10%', right: '5%', bottom: '15%', top: '10%', containLabel: true },
                xAxis: {
                    type: 'category' as const,
                    data: xAxisData,
                    axisLabel: { rotate: 30, color: '#6b7280' },
                    axisLine: { lineStyle: { color: '#e5e7eb' } },
                    splitLine: { show: false },
                },
                yAxis: {
                    type: 'value' as const,
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (val: number | string) => (isNaN(Number(val)) ? '0.000' : Number(val).toFixed(3)),
                    },
                    axisLine: { lineStyle: { color: '#e5e7eb' } },
                    splitLine: { lineStyle: { color: '#f9fafb' } },
                },
                series: series,
                animationDuration: 1000,
                noDataLoadingOption: { text: '暂无数据', textStyle: { color: '#6b7280' } },
            };

            echartsInstance.current.clear();
            echartsInstance.current.setOption(chartOption, true);
        } catch (err) {
            console.error('图表更新失败：', err);
            setChartError('图表更新失败，请刷新');
        }
    }, [chartProductList, chartLoading]);


    // ====================== 交互事件 ======================
    const handleFilterChange = (name: keyof ProductFilterParams, value: string) => {
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    // 🔥 修复：重置时包含 custom
    const handleResetFilter = () => {
        setFilters({
            search: '',
            cycle: '',
            quant_type: '',
            algorithm: '',
            strategy: '',
            fof_own: '',
            custom: '', // 🔥 新增
        });
    };

    const handleSelectBenchmark = (product: Product) => {
        setSelectedCompares(prev => prev.filter(p => p.id !== product.id));
        setSelectedBenchmark(product);
    };

    const handleSelectCompare = (product: Product) => {
        if (product.id === selectedBenchmark?.id) return;
        setSelectedCompares(prev =>
            prev.some(p => p.id === product.id) ? prev.filter(p => p.id !== product.id) : [...prev, product]
        );
    };

    const handleRemoveProduct = (product: Product, type: 'benchmark' | 'compare') => {
        if (type === 'benchmark') setSelectedBenchmark(null);
        else setSelectedCompares(prev => prev.filter(p => p.id !== product.id));
    };

    const handleLegendToggle = (seriesName: string) => {
        echartsInstance.current?.dispatchAction({ type: 'legendToggleSelect', name: seriesName });
    };

    // ====================== 页面渲染 ======================
    return (
        <div style={STYLES.container}>
            <h1 style={STYLES.title}>净值管理（累计单位净值对比）</h1>

            <div style={STYLES.filterCard}>
                <div style={STYLES.filterGrid}>
                    <div style={STYLES.filterItem}>
                        <label style={STYLES.filterLabel}>产品名称</label>
                        <input
                            type="text"
                            value={filters.search}
                            onChange={(e) => handleFilterChange('search', e.target.value)}
                            placeholder="输入产品名称关键词"
                            style={STYLES.filterInput}
                        />
                    </div>
                    <div style={STYLES.filterItem}>
                        <label style={STYLES.filterLabel}>周期标签</label>
                        {tagsLoading ? (
                            <div style={STYLES.placeholder}>加载中...</div>
                        ) : tagsError ? (
                            <div style={{ color: '#dc2626', fontSize: '12px' }}>{tagsError}</div>
                        ) : (
                            <select value={filters.cycle} onChange={(e) => handleFilterChange('cycle', e.target.value)} style={STYLES.filterSelect}>
                                <option value="">全部</option>
                                {tags.cycles.map((cycle) => (
                                    <option key={cycle.id} value={cycle.id.toString()}>{cycle.cycle_name}</option>
                                ))}
                            </select>
                        )}
                    </div>
                    <div style={STYLES.filterItem}>
                        <label style={STYLES.filterLabel}>量化类型</label>
                        {tagsLoading ? (
                            <div style={STYLES.placeholder}>加载中...</div>
                        ) : tagsError ? (
                            <div style={{ color: '#dc2626', fontSize: '12px' }}>{tagsError}</div>
                        ) : (
                            <select value={filters.quant_type} onChange={(e) => handleFilterChange('quant_type', e.target.value)} style={STYLES.filterSelect}>
                                <option value="">全部</option>
                                {tags.quantTypes.map((type) => (
                                    <option key={type.id} value={type.id.toString()}>{type.quant_name}</option>
                                ))}
                            </select>
                        )}
                    </div>
                    <div style={STYLES.filterItem}>
                        <label style={STYLES.filterLabel}>算法类型</label>
                        {tagsLoading ? (
                            <div style={STYLES.placeholder}>加载中...</div>
                        ) : tagsError ? (
                            <div style={{ color: '#dc2626', fontSize: '12px' }}>{tagsError}</div>
                        ) : (
                            <select value={filters.algorithm} onChange={(e) => handleFilterChange('algorithm', e.target.value)} style={STYLES.filterSelect}>
                                <option value="">全部</option>
                                {tags.algorithms.map((alg) => (
                                    <option key={alg.id} value={alg.id.toString()}>{alg.alg_name}</option>
                                ))}
                            </select>
                        )}
                    </div>
                    <div style={STYLES.filterItem}>
                        <label style={STYLES.filterLabel}>策略类型</label>
                        {tagsLoading ? (
                            <div style={STYLES.placeholder}>加载中...</div>
                        ) : tagsError ? (
                            <div style={{ color: '#dc2626', fontSize: '12px' }}>{tagsError}</div>
                        ) : (
                            <select value={filters.strategy} onChange={(e) => handleFilterChange('strategy', e.target.value)} style={STYLES.filterSelect}>
                                <option value="">全部</option>
                                {tags.strategies.map((strategy) => (
                                    <option key={strategy.id} value={strategy.id.toString()}>{strategy.strategy_name}</option>
                                ))}
                            </select>
                        )}
                    </div>
                    {/* 🔥 新增：FOF 归属筛选 */}
                    <div style={STYLES.filterItem}>
                        <label style={STYLES.filterLabel}>FOF 归属</label>
                        {tagsLoading ? (
                            <div style={STYLES.placeholder}>加载中...</div>
                        ) : tagsError ? (
                            <div style={{ color: '#dc2626', fontSize: '12px' }}>{tagsError}</div>
                        ) : (
                            <select value={filters.fof_own} onChange={(e) => handleFilterChange('fof_own', e.target.value)} style={STYLES.filterSelect}>
                                <option value="">全部</option>
                                {tags.fofOwnTags?.map((fof) => (
                                    <option key={fof.id} value={fof.id.toString()}>{fof.fof_name}</option>
                                ))}
                            </select>
                        )}
                    </div>
                    {/* 🔥 新增：自定义标签筛选 */}
                    <div style={STYLES.filterItem}>
                        <label style={STYLES.filterLabel}>自定义标签</label>
                        {tagsLoading ? (
                            <div style={STYLES.placeholder}>加载中...</div>
                        ) : tagsError ? (
                            <div style={{ color: '#dc2626', fontSize: '12px' }}>{tagsError}</div>
                        ) : (
                            <select value={filters.custom} onChange={(e) => handleFilterChange('custom', e.target.value)} style={STYLES.filterSelect}>
                                <option value="">全部</option>
                                {tags.customTags?.map((item) => (
                                    <option key={item.id} value={item.id.toString()}>{item.tag_name}</option>
                                ))}
                            </select>
                        )}
                    </div>
                    <div style={STYLES.filterItem}>
                        <label style={STYLES.filterLabel}>操作</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={handleResetFilter} style={STYLES.resetBtn}>重置</button>
                        </div>
                    </div>
                </div>
            </div>

            <div style={STYLES.productArea}>
                <div style={STYLES.productListCard}>
                    {loading ? (
                        <div style={STYLES.placeholder}>加载中...</div>
                    ) : productError ? (
                        <div style={{ ...STYLES.placeholder, color: '#dc2626' }}>{productError}</div>
                    ) : filteredProducts.length === 0 ? (
                        <div style={STYLES.emptyText}>暂无符合条件的产品</div>
                    ) : (
                        filteredProducts.map(product => {
                            const isBenchmark = product.id === selectedBenchmark?.id;
                            const isCompare = selectedCompares.some(p => p.id === product.id);
                            const itemStyle = {
                                ...STYLES.productListItem,
                                ...(isBenchmark || isCompare ? STYLES.productListItemActive : {}),
                            };

                            return (
                                <div
                                    key={product.id}
                                    style={itemStyle}
                                    onClick={() => isBenchmark ? null : handleSelectBenchmark(product)}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = STYLES.productListItemHover.backgroundColor ?? 'transparent'}
                                    onMouseLeave={(e) => {
                                        if (!isBenchmark && !isCompare) e.currentTarget.style.backgroundColor = 'transparent';
                                    }}
                                >
                                    <span>{product.product_name}</span>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            style={{
                                                padding: '4px 8px',
                                                border: '1px solid #d1d5db',
                                                borderRadius: '4px',
                                                fontSize: '12px',
                                                cursor: 'pointer',
                                                backgroundColor: isBenchmark ? '#3b82f6' : '#fff',
                                                color: isBenchmark ? '#fff' : '#4b5563',
                                            }}
                                            onClick={(e) => { e.stopPropagation(); handleSelectBenchmark(product); }}
                                        >设为基准</button>
                                        <button
                                            style={{
                                                padding: '4px 8px',
                                                border: '1px solid #d1d5db',
                                                borderRadius: '4px',
                                                fontSize: '12px',
                                                cursor: 'pointer',
                                                backgroundColor: isCompare ? '#10b981' : '#fff',
                                                color: isCompare ? '#fff' : '#4b5563',
                                            }}
                                            onClick={(e) => { e.stopPropagation(); handleSelectCompare(product); }}
                                            disabled={isBenchmark}
                                        >{isCompare ? '取消对比' : '加入对比'}</button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div style={STYLES.selectedProductCard}>
                    <div style={STYLES.selectedBox}>
                        <div style={STYLES.selectedTitle}>基准产品（单选）</div>
                        <div style={STYLES.tagContainer}>
                            {selectedBenchmark ? (
                                <div style={{ ...STYLES.productTag, ...STYLES.benchmarkTag }}>
                                    <span>{selectedBenchmark.product_name}</span>
                                    <button style={STYLES.tagCloseBtn} onClick={() => handleRemoveProduct(selectedBenchmark, 'benchmark')}>×</button>
                                </div>
                            ) : (
                                <span style={STYLES.emptyText}>未选择基准产品</span>
                            )}
                        </div>
                    </div>
                    <div style={STYLES.selectedBox}>
                        <div style={STYLES.selectedTitle}>对比产品（多选）</div>
                        <div style={STYLES.tagContainer}>
                            {selectedCompares.length > 0 ? (
                                selectedCompares.map(product => (
                                    <div key={product.id} style={{ ...STYLES.productTag, ...STYLES.compareTag }}>
                                        <span>{product.product_name}</span>
                                        <button style={STYLES.tagCloseBtn} onClick={() => handleRemoveProduct(product, 'compare')}>×</button>
                                    </div>
                                ))
                            ) : (
                                <span style={STYLES.emptyText}>未选择对比产品</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ ...STYLES.legendPanel, height: legendVisible ? 'auto' : '36px' }}>
                <button style={STYLES.legendToggleBtn} onClick={() => setLegendVisible(!legendVisible)}>
                    <span>图例</span>
                    <span>{legendVisible ? '▼' : '▲'}</span>
                </button>
                {legendVisible && chartProductList.length > 0 && (
                    <div style={STYLES.legendList}>
                        {chartProductList.map((product, index) => {
                            const style = getSeriesStyle(product.isBenchmark, index);
                            const seriesName = product.isBenchmark ? `[基准] ${product.name}` : product.name;
                            return (
                                <div key={product.id} style={STYLES.legendItem} onClick={() => handleLegendToggle(seriesName)}>
                                    <div style={{ ...STYLES.legendColorMarker, backgroundColor: style.lineColor }} />
                                    <span>{seriesName}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div style={STYLES.chartContainer}>
                <div ref={chartRef} style={STYLES.chartDom} />
                {(chartLoading || chartError || chartProductList.length === 0) && (
                    <div style={{ ...STYLES.placeholder, color: chartError ? '#dc2626' : '#6b7280' }}>
                        {chartLoading && '加载累计净值数据中...'}
                        {chartError && chartError}
                        {!chartLoading && !chartError && chartProductList.length === 0 && '暂无有效累计净值数据，请选择其他产品'}
                    </div>
                )}
            </div>
        </div>
    );
}