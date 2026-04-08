// NetValueChart.tsx
'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartOption } from 'echarts';

interface NetValueChartProps {
    netValues: Array<{ net_value_date: string; net_value: number | string }> | undefined;
    productName: string;
    loading: boolean;
}

interface ChartTooltipParam {
    name: string | undefined;
    value: number | string | undefined;
    marker: string | undefined;
}

const debounce = (
    fn: () => void,
    delay: number
): () => void => {
    let timer: NodeJS.Timeout | null = null;
    return () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(fn, delay);
    };
};

export default function NetValueChart({
                                          netValues = [],
                                          productName,
                                          loading,
                                      }: NetValueChartProps) {
    const chartRef = useRef<HTMLDivElement>(null);
    const chartInstance = useRef<echarts.ECharts | null>(null);
    const debouncedResize = useRef<() => void>(() => {});

    // 初始化图表
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

    // 渲染数据
    useEffect(() => {
        if (!chartInstance.current || loading) return;

        const validNetValues = netValues.filter((item): item is { net_value_date: string; net_value: number } => {
            const num = Number(item.net_value);
            return !isNaN(num) && num >= 0 && item.net_value_date.trim() !== '';
        });

        chartInstance.current.clear();

        if (validNetValues.length === 0) return;

        const sortedData = [...validNetValues].sort((a, b) =>
            new Date(a.net_value_date).getTime() - new Date(b.net_value_date).getTime()
        );

        const xData = sortedData.map(item => {
            const d = new Date(item.net_value_date);
            return `${d.getMonth() + 1}-${d.getDate().toString().padStart(2, '0')}`;
        });
        const yData = sortedData.map(item => item.net_value);

        const yMin = Math.min(...yData) - 0.1;
        const yMax = Math.max(...yData) + 0.1;

        const option: EChartOption = {
            title: {
                text: `${productName} 净值趋势`,
                left: 'center',
                textStyle: { color: '#1e3a8a', fontSize: 16, fontWeight: 600 },
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'line', lineStyle: { color: '#e2e8f0', width: 1 } },
                backgroundColor: 'rgba(255,255,255,0.9)',
                borderColor: '#e2e8f0',
                borderWidth: 1,
                padding: 10,
                textStyle: { color: '#334155', fontSize: 12 },
                position: 'top',
                formatter: (params: unknown) => {
                    if (!Array.isArray(params) || !params[0]) return '暂无数据';
                    const p = params[0] as ChartTooltipParam;
                    const val = Number(p.value) || 0;
                    return `${p.name}<br/>${p.marker}净值：${val.toFixed(4)}`;
                },
            },
            grid: { left: '10%', right: '5%', bottom: '15%', top: '20%', containLabel: true },
            xAxis: {
                type: 'category',
                data: xData,
                axisLabel: { color: '#64748b', rotate: 30, fontSize: 11 },
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                splitLine: { show: false },
            },
            yAxis: {
                type: 'value',
                min: yMin,
                max: yMax,
                // ✅ TS 类型已修复
                axisLabel: { color: '#64748b', fontSize: 11, formatter: (v: number) => v.toFixed(3) },
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                splitLine: { lineStyle: { color: '#f1f5f9' } },
            },
            series: [{
                name: '净值',
                type: 'line',
                data: yData,
                smooth: true,
                lineStyle: { color: '#3b82f6', width: 2.5 },
                itemStyle: { color: '#1e40af', borderWidth: 2, borderColor: '#fff' },
                symbol: 'circle',
                symbolSize: 4,
                showSymbol: false,
                emphasis: { itemStyle: { color: '#1e40af', borderWidth: 3, borderColor: '#fff' } },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0,0,0,1, [
                        { offset: 0, color: 'rgba(59,132,246,0.2)' },
                        { offset: 1, color: 'rgba(59,132,246,0)' }
                    ])
                },
            }],
            animationDuration: 1000,
            animationEasingUpdate: 'quinticInOut',
        };

        chartInstance.current.setOption(option, true);
    }, [netValues, productName, loading]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[400px] bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-gray-500">加载图表数据中...</span>
            </div>
        );
    }

    const validNetValues = netValues.filter(item => {
        const num = Number(item.net_value);
        return !isNaN(num) && num >= 0 && item.net_value_date.trim() !== '';
    });

    if (validNetValues.length === 0) {
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