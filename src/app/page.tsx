//src/app/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Product,
  TagsState,
  ApiResponse,
  CycleTag,
  QuantType,
  AlgorithmType,
  StrategyType,
  FofOwnTag,
  CustomTag,
  ProductFilterParams
} from '@/lib/types';
import { productApi, tagApi } from '@/lib/api';
import ProductFilter from '@/components/products/ProductFilter';
import ProductList from '@/components/products/ProductList';

// 【合法React组件】默认导出，返回标准JSX
export default function HomePage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // 完整标签状态（包含customTags）
  const [tags, setTags] = useState<TagsState>({
    cycles: [],
    quantTypes: [],
    algorithms: [],
    strategies: [],
    fofOwnTags: [],
    customTags: [],
  });

  // 🔥 修复：添加 custom: ''
  const [filters, setFilters] = useState<ProductFilterParams>({
    cycle: '',
    quant_type: '',
    algorithm: '',
    strategy: '',
    fof_own: '',
    custom: '', // ✅ 这里加上
    search: '',
  });

  // 加载所有标签数据
  useEffect(() => {
    const loadTags = async () => {
      try {
        const [cyclesRes, quantRes, algRes, strategyRes, fofRes, customRes] = await Promise.all([
          tagApi.getCycles(),
          tagApi.getQuantTypes(),
          tagApi.getAlgorithms(),
          tagApi.getStrategies(),
          tagApi.getFofOwnTags(),
          tagApi.getCustomTags(),
        ]);

        setTags({
          cycles: (cyclesRes as ApiResponse<CycleTag>).results ?? [],
          quantTypes: (quantRes as ApiResponse<QuantType>).results ?? [],
          algorithms: (algRes as ApiResponse<AlgorithmType>).results ?? [],
          strategies: (strategyRes as ApiResponse<StrategyType>).results ?? [],
          fofOwnTags: (fofRes as ApiResponse<FofOwnTag>).results ?? [],
          customTags: (customRes as ApiResponse<CustomTag>).results ?? [],
        });
      } catch (err) {
        setError('标签数据加载失败');
        console.error(err);
      }
    };

    void loadTags();
  }, []);

  // 加载产品列表（防抖筛选）
  useEffect(() => {
    const loadProducts = async () => {
      setLoading(true);
      try {
        const params: Record<string, string> = {};
        if (filters.cycle) params.cycle = filters.cycle;
        if (filters.quant_type) params.quant_type = filters.quant_type;
        if (filters.algorithm) params.algorithm = filters.algorithm;
        if (filters.strategy) params.strategy = filters.strategy;
        if (filters.fof_own) params.fof_own = filters.fof_own;
        if (filters.custom) params.custom = filters.custom; // ✅ 这里也加上
        if (filters.search) params.search = filters.search;

        const res = await productApi.getProducts(params);
        setProducts((res as ApiResponse<Product>).results ?? []);
        setError(null);
      } catch (err) {
        setError('产品数据加载失败，请重试');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(loadProducts, 300);
    return () => clearTimeout(timer);
  }, [filters]);

  // 筛选变更
  const handleFilterChange = (newFilters: Partial<ProductFilterParams>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  // 跳转新增产品
  const handleAddProduct = () => {
    router.push('/products/new');
  };

  return (
      <div className="space-y-6 p-4 max-w-7xl mx-auto">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-800">产品管理</h1>
          <button
              onClick={handleAddProduct}
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
          >
            添加产品
          </button>
        </div>

        <div className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
          <ProductFilter tags={tags} filters={filters} onFilterChange={handleFilterChange} />
        </div>

        <div className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
          {loading ? (
              <div className="flex justify-center py-10 text-gray-500">加载中...</div>
          ) : error ? (
              <div className="flex justify-center py-10 text-red-600">{error}</div>
          ) : products.length === 0 ? (
              <div className="flex justify-center py-10 text-gray-500">暂无匹配产品</div>
          ) : (
              <ProductList products={products} />
          )}
        </div>
      </div>
  );
}