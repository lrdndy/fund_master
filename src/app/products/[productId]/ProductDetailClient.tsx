// app/products/[productId]/ProductDetailClient.tsx
'use client';
import { useEffect, useState } from 'react';
import { productApi } from '@/lib/api';
import NetValueChart from '@/components/products/NetValueChart';
import { Product, ProductNetValue } from '@/lib/types';
import { notFound } from 'next/navigation';

interface ProductDetailClientProps {
    initialProductId: string;
}

export default function ProductDetailClient({ initialProductId }: ProductDetailClientProps) {
    const [product, setProduct] = useState<Product | null>(null);
    const [netValues, setNetValues] = useState<ProductNetValue[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // 客户端组件中获取数据（运行在浏览器，支持 localStorage）
    useEffect(() => {
        const fetchProductData = async () => {
            setLoading(true);
            try {
                const productId = parseInt(initialProductId);
                if (isNaN(productId)) {
                    notFound();
                    return;
                }

                // 并行请求数据（此时 localStorage 可用，API 不会报错）
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

    // 加载状态
    if (loading) {
        return <div className="py-10 text-center">加载产品详情中...</div>;
    }

    // 错误状态
    if (error || !product) {
        return <div className="py-10 text-center text-red-500">{error || '产品不存在'}</div>;
    }

    // 正常渲染
    return (
        <div className="space-y-8 py-4">
            {/* 产品基础信息 */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h1 className="text-2xl font-bold text-gray-800 mb-4">{product.product_name}</h1>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                </div>
            </div>

            {/* 净值曲线图表 */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">净值趋势</h2>
                <NetValueChart
                    netValues={netValues}
                    productName={product.product_name}
                    loading={false}
                />
            </div>
        </div>
    );
}
