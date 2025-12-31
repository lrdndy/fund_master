import axios from 'axios';
import { ApiResponse, CycleTag, Product, ProductFormData, QuantType, AlgorithmType, StrategyType, ProductNetValue } from './types';

// 创建 axios 实例
const api = axios.create({
    baseURL: 'http://127.0.0.1:8000/api',
    headers: {
        'Content-Type': 'application/json', // 默认 JSON 格式
    },
});

// 请求拦截器：修复 localStorage 不存在问题 + 兼容 FormData 提交（核心修改）
api.interceptors.request.use((config) => {
    let token = null;
    if (typeof window !== 'undefined') {
        token = localStorage.getItem('fundAdminToken');
    }

    // 步骤1：手动初始化 config.headers，解决 TS18048
    if (!config.headers) { // 判断 config.headers 是否为 null/undefined
        config.headers = {};
    }

    // 步骤2：设置 Authorization（此时 config.headers 非 undefined）
    if (token) {
        config.headers.Authorization = `Token ${token}`;
    }

    // 步骤3：若请求数据是 FormData，删除默认的 Content-Type（此时 config.headers 非 undefined）
    if (config.data instanceof FormData) {
        delete config.headers['Content-Type'];
    }

    return config;
});

// 响应拦截器（保持不变）
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

// 通用下载工具函数（保持不变）
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

// productApi（保持不变）
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
    ): Promise<ApiResponse<ProductNetValue>> => {
        const params: Record<string, string | number> = {
            product_id: productId, // 匹配后端的product_id参数
        };
        // 可选传递日期范围，确保包含十月数据
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;

        const response = await api.get<ApiResponse<ProductNetValue>>('/net-values/by_date_range/', {
            params
        });
        return response.data;
    },

    exportNetValueCsv: async (
        productId: number,
        startDate?: string,
        endDate?: string
    ): Promise<{ blob: Blob; fileName: string }> => {
        const params: Record<string, string> = {};
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;

        try {
            const response = await api.get<ArrayBuffer>(`/products/${productId}/export_csv/`, {
                params,
                headers: { 'Accept': 'text/csv' },
                responseType: 'arraybuffer',
            });

            if (response.status !== 200) {
                const errorText = new TextDecoder().decode(response.data);
                const errorJson = JSON.parse(errorText);
                throw new Error(errorJson.error || `请求失败（状态码：${response.status}）`);
            }

            const blob = new Blob([response.data], { type: 'text/csv; charset=utf-8-sig' });
            let fileName = `${productId}_净值数据.csv`;
            const contentDisposition = response.headers['content-disposition'];
            if (contentDisposition) {
                const fileNameMatch = contentDisposition.match(/filename="?([^";]+)"?/);
                if (fileNameMatch && fileNameMatch[1]) {
                    fileName = decodeURIComponent(decodeURIComponent(fileNameMatch[1]));
                }
            }

            return { blob, fileName };
        } catch (err: any) {
            const parseBlobError = async (blob: Blob): Promise<string> => {
                try {
                    const errorText = await blob.text();
                    const errorJson = JSON.parse(errorText);
                    return errorJson.error || '下载失败';
                } catch {
                    return '下载失败：无法解析错误信息';
                }
            };

            if (err.response?.data instanceof Blob) {
                const errorMsg = await parseBlobError(err.response.data);
                throw new Error(errorMsg);
            } else if (err.response?.data?.error) {
                throw new Error(err.response.data.error);
            } else {
                throw new Error(err.message || '下载失败');
            }
        }
    },
};

// tagApi、authApi（保持不变）
export const tagApi = {
    getCycles: async (): Promise<ApiResponse<CycleTag>> => {
        const response = await api.get<ApiResponse<CycleTag>>('/cycle-tags/');
        return response.data;
    },
    getQuantTypes: async (): Promise<ApiResponse<QuantType>> => {
        const response = await api.get<ApiResponse<QuantType>>('/quant-types/');
        return response.data;
    },
    getAlgorithms: async (): Promise<ApiResponse<AlgorithmType>> => {
        const response = await api.get<ApiResponse<AlgorithmType>>('/algorithms/');
        return response.data;
    },
    getStrategies: async (): Promise<ApiResponse<StrategyType>> => {
        const response = await api.get<ApiResponse<StrategyType>>('/strategies/');
        return response.data;
    },
};

export const authApi = {
    getToken: async (username: string, password: string): Promise<{ token: string }> => {
        const response = await api.post<{ token: string }>('/token/', { username, password });
        return response.data;
    },
};

