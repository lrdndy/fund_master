'use client';
import { useEffect, useState } from 'react';
import { productApi, downloadUtils, netValueApi } from '@/lib/api';
import NetValueChart from '@/components/products/NetValueChart';
import { Product, ProductNetValue } from '@/lib/types';
import { notFound } from 'next/navigation';
import ProductNetValueManager from "@/components/products/ProductNetValueManager";
import useProductTags from '@/hooks/useProductTags';

// 定义精准的编辑表单类型（匹配产品可编辑字段）
interface EditFormData {
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

export default function ProductDetailClient({ initialProductId }: ProductDetailClientProps) {
    // 基础状态
    const [product, setProduct] = useState<Product | null>(null);
    const [netValues, setNetValues] = useState<ProductNetValue[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [downloading, setDownloading] = useState<boolean>(false);
    const [importing, setImporting] = useState<boolean>(false);
    const [fileInputRef, setFileInputRef] = useState<HTMLInputElement | null>(null);
    const [isAdmin, setIsAdmin] = useState<boolean>(false);
    const [importTip, setImportTip] = useState<{
        type: 'success' | 'info' | 'error';
        message: string;
    } | null>(null);

    // 编辑相关状态（精准类型定义）
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<EditFormData | null>(null); // 初始为null，避免默认值干扰
    const [saving, setSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    // 加载标签数据
    const { tags, tagsLoading, tagsError } = useProductTags();

    // 初始化管理员标识
    useEffect(() => {
        const fundIsAdmin = localStorage.getItem('fundIsAdmin');
        setIsAdmin(fundIsAdmin === 'true');
    }, []);

    // 加载产品数据 + 初始化编辑表单（用产品原有数值）
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

                // 用产品原有数值初始化编辑表单（核心：精准匹配类型）
                setEditForm({
                    product_name: productRes.product_name,
                    score: Number(productRes.score) as number, // 强制转数字 + 类型断言
                    product_desc: productRes.product_desc || '',
                    cycle: Number(productRes.cycle) as number, // 核心修复
                    quant_type: Number(productRes.quant_type) as number, // 核心修复
                    algorithm: Number(productRes.algorithm) as number, // 核心修复
                    strategy: Number(productRes.strategy) as number, // 核心修复
                });

                setError(null);
            } catch (err) {
                setError('加载产品数据失败');
                console.error('数据请求失败：', err);
            } finally {
                setLoading(false);
            }
        };

        fetchProductData();
    }, [initialProductId]);

    // 编辑模式切换
    const handleEditClick = () => {
        if (!editForm) {
            setEditError('产品数据未加载完成，暂无法编辑');
            return;
        }
        setIsEditing(true);
        setEditError(null);
    };

    // 取消编辑（重置为产品当前值）
    const handleCancelEdit = () => {
        setIsEditing(false);
        if (product) {
            setEditForm({
                product_name: product.product_name,
                score: Number(product.score) as number, // 强制转数字 + 类型断言
                product_desc: product.product_desc || '',
                cycle: Number(product.cycle) as number, // 核心修复
                quant_type: Number(product.quant_type) as number, // 核心修复
                algorithm: Number(product.algorithm) as number, // 核心修复
                strategy: Number(product.strategy) as number, // 核心修复
            });
        }
    };


    // 保存编辑（类型安全 + 完整校验）
    const handleSaveEdit = async () => {
        // 类型守卫：确保数据完整
        if (!product || !editForm) {
            setEditError('产品数据未加载完成，无法保存');
            return;
        }

        // 表单校验
        if (!editForm.product_name.trim()) {
            setEditError('产品名称不能为空');
            return;
        }
        if (editForm.score < 0 || editForm.score > 100) {
            setEditError('打分必须在0-100之间');
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
            // 调用PATCH接口更新产品
            const updatedProduct = await productApi.updateProduct(productId, {
                product_name: editForm.product_name,
                score: editForm.score,
                product_desc: editForm.product_desc,
                cycle: editForm.cycle,
                quant_type: editForm.quant_type,
                algorithm: editForm.algorithm,
                strategy: editForm.strategy,
            });

            // 更新本地数据
            setProduct(updatedProduct);
            setEditForm({
                product_name: updatedProduct.product_name,
                score: Number(updatedProduct.score) as number, // 强制转数字 + 类型断言
                product_desc: updatedProduct.product_desc || '',
                cycle: Number(updatedProduct.cycle) as number, // 核心修复
                quant_type: Number(updatedProduct.quant_type) as number, // 核心修复
                algorithm: Number(updatedProduct.algorithm) as number, // 核心修复
                strategy: Number(updatedProduct.strategy) as number, // 核心修复
            });
            setIsEditing(false);
            setImportTip({ type: 'success', message: '产品信息修改成功！' });
        } catch (err: unknown) {
            const errObj = err as { response?: { data?: { error?: string } }, message?: string };
            const errMsg = errObj.response?.data?.error || errObj.message || '修改产品信息失败';
            setEditError(errMsg);
            console.error('更新产品失败：', err);
        } finally {
            setSaving(false);
        }
    };

    // 表单变更处理（无any类型，类型安全）
    const handleFormChange = (field: keyof EditFormData, value: string | number) => {
        if (!editForm) return;

        // 针对不同字段做类型转换
        let processedValue: string | number = value;
        if (field === 'score' || field === 'cycle' || field === 'quant_type' || field === 'algorithm' || field === 'strategy') {
            processedValue = Number(value); // 数字类型字段强制转数字
        }

        setEditForm(prev => {
            if (!prev) return prev;
            return { ...prev, [field]: processedValue as EditFormData[typeof field] };
        });
    };

    // 关闭提示框
    const closeImportTip = () => {
        setImportTip(null);
    };

    // 结束日期校验
    const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (startDate && value && value < startDate) {
            setImportTip({ type: 'info', message: "结束日期不能早于开始日期" });
            return;
        }
        setEndDate(value);
    };

    // 解析导入错误原因
    const parseImportErrorReason = (reason: string): string => {
        const errorMatch = reason.match(/string='([^']+)'/);
        return errorMatch ? errorMatch[1] : reason;
    };

    // 刷新净值数据
    const refreshNetValueData = async () => {
        if (!product?.id) return;
        try {
            const netValuesRes = await productApi.getNetValuesByProductId(product.id);
            setNetValues(netValuesRes.results);
        } catch (err) {
            console.error("刷新净值数据失败：", err);
        }
    };

    // 下载CSV
    const handleDownloadCSV = async () => {
        if (!product) return;

        setDownloading(true);
        try {
            const productId = parseInt(initialProductId);
            const { blob, fileName } = await productApi.exportNetValueCsv(
                productId,
                startDate,
                endDate
            );

            downloadUtils.downloadBlobFile(blob, fileName);
            setImportTip({ type: 'success', message: "CSV文件下载成功！" });
        } catch (err: unknown) {
            const errObj = err as { message?: string, response?: { data?: { msg?: string, error?: string } } };
            console.log("【下载调试】失败：", err);
            const errorMsg = errObj.message
                || errObj.response?.data?.msg
                || errObj.response?.data?.error
                || '文件下载失败，请重试';

            if (errorMsg.includes('没有对应') || errorMsg.includes('无净值数据')) {
                setImportTip({ type: 'info', message: `提示：${errorMsg}` });
            } else {
                setImportTip({ type: 'error', message: `错误：${errorMsg}` });
            }
        } finally {
            setDownloading(false);
        }
    };

    // 触发文件选择
    const handleImportClick = () => {
        if (fileInputRef) {
            fileInputRef.click();
        }
    };

    // 处理CSV导入
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault();
        if (!product || !product.id) {
            setImportTip({ type: 'info', message: "无效的产品信息，无法导入" });
            return;
        }

        const files = e.target.files;
        if (!files || files.length === 0) {
            setImportTip({ type: 'info', message: "请选择要上传的CSV文件" });
            return;
        }

        const file = files[0];
        if (!file.name.endsWith(".csv")) {
            setImportTip({ type: 'info', message: "请选择后缀为.csv的文件！" });
            e.target.value = "";
            return;
        }

        setImporting(true);
        try {
            // 先以不覆盖模式导入
            const noCoverResult = await netValueApi.importNetValueCsv(product.id, file, false);
            const hasDuplicateData = noCoverResult.failed_records.some(
                (record) => record.reason.includes("净值数据已存在")
            );

            if (hasDuplicateData) {
                const userConfirmCover = window.confirm(
                    `检测到${noCoverResult.failed_records.length}条重复数据，是否覆盖原有数据？`
                );

                if (userConfirmCover) {
                    // 覆盖模式导入
                    const coverResult = await netValueApi.importNetValueCsv(product.id, file, true);
                    let coverMsg = `导入完成！<br />总计${coverResult.summary.total}条<br />成功${coverResult.summary.success}条（更新${coverResult.summary.updated}条，新增${coverResult.summary.created}条）<br />失败${coverResult.summary.failed}条`;

                    if (coverResult.summary.failed > 0) {
                        const errorDetails = coverResult.failed_records
                            .map((record) => {
                                const friendlyReason = parseImportErrorReason(record.reason);
                                return `第${record.row_num}行：${friendlyReason}`;
                            })
                            .join('<br />');
                        coverMsg += `<br /><br />失败详情：<br />${errorDetails}`;
                    }
                    setImportTip({ type: 'info', message: coverMsg });
                } else {
                    // 取消覆盖，展示原失败结果
                    const errorDetails = noCoverResult.failed_records
                        .map((record) => {
                            const friendlyReason = parseImportErrorReason(record.reason);
                            return `第${record.row_num}行：${friendlyReason}`;
                        })
                        .join('<br />');
                    const cancelMsg = `导入完成！<br />总计${noCoverResult.summary.total}条<br />成功${noCoverResult.summary.success}条<br />失败${noCoverResult.summary.failed}条<br /><br />失败详情：<br />${errorDetails}`;
                    setImportTip({ type: 'info', message: cancelMsg });
                }
            } else {
                // 无重复数据，直接展示成功结果
                const successMsg = `导入完成！<br />总计${noCoverResult.summary.total}条<br />成功${noCoverResult.summary.success}条（新增${noCoverResult.summary.created}条）<br />失败${noCoverResult.summary.failed}条`;
                setImportTip({
                    type: noCoverResult.summary.failed === 0 ? 'success' : 'info',
                    message: successMsg
                });
            }

            await refreshNetValueData();
        } catch (err: unknown) {
            const errObj = err as { message?: string };
            setImportTip({
                type: 'error',
                message: errObj.message || "CSV导入请求失败，请检查网络或后端服务"
            });
            console.log("【导入调试】请求异常：", err);
        } finally {
            setImporting(false);
            e.target.value = "";
        }
    };

    // 加载中/错误状态渲染
    if (loading) {
        return <div className="py-10 text-center">加载产品详情中...</div>;
    }
    if (error || !product) {
        return <div className="py-10 text-center text-red-500">{error || '产品不存在'}</div>;
    }

    // 确保editForm有值（兜底）
    const safeEditForm = editForm || {
        product_name: product.product_name,
        score: product.score,
        product_desc: product.product_desc || '',
        cycle: product.cycle,
        quant_type: product.quant_type,
        algorithm: product.algorithm,
        strategy: product.strategy,
    };

    return (
        <div className="space-y-8 py-4">
            {/* 提示框 */}
            {importTip && (
                <div className={`p-4 rounded-md border ${
                    importTip.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' :
                        importTip.type === 'info' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                            'bg-red-50 border-red-200 text-red-700'
                }`}>
                    <div className="flex justify-between items-start">
                        <div dangerouslySetInnerHTML={{ __html: importTip.message.replace(/\n/g, '<br />') }} />
                        <button onClick={closeImportTip} className="ml-4 text-sm font-medium hover:opacity-80">×</button>
                    </div>
                </div>
            )}

            {/* 产品信息卡片 */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
                {/* 标题 + 编辑按钮 */}
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-2xl font-bold text-gray-800">
                        {isEditing ? '编辑产品信息' : product.product_name}
                    </h1>
                    {isAdmin && (
                        <div className="flex gap-2">
                            {!isEditing ? (
                                <button
                                    onClick={handleEditClick}
                                    className="bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-indigo-700 transition-colors"
                                >
                                    编辑产品
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={handleSaveEdit}
                                        disabled={saving}
                                        className="bg-green-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-green-700 transition-colors disabled:bg-gray-400"
                                    >
                                        {saving ? '保存中...' : '保存修改'}
                                    </button>
                                    <button
                                        onClick={handleCancelEdit}
                                        className="bg-gray-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-gray-700 transition-colors"
                                    >
                                        取消
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* 编辑错误提示 */}
                {editError && (
                    <div className="mb-4 p-2 bg-red-50 text-red-600 rounded text-sm">
                        {editError}
                    </div>
                )}

                {/* 产品信息网格 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* 1. 产品名称 */}
                    <div className="bg-gray-50 p-3 rounded col-span-2">
                        <p className="text-sm text-gray-500">产品名称</p>
                        {isEditing ? (
                            <input
                                type="text"
                                value={safeEditForm.product_name}
                                onChange={(e) => handleFormChange('product_name', e.target.value)}
                                className="w-full mt-1 border border-gray-300 rounded px-2 py-1"
                                placeholder="请输入产品名称"
                            />
                        ) : (
                            <p className="font-medium">{product.product_name}</p>
                        )}
                    </div>

                    {/* 2. 产品打分 */}
                    <div className="bg-gray-50 p-3 rounded">
                        <p className="text-sm text-gray-500">产品打分</p>
                        {isEditing ? (
                            <input
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                value={safeEditForm.score}
                                onChange={(e) => handleFormChange('score', e.target.value)}
                                className="w-full mt-1 border border-gray-300 rounded px-2 py-1"
                                placeholder="0-100"
                            />
                        ) : (
                            <p className="font-medium">{product.score}</p>
                        )}
                    </div>

                    {/* 3. 周期标签 */}
                    <div className="bg-gray-50 p-3 rounded">
                        <p className="text-sm text-gray-500">周期标签</p>
                        {isEditing ? (
                            tagsLoading ? (
                                <p className="text-gray-400">加载中...</p>
                            ) : (
                                <select
                                    value={safeEditForm.cycle}
                                    onChange={(e) => handleFormChange('cycle', e.target.value)}
                                    className="w-full mt-1 border border-gray-300 rounded px-2 py-1"
                                >
                                    <option value="">请选择周期标签</option>
                                    {tags.cycles.map(cycle => (
                                        <option key={cycle.id} value={cycle.id}>
                                            {cycle.cycle_name}
                                        </option>
                                    ))}
                                </select>
                            )
                        ) : (
                            <p className="font-medium">{product.cycle_name}</p>
                        )}
                    </div>

                    {/* 4. 量化类型 */}
                    <div className="bg-gray-50 p-3 rounded">
                        <p className="text-sm text-gray-500">量化类型</p>
                        {isEditing ? (
                            tagsLoading ? (
                                <p className="text-gray-400">加载中...</p>
                            ) : (
                                <select
                                    value={safeEditForm.quant_type}
                                    onChange={(e) => handleFormChange('quant_type', e.target.value)}
                                    className="w-full mt-1 border border-gray-300 rounded px-2 py-1"
                                >
                                    <option value="">请选择量化类型</option>
                                    {tags.quantTypes.map(type => (
                                        <option key={type.id} value={type.id}>
                                            {type.quant_name}
                                        </option>
                                    ))}
                                </select>
                            )
                        ) : (
                            <p className="font-medium">{product.quant_type_name}</p>
                        )}
                    </div>

                    {/* 5. 算法类型 */}
                    <div className="bg-gray-50 p-3 rounded">
                        <p className="text-sm text-gray-500">算法类型</p>
                        {isEditing ? (
                            tagsLoading ? (
                                <p className="text-gray-400">加载中...</p>
                            ) : (
                                <select
                                    value={safeEditForm.algorithm}
                                    onChange={(e) => handleFormChange('algorithm', e.target.value)}
                                    className="w-full mt-1 border border-gray-300 rounded px-2 py-1"
                                >
                                    <option value="">请选择算法类型</option>
                                    {tags.algorithms.map(alg => (
                                        <option key={alg.id} value={alg.id}>
                                            {alg.alg_name}
                                        </option>
                                    ))}
                                </select>
                            )
                        ) : (
                            <p className="font-medium">{product.algorithm_name}</p>
                        )}
                    </div>

                    {/* 6. 策略类型 */}
                    <div className="bg-gray-50 p-3 rounded">
                        <p className="text-sm text-gray-500">策略类型</p>
                        {isEditing ? (
                            tagsLoading ? (
                                <p className="text-gray-400">加载中...</p>
                            ) : (
                                <select
                                    value={safeEditForm.strategy}
                                    onChange={(e) => handleFormChange('strategy', e.target.value)}
                                    className="w-full mt-1 border border-gray-300 rounded px-2 py-1"
                                >
                                    <option value="">请选择策略类型</option>
                                    {tags.strategies.map(strategy => (
                                        <option key={strategy.id} value={strategy.id}>
                                            {strategy.strategy_name}
                                        </option>
                                    ))}
                                </select>
                            )
                        ) : (
                            <p className="font-medium">{product.strategy_name}</p>
                        )}
                    </div>

                    {/* 7. 产品描述 */}
                    <div className="bg-gray-50 p-3 rounded col-span-2">
                        <p className="text-sm text-gray-500">产品描述</p>
                        {isEditing ? (
                            <textarea
                                value={safeEditForm.product_desc}
                                onChange={(e) => handleFormChange('product_desc', e.target.value)}
                                rows={3}
                                className="w-full mt-1 border border-gray-300 rounded px-2 py-1"
                                placeholder="请输入产品描述（选填）"
                            />
                        ) : (
                            <p>{product.product_desc || '暂无描述'}</p>
                        )}
                    </div>

                    {/* 8. 净值导出/导入区域 */}
                    <div className="bg-gray-50 p-3 rounded col-span-2">
                        <p className="text-sm text-gray-500">净值数据导出/导入</p>
                        <div className="flex gap-2 items-center">
                            <div className="flex flex-col flex-1">
                                <label className="text-xs text-gray-600 mb-1">开始日期</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="border border-gray-300 rounded px-2 py-1 text-xs"
                                    max={new Date().toISOString().split('T')[0]}
                                />
                            </div>
                            <div className="flex flex-col flex-1">
                                <label className="text-xs text-gray-600 mb-1">结束日期</label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={handleEndDateChange}
                                    className="border border-gray-300 rounded px-2 py-1 text-xs"
                                    max={new Date().toISOString().split('T')[0]}
                                    min={startDate}
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-2">
                            <button
                                onClick={handleDownloadCSV}
                                disabled={downloading}
                                className="flex-1 bg-blue-600 text-white px-3 py-1.5 rounded-md flex items-center justify-center gap-2 text-sm hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                            >
                                {downloading ? (
                                    <span className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 4v12l-4-2-4 2V4M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    下载中...
                  </span>
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                        导出净值CSV
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* 净值曲线 + 导入按钮 */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 mb-6 transition-all hover:shadow-md">
                <div className="mb-6 flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-gray-800">净值的曲线</h2>
                    {isAdmin && (
                        <>
                            <button
                                onClick={handleImportClick}
                                disabled={importing}
                                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 hover:shadow-sm active:scale-98 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:scale-100 transition-all"
                            >
                                {importing ? (
                                    <span className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 4v12l-4-2-4 2V4M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    导入中...
                  </span>
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        导入净值CSV
                                    </>
                                )}
                            </button>
                            <input
                                type="file"
                                ref={(el) => setFileInputRef(el)}
                                onChange={handleFileChange}
                                accept=".csv"
                                className="hidden"
                            />
                        </>
                    )}
                </div>
                <div className="mt-4">
                    <NetValueChart
                        netValues={netValues}
                        productName={product.product_name}
                        loading={false}
                    />
                </div>
            </div>

            <ProductNetValueManager initialProductId={initialProductId} />
        </div>
    );
}