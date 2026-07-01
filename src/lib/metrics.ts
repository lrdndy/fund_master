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
    /** 超额收益（相对基准）：区间内全部日期对齐后的 (产品-基准) 累计超额 */
    excessReturn: number | null;
    /** 超额收益的最大回撤（回撤计算在超额曲线上） */
    excessMdd: number | null;
    /** 超额年化波动率 */
    excessAnnVol: number | null;
    /** 超额夏普比率（用超额收益的均值和波动） */
    excessSharpe: number | null;
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

/** 计算复权净值序列（分红再投资口径），暂不考虑份额拆分/分红明细
 *  公式：Pt = (1 + 净值涨跌幅) * Pt-1；涨跌幅 = (Lt - Lt-1) / St-1
 *  L = 累计净值, S = 单位净值。P0 = S0（起点等于单位净值）
 *
 *  为何要复权：分红除权日 St 会大幅下跌，直接用单位净值算收益会错报为暴跌，
 *  但 (Lt - Lt-1) 依然反映真实收益（累计净值包含分红），因此复权序列在分红日保持连续。
 *  副产品：suspiciousDays 标出"单位净值一日跌幅超阈值"的日期，方便人工核对。
 */
export interface AdjustedSeriesResult {
    points: MetricPoint[];
    /** 单位净值一日跌幅超阈值的日期（怀疑当日分红/拆分） */
    suspiciousDays: Array<{ date: string; unitDrop: number }>;
}

export function computeAdjustedSeries(
    raw: Array<{ date: string; unitValue: number; cumValue: number }>,
    suspiciousDropThreshold = 0.08,
): AdjustedSeriesResult {
    if (raw.length === 0) return { points: [], suspiciousDays: [] };
    // 按日期升序拷贝一份，避免依赖外部顺序
    const sorted = [...raw].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const out: MetricPoint[] = [];
    const suspicious: Array<{ date: string; unitDrop: number }> = [];
    const first = sorted[0];
    let prevS = first.unitValue;
    let prevL = first.cumValue;
    let prevP = first.unitValue > 0 ? first.unitValue : first.cumValue;
    const firstDate = new Date(first.date);
    if (!isNaN(firstDate.getTime()) && prevP > 0) {
        out.push({ date: firstDate, dateStr: first.date, value: prevP });
    }
    for (let i = 1; i < sorted.length; i++) {
        const p = sorted[i];
        const d = new Date(p.date);
        if (isNaN(d.getTime())) continue;

        // 涨跌幅 = (L_t - L_(t-1)) / S_(t-1)；S 缺失退化到 L
        let ret = 0;
        if (prevS > 0) ret = (p.cumValue - prevL) / prevS;
        else if (prevL > 0) ret = (p.cumValue - prevL) / prevL;

        // 单位净值一日跌幅超阈值时打标记（怀疑分红），复权公式已自动纠正，只是记录
        if (prevS > 0 && p.unitValue > 0) {
            const unitRet = p.unitValue / prevS - 1;
            if (unitRet < -suspiciousDropThreshold) {
                suspicious.push({ date: p.date, unitDrop: unitRet });
            }
        }

        const newP = prevP * (1 + ret);
        if (newP > 0 && Number.isFinite(newP)) {
            out.push({ date: d, dateStr: p.date, value: newP });
            prevP = newP;
        }
        prevS = p.unitValue;
        prevL = p.cumValue;
    }
    return { points: out, suspiciousDays: suspicious };
}


export function periodReturn(points: MetricPoint[], daysAgo: number): number | null {
    if (points.length < 2) return null;
    const latest = points[points.length - 1];
    const target = new Date(latest.date.getTime() - daysAgo * 86400000);
    const prev = findAtOrBefore(points, target);
    if (!prev || prev.value <= 0 || prev.dateStr === latest.dateStr) return null;
    return latest.value / prev.value - 1;
}

