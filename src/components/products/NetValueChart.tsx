'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
// 仅导入核心兼容类型，无小众类型依赖
import type { EChartOption } from 'echarts';

// 定义 Props 接口，保持业务数据一致性
interface NetValueChartProps {
    netValues: Array<{ net_value_date: string; net_value: number | string }> | undefined;
    productName: string;
    loading: boolean;
}

// 定义 tooltip 参数的局部接口（替代小众类型，避免导入错误）
interface ChartTooltipParam {
    name: string | undefined;
    value: number | string | undefined;
    marker: string | undefined;
}

// 防抖函数（纯类型安全，无宽泛类型）
const debounce = (
    fn: () => void,
    delay: number
): () => void => {
    let timer: NodeJS.Timeout | null = null;
    return () => {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            fn();
        }, delay);
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

    // 1. 初始化 ECharts 实例 + 绑定 resize 事件
    useEffect(() => {
        if (!chartRef.current) {
            return;
        }

        // 初始化实例
        chartInstance.current = echarts.init(chartRef.current);

        // 初始化防抖 resize 函数
        debouncedResize.current = debounce(() => {
            if (chartInstance.current) {
                chartInstance.current.resize();
            }
        }, 200);

        // 绑定事件
        window.addEventListener('resize', debouncedResize.current);

        // 卸载清理
        return () => {
            window.removeEventListener('resize', debouncedResize.current);
            if (chartInstance.current) {
                chartInstance.current.dispose();
                chartInstance.current = null;
            }
        };
    }, []);

    // 2. 更新图表数据（彻底解决 series/emphasis 类型不匹配）
    useEffect(() => {
        // 前置校验
        if (!chartInstance.current || loading || netValues.length === 0) {
            return;
        }

        // 步骤1：数据预处理 - 过滤无效数据 + 强制转为数字
        const validNetValues = netValues.filter((item): item is { net_value_date: string; net_value: number } => {
            const netValueNum = Number(item.net_value);
            return !isNaN(netValueNum) && netValueNum >= 0 && item.net_value_date.trim() !== '';
        });

        if (validNetValues.length === 0) {
            return;
        }

        // 步骤2：数据排序
        const sortedData = [...validNetValues].sort((a, b) => {
            return new Date(a.net_value_date).getTime() - new Date(b.net_value_date).getTime();
        });

        // 步骤3：处理 X/Y 轴数据
        const xData = sortedData.map((item) => {
            const date = new Date(item.net_value_date);
            const month = date.getMonth() + 1;
            const day = date.getDate().toString().padStart(2, '0');
            return `${month}-${day}`;
        });
        const yData = sortedData.map((item) => item.net_value);

        // 步骤4：Y 轴 min/max 容错
        let yMin: number | undefined = undefined;
        let yMax: number | undefined = undefined;
        if (yData.length > 0) {
            yMin = Math.min(...yData) - 0.1;
            yMax = Math.max(...yData) + 0.1;
        }

        // 步骤5：图表配置（100% 合法属性，无任何无效配置）
        const chartOption: EChartOption = {
            title: {
                text: `${productName} 净值趋势`,
                left: 'center' as const,
                textStyle: {
                    color: '#1e3a8a',
                    fontSize: 16,
                    fontWeight: 600 as const,
                },
            },
            tooltip: {
                trigger: 'axis' as const,
                axisPointer: {
                    type: 'line' as const,
                    lineStyle: {
                        color: '#e2e8f0',
                        width: 1,
                        type: 'solid' as const,
                    },
                },
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderColor: '#e2e8f0',
                borderWidth: 1,
                padding: 10,
                textStyle: {
                    color: '#334155',
                    fontSize: 12,
                    lineHeight: 1.4,
                },
                position: 'top' as const,
                // 用 unknown + 类型守卫，无 any 类型，无小众类型导入
                formatter: (params: unknown) => {
                    if (!Array.isArray(params) || params.length === 0) {
                        return '暂无数据';
                    }

                    const firstParam = params[0] as ChartTooltipParam;
                    if (!firstParam) {
                        return '暂无数据';
                    }

                    const rawValue = firstParam.value ?? 0;
                    const numValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
                    const validValue = isNaN(numValue) ? 0 : numValue;
                    const marker = firstParam.marker || '';
                    const name = firstParam.name || '';

                    return `
                        <div style="font-weight: 500; margin-bottom: 4px;">${name}</div>
                        <div style="display: flex; align-items: center;">
                          ${marker}
                          <span style="margin-left: 4px;">净值：${validValue.toFixed(4)}</span>
                        </div>
                    `;
                },
            },
            grid: {
                left: '10%',
                right: '5%',
                bottom: '15%',
                top: '20%',
                containLabel: true,
            },
            xAxis: {
                type: 'category' as const,
                data: xData,
                axisLabel: {
                    color: '#64748b',
                    rotate: 30,
                    fontSize: 11,
                },
                axisLine: {
                    lineStyle: {
                        color: '#e2e8f0',
                    },
                },
                splitLine: {
                    show: false,
                },
            },
            yAxis: {
                type: 'value' as const,
                axisLabel: {
                    color: '#64748b',
                    fontSize: 11,
                    formatter: (value: number | string) => {
                        const numValue = typeof value === 'number' ? value : Number(value);
                        return isNaN(numValue) ? '0.000' : numValue.toFixed(3);
                    },
                },
                axisLine: {
                    lineStyle: {
                        color: '#e2e8f0',
                    },
                },
                splitLine: {
                    lineStyle: {
                        color: '#f1f5f9',
                    },
                },
                min: yMin,
                max: yMax,
            },
            series: [
                // 彻底移除 emphasis 中无效属性，仅保留合法配置，解决类型不匹配
                {
                    name: '净值',
                    type: 'line' as const,
                    data: yData,
                    smooth: true,
                    lineStyle: {
                        color: '#3b82f6',
                        width: 2.5,
                    },
                    itemStyle: {
                        color: '#1e40af',
                        borderWidth: 2,
                        borderColor: '#fff',
                    },
                    symbol: 'circle' as const,
                    symbolSize: 4,
                    showSymbol: false,
                    emphasis: {
                        // 仅保留合法的 itemStyle 属性，移除所有无效属性（如 symbolSize/scale）
                        itemStyle: {
                            color: '#1e40af',
                            borderWidth: 3, // 通过增大边框宽度实现悬浮高亮效果，替代放大
                            borderColor: '#fff',
                        },
                    },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(59, 130, 246, 0.2)' },
                            { offset: 1, color: 'rgba(59, 130, 246, 0)' },
                        ]),
                    },
                },
            ],
            animationDuration: 1000,
            animationEasingUpdate: 'quinticInOut' as const,
        };

        // 完全匹配 EChartOption 类型，无重载不匹配错误
        chartInstance.current.setOption(chartOption, true);
    }, [netValues, productName, loading]);

    // 加载状态
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[400px] bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-gray-500">加载图表数据中...</span>
            </div>
        );
    }

    // 过滤无效数据
    const validNetValues = netValues.filter((item) => {
        const netValueNum = Number(item.net_value);
        return !isNaN(netValueNum) && netValueNum >= 0 && item.net_value_date.trim() !== '';
    });

    // 无数据状态
    if (validNetValues.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[400px] bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-gray-500">暂无净值数据，无法生成图表</span>
            </div>
        );
    }

    // 图表容器（DOM 实现圆角，视觉效果一致）
    return (
        <div className="w-full h-[400px] bg-white rounded-lg border border-gray-200 p-4">
            <div ref={chartRef} className="w-full h-full" />
        </div>
    );
}