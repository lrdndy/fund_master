//api.ts
import axios from 'axios';
import {
    ApiResponse, CycleTag, Product, ProductFormData, QuantType,
    AlgorithmType, StrategyType, ProductNetValue, ProductCorrelation,
    NetValueApiResponse, CsvImportResponse, SingleNetValueRequest, UserInfo, FofOwnTag, CustomTag,
    BenchmarkIndex, BenchmarkNetValuePoint, BenchmarkIndexInput, BenchmarkCsvImportResponse,
    BenchmarkMissingDatesResponse, BenchmarkUpsertResponse, BenchmarkFetchTushareResponse,
    Basket, BasketInput
} from './types';

// axios实例配置（对齐后端路由，无/api前缀）
const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || '/api',
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 30000
});

// 请求拦截器
api.interceptors.request.use((config) => {
    let token = null;
    if (typeof window !== 'undefined') {
        token = localStorage.getItem('fundAdminToken');
    }

    if (!config.headers) config.headers = {};
    if (token) config.headers.Authorization = `Token ${token}`;
    if (config.data instanceof FormData) delete config.headers['Content-Type'];

    return config;
});

// 响应拦截器
api.interceptors.response.use(
    (response) => response,
    (error) => {
        console.error('API Error:', error.response?.data || error.message);
        if (typeof window !== 'undefined' && error.response?.status === 401) {
            localStorage.removeItem('fundAdminToken');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

// 下载工具函数
const downloadBlobFile = (blob: Blob, defaultFileName: string): void => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

// ==================== 产品 API ====================
export const productApi = {
    getProducts: async (params?: Record<string, string>): Promise<ApiResponse<Product>> => {
        const response = await api.get<ApiResponse<Product>>('/products/', { params });
        return response.data;
    },
    createProduct: async (data: ProductFormData): Promise<Product> => {
        const response = await api.post<Product>('/products/', data);
        return response.data;
    },
    getProductById: async (id: number): Promise<Product> => {
        const response = await api.get<Product>(`/products/${id}/`);
        return response.data;
    },
    getNetValuesByProductId: async (
        productId: number,
        startDate?: string,
        endDate?: string
    ): Promise<NetValueApiResponse<ProductNetValue>> => {
        const params: Record<string, string | number> = { product_id: productId };
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;
        const response = await api.get<NetValueApiResponse<ProductNetValue>>('/net-values/by_date_range/', { params });
        return response.data;
    },
    updateProduct: async (id: number, data: Partial<Product>): Promise<Product> => {
        const response = await api.patch<Product>(`/products/${id}/`, data);
        return response.data;
    },
    exportNetValueCsv: async (productId: number, startDate?: string, endDate?: string) => {
        const params: Record<string, string> = {};
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;
        const response = await api.get(`/products/${productId}/export_csv/`, {
            params, responseType: 'blob'
        });
        return { blob: response.data, fileName: response.headers['content-disposition'] };
    }
};

// ==================== 标签 API ====================
export const tagApi = {
    getCycles: async (): Promise<ApiResponse<CycleTag>> => {
        const res = await api.get<ApiResponse<CycleTag>>('/cycle-tags/');
        return res.data;
    },
    getQuantTypes: async (): Promise<ApiResponse<QuantType>> => {
        const res = await api.get<ApiResponse<QuantType>>('/quant-types/');
        return res.data;
    },
    getAlgorithms: async (): Promise<ApiResponse<AlgorithmType>> => {
        const res = await api.get<ApiResponse<AlgorithmType>>('/algorithms/');
        return res.data;
    },
    getStrategies: async (): Promise<ApiResponse<StrategyType>> => {
        const res = await api.get<ApiResponse<StrategyType>>('/strategies/');
        return res.data;
    },
    createCycle: async (data: Partial<CycleTag>): Promise<CycleTag> => {
        const res = await api.post<CycleTag>('/cycle-tags/', data);
        return res.data;
    },
    updateCycle: async (id: number, data: Partial<CycleTag>): Promise<CycleTag> => {
        const res = await api.patch<CycleTag>(`/cycle-tags/${id}/`, data);
        return res.data;
    },
    // 🔥 修复：delete请求显式await+返回void，解决类型不匹配
    deleteCycle: async (id: number): Promise<void> => {
        await api.delete(`/cycle-tags/${id}/`);
    },
    createQuantType: async (data: Partial<QuantType>): Promise<QuantType> => {
        const res = await api.post<QuantType>('/quant-types/', data);
        return res.data;
    },
    updateQuantType: async (id: number, data: Partial<QuantType>): Promise<QuantType> => {
        const res = await api.patch<QuantType>(`/quant-types/${id}/`, data);
        return res.data;
    },
    deleteQuantType: async (id: number): Promise<void> => {
        await api.delete(`/quant-types/${id}/`);
    },
    createAlgorithm: async (data: Partial<AlgorithmType>): Promise<AlgorithmType> => {
        const res = await api.post<AlgorithmType>('/algorithms/', data);
        return res.data;
    },
    updateAlgorithm: async (id: number, data: Partial<AlgorithmType>): Promise<AlgorithmType> => {
        const res = await api.patch<AlgorithmType>(`/algorithms/${id}/`, data);
        return res.data;
    },
    deleteAlgorithm: async (id: number): Promise<void> => {
        await api.delete(`/algorithms/${id}/`);
    },
    createStrategy: async (data: Partial<StrategyType>): Promise<StrategyType> => {
        const res = await api.post<StrategyType>('/strategies/', data);
        return res.data;
    },
    updateStrategy: async (id: number, data: Partial<StrategyType>): Promise<StrategyType> => {
        const res = await api.patch<StrategyType>(`/strategies/${id}/`, data);
        return res.data;
    },
    deleteStrategy: async (id: number): Promise<void> => {
        await api.delete(`/strategies/${id}/`);
    },
    getFofOwnTags: async (): Promise<ApiResponse<FofOwnTag>> => {
        const res = await api.get<ApiResponse<FofOwnTag>>('/fof-tags/');
        return res.data;
    },
    createFofOwnTag: async (data: Partial<FofOwnTag>): Promise<FofOwnTag> => {
        const res = await api.post<FofOwnTag>('/fof-tags/', data);
        return res.data;
    },
    updateFofOwnTag: async (id: number, data: Partial<FofOwnTag>): Promise<FofOwnTag> => {
        const res = await api.patch<FofOwnTag>(`/fof-tags/${id}/`, data);
        return res.data;
    },
    deleteFofOwnTag: async (id: number): Promise<void> => {
        await api.delete(`/fof-tags/${id}/`);
    },
    getCustomTags: async (): Promise<ApiResponse<CustomTag>> => {
        const res = await api.get<ApiResponse<CustomTag>>('/custom-tags/');
        return res.data;
    },
    createCustomTag: async (data: Partial<CustomTag>): Promise<CustomTag> => {
        const res = await api.post<CustomTag>('/custom-tags/', data);
        return res.data;
    },
    updateCustomTag: async (id: number, data: Partial<CustomTag>): Promise<CustomTag> => {
        const res = await api.patch<CustomTag>(`/custom-tags/${id}/`, data);
        return res.data;
    },
    deleteCustomTag: async (id: number): Promise<void> => {
        await api.delete(`/custom-tags/${id}/`);
    },
};


// ==================== 认证 API ====================
export const authApi = {
    getToken: async (username: string, password: string): Promise<{ token: string }> => {
        const res = await api.post<{ token: string }>('/token/', { username, password });
        return res.data;
    },
    getUserInfo: async (): Promise<UserInfo> => {
        const res = await api.get<UserInfo>('/user/info/');
        return res.data;
    }

};

// ==================== 相关性 API ====================
export const correlationApi = {
    getCorrelationsByProducts: async (productIds: number[]): Promise<ApiResponse<ProductCorrelation>> => {
        const params = { product1__in: productIds.join(','), product2__in: productIds.join(',') };
        const res = await api.get<ApiResponse<ProductCorrelation>>('/correlations/', { params });
        return res.data;
    },
    getByCoefficient: async (min_coeff: number, max_coeff: number) => {
        const res = await api.get('/correlations/by_coefficient_range/', { params: { min_coeff, max_coeff } });
        return res.data;
    }
};

// ==================== 净值 API ====================
export const netValueApi = {
    importNetValueCsv: async (productId: number, file: File, isCover = false): Promise<CsvImportResponse> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('is_cover', String(isCover));
        const res = await api.post<CsvImportResponse>(`/net-values/csv_import/?target_product_id=${productId}`, formData);
        return res.data;
    },
    createNetValue: async (data: SingleNetValueRequest): Promise<ProductNetValue> => {
        const res = await api.post<ProductNetValue>('/net-values/', data);
        return res.data;
    },
    updateNetValue: async (id: number, data: SingleNetValueRequest): Promise<ProductNetValue> => {
        const res = await api.patch<ProductNetValue>(`/net-values/${id}/`, data);
        return res.data;
    },
    deleteNetValue: async (id: number): Promise<void> => {
        await api.delete(`/net-values/${id}/`);
    },
    // 🔥 修复：显式声明返回类型，解决unknown赋值错误
    getNetValueById: async (id: number): Promise<ProductNetValue> => {
        const res = await api.get<ProductNetValue>(`/net-values/${id}/`);
        return res.data;
    },
};

// ==================== 基准指数 API ====================
export const benchmarkApi = {
    getBenchmarks: async (params: { search?: string; include_invalid?: boolean } = {}): Promise<ApiResponse<BenchmarkIndex>> => {
        const query: Record<string, string> = {};
        if (params.search) query.search = params.search;
        if (params.include_invalid) query.include_invalid = '1';
        const res = await api.get<ApiResponse<BenchmarkIndex>>('/benchmarks/', { params: query });
        return res.data;
    },
    getBenchmark: async (id: number): Promise<BenchmarkIndex> => {
        const res = await api.get<BenchmarkIndex>(`/benchmarks/${id}/`);
        return res.data;
    },
    createBenchmark: async (data: BenchmarkIndexInput): Promise<BenchmarkIndex> => {
        const res = await api.post<BenchmarkIndex>('/benchmarks/', data);
        return res.data;
    },
    updateBenchmark: async (id: number, data: Partial<BenchmarkIndexInput>): Promise<BenchmarkIndex> => {
        const res = await api.patch<BenchmarkIndex>(`/benchmarks/${id}/`, data);
        return res.data;
    },
    deleteBenchmark: async (id: number): Promise<void> => {
        await api.delete(`/benchmarks/${id}/`);
    },
    getBenchmarkNetValues: async (
        id: number,
        startDate?: string,
        endDate?: string,
    ): Promise<{ count: number; results: BenchmarkNetValuePoint[] }> => {
        const params: Record<string, string> = {};
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;
        const res = await api.get<{ count: number; results: BenchmarkNetValuePoint[] }>(
            `/benchmarks/${id}/net_values/`,
            { params },
        );
        return res.data;
    },
    importBenchmarkNetValuesCsv: async (
        indexId: number,
        file: File,
        isCover = false,
    ): Promise<BenchmarkCsvImportResponse> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('is_cover', String(isCover));
        const res = await api.post<BenchmarkCsvImportResponse>(
            `/benchmarks/csv_import/?target_index_id=${indexId}`,
            formData,
        );
        return res.data;
    },
    upsertBenchmarkNetValue: async (
        indexId: number,
        netValueDate: string,
        closePrice: number,
    ): Promise<BenchmarkUpsertResponse> => {
        const res = await api.post<BenchmarkUpsertResponse>(
            `/benchmarks/${indexId}/upsert_net_value/`,
            { net_value_date: netValueDate, close_price: closePrice },
        );
        return res.data;
    },
    deleteBenchmarkNetValue: async (indexId: number, netValueDate: string): Promise<void> => {
        await api.delete(`/benchmarks/${indexId}/delete_net_value/`, {
            params: { net_value_date: netValueDate },
        });
    },
    exportBenchmarkCsv: async (indexId: number, start?: string, end?: string): Promise<{ blob: Blob; fileName: string }> => {
        const params: Record<string, string> = {};
        if (start) params.start = start;
        if (end) params.end = end;
        const res = await api.get(`/benchmarks/${indexId}/export_csv/`, { params, responseType: 'blob' });
        return { blob: res.data as Blob, fileName: res.headers['content-disposition'] ?? '' };
    },
    getBenchmarkMissingDates: async (
        indexId: number,
        start?: string,
        end?: string,
    ): Promise<BenchmarkMissingDatesResponse> => {
        const params: Record<string, string> = {};
        if (start) params.start = start;
        if (end) params.end = end;
        const res = await api.get<BenchmarkMissingDatesResponse>(
            `/benchmarks/${indexId}/missing_dates/`,
            { params },
        );
        return res.data;
    },
    fetchBenchmarkFromTushare: async (
        indexId: number,
        startDate?: string,
        endDate?: string,
    ): Promise<BenchmarkFetchTushareResponse> => {
        const body: Record<string, string> = {};
        if (startDate) body.start_date = startDate;
        if (endDate) body.end_date = endDate;
        const res = await api.post<BenchmarkFetchTushareResponse>(
            `/benchmarks/${indexId}/fetch_tushare/`,
            body,
        );
        return res.data;
    },
};

// ==================== 篮子 (Basket) API ====================
export const basketApi = {
    getBaskets: async (): Promise<ApiResponse<Basket>> => {
        const res = await api.get<ApiResponse<Basket>>('/baskets/');
        return res.data;
    },
    createBasket: async (data: BasketInput): Promise<Basket> => {
        const res = await api.post<Basket>('/baskets/', data);
        return res.data;
    },
    updateBasket: async (id: number, data: Partial<BasketInput>): Promise<Basket> => {
        const res = await api.patch<Basket>(`/baskets/${id}/`, data);
        return res.data;
    },
    deleteBasket: async (id: number): Promise<void> => {
        await api.delete(`/baskets/${id}/`);
    },
};

export const downloadUtils = { downloadBlobFile };
export default api;