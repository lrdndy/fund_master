'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { benchmarkApi } from '@/lib/api';
import BenchmarkForm from '@/components/admin/BenchmarkForm';
import type { BenchmarkIndex, BenchmarkExchange } from '@/lib/types';

export default function EditBenchmarkPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const id = Number(params?.id);
    const [data, setData] = useState<BenchmarkIndex | null>(null);
    const [error, setError] = useState<string | null>(null);

    // 'id 无效' 用派生表达，避免 useEffect 内同步 setError 触发
    // react-hooks/set-state-in-effect；远程加载失败仍用 state 表达。
    const idInvalid = !id || Number.isNaN(id);
    const displayError = idInvalid ? '无效的基准 ID' : error;

    useEffect(() => {
        if (idInvalid) return;
        benchmarkApi.getBenchmark(id).then(setData).catch(e => {
            console.error(e);
            setError('基准加载失败');
        });
    }, [id, idInvalid]);

    return (
        <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-500">
                <button onClick={() => router.push('/admin/benchmarks')} className="hover:text-blue-600">基准管理</button>
                <span>/</span>
                <span className="text-gray-700">编辑基准</span>
            </div>
            <h2 className="text-xl font-semibold text-gray-800">编辑基准指数</h2>
            {displayError && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{displayError}</div>}
            {!data ? (
                !error && <div className="text-gray-500 text-sm">加载中...</div>
            ) : (
                <BenchmarkForm
                    showIsValid
                    submitLabel="保存"
                    initial={{
                        index_code: data.index_code,
                        index_name: data.index_name,
                        index_short_name: data.index_short_name ?? '',
                        exchange: (data.exchange as BenchmarkExchange | null) ?? '',
                        em_secid_override: data.em_secid_override ?? '',
                        is_valid: data.is_valid,
                    }}
                    onCancel={() => router.push('/admin/benchmarks')}
                    onSubmit={async (values) => {
                        await benchmarkApi.updateBenchmark(id, values);
                        router.push('/admin/benchmarks');
                    }}
                />
            )}
        </div>
    );
}
