/** Ảnh hàng hoá trên Cloudinary (tải lên bằng scripts/images/upload_images.py). */
const CLOUDINARY_BASE = "https://res.cloudinary.com/dfnlbrk4w/image/upload/";

/**
 * Nhận URL đầy đủ (API admin) hoặc tham chiếu rút gọn "v.../toboki/TB01.webp" (tin INVENTORY/NOTICE)
 * và trả URL ảnh đã thu về `size` px, định dạng/chất lượng tự chọn. Rỗng → null.
 */
export function imageUrl(ref: string | null | undefined, size = 160): string | null {
  if (!ref) return null;
  const t = `c_fill,w_${size},h_${size},f_auto,q_auto/`;
  if (ref.startsWith(CLOUDINARY_BASE)) return CLOUDINARY_BASE + t + ref.slice(CLOUDINARY_BASE.length);
  if (/^https?:\/\//.test(ref)) return ref;
  return CLOUDINARY_BASE + t + ref;
}
