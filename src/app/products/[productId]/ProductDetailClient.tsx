'use client';
import { useEffect, useState } from 'react';
import { productApi, downloadUtils, netValueApi, benchmarkApi } from '@/lib/api';
import NetValueChart, { NetValueSeries } from '@/components/products/NetValueChart';
import ProductMetrics, { NamedSeries } from '@/components/products/ProductMetrics';
import { Product, ProductNetValue, CustomTag, BenchmarkIndex, BenchmarkNetValuePoint } from '@/lib/types';
import { notFound } from 'next/navigation';
import ProductNetValueManager from "@/components/products/ProductNetValueManager";
import useProductTags from '@/hooks/useProductTags';
import useAuth from '@/hooks/useAuth';

interface EditFormData {
    product_code: string;
    product_name: string;
    score: number;
    product_desc: string;
    cycle: number;
    quant_type: number;
    algorithm: number;
    strategy: number;
    fof_own?: number | null;
    custom_tag_ids: number[];
}

interface ProductDetailClientProps {
    initialProductId: string;
}

const getErrorMessage = (err: unknown): string => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'object' && err !== null && 'message' in err) {
        return String((err as { message?: string }).message);
    }
    return '操作失败，请重试';
};

// 取净值数据的最早/最晚日期（YYYY-MM-DD）
const computeDateRange = (
    items: { net_value_date: string | null }[]
): { start: string; end: string } | null => {
    const dates = items
        .map(i => i.net_value_date)
        .filter((d): d is string => !!d && !Number.isNaN(new Date(d).getTime()))
        .sort();
    if (dates.length === 0) return null;
    return { start: dates[0], end: dates[dates.length - 1] };
};

