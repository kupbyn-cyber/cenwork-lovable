#!/usr/bin/env node
/**
 * CEN-PUSH-P01 — sinh cặp khóa VAPID cho Web Push.
 * Chạy: npm run push:vapid
 * Dán kết quả vào .env.runtime của máy chủ. KHÔNG commit khóa private.
 */
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log("VAPID_PUBLIC_KEY=" + keys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + keys.privateKey);
console.log("VAPID_SUBJECT=mailto:admin@cenwork.tudogroup.vn");
console.log("\n# Giữ VAPID_PRIVATE_KEY chỉ trên máy chủ. Không commit, không log.");
