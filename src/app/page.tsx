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
import { useBasket } from '@/contexts/BasketContext';
import ProductList from '@/components/products/ProductList';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const DEFAULT_PAGE_SIZE = 20;

// 【合法React组件】默认导出，返回标准JSX
export default function HomePage() {
  const router = useRouter();
  const { currentBaskets, combinedProductIds } = useBasket();
  const [products, setProducts] = useState<Product[]>([]);
  // 篮子产品的完整 detail（独立 API 调用，绕开当前分页限制；置顶/只看/高亮都用这个 cache）
  const [basketProducts, setBasketProducts] = useState<Product[]>([]);
  // 是否只看篮子里的产品（filter）
  const [filterByBasket, setFilterByBasket] = useState(false);
  // 是否把篮子里的产品置顶（前置；篮筐外产品保持原顺序）
  const [pinBasket, setPinBasket] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0); // 子组件改了产品（如打标签）后 +1 触发重拉

  // 分页状态
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [totalCount, setTotalCount] = useState<number>(0);

  // 完整标签状态（包含customTags）
  const [tags, setTags] = useState<TagsState>({
    cycles: [],
    quantTypes: [],
    algorithms: [],
    strategies: [],
    fofOwnTags: [],
    customTags: [],
  });

  // filters 默认值（切走再回来要恢复，见下方 localStorage 持久化）
  const [filters, setFilters] = useState<ProductFilterParams>({
    cycle: '',
    quant_type: '',
    algorithm: '',
    strategy: '',
    fof_own: '',
    custom: '',
    search: '',
    ordering: '',
  });

  // 进入页面时恢复上次筛选 + 篮子视图开关（mount 后读，避免 SSR hydration mismatch）
  const [filtersRestored, setFiltersRestored] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem('home_product_filters');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<ProductFilterParams>;
        setFilters(prev => ({ ...prev, ...parsed }));
      } catch { /* ignore */ }
    }
    const savedView = localStorage.getItem('home_basket_view');
    if (savedView) {
      try {
        const v = JSON.parse(savedView) as { filterByBasket?: boolean; pinBasket?: boolean };
        if (typeof v.filterByBasket === 'boolean') setFilterByBasket(v.filterByBasket);
        if (typeof v.pinBasket === 'boolean') setPinBasket(v.pinBasket);
      } catch { /* ignore */ }
    }
    // 标记恢复完成；与上面 setState 同批生效，下一轮 render 后才允许持久化
    setFiltersRestored(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect
  }, []);

  // 筛选变化时持久化；恢复完成前不写，避免用默认空值覆盖上次保存
  useEffect(() => {
    if (!filtersRestored) return;
    localStorage.setItem('home_product_filters', JSON.stringify(filters));
  }, [filters, filtersRestored]);

  // 篮子视图开关（置顶 / 只看）持久化
  useEffect(() => {
    if (!filtersRestored) return;
    localStorage.setItem('home_basket_view', JSON.stringify({ filterByBasket, pinBasket }));
  }, [filterByBasket, pinBasket, filtersRestored]);

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

  // 加载产品列表（防抖筛选 + 分页）
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
        if (filters.custom) params.custom = filters.custom;
        if (filters.search) params.search = filters.search;
        if (filters.ordering) params.ordering = filters.ordering;

        params.page = String(page);
        params.page_size = String(pageSize);

        const res = await productApi.getProducts(params);
        const data = res as ApiResponse<Product>;
        setProducts(data.results ?? []);
        setTotalCount(data.count ?? 0);
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
  }, [filters, page, pageSize, reloadCounter]);

  // 当前选中篮子的产品 detail：绕过普通列表分页，按 ID 直接拉。
  // 这样无论篮筐产品在不在当前页，置顶/只看/高亮都能正常工作。
  const basketIdsKey = combinedProductIds.join(',');
  useEffect(() => {
    if (!basketIdsKey) {
      setBasketProducts([]);
      return;
    }
    void (async () => {
      try {
        const res = await productApi.getProducts({ ids: basketIdsKey, page_size: '2000' });
        setBasketProducts(res.results ?? []);
      } catch (err) {
        console.error('拉篮子产品失败', err);
        setBasketProducts([]);
      }
    })();
  }, [basketIdsKey]);

  // 筛选变更（重置到第一页）
  const handleFilterChange = (newFilters: Partial<ProductFilterParams>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setPage(1);
  };


  // 跳转新增产品
  const handleAddProduct = () => {
    router.push('/products/new');
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  // 生成紧凑分页数字（始终展示首尾页和当前页周围）
  const getPageNumbers = (): (number | 'ellipsis')[] => {
    const pages: (number | 'ellipsis')[] = [];
    const delta = 1;
    const range: number[] = [];
    for (let i = Math.max(2, page - delta); i <= Math.min(totalPages - 1, page + delta); i++) {
      range.push(i);
    }
    pages.push(1);
    if (range[0] && range[0] > 2) pages.push('ellipsis');
    pages.push(...range);
    if (range.length > 0 && range[range.length - 1] < totalPages - 1) pages.push('ellipsis');
    if (totalPages > 1) pages.push(totalPages);
    return pages;
  };

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPageSize(Number(e.target.value));
    setPage(1);
  };

  const startIndex = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, totalCount);

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

        {/* 当前篮子状态条（多选时合并显示） */}
        {currentBaskets.length > 0 && (
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded px-4 py-2 text-sm flex-wrap gap-2">
            <div className="text-blue-800">
              当前篮子：<span className="font-medium">{currentBaskets.map(b => b.name).join(' · ')}</span>
              <span className="text-xs text-blue-600 ml-2">
                （合并后 {combinedProductIds.length} 产品）
              </span>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs text-blue-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pinBasket}
                  onChange={e => setPinBasket(e.target.checked)}
                />
                置顶篮筐产品
              </label>
              <label className="flex items-center gap-1.5 text-xs text-blue-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterByBasket}
                  onChange={e => setFilterByBasket(e.target.checked)}
                />
                只看篮子里的产品
              </label>
            </div>
          </div>
        )}

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
              <>
                <ProductList
                    highlightIds={combinedProductIds}
                    products={(() => {
                        // 只看篮子产品：直接用独立拉的 basketProducts cache
                        if (filterByBasket && combinedProductIds.length > 0) {
                            const idx = new Map(combinedProductIds.map((id, i) => [id, i]));
                            return [...basketProducts].sort(
                                (a, b) => (idx.get(a.id) ?? Infinity) - (idx.get(b.id) ?? Infinity),
                            );
                        }
                        // 置顶：把 basketProducts 拼到当前页的前面 + 当前页里去掉重复的
                        if (pinBasket && combinedProductIds.length > 0 && basketProducts.length > 0) {
                            const basketSet = new Set(basketProducts.map(p => p.id));
                            const idx = new Map(combinedProductIds.map((id, i) => [id, i]));
                            const sortedBasket = [...basketProducts].sort(
                                (a, b) => (idx.get(a.id) ?? Infinity) - (idx.get(b.id) ?? Infinity),
                            );
                            const others = products.filter(p => !basketSet.has(p.id));
                            return [...sortedBasket, ...others];
                        }
                        // 默认：原列表，行内通过 highlightIds 加阴影标记
                        return products;
                    })()}
                    ordering={filters.ordering ?? ''}
                    onOrderingChange={(ordering) => handleFilterChange({ ordering })}
                    customTags={tags.customTags}
                    onProductUpdated={() => setReloadCounter(c => c + 1)}
                />

                {/* 分页控件 */}
                <div className="mt-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <span>
                      共 <span className="font-medium text-gray-800">{totalCount}</span> 条，
                      显示 {startIndex}-{endIndex}
                    </span>
                    <label className="flex items-center gap-2">
                      <span>每页</span>
                      <select
                          value={pageSize}
                          onChange={handlePageSizeChange}
                          className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {PAGE_SIZE_OPTIONS.map(size => (
                            <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                      <span>条</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                        onClick={() => setPage(1)}
                        disabled={!canPrev}
                        className="px-3 py-1 text-sm rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      首页
                    </button>
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={!canPrev}
                        className="px-3 py-1 text-sm rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      上一页
                    </button>

                    {getPageNumbers().map((p, idx) =>
                        p === 'ellipsis' ? (
                            <span key={`e-${idx}`} className="px-2 text-gray-400">…</span>
                        ) : (
                            <button
                                key={p}
                                onClick={() => setPage(p)}
                                className={`px-3 py-1 text-sm rounded border ${
                                    p === page
                                        ? 'bg-blue-600 border-blue-600 text-white'
                                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                }`}
                            >
                              {p}
                            </button>
                        )
                    )}

                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={!canNext}
                        className="px-3 py-1 text-sm rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      下一页
                    </button>
                    <button
                        onClick={() => setPage(totalPages)}
                        disabled={!canNext}
                        className="px-3 py-1 text-sm rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      末页
                    </button>
                  </div>
                </div>
              </>
          )}
        </div>
      </div>
  );
}
