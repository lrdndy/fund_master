import { ChangeEvent } from 'react';
import {
    CycleTag,
    QuantType,
    AlgorithmType,
    StrategyType,
    FofOwnTag,
    CustomTag, // 导入自定义标签类型
    ProductFilterParams
} from '@/lib/types';

// 完整匹配 TagsState 类型
interface ProductFilterProps {
    tags: {
        cycles: CycleTag[];
        quantTypes: QuantType[];
        algorithms: AlgorithmType[];
        strategies: StrategyType[];
        fofOwnTags: FofOwnTag[];
        customTags: CustomTag[]; // 自定义标签
    };
    filters: ProductFilterParams;
    onFilterChange: (filters: Partial<ProductFilterParams>) => void;
}

export default function ProductFilter({ tags, filters, onFilterChange }: ProductFilterProps) {
    const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
        onFilterChange({ search: e.target.value });
    };

    const handleSelectChange = (name: keyof ProductFilterParams, value: string) => {
        onFilterChange({ [name]: value });
    };

    // 重置所有筛选（包含 custom）
    const handleReset = () => {
        onFilterChange({
            cycle: '',
            quant_type: '',
            algorithm: '',
            strategy: '',
            fof_own: '',
            custom: '',
            search: '',
            ordering: '',
        });
    };

    return (
        <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">筛选条件</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4">
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

                {/* 周期标签 */}
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

                {/* 量化类型 */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">量化类型</label>
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

                {/* 算法类型 */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">算法类型</label>
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

                {/* 策略类型 */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">策略类型</label>
                    <select
                        value={filters.strategy}
                        onChange={(e) => handleSelectChange('strategy', e.target.value)}
                        className="select-field"
                    >
                        <option value="">全部</option>
                        {tags.strategies.map((strategy) => (
                            <option key={strategy.id} value={strategy.id.toString()}>
                                {strategy.strategy_name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* FOF 归属 */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">FOF 归属</label>
                    <select
                        value={filters.fof_own ?? ''}
                        onChange={(e) => handleSelectChange('fof_own', e.target.value)}
                        className="select-field"
                    >
                        <option value="">全部</option>
                        {tags.fofOwnTags.map((fof) => (
                            <option key={fof.id} value={fof.id.toString()}>
                                {fof.fof_name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* 🔥 新增：CustomTag 自定义标签筛选 */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">自定义标签</label>
                    <select
                        value={filters.custom}
                        onChange={(e) => handleSelectChange('custom', e.target.value)}
                        className="select-field"
                    >
                        <option value="">全部</option>
                        {tags.customTags.map((item) => (
                            <option key={item.id} value={item.id.toString()}>
                                {item.tag_name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* 排序：最近一月收益率（窗口=今天往前 30 天） */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">排序</label>
                    <select
                        value={filters.ordering ?? ''}
                        onChange={(e) => handleSelectChange('ordering', e.target.value)}
                        className="select-field"
                    >
                        <option value="">默认</option>
                        <option value="-return_1m">最近一月收益率（高 → 低）</option>
                        <option value="return_1m">最近一月收益率（低 → 高）</option>
                    </select>
                </div>

                {/* 操作按钮 */}
                <div className="md:col-span-2 lg:col-span-2 lg:col-start-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">操作</label>
                    <div className="flex space-x-2">
                        <button onClick={handleReset} className="btn-secondary flex-1">
                            重置筛选
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}