export default function ProductDetailClient({ initialProductId }: ProductDetailClientProps) {
    const [product, setProduct] = useState<Product | null>(null);
    const [netValues, setNetValues] = useState<ProductNetValue[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [chartStartDate, setChartStartDate] = useState<string>('');
    const [chartEndDate, setChartEndDate] = useState<string>('');
    const [downloading, setDownloading] = useState<boolean>(false);
    const [importing, setImporting] = useState<boolean>(false);
    const [fileInputRef, setFileInputRef] = useState<HTMLInputElement | null>(null);
    const {
        isAdmin,
        isProductOp,
        hasWritePermission,
        loading: authLoading
    } = useAuth();
    const [importTip, setImportTip] = useState<{
        type: 'success' | 'info' | 'error';
        message: string;
    } | null>(null);

    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<EditFormData | null>(null);
    const [saving, setSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    const { tags, tagsLoading } = useProductTags();
    const [refreshKey, setRefreshKey] = useState(0);
    const handleRefreshChart = () => {
        setRefreshKey(prev => prev + 1);
    };

    // 基准对比
    const [benchmarks, setBenchmarks] = useState<BenchmarkIndex[]>([]);
    const [selectedBenchmarkIds, setSelectedBenchmarkIds] = useState<number[]>([]);
    const [benchmarkSeriesMap, setBenchmarkSeriesMap] = useState<Record<number, BenchmarkNetValuePoint[]>>({});
    const [benchmarkLoading, setBenchmarkLoading] = useState(false);
    // 超额收益叠加：在净值曲线图叠加'产品相对某基准的超额'（次坐标轴虚线）
    const [showExcess, setShowExcess] = useState(false);
    const [excessOnly, setExcessOnly] = useState(false); // 仅显示超额曲线：隐藏累计净值主线，超额走主轴实线加粗
    // 注：之前用 excessBenchmarkId 单选一个基准当 base，现在改成所有选中基准自动展开（产品 × 每个基准画一条线）

    // 辅助：从 CustomTag[] 提取 ID 数组
    const getTagIds = (tags?: CustomTag[]): number[] => {
        return tags?.map(tag => tag.id) || [];
    };

    useEffect(() => {
        const fetchProductData = async () => {
            setLoading(true);
            try {
                const productId = parseInt(initialProductId);
                if (isNaN(productId)) {
                    notFound();
                    return;
                }

                const [productRes, netValuesRes] = await Promise.all([
                    productApi.getProductById(productId),
                    productApi.getNetValuesByProductId(productId),
                ]);

                setProduct(productRes);
                setNetValues(netValuesRes.results);

                // 把日期框默认设为净值数据的最早/最晚日期
                const range = computeDateRange(netValuesRes.results);
                if (range) {
                    setChartStartDate(range.start);
                    setChartEndDate(range.end);
                }

                // 修复：明确转换 CustomTag[] -> number[]
                setEditForm({
                    product_code: productRes.product_code || '',
                    product_name: productRes.product_name,
                    score: Number(productRes.score),
                    product_desc: productRes.product_desc || '',
                    cycle: Number(productRes.cycle),
                    quant_type: Number(productRes.quant_type),
                    algorithm: Number(productRes.algorithm),
                    strategy: Number(productRes.strategy),
                    fof_own: productRes.fof_own ? Number(productRes.fof_own) : undefined,
                    custom_tag_ids: getTagIds(productRes.custom_tags),
                });

                setError(null);
            } catch (err: unknown) {
                setError('加载产品数据失败');
                console.error('数据请求失败：', err);
            } finally {
                setLoading(false);
            }
        };

        fetchProductData();
    }, [initialProductId]);

    // 拉一次可选基准列表
    useEffect(() => {
        const loadBenchmarks = async () => {
            try {
                const res = await benchmarkApi.getBenchmarks();
                setBenchmarks(res.results ?? []);
            } catch (err) {
                console.error('加载基准列表失败', err);
            }
        };
        void loadBenchmarks();
    }, []);

    // 选中基准变化或日期范围变化时，加载对应基准的净值（拉全量，前端再按区间裁切）
    useEffect(() => {
        if (selectedBenchmarkIds.length === 0) {
            setBenchmarkSeriesMap({});
            return;
        }
        let cancelled = false;
        const loadAll = async () => {
            setBenchmarkLoading(true);
            try {
                const results = await Promise.all(
                    selectedBenchmarkIds.map(async id => {
                        // 只拉已有的；缓存命中跳过
                        if (benchmarkSeriesMap[id]) return { id, points: benchmarkSeriesMap[id] };
                        const res = await benchmarkApi.getBenchmarkNetValues(id);
                        return { id, points: res.results ?? [] };
                    }),
                );
                if (cancelled) return;
                const next: Record<number, BenchmarkNetValuePoint[]> = {};
                results.forEach(r => { next[r.id] = r.points; });
                setBenchmarkSeriesMap(next);
            } catch (err) {
                console.error('加载基准净值失败', err);
            } finally {
                if (!cancelled) setBenchmarkLoading(false);
            }
        };
        void loadAll();
        return () => { cancelled = true; };
    }, [selectedBenchmarkIds]);

    const toggleBenchmark = (id: number) => {
        setSelectedBenchmarkIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const clearBenchmarks = () => setSelectedBenchmarkIds([]);

    const getFilteredChartData = () => {
        let filtered = [...netValues];
        if (chartStartDate) {
            filtered = filtered.filter(item => new Date(item.net_value_date) >= new Date(chartStartDate));
        }
        if (chartEndDate) {
            filtered = filtered.filter(item => new Date(item.net_value_date) <= new Date(chartEndDate));
        }
        return filtered;
    };
    const resetChartDate = () => {
        const range = computeDateRange(netValues);
        setChartStartDate(range?.start ?? '');
        setChartEndDate(range?.end ?? '');
    };

    const handleEditClick = () => {
        if (!editForm) {
            setEditError('产品数据未加载完成，暂无法编辑');
            return;
        }
        setIsEditing(true);
        setEditError(null);
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        if (product) {
            setEditForm({
                product_code: product.product_code || '',
                product_name: product.product_name,
                score: Number(product.score),
                product_desc: product.product_desc || '',
                cycle: Number(product.cycle),
                quant_type: Number(product.quant_type),
                algorithm: Number(product.algorithm),
                strategy: Number(product.strategy),
                fof_own: product.fof_own ? Number(product.fof_own) : undefined,
                custom_tag_ids: getTagIds(product.custom_tags),
            });
        }
    };

    const handleSaveEdit = async () => {
        if (!product || !editForm) {
            setEditError('产品数据未加载完成，无法保存');
            return;
        }

        // 移除产品代码/名称的必填校验（因为不可编辑，无需校验）
        if (editForm.score < 0 || editForm.score > 100) {
            setEditError('打分必须在 0-100 之间');
            return;
        }
        if (!editForm.cycle || !editForm.quant_type || !editForm.algorithm || !editForm.strategy) {
            setEditError('请选择完整的类型标签');
            return;
        }

        setSaving(true);
        setEditError(null);
        try {
            const productId = parseInt(initialProductId);
            const updatedProduct = await productApi.updateProduct(productId, {
                product_code: editForm.product_code,
                product_name: editForm.product_name,
                score: editForm.score,
                product_desc: editForm.product_desc,
                cycle: editForm.cycle,
                quant_type: editForm.quant_type,
                algorithm: editForm.algorithm,
                strategy: editForm.strategy,
                fof_own: editForm.fof_own ?? null,
                custom_tag_ids: editForm.custom_tag_ids,
            });

            setProduct(updatedProduct);
            setEditForm({
                product_code: updatedProduct.product_code || '',
                product_name: updatedProduct.product_name,
                score: Number(updatedProduct.score),
                product_desc: updatedProduct.product_desc || '',
                cycle: Number(updatedProduct.cycle),
                quant_type: Number(updatedProduct.quant_type),
                algorithm: Number(updatedProduct.algorithm),
                strategy: Number(updatedProduct.strategy),
                fof_own: updatedProduct.fof_own ?? undefined,
                custom_tag_ids: getTagIds(updatedProduct.custom_tags),
            });
            setIsEditing(false);
            setImportTip({ type: 'success', message: '产品信息修改成功！' });
        } catch (err: unknown) {
            setEditError(getErrorMessage(err));
            console.error('更新产品失败：', err);
        } finally {
            setSaving(false);
        }
    };

    // 处理自定义标签多选
    const handleCustomTagChange = (tagId: number, checked: boolean) => {
        if (!editForm) return;
        setEditForm(prev => {
            if (!prev) return prev;
            if (checked) {
                return { ...prev, custom_tag_ids: [...prev.custom_tag_ids, tagId] };
            } else {
                return { ...prev, custom_tag_ids: prev.custom_tag_ids.filter(id => id !== tagId) };
            }
        });
    };

    const handleFormChange = (field: keyof Omit<EditFormData, 'custom_tag_ids'>, value: string | number) => {
        if (!editForm) return;

        let processedValue: string | number | null | undefined = value;
        if (['score', 'cycle', 'quant_type', 'algorithm', 'strategy', 'fof_own'].includes(field)) {
            processedValue = Number(value);
        }
        if (field === 'fof_own') {
            processedValue = value === '' ? null : Number(value);
        }
        setEditForm(prev => {
            if (!prev) return prev;
            return { ...prev, [field]: processedValue };
        });
    };

    const closeImportTip = () => setImportTip(null);
    const parseImportErrorReason = (reason: string): string => {
        const match = reason.match(/string='([^']+)'/);
        return match ? match[1] : reason;
    };

    const refreshNetValueData = async () => {
        if (!product?.id) return;
        try {
            const res = await productApi.getNetValuesByProductId(product.id);
            setNetValues(res.results);
            const range = computeDateRange(res.results);
            if (range) {
                setChartStartDate(range.start);
                setChartEndDate(range.end);
            }
        } catch (err) {
            console.error('刷新净值失败', err);
        }
    };

    const handleDownloadCSV = async () => {
        if (!product) return;
        setDownloading(true);
        try {
            const productId = parseInt(initialProductId);
            const result = await productApi.exportNetValueCsv(
                productId, chartStartDate, chartEndDate
            );
            const blob = result.blob as Blob;
            const fileName = result.fileName || `product_${productId}_netvalues.csv`;
            downloadUtils.downloadBlobFile(blob, fileName);
            setImportTip({ type: 'success', message: 'CSV 下载成功！' });
        } catch (err: unknown) {
            setImportTip({ type: 'error', message: `下载失败：${getErrorMessage(err)}` });
        } finally {
            setDownloading(false);
        }
    };

    const handleImportClick = () => fileInputRef?.click();

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault();
        if (!product?.id) return;

        const files = e.target.files;
        if (!files?.length) {
            setImportTip({ type: 'info', message: '请选择 CSV 文件' });
            return;
        }

        const file = files[0];
        if (!file.name.endsWith('.csv')) {
            setImportTip({ type: 'info', message: '仅支持 CSV 格式' });
            e.target.value = '';
            return;
        }

        setImporting(true);
        try {
            const noCoverRes = await netValueApi.importNetValueCsv(product.id, file, false);
            const hasDuplicate = noCoverRes.failed_records.some(r => r.reason.includes('已存在'));

            if (hasDuplicate) {
                const confirmCover = window.confirm('检测到重复数据，是否覆盖？');
                if (confirmCover) {
                    const coverRes = await netValueApi.importNetValueCsv(product.id, file, true);
                    setImportTip({ type: 'info', message: `覆盖导入完成` });
                }
            } else {
                setImportTip({ type: 'success', message: '导入成功' });
            }

            await refreshNetValueData();
        } catch (err: unknown) {
            setImportTip({ type: 'error', message: `导入失败：${getErrorMessage(err)}` });
        } finally {
            setImporting(false);
            e.target.value = '';
        }
    };

    if (loading) return <div className="py-10 text-center">加载产品详情中...</div>;
    if (error || !product) return <div className="py-10 text-center text-red-500">{error || '产品不存在'}</div>;

    const safeEditForm = editForm || {
        product_code: product.product_code || '',
        product_name: product.product_name,
        score: product.score,
        product_desc: product.product_desc || '',
        cycle: product.cycle,
        quant_type: product.quant_type,
        algorithm: product.algorithm,
        strategy: product.strategy,
        fof_own: product.fof_own,
        custom_tag_ids: getTagIds(product.custom_tags),
    };

    const filteredChartData = getFilteredChartData();

    // 产品净值序列：以累计净值作为画图与指标的基础
    const productSeriesPoints = filteredChartData
        .filter((item): item is ProductNetValue & { cumulative_unit_net_value: number } =>
            item.cumulative_unit_net_value !== null && item.cumulative_unit_net_value !== undefined,
        )
        .map(item => ({
            date: item.net_value_date || '',
            value: Number(item.cumulative_unit_net_value),
        }));

    // 选中基准的序列：按当前日期范围裁切，并按需归一化（与产品一起画时）
    const buildBenchmarkPoints = (raw: BenchmarkNetValuePoint[]): Array<{ date: string; value: number }> => {
        return raw
            .filter(p => {
                if (!p.net_value_date) return false;
                if (chartStartDate && p.net_value_date < chartStartDate) return false;
                if (chartEndDate && p.net_value_date > chartEndDate) return false;
                return true;
            })
            .map(p => ({ date: p.net_value_date, value: Number(p.close_price) }))
            .filter(p => Number.isFinite(p.value) && p.value > 0);
    };

    const chartSeries: NetValueSeries[] = [
        { name: `${product.product_name} 累计净值`, points: productSeriesPoints },
        ...selectedBenchmarkIds
            .filter(id => benchmarkSeriesMap[id])
            .map(id => {
                const idx = benchmarks.find(b => b.id === id);
                return {
                    name: idx?.index_short_name || idx?.index_name || `基准#${id}`,
                    points: buildBenchmarkPoints(benchmarkSeriesMap[id]),
                };
            }),
    ];

    // 给指标面板用的基准 series（不归一化、走原值）
    const benchmarkSeriesForMetrics: NamedSeries[] = selectedBenchmarkIds
        .filter(id => benchmarkSeriesMap[id])
        .map(id => {
            const idx = benchmarks.find(b => b.id === id);
            return {
                name: idx?.index_short_name || idx?.index_name || `基准#${id}`,
                points: benchmarkSeriesMap[id].map(p => ({
                    date: p.net_value_date,
                    value: Number(p.close_price),
                })),
            };
        });

    const hasBenchmark = selectedBenchmarkIds.length > 0;

    // 所有选中基准的 chartSeries name 数组：超额线 = 产品 × 每个基准 笛卡尔积，跟产品对比页口径一致
    const excessBaseNames = selectedBenchmarkIds
        .filter(id => benchmarkSeriesMap[id])
        .map(id => {
            const idx = benchmarks.find(b => b.id === id);
            return idx?.index_short_name || idx?.index_name || `基准#${id}`;
        });

    return (
        <div className="space-y-8 py-4">
            {importTip && (
                <div className={`p-4 rounded-md border ${
                    importTip.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' :
                        importTip.type === 'info' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            'bg-red-50 text-red-700 border-red-200'
                }`}>
                    <div className="flex justify-between items-start">
                        <div dangerouslySetInnerHTML={{ __html: importTip.message.replace(/\n/g, '<br />') }} />
                        <button onClick={closeImportTip} className="ml-4">×</button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-2xl font-bold text-gray-800">
                        {isEditing ? '编辑产品信息' : product.product_name}
                    </h1>
                    {hasWritePermission && (
                        <div className="flex gap-2">
                            {!isEditing ? (
                                <button onClick={handleEditClick} className="bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm">
                                    编辑产品
                                </button>
                            ) : (
                                <>
                                    <button onClick={handleSaveEdit} disabled={saving} className="bg-green-600 text-white px-3 py-1.5 rounded-md text-sm">
                                        {saving ? '保存中...' : '保存修改'}
                                    </button>
                                    <button onClick={handleCancelEdit} className="bg-gray-600 text-white px-3 py-1.5 rounded-md text-sm">
                                        取消
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {editError && (
                    <div className="mb-4 p-2 bg-red-50 text-red-600 rounded text-sm">{editError}</div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* 🔥 产品代码：编辑模式禁用，不可编辑 */}
                    <div className="bg-gray-50 p-3 rounded col-span-2">
                        <p className="text-sm text-gray-500">产品代码</p>
                        {isEditing ? (
                            <input
                                type="text"
                                value={safeEditForm.product_code}
                                disabled={true} // 核心：禁用输入
                                className="w-full mt-1 border border-gray-300 rounded px-2 py-1 bg-gray-100 cursor-not-allowed"
                                placeholder="请输入产品代码"
                            />
                        ) : (
                            <p className="font-medium">{product.product_code || '—'}</p>
                        )}
                    </div>

                    {/* 🔥 产品名称：编辑模式禁用，不可编辑 */}
                    <div className="bg-gray-50 p-3 rounded col-span-2">
                        <p className="text-sm text-gray-500">产品名称</p>
                        {isEditing ? (
                            <input
                                type="text"
                                value={safeEditForm.product_name}
                                disabled={true} // 核心：禁用输入
                                className="w-full mt-1 border border-gray-300 rounded px-2 py-1 bg-gray-100 cursor-not-allowed"
                            />
                        ) : (
                            <p className="font-medium">{product.product_name}</p>
                        )}
                    </div>

                    <div className="bg-gray-50 p-3 rounded">
                        <p className="text-sm text-gray-500">产品打分</p>
                        {isEditing ? (
                            <input
                                type="number"
                                min={0} max={100}
                                value={safeEditForm.score}
                                onChange={(e) => handleFormChange('score', e.target.value)}
                                className="w-full mt-1 border border-gray-300 rounded px-2 py-1"
                            />
                        ) : (
                            <p className="font-medium">{product.score}</p>
                        )}
                    </div>

                    <div className="bg-gray-50 p-3 rounded">
                        <p className="text-sm text-gray-500">周期标签</p>
                        {isEditing ? (
                            tagsLoading ? <p>加载中...</p> : (
                                <select
                                    value={safeEditForm.cycle}
                                    onChange={(e) => handleFormChange('cycle', e.target.value)}
                                    className="w-full mt-1 border border-gray-300 rounded px-2 py-1"
                                >
                                    <option value="">请选择</option>
                                    {tags.cycles.map(c => (
                                        <option key={c.id} value={c.id}>{c.cycle_name}</option>
                                    ))}
                                </select>
                            )
                        ) : (
                            <p className="font-medium">{product.cycle_name}</p>
                        )}
                    </div>

                    <div className="bg-gray-50 p-3 rounded">
                        <p className="text-sm text-gray-500">量化类型</p>
                        {isEditing ? (
                            tagsLoading ? <p>加载中...</p> : (
                                <select
                                    value={safeEditForm.quant_type}
                                    onChange={(e) => handleFormChange('quant_type', e.target.value)}
                                    className="w-full mt-1 border border-gray-300 rounded px-2 py-1"
                                >
                                    <option value="">请选择</option>
                                    {tags.quantTypes.map(t => (
                                        <option key={t.id} value={t.id}>{t.quant_name}</option>
                                    ))}
                                </select>
                            )
                        ) : (
                            <p className="font-medium">{product.quant_type_name}</p>
                        )}
                    </div>

                    <div className="bg-gray-50 p-3 rounded">
                        <p className="text-sm text-gray-500">算法类型</p>
                        {isEditing ? (
                            tagsLoading ? <p>加载中...</p> : (
                                <select
                                    value={safeEditForm.algorithm}
                                    onChange={(e) => handleFormChange('algorithm', e.target.value)}
                                    className="w-full mt-1 border border-gray-300 rounded px-2 py-1"
                                >
                                    <option value="">请选择</option>
                                    {tags.algorithms.map(a => (
                                        <option key={a.id} value={a.id}>{a.alg_name}</option>
                                    ))}
                                </select>
                            )
                        ) : (
                            <p className="font-medium">{product.algorithm_name}</p>
                        )}
                    </div>

                    <div className="bg-gray-50 p-3 rounded">
                        <p className="text-sm text-gray-500">策略类型</p>
                        {isEditing ? (
                            tagsLoading ? <p>加载中...</p> : (
                                <select
                                    value={safeEditForm.strategy}
                                    onChange={(e) => handleFormChange('strategy', e.target.value)}
                                    className="w-full mt-1 border border-gray-300 rounded px-2 py-1"
                                >
                                    <option value="">请选择</option>
                                    {tags.strategies.map(s => (
                                        <option key={s.id} value={s.id}>{s.strategy_name}</option>
                                    ))}
                                </select>
                            )
                        ) : (
                            <p className="font-medium">{product.strategy_name}</p>
                        )}
                    </div>

                    {/* FOF 归属标签 */}
                    <div className="bg-gray-50 p-3 rounded">
                        <p className="text-sm text-gray-500">FOF 归属</p>
                        {isEditing ? (
                            tagsLoading ? <p>加载中...</p> : (
                                <select
                                    value={safeEditForm.fof_own  ?? ''}
                                    onChange={(e) => handleFormChange('fof_own', e.target.value)}
                                    className="w-full mt-1 border border-gray-300 rounded px-2 py-1"
                                >
                                    <option value="">请选择（可选）</option>
                                    {tags.fofOwnTags?.map(f => (
                                        <option key={f.id} value={f.id}>{f.fof_name}</option>
                                    ))}
                                </select>
                            )
                        ) : (
                            <p className="font-medium">{product.fof_own_name || '—'}</p>
                        )}
                    </div>

                    {/* 自定义标签 */}
                    <div className="bg-gray-50 p-3 rounded col-span-2">
                        <p className="text-sm text-gray-500">自定义标签</p>
                        {isEditing ? (
                            tagsLoading ? <p>加载中...</p> : (
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {tags.customTags?.map((tag: CustomTag) => (
                                        <label key={tag.id} className="flex items-center gap-1 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={safeEditForm.custom_tag_ids.includes(tag.id)}
                                                onChange={(e) => handleCustomTagChange(tag.id, e.target.checked)}
                                                className="rounded"
                                            />
                                            <span className={`px-2 py-1 rounded text-xs ${
                                                tag.permission === 'public'
                                                    ? 'bg-blue-100 text-blue-700'
                                                    : 'bg-purple-100 text-purple-700'
                                            }`}>
                                                {tag.tag_name}
                                                {tag.permission === 'private' && ' (私密)'}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            )
                        ) : (
                            product.custom_tags && product.custom_tags.length > 0 ? (
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {product.custom_tags.map((tag: CustomTag) => (
                                        <span
                                            key={tag.id}
                                            className={`px-2 py-1 rounded text-xs ${
                                                tag.permission === 'public'
                                                    ? 'bg-blue-100 text-blue-700'
                                                    : 'bg-purple-100 text-purple-700'
                                            }`}
                                        >
                                            {tag.tag_name}
                                            {tag.permission === 'private' && ' (私密)'}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-400 mt-1">暂无自定义标签</p>
                            )
                        )}
                    </div>

                    <div className="bg-gray-50 p-3 rounded col-span-2">
                        <p className="text-sm text-gray-500">产品描述</p>
                        {isEditing ? (
                            <textarea
                                value={safeEditForm.product_desc}
                                onChange={(e) => handleFormChange('product_desc', e.target.value)}
                                rows={3}
                                className="w-full mt-1 border border-gray-300 rounded px-2 py-1"
                            />
                        ) : (
                            <p>{product.product_desc || '暂无描述'}</p>
                        )}
                    </div>

                    <div className="bg-gray-50 p-3 rounded col-span-2">
                        <p className="text-sm text-gray-500">净值导出</p>
                        <div className="flex gap-2 items-center">
                            <div className="flex-1">
                                <label className="text-xs">开始日期</label>
                                <input
                                    type="date"
                                    value={chartStartDate}
                                    onChange={(e) => setChartStartDate(e.target.value)}
                                    className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs">结束日期</label>
                                <input
                                    type="date"
                                    onChange={(e) => setChartEndDate(e.target.value)}
                                    className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                                />
                            </div>
                        </div>
                        <button
                            onClick={handleDownloadCSV}
                            disabled={downloading}
                            className="mt-2 w-full bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm"
                        >
                            {downloading ? '下载中...' : '导出净值 CSV'}
                        </button>
                    </div>
                </div>
            </div>

            <ProductMetrics
                netValues={netValues}
                rangeStart={chartStartDate || undefined}
                rangeEnd={chartEndDate || undefined}
                benchmarkSeries={benchmarkSeriesForMetrics}
            />

            {/* 基准对比选择器 */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">
                        对比基准
                        {benchmarkLoading && <span className="ml-2 text-xs text-gray-400">加载中…</span>}
                    </h3>
                    {selectedBenchmarkIds.length > 0 && (
                        <button
                            onClick={clearBenchmarks}
                            className="text-xs text-gray-500 hover:text-gray-700 underline"
                        >
                            清空
                        </button>
                    )}
                </div>
                {benchmarks.length === 0 ? (
                    <div className="text-xs text-gray-400">暂无可选基准（请先在后端同步基准指数）</div>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {benchmarks.map(b => {
                            const checked = selectedBenchmarkIds.includes(b.id);
                            return (
                                <label
                                    key={b.id}
                                    className={`px-3 py-1 rounded text-xs cursor-pointer border transition ${
                                        checked
                                            ? 'bg-blue-50 border-blue-400 text-blue-700'
                                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        className="hidden"
                                        checked={checked}
                                        onChange={() => toggleBenchmark(b.id)}
                                    />
                                    {b.index_short_name || b.index_name}
                                </label>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold">
                        净值曲线
                        {hasBenchmark && <span className="ml-2 text-xs text-gray-400 font-normal">（与基准已归一化到起点 = 1）</span>}
                    </h2>
                    <div className="flex gap-3 items-center">
                        <input
                            type="date"
                            value={chartStartDate}
                            onChange={(e) => setChartStartDate(e.target.value)}
                            className="border px-3 py-2 rounded text-sm"
                            placeholder="开始日期"
                        />
                        <span>~</span>
                        <input
                            type="date"
                            value={chartEndDate}
                            onChange={(e) => setChartEndDate(e.target.value)}
                            className="border px-3 py-2 rounded text-sm"
                            placeholder="结束日期"
                        />
                        <button
                            onClick={resetChartDate}
                            className="bg-gray-200 px-3 py-2 rounded text-sm hover:bg-gray-300"
                        >
                            默认
                        </button>
                        <button
                            onClick={handleRefreshChart}
                            className="bg-blue-500 text-white px-3 py-2 rounded text-sm hover:bg-blue-600"
                        >
                            刷新表
                        </button>
                    </div>
                    {isAdmin && (
                        <>
                            <button
                                onClick={handleImportClick}
                                disabled={importing}
                                className="bg-green-600 text-white px-4 py-2 rounded-md text-sm"
                            >
                                {importing ? '导入中...' : '导入净值 CSV'}
                            </button>
                            <input
                                type="file"
                                ref={setFileInputRef}
                                onChange={handleFileChange}
                                accept=".csv"
                                className="hidden"
                            />
                        </>
                    )}
                </div>

                {hasBenchmark && (
                    <div className="flex items-center flex-wrap gap-3 mb-2 text-sm">
                        <label className="flex items-center gap-1.5 text-gray-700 cursor-pointer">
                            <input type="checkbox" checked={showExcess} onChange={e => setShowExcess(e.target.checked)} />
                            叠加超额收益（产品相对每个基准画一条，次坐标轴虚线）
                        </label>
                        {showExcess && (
                            <label className="flex items-center gap-1.5 text-gray-700 cursor-pointer">
                                <input type="checkbox" checked={excessOnly} onChange={e => setExcessOnly(e.target.checked)} />
                                仅显示超额曲线（隐藏累计净值主线）
                            </label>
                        )}
                        {showExcess && selectedBenchmarkIds.length > 1 && (
                            <span className="text-xs text-gray-500 ml-auto">已展开 {selectedBenchmarkIds.length} 条产品 vs 基准 超额线</span>
                        )}
                    </div>
                )}

                <NetValueChart
                    key={refreshKey}
                    series={chartSeries}
                    title={`${product.product_name}${hasBenchmark ? ' vs 基准' : ' - 累计净值曲线'}`}
                    loading={false}
                    normalize={hasBenchmark}
                    excessBaseNames={showExcess && hasBenchmark ? excessBaseNames : undefined}
                    excessOnly={showExcess && hasBenchmark && excessOnly}
                />
            </div>

            <ProductNetValueManager initialProductId={initialProductId} />
        </div>
    );
}