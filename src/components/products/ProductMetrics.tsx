'use client';

import { useMemo } from 'react';
import { ProductNetValue } from '@/lib/types';

export interface NamedSeries {
    name: string;
    points: Array<{ date: string; value: number }>;
}

interface ProductMetricsProps {
    netValues: ProductNetValue[];
    rangeStart?: string;
    rangeEnd?: string;
    riskFreeRate?: number; // 年化无风险利率，默认 0.025
    /** 对比基准的净值序列，传入后会在底部渲染'产品 vs 基准'对比表 */
    benchmarkSeries?: NamedSeries[];
}

interface NormalizedPoint {
    date: Date;
    dateStr: string;
    value: number;
}

const TRADING_DAYS_PER_YEAR = 252;
const DEFAULT_RISK_FREE = 0.025;

// ===== 通用计算辅助 =====

function normalizeNetValues(netValues: ProductNetValue[]): NormalizedPoint[] {
    return netValues
        .filter(nv => nv.is_valid !== false)
        .map(nv => {
            if (!nv.net_value_date) return null;
            const cum = nv.cumulative_unit_net_value;
            if (cum === null || cum === undefined) return null;
            const num = typeof cum === 'number' ? cum : parseFloat(String(cum));
            if (Number.isNaN(num) || num <= 0) return null;
            const d = new Date(nv.net_value_date);
            if (Number.isNaN(d.getTime())) return null;
            return { date: d, dateStr: nv.net_value_date, value: num };
        })
        .filter((x): x is NormalizedPoint => x !== null)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
}

function normalizeNamedSeries(s: NamedSeries): NormalizedPoint[] {
    return s.points
        .map(p => {
            const num = typeof p.value === 'number' ? p.value : parseFloat(String(p.value));
            if (!p.date || Number.isNaN(num) || num <= 0) return null;
            const d = new Date(p.date);
            if (Number.isNaN(d.getTime())) return null;
            return { date: d, dateStr: p.date, value: num };
        })
        .filter((x): x is NormalizedPoint => x !== null)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
}

function findAtOrBefore(points: NormalizedPoint[], target: Date): NormalizedPoint | null {
    let lo = 0, hi = points.length - 1, ans = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (points[mid].date.getTime() <= target.getTime()) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return ans >= 0 ? points[ans] : null;
}

function findAtOrAfter(points: NormalizedPoint[], target: Date): NormalizedPoint | null {
    let lo = 0, hi = points.length - 1, ans = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (points[mid].date.getTime() >= target.getTime()) {
            ans = mid;
            hi = mid - 1;
        } else {
            lo = mid + 1;
        }
    }
    return ans >= 0 ? points[ans] : null;
}

function periodReturn(points: NormalizedPoint[], daysAgo: number): number | null {
    if (points.length < 2) return null;
    const latest = points[points.length - 1];
    const target = new Date(latest.date.getTime() - daysAgo * 86400000);
    const prev = findAtOrBefore(points, target);
    if (!prev || prev.value <= 0 || prev.dateStr === latest.dateStr) return null;
    return latest.value / prev.value - 1;
}

function ytdReturn(points: NormalizedPoint[]): number | null {
    if (points.length < 2) return null;
    const latest = points[points.length - 1];
    const yearStart = new Date(latest.date.getFullYear(), 0, 1);
    const prev = findAtOrAfter(points, yearStart);
    if (!prev || prev.value <= 0 || prev.dateStr === latest.dateStr) return null;
    return latest.value / prev.value - 1;
}

function maxDrawdown(points: NormalizedPoint[]): number | null {
    if (points.length < 2) return null;
    let peak = points[0].value;
    let mdd = 0;
    for (const p of points) {
        if (p.value > peak) peak = p.value;
        const dd = (peak - p.value) / peak;
        if (dd > mdd) mdd = dd;
    }
    return -mdd;
}

function pointReturns(points: NormalizedPoint[]): number[] {
    const rs: number[] = [];
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1].value;
        if (prev > 0) rs.push(points[i].value / prev - 1);
    }
    return rs;
}

