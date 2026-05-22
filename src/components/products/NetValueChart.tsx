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
                        const valStr = Number.isFinite(val) ? Number(val).toFixed(valueDigits) : '—';
                        return `${p.marker ?? ''}${p.seriesName}：${valStr}`;
                    });
                    return [axisLabel, ...lines].join('<br/>');
                },
            },
            grid: { left: '8%', right: '5%', bottom: '12%', top: prepared.length > 1 ? '20%' : '15%', containLabel: true },
            xAxis: {
                type: 'time',
                axisLabel: { color: '#64748b', fontSize: 11 },
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                splitLine: { show: false },
            },
            yAxis: {
                type: 'value',
                scale: true,
                axisLabel: { color: '#64748b', fontSize: 11, formatter: (v: number) => v.toFixed(valueDigits) },
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                splitLine: { lineStyle: { color: '#f1f5f9' } },
            },
            series: echartsSeries,
            animationDuration: 800,
            animationEasingUpdate: 'quinticInOut',
        };

        chartInstance.current.setOption(option, true);
    }, [series, title, loading, normalize]);

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
