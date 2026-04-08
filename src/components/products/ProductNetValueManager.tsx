//ProductNetValueManager.tsx
'use client';
import { useEffect, useState } from 'react';
import { productApi, netValueApi } from '@/lib/api';
import { Product, ProductNetValue } from '@/lib/types';
import { notFound } from 'next/navigation';
import useAuth from '@/hooks/useAuth';

// 定义组件Props
interface ProductNetValueManagerProps {
    initialProductId: string; // 目标产品ID
}


// 表单数据类型 🔥 新增：累计单位净值
interface NetValueFormData {
    id?: number; // 编辑时必填
    product: number;
    net_value_date: string;
    net_value: string; // 单位净值
    cumulative_unit_net_value: string; // 🔥 累计单位净值
    data_source: string;
}

// 🔥 新增：错误类型守卫工具函数（解决catch块any问题）
const getErrorMessage = (err: unknown): string => {
    if (err instanceof Error) return err.message;
    if (err && typeof err === 'object' && 'message' in err) {
        return String(err.message);
    }
    return '操作失败，请重试';
};

export default function ProductNetValueManager({ initialProductId }: ProductNetValueManagerProps) {
    // 核心状态定义
    const [product, setProduct] = useState<Product | null>(null);
    const {
        hasWritePermission,
        loading: authLoading
    } = useAuth();
    const [loading, setLoading] = useState<boolean>(true);
    const [operateTip, setOperateTip] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

    // 分页相关状态
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(10);
    const [totalCount, setTotalCount] = useState<number>(0);
    const [netValueList, setNetValueList] = useState<ProductNetValue[]>([]);

    // 表单/模态框相关状态 🔥 初始化新增累计净值
    const [isAddModal, setIsAddModal] = useState<boolean>(false);
    const [isEditModal, setIsEditModal] = useState<boolean>(false);
    const [formData, setFormData] = useState<NetValueFormData>({
        product: 0,
        net_value_date: '',
        net_value: '',
        cumulative_unit_net_value: '', // 🔥 累计单位净值
        data_source: '手动录入'
    });
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    // 第一步：初始化
    useEffect(() => {
        const fetchProductAndNetValue = async () => {
            try {
                const productId = parseInt(initialProductId);
                if (isNaN(productId)) {
                    notFound();
                    return;
                }

                const productRes = await productApi.getProductById(productId);
                setProduct(productRes);

                setFormData(prev => ({ ...prev, product: productId }));
                await fetchNetValueList(productId);
            } catch (err: unknown) {
                setOperateTip({ type: 'error', message: '加载产品或净值数据失败' });
                console.error('初始化失败：', err);
            } finally {
                setLoading(false);
            }
        };

        fetchProductAndNetValue();
    }, [initialProductId]);

    // 第二步：分页查询净值列表
    const fetchNetValueList = async (productId: number) => {
        try {
            const netValueRes = await productApi.getNetValuesByProductId(
                productId,
                startDate, // 新增
                endDate    // 新增
            );
            const allList = netValueRes.results || [];
            setTotalCount(allList.length);

            const startIndex = (currentPage - 1) * pageSize;
            const endIndex = startIndex + pageSize;
            const currentPageList = allList.slice(startIndex, endIndex);

            setNetValueList(currentPageList);
        } catch (err: unknown) {
            setOperateTip({ type: 'error', message: '获取净值列表失败' });
            console.error('查询净值失败：', err);
        }
    };

    // 第三步：分页切换
    const handlePageChange = (page: number) => {
        const totalPage = Math.ceil(totalCount / pageSize);
        if (page < 1 || page > totalPage) return;
        setCurrentPage(page);
        product && fetchNetValueList(product.id);
    };

    const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newPageSize = parseInt(e.target.value);
        setPageSize(newPageSize);
        setCurrentPage(1);
        product && fetchNetValueList(product.id);
    };

    // 第四步：表单处理 🔥 支持累计净值
    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // 重置表单 🔥 新增累计净值重置
    const resetForm = () => {
        setFormData({
            product: product?.id || 0,
            net_value_date: '',
            net_value: '',
            cumulative_unit_net_value: '', // 🔥 重置
            data_source: '手动录入'
        });
    };

    const handleAddModalOpen = () => {
        resetForm();
        setIsAddModal(true);
    };

    const handleAddModalClose = () => {
        setIsAddModal(false);
        resetForm();
    };

    // 编辑回显 🔥 新增累计净值回显
    const handleEditModalOpen = async (id: number) => {
        try {
            const netValueDetail = await netValueApi.getNetValueById(id);
            setFormData({
                id: netValueDetail.id,
                product: netValueDetail.product,
                net_value_date: netValueDetail.net_value_date || '',
                net_value: netValueDetail.net_value != null ? netValueDetail.net_value.toString() : '',
                // 🔥 累计净值安全回显
                cumulative_unit_net_value: netValueDetail.cumulative_unit_net_value != null ? netValueDetail.cumulative_unit_net_value.toString() : '',
                data_source: netValueDetail.data_source || '手动录入'
            });
            setIsEditModal(true);
        } catch (err: unknown) {
            setOperateTip({ type: 'error', message: '获取待编辑净值详情失败' });
            console.error('编辑回显失败：', err);
        }
    };

    const handleEditModalClose = () => {
        setIsEditModal(false);
        resetForm();
    };

    // 第五步：核心CRUD 🔥 双净值提交
    // 1. 新增净值
    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!product) return;

        if (!formData.net_value_date || !formData.net_value) {
            setOperateTip({ type: 'info', message: '日期和单位净值不能为空' });
            return;
        }
        const netValueNum = parseFloat(formData.net_value);
        // 🔥 修复：直接返回 undefined，不返回 null
        const cumNetValueNum = formData.cumulative_unit_net_value ? parseFloat(formData.cumulative_unit_net_value) : undefined;

        if (isNaN(netValueNum) || netValueNum < 0) {
            setOperateTip({ type: 'info', message: '单位净值必须为非负数字' });
            return;
        }
        if (cumNetValueNum !== undefined && (isNaN(cumNetValueNum) || cumNetValueNum < 0)) {
            setOperateTip({ type: 'info', message: '累计净值必须为非负数字' });
            return;
        }

        try {
            const requestData = {
                product: formData.product,
                net_value_date: formData.net_value_date,
                net_value: netValueNum,
                cumulative_unit_net_value: cumNetValueNum, // 🔥 无 null，类型匹配
                data_source: formData.data_source
            };

            await netValueApi.createNetValue(requestData);
            handleAddModalClose();
            setOperateTip({ type: 'success', message: '新增净值成功' });
            await fetchNetValueList(product.id);
        } catch (err: unknown) {
            const errorMsg = getErrorMessage(err);
            setOperateTip({ type: 'error', message: errorMsg || '新增净值失败' });
            console.error('新增失败：', err);
        }
    };


    // 2. 更新净值
    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.id || !product) return;

        if (!formData.net_value_date || !formData.net_value) {
            setOperateTip({ type: 'info', message: '日期和单位净值不能为空' });
            return;
        }
        const netValueNum = parseFloat(formData.net_value);
        // 🔥 修复：直接返回 undefined，不返回 null
        const cumNetValueNum = formData.cumulative_unit_net_value ? parseFloat(formData.cumulative_unit_net_value) : undefined;

        if (isNaN(netValueNum) || netValueNum < 0) {
            setOperateTip({ type: 'info', message: '单位净值必须为非负数字' });
            return;
        }
        if (cumNetValueNum !== undefined && (isNaN(cumNetValueNum) || cumNetValueNum < 0)) {
            setOperateTip({ type: 'info', message: '累计净值必须为非负数字' });
            return;
        }

        try {
            const requestData = {
                product: formData.product,
                net_value_date: formData.net_value_date,
                net_value: netValueNum,
                cumulative_unit_net_value: cumNetValueNum, // 🔥 无 null，类型匹配
                data_source: formData.data_source
            };

            await netValueApi.updateNetValue(formData.id, requestData);
            handleEditModalClose();
            setOperateTip({ type: 'success', message: '更新净值成功' });
            await fetchNetValueList(product.id);
        } catch (err: unknown) {
            const errorMsg = getErrorMessage(err);
            setOperateTip({ type: 'error', message: errorMsg || '更新净值失败' });
            console.error('更新失败：', err);
        }
    };


    // 3. 删除净值
    const handleDelete = async (id: number) => {
        if (typeof window !== 'undefined' && !window.confirm('确认删除该条净值数据？删除后不可恢复！')) return;
        if (!product) return;

        try {
            await netValueApi.deleteNetValue(id);
            setOperateTip({ type: 'success', message: '删除净值成功' });
            if (netValueList.length === 1 && currentPage > 1) {
                setCurrentPage(currentPage - 1);
            }
            await fetchNetValueList(product.id);
        } catch (err: unknown) {
            const errorMsg = getErrorMessage(err);
            setOperateTip({ type: 'error', message: errorMsg || '删除净值失败' });
            console.error('删除失败：', err);
        }
    };

    const closeOperateTip = () => {
        setOperateTip(null);
    };

    // 加载状态
    if (loading) {
        return <div className="py-10 text-center">加载净值明细数据中...</div>;
    }

    if (!product) {
        return <div className="py-10 text-center text-red-500">产品不存在</div>;
    }

    const totalPage = Math.ceil(totalCount / pageSize);

    return (
        <div className="bg-white rounded-lg border border-gray-200 p-6 mt-8">
            {operateTip && (
                <div
                    className={`p-3 rounded-md mb-4 ${
                        operateTip.type === 'success'
                            ? 'bg-green-50 border border-green-200 text-green-700'
                            : operateTip.type === 'error'
                                ? 'bg-red-50 border border-red-200 text-red-700'
                                : 'bg-blue-50 border border-blue-200 text-blue-700'
                    }`}
                >
                    <div className="flex justify-between items-center">
                        <span>{operateTip.message}</span>
                        <button onClick={closeOperateTip} className="text-sm hover:opacity-80">×</button>
                    </div>
                </div>
            )}

            {/* 标题 */}
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-800">
                    {product.product_name} - 净值明细（共{totalCount}条）
                </h2>
                {hasWritePermission && (
                    <button
                        onClick={handleAddModalOpen}
                        className="bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700 transition-colors"
                    >
                        新增净值
                    </button>
                )}
            </div>

            {/* 🔥 修复水合错误：表格无任何空白字符 */}
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                    <tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">序号</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">净值日期</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">单位净值</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">累计单位净值</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">数据来源</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th></tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                    {netValueList.length > 0 ? (
                        netValueList.map((item, index) => (
                            <tr key={item.id}><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{(currentPage - 1) * pageSize + index + 1}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.net_value_date || '-'}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.net_value != null ? item.net_value : '-'}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.cumulative_unit_net_value != null ? item.cumulative_unit_net_value : '-'}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.data_source || '未知'}</td><td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{hasWritePermission ? (<div className="flex gap-2"><button onClick={() => handleEditModalOpen(item.id)} className="text-blue-600 hover:text-blue-900">编辑</button><button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-900">删除</button></div>) : (<span className="text-gray-400 text-xs">无操作权限</span>)}</td></tr>
                        ))
                    ) : (
                        <tr><td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">暂无净值数据</td></tr>
                    )}
                    </tbody>
                </table>
            </div>

            {/* 分页 */}
            <div className="flex justify-between items-center mt-6">
                <div className="text-sm text-gray-500">
                    共{totalCount}条 · 第{currentPage}页 / 共{totalPage || 1}页
                </div>
                <div className="flex gap-2 items-center">
                    <select
                        value={pageSize}
                        onChange={handlePageSizeChange}
                        className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                    >
                        <option value={10}>10条/页</option>
                        <option value={20}>20条/页</option>
                        <option value={50}>50条/页</option>
                    </select>
                    <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        上一页
                    </button>
                    <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage >= totalPage || totalPage === 0}
                        className="px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        下一页
                    </button>
                </div>
            </div>

            {/* 新增模态框 */}
            {isAddModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg w-full max-w-md p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold text-gray-800">新增净值</h3>
                            <button onClick={handleAddModalClose} className="text-gray-500 hover:text-gray-700">×</button>
                        </div>
                        <form onSubmit={handleAddSubmit}>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">净值日期</label>
                                <input
                                    type="date"
                                    name="net_value_date"
                                    value={formData.net_value_date}
                                    onChange={handleFormChange}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                    required
                                />
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">单位净值</label>
                                <input
                                    type="number"
                                    name="net_value"
                                    value={formData.net_value}
                                    onChange={handleFormChange}
                                    min="0"
                                    step="0.0001"
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                    required
                                />
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">累计单位净值（可选）</label>
                                <input
                                    type="number"
                                    name="cumulative_unit_net_value"
                                    value={formData.cumulative_unit_net_value}
                                    onChange={handleFormChange}
                                    min="0"
                                    step="0.0001"
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                />
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">数据来源</label>
                                <input
                                    type="text"
                                    name="data_source"
                                    value={formData.data_source}
                                    onChange={handleFormChange}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                />
                            </div>
                            <div className="flex gap-2 justify-end mt-6">
                                <button
                                    type="button"
                                    onClick={handleAddModalClose}
                                    className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
                                >
                                    取消
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 transition-colors"
                                >
                                    确认新增
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 编辑模态框 */}
            {isEditModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg w-full max-w-md p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold text-gray-800">编辑净值</h3>
                            <button onClick={handleEditModalClose} className="text-gray-500 hover:text-gray-700">×</button>
                        </div>
                        <form onSubmit={handleEditSubmit}>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">净值日期</label>
                                <input
                                    type="date"
                                    name="net_value_date"
                                    value={formData.net_value_date}
                                    onChange={handleFormChange}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                    required
                                />
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">单位净值</label>
                                <input
                                    type="number"
                                    name="net_value"
                                    value={formData.net_value}
                                    onChange={handleFormChange}
                                    min="0"
                                    step="0.0001"
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                    required
                                />
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">累计单位净值（可选）</label>
                                <input
                                    type="number"
                                    name="cumulative_unit_net_value"
                                    value={formData.cumulative_unit_net_value}
                                    onChange={handleFormChange}
                                    min="0"
                                    step="0.0001"
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                />
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">数据来源</label>
                                <input
                                    type="text"
                                    name="data_source"
                                    value={formData.data_source}
                                    onChange={handleFormChange}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                />
                            </div>
                            <div className="flex gap-2 justify-end mt-6">
                                <button
                                    type="button"
                                    onClick={handleEditModalClose}
                                    className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
                                >
                                    取消
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors"
                                >
                                    确认更新
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}