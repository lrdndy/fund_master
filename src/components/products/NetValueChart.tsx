// NetValueChart.tsx
'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartOption } from 'echarts';

export interface NetValueSeries {
    name: string;
    points: Array<{ date: string; value: number }>;
    color?: string;
}

interface NetValueChartProps {
    series: NetValueSeries[];
    title?: string;
    loading?: boolean;
    /** true 时所有 series 归一化到起点 = 1.0，便于不同量级数据（净值 vs 指数点位）直接对比 */
    normalize?: boolean;
    /** 指定某条 series 的 name 作基准后，其它 series 叠加'相对它的超额收益'到次坐标轴（虚线）；需配合 normalize */
    excessBaseName?: string;
    /** 多基准场景：传入所有基准的 name；超额 = 非基准 series × 每个基准画一条线（'产品 vs 基准'语义）；优先级高于 excessBaseName */
    excessBaseNames?: string[];
}

interface ChartTooltipParam {
    seriesName?: string;
    name?: string;
    value?: number | string | [string, number];
    marker?: string;
    axisValueLabel?: string;
}

const DEFAULT_COLORS = ['#1e40af', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777'];

const debounce = (fn: () => void, delay: number): () => void => {
    let timer: NodeJS.Timeout | null = null;
    return () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(fn, delay);
    };
};

