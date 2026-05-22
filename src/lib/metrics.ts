// 公共净值/收益率/风险指标计算工具，供 ProductMetrics 和 NetValuesManagementPage 共用，保证公式一致。

export interface MetricPoint {
    date: Date;
    dateStr: string;
    value: number;
}

export interface NamedSeriesInput {
    name: string;
    points: Array<{ date: string; value: number | string }>;
}

export interface MetricBundle {
    r1w: number | null;
    r1m: number | null;
    r3m: number | null;
    r1y: number | null;
    rYtd: number | null;
    mdd: number | null;
    annVol: number | null;
    annRet: number | null;
    sharpe: number | null;
    totalReturn: number | null;
    rangeReturn: number | null;
    rangeMdd: number | null;
}

export const TRADING_DAYS_PER_YEAR = 252;
export const DEFAULT_RISK_FREE = 0.025;

export function normalizePoints(
    points: Array<{ date: string; value: number | string | null | undefined }>,
): MetricPoint[] {
    return points
        .map(p => {
            if (!p.date || p.value === null || p.value === undefined) return null;
            const num = typeof p.value === 'number' ? p.value : parseFloat(String(p.value));
            if (Number.isNaN(num) || num <= 0) return null;
            const d = new Date(p.date);
            if (Number.isNaN(d.getTime())) return null;
            return { date: d, dateStr: p.date, value: num };
        })
        .filter((x): x is MetricPoint => x !== null)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function filterRange(points: MetricPoint[], start?: string, end?: string): MetricPoint[] {
    if (!start && !end) return points;
    const startTs = start ? new Date(start).getTime() : -Infinity;
    const endTs = end ? new Date(end).getTime() : Infinity;
    return points.filter(p => {
        const t = p.date.getTime();
        return t >= startTs && t <= endTs;
    });
}

export function findAtOrBefore(points: MetricPoint[], target: Date): MetricPoint | null {
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

export function findAtOrAfter(points: MetricPoint[], target: Date): MetricPoint | null {
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

export function periodReturn(points: MetricPoint[], daysAgo: number): number | null {
    if (points.length < 2) return null;
    const latest = points[points.length - 1];
    const target = new Date(latest.date.getTime() - daysAgo * 86400000);
    const prev = findAtOrBefore(points, target);
    if (!prev || prev.value <= 0 || prev.dateStr === latest.dateStr) return null;
    return latest.value / prev.value - 1;
}

export function ytdReturn(points: MetricPoint[]): number | null {
    if (points.length < 2) return null;
    const latest = points[points.length - 1];
    const yearStart = new Date(latest.date.getFullYear(), 0, 1);
    const prev = findAtOrAfter(points, yearStart);
    if (!prev || prev.value <= 0 || prev.dateStr === latest.dateStr) return null;
    return latest.value / prev.value - 1;
}

export function totalReturn(points: MetricPoint[]): number | null {
    if (points.length < 2) return null;
    if (points[0].value <= 0) return null;
    return points[points.length - 1].value / points[0].value - 1;
}

export function maxDrawdown(points: MetricPoint[]): number | null {
    if (points.length < 2) return null;
    let peak = points[0].value;
    let mdd = 0;
    for (const p of points) {
        if (p.value > peak) peak = p.value;
        const dd = (peak - p.value) / peak;
        if (dd > mdd) mdd = dd;
    }
    return -mdd; // 负值表达
}

export function pointReturns(points: MetricPoint[]): number[] {
    const rs: number[] = [];
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1].value;
        if (prev > 0) rs.push(points[i].value / prev - 1);
    }
    return rs;
}

export function annualizedVolatility(points: MetricPoint[]): number | null {
    const rs = pointReturns(points);
    if (rs.length < 2) return null;
    const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
    const variance = rs.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (rs.length - 1);
    return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

export function annualizedReturn(points: MetricPoint[]): number | null {
    if (points.length < 2) return null;
    const start = points[0].value;
    const end = points[points.length - 1].value;
    if (start <= 0) return null;
    const n = points.length - 1;
    if (n <= 0) return null;
    return Math.pow(end / start, TRADING_DAYS_PER_YEAR / n) - 1;
}

export function sharpeRatio(points: MetricPoint[], riskFree = DEFAULT_RISK_FREE): number | null {
    const annRet = annualizedReturn(points);
    const annVol = annualizedVolatility(points);
    if (annRet === null || annVol === null || annVol === 0) return null;
    return (annRet - riskFree) / annVol;
}

export function computeBundle(
    allPoints: MetricPoint[],
    rangePoints: MetricPoint[],
    riskFree = DEFAULT_RISK_FREE,
): MetricBundle {
    return {
        r1w: periodReturn(allPoints, 7),
        r1m: periodReturn(allPoints, 30),
        r3m: periodReturn(allPoints, 90),
        r1y: periodReturn(allPoints, 365),
        rYtd: ytdReturn(allPoints),
        mdd: maxDrawdown(allPoints),
        annVol: annualizedVolatility(allPoints),
        annRet: annualizedReturn(allPoints),
        sharpe: sharpeRatio(allPoints, riskFree),
        totalReturn: totalReturn(allPoints),
        rangeReturn: totalReturn(rangePoints),
        rangeMdd: maxDrawdown(rangePoints),
    };
}
