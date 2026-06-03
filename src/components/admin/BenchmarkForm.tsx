'use client';

import { useState } from 'react';
import type { BenchmarkExchange, BenchmarkIndexInput } from '@/lib/types';

interface BenchmarkFormProps {
    initial?: Partial<BenchmarkIndexInput>;
    submitLabel: string;
    onSubmit: (values: BenchmarkIndexInput) => Promise<void>;
    onCancel: () => void;
    showIsValid?: boolean;
}

const EXCHANGES: Array<{ value: BenchmarkExchange; label: string }> = [
    { value: 'SH', label: 'SH - 上海证券交易所' },
    { value: 'SZ', label: 'SZ - 深圳证券交易所' },
    { value: 'CSI', label: 'CSI - 中证指数公司自编' },
    { value: 'BJ', label: 'BJ - 北京证券交易所' },
    { value: 'MOCK', label: 'MOCK - 模拟/外部指数' },
];

export default function BenchmarkForm({ initial, submitLabel, onSubmit, onCancel, showIsValid }: BenchmarkFormProps) {
    const [values, setValues] = useState<BenchmarkIndexInput>({
        index_code: initial?.index_code ?? '',
        index_name: initial?.index_name ?? '',
        index_short_name: initial?.index_short_name ?? '',
        exchange: initial?.exchange ?? '',
        em_secid_override: initial?.em_secid_override ?? '',
        ts_code_override: initial?.ts_code_override ?? '',
        is_valid: initial?.is_valid ?? true,
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const set = <K extends keyof BenchmarkIndexInput>(k: K, v: BenchmarkIndexInput[K]) =>
        setValues(prev => ({ ...prev, [k]: v }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!values.index_code.trim()) return setError('指数代码必填');
        if (!values.index_name.trim()) return setError('指数全称必填');
        setSubmitting(true);
        try {
            // 清理空字符串 -> 不传，避免后端写入空串
            const payload: BenchmarkIndexInput = {
                index_code: values.index_code.trim(),
                index_name: values.index_name.trim(),
                index_short_name: values.index_short_name?.trim() || undefined,
                exchange: values.exchange || undefined,
                em_secid_override: values.em_secid_override?.trim() || undefined,
                ts_code_override: values.ts_code_override?.trim() || undefined,
                is_valid: values.is_valid,
            };
            await onSubmit(payload);
        } catch (e) {
            const err = e as { response?: { data?: Record<string, string[] | string> } };
            const data = err.response?.data;
            if (data && typeof data === 'object') {
                const msg = Object.entries(data)
                    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
                    .join('；');
                setError(msg || '提交失败');
            } else {
                setError('提交失败');
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-gray-200 rounded p-6 max-w-2xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">指数代码 *</label>
                    <input
                        type="text"
                        value={values.index_code}
                        onChange={e => set('index_code', e.target.value)}
                        placeholder="例如 000300、932000、HSI"
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">指数全称 *</label>
                    <input
                        type="text"
                        value={values.index_name}
                        onChange={e => set('index_name', e.target.value)}
                        placeholder="例如 沪深300指数"
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">指数简称</label>
                    <input
                        type="text"
                        value={values.index_short_name ?? ''}
                        onChange={e => set('index_short_name', e.target.value)}
                        placeholder="例如 沪深300"
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">交易所</label>
                    <select
                        value={values.exchange ?? ''}
                        onChange={e => set('exchange', e.target.value as BenchmarkExchange | '')}
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm bg-white"
                    >
                        <option value="">未指定</option>
                        {EXCHANGES.map(x => (
                            <option key={x.value} value={x.value}>{x.label}</option>
                        ))}
                    </select>
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">东财 secid 覆盖</label>
                    <input
                        type="text"
                        value={values.em_secid_override ?? ''}
                        onChange={e => set('em_secid_override', e.target.value)}
                        placeholder="留空按 交易所+指数代码 自动推断（如 1.000300）"
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono"
                    />
                    <p className="text-xs text-gray-500 mt-1">仅当自动推断不正确时填写，例如港股或自定义来源</p>
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">tushare ts_code 覆盖</label>
                    <input
                        type="text"
                        value={values.ts_code_override ?? ''}
                        onChange={e => set('ts_code_override', e.target.value)}
                        placeholder="留空自动推断；如 000300.SH / 399812.SZ / 932000.CSI"
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        前缀自动推断：000xxx→.SH、399xxx→.SZ、932xxx→.CSI。其它代码需手动填。
                    </p>
                </div>
                {showIsValid && (
                    <div className="md:col-span-2">
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                                type="checkbox"
                                checked={values.is_valid ?? true}
                                onChange={e => set('is_valid', e.target.checked)}
                            />
                            启用（取消勾选等同于软删除，历史净值保留但不再出现在选项中）
                        </label>
                    </div>
                )}
            </div>

            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}

            <div className="flex justify-end gap-2 pt-2">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
                >
                    取消
                </button>
                <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                    {submitting ? '提交中...' : submitLabel}
                </button>
            </div>
        </form>
    );
}
