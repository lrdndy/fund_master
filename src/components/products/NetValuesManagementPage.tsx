'use client';
import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import type { CSSProperties } from 'react';
import { productApi, benchmarkApi } from '@/lib/api';
import useProductTags from '@/hooks/useProductTags';
import {
    computeBundle,
    normalizePoints,
    calculateCorrelation,
    DEFAULT_RISK_FREE,
    MetricBundle,
} from '@/lib/metrics';
import type {
    Product,
    ProductNetValue,
    ProductFilterParams,
    CycleTag,
    QuantType,
    AlgorithmType,
    StrategyType,
    FofOwnTag,
    CustomTag,
    BenchmarkIndex,
    BenchmarkNetValuePoint,
} from '@/lib/types';

// 类型定义
interface ValidNetValue { date: string; value: number }
interface ChartProductData {
    id: number;
    name: string;
    isBenchmark: boolean;  // 用作基准（虚线展示）
    isIndex?: boolean;     // 区分：来自基准指数表，而非产品
    netValues: ValidNetValue[];
    drawdownValues: { date: string; value: number }[];
}

type TimeRangeType = 'inception' | 'ytd' | '1m' | '3m' | '6m' | '1y' | 'custom';

interface ProductIndicator {
    name: string;
    isBenchmark: boolean;
    isIndex?: boolean;
    bundle: MetricBundle;
}

interface CorrelationDataPoint {
    name: string[];
    value: [number, number, number];
    start: string;
    end: string;
    count: number;
}

interface EChartsTooltipParam {
    data: CorrelationDataPoint;
}

// 日期格式化
const formatDate = (rawDate: string): string => {
    try {
        const date = new Date(rawDate);
        if (isNaN(date.getTime())) return rawDate;
        return `${date.getMonth() + 1}-${date.getDate().toString().padStart(2, '0')}`;
    } catch { return rawDate; }
};

// 防抖
const debounce = (fn: () => void, delay: number): (() => void) => {
    let timer: NodeJS.Timeout | null = null;
    return () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(fn, delay);
    };
};

// 最大回撤计算
const calculateMaxDrawdown = (netValues: ValidNetValue[]) => {
    if (netValues.length < 2) return [];
    let peak = netValues[0].value;
    const drawdownList: { date: string; value: number }[] = [];
    for (const item of netValues) {
        peak = Math.max(peak, item.value);
        const drawdown = ((item.value - peak) / peak) * 100;
        drawdownList.push({ date: item.date, value: parseFloat(drawdown.toFixed(2)) });
    }
    return drawdownList;
};

// 金融指标计算（公式统一走 lib/metrics.ts：252 交易日年化 + 2.5% 无风险利率）
const generateProductIndicators = (list: ChartProductData[]): ProductIndicator[] => list.map(item => {
    const pts = normalizePoints(item.netValues);
    return {
        name: item.name,
        isBenchmark: item.isBenchmark,
        isIndex: item.isIndex,
        bundle: computeBundle(pts, pts, DEFAULT_RISK_FREE),
    };
});

const fmtPct = (n: number | null, digits = 2): string => {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    const sign = n > 0 ? '+' : '';
    return `${sign}${(n * 100).toFixed(digits)}%`;
};

const fmtNum = (n: number | null, digits = 2): string => {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    return n.toFixed(digits);
};

const returnTextStyle = (n: number | null): CSSProperties => {
    if (n === null || n === undefined || Number.isNaN(n)) return { color: '#9ca3af' };
    if (n > 0) return { color: '#dc2626' };
    if (n < 0) return { color: '#16a34a' };
    return { color: '#1f2937' };
};

// 相关性计算已抽到 lib/metrics.ts 的 calculateCorrelation，两个页面共用

// 图表样式
interface SeriesStyle { lineColor: string; itemColor: string; lineType: 'solid' | 'dashed' | 'dotted'; width: number }
const getSeriesStyle = (isBenchmark: boolean, index: number): SeriesStyle => {
    const benchmark: SeriesStyle = { lineColor: '#888', itemColor: '#666', lineType: 'dashed', width: 2.5 };
    const styles: SeriesStyle[] = [
        { lineColor: '#3b82f6', itemColor: '#1e40af', lineType: 'solid', width: 3 },
        { lineColor: '#10b981', itemColor: '#059669', lineType: 'solid', width: 3 },
        { lineColor: '#f59900', itemColor: '#d97000', lineType: 'solid', width: 3 },
        { lineColor: '#ef4444', itemColor: '#dc2626', lineType: 'solid', width: 3 },
    ];
    return isBenchmark ? benchmark : styles[index % styles.length];
};

