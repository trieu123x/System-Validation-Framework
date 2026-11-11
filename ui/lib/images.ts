/** Ảnh hàng hoá trên Cloudinary (tải lên bằng scripts/images/upload_images.py). */
const CLOUDINARY_BASE = "https://res.cloudinary.com/dfnlbrk4w/image/upload/";

/**
 * Cách thu ảnh về khung `size` × `size`: cover = cắt cho kín khung, contain = độn viền trắng thành hình vuông,
 * limit = thu nhỏ giữ tỉ lệ, không độn (để CSS tự co ảnh vào khung chữ nhật, không mất diện tích vì viền trắng).
 */
export type ImageFit = "cover" | "contain" | "limit";

const CROP: Record<ImageFit, string> = { cover: "c_fill", contain: "c_pad,b_white", limit: "c_limit" };

/**
 * Nhận URL đầy đủ (API admin) hoặc tham chiếu rút gọn "v.../toboki/TB01.webp" (tin INVENTORY/NOTICE)
 * và trả URL ảnh đã thu về `size` px, định dạng/chất lượng tự chọn. Rỗng → null.
 */
export function imageUrl(ref: string | null | undefined, size = 160, fit: ImageFit = "cover"): string | null {
  if (!ref) return null;
  const t = `${CROP[fit]},w_${size},h_${size},f_auto,q_auto/`;
  if (ref.startsWith(CLOUDINARY_BASE)) return CLOUDINARY_BASE + t + ref.slice(CLOUDINARY_BASE.length);
  if (/^https?:\/\//.test(ref)) return ref;
  return CLOUDINARY_BASE + t + ref;
}
