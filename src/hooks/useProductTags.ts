// src/hooks/useProductTags.ts
import { useState, useEffect } from 'react';
import { tagApi } from '@/lib/api';
import type { CycleTag, QuantType, AlgorithmType, StrategyType, ApiResponse } from '@/lib/types';

// 标签状态类型（和参考代码对齐）
export interface TagsState {
    cycles: CycleTag[];
    quantTypes: QuantType[];
    algorithms: AlgorithmType[];
    strategies: StrategyType[];
}

export default function useProductTags() {
    const [tags, setTags] = useState<TagsState>({
        cycles: [],
        quantTypes: [],
        algorithms: [],
        strategies: [],
    });
    const [tagsLoading, setTagsLoading] = useState(true);
    const [tagsError, setTagsError] = useState<string | null>(null);

    // 加载所有标签数据
    useEffect(() => {
        const loadTags = async () => {
            try {
                setTagsLoading(true);
                // 并行请求所有标签接口（和参考代码一致）
                const [cyclesRes, quantRes, algRes, strategyRes] = await Promise.all([
                    tagApi.getCycles(),
                    tagApi.getQuantTypes(),
                    tagApi.getAlgorithms(),
                    tagApi.getStrategies(),
                ]);

                // 格式化标签数据（确保和接口返回结构匹配）
                setTags({
                    cycles: (cyclesRes as ApiResponse<CycleTag>).results || [],
                    quantTypes: (quantRes as ApiResponse<QuantType>).results || [],
                    algorithms: (algRes as ApiResponse<AlgorithmType>).results || [],
                    strategies: (strategyRes as ApiResponse<StrategyType>).results || [],
                });
                setTagsError(null);
            } catch (err) {
                setTagsError('标签数据加载失败');
                console.error('标签加载失败：', err);
            } finally {
                setTagsLoading(false);
            }
        };

        loadTags();
    }, []);

    return { tags, tagsLoading, tagsError };
}