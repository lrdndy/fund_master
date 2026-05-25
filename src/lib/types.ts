//types.ts
export interface CycleTag {
    id: number;
    cycle_name: string;
    cycle_desc: string | null;
    create_time?: string;
    update_time?: string;
}
export interface FofOwnTag {
    id: number;
    fof_name: string;
    fof_desc: string | null;
    create_time?: string;
    update_time?: string;
}

export interface CustomTag {
    id: number;
    tag_name: string;
    tag_desc?: string;
    permission: 'public' | 'private';
    full_path: string;
    parent?: number | null;
    children?: CustomTag[];
    username?: string;
    create_time: string;
    update_time: string;
}
export interface QuantType {
    id: number;
    quant_name: string;
    quant_desc: string | null;
    create_time?: string;
    update_time?: string;
}

export interface AlgorithmType {
    id: number;
    alg_name: string;
    alg_desc: string | null;
    create_time?: string;
    update_time?: string;
}

export interface StrategyType {
    id: number;
    strategy_name: string;
    strategy_desc: string | null;
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
    correlation_coefficient: number | null;
    calculation_time: string;
    is_valid: boolean;
}

export interface ProductNetValue {
    id: number;
    product: number;
    product_name: string;
    product_code: string;
    net_value_date: string;
    net_value: number | null;
    cumulative_unit_net_value: number | null;
    email_id: string | null;
    email_subject: string | null;
    email_date: string | null;
    attachment_filename: string | null;
    parse_mode: string;
    data_source: string | null;
    is_valid: boolean;
    create_time: string;
}

export interface Product {
    id: number;
    product_code: string;
    product_name: string;
    cycle: number;
    cycle_name: string;
    quant_type: number;
    quant_type_name: string;
    algorithm: number;
    algorithm_name: string;
    strategy: number;
    strategy_name: string;
    fof_own?: number | null;
    fof_own_name?: string;
    custom_tags?: CustomTag[];
    custom_tag_ids?: number[];
    return_1m?: number | null;
    score: number | string;
    product_desc: string | null;
    is_valid: boolean;
    create_time: string;
    update_time: string;
}

export interface ProductFormData {
    product_code: string;
    product_name: string;
    cycle_name_input: string;
    quant_type_name_input: string;
    algorithm_name_input: string;
    strategy_name_input: string;
    fof_own_name_input?: string;
    score: number;
    product_desc: string;
}

export interface ApiResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

export interface BenchmarkIndex {
    id: number;
    index_code: string;
    index_name: string;
    index_short_name?: string | null;
    exchange?: string | null;
    em_secid_override?: string | null;
    is_valid: boolean;
    create_time?: string;
    update_time?: string;
}

export type BenchmarkExchange = 'SH' | 'SZ' | 'CSI' | 'BJ' | 'MOCK';

export interface BenchmarkIndexInput {
    index_code: string;
    index_name: string;
    index_short_name?: string;
    exchange?: BenchmarkExchange | '';
    em_secid_override?: string;
    is_valid?: boolean;
}

export interface BenchmarkCsvImportResponse {
    code: number;
    message: string;
    summary?: { total: number; success: number; failed: number; created: number; updated: number };
    failed_records?: Array<{ row_num: number; data: Record<string, string>; reason: string }>;
}

export interface BenchmarkMissingDatesResponse {
    start: string | null;
    end: string;
    missing_dates: string[];
    weekday_count: number; // 范围内工作日总数（周一~周五）
}

export interface BenchmarkUpsertResponse {
    code: number;
    message: string;
    result?: { net_value_date: string; close_price: string; created: boolean };
}

export interface BenchmarkNetValuePoint {
    net_value_date: string;
    close_price: number | string;
}

export interface NetValueApiResponse<T> {
    count: number;
    results: T[];
}

export interface ProductFilterParams {
    cycle: string;
    quant_type: string;
    algorithm: string;
    strategy: string;
    fof_own: string;
    search: string;
    custom: string;
    is_valid?: string;
    ordering?: string; // 排序，如 '-return_1m'（近一月收益降序）/ 'return_1m'（升序）/ '' 默认
}

export interface TagsState {
    cycles: CycleTag[];
    quantTypes: QuantType[];
    algorithms: AlgorithmType[];
    strategies: StrategyType[];
    fofOwnTags: FofOwnTag[];
    customTags: CustomTag[];
}

export interface CsvImportRowData {
    product_id: string;
    net_value_date: string;
    net_value: string;
    data_source?: string;
    is_valid?: string;
}

export interface CsvImportResponse {
    message: string;
    summary: {
        total: number;
        success: number;
        failed: number;
        updated: number;
        created: number;
    };
    failed_records: Array<{
        row_num: number;
        data: CsvImportRowData;
        reason: string;
    }>;
    code: number;
    import_success: number;
    import_failed: number;
    error_details: any[];
}
// 🔥 新增：定义用户信息类型（和useAuth保持一致）
export interface UserInfo {
    username: string;
    is_admin: boolean;
    is_product_op: boolean;
    is_client: boolean;
    is_analyst: boolean;
    groups: string[];
}
export interface SingleNetValueRequest {
    product: number;
    net_value_date: string;
    net_value: number | string;
    cumulative_unit_net_value?: number | string;
    data_source?: string;
    is_valid?: boolean;
}