'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
// 1. 导入必要的类型（包含 TagsState）
import {
    ProductFormData,
    TagsState
} from '@/lib/types';
import { productApi, tagApi } from '@/lib/api';

// 表单验证 schema
const productFormSchema = z.object({
    product_name: z.string().min(2, '产品名称至少2个字符').max(50, '产品名称最多50个字符'),
    cycle_name_input: z.string().min(1, '请选择周期标签'),
    quant_type_name_input: z.string().min(1, '请选择量化类型'),
    algorithm_name_input: z.string().min(1, '请选择算法类型'),
    strategy_name_input: z.string().min(1, '请选择策略类型'),
    score: z.number().min(0, '打分最小为0').max(100, '打分最大为100'),
    product_desc: z.string().max(200, '产品描述最多200个字符').optional().nullable(),
});

// 表单类型（基于 schema 推导）
type FormData = z.infer<typeof productFormSchema>;

export default function NewProductPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // 2. 显式指定 tags 状态的类型（解决 never 类型问题）
    const [tags, setTags] = useState<TagsState>({
        cycles: [],
        quantTypes: [],
        algorithms: [],
        strategies: [],
    });

    // 初始化表单
    const {
        register,
        handleSubmit,
        formState: { errors },
        reset,
    } = useForm<FormData>({
        resolver: zodResolver(productFormSchema),
        defaultValues: {
            product_name: '',
            cycle_name_input: '',
            quant_type_name_input: '',
            algorithm_name_input: '',
            strategy_name_input: '',
            score: 80,
            product_desc: '',
        },
    });

    // 加载标签数据
    useEffect(() => {
        const loadTags = async () => {
            try {
                const [cyclesRes, quantRes, algRes, strategyRes] = await Promise.all([
                    tagApi.getCycles(),
                    tagApi.getQuantTypes(),
                    tagApi.getAlgorithms(),
                    tagApi.getStrategies(),
                ]);
                // 3. 去掉多余的 .data（api.ts 已返回 ApiResponse 类型）
                setTags({
                    cycles: cyclesRes.results,
                    quantTypes: quantRes.results,
                    algorithms: algRes.results,
                    strategies: strategyRes.results,
                });
            } catch (err) {
                setError('标签数据加载失败，请刷新页面');
                console.error(err);
            }
        };
        // 4. 解决 Promise 忽略警告
        void loadTags();
    }, []);

    // 提交表单
    const onSubmit = async (data: FormData) => {
        setLoading(true);
        setError(null);
        try {
            const productData: ProductFormData = {
                product_name: data.product_name,
                cycle_name_input: data.cycle_name_input,
                quant_type_name_input: data.quant_type_name_input,
                algorithm_name_input: data.algorithm_name_input,
                strategy_name_input: data.strategy_name_input,
                score: data.score,
                product_desc: data.product_desc || '',
            };

            await productApi.createProduct(productData);
            setSuccess('产品添加成功！');
            reset();
            setTimeout(() => router.push('/'), 3000);
        }
            // 5. 替换 any 类型为 unknown，安全处理错误
        catch (err: unknown) {
            let errMsg = '产品添加失败，请重试';
            // 安全检查错误类型
            if (typeof err === 'object' && err !== null && 'response' in err) {
                const response = (err as { response?: { data?: unknown } }).response;
                if (response?.data && typeof response.data === 'object' && response.data !== null) {
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
        <div className="max-w-3xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1>添加新产品</h1>
                <button onClick={() => router.back()} className="btn-secondary">
                    返回列表
                </button>
            </div>

            <div className="card">
                {success && (
                    <div className="mb-4 p-3 bg-green-50 text-green-600 rounded-md">
                        {success}
                    </div>
                )}
                {error && (
                    <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-md">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    {/* 产品名称 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">产品名称 <span className="text-red-600">*</span></label>
                        <input
                            type="text"
                            {...register('product_name')}
                            className="input-field"
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
                                className="select-field"
                            >
                                <option value="">请选择</option>
                                {/* 6. 类型已匹配（CycleTag[]），可安全访问 cycle_id/cycle_name */}
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
                                className="select-field"
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
                                className="select-field"
                            >
                                <option value="">请选择</option>
                                {tags.algorithms.map((alg) => (
                                    <option key={alg.id} value={alg.alg_name ?? ''}>
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
                                className="select-field"
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
                    </div>

                    {/* 打分 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">产品打分 <span className="text-red-600">*</span></label>
                        <input
                            type="number"
                            step="0.1"
                            {...register('score')}
                            className="input-field w-32"
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
                            className="input-field h-20"
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
                            className="btn-secondary"
                            disabled={loading}
                        >
                            取消
                        </button>
                        <button
                            type="submit"
                            className="btn-primary"
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