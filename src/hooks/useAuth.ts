// @/hooks/useAuth.ts
import { useState, useEffect } from 'react';
// 🔥 直接复用api里定义的类型，无需重复写
import { authApi } from '@/lib/api';
import {UserInfo} from "@/lib/types";

export default function useAuth() {
    const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // 权限快捷判断
    const isAdmin = userInfo?.is_admin || false;
    const isProductOp = userInfo?.is_product_op || false;
    const isClient = userInfo?.is_client || false;
    const isAnalyst = userInfo?.is_analyst || false;

    // 核心权限：产品运营/管理员可写
    const hasWritePermission = isAdmin || isProductOp;

    useEffect(() => {
        const fetchUserInfo = async () => {
            const token = localStorage.getItem('fundAdminToken');
            if (!token) {
                setUserInfo(null);
                setLoading(false);
                return;
            }

            try {
                // 🔥 现在返回值是明确的UserInfo类型，无TS错误
                const data = await authApi.getUserInfo();
                setUserInfo(data);
            } catch (err) {
                console.error('获取用户信息失败', err);
                setError('登录已过期，请重新登录');
                setUserInfo(null);
            } finally {
                setLoading(false);
            }
        };

        fetchUserInfo();
    }, []);

    return {
        userInfo,
        loading,
        error,
        isAdmin,
        isProductOp,
        isClient,
        isAnalyst,
        hasWritePermission,
    };
}