export const downloadUtils = {
    downloadBlobFile,
};

// 类型定义（保持不变）
interface CsvImportRowData {
    product_id: string;
    net_value_date: string;
    net_value: string;
    data_source?: string;
}

interface CsvImportResponse {
    message: string;
    summary: {
        total: number;
        success: number;
        failed: number;
        updated: number; // 新增：后端返回的覆盖更新数量
        created: number; // 新增：后端返回的全新创建数量
    };
    failed_records: Array<{
        row_num: number;
        data: CsvImportRowData;
        reason: string;
    }>;
}
interface SingleNetValueRequest {
    product: number;
    net_value_date: string;
    net_value: number | string;
    data_source?: string;
    is_valid?: boolean;
}

// netValueApi（简化 headers 配置，移除无用的 headers: {}）
export const netValueApi = {
    importNetValueCsv: async (
        productId: number,
        file: File,
        isCover: boolean = false // 新增：是否覆盖参数，默认不覆盖
    ): Promise<CsvImportResponse> => {
        // 前置校验（保持不变）
        if (!file || !(file instanceof File)) {
            throw new Error("无效的文件对象，请选择合法的CSV文件");
        }
        if (!file.name.endsWith(".csv")) {
            throw new Error("请选择后缀为.csv的文件");
        }

        // 构造 FormData（核心修改：追加is_cover字段，转字符串传递）
        const formData = new FormData();
        formData.append("file", file); // 保持原有文件字段
        formData.append("is_cover", String(isCover)); // 追加覆盖参数，转字符串匹配后端解析

        try {
            const requestUrl = `/net-values/csv_import/?target_product_id=${productId}`;
            // 依赖请求拦截器自动处理FormData（移除手动headers配置，保持不变）
            const response = await api.post<CsvImportResponse>(
                requestUrl,
                formData,
                { timeout: 30000 }
            );
            return response.data;
        } catch (err: unknown) {
            const errorRes = (err as any)?.response;
            if (errorRes?.data?.error) {
                throw new Error(errorRes.data.error);
            } else if ((err as any)?.message) {
                throw new Error((err as any).message);
            } else {
                throw new Error("CSV导入请求失败，请检查网络或后端服务");
            }
        }
    },
    createNetValue: async (data: SingleNetValueRequest): Promise<ProductNetValue> => {
        try {
            const response = await api.post<ProductNetValue>('/net-values/', data);
            return response.data;
        } catch (err: unknown) {
            const errorRes = (err as any)?.response;
            if (errorRes?.data?.error) {
                throw new Error(errorRes.data.error);
            } else if ((err as any)?.message) {
                throw new Error((err as any).message);
            } else {
                throw new Error("新增净值失败，请检查网络或后端服务");
            }
        }
    },

    // 新增：单条净值更新
    updateNetValue: async (
        id: number,
        data: SingleNetValueRequest
    ): Promise<ProductNetValue> => {
        try {
            const response = await api.patch<ProductNetValue>(`/net-values/${id}/`, data);
            return response.data;
        } catch (err: unknown) {
            const errorRes = (err as any)?.response;
            if (errorRes?.data?.error) {
                throw new Error(errorRes.data.error);
            } else if ((err as any)?.message) {
                throw new Error((err as any).message);
            } else {
                throw new Error("更新净值失败，请检查网络或后端服务");
            }
        }
    },

    // 新增：单条净值删除
    deleteNetValue: async (id: number): Promise<void> => {
        try {
            await api.delete(`/net-values/${id}/`);
        } catch (err: unknown) {
            const errorRes = (err as any)?.response;
            if (errorRes?.data?.error) {
                throw new Error(errorRes.data.error);
            } else if ((err as any)?.message) {
                throw new Error((err as any).message);
            } else {
                throw new Error("删除净值失败，请检查网络或后端服务");
            }
        }
    },

    // 新增：获取单条净值详情
    getNetValueById: async (id: number): Promise<ProductNetValue> => {
        try {
            const response = await api.get<ProductNetValue>(`/net-values/${id}/`);
            return response.data;
        } catch (err: unknown) {
            const errorRes = (err as any)?.response;
            if (errorRes?.data?.error) {
                throw new Error(errorRes.data.error);
            } else if ((err as any)?.message) {
                throw new Error((err as any).message);
            } else {
                throw new Error("获取净值详情失败，请检查网络或后端服务");
            }
        }
    }
};


export default api;