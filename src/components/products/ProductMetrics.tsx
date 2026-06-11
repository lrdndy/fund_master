'use client';

import { useMemo } from 'react';
import { ProductNetValue } from '@/lib/types';
import {
    DEFAULT_RISK_FREE,
    MetricBundle,
    MetricPoint,
    computeBundle,
    filterRange,
    findAtOrBefore,
    findAtOrAfter,
    normalizePoints,
} from '@/lib/metrics';

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

// 计算某个期间（从 latest 往前推 daysAgo 天）的实际数据起止日期
function periodDateRange(points: MetricPoint[], daysAgo: number): { start: string; end: string } | null {
    if (points.length < 2) return null;
    const latest = points[points.length - 1];
    const target = new Date(latest.date.getTime() - daysAgo * 86400000);
    const prev = findAtOrBefore(points, target);
    if (!prev || prev.dateStr === latest.dateStr) return null;
    return { start: prev.dateStr, end: latest.dateStr };
}

// 计算 YTD 的实际起止日期
function ytdDateRange(points: MetricPoint[]): { start: string; end: string } | null {
    if (points.length < 2) return null;
    const latest = points[points.length - 1];
    const yearStart = new Date(latest.date.getFullYear(), 0, 1);
    const prev = findAtOrAfter(points, yearStart);
    if (!prev || prev.dateStr === latest.dateStr) return null;
    return { start: prev.dateStr, end: latest.dateStr };
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

    // 超额指标：对各基准分别算产品相对该基准的超额
    // 注意：超额曲线 = 归一化产品 − 归一化基准，起点 = 0、可正可负。
    //       totalReturn / maxDrawdown 是给'严格正、1.0 起步'的累计净值设计的，
    //       直接喂超额数据会出 NaN（除以 0）或几百%（peak 趋近 0 时分母爆炸）。
    //       这里改用'绝对差'：区间超额 = 末值 − 首值；超额回撤 = 历史峰值 − 当前值。
    //       结果含义 = 累计跑赢/吐回的'百分点'，落在正常量级。
    const excessBundles = useMemo(() => {
        if (benchmarkBundles.length === 0 || productRange.length < 2) return [];
        return benchmarkBundles.map(b => {
            const baseRange = filterRange(b.points, rangeStart, rangeEnd);
            if (baseRange.length < 2) return null;
            const pNorm = productRange.map(p => ({ ...p, value: p.value / productRange[0].value }));
            const bNorm = baseRange.map(p => ({ ...p, value: p.value / baseRange[0].value }));
            const bMap = new Map(bNorm.map(p => [p.dateStr, p.value]));
            const aligned = pNorm.filter(p => bMap.has(p.dateStr));
            if (aligned.length < 2) return null;
            const excessPts: MetricPoint[] = aligned.map(p => ({
                ...p, value: p.value - bMap.get(p.dateStr)!,
            }));
            // 累计超额 = 末值 − 首值（首值 = 1 − 1 = 0），单位 = 归一化分；PctCell ×100 转 %
            const excessReturn = excessPts[excessPts.length - 1].value - excessPts[0].value;
            // 超额回撤 = 历史峰值 − 当前值（绝对峰谷差，不除以 peak 避免分母趋近 0 爆炸），返回负值
            let peak = excessPts[0].value;
            let mdd = 0;
            for (const p of excessPts) {
                if (p.value > peak) peak = p.value;
                const dd = peak - p.value;
                if (dd > mdd) mdd = dd;
            }
            return {
                name: b.name,
                excessReturn,
                excessMdd: -mdd,
                start: excessPts[0].dateStr,
                end: excessPts[excessPts.length - 1].dateStr,
            };
        }).filter(Boolean) as {
            name: string; excessReturn: number | null; excessMdd: number | null;
            start: string; end: string;
        }[];
    }, [benchmarkBundles, productRange, rangeStart, rangeEnd]);

    const hasRange = Boolean(rangeStart || rangeEnd);
    const rangeLabel = (() => {
        if (!hasRange) return '';
        const s = rangeStart || (productRange[0]?.dateStr ?? '');
        const e = rangeEnd || (productRange[productRange.length - 1]?.dateStr ?? '');
        return `${s} ~ ${e}`;
    })();

    const periodSub = (() => {
        const s = (days: number) => {
            const r = periodDateRange(productPoints, days);
            return r ? `${r.start} ~ ${r.end}` : undefined;
        };
        const ytd = ytdDateRange(productPoints);
        return {
            r1w: s(7),
            r1m: s(30),
            r3m: s(90),
            r1y: s(365),
            rYtd: ytd ? `${ytd.start} ~ ${ytd.end}` : undefined,
        };
    })();

    // 风险指标的日期范围（用全部数据的起止）
    const riskSub = (() => {
        if (productPoints.length < 2) return undefined;
        return `${productPoints[0].dateStr} ~ ${productPoints[productPoints.length - 1].dateStr}`;
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
                    <MetricCard label="近一周" value={fmtPct(productBundle.r1w)} valueCls={returnColor(productBundle.r1w)} sub={periodSub.r1w} />
                    <MetricCard label="近一月" value={fmtPct(productBundle.r1m)} valueCls={returnColor(productBundle.r1m)} sub={periodSub.r1m} />
                    <MetricCard label="近三月" value={fmtPct(productBundle.r3m)} valueCls={returnColor(productBundle.r3m)} sub={periodSub.r3m} />
                    <MetricCard label="近一年" value={fmtPct(productBundle.r1y)} valueCls={returnColor(productBundle.r1y)} sub={periodSub.r1y} />
                    <MetricCard label="今年以来 (YTD)" value={fmtPct(productBundle.rYtd)} valueCls={returnColor(productBundle.rYtd)} sub={periodSub.rYtd} />
                </div>
            </div>

            <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    风险指标 <span className="text-xs text-gray-400 font-normal">（无风险利率 {(riskFreeRate * 100).toFixed(1)}%，年化按 252 交易日）</span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <MetricCard label="最大回撤" value={fmtPct(productBundle.mdd)} valueCls={productBundle.mdd !== null && productBundle.mdd < 0 ? 'text-green-700' : 'text-gray-700'} sub={riskSub} />
                    <MetricCard label="年化波动率" value={fmtPct(productBundle.annVol)} sub={riskSub} />
                    <MetricCard label="夏普比率" value={fmtNum(productBundle.sharpe)} valueCls={productBundle.sharpe !== null && productBundle.sharpe > 0 ? 'text-red-600' : productBundle.sharpe !== null && productBundle.sharpe < 0 ? 'text-green-600' : 'text-gray-700'} sub={riskSub} />
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
                                {excessBundles.length > 0 && (
                                    <tr className="border-t border-gray-200 bg-amber-50/50">
                                        <td className="px-3 py-2 text-gray-700 font-medium" colSpan={1 + benchmarkBundles.length}>
                                            超额收益（相对基准）
                                            <span className="ml-2 text-[11px] text-gray-500 font-normal">
                                                单位：百分点（产品归一 − 基准归一）；区间见各基准列下方
                                            </span>
                                        </td>
                                    </tr>
                                )}
                                {excessBundles.map(eb => (
                                    <tr key={`ex-${eb.name}`} className="border-t border-gray-100">
                                        <td className="px-3 py-2 text-gray-600 pl-6 text-xs">区间超额收益</td>
                                        <td className="px-3 py-2 text-right">—</td>
                                        {benchmarkBundles.map(b => (
                                            <td key={b.name} className="px-3 py-2 text-right">
                                                {b.name === eb.name ? (
                                                    <>
                                                        <PctCell value={eb.excessReturn} />
                                                        <div className="text-[10px] text-gray-400 mt-0.5 font-mono">{eb.start} → {eb.end}</div>
                                                    </>
                                                ) : <span className="text-gray-300">—</span>}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                                {excessBundles.map(eb => (
                                    <tr key={`ex-mdd-${eb.name}`} className="border-t border-gray-100">
                                        <td className="px-3 py-2 text-gray-600 pl-6 text-xs">超额区间最大回撤</td>
                                        <td className="px-3 py-2 text-right">—</td>
                                        {benchmarkBundles.map(b => (
                                            <td key={b.name} className="px-3 py-2 text-right">
                                                {b.name === eb.name ? (
                                                    <>
                                                        <PctCell value={eb.excessMdd} />
                                                        <div className="text-[10px] text-gray-400 mt-0.5 font-mono">{eb.start} → {eb.end}</div>
                                                    </>
                                                ) : <span className="text-gray-300">—</span>}
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
