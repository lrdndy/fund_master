// 标签字典类型
export interface CycleTag {
    id: number; // 后端实际返回的唯一标识（替代之前的 cycle_id）
    cycle_name: string; // 后端字段，无需修改
    cycle_desc: string; // 后端字段，无需修改
    // 可选：保留后端返回的其他字段（不影响使用，按需添加）
    create_time?: string;
    update_time?: string;
}

export interface QuantType {
    id: number; // 替代 quant_id
    quant_name: string;
    quant_desc: string;
    create_time?: string;
    update_time?: string;
}
export interface ProductCorrelation {
    id: number;
    product1: number;
    product1_name: string;
    product2: number;
    product2_name: string;
    start_date: string;
    end_date: string;
    correlation_coefficient: number;
    calculation_time: string;
    is_valid: boolean;
}

export interface ProductNetValue {
    id: number;
    product: number;
    product_name: string;
    net_value_date: string; // 日期格式：YYYY-MM-DD
    net_value: number;
    data_source: string | null;
    is_valid: boolean;
    create_time: string;
}

export interface NetValueApiResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

export interface AlgorithmType {
    id: number; // 替代 alg_id
    alg_name: string; // 按后端实际字段名（如果后端是 algorithm_name 则用这个，若为 alg_name 则对应修改）
    alg_desc: string;
    create_time?: string;
    update_time?: string;
}

export interface StrategyType {
    id: number; // 替代 strategy_id
    strategy_name: string;
    strategy_desc: string;
    create_time?: string;
    update_time?: string;
}
export interface TagsState {
    cycles: CycleTag[];
    quantTypes: QuantType[];
    algorithms: AlgorithmType[];
    strategies: StrategyType[];
}

// 产品类型
export interface Product {
    id: number;
    product_name: string;
    cycle: number;
    cycle_name: string;
    quant_type: number;
    quant_type_name: string;
    algorithm: number;
    algorithm_name: string;
    strategy: number;
    strategy_name: string;
    score: number | string; // 兼容数字/字符串格式
    product_desc: string | null;
    is_valid: boolean;
    create_time: string;
    update_time: string;
}

// 添加/编辑产品表单类型
export interface ProductFormData {
    product_name: string;
    cycle_name_input: string;
    quant_type_name_input: string;
    algorithm_name_input: string;
    strategy_name_input: string;
    score: number;
    product_desc: string;
}

// API 响应通用类型
export interface ApiResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

export interface ProductFilterParams {
    cycle: string;       // 周期标签ID（字符串格式，适配URL参数）
    quant_type: string;  // 量化类型ID
    algorithm: string;   // 算法类型ID
    strategy: string;    // 策略类型ID
    search: string;      // 搜索关键词
}

// 定义并导出 TagsState
export interface TagsState {
    cycles: CycleTag[];
    quantTypes: QuantType[];
    algorithms: AlgorithmType[];
    strategies: StrategyType[];
}