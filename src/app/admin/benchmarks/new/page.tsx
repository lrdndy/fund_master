'use client';

import { useRouter } from 'next/navigation';
import { benchmarkApi } from '@/lib/api';
import BenchmarkForm from '@/components/admin/BenchmarkForm';

export default function NewBenchmarkPage() {
    const router = useRouter();

    return (
        <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-500">
                <button onClick={() => router.push('/admin/benchmarks')} className="hover:text-blue-600">基准管理</button>
                <span>/</span>
                <span className="text-gray-700">新建基准</span>
            </div>
            <h2 className="text-xl font-semibold text-gray-800">新建基准指数</h2>
            <BenchmarkForm
                submitLabel="创建"
                onCancel={() => router.push('/admin/benchmarks')}
                onSubmit={async (values) => {
                    await benchmarkApi.createBenchmark(values);
                    router.push('/admin/benchmarks');
                }}
            />
        </div>
    );
}
