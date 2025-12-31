'use client';
import { useEffect, useState } from 'react';
import { productApi, netValueApi } from '@/lib/api';
import { Product, ProductNetValue } from '@/lib/types';
import { notFound } from 'next/navigation';

// 定义组件Props
interface ProductNetValueManagerProps {
    initialProductId: string; // 目标产品ID
}

// 表单数据类型
interface NetValueFormData {
    id?: number; // 编辑时必填
    product: number;
    net_value_date: string;
    net_value: string;
    data_source: string;
}

export default function ProductNetValueManager({ initialProductId }: ProductNetValueManagerProps) {
    // 核心状态定义
    const [product, setProduct] = useState<Product | null>(null);
    const [isAdmin, setIsAdmin] = useState<boolean>(false); // 管理员权限标识
    const [loading, setLoading] = useState<boolean>(true); // 数据加载状态
    const [operateTip, setOperateTip] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null); // 操作提示

    // 分页相关状态
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(10); // 每页条数
    const [totalCount, setTotalCount] = useState<number>(0); // 总条数
    const [netValueList, setNetValueList] = useState<ProductNetValue[]>([]); // 当前页净值列表

    // 表单/模态框相关状态
    const [isAddModal, setIsAddModal] = useState<boolean>(false); // 新增模态框
    const [isEditModal, setIsEditModal] = useState<boolean>(false); // 编辑模态框
    const [formData, setFormData] = useState<NetValueFormData>({
        product: 0,
        net_value_date: '',
        net_value: '',
        data_source: '手动录入'
    });

    // 第一步：初始化（获取产品信息、管理员权限、净值列表）
    useEffect(() => {
        // 1. 判断管理员权限
        const fundIsAdmin = localStorage.getItem('fundIsAdmin');
        setIsAdmin(fundIsAdmin === 'true');

        // 2. 获取目标产品信息
        const fetchProductAndNetValue = async () => {
            try {
                const productId = parseInt(initialProductId);
                if (isNaN(productId)) {
                    notFound();
                    return;
                }

                // 获取产品信息
                const productRes = await productApi.getProductById(productId);
                setProduct(productRes);

                // 初始化表单产品ID
                setFormData(prev => ({ ...prev, product: productId }));

                // 获取该产品所有净值数据（前端分页）
                await fetchNetValueList(productId);
            } catch (err) {
                setOperateTip({ type: 'error', message: '加载产品或净值数据失败' });
                console.error('初始化失败：', err);
            } finally {
                setLoading(false);
            }
        };

        fetchProductAndNetValue();
    }, [initialProductId]);

    // 第二步：封装分页查询净值列表方法
    const fetchNetValueList = async (productId: number) => {
        try {
            // 获取该产品所有净值数据
            const netValueRes = await productApi.getNetValuesByProductId(productId);
            const allList = netValueRes.results || [];

            // 计算总条数
            setTotalCount(allList.length);

            // 前端分页切片
            const startIndex = (currentPage - 1) * pageSize;
            const endIndex = startIndex + pageSize;
            const currentPageList = allList.slice(startIndex, endIndex);

            setNetValueList(currentPageList);
        } catch (err) {
            setOperateTip({ type: 'error', message: '获取净值列表失败' });
            console.error('查询净值失败：', err);
        }
    };

    // 第三步：分页切换/每页条数变更
    const handlePageChange = (page: number) => {
        if (page < 1 || page > Math.ceil(totalCount / pageSize)) return;
        setCurrentPage(page);
        // 重新查询当前页数据
        product && fetchNetValueList(product.id);
    };

    const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newPageSize = parseInt(e.target.value);
        setPageSize(newPageSize);
        setCurrentPage(1); // 重置为第一页
        product && fetchNetValueList(product.id);
    };

    // 第四步：表单处理（新增/编辑）
    // 表单输入变更
    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // 重置表单
    const resetForm = () => {
        setFormData({
            product: product?.id || 0,
            net_value_date: '',
            net_value: '',
            data_source: '手动录入'
        });
    };

    // 新增模态框打开/关闭
    const handleAddModalOpen = () => {
        resetForm();
        setIsAddModal(true);
    };

    const handleAddModalClose = () => {
        setIsAddModal(false);
        resetForm();
    };

    // 编辑模态框打开/关闭（回显数据）
    const handleEditModalOpen = async (id: number) => {
        try {
            // 获取单条净值详情
            const netValueDetail = await netValueApi.getNetValueById(id);
            setFormData({
                id: netValueDetail.id,
                product: netValueDetail.product,
                net_value_date: netValueDetail.net_value_date,
                net_value: netValueDetail.net_value.toString(),
                data_source: netValueDetail.data_source || '手动录入'
            });
            setIsEditModal(true);
        } catch (err) {
            setOperateTip({ type: 'error', message: '获取待编辑净值详情失败' });
            console.error('编辑回显失败：', err);
        }
    };

    const handleEditModalClose = () => {
        setIsEditModal(false);
        resetForm();
    };

    // 第五步：核心CRUD操作
    // 1. 新增净值
    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!product) return;

        // 表单校验
        if (!formData.net_value_date || !formData.net_value) {
            setOperateTip({ type: 'info', message: '日期和净值不能为空' });
            return;
        }
        const netValueNum = parseFloat(formData.net_value);
        if (isNaN(netValueNum) || netValueNum < 0) {
            setOperateTip({ type: 'info', message: '净值必须为非负数字' });
            return;
        }

        try {
            // 构造请求数据
            const requestData = {
                product: formData.product,
                net_value_date: formData.net_value_date,
                net_value: netValueNum,
                data_source: formData.data_source
            };

            // 调用新增API
            await netValueApi.createNetValue(requestData);

            // 关闭模态框、重置表单、刷新列表
            handleAddModalClose();
            setOperateTip({ type: 'success', message: '新增净值成功' });
            await fetchNetValueList(product.id);
        } catch (err: any) {
            setOperateTip({ type: 'error', message: err.message || '新增净值失败' });
            console.error('新增失败：', err);
        }
    };

    // 2. 更新净值
    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.id || !product) return;

        // 表单校验
        if (!formData.net_value_date || !formData.net_value) {
            setOperateTip({ type: 'info', message: '日期和净值不能为空' });
            return;
        }
        const netValueNum = parseFloat(formData.net_value);
        if (isNaN(netValueNum) || netValueNum < 0) {
            setOperateTip({ type: 'info', message: '净值必须为非负数字' });
            return;
        }

        try {
            // 构造请求数据
            const requestData = {
                product: formData.product,
                net_value_date: formData.net_value_date,
                net_value: netValueNum,
                data_source: formData.data_source
            };

            // 调用更新API
            await netValueApi.updateNetValue(formData.id, requestData);

            // 关闭模态框、重置表单、刷新列表
            handleEditModalClose();
            setOperateTip({ type: 'success', message: '更新净值成功' });
            await fetchNetValueList(product.id);
        } catch (err: any) {
            setOperateTip({ type: 'error', message: err.message || '更新净值失败' });
            console.error('更新失败：', err);
        }
    };

    // 3. 删除净值
    const handleDelete = async (id: number) => {
        if (!window.confirm('确认删除该条净值数据？删除后不可恢复！')) return;
        if (!product) return;

        try {
            await netValueApi.deleteNetValue(id);
            setOperateTip({ type: 'success', message: '删除净值成功' });
            // 刷新列表（若当前页只剩1条，且不是第1页，切换到上一页）
            if (netValueList.length === 1 && currentPage > 1) {
                setCurrentPage(currentPage - 1);
            }
            await fetchNetValueList(product.id);
        } catch (err: any) {
            setOperateTip({ type: 'error', message: err.message || '删除净值失败' });
            console.error('删除失败：', err);
        }
    };

    // 关闭操作提示
    const closeOperateTip = () => {
        setOperateTip(null);
    };

    // 加载状态展示
    if (loading) {
        return <div className="py-10 text-center">加载净值明细数据中...</div>;
    }

    if (!product) {
        return <div className="py-10 text-center text-red-500">产品不存在</div>;
    }

    return (
        <div className="bg-white rounded-lg border border-gray-200 p-6 mt-8">
            {/* 操作提示框 */}
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

            {/* 标题 + 管理员新增按钮 */}
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-800">
                    {product.product_name} - 净值明细（共{totalCount}条）
                </h2>
                {isAdmin && (
                    <button
                        onClick={handleAddModalOpen}
                        className="bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700 transition-colors"
                    >
                        新增净值
                    </button>
                )}
            </div>

            {/* 净值数据表格 */}
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">序号</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">净值日期</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">净值数值</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">数据来源</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                    </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                    {netValueList.length > 0 ? (
                        netValueList.map((item, index) => (
                            <tr key={item.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {(currentPage - 1) * pageSize + index + 1}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {item.net_value_date}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {item.net_value}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {item.data_source || '未知'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    {isAdmin ? (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleEditModalOpen(item.id)}
                                                className="text-blue-600 hover:text-blue-900"
                                            >
                                                编辑
                                            </button>
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="text-red-600 hover:text-red-900"
                                            >
                                                删除
                                            </button>
                                        </div>
                                    ) : (
                                        <span className="text-gray-400 text-xs">无操作权限</span>
                                    )}
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                                暂无净值数据
                            </td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </div>

            {/* 分页控件 */}
            <div className="flex justify-between items-center mt-6">
                <div className="text-sm text-gray-500">
                    共{totalCount}条 · 第{currentPage}页 / 共{Math.ceil(totalCount / pageSize)}页
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
                        disabled={currentPage >= Math.ceil(totalCount / pageSize)}
                        className="px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        下一页
                    </button>
                </div>
            </div>

            {/* 新增净值模态框 */}
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
                                <label className="block text-sm font-medium text-gray-700 mb-1">净值数值</label>
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

            {/* 编辑净值模态框 */}
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
                                <label className="block text-sm font-medium text-gray-700 mb-1">净值数值</label>
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
