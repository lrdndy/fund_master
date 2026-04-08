// ProductDetailClient.tsx
'use client';
import { useEffect, useState } from 'react';
import { productApi, downloadUtils, netValueApi } from '@/lib/api';
import NetValueChart from '@/components/products/NetValueChart';
import { Product, ProductNetValue } from '@/lib/types';
import { notFound } from 'next/navigation';
import ProductNetValueManager from "@/components/products/ProductNetValueManager";
import useProductTags from '@/hooks/useProductTags';
import useAuth from '@/hooks/useAuth';

// 定义精准的编辑表单类型 🔥 新增 product_code
interface EditFormData {
    product_code: string; // 🔥 新增
    product_name: string;
    score: number;
    product_desc: string;
    cycle: number;
    quant_type: number;
    algorithm: number;
    strategy: number;
}

interface ProductDetailClientProps {
    initialProductId: string;
}

// 错误信息安全获取
const getErrorMessage = (err: unknown): string => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'object' && err !== null && 'message' in err) {
        return String((err as { message?: string }).message);
    }
    return '操作失败，请重试';
};

export default function ProductDetailClient({ initialProductId }: ProductDetailClientProps) {
    // 基础状态
    const [product, setProduct] = useState<Product | null>(null);
    const [netValues, setNetValues] = useState<ProductNetValue[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [chartStartDate, setChartStartDate] = useState<string>(''); // 图表专用开始时间
    const [chartEndDate, setChartEndDate] = useState<string>('');     // 图表专用结束时间
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

    // 编辑相关状态
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<EditFormData | null>(null);
    const [saving, setSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    // 加载标签数据
    const { tags, tagsLoading } = useProductTags();
    const [refreshKey, setRefreshKey] = useState(0);
    const handleRefreshChart = () => {
        setRefreshKey(prev => prev + 1);
    };
    // 加载产品数据
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

                // 初始化编辑表单 🔥 新增 product_code
                setEditForm({
                    product_code: productRes.product_code || '',
                    product_name: productRes.product_name,
                    score: Number(productRes.score),
                    product_desc: productRes.product_desc || '',
                    cycle: Number(productRes.cycle),
                    quant_type: Number(productRes.quant_type),
                    algorithm: Number(productRes.algorithm),
                    strategy: Number(productRes.strategy),
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

    // 🔥 图表时间筛选逻辑（核心！）
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
        setChartStartDate('');
        setChartEndDate('');
    };
    // 编辑模式切换
    const handleEditClick = () => {
        if (!editForm) {
            setEditError('产品数据未加载完成，暂无法编辑');
            return;
        }
        setIsEditing(true);
        setEditError(null);
    };

    // 取消编辑
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
            });
        }
    };

    // 保存编辑
    const handleSaveEdit = async () => {
        if (!product || !editForm) {
            setEditError('产品数据未加载完成，无法保存');
            return;
        }

        if (!editForm.product_code.trim()) {
            setEditError('产品代码不能为空');
            return;
        }
        if (!editForm.product_name.trim()) {
            setEditError('产品名称不能为空');
            return;
        }
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

    // 表单变更
    const handleFormChange = (field: keyof EditFormData, value: string | number) => {
        if (!editForm) return;

        let processedValue: string | number = value;
        if (['score', 'cycle', 'quant_type', 'algorithm', 'strategy'].includes(field)) {
            processedValue = Number(value);
        }

        setEditForm(prev => {
            if (!prev) return prev;
            return { ...prev, [field]: processedValue as EditFormData[typeof field] };
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
        } catch (err) {
            console.error('刷新净值失败', err);
        }
    };

    // 导出CSV（原有功能不变）
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
    };

    // 🔥 筛选后的图表数据（支持时间范围）
    const filteredChartData = getFilteredChartData();
    const chartSafeNetValues = filteredChartData
        .filter((item): item is ProductNetValue & { cumulative_unit_net_value: number } =>
            item.cumulative_unit_net_value !== null && item.cumulative_unit_net_value !== undefined
        )
        .map(item => ({
            net_value_date: item.net_value_date || '',
            net_value: item.cumulative_unit_net_value
        }));

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

            {/* 产品信息模块（原有逻辑不变） */}
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
                    <div className="bg-gray-50 p-3 rounded col-span-2">
                        <p className="text-sm text-gray-500">产品代码</p>
                        {isEditing ? (
                            <input
                                type="text"
                                value={safeEditForm.product_code}
                                onChange={(e) => handleFormChange('product_code', e.target.value)}
                                className="w-full mt-1 border border-gray-300 rounded px-2 py-1"
                                placeholder="请输入产品代码"
                            />
                        ) : (
                            <p className="font-medium">{product.product_code || '—'}</p>
                        )}
                    </div>

                    <div className="bg-gray-50 p-3 rounded col-span-2">
                        <p className="text-sm text-gray-500">产品名称</p>
                        {isEditing ? (
                            <input
                                type="text"
                                value={safeEditForm.product_name}
                                onChange={(e) => handleFormChange('product_name', e.target.value)}
                                className="w-full mt-1 border border-gray-300 rounded px-2 py-1"
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

                    {/* 净值导出（原有功能不变） */}
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
                                    value={chartEndDate}
                                    onChange={(e) => setChartEndDate(e.target.value)}
                                    className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                                />
                            </div>
                            {/*<button*/}
                            {/*    onClick={resetChartDate}*/}
                            {/*    className="bg-gray-200 px-3 py-2 rounded text-sm hover:bg-gray-300"*/}
                            {/*>*/}
                            {/*    默认*/}
                            {/*</button>*/}
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

            {/* 🔥 净值曲线模块 + 时间筛选器（核心功能） */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold">净值曲线</h2>
                    {/* 🔥 图表时间筛选器 + 默认按钮 */}
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

                {/* 🔥 传入筛选后的图表数据 */}
                <NetValueChart
                    key={refreshKey}
                    netValues={chartSafeNetValues}
                    productName={`${product.product_name} - 累计净值曲线`}
                    loading={false}
                />
            </div>


            {/* 净值管理列表（原有逻辑不变） */}
            <ProductNetValueManager initialProductId={initialProductId} />
        </div>
    );
}