'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { benchmarkApi } from '@/lib/api';
import type { BenchmarkIndex, BenchmarkCsvImportResponse } from '@/lib/types';

export default function BenchmarksAdminPage() {
    const router = useRouter();
    const [list, setList] = useState<BenchmarkIndex[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [includeInvalid, setIncludeInvalid] = useState(false);

    // 上传弹窗状态
    const [uploadFor, setUploadFor] = useState<BenchmarkIndex | null>(null);
    const [isCover, setIsCover] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState<BenchmarkCsvImportResponse | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await benchmarkApi.getBenchmarks({
                search: search.trim() || undefined,
                include_invalid: includeInvalid,
            });
            setList(res.results ?? []);
        } catch (e) {
            console.error(e);
            setError('加载失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const t = setTimeout(load, 200);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, includeInvalid]);

    const handleDelete = async (b: BenchmarkIndex) => {
        if (!confirm(`确认删除基准"${b.index_name}"？删除为软删除，历史净值数据保留。`)) return;
        try {
            await benchmarkApi.deleteBenchmark(b.id);
            await load();
        } catch (e) {
            console.error(e);
            alert('删除失败');
        }
    };

    const handleRestore = async (b: BenchmarkIndex) => {
        try {
            await benchmarkApi.updateBenchmark(b.id, { is_valid: true });
            await load();
        } catch (e) {
            console.error(e);
            alert('恢复失败');
        }
    };

    const handleUpload = async () => {
        const f = fileRef.current?.files?.[0];
        if (!uploadFor || !f) {
            alert('请先选择 CSV 文件');
            return;
        }
        setUploading(true);
        setUploadResult(null);
        try {
            const res = await benchmarkApi.importBenchmarkNetValuesCsv(uploadFor.id, f, isCover);
            setUploadResult(res);
        } catch (e) {
            const err = e as { response?: { data?: BenchmarkCsvImportResponse } };
            console.error(e);
            setUploadResult(err.response?.data ?? { code: 500, message: '上传失败' });
        } finally {
            setUploading(false);
        }
    };

    const closeUpload = () => {
        setUploadFor(null);
        setIsCover(false);
        setUploadResult(null);
        if (fileRef.current) fileRef.current.value = '';
    };

    return (
        <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800">基准指数管理</h2>
                <button
                    onClick={() => router.push('/admin/benchmarks/new')}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                >
                    新建基准
                </button>
            </div>

            {/* 搜索 + 筛选 */}
            <div className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded p-3">
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="按指数代码 / 名称 / 简称搜索"
                    className="px-3 py-2 border border-gray-300 rounded text-sm flex-1 min-w-[240px]"
                />
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={includeInvalid}
                        onChange={e => setIncludeInvalid(e.target.checked)}
                    />
                    显示已停用
                </label>
            </div>

            {/* 列表 */}
            <div className="bg-white border border-gray-200 rounded">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">加载中...</div>
                ) : error ? (
                    <div className="p-8 text-center text-red-600">{error}</div>
                ) : list.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">暂无基准指数</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                            <tr>
                                <th className="px-4 py-3 text-left">指数代码</th>
                                <th className="px-4 py-3 text-left">全称</th>
                                <th className="px-4 py-3 text-left">简称</th>
                                <th className="px-4 py-3 text-left">交易所</th>
                                <th className="px-4 py-3 text-left">状态</th>
                                <th className="px-4 py-3 text-left">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.map(b => (
                                <tr
                                    key={b.id}
                                    className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                                    onClick={() => router.push(`/admin/benchmarks/${b.id}`)}
                                >
                                    <td className="px-4 py-3 font-mono text-gray-800">{b.index_code}</td>
                                    <td className="px-4 py-3 text-gray-800">{b.index_name}</td>
                                    <td className="px-4 py-3 text-gray-600">{b.index_short_name || '—'}</td>
                                    <td className="px-4 py-3 text-gray-600">{b.exchange || '—'}</td>
                                    <td className="px-4 py-3">
                                        {b.is_valid ? (
                                            <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs">有效</span>
                                        ) : (
                                            <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">已停用</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 space-x-2" onClick={e => e.stopPropagation()}>
                                        <button
                                            onClick={() => router.push(`/admin/benchmarks/${b.id}`)}
                                            className="text-blue-600 hover:underline text-xs"
                                        >
                                            详情
                                        </button>
                                        <button
                                            onClick={() => router.push(`/admin/benchmarks/${b.id}/edit`)}
                                            className="text-blue-600 hover:underline text-xs"
                                        >
                                            编辑
                                        </button>
                                        <button
                                            onClick={() => { setUploadFor(b); setUploadResult(null); }}
                                            className="text-blue-600 hover:underline text-xs"
                                        >
                                            上传净值
                                        </button>
                                        {b.is_valid ? (
                                            <button
                                                onClick={() => handleDelete(b)}
                                                className="text-red-600 hover:underline text-xs"
                                            >
                                                删除
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleRestore(b)}
                                                className="text-green-600 hover:underline text-xs"
                                            >
                                                恢复
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* 上传净值弹窗 */}
            {uploadFor && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-4">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-800">上传净值（CSV）</h3>
                                <p className="text-sm text-gray-500 mt-1">基准：{uploadFor.index_name} ({uploadFor.index_code})</p>
                            </div>
                            <button onClick={closeUpload} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
                        </div>

                        <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-600 space-y-1">
                            <div className="font-medium text-gray-700">CSV 格式要求</div>
                            <div>表头需包含：<code className="bg-white px-1 rounded">net_value_date</code>，<code className="bg-white px-1 rounded">close_price</code></div>
                            <div>日期支持 YYYY-MM-DD / YYYY/MM/DD / YYYYMMDD 等格式</div>
                            <div>close_price 必须 &gt; 0；其余列将被忽略</div>
                        </div>

                        <input
                            ref={fileRef}
                            type="file"
                            accept=".csv"
                            className="block w-full text-sm text-gray-700"
                        />

                        <label className="flex items-center gap-2 text-sm text-gray-700">
                            <input type="checkbox" checked={isCover} onChange={e => setIsCover(e.target.checked)} />
                            遇到已存在的日期时覆盖（不勾则跳过）
                        </label>

                        {uploadResult && (
                            <div className={`text-sm rounded p-3 ${uploadResult.code === 200 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                                <div className="font-medium">{uploadResult.message}</div>
                                {uploadResult.summary && (
                                    <div className="mt-1 text-xs">
                                        总计 {uploadResult.summary.total}，
                                        成功 {uploadResult.summary.success}（新建 {uploadResult.summary.created} / 更新 {uploadResult.summary.updated}），
                                        失败 {uploadResult.summary.failed}
                                    </div>
                                )}
                                {uploadResult.failed_records && uploadResult.failed_records.length > 0 && (
                                    <details className="mt-2 text-xs">
                                        <summary className="cursor-pointer">查看失败明细（前 {uploadResult.failed_records.length} 条）</summary>
                                        <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
                                            {uploadResult.failed_records.map((r, i) => (
                                                <li key={i}>第 {r.row_num} 行：{r.reason}</li>
                                            ))}
                                        </ul>
                                    </details>
                                )}
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-2">
                            <button onClick={closeUpload} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded">关闭</button>
                            <button
                                onClick={handleUpload}
                                disabled={uploading}
                                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                                {uploading ? '上传中...' : '上传'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
