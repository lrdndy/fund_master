'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import * as echarts from 'echarts';
import { benchmarkApi } from '@/lib/api';
import type {
    BenchmarkIndex,
    BenchmarkNetValuePoint,
    BenchmarkMissingDatesResponse,
} from '@/lib/types';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const EXCHANGE_LABEL: Record<string, string> = {
    SH: '上海证券交易所',
    SZ: '深圳证券交易所',
    CSI: '中证指数公司自编',
    BJ: '北京证券交易所',
    MOCK: '模拟/外部指数',
};

export default function BenchmarkDetailPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const id = Number(params?.id);

    const [info, setInfo] = useState<BenchmarkIndex | null>(null);
    const [netValues, setNetValues] = useState<BenchmarkNetValuePoint[]>([]);
    const [missing, setMissing] = useState<BenchmarkMissingDatesResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 表格分页（前端切片）
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    // 补录/编辑弹窗
    const [editing, setEditing] = useState<{ date: string; close: string; isNew: boolean } | null>(null);
    const [saving, setSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    // 缺失日期日期范围筛选
    const [missingStart, setMissingStart] = useState<string>('');
    const [missingEnd, setMissingEnd] = useState<string>('');

    // 图表
    const chartRef = useRef<HTMLDivElement | null>(null);
    const chartInst = useRef<echarts.ECharts | null>(null);

    const loadInfo = useCallback(async () => {
        if (!id || Number.isNaN(id)) return;
        try {
            const b = await benchmarkApi.getBenchmark(id);
            setInfo(b);
        } catch (e) {
            console.error(e);
            setError('基准信息加载失败');
        }
    }, [id]);

    const loadNetValues = useCallback(async () => {
        if (!id || Number.isNaN(id)) return;
        try {
            const res = await benchmarkApi.getBenchmarkNetValues(id);
            const list = (res.results ?? []).slice().sort((a, b) => a.net_value_date.localeCompare(b.net_value_date));
            setNetValues(list);
        } catch (e) {
            console.error(e);
            setError('净值数据加载失败');
        }
    }, [id]);

    const loadMissing = useCallback(async () => {
        if (!id || Number.isNaN(id)) return;
        try {
            const res = await benchmarkApi.getBenchmarkMissingDates(
                id,
                missingStart || undefined,
                missingEnd || undefined,
            );
            setMissing(res);
        } catch (e) {
            console.error(e);
        }
    }, [id, missingStart, missingEnd]);

    useEffect(() => {
        setLoading(true);
        Promise.all([loadInfo(), loadNetValues(), loadMissing()]).finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // 渲染图表
    useEffect(() => {
        if (!chartRef.current) return;
        if (!chartInst.current) chartInst.current = echarts.init(chartRef.current);
        const data = netValues.map(nv => [nv.net_value_date, Number(nv.close_price)]);
        chartInst.current.setOption({
            title: { text: '收盘点位走势', left: 'center', textStyle: { fontSize: 14 } },
            tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => Number(v).toFixed(4) },
            grid: { left: '8%', right: '5%', bottom: '15%', top: '15%' },
            xAxis: { type: 'time' },
            yAxis: { type: 'value', scale: true, axisLabel: { formatter: (v: number) => v.toFixed(2) } },
            dataZoom: [{ type: 'slider', bottom: 5 }, { type: 'inside' }],
            series: [{
                type: 'line',
                smooth: true,
                showSymbol: false,
                data,
                lineStyle: { width: 2, color: '#3b82f6' },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: '#3b82f620' },
                        { offset: 1, color: '#3b82f600' },
                    ]),
                },
            }],
        }, true);
        const resize = () => chartInst.current?.resize();
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, [netValues]);

    // 分页切片
    const pagedRows = useMemo(() => {
        // 按日期降序展示（最新在上）
        const desc = [...netValues].sort((a, b) => b.net_value_date.localeCompare(a.net_value_date));
        const start = (page - 1) * pageSize;
        return desc.slice(start, start + pageSize);
    }, [netValues, page, pageSize]);

    const totalPages = Math.max(1, Math.ceil(netValues.length / pageSize));

    // 补录/编辑提交
    const handleSave = async () => {
        if (!editing) return;
        const close = parseFloat(editing.close);
        if (!editing.date) return setEditError('日期必填');
        if (Number.isNaN(close) || close <= 0) return setEditError('收盘点位必须是正数');
        setSaving(true);
        setEditError(null);
        try {
            await benchmarkApi.upsertBenchmarkNetValue(id, editing.date, close);
            setEditing(null);
            await Promise.all([loadNetValues(), loadMissing()]);
        } catch (e) {
            const err = e as { response?: { data?: { message?: string } } };
            setEditError(err.response?.data?.message ?? '保存失败');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (date: string) => {
        if (!confirm(`确认删除 ${date} 的数据？`)) return;
        try {
            await benchmarkApi.deleteBenchmarkNetValue(id, date);
            await Promise.all([loadNetValues(), loadMissing()]);
        } catch (e) {
            console.error(e);
            alert('删除失败');
        }
    };

    if (Number.isNaN(id)) {
        return <div className="p-6 text-red-600">无效的基准 ID</div>;
    }

    return (
        <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-500">
                <button onClick={() => router.push('/admin/benchmarks')} className="hover:text-blue-600">基准管理</button>
                <span>/</span>
                <span className="text-gray-700">{info?.index_name ?? '基准详情'}</span>
            </div>

            {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{error}</div>}

            {/* 基本信息卡 */}
            <div className="bg-white border border-gray-200 rounded p-6">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-800">
                            {info?.index_name ?? '加载中...'}
                            {info && !info.is_valid && <span className="ml-2 px-2 py-0.5 bg-gray-200 text-gray-600 rounded text-xs">已停用</span>}
                        </h2>
                        <div className="text-sm text-gray-500 mt-1 font-mono">{info?.index_code}</div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => router.push(`/admin/benchmarks/${id}/edit`)}
                            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                        >
                            编辑信息
                        </button>
                        <button
                            onClick={() => {
                                const today = new Date().toISOString().split('T')[0];
                                setEditing({ date: today, close: '', isNew: true });
                                setEditError(null);
                            }}
                            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                            新增净值
                        </button>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                    <Field label="简称" value={info?.index_short_name || '—'} />
                    <Field label="交易所" value={info?.exchange ? `${info.exchange} - ${EXCHANGE_LABEL[info.exchange] ?? ''}` : '—'} />
                    <Field label="净值数据点" value={`${netValues.length} 条`} />
                    <Field label="时间范围" value={netValues.length ? `${netValues[0].net_value_date} ~ ${netValues[netValues.length - 1].net_value_date}` : '—'} />
                    <Field label="东财 secid" value={info?.em_secid_override || '（自动推断）'} mono />
                    <Field label="创建时间" value={info?.create_time?.slice(0, 19).replace('T', ' ') ?? '—'} />
                    <Field label="更新时间" value={info?.update_time?.slice(0, 19).replace('T', ' ') ?? '—'} />
                </div>
            </div>

            {/* 净值图 */}
            <div className="bg-white border border-gray-200 rounded p-4">
                <div ref={chartRef} style={{ width: '100%', height: 380 }} />
                {loading && <div className="text-center text-gray-400 text-sm">加载中...</div>}
                {!loading && netValues.length === 0 && <div className="text-center text-gray-500 text-sm py-8">暂无净值数据，可点右上"新增净值"或在列表页用 CSV 导入</div>}
            </div>

            {/* 缺失交易日 */}
            <div className="bg-white border border-gray-200 rounded p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                        <h3 className="text-base font-semibold text-gray-800">缺失交易日</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                            参考其他有效基准的日期合集判定（在其他基准里有数据、当前基准缺失的日期）
                            {missing && <> · 参考日期池 {missing.reference_count} 天</>}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <input
                            type="date"
                            value={missingStart}
                            onChange={e => setMissingStart(e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-xs"
                        />
                        <span className="text-gray-400">~</span>
                        <input
                            type="date"
                            value={missingEnd}
                            onChange={e => setMissingEnd(e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-xs"
                        />
                        <button
                            onClick={loadMissing}
                            className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                        >
                            刷新
                        </button>
                    </div>
                </div>
                {!missing ? (
                    <div className="text-sm text-gray-500">加载中...</div>
                ) : missing.reference_count === 0 ? (
                    <div className="text-sm text-gray-500">暂无其他基准作为交易日参考，无法判定缺失</div>
                ) : missing.missing_dates.length === 0 ? (
                    <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
                        ✓ 当前基准在 {missing.start} ~ {missing.end} 内无明显缺失
                    </div>
                ) : (
                    <div className="border border-orange-200 rounded">
                        <div className="bg-orange-50 px-3 py-2 text-sm text-orange-800 border-b border-orange-200">
                            发现 {missing.missing_dates.length} 个可能缺失的交易日
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                            <table className="w-full text-sm">
                                <tbody>
                                    {missing.missing_dates.map(d => (
                                        <tr key={d} className="border-t border-gray-100 hover:bg-gray-50">
                                            <td className="px-3 py-2 font-mono text-gray-700">{d}</td>
                                            <td className="px-3 py-2 text-right">
                                                <button
                                                    onClick={() => { setEditing({ date: d, close: '', isNew: true }); setEditError(null); }}
                                                    className="text-blue-600 hover:underline text-xs"
                                                >
                                                    补录
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* 净值明细表 */}
            <div className="bg-white border border-gray-200 rounded p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-gray-800">净值明细</h3>
                    <div className="text-sm text-gray-500">共 {netValues.length} 条</div>
                </div>
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                        <tr>
                            <th className="px-3 py-2 text-left">交易日期</th>
                            <th className="px-3 py-2 text-right">收盘点位</th>
                            <th className="px-3 py-2 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pagedRows.map(nv => (
                            <tr key={nv.net_value_date} className="border-t border-gray-100 hover:bg-gray-50">
                                <td className="px-3 py-2 font-mono text-gray-700">{nv.net_value_date}</td>
                                <td className="px-3 py-2 text-right">{Number(nv.close_price).toFixed(4)}</td>
                                <td className="px-3 py-2 text-right space-x-3">
                                    <button
                                        onClick={() => { setEditing({ date: nv.net_value_date, close: String(nv.close_price), isNew: false }); setEditError(null); }}
                                        className="text-blue-600 hover:underline text-xs"
                                    >
                                        编辑
                                    </button>
                                    <button
                                        onClick={() => handleDelete(nv.net_value_date)}
                                        className="text-red-600 hover:underline text-xs"
                                    >
                                        删除
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {pagedRows.length === 0 && (
                            <tr>
                                <td colSpan={3} className="px-3 py-8 text-center text-gray-500">暂无数据</td>
                            </tr>
                        )}
                    </tbody>
                </table>

                {netValues.length > 0 && (
                    <div className="flex items-center justify-between text-sm text-gray-600 pt-2 border-t border-gray-100">
                        <div className="flex items-center gap-2">
                            <span>每页</span>
                            <select
                                value={pageSize}
                                onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                                className="px-2 py-1 border border-gray-300 rounded text-xs"
                            >
                                {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                disabled={page <= 1}
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40"
                            >
                                上一页
                            </button>
                            <span className="text-xs">第 {page} / {totalPages} 页</span>
                            <button
                                disabled={page >= totalPages}
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40"
                            >
                                下一页
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* 补录/编辑 modal */}
            {editing && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
                        <div className="flex justify-between items-start">
                            <h3 className="text-lg font-semibold text-gray-800">
                                {editing.isNew ? '新增/补录净值' : '编辑净值'}
                            </h3>
                            <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">交易日期</label>
                            <input
                                type="date"
                                value={editing.date}
                                onChange={e => setEditing({ ...editing, date: e.target.value })}
                                disabled={!editing.isNew}
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm disabled:bg-gray-100"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">收盘点位</label>
                            <input
                                type="number"
                                step="0.0001"
                                value={editing.close}
                                onChange={e => setEditing({ ...editing, close: e.target.value })}
                                placeholder="例如 3800.4321"
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                            />
                        </div>
                        {editError && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{editError}</div>}
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded">取消</button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                                {saving ? '保存中...' : '保存'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div>
            <div className="text-xs text-gray-500">{label}</div>
            <div className={`text-gray-800 mt-0.5 ${mono ? 'font-mono' : ''}`}>{value}</div>
        </div>
    );
}
