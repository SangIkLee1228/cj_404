/**
 * 빵 상품 카탈로그(BREAD_CATALOG)의 실제 사진을 Supabase Storage("images" 버킷,
 * public bucket)에서 가져오기 위한 read-only 헬퍼.
 *
 * 오브젝트 경로는 `products/{imageFolder}/{imageFile}` 형태이고, product.id
 * (=뚜레쥬르 상품 코드) 기준으로만 매칭한다 — 상품명으로 매칭하지 않는다.
 * getPublicUrl은 네트워크 요청 없이 URL 문자열만 조합하므로 로딩 상태가
 * 필요 없다. 실제 이미지 로드 성공/실패는 ProductCard가 <img onError>로
 * 처리하고, 이 헬퍼는 URL 계산만 담당한다.
 */
import { getPosSupabaseClient } from './client';

const BUCKET = 'images';
const urlCache = new Map();

/** product가 빵(BREAD)이 아니거나 이미지 정보가 없으면 null을 반환한다. */
export function getBreadImageUrl(product) {
  if (!product || product.productType !== 'BREAD') return null;
  if (!product.imageFolder || !product.imageFile) return null;

  const objectPath = `products/${product.imageFolder}/${product.imageFile}`;
  if (urlCache.has(objectPath)) return urlCache.get(objectPath);

  try {
    const { data } = getPosSupabaseClient()
      .storage.from(BUCKET)
      .getPublicUrl(objectPath);
    const url = data?.publicUrl || null;
    urlCache.set(objectPath, url);
    return url;
  } catch {
    // env 미설정 등으로 client 생성 자체가 실패해도 카탈로그 렌더링은 막지 않는다.
    return null;
  }
}
