'use client';
import { useEffect, useState } from 'react';
import { productApi, downloadUtils, netValueApi } from '@/lib/api';
import NetValueChart from '@/components/products/NetValueChart';
import { Product, ProductNetValue } from '@/lib/types';
import { notFound } from 'next/navigation';
import ProductNetValueManager from "@/components/products/ProductNetValueManager";
interface ProductDetailClientProps {
    initialProductId: string;
}
export default function ProductDetailClient({ initialProductId }: ProductDetailClientProps) {
    const [product, setProduct] = useState<Product | null>(null);
    const [netValues, setNetValues] = useState<ProductNetValue[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [downloading, setDownloading] = useState<boolean>(false);
    // 新增：导入相关状态
    const [importing, setImporting] = useState<boolean>(false);
    const [fileInputRef, setFileInputRef] = useState<HTMLInputElement | null>(null);
    const [isAdmin, setIsAdmin] = useState<boolean>(false); // 管理员标识
    // 步骤1：初始化时判断是否为管理员
    useEffect(() => {
        const fundIsAdmin = localStorage.getItem('fundIsAdmin');
        setIsAdmin(fundIsAdmin === 'true'); // 匹配登录时存储的格式
    }, []);
    // 步骤2：原有数据获取逻辑
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
    // 步骤3：原有导出逻辑（保持不变）
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
            // 替换alert：设置页面提示
            setImportTip({ type: 'success', message: "CSV文件下载成功！" });
        } catch (err: any) {
            console.log("【下载调试】失败：", err);
            const errorMsg = err.message
                || err.response?.data?.msg
                || err.response?.data?.error
                || '文件下载失败，请重试';

            // 替换alert：根据错误类型设置提示
            if (errorMsg.includes('没有对应') || errorMsg.includes('无净值数据')) {
                setImportTip({ type: 'info', message: `提示：${errorMsg}` });
            } else {
                setImportTip({ type: 'error', message: `错误：${errorMsg}` });
            }
        } finally {
            setDownloading(false);
        }
    };

    // 步骤4：新增：导入逻辑（核心）
    const handleImportClick = () => {
        // 触发隐藏的文件选择框
        if (fileInputRef) {
            fileInputRef.click();
        }
    };
    const refreshNetValueData = async () => {
        if (!product?.id) return;
        try {
            const netValuesRes = await productApi.getNetValuesByProductId(product.id);
            setNetValues(netValuesRes.results);
        } catch (err) {
            console.error("刷新净值数据失败：", err);
        }
    };
    // 新增：导入结果提示的状态（区分成功/信息/错误）
    const [importTip, setImportTip] = useState<{
        type: 'success' | 'info' | 'error'; // success=全成功；info=部分失败；error=请求异常
        message: string;
    } | null>(null);
    // 新增：关闭提示的函数
    const closeImportTip = () => {
        setImportTip(null);
    };
    const parseImportErrorReason = (reason: string): string => {
        // 匹配 ErrorDetail 中的 string 内容（提取实际错误信息）
        const errorMatch = reason.match(/string='([^']+)'/);
        // 若匹配到则返回实际错误，否则返回原内容（兼容异常情况）
        return errorMatch ? errorMatch[1] : reason;
    };
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault();
        // 1. 基础校验（保持不变）
        if (!product || !product.id) {
            setImportTip({ type: 'info', message: "无效的产品信息，无法导入" });
            return;
        }
        const currentProductId = product.id;
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
            // 2. 第一步：先以「不覆盖」模式导入，检测是否有重复数据
            const noCoverResult = await netValueApi.importNetValueCsv(currentProductId, file, false);
            // 3. 检测是否有重复数据导致的失败（匹配后端返回的错误提示关键词）
            const hasDuplicateData = noCoverResult.failed_records.some(
                (record) => record.reason.includes("净值数据已存在")
            );
            if (hasDuplicateData) {
                // 4. 有重复数据：弹出确认框，询问用户是否覆盖
                const userConfirmCover = window.confirm(
                    `检测到${noCoverResult.failed_records.length}条重复数据，是否覆盖原有数据？`
                );
                if (userConfirmCover) {
                    // 5. 用户确认覆盖：以「覆盖」模式重新导入
                    const coverResult = await netValueApi.importNetValueCsv(currentProductId, file, true);
                    // 6. 整理覆盖后的结果，展示更新/新增数量
                    const coverMsg = `导入完成！<br />总计${coverResult.summary.total}条<br />成功${coverResult.summary.success}条（更新${coverResult.summary.updated}条，新增${coverResult.summary.created}条）<br />失败${coverResult.summary.failed}条`;
                    // 7. 若有失败（非重复原因），追加失败详情
                    let finalMsg = coverMsg;
                    if (coverResult.summary.failed > 0) {
                        const errorDetails = coverResult.failed_records
                            .map((record) => {
                                const friendlyReason = parseImportErrorReason(record.reason);
                                return `第${record.row_num}行：${friendlyReason}`;
                            })
                            .join('<br />');
                        finalMsg += `<br /><br />失败详情：<br />${errorDetails}`;
                    }
                    // 8. 设置页面提示（替换alert）
                    setImportTip({ type: 'info', message: finalMsg });
                } else {
                    // 9. 用户取消覆盖：展示不覆盖的失败结果
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
                // 10. 无重复数据：直接展示成功结果
                const successMsg = `导入完成！<br />总计${noCoverResult.summary.total}条<br />成功${noCoverResult.summary.success}条（新增${noCoverResult.summary.created}条）<br />失败${noCoverResult.summary.failed}条`;
                setImportTip({
                    type: noCoverResult.summary.failed === 0 ? 'success' : 'info',
                    message: successMsg
                });
            }
            await refreshNetValueData();
        } catch (err: any) {
            setImportTip({
                type: 'error',
                message: err.message || "CSV导入请求失败，请检查网络或后端服务"
            });
            console.log("【导入调试】请求异常：", err); // 替换error为log，避免红色错误
        } finally {
            setImporting(false);
            e.target.value = ""; // 重置文件选择框
        }
    };
    const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (startDate && value && value < startDate) {
            setImportTip({ type: 'info', message: "结束日期不能早于开始日期" });
            return;
        }
        setEndDate(value);
    };
    if (loading) {
        return <div className="py-10 text-center">加载产品详情中...</div>;
    }
    if (error || !product) {
        return <div className="py-10 text-center text-red-500">{error || '产品不存在'}</div>;
    }
    return (
        <div className="space-y-8 py-4">
            {importTip && (
                <div
                    className={`p-4 rounded-md border ${
                        importTip.type === 'success'
                            ? 'bg-green-50 border-green-200 text-green-700'
                            : importTip.type === 'info'
                                ? 'bg-blue-50 border-blue-200 text-blue-700' // 业务失败用“信息蓝”，而非错误红
                                : 'bg-red-50 border-red-200 text-red-700' // 仅请求异常用“错误红”
                    }`}
                >
                    <div className="flex justify-between items-start">
                        {/* 解析换行符为HTML换行 */}
                        <div dangerouslySetInnerHTML={{ __html: importTip.message.replace(/\n/g, '<br />') }} />
                        <button
                            onClick={closeImportTip}
                            className="ml-4 text-sm font-medium hover:opacity-80"
                        >
                            ×
                        </button>
                    </div>
                </div>
            )}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h1 className="text-2xl font-bold text-gray-800 mb-4">{product.product_name}</h1>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* 原有信息列（保持不变） */}
                    <div className="bg-gray-50 p-3 rounded">
                        <p className="text-sm text-gray-500">周期标签</p>
                        <p className="font-medium">{product.cycle_name}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded">
                        <p className="text-sm text-gray-500">量化类型</p>
                        <p className="font-medium">{product.quant_type_name}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded">
                        <p className="text-sm text-gray-500">算法类型</p>
                        <p className="font-medium">{product.algorithm_name}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded">
                        <p className="text-sm text-gray-500">策略类型</p>
                        <p className="font-medium">{product.strategy_name}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded col-span-2">
                        <p className="text-sm text-gray-500">产品描述</p>
                        <p>{product.product_desc || '暂无描述'}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded">
                        <p className="text-sm text-gray-500">产品打分</p>
                        <p className="font-medium">{product.score}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded flex flex-col gap-3">
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
                        <div className="flex gap-2">
                            {/* 原有导出按钮 */}
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
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 mb-6 transition-all hover:shadow-md">
                {/* 标题 + 导入按钮：横向两端对齐，布局更整洁 */}
                <div className="mb-6 flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-gray-800">净值的曲线</h2>

                    {/* 管理员导入按钮：右对齐，不与标题拥挤，优化按钮质感 */}
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

                {/* 图表区域：添加轻微间距，提升视觉边界感 */}
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