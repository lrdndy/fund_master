'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import * as echarts from 'echarts';
import { useBasket } from '@/contexts/BasketContext';
import type { CSSProperties } from 'react';
import { productApi, benchmarkApi } from '@/lib/api';
import useProductTags from '@/hooks/useProductTags';
import {
    computeBundle,
    normalizePoints,
    calculateCorrelation,
    DEFAULT_RISK_FREE,
    MetricBundle,
    MetricPoint,
    findAtOrBefore,
    findAtOrAfter,
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
    id: number;
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
        id: item.id,
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

/** 数值下方灰色小字 */
function SubLabel({ text }: { text: string | null }) {
    return text ? <div style={{ fontSize: 10, color: '#9ca3af', lineHeight: 1.3, marginTop: 1 }}>{text}</div> : null;
}

const returnTextStyle = (n: number | null): CSSProperties => {
    if (n === null || n === undefined || Number.isNaN(n)) return { color: '#9ca3af' };
    if (n > 0) return { color: '#dc2626' };
    if (n < 0) return { color: '#16a34a' };
    return { color: '#1f2937' };
};

// 周期指标对应天数
const PERIOD_DAYS: Record<string, number> = {
    r1w: 7, r1m: 30, r3m: 90, r1y: 365,
};

// 计算某个期间的实际数据起止日期
function periodDateRange(points: MetricPoint[], daysAgo: number): { start: string; end: string } | null {
    if (points.length < 2) return null;
    const latest = points[points.length - 1];
    const target = new Date(latest.date.getTime() - daysAgo * 86400000);
    const prev = findAtOrBefore(points, target);
    if (!prev || prev.dateStr === latest.dateStr) return null;
    return { start: prev.dateStr, end: latest.dateStr };
}

function ytdDateRange(points: MetricPoint[]): { start: string; end: string } | null {
    if (points.length < 2) return null;
    const latest = points[points.length - 1];
    const yearStart = new Date(latest.date.getFullYear(), 0, 1);
    const prev = findAtOrAfter(points, yearStart);
    if (!prev || prev.dateStr === latest.dateStr) return null;
    return { start: prev.dateStr, end: latest.dateStr };
}

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
    const {
        baskets, currentBaskets, currentBasketIds, toggleBasket, clearBasketSelection,
        combinedProductIds, combinedIndexIds,
        loading: basketLoading,
    } = useBasket();
    const initedRef = useRef(false);

    // 状态
    const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
    const [selectedBenchmark, setSelectedBenchmark] = useState<Product | null>(null);
    const [selectedCompares, setSelectedCompares] = useState<Product[]>([]);
    const [chartProductList, setChartProductList] = useState<ChartProductData[]>([]);
    const [loading, setLoading] = useState(true);
    const [chartLoading, setChartLoading] = useState(false);
    const [productError, setProductError] = useState<string | null>(null);
    const [chartError, setChartError] = useState<string | null>(null);
    // productIndicators 改为派生（避免 useEffect 内同步 setState 违反 react-hooks/set-state-in-effect）
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
    // 超额收益：叠加到净值图和收益率图（次坐标轴虚线）；basis 用某条 series 的 id 作基准
    const [showExcess, setShowExcess] = useState(false);
    const [excessOnly, setExcessOnly] = useState(false); // 只看超额：隐藏主线，仅画超额次轴
    // excessBaseId 已废弃：超额线改为'每个产品 × 每个基准'自动展开，不再需要单选一个 base
    const [showExcessOnly, setShowExcessOnly] = useState(false);
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
    // 初次进入页面预填：
    // - localStorage 里有'本页选中记录' → 优先恢复（用户在本页主动选过的不被覆盖）
    // - 否则若当前篮子（侧边栏选中）有内容 → 用篮子产品的第 1 个当基准、其余当对比预填
    // - 都没有就保持空（让用户自行选）
    useEffect(() => {
        if (initedRef.current || basketLoading) return;
        initedRef.current = true;
        const initProducts = async () => {
            try {
                // 一次拉全库（page_size=2000）作产品选择器；用 lite=1 走精简序列化器
                // （无 return_1m / 标签嵌套），避免后端 N+1，payload 也小很多
                const res = await productApi.getProducts({ page_size: '2000', lite: '1' });
                const prods = res.results ?? [];
                setFilteredProducts(prods);
                if (!prods.length) return;

                const bId = localStorage.getItem(STORAGE_KEYS.BENCHMARK_ID);
                const cIds = localStorage.getItem(STORAGE_KEYS.COMPARE_IDS);
                let bench: Product | null = bId ? prods.find(p => p.id === +bId) ?? null : null;
                let comps: Product[] = [];
                if (cIds) try { comps = prods.filter(p => JSON.parse(cIds).includes(p.id)); } catch {}

                // 篮子预填：仅在两个 key 都没存（即用户从未在本页主动选过）时生效；
                // 多选篮子合并的产品全部进入'对比'区，不预占基准位
                if (!bId && !cIds && combinedProductIds.length > 0) {
                    const basketProds = prods.filter(p => combinedProductIds.includes(p.id));
                    if (basketProds.length > 0) {
                        bench = null;
                        comps = basketProds;
                    }
                }

                setSelectedBenchmark(bench);
                setSelectedCompares(comps);
            } catch {
                setProductError('产品加载失败');
            }
        };
        void initProducts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [basketLoading]);

    // 产品筛选（类型完全匹配）
    useEffect(() => {
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) as Record<string, string>;
                params.page_size = '2000'; // 让 picker 看到全库；否则默认 20 条会让篮子产品不在列表里
                params.lite = '1';          // 精简序列化，避免 return_1m 的 N+1
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

    // 加载基准指数列表 + 恢复上次选中（无则用篮子预填）
    useEffect(() => {
        const loadBenchmarks = async () => {
            try {
                const res = await benchmarkApi.getBenchmarks();
                setBenchmarks(res.results ?? []);
                const valid = (res.results ?? []).map(b => b.id);
                const stored = localStorage.getItem(STORAGE_KEYS.INDEX_IDS);
                if (stored) {
                    try {
                        const ids = JSON.parse(stored) as number[];
                        setSelectedIndexIds(ids.filter(id => valid.includes(id)));
                    } catch {}
                } else if (combinedIndexIds.length > 0) {
                    // 用户没在本页选过 → 用合并篮子的基准预填
                    setSelectedIndexIds(combinedIndexIds.filter(id => valid.includes(id)));
                }
            } catch (err) {
                console.error('加载基准指数失败', err);
            }
        };
        // 等 BasketProvider 完成加载再拉，否则上面的篮子预填分支拿到的 currentBasket=null
        if (!basketLoading) void loadBenchmarks();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [basketLoading]);

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
            // 推到 microtask 避免 effect 内同步 setState 触发 react-hooks/set-state-in-effect
            void Promise.resolve().then(() => setChartProductList([]));
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

    // 计算产品指标（派生于 chartProductList，避免 effect 内 setState）
    const productIndicators = useMemo(
        () => generateProductIndicators(chartProductList),
        [chartProductList],
    );

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

        const { excessSeries, baseName } = buildExcessSeries(alignT0);
        const mainSeries = (!showExcessOnly || !excessSeries.length) ? series : [];
        const activeExcessSeries = showExcessOnly
            ? excessSeries.map(s => ({ ...s, yAxisIndex: 0 }))
            : excessSeries;
        const sub = [
            alignT0 ? `对齐共同起跳日：${alignT0}` : '',
            activeExcessSeries.length ? `超额基准：${baseName}（右轴虚线）` : '',
        ].filter(Boolean).join('　·　');

        netValueChart.current.setOption({
            title: {
                text: showExcessOnly ? '超额收益走势' : '累计净值（归一化，起点=1）',
                subtext: sub || undefined,
                left: 'center',
                textStyle: { fontSize: 16, fontWeight: 'bold' },
                subtextStyle: { fontSize: 12, color: '#6b7280' },
            },
            legend: { top: sub ? 56 : 40, left: 'center' },
            tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => v == null ? '—' : Number(v).toFixed(4) } as never,
            grid: { left: '10%', right: excessSeries.length ? '10%' : '6%', bottom: '18%', top: sub ? '22%' : '18%' },
            xAxis: { type: 'time', axisLabel: { rotate: 20 } },
            yAxis: activeExcessSeries.length
                ? (showExcessOnly
                    ? { type: 'value', name: '超额%', scale: true, axisLabel: { formatter: (v: number) => `${v.toFixed(2)}%` } }
                    : [{ type: 'value', name: '相对净值', scale: true, axisLabel: { formatter: (v: number) => v.toFixed(3) } }, excessYAxis()])
                : { type: 'value', name: '相对净值', scale: true, axisLabel: { formatter: (v: number) => v.toFixed(3) } },
            dataZoom: [{ type: 'slider', bottom: 5 }, { type: 'inside' }],
            series: [...mainSeries, ...activeExcessSeries],
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

        const { excessSeries, baseName } = buildExcessSeries(alignT0);
        const mainSeries = (!showExcessOnly || !excessSeries.length) ? series : [];
        const activeExcessSeries = showExcessOnly
            ? excessSeries.map(s => ({ ...s, yAxisIndex: 0 }))
            : excessSeries;
        const sub = [
            alignT0 ? `对齐共同起跳日：${alignT0}` : '',
            activeExcessSeries.length ? `超额基准：${baseName}（右轴虚线）` : '',
        ].filter(Boolean).join('　·　');

        returnChart.current.setOption({
            title: {
                text: showExcessOnly ? '超额收益走势（%）' : '收益率走势（%）',
                subtext: sub || undefined,
                left: 'center',
                textStyle: { fontSize: 16, fontWeight: 'bold' },
                subtextStyle: { fontSize: 12, color: '#6b7280' },
            },
            legend: { top: sub ? 56 : 40, left: 'center' },
            tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => v == null ? '—' : `${Number(v).toFixed(2)}%` } as never,
            grid: { left: '10%', right: activeExcessSeries.length ? '10%' : '6%', bottom: '18%', top: sub ? '22%' : '18%' },
            xAxis: { type: 'time', axisLabel: { rotate: 20 } },
            yAxis: activeExcessSeries.length
                ? (showExcessOnly
                    ? { type: 'value', name: '超额%', scale: true, axisLabel: { formatter: (v: number) => `${v.toFixed(2)}%` } }
                    : [{ type: 'value', name: '收益率(%)' }, excessYAxis()])
                : { type: 'value', name: '收益率(%)' },
            dataZoom: [{ type: 'slider', bottom: 5 }, { type: 'inside' }],
            series: [...mainSeries, ...activeExcessSeries],
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

    // 计算超额收益 series（叠加到净值/收益率图，用次坐标轴 yAxisIndex=1）。
    // 超额(t) = 归一化产品(t) - 归一化基准(t)（都以共同起跳点 T0 归一为 1），乘 100 转 %。
    // 返回 { excessSeries, baseName }；showExcess 关或不足 2 条时返回空。
    const buildExcessSeries = (alignT0: string | undefined) => {
        if (!showExcess || chartProductList.length < 2) return { excessSeries: [] as Record<string, unknown>[], baseName: '' };

        // 区分：基准 = isBenchmark / isIndex；产品 = 既不是 isBenchmark 也不是 isIndex 的 series
        const bases = chartProductList.filter(p => p.isBenchmark || p.isIndex);
        const products = chartProductList.filter(p => !p.isBenchmark && !p.isIndex);
        if (bases.length === 0 || products.length === 0) {
            return { excessSeries: [], baseName: '（缺少产品或基准）' };
        }

        // 对每个产品 × 每个基准画一条超额线；用 displayName 命名，让图例能区分
        const excessSeries: Record<string, unknown>[] = [];
        let seriesIdx = 0;
        for (const base of bases) {
            const baseVisible = alignT0 ? base.netValues.filter(nv => nv.date >= alignT0) : base.netValues;
            const baseStart = baseVisible.find(nv => nv.value > 0)?.value || 1;
            const baseMap = new Map(baseVisible.filter(nv => nv.value > 0).map(nv => [nv.date, nv.value / baseStart]));

            for (const p of products) {
                const s = getSeriesStyle(false, seriesIdx++);
                const visible = alignT0 ? p.netValues.filter(nv => nv.date >= alignT0) : p.netValues;
                const pStart = visible.find(nv => nv.value > 0)?.value || 1;
                const data = visible
                    .filter(nv => nv.value > 0 && baseMap.has(nv.date))
                    .map(nv => [nv.date, parseFloat((((nv.value / pStart) - baseMap.get(nv.date)!) * 100).toFixed(2))]);
                excessSeries.push({
                    name: `${displayName(p)} vs ${displayName(base)}`,
                    type: 'line' as const,
                    yAxisIndex: excessOnly ? 0 : 1,
                    smooth: true,
                    data,
                    lineStyle: { color: s.lineColor, width: excessOnly ? 2 : 1.5, type: (excessOnly ? 'solid' : 'dashed') as 'solid' | 'dashed', opacity: 0.9 },
                    itemStyle: { color: s.itemColor },
                    showSymbol: false,
                    emphasis: { focus: 'series' as const },
                });
            }
        }
        // 文案：base name 显示所有基准名（标题副标用），多个用顿号连接
        const baseName = bases.length === 1 ? displayName(bases[0]) : bases.map(displayName).join('、');
        return { excessSeries, baseName };
    };

    // 超额次坐标轴定义（右侧，% 单位 + 0 线）
    const excessYAxis = () => ({
        type: 'value' as const, name: '超额%', position: 'right' as const, scale: true,
        axisLabel: { formatter: (v: number) => `${v.toFixed(1)}` },
        splitLine: { show: false },
    });

    // 图表更新
    useEffect(() => {
        renderNetValue();
        renderReturn();
        renderDrawdown();
        renderCorrelation();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chartProductList, showExcess, showExcessOnly]);

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

    // 应用篮子（多选合并后的产品/基准）：默认不预选基准，篮子里的产品全部放进'对比产品'，
    // 让用户在 UI 里自行决定谁作基准；篮子里的指数全部进入对比基准指数；
    // 之后用户仍可继续追加非篮子的对象
    const applyBasket = () => {
        if (combinedProductIds.length === 0 && combinedIndexIds.length === 0) return;
        const basketProds = filteredProducts.filter(p => combinedProductIds.includes(p.id));
        setSelectedBenchmark(null);
        setSelectedCompares(basketProds);
        const validIdx = benchmarks.map(b => b.id);
        setSelectedIndexIds(combinedIndexIds.filter(id => validIdx.includes(id)));
    };

    // 一键清空已选（基准产品 + 对比产品 + 基准指数全清）
    const clearAllSelected = () => {
        setSelectedBenchmark(null);
        setSelectedCompares([]);
        setSelectedIndexIds([]);
    };

    // 从 URL ?custom=<tag_id> 进入时，拉该自定义标签下的产品全部塞进'对比'；
    // 触发场景：标签页面 /admin/tags 里点某个自定义标签条目跳过来
    const searchParams = useSearchParams();
    const customTagParam = searchParams?.get('custom') ?? '';
    useEffect(() => {
        if (!customTagParam) return;
        let cancelled = false;
        void (async () => {
            try {
                const res = await productApi.getProducts({
                    custom: customTagParam, page_size: '2000', lite: '1',
                });
                if (cancelled) return;
                const list = res.results ?? [];
                setSelectedBenchmark(null);
                setSelectedCompares(list);
                // 基准指数保持原状（用户可能已选了对比基准）
            } catch (e) {
                console.error('拉取标签产品失败', e);
            }
        })();
        return () => { cancelled = true; };
    }, [customTagParam]);

    // 渲染 UI
    return (
        <div style={STYLES.container}>
            <h1 style={STYLES.title}>产品对比</h1>

            {/* 筛选栏：第一行 = 产品名/周期/量化/算法/策略/FOF，第二行 = 自定义标签（最常用，单独占首位）+ 操作 */}
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
                    {/* 第二行：自定义标签放最前（常用维度），紧跟操作按钮 */}
                    <div style={{ ...STYLES.filterItem, gridColumnStart: 1 }}>
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

            {/* 应用篮子条（多选） */}
            <div style={{
                display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10,
                background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8,
                padding: '10px 14px', marginBottom: 16,
            }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>🧺 篮子</span>
                {baskets.length === 0 ? (
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>暂无篮子，在侧边栏新建</span>
                ) : (
                    baskets.map(b => {
                        const active = currentBasketIds.includes(b.id);
                        return (
                            <label
                                key={b.id}
                                style={{
                                    padding: '3px 10px', borderRadius: 14, fontSize: 12, cursor: 'pointer',
                                    border: `1px solid ${active ? '#3b82f6' : '#d1d5db'}`,
                                    background: active ? '#eff6ff' : '#fff',
                                    color: active ? '#1d4ed8' : '#4b5563',
                                }}
                            >
                                <input type="checkbox" style={{ display: 'none' }} checked={active} onChange={() => toggleBasket(b.id)} />
                                {b.name}
                            </label>
                        );
                    })
                )}
                {currentBasketIds.length > 0 && (
                    <button type="button" onClick={clearBasketSelection}
                        style={{ fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                        清空
                    </button>
                )}
                <button
                    type="button"
                    onClick={applyBasket}
                    disabled={currentBaskets.length === 0}
                    style={{
                        padding: '4px 12px', fontSize: 13, borderRadius: 4,
                        background: currentBaskets.length > 0 ? '#3b82f6' : '#e5e7eb',
                        color: currentBaskets.length > 0 ? '#fff' : '#9ca3af',
                        border: 'none', cursor: currentBaskets.length > 0 ? 'pointer' : 'not-allowed',
                        marginLeft: 'auto',
                    }}
                >
                    应用到本页（{currentBaskets.length > 1 ? `合并 ${currentBaskets.length} 个篮子，` : ''}替换已选）
                </button>
                <button
                    type="button"
                    onClick={clearAllSelected}
                    disabled={!selectedBenchmark && selectedCompares.length === 0 && selectedIndexIds.length === 0}
                    title="清空当前已选的基准产品 / 对比产品 / 基准指数"
                    style={{
                        padding: '4px 12px', fontSize: 13, borderRadius: 4,
                        background: '#fff',
                        color: (!selectedBenchmark && selectedCompares.length === 0 && selectedIndexIds.length === 0) ? '#d1d5db' : '#dc2626',
                        border: '1px solid',
                        borderColor: (!selectedBenchmark && selectedCompares.length === 0 && selectedIndexIds.length === 0) ? '#e5e7eb' : '#fecaca',
                        cursor: (!selectedBenchmark && selectedCompares.length === 0 && selectedIndexIds.length === 0) ? 'not-allowed' : 'pointer',
                    }}
                >
                    清空对比产品
                </button>
                <span style={{ fontSize: 11, color: '#6b7280', width: '100%' }}>
                    可多选；多个篮子的产品/基准会去重合并。应用后仍可在下方产品列表 / 基准指数区继续追加非篮子的对象
                </span>
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
                                    const inBasket = combinedProductIds.includes(p.id);
                                    return (
                                        <div
                                            key={p.id}
                                            style={{
                                                ...STYLES.productListItem,
                                                ...(isB || isC ? STYLES.productListItemActive : {}),
                                                // 用 inset boxShadow 模拟左条，避免与 STYLES.productListItem 的
                                                // borderStyle/borderWidth 简写/非简写冲突（React 警告）
                                                ...(inBasket && !isB && !isC ? { background: '#fffbeb', boxShadow: 'inset 3px 0 0 0 #f59e0b' } : {}),
                                            }}
                                        >
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {p.product_name}
                                                {inBasket && <span title="该产品在当前选中的篮子里" style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: '#fef3c7', color: '#92400e' }}>🧺</span>}
                                            </span>
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
            {/* 图表叠加控制：超额收益（相对基准）可叠加到累计净值图和收益率图 */}
            {chartProductList.length >= 2 && (
                <div style={{
                    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10,
                    background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8,
                    padding: '8px 14px', marginBottom: 12,
                }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                        <input type="checkbox" checked={showExcess} onChange={e => setShowExcess(e.target.checked)} />
                        在净值/收益率图上叠加「超额收益」（相对基准的差值，次坐标轴虚线）
                    </label>
                    {showExcess && (
                        <span style={{ fontSize: 12, color: '#6b7280' }}>
                            （已选每个产品 × 每个基准画一条超额线，多基准时自动展开）
                        </span>
                    )}
                    {showExcess && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', cursor: 'pointer', marginLeft: 'auto' }}>
                            <input type="checkbox" checked={showExcessOnly} onChange={e => setShowExcessOnly(e.target.checked)} />
                            仅显示超额曲线
                        </label>
                    )}
                </div>
            )}

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
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>单位净值</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>累计净值</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>近1周</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>近1周超额</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>近1月</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>近1月超额</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>近三月</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>近1年</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>近1年超额</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>YTD</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>YTD超额</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>累计收益</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>年化收益</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>最大回撤</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>最大回撤超额</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>年化波动</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>夏普</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>夏普超额</th>
                            <th style={{ ...STYLES.tableCell, ...STYLES.tableHeader }}>备注</th>
                        </tr>
                        </thead>
                        <tbody>
                        {productIndicators.map((item, i) => {
                            const b = item.bundle;
                            const pts = normalizePoints(chartProductList[i]?.netValues ?? []);
                            const s = (days: number) => {
                                const r = periodDateRange(pts, days);
                                return r ? `${r.start} ~ ${r.end}` : null;
                            };
                            const ytd = ytdDateRange(pts);
                            const overall = pts.length >= 2 ? `${pts[0].dateStr} ~ ${pts[pts.length - 1].dateStr}` : null;
                            const cellSub = (key: string) => {
                                if (key in PERIOD_DAYS) return s(PERIOD_DAYS[key]);
                                if (key === 'rYtd') return ytd ? `${ytd.start} ~ ${ytd.end}` : null;
                                return overall;
                            };

                            // 超额基准：第一个非指数基准产品
                            const chartItem = chartProductList[i];
                            const baseItem = chartProductList.find(p => p.isBenchmark && !p.isIndex)
                                ?? chartProductList.find(p => !p.isIndex && p.id !== chartItem?.id)
                                ?? chartProductList.find(p => p.isBenchmark);

                            // 算超额指标（与基准对齐）
                            function calcExcess(key: string): number | null {
                                if (!chartItem || !baseItem || baseItem.id === chartItem.id || chartItem.isBenchmark) return null;
                                const alT0 = chartProductList.length > 1 ? computeAlignT0(chartProductList) : undefined;
                                const iVis = alT0 ? chartItem.netValues.filter(nv => nv.date >= alT0) : chartItem.netValues;
                                const bVis = alT0 ? baseItem.netValues.filter(nv => nv.date >= alT0) : baseItem.netValues;
                                const iStart = iVis.find(nv => nv.value > 0)?.value || 1;
                                const bStart = bVis.find(nv => nv.value > 0)?.value || 1;
                                const bNorm = new Map(bVis.filter(nv => nv.value > 0).map(nv => [nv.date, nv.value / bStart]));
                                let excessPts = iVis
                                    .filter(nv => nv.value > 0 && bNorm.has(nv.date))
                                    .map(nv => ({ date: nv.date, value: (nv.value / iStart) - bNorm.get(nv.date)! }));
                                if (excessPts.length < 2) return null;

                                if (key === 'mdd') {
                                    let peak = 0, mdd = 0;
                                    for (const ep of excessPts) { if (ep.value > peak) peak = ep.value; const dd = (peak - ep.value) / (peak || 1); if (dd > mdd) mdd = dd; }
                                    return -mdd;
                                }
                                if (key === 'totalReturn') return excessPts[excessPts.length - 1].value - excessPts[0].value;
                                // period returns
                                const latestPt = excessPts[excessPts.length - 1];
                                const target = new Date(new Date(latestPt.date).getTime() - PERIOD_DAYS[key] * 86400000);
                                const prev = [...excessPts].reverse().find(p => new Date(p.date).getTime() <= target.getTime());
                                if (!prev || prev.date === latestPt.date) return null;
                                return (latestPt.value - prev.value) / Math.abs(prev.value || 1);
                            }

                            // 最新净值
                            const lastRaw = chartItem?.netValues[chartItem.netValues.length - 1] ?? null;

                            return (
                                <tr key={i} style={item.isBenchmark ? STYLES.benchmarkRow : undefined}>
                                    <td style={STYLES.tableCell}>
                                        {item.isIndex || item.id <= 0
                                            ? displayName(item)
                                            : <a href={`/products/${item.id}`} target="_blank" rel="noopener noreferrer"
                                                  style={{ color: 'inherit', textDecoration: 'none' }}>{displayName(item)}</a>
                                        }
                                    </td>
                                    <td style={STYLES.tableCell}>
                                        {lastRaw ? lastRaw.value.toFixed(4) : '—'}
                                    </td>
                                    <td style={STYLES.tableCell}>
                                        {lastRaw ? lastRaw.value.toFixed(4) : '—'}
                                    </td>
                                    <td style={{ ...STYLES.tableCell, ...returnTextStyle(b.r1w) }}>
                                        {fmtPct(b.r1w)}<SubLabel text={cellSub('r1w')} />
                                    </td>
                                    <td style={{ ...STYLES.tableCell, ...returnTextStyle(calcExcess('r1w')) }}>
                                        {!chartItem?.isBenchmark && !chartItem?.isIndex ? fmtPct(calcExcess('r1w')) : '—'}
                                        <SubLabel text={!chartItem?.isBenchmark && !chartItem?.isIndex ? cellSub('r1w') : null} />
                                    </td>
                                    <td style={{ ...STYLES.tableCell, ...returnTextStyle(b.r1m) }}>
                                        {fmtPct(b.r1m)}<SubLabel text={cellSub('r1m')} />
                                    </td>
                                    <td style={{ ...STYLES.tableCell, ...returnTextStyle(calcExcess('r1m')) }}>
                                        {!chartItem?.isBenchmark && !chartItem?.isIndex ? fmtPct(calcExcess('r1m')) : '—'}
                                        <SubLabel text={!chartItem?.isBenchmark && !chartItem?.isIndex ? cellSub('r1m') : null} />
                                    </td>
                                    <td style={{ ...STYLES.tableCell, ...returnTextStyle(b.r3m) }}>
                                        {fmtPct(b.r3m)}<SubLabel text={cellSub('r3m')} />
                                    </td>
                                    <td style={{ ...STYLES.tableCell, ...returnTextStyle(b.r1y) }}>
                                        {fmtPct(b.r1y)}<SubLabel text={cellSub('r1y')} />
                                    </td>
                                    <td style={{ ...STYLES.tableCell, ...returnTextStyle(calcExcess('r1y')) }}>
                                        {!chartItem?.isBenchmark && !chartItem?.isIndex ? fmtPct(calcExcess('r1y')) : '—'}
                                        <SubLabel text={!chartItem?.isBenchmark && !chartItem?.isIndex ? cellSub('r1y') : null} />
                                    </td>
                                    <td style={{ ...STYLES.tableCell, ...returnTextStyle(b.rYtd) }}>
                                        {fmtPct(b.rYtd)}<SubLabel text={cellSub('rYtd')} />
                                    </td>
                                    <td style={{ ...STYLES.tableCell, ...returnTextStyle(calcExcess('rYtd')) }}>
                                        {!chartItem?.isBenchmark && !chartItem?.isIndex ? fmtPct(calcExcess('rYtd')) : '—'}
                                        <SubLabel text={!chartItem?.isBenchmark && !chartItem?.isIndex ? cellSub('rYtd') : null} />
                                    </td>
                                    <td style={{ ...STYLES.tableCell, ...returnTextStyle(b.totalReturn) }}>
                                        {fmtPct(b.totalReturn)}<SubLabel text={cellSub('totalReturn')} />
                                    </td>
                                    <td style={{ ...STYLES.tableCell, ...returnTextStyle(b.annRet) }}>
                                        {fmtPct(b.annRet)}<SubLabel text={cellSub('annRet')} />
                                    </td>
                                    <td style={STYLES.tableCell}>
                                        {fmtPct(b.mdd)}<SubLabel text={cellSub('mdd')} />
                                    </td>
                                    <td style={{ ...STYLES.tableCell, ...returnTextStyle(calcExcess('mdd')) }}>
                                        {!chartItem?.isBenchmark && !chartItem?.isIndex ? fmtPct(calcExcess('mdd')) : '—'}
                                        <SubLabel text={!chartItem?.isBenchmark && !chartItem?.isIndex ? overall : null} />
                                    </td>
                                    <td style={STYLES.tableCell}>
                                        {fmtPct(b.annVol)}<SubLabel text={cellSub('annVol')} />
                                    </td>
                                    <td style={STYLES.tableCell}>
                                        {fmtNum(b.sharpe)}<SubLabel text={cellSub('sharpe')} />
                                    </td>
                                    <td style={{ ...STYLES.tableCell, ...returnTextStyle(calcExcess('sharpe')) }}>
                                        {!chartItem?.isBenchmark && !chartItem?.isIndex ? fmtNum(calcExcess('sharpe')) : '—'}
                                        <SubLabel text={!chartItem?.isBenchmark && !chartItem?.isIndex ? overall : null} />
                                    </td>
                                    <td style={STYLES.tableCell}>{/* 备注占位 */}</td>
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