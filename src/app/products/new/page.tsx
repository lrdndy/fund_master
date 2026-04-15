// src/app/products/new/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
    ProductFormData,
    TagsState,
    ApiResponse,
    CycleTag,
    QuantType,
    AlgorithmType,
    StrategyType,
    FofOwnTag
} from '@/lib/types';
import { productApi, tagApi } from '@/lib/api';

// 🔥 修复：Zod  schema 严格类型匹配（统一可选/空字符串）
const productFormSchema = z.object({
    product_code: z.string().min(2, '产品代码至少2个字符').max(20, '产品代码最多20个字符'),
    product_name: z.string().min(2, '产品名称至少2个字符').max(50, '产品名称最多50个字符'),
    cycle_name_input: z.string().min(1, '请选择周期标签'),
    quant_type_name_input: z.string().min(1, '请选择量化类型'),
    algorithm_name_input: z.string().min(1, '请选择算法类型'),
    strategy_name_input: z.string().min(1, '请选择策略类型'),
    fof_own_name_input: z.string().optional(), // 修复：仅 optional，匹配表单空字符串
    score: z.number().min(0, '打分最小为0').max(100, '打分最大为100'),
    product_desc: z.string().max(200, '产品描述最多200个字符').optional(),
});

type FormData = z.infer<typeof productFormSchema>;

