'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';

// 补充：定义用户信息接口（规范数据类型，避免any）
interface UserInfo {
    is_admin: boolean;
    username: string;
}

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

            // ---------------- 核心修改1：新增「获取用户信息（是否管理员）」 ----------------
            const userInfo = await fetchUserInfo(token); // 调用封装的用户信息请求方法

            // ---------------- 核心修改2：存储 Token + 用户名 + 管理员标识（完整权限信息） ----------------
            localStorage.setItem('fundAdminToken', token);
            localStorage.setItem('username', username);
            // 关键：将布尔值 is_admin 转为字符串存储（localStorage仅支持字符串）
            localStorage.setItem('fundIsAdmin', String(userInfo.is_admin));

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

    // ---------------- 核心修改3：封装「获取用户信息」方法（复用+合规） ----------------
    const fetchUserInfo = async (token: string): Promise<UserInfo> => {
        try {
            const response = await fetch('http://127.0.0.1:8000/api/user/info/', {
                method: 'GET',
                headers: {
                    'Authorization': `Token ${token}`, // 携带token认证，后端识别当前用户
                    'Content-Type': 'application/json',
                },
            });

            // 处理接口请求失败（非200状态码）
            if (!response.ok) {
                throw new Error(`获取用户信息失败（状态码：${response.status}）`);
            }

            const data = await response.json() as UserInfo; // 类型断言，规范返回数据
            return data;
        } catch (err) {
            throw new Error('获取用户权限信息失败，请联系管理员');
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