// 清洗 + 排序，必要时归一化
function prepareSeries(raw: NetValueSeries, normalize: boolean): NetValueSeries {
    const cleaned = raw.points
        .filter(p => p.date && !Number.isNaN(Number(p.value)) && Number(p.value) > 0)
        .map(p => ({ date: p.date, value: Number(p.value) }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (!normalize || cleaned.length === 0) {
        return { ...raw, points: cleaned };
    }
    const base = cleaned[0].value;
    if (base <= 0) return { ...raw, points: cleaned };
    return { ...raw, points: cleaned.map(p => ({ date: p.date, value: p.value / base })) };
}

export default function NetValueChart({
    series,
    title,
    loading = false,
    normalize = false,
    excessBaseName,
    excessBaseNames,
}: NetValueChartProps) {
    const chartRef = useRef<HTMLDivElement>(null);
    const chartInstance = useRef<echarts.ECharts | null>(null);
    const debouncedResize = useRef<() => void>(() => {});

    useEffect(() => {
        if (!chartRef.current) return;

        chartInstance.current = echarts.init(chartRef.current);
        debouncedResize.current = debounce(() => {
            chartInstance.current?.resize();
        }, 20);

        window.addEventListener('resize', debouncedResize.current);
        return () => {
            window.removeEventListener('resize', debouncedResize.current);
            chartInstance.current?.dispose();
            chartInstance.current = null;
        };
    }, []);

    useEffect(() => {
        if (!chartInstance.current || loading) return;

        const prepared = series.map(s => prepareSeries(s, normalize)).filter(s => s.points.length > 0);

        chartInstance.current.clear();

        if (prepared.length === 0) return;

        const echartsSeries: EChartOption.SeriesLine[] = prepared.map((s, idx) => ({
            name: s.name,
            type: 'line',
            data: s.points.map(p => [p.date, p.value] as [string, number]),
            smooth: true,
            showSymbol: false,
            symbolSize: 4,
            lineStyle: { color: s.color ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length], width: 2 },
            itemStyle: { color: s.color ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length] },
            // 单条线时填充色更柔和；多条线不填充，避免互相遮挡
            ...(prepared.length === 1
                ? {
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(59,132,246,0.2)' },
                            { offset: 1, color: 'rgba(59,132,246,0)' },
                        ]),
                    },
                }
                : {}),
        }));

        // 超额收益叠加：base series 归一化后，'非基准产品' × '每个基准' 笛卡尔积画线
        // 优先用 excessBaseNames（多基准）；fallback excessBaseName（向后兼容单基准）
        let hasExcess = false;
        const baseNameSet = new Set(
            excessBaseNames && excessBaseNames.length > 0
                ? excessBaseNames
                : excessBaseName ? [excessBaseName] : [],
        );
        if (baseNameSet.size > 0 && normalize) {
            const bases = prepared.filter(s => baseNameSet.has(s.name));
            const products = prepared.filter(s => !baseNameSet.has(s.name));
            let lineIdx = 0;
            for (const base of bases) {
                const baseMap = new Map(base.points.map(p => [p.date, p.value]));
                for (const s of products) {
                    const data = s.points
                        .filter(p => baseMap.has(p.date))
                        .map(p => [p.date, parseFloat(((p.value - baseMap.get(p.date)!) * 100).toFixed(2))] as [string, number]);
                    if (data.length === 0) continue;
                    hasExcess = true;
                    const color = s.color ?? DEFAULT_COLORS[lineIdx % DEFAULT_COLORS.length];
                    echartsSeries.push({
                        name: `${s.name} vs ${base.name}`,
                        type: 'line',
                        yAxisIndex: 1,
                        data,
                        smooth: true,
                        showSymbol: false,
                        lineStyle: { color, width: 1.5, type: 'dashed' },
                        itemStyle: { color },
                    } as EChartOption.SeriesLine);
                    lineIdx++;
                }
            }
        }

        const valueDigits = normalize ? 4 : 3;

        const option: EChartOption = {
            title: title
                ? { text: title, left: 'center', textStyle: { color: '#1e3a8a', fontSize: 16, fontWeight: 600 } }
                : undefined,
            legend: prepared.length > 1
                ? { top: title ? 30 : 6, data: prepared.map(s => s.name), textStyle: { fontSize: 12 } }
                : undefined,
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'line', lineStyle: { color: '#e2e8f0', width: 1 } },
                backgroundColor: 'rgba(255,255,255,0.95)',
                borderColor: '#e2e8f0',
                borderWidth: 1,
                padding: 10,
                textStyle: { color: '#334155', fontSize: 12 },
                formatter: (params: unknown) => {
                    if (!Array.isArray(params) || params.length === 0) return '';
                    const arr = params as ChartTooltipParam[];
                    const axisLabel = arr[0].axisValueLabel ?? arr[0].name ?? '';
                    const lines = arr.map(p => {
                        const val = Array.isArray(p.value) ? p.value[1] : Number(p.value);
                        const isExcess = (p.seriesName ?? '').includes('超额');
                        const valStr = Number.isFinite(val)
                            ? (isExcess ? `${val > 0 ? '+' : ''}${Number(val).toFixed(2)}%` : Number(val).toFixed(valueDigits))
                            : '—';
                        return `${p.marker ?? ''}${p.seriesName}：${valStr}`;
                    });
                    return [axisLabel, ...lines].join('<br/>');
                },
            },
            grid: { left: '8%', right: hasExcess ? '8%' : '5%', bottom: '12%', top: prepared.length > 1 ? '20%' : '15%', containLabel: true },
            xAxis: {
                type: 'time',
                axisLabel: { color: '#64748b', fontSize: 11 },
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                splitLine: { show: false },
            },
            yAxis: (hasExcess
                ? [
                    {
                        type: 'value', scale: true,
                        axisLabel: { color: '#64748b', fontSize: 11, formatter: (v: number) => v.toFixed(valueDigits) },
                        axisLine: { lineStyle: { color: '#e2e8f0' } },
                        splitLine: { lineStyle: { color: '#f1f5f9' } },
                    },
                    {
                        type: 'value', scale: true, name: '超额%', position: 'right',
                        axisLabel: { color: '#94a3b8', fontSize: 11, formatter: (v: number) => v.toFixed(1) },
                        axisLine: { lineStyle: { color: '#e2e8f0' } },
                        splitLine: { show: false },
                    },
                ]
                : {
                    type: 'value', scale: true,
                    axisLabel: { color: '#64748b', fontSize: 11, formatter: (v: number) => v.toFixed(valueDigits) },
                    axisLine: { lineStyle: { color: '#e2e8f0' } },
                    splitLine: { lineStyle: { color: '#f1f5f9' } },
                }) as EChartOption.YAxis | EChartOption.YAxis[],
            series: echartsSeries,
            animationDuration: 800,
            animationEasingUpdate: 'quinticInOut',
        };

        chartInstance.current.setOption(option, true);
    }, [series, title, loading, normalize, excessBaseName, excessBaseNames]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[400px] bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-gray-500">加载图表数据中...</span>
            </div>
        );
    }

    const hasAnyData = series.some(s => s.points.length > 0);
    if (!hasAnyData) {
        return (
            <div className="flex items-center justify-center h-[400px] bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-gray-500">暂无净值数据，无法生成图表</span>
            </div>
        );
    }

    return (
        <div className="w-full h-[400px] bg-white rounded-lg border border-gray-200 p-4">
            <div ref={chartRef} className="w-full h-full" />
        </div>
    );
}