export default function NewProductPage() {
    const router = useRouter();
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // 🔥 修复：补全 TagsState 所有字段（customTags），匹配类型定义
    const [tags, setTags] = useState<TagsState>({
        cycles: [],
        quantTypes: [],
        algorithms: [],
        strategies: [],
        fofOwnTags: [],
        customTags: [],
    });

    const {
        register,
        handleSubmit,
        formState: { errors },
        reset,
    } = useForm<FormData>({
        resolver: zodResolver(productFormSchema),
        defaultValues: {
            product_code: '',
            product_name: '',
            cycle_name_input: '',
            quant_type_name_input: '',
            algorithm_name_input: '',
            strategy_name_input: '',
            fof_own_name_input: '',
            score: 80,
            product_desc: '',
        },
    });

    // 🔥 修复：正确的 ApiResponse 泛型断言 + 空值安全 + Promise 警告消除
    useEffect(() => {
        const loadTags = async () => {
            try {
                const [cyclesRes, quantRes, algRes, strategyRes, fofRes] = await Promise.all([
                    tagApi.getCycles(),
                    tagApi.getQuantTypes(),
                    tagApi.getAlgorithms(),
                    tagApi.getStrategies(),
                    tagApi.getFofOwnTags(),
                ]);

                setTags({
                    cycles: (cyclesRes as ApiResponse<CycleTag>).results ?? [],
                    quantTypes: (quantRes as ApiResponse<QuantType>).results ?? [],
                    algorithms: (algRes as ApiResponse<AlgorithmType>).results ?? [],
                    strategies: (strategyRes as ApiResponse<StrategyType>).results ?? [],
                    fofOwnTags: (fofRes as ApiResponse<FofOwnTag>).results ?? [],
                    customTags: [],
                });
            } catch (err) {
                setError('标签数据加载失败，请刷新页面');
                console.error(err);
            }
        };

        // 🔥 修复：消除 Promise 未处理警告
        void loadTags();
    }, []);

    // 🔥 修复：类型安全提交，空值统一处理
    const onSubmit = async (data: FormData) => {
        setLoading(true);
        setError(null);
        try {
            const productData: ProductFormData = {
                product_code: data.product_code,
                product_name: data.product_name,
                cycle_name_input: data.cycle_name_input,
                quant_type_name_input: data.quant_type_name_input,
                algorithm_name_input: data.algorithm_name_input,
                strategy_name_input: data.strategy_name_input,
                fof_own_name_input: data.fof_own_name_input ?? '',
                score: data.score,
                product_desc: data.product_desc ?? '',
            };

            await productApi.createProduct(productData);
            setSuccess('产品添加成功！');
            reset();
            setTimeout(() => router.push('/'), 3000);
        } catch (err: unknown) {
            let errMsg = '产品添加失败，请重试';
            if (typeof err === 'object' && err !== null && 'response' in err) {
                const response = (err as { response?: { data?: Record<string, string[]> } }).response;
                if (response?.data) {
                    errMsg = Object.values(response.data).flat().join('；');
                }
            } else if (err instanceof Error) {
                errMsg = err.message;
            }
            setError(errMsg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto p-4">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-xl font-bold">添加新产品</h1>
                <button onClick={() => router.back()} className="btn-secondary px-4 py-2 text-sm">
                    返回列表
                </button>
            </div>

            <div className="card border border-gray-200 rounded-lg p-6 bg-white shadow-sm">
                {success && (
                    <div className="mb-4 p-3 bg-green-50 text-green-600 rounded-md text-sm">
                        {success}
                    </div>
                )}
                {error && (
                    <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-md text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    {/* 产品代码 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">产品代码 <span className="text-red-600">*</span></label>
                        <input
                            type="text"
                            {...register('product_code')}
                            className="input-field w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                            placeholder="输入产品代码（如：SAWV26）"
                        />
                        {errors.product_code && (
                            <p className="mt-1 text-red-600 text-sm">{errors.product_code.message}</p>
                        )}
                    </div>

                    {/* 产品名称 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">产品名称 <span className="text-red-600">*</span></label>
                        <input
                            type="text"
                            {...register('product_name')}
                            className="input-field w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                            placeholder="输入产品名称（如：量化套利-30天）"
                        />
                        {errors.product_name && (
                            <p className="mt-1 text-red-600 text-sm">{errors.product_name.message}</p>
                        )}
                    </div>

                    {/* 标签选择（2列布局） */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* 周期标签 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">周期标签 <span className="text-red-600">*</span></label>
                            <select
                                {...register('cycle_name_input')}
                                className="select-field w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                            >
                                <option value="">请选择</option>
                                {tags.cycles.map((cycle) => (
                                    <option key={cycle.id} value={cycle.cycle_name}>
                                        {cycle.cycle_name}
                                    </option>
                                ))}
                            </select>
                            {errors.cycle_name_input && (
                                <p className="mt-1 text-red-600 text-sm">{errors.cycle_name_input.message}</p>
                            )}
                        </div>

                        {/* 量化类型 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">量化类型 <span className="text-red-600">*</span></label>
                            <select
                                {...register('quant_type_name_input')}
                                className="select-field w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                            >
                                <option value="">请选择</option>
                                {tags.quantTypes.map((type) => (
                                    <option key={type.id} value={type.quant_name}>
                                        {type.quant_name}
                                    </option>
                                ))}
                            </select>
                            {errors.quant_type_name_input && (
                                <p className="mt-1 text-red-600 text-sm">{errors.quant_type_name_input.message}</p>
                            )}
                        </div>

                        {/* 算法类型 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">算法类型 <span className="text-red-600">*</span></label>
                            <select
                                {...register('algorithm_name_input')}
                                className="select-field w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                            >
                                <option value="">请选择</option>
                                {tags.algorithms.map((alg) => (
                                    <option key={alg.id} value={alg.alg_name}>
                                        {alg.alg_name}
                                    </option>
                                ))}
                            </select>
                            {errors.algorithm_name_input && (
                                <p className="mt-1 text-red-600 text-sm">{errors.algorithm_name_input.message}</p>
                            )}
                        </div>

                        {/* 策略类型 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">策略类型 <span className="text-red-600">*</span></label>
                            <select
                                {...register('strategy_name_input')}
                                className="select-field w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                            >
                                <option value="">请选择</option>
                                {tags.strategies.map((strategy) => (
                                    <option key={strategy.id} value={strategy.strategy_name}>
                                        {strategy.strategy_name}
                                    </option>
                                ))}
                            </select>
                            {errors.strategy_name_input && (
                                <p className="mt-1 text-red-600 text-sm">{errors.strategy_name_input.message}</p>
                            )}
                        </div>

                        {/* FOF 归属标签（可选） */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">FOF 归属标签</label>
                            <select
                                {...register('fof_own_name_input')}
                                className="select-field w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                            >
                                <option value="">请选择（可选）</option>
                                {tags.fofOwnTags.map((fof) => (
                                    <option key={fof.id} value={fof.fof_name}>
                                        {fof.fof_name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* 打分 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">产品打分 <span className="text-red-600">*</span></label>
                        <input
                            type="number"
                            step="0.1"
                            {...register('score')}
                            className="input-field w-32 border border-gray-300 rounded-md px-3 py-2 text-sm"
                            min="0"
                            max="100"
                        />
                        {errors.score && (
                            <p className="mt-1 text-red-600 text-sm">{errors.score.message}</p>
                        )}
                    </div>

                    {/* 产品描述 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">产品描述</label>
                        <textarea
                            {...register('product_desc')}
                            className="input-field w-full border border-gray-300 rounded-md px-3 py-2 text-sm h-20"
                            placeholder="输入产品简要描述（可选）"
                        />
                        {errors.product_desc && (
                            <p className="mt-1 text-red-600 text-sm">{errors.product_desc.message}</p>
                        )}
                    </div>

                    {/* 提交按钮 */}
                    <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="btn-secondary px-4 py-2 text-sm"
                            disabled={loading}
                        >
                            取消
                        </button>
                        <button
                            type="submit"
                            className="btn-primary px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300"
                            disabled={loading}
                        >
                            {loading ? '提交中...' : '确认添加'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}