/** 任意 [start, end] 窗口的收益率；start 取"该日期或之后"最近的样本，end 取"该日期或之前"
 *  最近的样本（自动避开非交易日 / 数据缺失日）。返回实际匹配到的两端日期。
 *
 *  边界：用户窗口完全落在数据空档时（窗口前后都有样本，窗口内没有），
 *  findAtOrAfter 会跳到窗口之后的样本，findAtOrBefore 会回到窗口之前的样本，
 *  此时 prev.date > last.date——结果毫无意义、且 sub 字符串会显示倒序日期，
 *  必须显式返回 null。 */
export function returnBetween(
    points: MetricPoint[],
    startStr: string,
    endStr: string,
): { value: number; matchedStart: string; matchedEnd: string } | null {
    if (points.length < 2) return null;
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    if (start.getTime() > end.getTime()) return null;
    const prev = findAtOrAfter(points, start);
    const last = findAtOrBefore(points, end);
    if (!prev || !last) return null;
    if (prev.date.getTime() > last.date.getTime()) return null;  // 窗口落在数据空档
    if (prev.dateStr === last.dateStr) return null;
    if (prev.value <= 0) return null;
    return {
        value: last.value / prev.value - 1,
        matchedStart: prev.dateStr,
        matchedEnd: last.dateStr,
    };
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

// 两序列基于"日期对齐"的 Pearson 相关性。
// 输入是 [{ date: 'YYYY-MM-DD', value: number }] 形式，返回相关系数 + 共同区间。
export interface CorrSeriesPoint { date: string; value: number }
export interface CorrelationResult { corr: number; start: string; end: string; count: number }
export function calculateCorrelation(a: CorrSeriesPoint[], b: CorrSeriesPoint[]): CorrelationResult {
    const mapA = new Map(a.map(v => [v.date, v.value]));
    const common = b
        .filter(v => mapA.has(v.date))
        .map(v => ({ d: v.date, va: mapA.get(v.date)!, vb: v.value }))
        .sort((x, y) => new Date(x.d).getTime() - new Date(y.d).getTime());
    const n = common.length;
    if (n < 2) return { corr: 0, start: '', end: '', count: 0 };
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (const c of common) {
        sumX += c.va; sumY += c.vb;
        sumXY += c.va * c.vb;
        sumX2 += c.va ** 2; sumY2 += c.vb ** 2;
    }
    const denom = Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));
    if (denom === 0) return { corr: 0, start: common[0].d, end: common[n - 1].d, count: n };
    const corr = (n * sumXY - sumX * sumY) / denom;
    return {
        corr: Number.isNaN(corr) ? 0 : Math.max(-1, Math.min(1, corr)),
        start: common[0].d,
        end: common[n - 1].d,
        count: n,
    };
}

export function computeBundle(
    allPoints: MetricPoint[],
    rangePoints: MetricPoint[],
    riskFree = DEFAULT_RISK_FREE,
    /** 基准的归一化净值序列（与产品同一起点，共同日期对齐），传入后计算超额指标 */
    baseAligned?: MetricPoint[],
): MetricBundle {
    const bundle: MetricBundle = {
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
        excessReturn: null,
        excessMdd: null,
        excessAnnVol: null,
        excessSharpe: null,
    };

    // 超额指标：需基准序列对齐
    if (baseAligned && baseAligned.length >= 2 && rangePoints.length >= 2) {
        const baseMap = new Map(baseAligned.map(p => [p.dateStr, p.value]));
        const excessPoints: MetricPoint[] = [];
        for (const p of rangePoints) {
            const baseVal = baseMap.get(p.dateStr);
            if (baseVal != null) {
                excessPoints.push({
                    date: p.date,
                    dateStr: p.dateStr,
                    value: p.value - baseVal, // 都归一化到起点=1，差值即超额
                });
            }
        }
        if (excessPoints.length >= 2) {
            bundle.excessReturn = totalReturn(excessPoints);
            bundle.excessMdd = maxDrawdown(excessPoints);
            bundle.excessAnnVol = annualizedVolatility(excessPoints);
            bundle.excessSharpe = sharpeRatio(excessPoints, 0); // 超额本身已扣基准，无风险=0
        }
    }

    return bundle;
}
