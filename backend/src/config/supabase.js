import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;

const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL is missing");
}

if (!supabaseKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// ------------------------------------------------------------------
// CHẨN ĐOÁN (xoá đoạn này sau khi sửa xong lỗi "User profile not found")
// In ra project đang dùng và vai trò của key, KHÔNG in key.
// Backend phải dùng key service_role / sb_secret_...; anon / publishable là sai.
// ------------------------------------------------------------------
let host = "URL không hợp lệ";

try {
  host = new URL(supabaseUrl).host;
} catch {
  // bỏ qua
}

let keyRole = "không rõ";

try {
  const payload = JSON.parse(
    Buffer.from(supabaseKey.split(".")[1], "base64url").toString(),
  );
  keyRole = payload.role; // "service_role" (đúng) hoặc "anon" (SAI)
} catch {
  if (supabaseKey.startsWith("sb_secret_")) keyRole = "secret (đúng)";
  else if (supabaseKey.startsWith("sb_publishable_"))
    keyRole = "publishable (SAI)";
}

console.log(`Supabase host: ${host} | key role: ${keyRole}`);
