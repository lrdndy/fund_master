'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Product, CycleTag, QuantType, AlgorithmType, StrategyType } from '@/lib/types'; // 导入所有需要的类型
import { productApi, tagApi } from '@/lib/api';
import ProductFilter from '@/components/products/ProductFilter';
import ProductList from '@/components/products/ProductList';

// 显式定义 tags 状态的类型（关键！）
interface TagsState {
  cycles: CycleTag[];
  quantTypes: QuantType[];
  algorithms: AlgorithmType[];
  strategies: StrategyType[];
}

export default function HomePage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 显式指定类型为 TagsState（解决 never[] 问题）
  const [tags, setTags] = useState<TagsState>({
    cycles: [],
    quantTypes: [],
    algorithms: [],
    strategies: [],
  });

  const [filters, setFilters] = useState({
    cycle: '',
    quant_type: '',
    algorithm: '',
    strategy: '',
    search: '',
  });

  // 加载标签数据（无需修改，现在类型匹配）
  useEffect(() => {
    const loadTags = async () => {
      try {
        const [cyclesRes, quantRes, algRes, strategyRes] = await Promise.all([
          tagApi.getCycles(),
          tagApi.getQuantTypes(),
          tagApi.getAlgorithms(),
          tagApi.getStrategies(),
        ]);
        setTags({
          cycles: cyclesRes.results, // 现在类型匹配：CycleTag[] → CycleTag[]
          quantTypes: quantRes.results,
          algorithms: algRes.results,
          strategies: strategyRes.results,
        });
      } catch (err) {
        setError('标签数据加载失败');
        console.error(err);
      }
    };
    loadTags();
  }, []);

  // 其余代码不变...
  useEffect(() => {
    const loadProducts = async () => {
      setLoading(true);
      try {
        // 构造筛选参数（后端支持的字段）
        const params: Record<string, string> = {};
        if (filters.cycle) params.cycle = filters.cycle;
        if (filters.quant_type) params.quant_type = filters.quant_type;
        if (filters.algorithm) params.algorithm = filters.algorithm;
        if (filters.strategy) params.strategy = filters.strategy;
        if (filters.search) params.search = filters.search;

        const res = await productApi.getProducts(params);
        setProducts(res.results);
        setError(null);
      } catch (err) {
        setError('产品数据加载失败，请重试');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    // 筛选条件变化时延迟加载（防抖）
    const timer = setTimeout(loadProducts, 300);
    return () => clearTimeout(timer);
  }, [filters]);

  // 处理筛选条件变化
  const handleFilterChange = (newFilters: Partial<typeof filters>) => {
    setFilters({ ...filters, ...newFilters });
  };

  // 跳转到添加产品页面
  const handleAddProduct = () => {
    router.push('/products/new');
  };

  return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1>产品管理</h1>
          <button onClick={handleAddProduct} className="btn-primary">
            添加产品
          </button>
        </div>

        {/* 筛选组件 */}
        <div className="card">
          <ProductFilter
              tags={tags}
              filters={filters}
              onFilterChange={handleFilterChange}
          />
        </div>

        {/* 产品列表 */}
        <div className="card">
          {loading ? (
              <div className="flex justify-center py-10">
                <span className="text-gray-500">加载中...</span>
              </div>
          ) : error ? (
              <div className="flex justify-center py-10 text-danger">
                {error}
              </div>
          ) : products.length === 0 ? (
              <div className="flex justify-center py-10 text-gray-500">
                暂无匹配产品
              </div>
          ) : (
              <ProductList products={products} />
          )}
        </div>
      </div>
  );
}