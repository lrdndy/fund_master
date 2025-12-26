'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    // 1. 解决 ESLint: Unexpected any → 用 unknown 替代 any，安全处理错误
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        // 表单验证：避免空用户名/密码
        if (!username.trim() || !password.trim()) {
            setError('用户名和密码不能为空');
            setLoading(false);
            return;
        }

        try {
            // 2. 解决 TS2339: 没有 login 方法 → 改用 api.ts 中定义的 getToken 方法
            const { token } = await authApi.getToken(username, password);

            // 存储 Token（与之前的 API 封装保持一致：fundAdminToken）
            localStorage.setItem('fundAdminToken', token);
            localStorage.setItem('username', username);

            // 跳转到主页
            router.push('/');
            router.refresh();
        } catch (err: unknown) {
            // 安全处理错误信息（避免 any 类型）
            let errMsg = '登录失败，请检查用户名或密码';
            if (
                typeof err === 'object' &&
                err !== null &&
                'response' in err &&
                (err as { response?: unknown }).response !== null
            ) {
                const response = (err as { response: { data?: unknown } }).response;
                // 适配后端返回的错误格式（non_field_errors 是 Django 默认错误字段）
                if (
                    response.data &&
                    typeof response.data === 'object' &&
                    'non_field_errors' in response.data &&
                    Array.isArray((response.data as { non_field_errors: string[] }).non_field_errors)
                ) {
                    errMsg = (response.data as { non_field_errors: string[] }).non_field_errors[0];
                }
            } else if (err instanceof Error) {
                errMsg = err.message;
            }
            setError(errMsg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-[80vh] bg-gray-50">
            <div className="card w-full max-w-md">
                <h1 className="text-2xl font-bold text-center mb-6 text-[var(--color-primary)]">
                    管理员登录
                </h1>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                            用户名
                        </label>
                        {/* 3. 统一样式类名：input → input-field（与全局样式定义一致） */}
                        <input
                            id="username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            className="input-field"
                            placeholder="请输入用户名"
                        />
                    </div>

                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                            密码
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="input-field"
                            placeholder="请输入密码"
                        />
                    </div>

                    {/* 4. 统一样式类名：btn btn-primary → btn-primary（与全局样式定义一致） */}
                    <button
                        type="submit"
                        className="btn-primary w-full"
                        disabled={loading}
                    >
                        {loading ? '登录中...' : '登录'}
                    </button>
                </form>
            </div>
        </div>
    );
}