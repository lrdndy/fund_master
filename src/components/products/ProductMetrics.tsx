'use client';

import { useMemo } from 'react';
import { ProductNetValue } from '@/lib/types';

interface ProductMetricsProps {
    netValues: ProductNetValue[];
    rangeStart?: string;
    rangeEnd?: string;
    riskFreeRate?: number; // 年化无风险利率，默认 0.025
}

interface NormalizedPoint {
    date: Date;
    dateStr: string;
    value: number; // 累计净值
}

const TRADING_DAYS_PER_YEAR = 252;
const DEFAULT_RISK_FREE = 0.025;

// 排序+清洗，转成只含有效累计净值的点
function normalize(netValues: ProductNetValue[]): NormalizedPoint[] {
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

// 找日期 <= target 的最近一条；若 target 早于序列起点，返回 null
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

// 找日期 >= target 的最近一条
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
    return -mdd; // 用负数表达回撤
}

// 用相邻数据点算"日收益率"序列；当数据为日频时即日收益
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
    const n = points.length - 1; // 数据间隔数
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

interface MetricCardProps {
    label: string;
    value: string;
    valueCls?: string;
    sub?: string;
}

function MetricCard({ label, value, valueCls = 'text-gray-800', sub }: MetricCardProps) {
    return (
        <div className="bg-gray-50 rounded p-3 border border-gray-100">
            <div className="text-xs text-gray-500 mb-1">{label}</div>
            <div className={`text-lg font-semibold ${valueCls}`}>{value}</div>
            {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
        </div>
    );
}

export default function ProductMetrics({
    netValues,
    rangeStart,
    rangeEnd,
    riskFreeRate = DEFAULT_RISK_FREE,
}: ProductMetricsProps) {
    const allPoints = useMemo(() => normalize(netValues), [netValues]);
    const rangePoints = useMemo(
        () => filterRange(allPoints, rangeStart, rangeEnd),
        [allPoints, rangeStart, rangeEnd]
    );

    if (allPoints.length < 2) {
        return (
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-sm text-gray-500">
                净值数据不足，无法计算收益与风险指标
            </div>
        );
    }

    const r1w = periodReturn(allPoints, 7);
    const r1m = periodReturn(allPoints, 30);
    const r3m = periodReturn(allPoints, 90);
    const r1y = periodReturn(allPoints, 365);
    const rYtd = ytdReturn(allPoints);

    const mdd = maxDrawdown(allPoints);
    const annVol = annualizedVolatility(allPoints);
    const sharpe = sharpeRatio(allPoints, riskFreeRate);

    const hasRange = Boolean(rangeStart || rangeEnd);
    const rangeReturn = rangePoints.length >= 2
        ? rangePoints[rangePoints.length - 1].value / rangePoints[0].value - 1
        : null;
    const rangeMdd = maxDrawdown(rangePoints);

    const rangeLabel = (() => {
        if (!hasRange) return '';
        const s = rangeStart || (rangePoints[0]?.dateStr ?? '');
        const e = rangeEnd || (rangePoints[rangePoints.length - 1]?.dateStr ?? '');
        return `${s} ~ ${e}`;
    })();

    return (
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
            <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">周期收益率</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    <MetricCard label="近一周" value={fmtPct(r1w)} valueCls={returnColor(r1w)} />
                    <MetricCard label="近一月" value={fmtPct(r1m)} valueCls={returnColor(r1m)} />
                    <MetricCard label="近三月" value={fmtPct(r3m)} valueCls={returnColor(r3m)} />
                    <MetricCard label="近一年" value={fmtPct(r1y)} valueCls={returnColor(r1y)} />
                    <MetricCard label="今年以来 (YTD)" value={fmtPct(rYtd)} valueCls={returnColor(rYtd)} />
                </div>
            </div>

            <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    风险指标 <span className="text-xs text-gray-400 font-normal">（无风险利率 {(riskFreeRate * 100).toFixed(1)}%，年化按 252 交易日）</span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <MetricCard label="最大回撤" value={fmtPct(mdd)} valueCls={mdd !== null && mdd < 0 ? 'text-green-700' : 'text-gray-700'} />
                    <MetricCard label="年化波动率" value={fmtPct(annVol)} />
                    <MetricCard label="夏普比率" value={fmtNum(sharpe)} valueCls={sharpe !== null && sharpe > 0 ? 'text-red-600' : sharpe !== null && sharpe < 0 ? 'text-green-600' : 'text-gray-700'} />
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
                        value={fmtPct(rangeReturn)}
                        valueCls={returnColor(rangeReturn)}
                        sub={hasRange && rangePoints.length >= 2 ? `共 ${rangePoints.length} 个净值点` : undefined}
                    />
                    <MetricCard
                        label="区间最大回撤"
                        value={fmtPct(rangeMdd)}
                        valueCls={rangeMdd !== null && rangeMdd < 0 ? 'text-green-700' : 'text-gray-700'}
                    />
                </div>
            </div>
        </div>
    );
}
