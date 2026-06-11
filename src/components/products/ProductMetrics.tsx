'use client';

import { useMemo } from 'react';
import { ProductNetValue } from '@/lib/types';
import {
    DEFAULT_RISK_FREE,
    MetricBundle,
    MetricPoint,
    computeBundle,
    filterRange,
    findAtOrAfter,
    findAtOrBefore,
    normalizePoints,
} from '@/lib/metrics';

// 给每个指标卡算实际起止日期，标到 sub 让用户知道'近一月'到底算的是哪两天
function periodRangeLabel(points: MetricPoint[], daysAgo: number): string | undefined {
    if (points.length < 2) return undefined;
    const latest = points[points.length - 1];
    const target = new Date(latest.date.getTime() - daysAgo * 86400000);
    const prev = findAtOrBefore(points, target);
    if (!prev || prev.dateStr === latest.dateStr) return undefined;
    return `${prev.dateStr} → ${latest.dateStr}`;
}
function ytdRangeLabel(points: MetricPoint[]): string | undefined {
    if (points.length < 2) return undefined;
    const latest = points[points.length - 1];
    const yearStart = new Date(latest.date.getFullYear(), 0, 1);
    const prev = findAtOrAfter(points, yearStart);
    if (!prev || prev.dateStr === latest.dateStr) return undefined;
    return `${prev.dateStr} → ${latest.dateStr}`;
}
function fullRangeLabel(points: MetricPoint[]): string | undefined {
    if (points.length < 2) return undefined;
    return `${points[0].dateStr} → ${points[points.length - 1].dateStr}`;
}

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

function normalizeNetValues(netValues: ProductNetValue[]) {
    return normalizePoints(
        netValues
            .filter(nv => nv.is_valid !== false)
            .map(nv => ({ date: nv.net_value_date ?? '', value: nv.cumulative_unit_net_value })),
    );
}

function normalizeNamedSeries(s: NamedSeries) {
    return normalizePoints(s.points);
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
                    <MetricCard label="近一周" value={fmtPct(productBundle.r1w)} valueCls={returnColor(productBundle.r1w)} sub={periodRangeLabel(productPoints, 7)} />
                    <MetricCard label="近一月" value={fmtPct(productBundle.r1m)} valueCls={returnColor(productBundle.r1m)} sub={periodRangeLabel(productPoints, 30)} />
                    <MetricCard label="近三月" value={fmtPct(productBundle.r3m)} valueCls={returnColor(productBundle.r3m)} sub={periodRangeLabel(productPoints, 90)} />
                    <MetricCard label="近一年" value={fmtPct(productBundle.r1y)} valueCls={returnColor(productBundle.r1y)} sub={periodRangeLabel(productPoints, 365)} />
                    <MetricCard label="今年以来 (YTD)" value={fmtPct(productBundle.rYtd)} valueCls={returnColor(productBundle.rYtd)} sub={ytdRangeLabel(productPoints)} />
                </div>
            </div>

            <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    风险指标 <span className="text-xs text-gray-400 font-normal">
                        （无风险利率 {(riskFreeRate * 100).toFixed(1)}%，年化按 252 交易日{fullRangeLabel(productPoints) ? `，区间 ${fullRangeLabel(productPoints)}` : ''}）
                    </span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <MetricCard label="最大回撤" value={fmtPct(productBundle.mdd)} valueCls={productBundle.mdd !== null && productBundle.mdd < 0 ? 'text-green-700' : 'text-gray-700'} sub={fullRangeLabel(productPoints)} />
                    <MetricCard label="年化波动率" value={fmtPct(productBundle.annVol)} sub={fullRangeLabel(productPoints)} />
                    <MetricCard label="夏普比率" value={fmtNum(productBundle.sharpe)} valueCls={productBundle.sharpe !== null && productBundle.sharpe > 0 ? 'text-red-600' : productBundle.sharpe !== null && productBundle.sharpe < 0 ? 'text-green-600' : 'text-gray-700'} sub={fullRangeLabel(productPoints)} />
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
