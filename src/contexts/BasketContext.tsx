'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { basketApi } from '@/lib/api';
import type { Basket, BasketInput } from '@/lib/types';

const CURRENT_BASKET_IDS_KEY = 'current_basket_ids';
const LEGACY_SINGLE_KEY = 'current_basket_id'; // 旧版只存了一个 id；首次进入兼容读取

interface BasketContextValue {
    baskets: Basket[];
    currentBaskets: Basket[]; // 当前选中的所有篮子（多选）
    currentBasketIds: number[];
    /** 多个篮子产品 id 的并集（按 baskets 顺序去重）；用于页面预填/过滤/置顶 */
    combinedProductIds: number[];
    /** 多个篮子基准 id 的并集 */
    combinedIndexIds: number[];
    loading: boolean;
    setCurrentBasketIds: (ids: number[]) => void;
    toggleBasket: (id: number) => void;
    clearBasketSelection: () => void;
    refresh: () => Promise<void>;
    create: (data: BasketInput) => Promise<Basket>;
    update: (id: number, data: Partial<BasketInput>) => Promise<Basket>;
    remove: (id: number) => Promise<void>;
}

const BasketContext = createContext<BasketContextValue | null>(null);

export function BasketProvider({ children }: { children: ReactNode }) {
    const [baskets, setBaskets] = useState<Basket[]>([]);
    const [currentBasketIds, setCurrentBasketIdsRaw] = useState<number[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const res = await basketApi.getBaskets();
            setBaskets(res.results ?? []);
        } catch (e) {
            console.error('加载篮子失败', e);
            setBaskets([]);
        }
    }, []);

    // 初次：拉篮子 + 恢复 localStorage（兼容旧版单 ID 存储）
    useEffect(() => {
        const init = async () => {
            await refresh();
            const stored = localStorage.getItem(CURRENT_BASKET_IDS_KEY);
            if (stored) {
                try {
                    const arr = JSON.parse(stored) as number[];
                    if (Array.isArray(arr)) setCurrentBasketIdsRaw(arr.filter(n => typeof n === 'number'));
                } catch {}
            } else {
                // 旧版只存了一个 id，迁移读取
                const legacy = localStorage.getItem(LEGACY_SINGLE_KEY);
                if (legacy) {
                    const id = Number(legacy);
                    if (!Number.isNaN(id)) {
                        setCurrentBasketIdsRaw([id]);
                        localStorage.setItem(CURRENT_BASKET_IDS_KEY, JSON.stringify([id]));
                        localStorage.removeItem(LEGACY_SINGLE_KEY);
                    }
                }
            }
            setLoading(false);
        };
        void init();
    }, [refresh]);

    const setCurrentBasketIds = useCallback((ids: number[]) => {
        setCurrentBasketIdsRaw(ids);
        if (ids.length === 0) localStorage.removeItem(CURRENT_BASKET_IDS_KEY);
        else localStorage.setItem(CURRENT_BASKET_IDS_KEY, JSON.stringify(ids));
    }, []);

    const toggleBasket = useCallback((id: number) => {
        setCurrentBasketIdsRaw(prev => {
            const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
            if (next.length === 0) localStorage.removeItem(CURRENT_BASKET_IDS_KEY);
            else localStorage.setItem(CURRENT_BASKET_IDS_KEY, JSON.stringify(next));
            return next;
        });
    }, []);

    const clearBasketSelection = useCallback(() => {
        setCurrentBasketIds([]);
    }, [setCurrentBasketIds]);

    const create = useCallback(async (data: BasketInput) => {
        const b = await basketApi.createBasket(data);
        await refresh();
        return b;
    }, [refresh]);

    const update = useCallback(async (id: number, data: Partial<BasketInput>) => {
        const b = await basketApi.updateBasket(id, data);
        await refresh();
        return b;
    }, [refresh]);

    const remove = useCallback(async (id: number) => {
        await basketApi.deleteBasket(id);
        // 删的篮子如果在当前选中里就移除
        setCurrentBasketIdsRaw(prev => {
            const next = prev.filter(x => x !== id);
            if (next.length === 0) localStorage.removeItem(CURRENT_BASKET_IDS_KEY);
            else localStorage.setItem(CURRENT_BASKET_IDS_KEY, JSON.stringify(next));
            return next;
        });
        await refresh();
    }, [refresh]);

    const currentBaskets = useMemo(
        () => baskets.filter(b => currentBasketIds.includes(b.id)),
        [baskets, currentBasketIds],
    );

    // 合并多个篮子的 ID 集（去重，保持 baskets 顺序）
    const combinedProductIds = useMemo(() => {
        const set = new Set<number>();
        for (const b of currentBaskets) for (const id of b.product_id_list) set.add(id);
        return Array.from(set);
    }, [currentBaskets]);

    const combinedIndexIds = useMemo(() => {
        const set = new Set<number>();
        for (const b of currentBaskets) for (const id of b.index_id_list) set.add(id);
        return Array.from(set);
    }, [currentBaskets]);

    const value = useMemo<BasketContextValue>(() => ({
        baskets, currentBaskets, currentBasketIds, combinedProductIds, combinedIndexIds,
        loading, setCurrentBasketIds, toggleBasket, clearBasketSelection,
        refresh, create, update, remove,
    }), [baskets, currentBaskets, currentBasketIds, combinedProductIds, combinedIndexIds,
        loading, setCurrentBasketIds, toggleBasket, clearBasketSelection,
        refresh, create, update, remove]);

    return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
}

export function useBasket() {
    const ctx = useContext(BasketContext);
    if (!ctx) throw new Error('useBasket must be used within BasketProvider');
    return ctx;
}
