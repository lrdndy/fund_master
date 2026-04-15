// src/hooks/useProductTags.ts
import { useState, useEffect } from 'react';
import { tagApi } from '@/lib/api';
import type {
    CycleTag, QuantType, AlgorithmType, StrategyType,
    FofOwnTag, ApiResponse, TagsState, CustomTag
} from '@/lib/types';

export default function useProductTags() {
    const [tags, setTags] = useState<TagsState>({
        cycles: [],
        quantTypes: [],
        algorithms: [],
        strategies: [],
        fofOwnTags: [],
        customTags: [],
    });
    const [tagsLoading, setTagsLoading] = useState<boolean>(true);
    const [tagsError, setTagsError] = useState<string | null>(null);

    useEffect(() => {
        const loadTags = async () => {
            try {
                setTagsLoading(true);
                // 接口返回标准 DRF 分页结构：ApiResponse<T>，其中 results 是 T[]
                const [cyclesRes, quantRes, algRes, strategyRes, fofRes, customRes] = await Promise.all([
                    tagApi.getCycles(),
                    tagApi.getQuantTypes(),
                    tagApi.getAlgorithms(),
                    tagApi.getStrategies(),
                    tagApi.getFofOwnTags(),
                    tagApi.getCustomTags(),
                ]);

                // 🔥 核心修复：使用正确的泛型 ApiResponse<T>，而非 ApiResponse<T[]>
                setTags({
                    cycles: (cyclesRes as ApiResponse<CycleTag>).results ?? [],
                    quantTypes: (quantRes as ApiResponse<QuantType>).results ?? [],
                    algorithms: (algRes as ApiResponse<AlgorithmType>).results ?? [],
                    strategies: (strategyRes as ApiResponse<StrategyType>).results ?? [],
                    fofOwnTags: (fofRes as ApiResponse<FofOwnTag>).results ?? [],
                    customTags: (customRes as ApiResponse<CustomTag>).results ?? [],
                });
                setTagsError(null);
            } catch (err) {
                setTagsError('标签数据加载失败');
                console.error('标签加载失败：', err);
            } finally {
                setTagsLoading(false);
            }
        };

        // 🔥 修复 Promise ignored 警告：显式用 void 忽略 Promise
        void loadTags();
    }, []);

    return { tags, tagsLoading, tagsError };
}