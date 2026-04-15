// NetValueChart.tsx
'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartOption } from 'echarts';

type NetValueType = 'net_value' | 'cumulative_unit_net_value';

interface NetValueChartProps {
    netValues: Array<{
        net_value_date: string;
        net_value: number | string;
        cumulative_unit_net_value?: number | string;
    }> | undefined;
    productName: string;
    loading: boolean;
    netValueType?: NetValueType;
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
                                          netValueType = 'net_value',
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

        // 🔥 修复：移除复杂的类型守卫，直接处理数据
        const validData = netValues
            .map(item => {
                const valueField = netValueType;
                const value = item[valueField];
                const num = Number(value);
                if (isNaN(num) || num < 0 || !item.net_value_date.trim()) {
                    return null;
                }
                return {
                    net_value_date: item.net_value_date,
                    value: num
                };
            })
            .filter((item): item is { net_value_date: string; value: number } => item !== null);

        chartInstance.current.clear();

        if (validData.length === 0) return;

        const sortedData = [...validData].sort((a, b) =>
            new Date(a.net_value_date).getTime() - new Date(b.net_value_date).getTime()
        );

        const xData = sortedData.map(item => {
            const d = new Date(item.net_value_date);
            return `${d.getMonth() + 1}-${d.getDate().toString().padStart(2, '0')}`;
        });

        const yData = sortedData.map(item => item.value);

        const yMin = Math.min(...yData) - 0.1;
        const yMax = Math.max(...yData) + 0.1;

        const chartTitle = netValueType === 'cumulative_unit_net_value'
            ? `${productName} 累计净值趋势`
            : `${productName} 净值趋势`;
        const valueLabel = netValueType === 'cumulative_unit_net_value'
            ? '累计净值'
            : '净值';

        const option: EChartOption = {
            title: {
                text: chartTitle,
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
                    return `${p.name}<br/>${p.marker}${valueLabel}：${val.toFixed(4)}`;
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
                axisLabel: { color: '#64748b', fontSize: 11, formatter: (v: number) => v.toFixed(3) },
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                splitLine: { lineStyle: { color: '#f1f5f9' } },
            },
            series: [{
                name: valueLabel,
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
    }, [netValues, productName, loading, netValueType]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[400px] bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-gray-500">加载图表数据中...</span>
            </div>
        );
    }

    // 🔥 修复：简化数据验证逻辑
    const hasValidData = netValues.some(item => {
        const valueField = netValueType;
        const value = item[valueField];
        const num = Number(value);
        return !isNaN(num) && num >= 0 && item.net_value_date.trim() !== '';
    });

    if (!hasValidData) {
        const noDataText = netValueType === 'cumulative_unit_net_value'
            ? '暂无累计净值数据，无法生成图表'
            : '暂无净值数据，无法生成图表';
        return (
            <div className="flex items-center justify-center h-[400px] bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-gray-500">{noDataText}</span>
            </div>
        );
    }

    return (
        <div className="w-full h-[400px] bg-white rounded-lg border border-gray-200 p-4">
            <div ref={chartRef} className="w-full h-full" />
        </div>
    );
}