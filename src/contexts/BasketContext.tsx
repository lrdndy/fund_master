'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { basketApi } from '@/lib/api';
import type { Basket, BasketInput } from '@/lib/types';

const CURRENT_BASKET_KEY = 'current_basket_id';

interface BasketContextValue {
    baskets: Basket[];
    currentBasket: Basket | null;
    currentBasketId: number | null;
    loading: boolean;
    setCurrentBasketId: (id: number | null) => void;
    refresh: () => Promise<void>;
    create: (data: BasketInput) => Promise<Basket>;
    update: (id: number, data: Partial<BasketInput>) => Promise<Basket>;
    remove: (id: number) => Promise<void>;
}

const BasketContext = createContext<BasketContextValue | null>(null);

export function BasketProvider({ children }: { children: ReactNode }) {
    const [baskets, setBaskets] = useState<Basket[]>([]);
    const [currentBasketId, setCurrentBasketIdRaw] = useState<number | null>(null);
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

    // 初次加载：拉篮子 + 恢复 localStorage 选中
    useEffect(() => {
        const init = async () => {
            await refresh();
            const stored = localStorage.getItem(CURRENT_BASKET_KEY);
            if (stored) {
                const id = Number(stored);
                if (!Number.isNaN(id)) setCurrentBasketIdRaw(id);
            }
            setLoading(false);
        };
        void init();
    }, [refresh]);

    const setCurrentBasketId = useCallback((id: number | null) => {
        setCurrentBasketIdRaw(id);
        if (id === null) localStorage.removeItem(CURRENT_BASKET_KEY);
        else localStorage.setItem(CURRENT_BASKET_KEY, String(id));
    }, []);

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
        // 删的是当前选中的就清空
        if (currentBasketId === id) setCurrentBasketId(null);
        await refresh();
    }, [currentBasketId, setCurrentBasketId, refresh]);

    const currentBasket = useMemo(
        () => baskets.find(b => b.id === currentBasketId) ?? null,
        [baskets, currentBasketId],
    );

    const value = useMemo<BasketContextValue>(() => ({
        baskets, currentBasket, currentBasketId,
        loading, setCurrentBasketId, refresh, create, update, remove,
    }), [baskets, currentBasket, currentBasketId, loading, setCurrentBasketId, refresh, create, update, remove]);

    return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
}

export function useBasket() {
    const ctx = useContext(BasketContext);
    if (!ctx) throw new Error('useBasket must be used within BasketProvider');
    return ctx;
}