// 样式定义
const STYLES: Record<string, CSSProperties> = {
    container: { padding: '16px', marginBottom: '24px', backgroundColor: '#f9fafb', minHeight: '100vh' },
    title: { fontSize: '24px', fontWeight: 600, color: '#1f2937', marginBottom: '16px' },
    timeFilterBar: { display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' },
    timeBtn: { padding: '6px 12px', borderWidth: '1px', borderStyle: 'solid', borderColor: '#d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 },
    timeBtnActive: { borderColor: '#3b82f6', backgroundColor: '#3b82f6', color: '#fff' },
    dateInput: { padding: '6px 10px', borderWidth: '1px', borderStyle: 'solid', borderColor: '#d1d5db', borderRadius: 6, fontSize: 13 },
    filterCard: { borderWidth: '1px', borderStyle: 'solid', borderColor: '#e5e7eb', borderRadius: 8, padding: 16, background: '#fff', marginBottom: 16 },
    filterGrid: { display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 12, marginBottom: 16 },
    filterItem: { display: 'flex', flexDirection: 'column', gap: 4 },
    filterLabel: { fontSize: 12, fontWeight: 500, color: '#4b5563' },
    filterInput: { padding: '8px 12px', borderWidth: '1px', borderStyle: 'solid', borderColor: '#d1d5db', borderRadius: 6, fontSize: 14 },
    filterSelect: { padding: '8px 12px', borderWidth: '1px', borderStyle: 'solid', borderColor: '#d1d5db', borderRadius: 6, fontSize: 14, background: '#fff' },
    resetBtn: { padding: '8px 16px', border: 'none', borderRadius: 6, background: '#f3f4f6', color: '#4b5563', cursor: 'pointer', marginTop: 20 },
    productArea: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 },
    productListCard: { borderWidth: '1px', borderStyle: 'solid', borderColor: '#e5e7eb', borderRadius: 8, padding: 16, background: '#fff', maxHeight: 400, overflowY: 'auto' },
    productListItem: { padding: '8px 12px', borderWidth: '1px', borderStyle: 'solid', borderColor: '#e5e7eb', borderRadius: 6, marginBottom: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    productListItemActive: { backgroundColor: '#eff6ff', borderColor: '#3b82f6' },
    selectedProductCard: { borderWidth: '1px', borderStyle: 'solid', borderColor: '#e5e7eb', borderRadius: 8, padding: 16, background: '#fff' },
    selectedBox: { marginBottom: 16 },
    selectedTitle: { fontSize: 14, fontWeight: 600, color: '#1f2937', marginBottom: 8 },
    tagContainer: { display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 40, borderWidth: '1px', borderStyle: 'dashed', borderColor: '#d1d5db', borderRadius: 6, padding: 8, background: '#f9fafb' },
    productTag: { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 16, fontSize: 12, fontWeight: 500 },
    benchmarkTag: { background: '#f3f4f6', color: '#1f2937', borderWidth: '1px', borderStyle: 'solid', borderColor: '#d1d5db' },
    compareTag: { background: '#eff6ff', color: '#1d4ed8', borderWidth: '1px', borderStyle: 'solid', borderColor: '#bfdbfe' },
    tagCloseBtn: { width: 16, height: 16, borderRadius: '50%', background: '#e5e7eb', color: '#6b7280', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 },
    chartGrid: { display: 'grid', gridTemplateColumns: '1fr', gap: 32 },
    chartContainer: { width: '100%', height: 600, borderWidth: '1px', borderStyle: 'solid', borderColor: '#e5e7eb', borderRadius: 8, background: '#fff', padding: 20, boxSizing: 'border-box', position: 'relative' },
    chartDom: { width: '100%', height: '100%', zIndex: 1 },
    placeholder: { position: 'absolute', inset: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', background: '#f9fafb', borderRadius: 4, zIndex: 2 },
    emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', marginTop: 8 },
    tableContainer: { width: '100%', borderWidth: '1px', borderStyle: 'solid', borderColor: '#e5e7eb', borderRadius: 8, background: '#fff', padding: 20, marginTop: 32 },
    tableTitle: { fontSize: 16, fontWeight: 600, color: '#1f2937', marginBottom: 16 },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
    tableHeader: { background: '#f3f4f6', color: '#4b5563', fontWeight: 600, textAlign: 'left' },
    tableCell: { padding: '12px 16px', borderWidth: '1px', borderStyle: 'solid', borderColor: '#e5e7eb', color: '#1f2937' },
    benchmarkRow: { background: '#f9fafb' },
};

// 常量
const STORAGE_KEYS = {
    BENCHMARK_ID: 'selected_benchmark_id',
    COMPARE_IDS: 'selected_compare_ids',
    INDEX_IDS: 'selected_index_ids',
};
const timeBtns = [
    { label: '成立以来', value: 'inception' }, { label: '今年以来', value: 'ytd' }, { label: '近1月', value: '1m' },
    { label: '近3月', value: '3m' }, { label: '近半年', value: '6m' }, { label: '近1年', value: '1y' }, { label: '自定义', value: 'custom' }
];

export default function NetValuesManagementPage() {
    // 状态
    const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
    const [selectedBenchmark, setSelectedBenchmark] = useState<Product | null>(null);
    const [selectedCompares, setSelectedCompares] = useState<Product[]>([]);
    const [chartProductList, setChartProductList] = useState<ChartProductData[]>([]);
    const [loading, setLoading] = useState(true);
    const [chartLoading, setChartLoading] = useState(false);
    const [productError, setProductError] = useState<string | null>(null);
    const [chartError, setChartError] = useState<string | null>(null);
    const [productIndicators, setProductIndicators] = useState<ProductIndicator[]>([]);
    const [filters, setFilters] = useState<ProductFilterParams>({
        search: '', cycle: '', quant_type: '', algorithm: '', strategy: '', fof_own: '', custom: ''
    });
    const [timeRange, setTimeRange] = useState<TimeRangeType>('1y');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().split('T')[0]);

    // 基准指数（从 /benchmarks 拿，与"基准产品"并存）
    const [benchmarks, setBenchmarks] = useState<BenchmarkIndex[]>([]);
    const [selectedIndexIds, setSelectedIndexIds] = useState<number[]>([]);
    const [indexSeriesMap, setIndexSeriesMap] = useState<Record<number, BenchmarkNetValuePoint[]>>({});

    // 标签 Hook
    const { tags, tagsLoading, tagsError } = useProductTags();

    // 图表 Ref
    const netValueChartRef = useRef<HTMLDivElement>(null);
    const returnChartRef = useRef<HTMLDivElement>(null);
    const drawdownChartRef = useRef<HTMLDivElement>(null);
    const corrChartRef = useRef<HTMLDivElement>(null);
    const netValueChart = useRef<echarts.ECharts | null>(null);
    const returnChart = useRef<echarts.ECharts | null>(null);
    const drawdownChart = useRef<echarts.ECharts | null>(null);
    const corrChart = useRef<echarts.ECharts | null>(null);
    const debouncedResize = useRef<(() => void) | null>(null);

    // 初始化图表
    useEffect(() => {
        const init = () => {
            if (netValueChartRef.current) netValueChart.current = echarts.init(netValueChartRef.current);
            if (returnChartRef.current) returnChart.current = echarts.init(returnChartRef.current);
            if (drawdownChartRef.current) drawdownChart.current = echarts.init(drawdownChartRef.current);
            if (corrChartRef.current) corrChart.current = echarts.init(corrChartRef.current);
            debouncedResize.current = debounce(() => {
                netValueChart.current?.resize();
                returnChart.current?.resize();
                drawdownChart.current?.resize();
                corrChart.current?.resize();
            }, 200);
            window.addEventListener('resize', debouncedResize.current);
        };
        const t = setTimeout(init, 100);
        return () => {
            clearTimeout(t);
            window.removeEventListener('resize', debouncedResize.current!);
            netValueChart.current?.dispose();
            returnChart.current?.dispose();
            drawdownChart.current?.dispose();
            corrChart.current?.dispose();
        };
    }, []);

    // 初始化产品列表（类型完全匹配，无注解）
    useEffect(() => {
        const initProducts = async () => {
            try {
                const res = await productApi.getProducts({});
                const prods = res.results ?? [];
                setFilteredProducts(prods);
                if (!prods.length) return;

                // 默认不预选基准产品；只在 localStorage 明确存了 ID 时恢复
                const bId = localStorage.getItem(STORAGE_KEYS.BENCHMARK_ID);
                const cIds = localStorage.getItem(STORAGE_KEYS.COMPARE_IDS);
                const bench = bId ? prods.find(p => p.id === +bId) ?? null : null;
                let comps: Product[] = [];
                if (cIds) try { comps = prods.filter(p => JSON.parse(cIds).includes(p.id)); } catch {}

                setSelectedBenchmark(bench);
                setSelectedCompares(comps);
            } catch {
                setProductError('产品加载失败');
            }
        };
        initProducts();
    }, []);

    // 产品筛选（类型完全匹配）
    useEffect(() => {
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) as Record<string, string>;
                const res = await productApi.getProducts(params);
                setFilteredProducts(res.results ?? []);
                setProductError(null);
            } catch {
                setProductError('筛选失败');
            }
            setLoading(false);
        }, 300);
        return () => clearTimeout(timer);
    }, [filters]);

    // 本地存储选中产品
    useEffect(() => {
        selectedBenchmark
            ? localStorage.setItem(STORAGE_KEYS.BENCHMARK_ID, String(selectedBenchmark.id))
            : localStorage.removeItem(STORAGE_KEYS.BENCHMARK_ID);
        localStorage.setItem(STORAGE_KEYS.COMPARE_IDS, JSON.stringify(selectedCompares.map(p => p.id)));
        localStorage.setItem(STORAGE_KEYS.INDEX_IDS, JSON.stringify(selectedIndexIds));
    }, [selectedBenchmark, selectedCompares, selectedIndexIds]);

    // 加载基准指数列表 + 恢复上次选中
    useEffect(() => {
        const loadBenchmarks = async () => {
            try {
                const res = await benchmarkApi.getBenchmarks();
                setBenchmarks(res.results ?? []);
                const stored = localStorage.getItem(STORAGE_KEYS.INDEX_IDS);
                if (stored) {
                    try {
                        const ids = JSON.parse(stored) as number[];
                        const valid = (res.results ?? []).map(b => b.id);
                        setSelectedIndexIds(ids.filter(id => valid.includes(id)));
                    } catch {}
                }
            } catch (err) {
                console.error('加载基准指数失败', err);
            }
        };
        void loadBenchmarks();
    }, []);

    // 选中指数变化时，按需异步拉对应净值（缓存命中跳过）
    useEffect(() => {
        if (selectedIndexIds.length === 0) return;
        let cancelled = false;
        const loadAll = async () => {
            const toFetch = selectedIndexIds.filter(id => !indexSeriesMap[id]);
            if (toFetch.length === 0) return;
            try {
                const results = await Promise.all(
                    toFetch.map(async id => {
                        const res = await benchmarkApi.getBenchmarkNetValues(id);
                        return { id, points: res.results ?? [] };
                    }),
                );
                if (cancelled) return;
                setIndexSeriesMap(prev => {
                    const next = { ...prev };
                    results.forEach(r => { next[r.id] = r.points; });
                    return next;
                });
            } catch (err) {
                console.error('加载基准净值失败', err);
            }
        };
        void loadAll();
        return () => { cancelled = true; };
    }, [selectedIndexIds, indexSeriesMap]);

    // 时间范围过滤净值数据
    const filterNetValuesByTime = (netValues: ValidNetValue[]): ValidNetValue[] => {
        if (!netValues.length) return [];
        const now = new Date();
        let start = new Date(netValues[0].date);
        const end = new Date(customEndDate);

        const map: Record<TimeRangeType, () => void> = {
            inception: () => { },
            ytd: () => start = new Date(now.getFullYear(), 0, 1),
            '1m': () => start = new Date(now.setMonth(now.getMonth() - 1)),
            '3m': () => start = new Date(now.setMonth(now.getMonth() - 3)),
            '6m': () => start = new Date(now.setMonth(now.getMonth() - 6)),
            '1y': () => start = new Date(now.setFullYear(now.getFullYear() - 1)),
            custom: () => customStartDate && (start = new Date(customStartDate))
        };
        map[timeRange]();
        return netValues.filter(v => { const d = new Date(v.date); return d >= start && d <= end; });
    };

    // 加载净值数据（对齐 api.ts 接口）
    useEffect(() => {
        const hasIndex = selectedIndexIds.some(id => indexSeriesMap[id]);
        if (!selectedBenchmark && !selectedCompares.length && !hasIndex) {
            setChartProductList([]);
            return;
        }

        const loadData = async () => {
            setChartLoading(true);
            const list: ChartProductData[] = [];

            // 产品净值 -> ValidNetValue[]
            const toValid = (rs: ProductNetValue[]): ValidNetValue[] => (rs ?? [])
                .filter(r => r.net_value_date && r.cumulative_unit_net_value != null && !isNaN(+r.cumulative_unit_net_value))
                .map(r => ({ date: r.net_value_date.trim(), value: +r.cumulative_unit_net_value! }))
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            // 指数日 K -> ValidNetValue[]（用 close_price 当净值）
            const toValidIdx = (rs: BenchmarkNetValuePoint[]): ValidNetValue[] => (rs ?? [])
                .filter(r => r.net_value_date && r.close_price != null && !isNaN(+r.close_price))
                .map(r => ({ date: r.net_value_date.trim(), value: +r.close_price }))
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            const pushOrWarn = (label: string, entry: ChartProductData) => {
                if (entry.netValues.length >= 2) {
                    list.push(entry);
                } else {
                    console.warn(`[净值图] ${label} 在当前时间范围内有效数据点不足（${entry.netValues.length} 个），已跳过`);
                }
            };

            // 加载基准产品
            if (selectedBenchmark) {
                const res = await productApi.getNetValuesByProductId(selectedBenchmark.id);
                const nv = filterNetValuesByTime(toValid(res.results ?? []));
                pushOrWarn(selectedBenchmark.product_name || `产品${selectedBenchmark.id}`, {
                    id: selectedBenchmark.id,
                    name: selectedBenchmark.product_name || `产品${selectedBenchmark.id}`,
                    isBenchmark: true,
                    netValues: nv,
                    drawdownValues: calculateMaxDrawdown(nv),
                });
            }

            // 加载对比产品
            for (const p of selectedCompares) {
                const res = await productApi.getNetValuesByProductId(p.id);
                const nv = filterNetValuesByTime(toValid(res.results ?? []));
                pushOrWarn(p.product_name || `产品${p.id}`, {
                    id: p.id,
                    name: p.product_name || `产品${p.id}`,
                    isBenchmark: false,
                    netValues: nv,
                    drawdownValues: calculateMaxDrawdown(nv),
                });
            }

            // 加载基准指数（已经缓存到 indexSeriesMap）
            for (const id of selectedIndexIds) {
                const cached = indexSeriesMap[id];
                if (!cached) continue;
                const idx = benchmarks.find(b => b.id === id);
                const nv = filterNetValuesByTime(toValidIdx(cached));
                pushOrWarn(idx?.index_short_name || idx?.index_name || `指数#${id}`, {
                    id: -id, // 取负避免与产品 id 冲突
                    name: idx?.index_short_name || idx?.index_name || `指数#${id}`,
                    isBenchmark: true,
                    isIndex: true,
                    netValues: nv,
                    drawdownValues: calculateMaxDrawdown(nv),
                });
            }

            setChartProductList(list);
            setChartError(list.length ? null : '暂无有效数据');
            setChartLoading(false);
        };

        loadData().catch(() => {
            setChartError('数据加载失败');
            setChartLoading(false);
        });
    }, [selectedBenchmark, selectedCompares, selectedIndexIds, indexSeriesMap, timeRange, customStartDate, customEndDate, benchmarks]);

    // 计算产品指标
    useEffect(() => {
        setProductIndicators(generateProductIndicators(chartProductList));
    }, [chartProductList]);

    // 多 series 对齐起跳点：取各 series 首个有效日期中"最晚"的那个作为 T0；
    // 之前各自归一会让晚成立产品的周期差异被掩盖（短周期产品因起点小看起来涨得多）。
    const computeAlignT0 = (list: ChartProductData[]): string | undefined => {
        const starts = list
            .map(p => p.netValues.find(nv => nv.value > 0)?.date)
            .filter((d): d is string => !!d);
        if (starts.length < list.length || starts.length < 2) return undefined;
        return starts.reduce((a, b) => (a > b ? a : b));
    };

    // 图例/表格显示用：指数加 [指数]、基准产品加 [基准]
    const displayName = (p: ChartProductData | ProductIndicator): string => {
        if (p.isIndex) return `[指数] ${p.name}`;
        if (p.isBenchmark) return `[基准] ${p.name}`;
        return p.name;
    };

    // 渲染净值图表（归一化到起点=1，便于产品净值与指数点位同框对比）
    // 多 series 对比时，T0 = 各 series 最早数据日期中的最晚值（共同起跳点）；所有产品从 T0
    // 当天的值开始归一化，公平比较"如果同时持有"的相对表现，避免晚成立产品因周期短被高估。
    const renderNetValue = () => {
        if (!netValueChart.current || !chartProductList.length) return;
        const multi = chartProductList.length > 1;
        const alignT0 = multi ? computeAlignT0(chartProductList) : undefined;
        const series = chartProductList.map((p, i) => {
            const s = getSeriesStyle(p.isBenchmark, i);
            const visible = alignT0 ? p.netValues.filter(nv => nv.date >= alignT0) : p.netValues;
            const firstPositive = visible.find(nv => nv.value > 0);
            const base = firstPositive?.value || 1;
            const data = visible
                .filter(nv => nv.value > 0)
                .map(nv => [nv.date, parseFloat((nv.value / base).toFixed(4))]);
            return {
                name: displayName(p),
                type: 'line' as const,
                smooth: true,
                data,
                lineStyle: {
                    color: s.lineColor,
                    width: multi ? 2 : s.width,
                    type: s.lineType,
                    opacity: multi ? 0.85 : 1,
                },
                itemStyle: { color: s.itemColor },
                symbol: 'circle' as const,
                symbolSize: 5,
                showSymbol: false,
                emphasis: { focus: 'series' as const, lineStyle: { width: 3, opacity: 1 } },
                z: chartProductList.length - i,
                areaStyle: multi || p.isBenchmark ? undefined : {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: `${s.lineColor}20` },
                        { offset: 1, color: `${s.lineColor}00` }
                    ])
                }
            };
        });

        netValueChart.current.setOption({
            title: {
                text: '累计净值（归一化，起点=1）',
                subtext: alignT0 ? `多产品对比已对齐共同起跳日：${alignT0}` : undefined,
                left: 'center',
                textStyle: { fontSize: 16, fontWeight: 'bold' },
                subtextStyle: { fontSize: 12, color: '#6b7280' },
            },
            legend: { top: alignT0 ? 56 : 40, left: 'center' },
            tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => v == null ? '—' : Number(v).toFixed(4) } as never,
            grid: { left: '10%', right: '6%', bottom: '18%', top: alignT0 ? '22%' : '18%' },
            xAxis: { type: 'time', axisLabel: { rotate: 20 } },
            yAxis: { type: 'value', name: '相对净值', scale: true, axisLabel: { formatter: (v: number) => v.toFixed(3) } },
            dataZoom: [{ type: 'slider', bottom: 5 }, { type: 'inside' }],
            series
        } as Record<string, unknown>, true);
    };

    // 渲染收益率图表（同样对齐共同起跳点，从 T0 起累计）
    const renderReturn = () => {
        if (!returnChart.current || !chartProductList.length) return;
        const multi = chartProductList.length > 1;
        const alignT0 = multi ? computeAlignT0(chartProductList) : undefined;
        const series = chartProductList.map((p, i) => {
            const s = getSeriesStyle(p.isBenchmark, i);
            const visible = alignT0 ? p.netValues.filter(nv => nv.date >= alignT0) : p.netValues;
            const firstPositive = visible.find(nv => nv.value > 0);
            const base = firstPositive?.value || 1;
            const data = visible
                .filter(nv => nv.value > 0)
                .map(nv => [nv.date, parseFloat(((nv.value / base - 1) * 100).toFixed(2))]);
            return {
                name: displayName(p),
                type: 'line' as const,
                smooth: true,
                data,
                lineStyle: { color: s.lineColor, width: s.width, type: s.lineType },
                itemStyle: { color: s.itemColor },
                showSymbol: false,
                emphasis: { focus: 'series' as const },
            };
        });

        returnChart.current.setOption({
            title: {
                text: '收益率走势（%）',
                subtext: alignT0 ? `多产品对比已对齐共同起跳日：${alignT0}` : undefined,
                left: 'center',
                textStyle: { fontSize: 16, fontWeight: 'bold' },
                subtextStyle: { fontSize: 12, color: '#6b7280' },
            },
            legend: { top: alignT0 ? 56 : 40, left: 'center' },
            tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => v == null ? '—' : `${Number(v).toFixed(2)}%` } as never,
            grid: { left: '10%', right: '6%', bottom: '18%', top: alignT0 ? '22%' : '18%' },
            xAxis: { type: 'time', axisLabel: { rotate: 20 } },
            yAxis: { type: 'value', name: '收益率(%)' },
            dataZoom: [{ type: 'slider', bottom: 5 }, { type: 'inside' }],
            series
        } as Record<string, unknown>, true);
    };

    // 渲染回撤图表（同样改 time 轴 + [date, dd] 数据点）
    const renderDrawdown = () => {
        if (!drawdownChart.current || !chartProductList.length) return;
        const series = chartProductList.map((p, i) => {
            const s = getSeriesStyle(p.isBenchmark, i);
            const data = p.drawdownValues.map(d => [d.date, d.value]);
            return {
                name: displayName(p),
                type: 'line' as const,
                smooth: true,
                data,
                lineStyle: { color: s.lineColor, width: s.width, type: s.lineType },
                itemStyle: { color: s.itemColor },
                showSymbol: false,
                emphasis: { focus: 'series' as const },
            };
        });

        drawdownChart.current.setOption({
            title: { text: '最大回撤（%）', left: 'center', textStyle: { fontSize: 16, fontWeight: 'bold' } },
            legend: { top: 40, left: 'center' },
            tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => v == null ? '—' : `${Number(v).toFixed(2)}%` } as never,
            grid: { left: '10%', right: '6%', bottom: '18%', top: '18%' },
            xAxis: { type: 'time', axisLabel: { rotate: 20 } },
            yAxis: { type: 'value', name: '回撤(%)' },
            dataZoom: [{ type: 'slider', bottom: 5 }, { type: 'inside' }],
            series
        } as Record<string, unknown>, true);
    };

    // 渲染相关性矩阵（产品 + 基准指数全部参与；指数轴标签由 displayName 前缀 [指数] 区分）
    const renderCorrelation = () => {
        if (!corrChart.current) return;
        const all = chartProductList;
        if (all.length < 2) {
            corrChart.current.clear();
            return;
        }
        const names = all.map(displayName);
        const data: CorrelationDataPoint[] = [];

        for (let i = 0; i < names.length; i++) {
            for (let j = 0; j < names.length; j++) {
                if (i === j) {
                    data.push({
                        name: [names[j], names[i]],
                        value: [j, i, 1],
                        start: all[i].netValues[0]?.date || '',
                        end: all[i].netValues.at(-1)?.date || '',
                        count: all[i].netValues.length
                    });
                    continue;
                }
                const { corr, start, end, count } = calculateCorrelation(all[i].netValues, all[j].netValues);
                data.push({ name: [names[j], names[i]], value: [j, i, corr], start, end, count });
            }
        }

        corrChart.current.setOption({
            title: { text: '产品相关性矩阵', left: 'center', textStyle: { fontSize: 16, fontWeight: 'bold' } },
            tooltip: {
                padding: 10,
                formatter: (params: unknown) => {
                    const p = params as EChartsTooltipParam;
                    return p.data ? `${p.data.name[0]} ↔ ${p.data.name[1]}<br/>相关系数：${p.data.value[2].toFixed(4)}<br/>开始：${p.data.start}<br/>结束：${p.data.end}<br/>数据量：${p.data.count}` : '';
                }
            },
            grid: { top: 60, right: 50, bottom: 50, left: 100 },
            xAxis: { type: 'category', data: names, axisLabel: { rotate: 30, fontSize: 12 } },
            yAxis: { type: 'category', data: names, axisLabel: { fontSize: 12 } },
            visualMap: {
                min: -1, max: 1, calculable: true, orient: 'horizontal', left: 'center', bottom: 10,
                inRange: { color: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#ffffbf', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026'] }
            },
            series: [{
                name: '相关系数',
                type: 'heatmap',
                data,
                label: {
                    show: true, fontSize: 12,
                    formatter: (params: unknown) => ((params as { value: [number, number, number] }).value[2]).toFixed(2)
                },
                emphasis: { itemStyle: { borderWidth: 1, borderColor: '#333' } }
            }]
        } as Record<string, unknown>, true);
    };

    // 图表更新
    useEffect(() => {
        renderNetValue();
        renderReturn();
        renderDrawdown();
        renderCorrelation();
    }, [chartProductList]);

    // 交互方法
    const handleFilterChange = (k: keyof ProductFilterParams, v: string) => setFilters(f => ({ ...f, [k]: v }));
    const handleResetFilter = () => setFilters({ search: '', cycle: '', quant_type: '', algorithm: '', strategy: '', fof_own: '', custom: '' });
    const setBench = (p: Product) => { setSelectedCompares(prev => prev.filter(x => x.id !== p.id)); setSelectedBenchmark(p); };
    const toggleCompare = (p: Product) => p.id !== selectedBenchmark?.id && setSelectedCompares(prev =>
        prev.some(x => x.id === p.id) ? prev.filter(x => x.id !== p.id) : [...prev, p]
    );
    const remove = (p: Product, t: 'benchmark' | 'compare') =>
        t === 'benchmark' ? setSelectedBenchmark(null) : setSelectedCompares(prev => prev.filter(x => x.id !== p.id));

    const toggleIndex = (id: number) =>
        setSelectedIndexIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    const clearIndexes = () => setSelectedIndexIds([]);

    // 渲染 UI
    return (
        <div style={STYLES.container}>
            <h1 style={STYLES.title}>净值管理</h1>

            {/* 筛选栏 */}
            <div style={STYLES.filterCard}>
                <div style={STYLES.filterGrid}>
                    <div style={STYLES.filterItem}>
                        <label style={STYLES.filterLabel}>产品名称</label>
                        <input style={STYLES.filterInput} value={filters.search} onChange={e => handleFilterChange('search', e.target.value)} placeholder="搜索" />
                    </div>
                    <div style={STYLES.filterItem}>
                        <label style={STYLES.filterLabel}>周期</label>
                        {tagsLoading ? <div>加载中</div> : tagsError ? <div style={{ color: 'red' }}>{tagsError}</div> : (
                            <select style={STYLES.filterSelect} value={filters.cycle} onChange={e => handleFilterChange('cycle', e.target.value)}>
                                <option value="">全部</option>
                                {tags.cycles.map((c: CycleTag) => <option key={c.id} value={String(c.id)}>{c.cycle_name}</option>)}
                            </select>
                        )}
                    </div>
                    <div style={STYLES.filterItem}>
                        <label style={STYLES.filterLabel}>量化类型</label>
                        <select style={STYLES.filterSelect} value={filters.quant_type} onChange={e => handleFilterChange('quant_type', e.target.value)}>
                            <option value="">全部</option>
                            {tags.quantTypes.map((q: QuantType) => <option key={q.id} value={String(q.id)}>{q.quant_name}</option>)}
                        </select>
                    </div>
                    <div style={STYLES.filterItem}>
                        <label style={STYLES.filterLabel}>算法</label>
                        <select style={STYLES.filterSelect} value={filters.algorithm} onChange={e => handleFilterChange('algorithm', e.target.value)}>
                            <option value="">全部</option>
                            {tags.algorithms.map((a: AlgorithmType) => <option key={a.id} value={String(a.id)}>{a.alg_name}</option>)}
                        </select>
                    </div>
                    <div style={STYLES.filterItem}>
                        <label style={STYLES.filterLabel}>策略</label>
                        <select style={STYLES.filterSelect} value={filters.strategy} onChange={e => handleFilterChange('strategy', e.target.value)}>
                            <option value="">全部</option>
                            {tags.strategies.map((s: StrategyType) => <option key={s.id} value={String(s.id)}>{s.strategy_name}</option>)}
                        </select>
                    </div>
                    <div style={STYLES.filterItem}>
                        <label style={STYLES.filterLabel}>FOF归属</label>
                        <select style={STYLES.filterSelect} value={filters.fof_own} onChange={e => handleFilterChange('fof_own', e.target.value)}>
                            <option value="">全部</option>
                            {tags.fofOwnTags.map((f: FofOwnTag) => <option key={f.id} value={String(f.id)}>{f.fof_name}</option>)}
                        </select>
                    </div>
                    <div style={STYLES.filterItem}>
                        <label style={STYLES.filterLabel}>自定义标签</label>
                        <select style={STYLES.filterSelect} value={filters.custom} onChange={e => handleFilterChange('custom', e.target.value)}>
                            <option value="">全部</option>
                            {tags.customTags.map((t: CustomTag) => <option key={t.id} value={String(t.id)}>{t.tag_name}</option>)}
                        </select>
                    </div>
                    <div style={STYLES.filterItem}>
                        <label style={STYLES.filterLabel}>操作</label>
                        <button style={STYLES.resetBtn} onClick={handleResetFilter}>重置</button>
                    </div>
                </div>
            </div>

            {/* 产品选择区 */}
            <div style={STYLES.productArea}>
                <div style={STYLES.productListCard}>
                    {loading ? <div style={STYLES.placeholder}>加载中</div> :
                        productError ? <div style={{ ...STYLES.placeholder, color: 'red' }}>{productError}</div> :
                            filteredProducts.length === 0 ? <div style={STYLES.emptyText}>无产品</div> :
                                filteredProducts.map(p => {
                                    const isB = p.id === selectedBenchmark?.id;
                                    const isC = selectedCompares.some(x => x.id === p.id);
                                    return (
                                        <div key={p.id} style={{ ...STYLES.productListItem, ...(isB || isC ? STYLES.productListItemActive : {}) }}>
                                            <span>{p.product_name}</span>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <button onClick={() => setBench(p)} style={{
                                                    padding: '4px 8px', borderWidth: 1, borderStyle: 'solid', borderColor: isB ? '#3b82f6' : '#d1d5db',
                                                    borderRadius: 4, fontSize: 12, cursor: 'pointer', background: isB ? '#3b82f6' : '#fff', color: isB ? '#fff' : '#4b5563'
                                                }}>基准</button>
                                                <button onClick={() => toggleCompare(p)} disabled={isB} style={{
                                                    padding: '4px 8px', borderWidth: 1, borderStyle: 'solid', borderColor: isC ? '#10b981' : '#d1d5db',
                                                    borderRadius: 4, fontSize: 12, cursor: 'pointer', background: isC ? '#10b981' : '#fff', color: isC ? '#fff' : '#4b5563'
                                                }}>{isC ? '取消对比' : '对比'}</button>
                                            </div>
                                        </div>
                                    );
                                })}
                </div>

                {/* 已选产品 */}
                <div style={STYLES.selectedProductCard}>
                    <div style={STYLES.selectedBox}>
                        <div style={STYLES.selectedTitle}>基准产品</div>
                        <div style={STYLES.tagContainer}>
                            {selectedBenchmark ? (
                                <div style={{ ...STYLES.productTag, ...STYLES.benchmarkTag }}>
                                    {selectedBenchmark.product_name}
                                    <button style={STYLES.tagCloseBtn} onClick={() => remove(selectedBenchmark, 'benchmark')}>×</button>
                                </div>
                            ) : <span style={STYLES.emptyText}>未选择</span>}
                        </div>
                    </div>
                    <div style={STYLES.selectedBox}>
                        <div style={STYLES.selectedTitle}>对比产品</div>
                        <div style={STYLES.tagContainer}>
                            {selectedCompares.map(p => (
                                <div key={p.id} style={{ ...STYLES.productTag, ...STYLES.compareTag }}>
                                    {p.product_name}
                                    <button style={STYLES.tagCloseBtn} onClick={() => remove(p, 'compare')}>×</button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* 基准指数（市场指数对比） */}
            <div style={STYLES.filterCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>对比基准指数</div>
                    {selectedIndexIds.length > 0 && (
                        <button
                            onClick={clearIndexes}
                            style={{ fontSize: 12, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                            清空
                        </button>
                    )}
                </div>
                {benchmarks.length === 0 ? (
                    <div style={STYLES.emptyText}>暂无可选基准指数（请先在后端同步指数）</div>
                ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {benchmarks.map(b => {
                            const checked = selectedIndexIds.includes(b.id);
                            return (
                                <label
                                    key={b.id}
                                    style={{
                                        padding: '4px 10px',
                                        borderRadius: 16,
                                        fontSize: 12,
                                        cursor: 'pointer',
                                        borderWidth: 1,
                                        borderStyle: 'solid',
                                        borderColor: checked ? '#3b82f6' : '#d1d5db',
                                        background: checked ? '#eff6ff' : '#fff',
                                        color: checked ? '#1d4ed8' : '#4b5563',
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        style={{ display: 'none' }}
                                        checked={checked}
                                        onChange={() => toggleIndex(b.id)}
                                    />
                                    {b.index_short_name || b.index_name}
                                </label>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 时间筛选 */}
            <div style={STYLES.timeFilterBar}>
                {timeBtns.map(btn => (
                    <button key={btn.value} style={{ ...STYLES.timeBtn, ...(timeRange === btn.value ? STYLES.timeBtnActive : {}) }}
                            onClick={() => setTimeRange(btn.value as TimeRangeType)}>
                        {btn.label}
                    </button>
                ))}
                {timeRange === 'custom' && (
                    <>
                        <input style={STYLES.dateInput} type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} />
                        <span>~</span>
                        <input style={STYLES.dateInput} type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} />
                    </>
                )}
            </div>

            {/* 图表区域 */}
            <div style={STYLES.chartGrid}>
                <div style={STYLES.chartContainer}><div ref={netValueChartRef} style={STYLES.chartDom} />{(chartLoading || chartError || !chartProductList.length) && <div style={STYLES.placeholder}>{chartLoading ? '加载中' : chartError || '无数据'}</div>}</div>
                <div style={STYLES.chartContainer}><div ref={returnChartRef} style={STYLES.chartDom} />{(chartLoading || chartError || !chartProductList.length) && <div style={STYLES.placeholder}>{chartLoading ? '加载中' : chartError || '无数据'}</div>}</div>
                <div style={STYLES.chartContainer}><div ref={drawdownChartRef} style={STYLES.chartDom} />{(chartLoading || chartError || !chartProductList.length) && <div style={STYLES.placeholder}>{chartLoading ? '加载中' : chartError || '无数据'}</div>}</div>
                <div style={STYLES.chartContainer}><div ref={corrChartRef} style={STYLES.chartDom} />{(chartLoading || chartProductList.length < 2) && <div style={STYLES.placeholder}>{chartLoading ? '加载中' : '至少2个产品显示矩阵'}</div>}</div>
            </div>

            {/* 指标表格 */}
            {productIndicators.length > 0 && (
                <div style={{ ...STYLES.tableContainer, overflowX: 'auto' }}>
                    <div style={STYLES.tableTitle}>
                        产品指标汇总
                        <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 400, marginLeft: 8 }}>
                            （无风险利率 {(DEFAULT_RISK_FREE * 100).toFixed(1)}%，年化按 252 交易日）
                        </span>
                    </div>
                    <table style={STYLES.table}>
                        <thead>
                        <tr>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>名称</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>近一周</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>近一月</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>近三月</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>近一年</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>YTD</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>累计收益</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>年化收益</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>最大回撤</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>年化波动</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>夏普</th>
                        </tr>
                        </thead>
                        <tbody>
                        {productIndicators.map((item, i) => {
                            const b = item.bundle;
                            return (
                                <tr key={i} style={item.isBenchmark ? STYLES.benchmarkRow : undefined}>
                                    <td style={STYLES.tableCell}>{displayName(item)}</td>
                                    <td style={{ ...STYLES.tableCell, ...returnTextStyle(b.r1w) }}>{fmtPct(b.r1w)}</td>
                                    <td style={{ ...STYLES.tableCell, ...returnTextStyle(b.r1m) }}>{fmtPct(b.r1m)}</td>
                                    <td style={{ ...STYLES.tableCell, ...returnTextStyle(b.r3m) }}>{fmtPct(b.r3m)}</td>
                                    <td style={{ ...STYLES.tableCell, ...returnTextStyle(b.r1y) }}>{fmtPct(b.r1y)}</td>
                                    <td style={{ ...STYLES.tableCell, ...returnTextStyle(b.rYtd) }}>{fmtPct(b.rYtd)}</td>
                                    <td style={{ ...STYLES.tableCell, ...returnTextStyle(b.totalReturn) }}>{fmtPct(b.totalReturn)}</td>
                                    <td style={{ ...STYLES.tableCell, ...returnTextStyle(b.annRet) }}>{fmtPct(b.annRet)}</td>
                                    <td style={STYLES.tableCell}>{fmtPct(b.mdd)}</td>
                                    <td style={STYLES.tableCell}>{fmtPct(b.annVol)}</td>
                                    <td style={STYLES.tableCell}>{fmtNum(b.sharpe)}</td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}