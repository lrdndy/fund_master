// @/lib/api.ts
import axios from 'axios';
import { ApiResponse, CycleTag, Product, ProductFormData, QuantType, AlgorithmType, StrategyType, ProductNetValue } from './types';

// 创建 axios 实例
const api = axios.create({
    baseURL: 'http://127.0.0.1:8000/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

// 请求拦截器：修复 localStorage 不存在问题（核心修改）
api.interceptors.request.use((config) => {
    // 关键：先判断是否在浏览器环境（有 window 对象），再获取 localStorage
    let token = null;
    if (typeof window !== 'undefined') {
        token = localStorage.getItem('fundAdminToken');
    }

    if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Token ${token}`;
    }
    return config;
});

// 响应拦截器（保持不变）
api.interceptors.response.use(
    (response) => response,
    (error) => {
        console.error('API Error:', error.response?.data || error.message);
        // 此处也需判断 window 存在，避免服务端报错
        if (typeof window !== 'undefined' && error.response?.status === 401) {
            localStorage.removeItem('fundAdminToken');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

// productApi（保持原有方法，新增 getNetValuesByProductId）
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
    // 新增：获取指定产品净值
    getNetValuesByProductId: async (productId: number): Promise<ApiResponse<ProductNetValue>> => {
        const response = await api.get<ApiResponse<ProductNetValue>>('/net-values/', {
            params: { product: productId }
        });
        return response.data;
    },
};

// 其余 tagApi、authApi 保持不变
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

export default api;