function annualizedVolatility(points: NormalizedPoint[]): number | null {
    const rs = pointReturns(points);
    if (rs.length < 2) return null;
    const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
    const variance = rs.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (rs.length - 1);
    return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

function annualizedReturn(points: NormalizedPoint[]): number | null {
    if (points.length < 2) return null;
    const start = points[0].value;
    const end = points[points.length - 1].value;
    if (start <= 0) return null;
    const n = points.length - 1;
    if (n <= 0) return null;
    return Math.pow(end / start, TRADING_DAYS_PER_YEAR / n) - 1;
}

function sharpeRatio(points: NormalizedPoint[], riskFree: number): number | null {
    const annRet = annualizedReturn(points);
    const annVol = annualizedVolatility(points);
    if (annRet === null || annVol === null || annVol === 0) return null;
    return (annRet - riskFree) / annVol;
}

function filterRange(points: NormalizedPoint[], start?: string, end?: string): NormalizedPoint[] {
    if (!start && !end) return points;
    const startTs = start ? new Date(start).getTime() : -Infinity;
    const endTs = end ? new Date(end).getTime() : Infinity;
    return points.filter(p => {
        const t = p.date.getTime();
        return t >= startTs && t <= endTs;
    });
}

function rangeReturn(points: NormalizedPoint[]): number | null {
    if (points.length < 2) return null;
    return points[points.length - 1].value / points[0].value - 1;
}

interface MetricBundle {
    r1w: number | null;
    r1m: number | null;
    r3m: number | null;
    r1y: number | null;
    rYtd: number | null;
    mdd: number | null;
    annVol: number | null;
    sharpe: number | null;
    rangeReturn: number | null;
    rangeMdd: number | null;
}

function computeBundle(
    allPoints: NormalizedPoint[],
    rangePoints: NormalizedPoint[],
    riskFree: number,
): MetricBundle {
    return {
        r1w: periodReturn(allPoints, 7),
        r1m: periodReturn(allPoints, 30),
        r3m: periodReturn(allPoints, 90),
        r1y: periodReturn(allPoints, 365),
        rYtd: ytdReturn(allPoints),
        mdd: maxDrawdown(allPoints),
        annVol: annualizedVolatility(allPoints),
        sharpe: sharpeRatio(allPoints, riskFree),
        rangeReturn: rangeReturn(rangePoints),
        rangeMdd: maxDrawdown(rangePoints),
    };
}

// ===== 格式化 =====

function fmtPct(n: number | null, digits = 2): string {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    const sign = n > 0 ? '+' : '';
    return `${sign}${(n * 100).toFixed(digits)}%`;
}

function fmtNum(n: number | null, digits = 2): string {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    return n.toFixed(digits);
}

function returnColor(n: number | null): string {
    if (n === null || n === undefined || Number.isNaN(n)) return 'text-gray-400';
    if (n > 0) return 'text-red-600';
    if (n < 0) return 'text-green-600';
    return 'text-gray-700';
}

function MetricCard({
    label, value, valueCls = 'text-gray-800', sub,
}: { label: string; value: string; valueCls?: string; sub?: string }) {
    return (
        <div className="bg-gray-50 rounded p-3 border border-gray-100">
            <div className="text-xs text-gray-500 mb-1">{label}</div>
            <div className={`text-lg font-semibold ${valueCls}`}>{value}</div>
            {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
        </div>
    );
}

// 对比表里渲染一个百分比单元格
function PctCell({ value, digits = 2 }: { value: number | null; digits?: number }) {
    return <span className={returnColor(value)}>{fmtPct(value, digits)}</span>;
}

// ===== 主组件 =====

export default function ProductMetrics({
    netValues,
    rangeStart,
    rangeEnd,
    riskFreeRate = DEFAULT_RISK_FREE,
    benchmarkSeries = [],
}: ProductMetricsProps) {
    const productPoints = useMemo(() => normalizeNetValues(netValues), [netValues]);
    const productRange = useMemo(
        () => filterRange(productPoints, rangeStart, rangeEnd),
        [productPoints, rangeStart, rangeEnd],
    );

    const benchmarkBundles = useMemo(() => {
        return benchmarkSeries.map(s => {
            const pts = normalizeNamedSeries(s);
            const rng = filterRange(pts, rangeStart, rangeEnd);
            return { name: s.name, bundle: computeBundle(pts, rng, riskFreeRate), points: pts };
        });
    }, [benchmarkSeries, rangeStart, rangeEnd, riskFreeRate]);

    if (productPoints.length < 2) {
        return (
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-sm text-gray-500">
                净值数据不足，无法计算收益与风险指标
            </div>
        );
    }

    const productBundle = computeBundle(productPoints, productRange, riskFreeRate);

    const hasRange = Boolean(rangeStart || rangeEnd);
    const rangeLabel = (() => {
        if (!hasRange) return '';
        const s = rangeStart || (productRange[0]?.dateStr ?? '');
        const e = rangeEnd || (productRange[productRange.length - 1]?.dateStr ?? '');
        return `${s} ~ ${e}`;
    })();

    const hasBenchmark = benchmarkBundles.length > 0;

    // 对比表的行定义
    const rows: Array<{ label: string; key: keyof MetricBundle; kind: 'pct' | 'num' }> = [
        { label: '近一周', key: 'r1w', kind: 'pct' },
        { label: '近一月', key: 'r1m', kind: 'pct' },
        { label: '近三月', key: 'r3m', kind: 'pct' },
        { label: '近一年', key: 'r1y', kind: 'pct' },
        { label: '今年以来 (YTD)', key: 'rYtd', kind: 'pct' },
        { label: '最大回撤', key: 'mdd', kind: 'pct' },
        { label: '年化波动率', key: 'annVol', kind: 'pct' },
        { label: '夏普比率', key: 'sharpe', kind: 'num' },
        { label: '区间收益率', key: 'rangeReturn', kind: 'pct' },
        { label: '区间最大回撤', key: 'rangeMdd', kind: 'pct' },
    ];

    return (
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
            <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">周期收益率</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    <MetricCard label="近一周" value={fmtPct(productBundle.r1w)} valueCls={returnColor(productBundle.r1w)} />
                    <MetricCard label="近一月" value={fmtPct(productBundle.r1m)} valueCls={returnColor(productBundle.r1m)} />
                    <MetricCard label="近三月" value={fmtPct(productBundle.r3m)} valueCls={returnColor(productBundle.r3m)} />
                    <MetricCard label="近一年" value={fmtPct(productBundle.r1y)} valueCls={returnColor(productBundle.r1y)} />
                    <MetricCard label="今年以来 (YTD)" value={fmtPct(productBundle.rYtd)} valueCls={returnColor(productBundle.rYtd)} />
                </div>
            </div>

            <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    风险指标 <span className="text-xs text-gray-400 font-normal">（无风险利率 {(riskFreeRate * 100).toFixed(1)}%，年化按 252 交易日）</span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <MetricCard label="最大回撤" value={fmtPct(productBundle.mdd)} valueCls={productBundle.mdd !== null && productBundle.mdd < 0 ? 'text-green-700' : 'text-gray-700'} />
                    <MetricCard label="年化波动率" value={fmtPct(productBundle.annVol)} />
                    <MetricCard label="夏普比率" value={fmtNum(productBundle.sharpe)} valueCls={productBundle.sharpe !== null && productBundle.sharpe > 0 ? 'text-red-600' : productBundle.sharpe !== null && productBundle.sharpe < 0 ? 'text-green-600' : 'text-gray-700'} />
                </div>
            </div>

            <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    区间指标 <span className="text-xs text-gray-400 font-normal">
                        {hasRange ? `（${rangeLabel}）` : '（未选择区间，跟随图表上方日期）'}
                    </span>
                </h3>
                <div className="grid grid-cols-2 gap-3">
                    <MetricCard
                        label="区间收益率"
                        value={fmtPct(productBundle.rangeReturn)}
                        valueCls={returnColor(productBundle.rangeReturn)}
                        sub={hasRange && productRange.length >= 2 ? `共 ${productRange.length} 个净值点` : undefined}
                    />
                    <MetricCard
                        label="区间最大回撤"
                        value={fmtPct(productBundle.rangeMdd)}
                        valueCls={productBundle.rangeMdd !== null && productBundle.rangeMdd < 0 ? 'text-green-700' : 'text-gray-700'}
                    />
                </div>
            </div>

            {hasBenchmark && (
                <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">产品 vs 基准</h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm border border-gray-100">
                            <thead className="bg-gray-50 text-gray-600">
                                <tr>
                                    <th className="px-3 py-2 text-left font-medium">指标</th>
                                    <th className="px-3 py-2 text-right font-medium">产品</th>
                                    {benchmarkBundles.map(b => (
                                        <th key={b.name} className="px-3 py-2 text-right font-medium">{b.name}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(row => (
                                    <tr key={row.key} className="border-t border-gray-100">
                                        <td className="px-3 py-2 text-gray-700">{row.label}</td>
                                        <td className="px-3 py-2 text-right font-medium">
                                            {row.kind === 'pct'
                                                ? <PctCell value={productBundle[row.key]} />
                                                : fmtNum(productBundle[row.key])}
                                        </td>
                                        {benchmarkBundles.map(b => (
                                            <td key={b.name} className="px-3 py-2 text-right">
                                                {row.kind === 'pct'
                                                    ? <PctCell value={b.bundle[row.key]} />
                                                    : fmtNum(b.bundle[row.key])}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
