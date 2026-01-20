import { ChangeEvent } from 'react';
import { CycleTag, QuantType, AlgorithmType, StrategyType, ProductFilterParams } from '@/lib/types';

// 组件 Props 类型：使用 ProductFilterParams 替代 typeof filters
interface ProductFilterProps {
    tags: {
        cycles: CycleTag[];
        quantTypes: QuantType[];
        algorithms: AlgorithmType[];
        strategies: StrategyType[];
    };
    filters: ProductFilterParams; // 直接使用定义好的类型
    onFilterChange: (filters: Partial<ProductFilterParams>) => void; // 这里不再自引用
}

export default function ProductFilter({ tags, filters, onFilterChange }: ProductFilterProps) {
    // 原有逻辑不变，仅类型注解修复
    const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
        onFilterChange({ search: e.target.value });
    };

    const handleSelectChange = (name: keyof ProductFilterParams, value: string) => {
        onFilterChange({ [name]: value });
    };

    const handleReset = () => {
        onFilterChange({
            cycle: '',
            quant_type: '',
            algorithm: '',
            strategy: '',
            search: '',
        });
    };

    // 渲染逻辑不变...
    return (
        <div className="space-y-4">
            <h3>筛选条件</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {/* 搜索框 */}
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">产品名称搜索</label>
                    <input
                        type="text"
                        value={filters.search}
                        onChange={handleSearchChange}
                        placeholder="输入产品名称关键词"
                        className="input-field"
                    />
                </div>

                {/* 周期标签筛选 */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">周期标签</label>
                    <select
                        value={filters.cycle}
                        onChange={(e) => handleSelectChange('cycle', e.target.value)}
                        className="select-field"
                    >
                        <option value="">全部</option>
                        {tags.cycles.map((cycle) => (
                            <option key={cycle.id} value={cycle.id.toString()}>
                                {cycle.cycle_name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* 其他筛选框逻辑不变... */}
                {/* 量化类型、算法类型、策略类型筛选框代码保留 */}
                {/* ... */}
                <div>
                    <label className="block text-sm font-medium text-gray-dark mb-1">量化类型</label>
                    <select
                        value={filters.quant_type}
                        onChange={(e) => handleSelectChange('quant_type', e.target.value)}
                        className="select-field"
                    >
                        <option value="">全部</option>
                        {tags.quantTypes.map((type) => (
                            <option key={type.id} value={type.id.toString()}>
                                {type.quant_name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* 算法类型筛选 */}
                <div>
                    <label className="block text-sm font-medium text-gray-dark mb-1">算法类型</label>
                    <select
                        value={filters.algorithm}
                        onChange={(e) => handleSelectChange('algorithm', e.target.value)}
                        className="select-field"
                    >
                        <option value="">全部</option>
                        {tags.algorithms.map((alg) => (
                            <option key={alg.id} value={alg.id.toString()}>
                                {alg.alg_name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="md:col-span-3 lg:col-span-2 lg:col-start-4">
                    <label className="block text-sm font-medium text-gray-dark mb-1">策略类型</label>
                    <div className="flex space-x-2">
                        <select
                            value={filters.strategy}
                            onChange={(e) => handleSelectChange('strategy', e.target.value)}
                            className="select-field flex-1"
                        >
                            <option value="">全部</option>
                            {tags.strategies.map((strategy) => (
                                <option key={strategy.id} value={strategy.id.toString()}>
                                    {strategy.strategy_name}
                                </option>
                            ))}
                        </select>
                        <button onClick={handleReset} className="btn-secondary">
                            重置筛选
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}