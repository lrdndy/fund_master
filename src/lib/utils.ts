// src/lib/utils.ts（新增文件）
/**
 * 类型守卫：判断是否为 Axios 错误
 */
export function isAxiosError(err: unknown): err is {
    response?: { data: Record<string, unknown> };
    message: string;
} {
    return (
        typeof err === 'object' &&
        err !== null &&
        'response' in err &&
        typeof (err as { message?: string }).message === 'string'
    );
}

/**
 * 解析 API 错误信息
 */
export function parseApiError(err: unknown): string {
    if (isAxiosError(err)) {
        // 处理后端返回的结构化错误
        const responseData = err.response?.data;
        if (responseData && typeof responseData === 'object') {
            const errors = Object.values(responseData).flat();
            if (errors.length > 0) {
                return errors.join('；');
            }
        }
        return err.message;
    }
    // 处理其他类型错误
    return err instanceof Error ? err.message : '操作失败，请重试';
}