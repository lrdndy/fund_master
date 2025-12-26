// app/products/[productId]/page.tsx
// 极简 Server Component：仅解包 params 并传递给客户端组件
import ProductDetailClient from "@/app/products/[productId]/ProductDetailClient";

export default async function ProductDetailPage({
                                                    params: paramsPromise,
                                                }: {
    params: Promise<{ productId: string }>
}) {
    const params = await paramsPromise;
    const productId = params.productId;

    // 直接传递 productId 给客户端组件，不做 API 请求
    return <ProductDetailClient initialProductId={productId} />;
}